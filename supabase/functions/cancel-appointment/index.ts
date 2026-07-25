// supabase/functions/cancel-appointment/index.ts
// Server-side appointment cancellation via token. Returns metadata (incl.
// salon accent/logo) needed for brand-coloured email notifications.

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

// Salons in these countries get Dutch-language emails, everyone else English.
// Keep in sync with COUNTRIES (defaultLang: "nl") in SRC/shared.jsx — Aruba,
// Curacao and Bonaire are Dutch-language markets too.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ"]);

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

// Notify the first waiting waitlist entry for this owner+date. Best-effort:
// runs after the cancel succeeded, and swallows its own errors so a failure
// here never makes the cancel appear to fail to the client.
async function notifyWaitlist(ownerId: string, date: string, salonMeta: { name?: string; accent?: string; logo?: string; slug?: string }) {
  try {
    const { data: entries } = await supabase
      .from("waitlist")
      .select("id, client_name, client_email")
      .eq("owner_id", ownerId)
      .eq("date", date)
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(1);
    const entry = entries?.[0];
    if (!entry) return;
    const { error: updErr } = await supabase
      .from("waitlist")
      .update({ status: "notified", notified_at: new Date().toISOString() })
      .eq("id", entry.id)
      .eq("status", "waiting");
    if (updErr) return;
    await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        type: "waitlist_spot_open",
        booking: {
          client_name: entry.client_name,
          client_email: entry.client_email,
          salon_name: salonMeta.name || "",
          salon_accent: salonMeta.accent || "",
          salon_logo: salonMeta.logo || "",
          salon_slug: salonMeta.slug || "",
          date,
          lang: "nl",
        },
      }),
    }).catch((e) => console.error("waitlist notify email failed:", e));
  } catch (e) {
    console.error("notifyWaitlist error:", e);
  }
}

// Notify the owner + assigned staff that a CLIENT cancelled. Fired SERVER-SIDE
// (not from the client browser) so it lands reliably even when the client
// closes the tab immediately after confirming the cancellation. Best-effort:
// swallows its own errors so it never makes the cancel appear to fail.
async function notifyOwnerCancellation(b: {
  owner_email?: string; staff_email?: string; salon_name?: string;
  salon_accent?: string; salon_logo?: string; lang?: string;
  client_name?: string; client_phone?: string | null; service_name?: string;
  date?: string; time?: string; reason?: string | null;
}) {
  try {
    if (!b.owner_email) return;
    await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        type: "owner_cancellation",
        booking: {
          owner_email: b.owner_email,
          staff_emails: b.staff_email ? [b.staff_email] : [],
          client_name: b.client_name,
          client_phone: b.client_phone || null,
          service_name: b.service_name,
          date: b.date,
          time: b.time,
          reason: b.reason || "",
          salon_name: b.salon_name || "",
          salon_accent: b.salon_accent || "",
          salon_logo: b.salon_logo || "",
          lang: b.lang || "nl",
        },
      }),
    }).catch((e) => console.error("owner cancellation email failed:", e));
  } catch (e) {
    console.error("notifyOwnerCancellation error:", e);
  }
}

// Client-facing "your appointment is cancelled" email + SMS. The cancel page
// is used by the anonymous customer, so their browser can't call send-emails /
// send-sms (it 401s) — these MUST be sent server-side. send-sms silently
// no-ops for non-Pro salons / invalid phones. Best-effort, fire-and-forget.
async function notifyClientCancellation(b: {
  client_email?: string; client_phone?: string | null; owner_id?: string;
  salon_name?: string; salon_accent?: string; salon_logo?: string; lang?: string;
  salon_email?: string; service_name?: string; date?: string; time?: string;
}) {
  const internalHeaders = { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY };
  const base = {
    client_name: undefined as unknown,
    service_name: b.service_name,
    date: b.date,
    time: b.time,
    salon_name: b.salon_name || "",
    salon_accent: b.salon_accent || "",
    salon_logo: b.salon_logo || "",
    // Reply-To so the client's cancellation email routes to the salon.
    salon_email: b.salon_email || "",
    lang: b.lang || "nl",
  };
  try {
    if (b.client_email) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({ type: "booking_cancelled", booking: { ...base, client_email: b.client_email } }),
      }).catch((e) => console.error("client cancellation email failed:", e));
    }
    if (b.client_phone && b.owner_id) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({
          type: "booking_cancelled",
          booking: {
            client_phone: b.client_phone,
            service_name: b.service_name,
            date: b.date,
            time: b.time,
            salon_name: b.salon_name || "",
            owner_id: b.owner_id,
            lang: b.lang || "nl",
          },
        }),
      }).catch((e) => console.error("client cancellation SMS failed:", e));
    }
  } catch (e) {
    console.error("notifyClientCancellation error:", e);
  }
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

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("cancellation_tokens")
    .select("*, appointments(*)")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr || !tokenRow) return json(404, { error: "token_not_found" }, origin);

  const appt = tokenRow.appointments;
  if (!appt) return json(404, { error: "appointment_not_found" }, origin);

  // For the check path (anonymous cancel page) resolve the salon's currency
  // from the owner's country_code so the amount renders in the right symbol
  // ($ for Bonaire, etc.) instead of a hardcoded euro.
  let cc = "NL";
  if (action === "check" && appt.owner_id) {
    const { data: o } = await supabase.from("profiles").select("country_code").eq("id", appt.owner_id).maybeSingle();
    cc = o?.country_code || "NL";
  }

  if (tokenRow.used === true || appt.status === "cancelled") {
    if (action === "check") {
      return json(200, { status: "already_cancelled", appointment: sanitize(appt), country_code: cc }, origin);
    }
    return json(410, { error: "already_used" }, origin);
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    if (action === "check") {
      return json(200, { status: "expired", appointment: sanitize(appt), country_code: cc }, origin);
    }
    return json(410, { error: "expired" }, origin);
  }

  if (action === "check") {
    return json(200, { status: "valid", appointment: sanitize(appt), country_code: cc }, origin);
  }

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

  await supabase.from("cancellation_tokens").update({ used: true }).eq("token", token);

  const notify: { owner_email?: string; staff_email?: string; salon_name?: string; salon_accent?: string; salon_logo?: string; owner_id?: string; lang?: string } = {};
  let salonSlug = "";
  let waitlistEnabled = true;
  if (appt.owner_id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("email, salon_email, business_name, accent_color, logo_url, slug, waitlist_enabled, country_code")
      .eq("id", appt.owner_id)
      .maybeSingle();
    if (owner) {
      notify.owner_email = owner.salon_email || owner.email || undefined;
      notify.salon_name = owner.business_name;
      notify.salon_accent = owner.accent_color || "";
      notify.salon_logo = owner.logo_url || "";
      notify.owner_id = appt.owner_id;
      // Dutch for the Dutch-language markets, English elsewhere. Falls back to
      // Dutch when country_code is unset (old rows), matching send-reminders.
      notify.lang = DUTCH_COUNTRIES.has(owner.country_code || "NL") ? "nl" : "en";
      salonSlug = owner.slug || "";
      waitlistEnabled = owner.waitlist_enabled !== false;
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

  // Fire all cancellation notifications and AWAIT them before returning.
  // Supabase's edge runtime tears the isolate down as soon as the HTTP
  // response is returned, so anything left fire-and-forget here (the owner's
  // "client cancelled" email, the client's confirmation email + SMS, the
  // waitlist ping) was being killed mid-flight — which is why salons stopped
  // receiving the cancellation email even though this code path existed.
  // book-appointment already awaits its sends, which is why NEW-booking
  // notifications arrive reliably but cancellations did not. Each helper
  // swallows its own errors, so Promise.all never rejects and a slow/failed
  // email can't make the cancel itself appear to fail.
  await Promise.all([
    // Owner + assigned staff: "your client cancelled".
    notifyOwnerCancellation({
      owner_email: notify.owner_email,
      staff_email: notify.staff_email,
      salon_name: notify.salon_name,
      salon_accent: notify.salon_accent,
      salon_logo: notify.salon_logo,
      lang: notify.lang,
      client_name: appt.client_name,
      client_phone: appt.client_phone || null,
      service_name: appt.service_name,
      date: appt.date,
      time: appt.time,
      reason: cleanReason,
    }),
    // Client-facing cancellation confirmation (email + SMS).
    notifyClientCancellation({
      client_email: appt.client_email,
      client_phone: appt.client_phone || null,
      owner_id: appt.owner_id,
      salon_name: notify.salon_name,
      salon_accent: notify.salon_accent,
      salon_logo: notify.salon_logo,
      salon_email: notify.owner_email,
      lang: notify.lang,
      service_name: appt.service_name,
      date: appt.date,
      time: appt.time,
    }),
    // Waitlist notify — skipped when the salon disabled the feature.
    (waitlistEnabled && appt.owner_id && appt.date)
      ? notifyWaitlist(appt.owner_id, appt.date, {
          name: notify.salon_name,
          accent: notify.salon_accent,
          logo: notify.salon_logo,
          slug: salonSlug,
        })
      : Promise.resolve(),
  ]);

  return json(200, {
    status: "cancelled",
    appointment: sanitize(appt),
    notify,
  }, origin);
});

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
