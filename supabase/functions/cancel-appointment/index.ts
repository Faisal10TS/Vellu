// supabase/functions/cancel-appointment/index.ts
//
// Server-side appointment cancellation via token. Replaces the previous
// approach where the client could directly UPDATE appointments.status to
// 'cancelled' (via the "Public can cancel appointments" RLS policy with
// USING (true)) — which meant anyone with an appointment ID could nuke
// any salon's appointments.
//
// This function:
//   - looks up the token with service_role (cancellation_tokens locked down)
//   - verifies the token is not already used
//   - verifies expires_at > now()
//   - verifies the appointment isn't already cancelled
//   - flips appointment.status = cancelled + stores reason
//   - marks the token used = true
//   - returns metadata needed for email notifications

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

function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// Rate limit token validation per IP to prevent brute force
const RATE_LIMIT: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

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
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) return json(429, { error: "rate_limited" }, origin);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" }, origin);
  }

  const { action, token, reason } = payload || {};
  if (!token || typeof token !== "string") return json(400, { error: "missing_token" }, origin);
  if (token.length < 16 || token.length > 128) return json(400, { error: "invalid_token_format" }, origin);

  // Look up token + appointment
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("cancellation_tokens")
    .select("*, appointments(*)")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr || !tokenRow) return json(404, { error: "token_not_found" }, origin);

  const appt = tokenRow.appointments;
  if (!appt) return json(404, { error: "appointment_not_found" }, origin);

  // Determine state
  if (tokenRow.used === true || appt.status === "cancelled") {
    if (action === "check") {
      return json(200, { status: "already_cancelled", appointment: sanitize(appt) }, origin);
    }
    return json(410, { error: "already_used" }, origin);
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    if (action === "check") {
      return json(200, { status: "expired", appointment: sanitize(appt) }, origin);
    }
    return json(410, { error: "expired" }, origin);
  }

  // "check" only — return the appointment details so the confirm page can render them
  if (action === "check") {
    return json(200, { status: "valid", appointment: sanitize(appt) }, origin);
  }

  // Actually cancel
  const cleanReason = reason ? String(reason).trim().slice(0, 500) : null;

  const { error: upErr } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: cleanReason,
    })
    .eq("id", appt.id);
  if (upErr) return json(500, { error: "cancel_failed" }, origin);

  // Mark token used (best effort — if this fails the token is still one-shot
  // because appointment.status === cancelled prevents re-use above)
  await supabase.from("cancellation_tokens").update({ used: true }).eq("token", token);

  // Look up notification recipients (owner + staff)
  const notify: { owner_email?: string; staff_email?: string; salon_name?: string; salon_accent?: string; salon_logo?: string } = {};
  if (appt.owner_id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("email, salon_email, business_name, accent_color, logo_url")
      .eq("id", appt.owner_id)
      .maybeSingle();
    if (owner) {
      notify.owner_email = owner.salon_email || owner.email || undefined;
      notify.salon_name = owner.business_name;
      // Surfaced so the cancellation + owner-notification emails are brand-coloured.
      notify.salon_accent = owner.accent_color || "";
      notify.salon_logo = owner.logo_url || "";
    }
  }
  if (appt.staff_id) {
    const { data: staff } = await supabase
      .from("staff_members")
      .select("email")
      .eq("id", appt.staff_id)
      .maybeSingle();
    if (staff?.email) notify.staff_email = staff.email;
  }

  return json(200, {
    status: "cancelled",
    appointment: sanitize(appt),
    notify,
  }, origin);
});

// Strip internal fields before returning to client
function sanitize(a: any) {
  return {
    id: a.id,
    date: a.date,
    time: a.time,
    service_name: a.service_name,
    service_price: a.service_price,
    client_name: a.client_name,
    client_email: a.client_email,
    status: a.status,
    owner_id: a.owner_id,
    staff_id: a.staff_id,
  };
}
