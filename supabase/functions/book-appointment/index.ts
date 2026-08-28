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

// ── Salontijd → UTC ─────────────────────────────────────────────────────────
// Letterlijk dezelfde helpers als in cancel-appointment/send-reminders. Datum
// en tijd van een afspraak staan in de tijdzone van de SALON; wie ze zonder
// omrekening in een Date stopt, leest ze als UTC. Op Bonaire (UTC-4) schuift de
// afspraak daardoor vier uur naar voren en werd elk zelfde-dag-slot binnen vier
// uur geweigerd met too_soon, ook bij min_advance_hours = 0. Via Intl en niet
// met een vaste offset-tabel, want Amsterdam wisselt tussen +1 en +2 en die
// grens ligt elk jaar ergens anders.
const TZ_BY_COUNTRY: Record<string, string> = {
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  GB: "Europe/London",
  AW: "America/Curacao",
  CW: "America/Curacao",
  BQ: "America/Curacao",
  SX: "America/Curacao",
};
const tzFor = (code?: string | null) => TZ_BY_COUNTRY[code || ""] || "Europe/Amsterdam";

function tzOffsetMs(at: Date, tz: string) {
  try {
    const p: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at)) p[part.type] = part.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - at.getTime();
  } catch { return 0; } // onbekende zone: liever de oude UTC-aanname dan crashen
}

function localToUtc(dateStr: string, timeStr: string, tz: string) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  if (isNaN(naive.getTime())) return null;
  return new Date(naive.getTime() - tzOffsetMs(naive, tz));
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
    variant_qtys,           // { [variant_id]: quantity } — per_unit variants only
    extra_ids,              // { [service_id]: [extra_id] }
    extra_qtys,             // { [extra_id]: quantity } — per_unit extras only
    staff_ids_per_service,  // { [service_id]: staff_id | null }
    product_ids,            // { [product_id]: quantity } — retail products (Professional)
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
  // Botval: het veld `website` staat op de boekingspagina buiten beeld en heeft
  // autocomplete uit, dus een echte klant kan het niet invullen. Formulierbots
  // vullen elk veld dat ze vinden. De client stuurde het al mee, maar de server
  // keek er nooit naar — daardoor deed de val niets. Bewust een generieke fout
  // zonder uitleg, zodat een bot niet leert welk veld hem verraadt.
  if (String(client.website || "").trim()) return err(400, "invalid_request", origin);

  // ---------- 1. Look up salon ----------
  const { data: salon, error: salonErr } = await supabase
    .from("profiles")
    .select("id, business_name, email, salon_email, owner_name, business_hours, day_overrides, min_advance_hours, max_advance_days, break_minutes, phone_required, discount_codes, booking_policy, account_type, accent_color, logo_url, address, kvk_number, btw_id, btw_rate, iban, country_code, plan, staff_view_revenue, staff_view_client_contact, auto_block_no_show_threshold, cancel_deadline_hours")
    .eq("slug", salon_slug)
    .maybeSingle();
  if (salonErr || !salon) return err(404, "salon_not_found", origin);
  if (salon.phone_required && !phone) return err(400, "phone_required", origin);
  // Only require explicit policy agreement when the salon actually has a
  // booking policy to agree to. New salons have none, so the client UI shows
  // no checkbox — enforcing it unconditionally here would reject every booking.
  if (salon.booking_policy && !policy_agreed) return err(400, "policy_not_agreed", origin);

  // ---------- 1b. No-show blokkade ----------
  // Instellingen belooft: "Klanten die bij jouw salon dit aantal no-shows hebben
  // worden automatisch geblokkeerd." Die belofte werd nergens waargemaakt — de
  // drempel en de client_no_shows-tellers bestonden alleen in het dashboard, dus
  // een geblokkeerde klant boekte gewoon opnieuw. We toetsen het hier, vóór alle
  // zware validatie, zodat een geweigerde boeking ook geen slot bezet houdt.
  // Drempel 0 (de default) betekent: functie uit, dan kijken we nergens naar —
  // ook niet naar oude blocked-rijen, want de eigenaar heeft de blokkade juist
  // uitgezet.
  const noShowThreshold = parseInt(salon.auto_block_no_show_threshold) || 0;
  if (noShowThreshold > 0) {
    // De teller staat per salon op (owner_id, client_email); record_no_show
    // schrijft het adres in kleine letters weg en `email` hierboven is al
    // lowercase. We matchen tóch hoofdletterongevoelig voor oudere rijen, maar
    // vergelijken daarna alsnog exact in JS: ilike ziet een '_' in een adres als
    // jokerteken, en dat mag nooit iemand anders zijn no-shows aanrekenen.
    const { data: noShowRows, error: nsErr } = await supabase
      .from("client_no_shows")
      .select("client_email, blocked")
      .eq("owner_id", salon.id)
      .ilike("client_email", email);
    if (nsErr) return err(500, "db_error_no_shows", origin);
    const row = (noShowRows || []).find(
      (r: any) => String(r.client_email || "").trim().toLowerCase() === email,
    );
    // We leunen UITSLUITEND op blocked=true — het oordeel dat record_no_show zelf
    // velde toen de eigenaar de no-show aanvinkte (die RPC zet blocked + blocked_at
    // zodra no_show_count de drempel haalt). Zelf hier op de teller blokkeren lijkt
    // logisch, maar maakt de klant onzichtbaar: de lijst "Geblokkeerd" in
    // Instellingen toont alleen rijen met blocked=true, dus bij een rij met
    // blocked=false zou de eigenaar wél de boeking geweigerd zien worden zonder dat
    // er iemand geblokkeerd in beeld staat — en dus zonder Deblokkeer-knop. Concreet:
    // TTNB Den Haag heeft drempel 3 en een klant op 2 no-shows (blocked=false);
    // verlaagt de eigenaar de drempel naar 2, dan zat die klant klem en was de enige
    // uitweg de drempel weer omhoog zetten. Verlaagt de eigenaar de drempel, dan
    // blokkeert de eerstvolgende geregistreerde no-show die klant alsnog, en dan
    // staat hij ook netjes in de lijst.
    if (row?.blocked) return err(403, "client_blocked", origin);
  }

  // ---------- 2. Validate services belong to this salon ----------
  // visible=true is hier geen weergave-detail maar de echte grens: de
  // boekingspagina toont een verborgen dienst ("on hold") niet, maar iemand kan
  // een service_id rechtstreeks POSTen. Zo'n boeking hoort te stranden, anders
  // krijgt de salon alsnog afspraken voor iets wat ze niet aanbiedt. Het filter
  // staat in de query, dus een verborgen dienst valt vanzelf in de
  // lengte-controle hieronder en geeft "invalid_service".
  const { data: services, error: svcErr } = await supabase
    .from("services")
    .select("id, name_nl, name_en, name_es, price, duration, owner_id")
    .in("id", service_ids)
    .eq("owner_id", salon.id)
    .eq("visible", true);
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
      .select("id, service_id, name_nl, name_en, name_es, price, duration, per_unit, max_quantity")
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
      .select("id, service_id, name_nl, name_en, name_es, price, duration, per_unit, max_quantity")
      .in("id", extraIdsFlat);
    if (eErr) return err(500, "db_error_extras", origin);
    if (!extras || extras.length !== extraIdsFlat.length) return err(400, "invalid_extra", origin);
    for (const e of extras) {
      if (!service_ids.includes(e.service_id)) return err(400, "extra_service_mismatch", origin);
      extrasById[e.id] = e;
    }
  }

  // ---------- 4b. Validate retail products (Professional plan) ----------
  const productSel: Record<string, number> = {};
  let productsById: Record<string, any> = {};
  const prodIds = Object.keys(product_ids || {}).filter((k) => (parseInt((product_ids as Record<string, unknown>)[k] as string) || 0) > 0);
  if (prodIds.length > 0) {
    // Products are a Professional feature; a Starter salon's page never
    // offers them, so receiving them here means a forged request.
    if (salon.plan !== "professional") return err(400, "products_not_available", origin);
    if (prodIds.length > 20) return err(400, "too_many_products", origin);
    // visible_online=false betekent "alleen aan de kassa verkopen": de publieke
    // boekingspagina toont zo'n product niet, dus als het hier toch binnenkomt
    // is de request geknutseld — zelfde weigering als een onbekend/inactief
    // product. De kassa raakt dit pad niet (die boekt via directe inserts in
    // het dashboard, niet via deze functie) en blijft dus gewoon verkopen.
    const { data: prods, error: pErr } = await supabase
      .from("products")
      .select("id, owner_id, name_nl, name_en, name_es, price, active, stock")
      .in("id", prodIds)
      .eq("owner_id", salon.id)
      .eq("active", true)
      .eq("visible_online", true);
    if (pErr) return err(500, "db_error_products", origin);
    if (!prods || prods.length !== prodIds.length) return err(400, "invalid_product", origin);
    for (const p of prods) productsById[p.id] = p;
    for (const pid of prodIds) productSel[pid] = Math.max(1, Math.min(20, parseInt((product_ids as Record<string, unknown>)[pid] as string) || 1));
  }

  // ---------- 5. Validate staff (if provided) ----------
  // Dedupe: the same stylist can legitimately be picked for multiple services
  // in ONE booking (e.g. Lady does both nails and toes). Without dedupe the
  // length check below rejects the booking because a `SELECT ... IN (id, id)`
  // returns one row, not two.
  const staffIdsFlat: string[] = Array.from(new Set(
    Object.values(staff_ids_per_service || {}).filter(Boolean) as string[]
  ));

  // Team accounts with 2+ eligible staff require an explicit stylist per
  // service — otherwise the booking floats without attribution and never
  // shows up in a per-staff agenda filter. The client UI enforces this too;
  // this is the trust-nothing server-side backstop.
  if (salon.account_type === "team") {
    const { count: staffCount } = await supabase
      .from("staff_members")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", salon.id)
      .eq("active", true);
    if ((staffCount || 0) > 1) {
      for (const sid of service_ids) {
        if (!staff_ids_per_service?.[sid]) return err(400, "staff_required", origin);
      }
    }
  }

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

    // Extra's kunnen per medewerker uitstaan (staff_extra_exclusions:
    // rij = "voert deze extra NIET uit"). De publieke pagina filtert dit al,
    // maar dit is de trust-nothing-grens: een geknutseld verzoek dat een
    // uitgesloten combinatie boekt, wordt hier geweigerd.
    if (extraIdsFlat.length > 0) {
      const { data: exclRows, error: exclErr } = await supabase
        .from("staff_extra_exclusions")
        .select("staff_id, extra_id")
        .in("staff_id", staffIdsFlat);
      if (exclErr) return err(500, "db_error_staff_extras", origin);
      const excluded = new Set((exclRows || []).map((r) => `${r.staff_id}:${r.extra_id}`));
      if (excluded.size > 0) {
        for (const [sid, stid] of Object.entries(staff_ids_per_service || {})) {
          if (!stid) continue;
          for (const eid of ((extra_ids as Record<string, string[]>)?.[sid] || [])) {
            if (excluded.has(`${stid}:${eid}`)) return err(400, "staff_extra_excluded", origin);
          }
        }
      }
    }
  }

  // ---------- 5c. Per-medewerker prijzen ----------
  // Een salon kan per medewerker een afwijkende prijs zetten voor dezelfde
  // dienst (staff_service_prices; variant_id NULL = prijs op de dienst).
  // Geen rij = standaardprijs. "Geen voorkeur" (geen medewerker) rekent
  // altijd de standaardprijs.
  const priceOverrides: Record<string, number> = {};
  if (staffIdsFlat.length > 0) {
    const { data: spRows, error: spErr } = await supabase
      .from("staff_service_prices")
      .select("staff_id, service_id, variant_id, price")
      .in("staff_id", staffIdsFlat)
      .in("service_id", service_ids);
    if (spErr) return err(500, "db_error_staff_prices", origin);
    for (const r of spRows || []) {
      const p = parseFloat(r.price);
      if (Number.isFinite(p)) priceOverrides[`${r.staff_id}:${r.service_id}:${r.variant_id || ""}`] = p;
    }
  }

  // ---------- 6. Recalculate price + duration server-side ----------
  let totalPrice = 0;
  let totalDuration = 0;
  const serviceNameParts: string[] = [];
  // Per-service breakdown so a staff-filtered agenda can render each
  // stylist's own sub-slot at the correct start time inside a combined
  // booking. Duration + offset_min mean a downstream reader doesn't need
  // to reconstruct the math from the service list.
  const serviceBreakdown: any[] = [];
  let runningOffset = 0;

  // Per-unit extras (e.g. "broken nail x3"): clamp the client-sent quantity to
  // [1, max_quantity]. Non-per-unit extras are always quantity 1.
  const extraQty = (e: any) => e.per_unit ? Math.max(1, Math.min(parseInt(extra_qtys?.[e.id]) || 1, e.max_quantity || 10)) : 1;
  const variantQty = (v: any) => v && v.per_unit ? Math.max(1, Math.min(parseInt(variant_qtys?.[v.id]) || 1, v.max_quantity || 10)) : 1;
  // Language-aware name pick for agenda/email labels: Spanish → name_es
  // (fall back to EN then NL); English → name_en (fall back NL); else NL.
  const nmOf = (o: any) => lang === "es" ? (o.name_es || o.name_en || o.name_nl) : (lang === "nl" ? o.name_nl : (o.name_en || o.name_nl));

  for (const svc of servicesOrdered) {
    const variantId = variant_ids?.[svc.id];
    const svcExtras = (extra_ids?.[svc.id] || []).map((eid: string) => extrasById[eid]).filter(Boolean);
    const variant = variantId ? variantsById[variantId] : null;
    const staffId = staff_ids_per_service?.[svc.id];
    // Prijs: eerst de eventuele per-medewerker-prijs (variant-specifiek gaat
    // vóór dienst-breed), anders de standaard variant-/dienstprijs.
    const unitPrice = variant
      ? (staffId && priceOverrides[`${staffId}:${svc.id}:${variant.id}`] !== undefined
          ? priceOverrides[`${staffId}:${svc.id}:${variant.id}`]
          : parseFloat(variant.price))
      : (staffId && priceOverrides[`${staffId}:${svc.id}:`] !== undefined
          ? priceOverrides[`${staffId}:${svc.id}:`]
          : parseFloat(svc.price));
    const price = variant ? unitPrice * variantQty(variant) : unitPrice;
    // Extras can carry their own time (removal / intricate design = +30 min);
    // per-unit extras count × quantity. No duration set = 0, old behaviour.
    const extrasDur = svcExtras.reduce((s: number, e: any) => s + (parseInt(e.duration) || 0) * extraQty(e), 0);
    const duration = (variant ? parseInt(variant.duration) : parseInt(svc.duration)) + extrasDur;
    const extrasPrice = svcExtras.reduce((s: number, e: any) => s + parseFloat(e.price || 0) * extraQty(e), 0);
    totalPrice += price + extrasPrice;
    totalDuration += duration;

    // Build display name
    let label = nmOf(svc);
    if (variant) label += " — " + nmOf(variant) + (variant.per_unit && variantQty(variant) > 1 ? ` ×${variantQty(variant)}` : "");
    if (staffId && staffById[staffId]) label += ` (${staffById[staffId].name})`;
    if (svcExtras.length > 0) {
      label += " + " + svcExtras.map((e: any) => {
        const nm = nmOf(e);
        const q = extraQty(e);
        return q > 1 ? `${nm} ×${q}` : nm;
      }).join(", ");
    }
    serviceNameParts.push(label);

    // Compact label for the agenda card (service name + variant only,
    // without the parenthetical staff name — the agenda already renders
    // that separately via the filter pill).
    let shortLabel = nmOf(svc);
    if (variant) shortLabel += " — " + nmOf(variant) + (variant.per_unit && variantQty(variant) > 1 ? ` ×${variantQty(variant)}` : "");
    serviceBreakdown.push({
      service_id: svc.id,
      staff_id: staffId || null,
      duration,
      offset_min: runningOffset,
      label: shortLabel,
    });
    runningOffset += duration;
  }

  // Retail products ride along with the booking: price added before the
  // discount (like everything else), names appended to the combined label,
  // and a structured record kept for invoices/analytics. No duration.
  const orderedProducts = Object.entries(productSel).map(([pid, qty]) => {
    const p = productsById[pid];
    return { id: pid, name: nmOf(p), price: parseFloat(p.price) || 0, qty };
  });
  if (orderedProducts.length > 0) {
    totalPrice += orderedProducts.reduce((s, it) => s + it.price * it.qty, 0);
    serviceNameParts.push(...orderedProducts.map((it) => it.qty > 1 ? `${it.name} ×${it.qty}` : it.name));
  }

  // ---------- 7. Apply discount (if any) ----------
  // Twee bronnen, in deze volgorde:
  //   a. profiles.discount_codes — de codes die de eigenaar zelf aanmaakt. Die
  //      gelden voor iedereen en staan (alleen zij) ook in de publieke payload.
  //   b. birthday_discount_codes — de persoonlijke verjaardagscodes. Die staan
  //      bewust NIET in profiles: daar werden ze via de view public_salons aan
  //      iedere anonieme bezoeker uitgeleverd, waardoor een code als
  //      BDAY-ESTHER-15 door iedereen inwisselbaar was én het e-mailadres van
  //      die klant verklapte. Deze functie draait met de service_role en leest
  //      de tabel dus gewoon.
  // Draagt de gevonden code een e-mailadres, dan is hij persoonlijk en moet het
  // adres van de boeker exact matchen. Codes van de eigenaar hebben dat veld niet
  // en blijven voor iedereen geldig.
  let appliedDiscount: any = null;
  if (discount_code) {
    const code = String(discount_code).trim().toUpperCase();
    const salonCodes = Array.isArray(salon.discount_codes) ? salon.discount_codes : [];
    let match = salonCodes.find((c: any) => c.code?.toUpperCase() === code && c.active);
    if (!match) {
      // Geldigheid met een dag speling: de mail belooft "geldig deze maand" en
      // onze salons lopen tot 4 uur achter op UTC. Zonder die marge krijgt een
      // klant op Bonaire op de 31e om 20:01 lokale tijd te horen dat haar
      // verjaardagscode verlopen is, terwijl het daar nog gewoon die maand is.
      // De opruimpas in send-birthday-emails gooit de rij daarna alsnog weg.
      const graceFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: bday, error: bdErr } = await supabase
        .from("birthday_discount_codes")
        .select("code, client_email, discount_pct, expires_on, used_at")
        .eq("owner_id", salon.id)
        .eq("code", code)
        .gte("expires_on", graceFrom)
        .maybeSingle();
      if (bdErr) return err(500, "db_error_discount", origin);
      // Eenmalig cadeau: is de code al bij een eerdere boeking gestempeld
      // (used_at gezet na de geslaagde insert, verderop), dan weigeren we hem
      // hier expliciet — een aparte foutcode zodat de klant "al gebruikt" te
      // zien krijgt in plaats van het misleidende "ongeldige code".
      if (bday?.used_at) return err(403, "discount_already_used", origin);
      if (bday) {
        match = {
          code: bday.code,
          amount: bday.discount_pct,
          type: "percent",
          active: true,
          source: "birthday",
          client_email: bday.client_email,
        };
      }
    }
    if (!match) return err(400, "invalid_discount", origin);
    // Persoonlijke code? Dan alleen voor de eigenaar van dat adres. `email` is
    // hierboven al getrimd en lowercase gemaakt; de opgeslagen kant idem, maar we
    // normaliseren nog een keer voor oudere/handmatig ingevoerde waarden.
    const boundTo = String(match.client_email || "").trim().toLowerCase();
    if (boundTo && boundTo !== email) return err(403, "discount_not_yours", origin);
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
  // `date`/`time` zijn SALONTIJD, geen UTC. Werd het hier als UTC gelezen, dan
  // lag de afspraak voor een Bonaire-salon (UTC-4) vier uur te vroeg en sneuvelde
  // elk zelfde-dag-slot binnen vier uur op too_soon, zelfs met min_advance_hours
  // op 0. Omrekenen via de tijdzone van het land van de salon lost dat op en
  // houdt tegelijk rekening met de zomertijdwissel van de NL/BE-salons.
  const salonTz = tzFor(salon.country_code);
  const apptStart = localToUtc(date, time, salonTz);
  if (!apptStart) return err(400, "invalid_datetime", origin);
  const minAdvanceMs = (salon.min_advance_hours || 0) * 60 * 60 * 1000;
  const maxAdvanceMs = (salon.max_advance_days || 60) * 24 * 60 * 60 * 1000;
  if (apptStart.getTime() < now.getTime() + minAdvanceMs) return err(400, "too_soon", origin);
  if (apptStart.getTime() > now.getTime() + maxAdvanceMs) return err(400, "too_far", origin);

  // ---------- 9. Validate business hours + day overrides ----------
  // De weekdag hoort bij de KALENDERDATUM die de klant koos, niet bij het
  // omgerekende UTC-moment: een Bonairiaanse zondagavond-afspraak van 22:00 is
  // in UTC al maandag, en dan zouden we de verkeerde openingstijden pakken.
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const override = salon.day_overrides?.[date];

  // Exception days (extra availability), merged from BOTH sources:
  // - staff_day_overrides rows with kind='exception' (the current model —
  //   many per date, block_time_start/end double as open/close, staff_id
  //   NULL = salon-wide)
  // - the legacy profiles.day_overrides JSON entry (one per date)
  const { data: excRows, error: excErr } = await supabase
    .from("staff_day_overrides")
    .select("staff_id, block_time_start, block_time_end")
    .eq("owner_id", salon.id)
    .eq("date", date)
    .eq("kind", "exception");
  if (excErr) return err(500, "db_error_exceptions", origin);
  const exceptions: { staff_id: string | null; open: string; close: string }[] =
    (excRows || [])
      .filter((r: any) => r.block_time_start && r.block_time_end)
      .map((r: any) => ({ staff_id: r.staff_id || null, open: r.block_time_start, close: r.block_time_end }));
  if (override?.type === "exception" && override.open && override.close) {
    exceptions.push({ staff_id: override.staff_id || null, open: override.open, close: override.close });
  }
  const exceptionsForStaff = (sid: string) => exceptions.filter(e => !e.staff_id || e.staff_id === sid);
  if (override?.type === "blocked") {
    // Een blokkade met staff_id geldt alleen voor DIE medewerker (de "Voor
    // wie?"-keuze in Instellingen). De boekingspagina biedt collega's op zo'n
    // dag gewoon aan; zonder deze check weigerde de server die boekingen
    // alsnog salon-breed. Geen medewerker gekozen ("geen voorkeur") telt als
    // niet-geraakt: de pagina toont het slot dan alleen als een collega vrij
    // is, precies zoals de uitzonderingen-tak hierboven dat al deed.
    const blokkadeRaaktDezeBoeking = !override.staff_id || staffIdsFlat.includes(override.staff_id);
    if (blokkadeRaaktDezeBoeking) {
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
  }

  // Staff-scoped exceptions only widen hours for that specific stylist —
  // the salon-wide bounds stay closed unless every service in this booking
  // is going to that same staff. Otherwise use the weekday's business_hours.
  const applyExceptionSalonWide = override?.type === "exception" && (
    !override.staff_id ||
    Object.values(staff_ids_per_service || {}).filter(Boolean).every((s: any) => s === override.staff_id)
  );
  let dayHours = applyExceptionSalonWide
    ? { open: override.open, close: override.close, closed: false }
    : salon.business_hours?.[dayOfWeek];

  // Team accounts: the "salon" is open whenever at least ONE stylist is open,
  // and the effective window is the union of every open stylist's hours for
  // that day. Mirrors ClientApp.getEffectiveHours so client and server agree
  // — otherwise a client sees Friday as bookable (because Lady works) while
  // the server rejects it based on the salon-level Friday=closed flag.
  if (!applyExceptionSalonWide && salon.account_type === "team") {
    const { data: allStaff } = await supabase
      .from("staff_members")
      .select("id, working_hours")
      .eq("owner_id", salon.id)
      .eq("active", true);
    const openWindows = (allStaff || [])
      .map((s: any) => s.working_hours?.[dayOfWeek])
      .filter((d: any) => d && !d.closed);
    if (openWindows.length > 0) {
      const fb = salon.business_hours?.[dayOfWeek] || {};
      const fbOpen = fb.open || "09:00";
      const fbClose = fb.close || "17:30";
      let open = "23:59", close = "00:00";
      for (const w of openWindows) {
        const o = w.open || fbOpen;
        const cl = w.close || fbClose;
        if (o < open) open = o;
        if (cl > close) close = cl;
      }
      dayHours = { closed: false, open, close };
    }
  }

  // Any exception window widens the salon-level day bounds — the per-staff
  // fit is enforced right below, so the outer bounds only need to contain
  // the union of everything that's open today.
  if (exceptions.length > 0) {
    let open = dayHours && !dayHours.closed ? dayHours.open : "23:59";
    let close = dayHours && !dayHours.closed ? dayHours.close : "00:00";
    for (const e of exceptions) {
      if (e.open < open) open = e.open;
      if (e.close > close) close = e.close;
    }
    dayHours = { closed: false, open, close };
  }

  if (!dayHours || dayHours.closed) return err(400, "closed", origin);
  const openMin = toMinutes(dayHours.open);
  const closeMin = toMinutes(dayHours.close);
  const apptStartMin = toMinutes(time);
  const apptEndMin = apptStartMin + totalDuration;
  if (apptStartMin < openMin || apptEndMin > closeMin) return err(400, "outside_hours", origin);
  // Midday break (middagpauze): optional break_start/break_end on the weekday
  // split the day into a morning and an afternoon segment. The WHOLE
  // appointment must fit inside one segment — same rule as the closing time,
  // applied per segment. Days without the keys behave exactly as before.
  // Note: exception windows and team-union hours never carry break keys, so
  // this only fires on the salon's own business_hours.
  if (dayHours.break_start && dayHours.break_end) {
    const breakStartMin = toMinutes(dayHours.break_start);
    const breakEndMin = toMinutes(dayHours.break_end);
    const fitsMorning = apptEndMin <= breakStartMin;
    const fitsAfternoon = apptStartMin >= breakEndMin;
    if (!fitsMorning && !fitsAfternoon) return err(400, "outside_hours", origin);
  }

  // Also verify each picked stylist is personally open at the booked time. A
  // team salon can be "open" because one staff works while a DIFFERENT staff
  // (the one this booking picked) is off that weekday — booking her should
  // still fail. Exception windows REPLACE the weekly schedule for that date:
  // when a stylist has one or more (own or salon-wide), the appointment must
  // fit inside one of them. Same whole-appointment-window strictness as the
  // weekly check below.
  if (salon.account_type === "team" && staffIdsFlat.length > 0) {
    const { data: pickedStaff } = await supabase
      .from("staff_members")
      .select("id, name, working_hours")
      .in("id", staffIdsFlat);
    for (const s of pickedStaff || []) {
      const exc = exceptionsForStaff(s.id);
      if (exc.length > 0) {
        const fits = exc.some(e => apptStartMin >= toMinutes(e.open) && apptEndMin <= toMinutes(e.close));
        if (!fits) return err(400, "staff_not_available", origin);
        continue;
      }
      const day = s.working_hours?.[dayOfWeek];
      if (!day || day.closed) return err(400, "staff_not_available", origin);
      const sOpen = toMinutes(day.open || dayHours.open);
      const sClose = toMinutes(day.close || dayHours.close);
      if (apptStartMin < sOpen || apptEndMin > sClose) return err(400, "staff_not_available", origin);
    }
  }

  // ---------- 9b. Validate staff-specific blocks ----------
  // A stylist can mark themselves off (whole day) or block a time window even
  // when the salon is open. If any staff involved in this booking has a
  // matching block on this date, reject the booking.
  // Terugkerende blokkades ("elke zondag"): weekday-rijen gelden elke week op
  // die dag vanaf hun ankerdatum. De query haalt beide vormen op; de
  // ankercheck (date >= b.date) gebeurt hieronder in JS.
  const blokGeldtVandaag = (b: any) =>
    b.weekday == null ? b.date === date : (b.weekday === dayOfWeek && date >= b.date);
  if (staffIdsFlat.length > 0) {
    const { data: staffBlocksRaw, error: sbErr } = await supabase
      .from("staff_day_overrides")
      .select("staff_id, service_id, weekday, date, block_time_start, block_time_end")
      .in("staff_id", staffIdsFlat)
      .or(`date.eq.${date},weekday.eq.${dayOfWeek}`)
      // kind='exception' rows are EXTRA availability, not blocks — without
      // this filter every exception day would reject its own bookings.
      .eq("kind", "block");
    if (sbErr) return err(500, "db_error_staff_blocks", origin);
    const staffBlocks = (staffBlocksRaw || []).filter(blokGeldtVandaag);
    for (const b of staffBlocks || []) {
      if (b.service_id) {
        // Dienst-specifieke blokkade ("maandag geen brows voor Demi"): alleen
        // relevant als deze medewerker déze dienst in deze boeking doet, en
        // dan getoetst tegen het deelvenster van die dienst — andere diensten
        // van dezelfde medewerker gaan die dag gewoon door.
        const part = serviceBreakdown.find((p: any) => p.service_id === b.service_id && p.staff_id === b.staff_id);
        if (!part) continue;
        const ps = apptStartMin + part.offset_min;
        const pe = ps + part.duration;
        if (!b.block_time_start || !b.block_time_end) return err(400, "staff_service_day_blocked", origin);
        if (ps < toMinutes(b.block_time_end) && pe > toMinutes(b.block_time_start)) return err(400, "staff_service_day_blocked", origin);
        continue;
      }
      if (!b.block_time_start) return err(400, "staff_day_blocked", origin);
      const blockStart = toMinutes(b.block_time_start);
      const blockEnd = toMinutes(b.block_time_end);
      if (apptStartMin < blockEnd && apptEndMin > blockStart) return err(400, "staff_time_blocked", origin);
    }
  }
  // Salon-wide time blocks live as staff_day_overrides rows with staff_id IS
  // NULL. Multiple rows per date are supported so the owner can carve out
  // several unavailable windows (e.g. 10-11 AND 14-15).
  const { data: salonBlocksRaw, error: sbErrAll } = await supabase
    .from("staff_day_overrides")
    .select("service_id, weekday, date, block_time_start, block_time_end")
    .is("staff_id", null)
    .eq("owner_id", salon.id)
    .or(`date.eq.${date},weekday.eq.${dayOfWeek}`)
    .eq("kind", "block");
  if (sbErrAll) return err(500, "db_error_salon_blocks", origin);
  const salonBlocks = (salonBlocksRaw || []).filter(blokGeldtVandaag);
  for (const b of salonBlocks || []) {
    if (b.service_id) {
      // Salonbrede dienst-blokkade (staff_id NULL + service_id): niemand
      // doet die dienst die dag/dat venster — de behandelkamer is bezet.
      const part = serviceBreakdown.find((p: any) => p.service_id === b.service_id);
      if (!part) continue;
      const ps = apptStartMin + part.offset_min;
      const pe = ps + part.duration;
      if (!b.block_time_start || !b.block_time_end) return err(400, "service_day_blocked", origin);
      if (ps < toMinutes(b.block_time_end) && pe > toMinutes(b.block_time_start)) return err(400, "service_day_blocked", origin);
      continue;
    }
    // Rij-gebaseerde hele-dag-salonblokkade (bestond eerst alleen als legacy
    // JSON; wekelijkse blokkades maken hem nu ook als rij aan): geen tijden
    // en geen dienst = de salon is die dag dicht.
    if (!b.block_time_start || !b.block_time_end) return err(400, "day_blocked", origin);
    const blockStart = toMinutes(b.block_time_start);
    const blockEnd = toMinutes(b.block_time_end);
    if (apptStartMin < blockEnd && apptEndMin > blockStart) return err(400, "slot_blocked", origin);
  }

  // ---------- 10. Slot conflict check ----------
  const breakMin = parseInt(salon.break_minutes || 0);
  const { data: existingAppts, error: exErr } = await supabase
    .from("appointments")
    .select("id, time, service_duration, staff_id, status")
    .eq("owner_id", salon.id)
    .eq("date", date)
    .not("status", "in", '("cancelled","no_show")');
  if (exErr) return err(500, "db_error_conflict_check", origin);

  // Per dienst toetsen, niet één keer voor de hele boeking. Een teamboeking
  // (knippen bij Lady 10:00-11:00, kleuren bij Esther 11:00-12:00) werd hiervoor
  // uitsluitend tegen de EERSTE stylist gelegd; alles wat bij Esther al in de
  // agenda stond werd overgeslagen omdat haar staff_id niet die van Lady is, en
  // zo kon je haar dubbelboeken. serviceBreakdown bevat per dienst al de stylist,
  // de duur en de startverschuiving binnen de boeking, dus we toetsen elk
  // deelvenster tegen precies de afspraken die dat venster kunnen bezetten:
  // die van dezelfde stylist plus die zonder stylist (die bezetten de hele
  // salon — één behandelstoel, "geen voorkeur", of een oude rij van vóór het
  // teamtijdperk). Heeft de nieuwe dienst zelf geen stylist, dan botst hij met
  // álles, precies zoals een solo-salon dat altijd al deed.
  const bestaandeVensters = (existingAppts || []).map((e: any) => {
    const start = toMinutes(e.time);
    return {
      staffId: e.staff_id || null,
      start,
      end: start + (parseInt(e.service_duration || 60) || 60) + breakMin,
    };
  });
  for (const deel of serviceBreakdown) {
    const deelStart = apptStartMin + deel.offset_min;
    const deelEnd = deelStart + deel.duration + breakMin;
    for (const bestaand of bestaandeVensters) {
      // Alleen overslaan als BEIDE kanten een (verschillende) stylist hebben.
      if (deel.staff_id && bestaand.staffId && bestaand.staffId !== deel.staff_id) continue;
      if (deelStart < bestaand.end && deelEnd > bestaand.start) return err(409, "slot_conflict", origin);
    }
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
    // Full per-service staff map so agenda filters and staff dashboards can
    // find combined bookings where a stylist owns only ONE of the services.
    staff_assignments: Object.fromEntries(
      servicesOrdered
        .map((s: any) => [s.id, staff_ids_per_service?.[s.id] || null])
        .filter(([, v]: any) => !!v)
    ),
    // Ordered per-service breakdown — enables the agenda to show each
    // stylist's own sub-slot at the correct start time.
    service_breakdown: serviceBreakdown,
    // Structured product order — the label/price above already include them.
    products: orderedProducts.length > 0 ? orderedProducts : null,
    client_allergies: allergies,
    location_id: location_id || null,
    // Client's chosen UI language — lets send-reminders localize the reminder
    // (nl/en/es); null falls back to the salon's country language.
    lang: ["nl", "en", "es"].includes(lang) ? lang : null,
  }).select("id").single();

  if (aErr || !appt) return err(500, "appointment_create_failed", origin);

  // Verjaardagscode stempelen — pas NA de geslaagde insert hierboven. Mislukt
  // de boeking om een andere reden, dan is de code nooit aangeraakt en kan de
  // klant het gewoon opnieuw proberen. Race van twee gelijktijdige boekingen
  // met dezelfde code: het .is("used_at", null)-filter zorgt dat maar één van
  // beide updates een rij raakt. Raakt onze update níéts (de parallelle
  // boeking was ons voor), dan accepteren we dat stilzwijgend: de korting is
  // dan in dit extreme randgeval twee keer gegeven, maar een 500 teruggeven
  // voor een afspraak die al in de agenda staat (met mails onderweg) is
  // erger — de klant zou opnieuw boeken en er een dubbele afspraak van maken.
  if (appliedDiscount?.source === "birthday") {
    const { data: stamped, error: stampErr } = await supabase
      .from("birthday_discount_codes")
      .update({ used_at: new Date().toISOString(), used_by_appointment: appt.id })
      .eq("owner_id", salon.id)
      .eq("code", appliedDiscount.code)
      .is("used_at", null)
      .select("code");
    if (stampErr || !stamped || stamped.length === 0) {
      // Alleen loggen: de boeking zelf is geslaagd en blijft geslaagd.
      console.error("birthday code stamp skipped:", appliedDiscount.code, stampErr || "already stamped by a parallel booking");
    }
  }

  // Best-effort stock decrement — only for products that track stock
  // (stock != null). Never blocks the booking; floor at 0 (overselling a
  // retail product is a shop-counter problem, not a booking blocker).
  for (const it of orderedProducts) {
    const p = productsById[it.id];
    if (!p || p.stock == null) continue;
    await supabase.from("products")
      .update({ stock: Math.max(0, p.stock - it.qty) })
      .eq("id", it.id);
  }

  // ---------- 14. Create cancellation token ----------
  const cancelToken = generateToken();
  // Verloopt op het STARTMOMENT van de afspraak zelf (salontijd → UTC), niet
  // 24 uur ervoor. Die vaste 24 uur was een tweede, onzichtbare annuleertermijn
  // bovenop cancel_deadline_hours: cancel-appointment kijkt eerst naar
  // expires_at en pas daarna naar de termijn van de salon, dus bij de drie
  // salons die op 0 staan ("altijd annuleerbaar") kreeg de klant binnen een dag
  // voor de afspraak toch "verlopen" te zien. De termijn hoort op één plek
  // afgedwongen te worden, en cancel-appointment doet dat al goed.
  const expiresAt = new Date(apptStart.getTime());
  await supabase.from("cancellation_tokens").insert({
    appointment_id: appt.id,
    token: cancelToken,
    expires_at: expiresAt.toISOString(),
  });

  // ---------- 15. Send booking emails + SMS SERVER-SIDE ----------
  // send-emails / send-sms do their own auth (internal-secret or a user JWT)
  // and are deployed verify_jwt=false, so the anonymous customer's browser
  // CANNOT call them (its anon key 401s). We fire everything here with the
  // internal secret so every real booking actually reaches people.
  // Best-effort: a messaging hiccup must never fail an otherwise-valid booking.
  const ownerEmail = salon.salon_email || salon.email || null;
  const staffEmails = Object.values(staffById).map((s: any) => s.email).filter(Boolean);
  const emailLang = lang === "es" ? "es" : (lang === "en" ? "en" : "nl");
  const isOnline = payment_method === "online";
  const emailBase = {
    client_name: `${firstName} ${lastName}`,
    client_email: email,
    client_phone: phone,
    service_name: combinedName,
    date,
    time,
    price: totalPrice,
    salon_name: salon.business_name,
    salon_accent: salon.accent_color || "",
    salon_logo: salon.logo_url || "",
    // Reply-To for the client-facing emails: a customer replying to their
    // confirmation reaches the salon's inbox, not the dead noreply@ box.
    salon_email: ownerEmail || "",
    // Currency symbol from the salon's country (mirrors shared.jsx CURRENCIES) —
    // so a Bonaire client's confirmation shows $ instead of €. send-emails
    // defaults to € when this is absent.
    // CW = "Cg " (Caribische gulden, XCG): die verving op 31 maart 2025 de
    // Antilliaanse gulden (NAf./ANG) op Curaçao en Sint Maarten. Niet
    // terugzetten naar "NAf." — dat geld bestaat niet meer.
    currency: ({ BQ: "$", AW: "Afl. ", CW: "Cg ", SX: "Cg ", GB: "£" } as Record<string, string>)[salon.country_code] || "€",
    lang: emailLang,
  };
  let emailsSent = false;
  try {
    const internalHeaders = { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY };
    const sendMail = (type: string, extra: Record<string, unknown>) =>
      fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({ type, booking: { ...emailBase, ...extra } }),
      });
    const jobs = [
      // Confirmation to the client (with the cancel link).
      sendMail("booking_confirmation", {
        payment: isOnline ? "online" : "on-arrival",
        cancel_url: `https://vellu.cc/cancel/${cancelToken}`,
        // De termijn die de mail noemt moet dezelfde zijn die cancel-appointment
        // straks handhaaft — anders staat er een getal in de mail waar de
        // annuleerknop zich niets van aantrekt.
        cancel_deadline_hours: salon.cancel_deadline_hours ?? 0,
      }),
    ];
    // Notification to the owner (+ any assigned staff). The owner reads this
    // in the SALON's language (mirrors DUTCH_COUNTRIES in send-reminders),
    // not the client's booking language.
    if (ownerEmail) {
      jobs.push(sendMail("booking_notification", {
        owner_email: ownerEmail,
        staff_emails: staffEmails,
        owner_lang: ["NL", "BE", "AW", "CW", "BQ", "SX"].includes(salon.country_code || "NL") ? "nl" : "en",
        staff_view_revenue: salon.staff_view_revenue,
        staff_view_client_contact: salon.staff_view_client_contact,
      }));
    }
    // NOTE: no invoice at booking time anymore. "online" now means "payment
    // request afterwards": the price can still change during the visit, so
    // the invoice (with the pay link + SEPA QR block) is sent by the owner
    // from the dashboard once the appointment is completed. The confirmation
    // above already tells the client payment happens after the visit.
    // Confirmation SMS to the client. send-sms silently no-ops for non-Pro
    // salons / invalid phones, so it's safe to always fire when a phone exists.
    if (phone) {
      jobs.push(fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({
          type: "booking_confirmation",
          booking: {
            client_name: `${firstName} ${lastName}`,
            client_phone: phone,
            service_name: combinedName,
            date, time,
            price: totalPrice,
            salon_name: salon.business_name,
            owner_id: salon.id,
            // Zelfde symbool als de e-mails hierboven, zodat de bevestigings-SMS
            // van een Bonaire-salon niet alsnog € zegt waar de mail $ toont.
            currency: emailBase.currency,
            lang: emailLang,
          },
        }),
      }));
    }
    // Push-melding op de telefoon/browser van de eigenaar (sinds 2026-08-22,
    // zie send-push-notification + OwnerApp Instellingen → Meldingen). De
    // functie doet niets als de eigenaar geen abonnement heeft; fire-and-forget
    // net als de mails — een mislukte push mag de boeking nooit raken.
    {
      const ownerNl = ["NL", "BE", "AW", "CW", "BQ", "SX"].includes(salon.country_code || "NL");
      const priceStr = `${emailBase.currency}${Number(totalPrice || 0).toFixed(2)}`;
      jobs.push(fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({
          user_id: salon.id,
          title: ownerNl ? "Nieuwe boeking" : "New booking",
          body: `${firstName} ${lastName} · ${date} ${time} · ${combinedName} · ${priceStr}`,
          url: "/owner",
          tag: `booking-${appt.id}`,
        }),
      }));
    }
    await Promise.allSettled(jobs);
    // We attempted the server-side sends; tell the client not to run its
    // (auth-doomed) fallback regardless of each message's per-provider outcome.
    emailsSent = true;
  } catch (e) {
    console.error("booking messaging failed:", e);
  }

  return ok({
    success: true,
    appointment_id: appt.id,
    cancel_token: cancelToken,
    service_name: combinedName,
    service_price: totalPrice,
    service_duration: totalDuration,
    owner_email: ownerEmail,
    salon_name: salon.business_name,
    staff_emails: staffEmails,
    emails_sent: emailsSent,
  }, origin);
});
