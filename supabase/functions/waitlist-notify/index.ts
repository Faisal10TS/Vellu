// supabase/functions/waitlist-notify/index.ts
// Fired by the PUBLIC booking page when an anonymous visitor joins a salon's
// waitlist. Since 05-10-2026 this function ALSO creates the waitlist rows (the
// browser no longer inserts; anon has no INSERT on waitlist anymore). Then it
// sends two emails via send-emails:
//   1. a confirmation to the client ("you're on the waitlist")
//   2. a notification to the salon (owner + the anchored stylist)
//
// Waarom de insert hier: hiervoor kon iedereen deze functie aanroepen met elk
// adres en elke tekst, zonder dat er een wachtlijstrij bestond — een
// Vellu-mailrelais. Nu mailt hij alleen voor rijen die hij zelf net aanmaakte,
// met de waarden van die rijen, en nooit twee keer voor dezelfde (salon,
// adres, dag) zolang die nog wacht. De invoer wordt gecontroleerd zoals de
// boekingspagina dat doet: wachtlijst aan, naam en e-mail, telefoon als de
// salon dat verplicht, dagen tussen vandaag (salontijd) en max_advance_days,
// stylist en behandelingen van deze salon.
//
// Why a server-side function: the recipient addresses — the salon's contact
// email and the stylist's email — are deliberately NOT in the public salon
// payload, and an anonymous visitor has no session to call send-emails
// directly (it 401s). This resolves everything from IDs with the service role.

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

// IP voor de rate limit: eerst de headers die de gateway zelf zet, pas daarna
// het eerste x-forwarded-for-veld (zelfde helper als book-appointment).
function clientIp(req: Request): string {
  const h = req.headers;
  const ip = h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0];
  return String(ip || "").trim() || "unknown";
}

const isEmail = (s: unknown) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// "Vandaag" in de tijdzone van de salon (zelfde tabel als book-appointment):
// op Bonaire is het om 21:00 lokaal in UTC al morgen.
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
function salonToday(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Echte kalenderdatum (2026-02-31 haalt de regex wel, maar niet de database).
const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

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

  const ip = clientIp(req);
  if (!rateLimit(ip)) return json(429, { error: "rate_limited" }, origin);

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }, origin); }

  const ownerId = String(payload?.owner_id || "");
  const clientEmail = String(payload?.client_email || "").trim().toLowerCase();
  const clientName = String(payload?.client_name || "").trim().slice(0, 120);
  const clientPhone = payload?.client_phone ? (String(payload.client_phone).trim().slice(0, 40) || null) : null;
  const notes = payload?.notes ? (String(payload.notes).trim().slice(0, 300) || null) : null;
  // Client's own language for their confirmation — es was added after this
  // function was written, so accept all three (Spanish clients were silently
  // getting Dutch emails).
  const clientLang = ["en", "es"].includes(payload?.lang) ? payload.lang : "nl";
  // Opgeslagen op de rij (waitlist.lang) zodat de "plek vrij"-mail later ook in
  // haar taal gaat; onbekend = null, dan valt die mail terug op de salontaal.
  const rowLang = ["nl", "en", "es"].includes(payload?.lang) ? payload.lang : null;
  const staffIdIn = payload?.staff_id ? String(payload.staff_id) : null;
  const serviceIdsIn: string[] = Array.isArray(payload?.service_ids) ? payload.service_ids.map((x: unknown) => String(x)).slice(0, 10) : [];
  // Dates: keep only real YYYY-MM-DD dates, dedup, cap.
  const datesIn = [...new Set((Array.isArray(payload?.dates) ? payload.dates : [])
    .map((d: unknown) => String(d))
    .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && isRealDate(d)))].slice(0, 60) as string[];

  if (!ownerId || !isEmail(clientEmail) || !clientName || datesIn.length === 0) {
    return json(400, { error: "missing_fields" }, origin);
  }

  // Resolve the salon. If it doesn't exist, do nothing (can't leak anything).
  const { data: salon } = await supabase
    .from("profiles")
    .select("business_name, accent_color, logo_url, slug, salon_email, email, country_code, staff_view_revenue, staff_view_client_contact, waitlist_enabled, phone_required, max_advance_days")
    .eq("id", ownerId)
    .maybeSingle();
  if (!salon) return json(404, { error: "salon_not_found" }, origin);
  // Wachtlijst uitgezet: de pagina toont de knop dan niet, dus dit is een
  // verzoek buiten de pagina om.
  if (salon.waitlist_enabled === false) return json(403, { error: "waitlist_disabled" }, origin);
  if (salon.phone_required && (String(clientPhone || "").match(/[0-9]/g) || []).length < 6) {
    return json(400, { error: "phone_required" }, origin);
  }

  // Alleen dagen die de boekingspagina zelf aanbiedt: vandaag (salontijd) t/m
  // vandaag + max_advance_days.
  const today = salonToday(tzFor(salon.country_code));
  const lastDay = addDays(today, parseInt(salon.max_advance_days) || 60);
  const dates = datesIn.filter((d) => d >= today && d <= lastDay).sort();
  if (dates.length === 0) return json(400, { error: "invalid_dates" }, origin);

  const salonLang = DUTCH_COUNTRIES.has(salon.country_code || "NL") ? "nl" : "en";
  const salonEmail = salon.salon_email || salon.email || "";

  // Behandelingen: alleen zichtbare diensten van deze salon, in de volgorde
  // waarin de klant ze koos. Namen in de salontaal voor de salonmelding.
  let serviceIds: string[] = [];
  let serviceName = "";
  if (serviceIdsIn.length) {
    const { data: svcs } = await supabase
      .from("services")
      .select("id, name, name_nl, name_en")
      .in("id", serviceIdsIn)
      .eq("owner_id", ownerId)
      .eq("visible", true);
    if (svcs?.length) {
      // Preserve the order the client picked them in.
      const byId = new Map(svcs.map((s: any) => [s.id, (salonLang === "nl" ? s.name_nl : s.name_en) || s.name_nl || s.name_en || s.name || ""]));
      serviceIds = [...new Set(serviceIdsIn.filter((id) => byId.has(id)))];
      serviceName = serviceIds.map((id) => byId.get(id)).filter(Boolean).join(" + ");
    }
  }

  // Stylist: alleen een stylist van deze salon, anders geen.
  let staffId: string | null = null;
  let staffName = "";
  let staffEmail = "";
  if (staffIdIn) {
    const { data: staff } = await supabase
      .from("staff_members")
      .select("id, name, email")
      .eq("id", staffIdIn)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (staff) { staffId = staff.id; staffName = staff.name || ""; staffEmail = staff.email || ""; }
  }

  // Al wachtend voor die dag (zelfde salon, zelfde adres)? Dan niet nog een rij
  // en niet nog een mail: een tweede klik of een herhaalde aanroep stuurt niets.
  const { data: bestaand, error: bestaandErr } = await supabase
    .from("waitlist")
    .select("date, client_email")
    .eq("owner_id", ownerId)
    .eq("status", "waiting")
    .in("date", dates)
    .ilike("client_email", likeEscape(clientEmail));
  if (bestaandErr) return json(500, { error: "waitlist_lookup_failed" }, origin);
  const alWachtend = new Set((bestaand || [])
    .filter((r: any) => String(r.client_email || "").trim().toLowerCase() === clientEmail)
    .map((r: any) => String(r.date)));
  const nieuweDagen = dates.filter((d) => !alWachtend.has(d));
  if (nieuweDagen.length === 0) return json(200, { success: true, inserted: 0 }, origin);

  const { data: inserted, error: insErr } = await supabase
    .from("waitlist")
    .insert(nieuweDagen.map((d) => ({
      owner_id: ownerId,
      staff_id: staffId,
      date: d,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      service_ids: serviceIds.length ? serviceIds : null,
      notes,
      status: "waiting",
      lang: rowLang,
    })))
    .select("date, client_name, client_email, client_phone, notes");
  if (insErr || !inserted || inserted.length === 0) {
    console.error("waitlist insert failed:", insErr);
    return json(500, { error: "insert_failed" }, origin);
  }
  // De mails gebruiken wat er echt is opgeslagen.
  const rij = inserted[0];
  const insertedDates = inserted.map((r: any) => String(r.date)).sort();

  const brand = {
    salon_name: salon.business_name || "",
    salon_accent: salon.accent_color || "",
    salon_logo: salon.logo_url || "",
    salon_slug: salon.slug || "",
    salon_email: salonEmail, // Reply-To for the client's confirmation
  };

  // De rijen staan er; een mailhapering mag de aanmelding niet als mislukt
  // laten lijken.
  try {
    // 1) Client confirmation (client's chosen language). Alleen de dagen die
    // nu echt zijn toegevoegd.
    await sendEmail("waitlist_confirmation", {
      ...brand,
      client_name: rij.client_name,
      client_email: rij.client_email,
      dates: insertedDates,
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
      client_name: rij.client_name,
      client_email: rij.client_email,
      client_phone: rij.client_phone,
      service_name: serviceName,
      staff_name: staffName,
      dates: insertedDates,
      notes: rij.notes,
      lang: salonLang,
      // send-emails renders owner-facing mails from owner_lang; keep lang too
      // so older send-emails versions stay compatible.
      owner_lang: salonLang,
    });
  } catch (e) {
    console.error("waitlist mails failed:", e);
  }

  return json(200, { success: true, inserted: inserted.length }, origin);
});
