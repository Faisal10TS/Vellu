// supabase/functions/book-appointment/index.ts
//
// Server-side booking creation. Handles ALL the things that used to be done
// client-side and were therefore trivially bypassable:
//
//   - validates services belong to the salon
//   - validates variants/extras belong to their services
//   - validates staff belongs to the salon AND is assigned to the services
//   - recomputes price from services + variants + extras (NEVER trusts client)
//   - validates + applies discount code from the salon's own list
//   - validates date/time is in [now + min_advance_hours, now + max_advance_days]
//   - validates business hours / day_overrides (closed/blocked/time-blocked)
//   - validates slot doesn't conflict with existing appointments (+ break_minutes)
//   - upserts client record
//   - inserts appointment with SERVER-CALCULATED price + duration
//   - generates a cryptographically secure cancellation token
//
// Runs with SERVICE_ROLE so it can bypass RLS. That's the whole point — the
// public tables (appointments, clients, cancellation_tokens) are locked down
// to service_role-only for writes, and this function is the only way in.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = [
  "https://vellu.cc",
  "https://www.vellu.cc",
  "https://vellu.io",
  "https://www.vellu.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function err(status: number, code: string, origin: string | null) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function ok(body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// Cryptographically secure random token
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Parse HH:MM into minutes since midnight
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Simple in-memory rate limiter per IP. Resets when function cold-starts but
// adequate for abuse mitigation combined with Supabase's own request limits.
const RATE_LIMIT: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX = 5;            // max 5 bookings per IP per minute

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT.get(ip);
  if (!entry || entry.resetAt < now) {
    RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return err(405, "method_not_allowed", origin);

  // Rate limit per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) return err(429, "rate_limited", origin);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return err(400, "invalid_json", origin);
  }

  const {
    salon_slug,
    service_ids,
    variant_ids,            // { [service_id]: variant_id }
    extra_ids,              // { [service_id]: [extra_id] }
    staff_ids_per_service,  // { [service_id]: staff_id | null }
    discount_code,
    date,
    time,
    client,                 // { firstName, lastName, email, phone, allergies }
    payment_method,
    location_id,
    policy_agreed,
    lang,
  } = payload || {};

  // ---------- 0. Input shape validation ----------
  if (!salon_slug || typeof salon_slug !== "string") return err(400, "missing_salon_slug", origin);
  if (!Array.isArray(service_ids) || service_ids.length === 0) return err(400, "missing_services", origin);
  if (service_ids.length > 10) return err(400, "too_many_services", origin);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return err(400, "invalid_date", origin);
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) return err(400, "invalid_time", origin);
  if (!client || typeof client !== "object") return err(400, "missing_client", origin);
  const email = String(client.email || "").trim().toLowerCase();
  const firstName = String(client.firstName || "").trim().slice(0, 80);
  const lastName = String(client.lastName || "").trim().slice(0, 80);
  const phone = String(client.phone || "").trim().slice(0, 40) || null;
  const allergies = String(client.allergies || "").trim().slice(0, 500) || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "invalid_email", origin);
  if (!firstName || !lastName) return err(400, "missing_name", origin);

  // ---------- 1. Look up salon ----------
  const { data: salon, error: salonErr } = await supabase
    .from("profiles")
    .select("id, business_name, email, salon_email, owner_name, business_hours, day_overrides, min_advance_hours, max_advance_days, break_minutes, phone_required, discount_codes, booking_policy, account_type")
    .eq("slug", salon_slug)
    .maybeSingle();
  if (salonErr || !salon) return err(404, "salon_not_found", origin);
  if (salon.phone_required && !phone) return err(400, "phone_required", origin);
  // Only require explicit policy agreement when the salon actually has a
  // booking policy to agree to. New salons have none, so the client UI shows
  // no checkbox — enforcing it unconditionally here would reject every booking.
  if (salon.booking_policy && !policy_agreed) return err(400, "policy_not_agreed", origin);

  // ---------- 2. Validate services belong to this salon ----------
  const { data: services, error: svcErr } = await supabase
    .from("services")
    .select("id, name_nl, name_en, price, duration, owner_id")
    .in("id", service_ids)
    .eq("owner_id", salon.id);
  if (svcErr) return err(500, "db_error_services", origin);
  if (!services || services.length !== service_ids.length) return err(400, "invalid_service", origin);

  // Order services by request order for consistent naming
  const servicesOrdered = service_ids.map((sid: string) => services.find((s) => s.id === sid)!);

  // ---------- 3. Validate variants ----------
  const variantIdsFlat: string[] = Object.values(variant_ids || {}).filter(Boolean) as string[];
  let variantsById: Record<string, any> = {};
  if (variantIdsFlat.length > 0) {
    const { data: variants, error: vErr } = await supabase
      .from("service_variants")
      .select("id, service_id, name_nl, name_en, price, duration")
      .in("id", variantIdsFlat);
    if (vErr) return err(500, "db_error_variants", origin);
    if (!variants || variants.length !== variantIdsFlat.length) return err(400, "invalid_variant", origin);
    for (const v of variants) {
      // variant must belong to one of the services in this booking
      if (!service_ids.includes(v.service_id)) return err(400, "variant_service_mismatch", origin);
      variantsById[v.id] = v;
    }
  }

  // ---------- 4. Validate extras ----------
  const extraIdsFlat: string[] = Object.values(extra_ids || {}).flat().filter(Boolean) as string[];
  let extrasById: Record<string, any> = {};
  if (extraIdsFlat.length > 0) {
    const { data: extras, error: eErr } = await supabase
      .from("service_extras")
      .select("id, service_id, name_nl, name_en, price")
      .in("id", extraIdsFlat);
    if (eErr) return err(500, "db_error_extras", origin);
    if (!extras || extras.length !== extraIdsFlat.length) return err(400, "invalid_extra", origin);
    for (const e of extras) {
      if (!service_ids.includes(e.service_id)) return err(400, "extra_service_mismatch", origin);
      extrasById[e.id] = e;
    }
  }

  // ---------- 5. Validate staff (if provided) ----------
  const staffIdsFlat: string[] = Object.values(staff_ids_per_service || {}).filter(Boolean) as string[];
  let staffById: Record<string, any> = {};
  if (staffIdsFlat.length > 0) {
    const { data: staff, error: stErr } = await supabase
      .from("staff_members")
      .select("id, name, email, owner_id")
      .in("id", staffIdsFlat)
      .eq("owner_id", salon.id);
    if (stErr) return err(500, "db_error_staff", origin);
    if (!staff || staff.length !== staffIdsFlat.length) return err(400, "invalid_staff", origin);
    for (const s of staff) staffById[s.id] = s;

    // Validate each staff is assigned to the service they're picked for
    const { data: staffSvc, error: ssErr } = await supabase
      .from("staff_services")
      .select("staff_id, service_id")
      .in("staff_id", staffIdsFlat);
    if (ssErr) return err(500, "db_error_staff_services", origin);
    const assigned = new Set(staffSvc?.map((r) => `${r.staff_id}:${r.service_id}`) || []);
    for (const [sid, stid] of Object.entries(staff_ids_per_service || {})) {
      if (stid && !assigned.has(`${stid}:${sid}`)) {
        // If no staff_services rows exist for that staff, assume they do all services (legacy behavior)
        const anyRows = staffSvc?.some((r) => r.staff_id === stid);
        if (anyRows) return err(400, "staff_not_assigned", origin);
      }
    }
  }

  // ---------- 6. Recalculate price + duration server-side ----------
  let totalPrice = 0;
  let totalDuration = 0;
  const serviceNameParts: string[] = [];

  for (const svc of servicesOrdered) {
    const variantId = variant_ids?.[svc.id];
    const svcExtras = (extra_ids?.[svc.id] || []).map((eid: string) => extrasById[eid]).filter(Boolean);
    const variant = variantId ? variantsById[variantId] : null;
    const price = variant ? parseFloat(variant.price) : parseFloat(svc.price);
    const duration = variant ? parseInt(variant.duration) : parseInt(svc.duration);
    const extrasPrice = svcExtras.reduce((s: number, e: any) => s + parseFloat(e.price || 0), 0);
    totalPrice += price + extrasPrice;
    totalDuration += duration;

    // Build display name
    let label = lang === "nl" ? svc.name_nl : (svc.name_en || svc.name_nl);
    if (variant) label += " — " + (lang === "nl" ? variant.name_nl : (variant.name_en || variant.name_nl));
    const staffId = staff_ids_per_service?.[svc.id];
    if (staffId && staffById[staffId]) label += ` (${staffById[staffId].name})`;
    if (svcExtras.length > 0) {
      label += " + " + svcExtras.map((e: any) => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ");
    }
    serviceNameParts.push(label);
  }

  // ---------- 7. Apply discount (if any) ----------
  let appliedDiscount: any = null;
  if (discount_code) {
    const code = String(discount_code).trim().toUpperCase();
    const salonCodes = Array.isArray(salon.discount_codes) ? salon.discount_codes : [];
    const match = salonCodes.find((c: any) => c.code?.toUpperCase() === code && c.active);
    if (!match) return err(400, "invalid_discount", origin);
    const amt = parseFloat(match.amount) || 0;
    if (match.type === "percent") {
      totalPrice = Math.max(0, totalPrice * (1 - amt / 100));
    } else {
      totalPrice = Math.max(0, totalPrice - amt);
    }
    appliedDiscount = match;
  }

  // Round to 2 decimals
  totalPrice = Math.round(totalPrice * 100) / 100;

  // ---------- 8. Validate date/time is in future + within advance window ----------
  const now = new Date();
  const apptStart = new Date(`${date}T${time}:00`);
  if (isNaN(apptStart.getTime())) return err(400, "invalid_datetime", origin);
  const minAdvanceMs = (salon.min_advance_hours || 0) * 60 * 60 * 1000;
  const maxAdvanceMs = (salon.max_advance_days || 60) * 24 * 60 * 60 * 1000;
  if (apptStart.getTime() < now.getTime() + minAdvanceMs) return err(400, "too_soon", origin);
  if (apptStart.getTime() > now.getTime() + maxAdvanceMs) return err(400, "too_far", origin);

  // ---------- 9. Validate business hours + day overrides ----------
  const dayOfWeek = apptStart.getDay();
  const override = salon.day_overrides?.[date];
  if (override?.type === "blocked") {
    if (override.block_time_start && override.block_time_end) {
      // time-slot block
      const blockStart = toMinutes(override.block_time_start);
      const blockEnd = toMinutes(override.block_time_end);
      const apptMinutes = toMinutes(time);
      const apptEnd = apptMinutes + totalDuration;
      if (apptMinutes < blockEnd && apptEnd > blockStart) return err(400, "slot_blocked", origin);
    } else {
      return err(400, "day_blocked", origin);
    }
  }

  let dayHours = override?.type === "exception"
    ? { open: override.open, close: override.close, closed: false }
    : salon.business_hours?.[dayOfWeek];

  if (!dayHours || dayHours.closed) return err(400, "closed", origin);
  const openMin = toMinutes(dayHours.open);
  const closeMin = toMinutes(dayHours.close);
  const apptStartMin = toMinutes(time);
  const apptEndMin = apptStartMin + totalDuration;
  if (apptStartMin < openMin || apptEndMin > closeMin) return err(400, "outside_hours", origin);

  // ---------- 10. Slot conflict check ----------
  const breakMin = parseInt(salon.break_minutes || 0);
  const { data: existingAppts, error: exErr } = await supabase
    .from("appointments")
    .select("id, time, service_duration, staff_id, status")
    .eq("owner_id", salon.id)
    .eq("date", date)
    .not("status", "in", '("cancelled","no_show")');
  if (exErr) return err(500, "db_error_conflict_check", origin);

  const primaryStaffId = Object.values(staff_ids_per_service || {}).find(Boolean) || null;
  for (const existing of existingAppts || []) {
    // Only conflict if same staff (or no staff assigned = global resource)
    const sameStaff = (existing.staff_id || null) === (primaryStaffId || null);
    if (!sameStaff && existing.staff_id && primaryStaffId) continue;
    const exStart = toMinutes(existing.time);
    const exEnd = exStart + parseInt(existing.service_duration || 60) + breakMin;
    const newStart = apptStartMin;
    const newEnd = apptEndMin + breakMin;
    if (newStart < exEnd && newEnd > exStart) return err(409, "slot_conflict", origin);
  }

  // ---------- 11. Upsert client ----------
  let clientId: string | null = null;
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingClient) {
    clientId = existingClient.id;
    await supabase.from("clients").update({
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      allergies: allergies,
      last_visit: new Date().toISOString(),
    }).eq("id", clientId);
  } else {
    const { data: newClient, error: nErr } = await supabase.from("clients").insert({
      email: email,
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      allergies: allergies,
      last_visit: new Date().toISOString(),
    }).select("id").single();
    if (nErr || !newClient) return err(500, "client_create_failed", origin);
    clientId = newClient.id;
  }

  // ---------- 12. Build combined service name ----------
  const combinedName = serviceNameParts.join(" · ") + (appliedDiscount ? ` [${appliedDiscount.code}]` : "");

  // Primary staff id for the staff_id column (first service's staff)
  const primaryStaffIdCol = staff_ids_per_service?.[servicesOrdered[0].id] || null;
  const allStaffNames = servicesOrdered
    .map((s: any) => {
      const stid = staff_ids_per_service?.[s.id];
      return stid ? staffById[stid]?.name : null;
    })
    .filter(Boolean);

  // ---------- 13. Insert appointment ----------
  const { data: appt, error: aErr } = await supabase.from("appointments").insert({
    owner_id: salon.id,
    service_id: servicesOrdered[0].id,
    client_id: clientId,
    service_name: combinedName,
    service_price: totalPrice,
    service_duration: totalDuration,
    date,
    time,
    client_name: `${firstName} ${lastName}`,
    client_email: email,
    client_phone: phone,
    payment_method: payment_method === "online" ? "online" : "on-arrival",
    status: "confirmed",
    invoice_sent: false,
    staff_id: primaryStaffIdCol,
    staff_name: allStaffNames.length > 0 ? allStaffNames.join(", ") : null,
    client_allergies: allergies,
    location_id: location_id || null,
  }).select("id").single();

  if (aErr || !appt) return err(500, "appointment_create_failed", origin);

  // ---------- 14. Create cancellation token ----------
  const cancelToken = generateToken();
  const expiresAt = new Date(apptStart.getTime() - 24 * 60 * 60 * 1000);
  await supabase.from("cancellation_tokens").insert({
    appointment_id: appt.id,
    token: cancelToken,
    expires_at: expiresAt.toISOString(),
  });

  return ok({
    success: true,
    appointment_id: appt.id,
    cancel_token: cancelToken,
    service_name: combinedName,
    service_price: totalPrice,
    service_duration: totalDuration,
    owner_email: salon.salon_email || salon.email,
    salon_name: salon.business_name,
    staff_emails: Object.values(staffById).map((s: any) => s.email).filter(Boolean),
  }, origin);
});
