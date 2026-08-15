// supabase/functions/waitlist-notify/index.ts
// Fired by the PUBLIC booking page right after an anonymous visitor adds
// themselves to a salon's waitlist. Sends two emails via send-emails:
//   1. a confirmation to the client ("you're on the waitlist")
//   2. a notification to the salon (owner + the anchored stylist)
//
// Why a server-side function: the recipient addresses — the salon's contact
// email and the stylist's email — are deliberately NOT in the public salon
// payload, and an anonymous visitor has no session to call send-emails
// directly (it 401s). This resolves everything from IDs with the service role.
// Best-effort: the waitlist row is already saved client-side, so any failure
// here is logged and swallowed — it must never look like the sign-up failed.

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

// Dutch-language markets — keep in sync with COUNTRIES (defaultLang "nl") in
// SRC/shared.jsx and the other edge functions. Salon-facing email language.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);

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

// Simple in-memory rate limit per IP — the publishable key is public, so this
// endpoint is reachable by anyone; cap the blast radius of abuse.
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

const isEmail = (s: unknown) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function sendEmail(type: string, booking: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY },
    body: JSON.stringify({ type, booking }),
  });
  if (!res.ok) console.error("waitlist send-emails failed:", type, await res.text().catch(() => ""));
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) return json(429, { error: "rate_limited" }, origin);

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }, origin); }

  const ownerId = String(payload?.owner_id || "");
  const clientEmail = String(payload?.client_email || "").trim().toLowerCase();
  const clientName = String(payload?.client_name || "").trim().slice(0, 120);
  const clientPhone = payload?.client_phone ? String(payload.client_phone).trim().slice(0, 40) : null;
  const notes = payload?.notes ? String(payload.notes).slice(0, 300) : null;
  // Client's own language for their confirmation — es was added after this
  // function was written, so accept all three (Spanish clients were silently
  // getting Dutch emails).
  const clientLang = ["en", "es"].includes(payload?.lang) ? payload.lang : "nl";
  const staffId = payload?.staff_id ? String(payload.staff_id) : null;
  const serviceIds: string[] = Array.isArray(payload?.service_ids) ? payload.service_ids.map((x: unknown) => String(x)) : [];
  // Dates: keep only YYYY-MM-DD strings, dedup, cap.
  const dates = [...new Set((Array.isArray(payload?.dates) ? payload.dates : [])
    .map((d: unknown) => String(d))
    .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(0, 60);

  if (!ownerId || !isEmail(clientEmail) || !clientName || dates.length === 0) {
    return json(400, { error: "missing_fields" }, origin);
  }

  // Resolve the salon. If it doesn't exist, do nothing (can't leak anything).
  const { data: salon } = await supabase
    .from("profiles")
    .select("business_name, accent_color, logo_url, slug, salon_email, email, country_code, staff_view_revenue, staff_view_client_contact")
    .eq("id", ownerId)
    .maybeSingle();
  if (!salon) return json(404, { error: "salon_not_found" }, origin);

  const salonLang = DUTCH_COUNTRIES.has(salon.country_code || "NL") ? "nl" : "en";
  const salonEmail = salon.salon_email || salon.email || "";

  // Resolve service + staff names (salon language) for the salon notification.
  let serviceName = "";
  if (serviceIds.length) {
    const { data: svcs } = await supabase
      .from("services")
      .select("id, name, name_nl, name_en")
      .in("id", serviceIds)
      .eq("owner_id", ownerId);
    if (svcs?.length) {
      // Preserve the order the client picked them in.
      const byId = new Map(svcs.map((s: any) => [s.id, (salonLang === "nl" ? s.name_nl : s.name_en) || s.name_nl || s.name_en || s.name || ""]));
      serviceName = serviceIds.map((id) => byId.get(id)).filter(Boolean).join(" + ");
    }
  }

  let staffName = "";
  let staffEmail = "";
  if (staffId) {
    const { data: staff } = await supabase
      .from("staff_members")
      .select("name, email")
      .eq("id", staffId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (staff) { staffName = staff.name || ""; staffEmail = staff.email || ""; }
  }

  const brand = {
    salon_name: salon.business_name || "",
    salon_accent: salon.accent_color || "",
    salon_logo: salon.logo_url || "",
    salon_slug: salon.slug || "",
    salon_email: salonEmail, // Reply-To for the client's confirmation
  };

  // 1) Client confirmation (client's chosen language).
  await sendEmail("waitlist_confirmation", {
    ...brand,
    client_name: clientName,
    client_email: clientEmail,
    dates,
    lang: clientLang,
  });

  // 2) Salon notification (salon language). Owner + the anchored stylist.
  const staffEmails = staffEmail ? [staffEmail] : [];
  await sendEmail("waitlist_joined", {
    ...brand,
    owner_email: salonEmail,
    staff_emails: staffEmails,
    staff_view_revenue: salon.staff_view_revenue,
    staff_view_client_contact: salon.staff_view_client_contact,
    client_name: clientName,
    client_email: clientEmail,
    client_phone: clientPhone,
    service_name: serviceName,
    staff_name: staffName,
    dates,
    notes,
    lang: salonLang,
    // send-emails renders owner-facing mails from owner_lang; keep lang too
    // so older send-emails versions stay compatible.
    owner_lang: salonLang,
  });

  return json(200, { success: true }, origin);
});
