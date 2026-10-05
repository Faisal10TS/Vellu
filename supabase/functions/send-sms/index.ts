// supabase/functions/send-sms/index.ts
//
// Sends transactional SMS to a salon's client. Complementary to send-emails —
// the caller invokes both when they want an event to reach the client via
// either channel. This function is intentionally silent for accounts that
// don't qualify (Starter plan, missing phone) so callers can fire-and-forget
// without needing to duplicate the gate logic on the client side.
//
// Gate rules:
//   1. Salon must be on the Professional plan (SMS is a Pro-tier feature).
//   2. Client must have a phone number on file, and we must be able to
//      normalise it into E.164 (local numbers get the SALON's country code).
//   3. Message type must be one of the allow-listed events — invoices are
//      deliberately excluded (too long for a single SMS, and the client
//      already gets a proper PDF-style email).
//
// Provider abstraction:
//   - SMS_PROVIDER env var picks the backend. Currently supported values:
//     "messagebird", "twilio", or unset/"none". Unset falls back to a
//     dry-run that logs the message and answers success:true, sent:false,
//     reason 'dry_run' (nothing reached the client).
//   - When a real provider is picked, credentials come from provider-
//     specific env vars (e.g. MESSAGEBIRD_ACCESS_KEY, TWILIO_ACCOUNT_SID +
//     TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER).
//
// Auth: valid Supabase JWT OR the internal service-role secret (same
// pattern as send-emails so server-side crons and edge functions can call
// this too). A JWT caller must be the salon owner (owner_id = her user id)
// and pass appointment_id; phone and name then come from that appointment.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Provider config — leave unset to run in dry-run mode.
const SMS_PROVIDER = (Deno.env.get("SMS_PROVIDER") || "none").toLowerCase();
const MESSAGEBIRD_ACCESS_KEY = Deno.env.get("MESSAGEBIRD_ACCESS_KEY") || "";
const MESSAGEBIRD_ORIGINATOR = Deno.env.get("MESSAGEBIRD_ORIGINATOR") || "Vellu";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";

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

const ALLOWED_TYPES = new Set([
  "booking_confirmation",
  "appointment_reminder",
  "appointment_updated",
  "booking_cancelled",
]);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function ok(body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function err(status: number, code: string, origin: string | null) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// Geeft het user-id van een geldig Supabase-JWT terug, of null. Het id is nodig
// om de aanroeper aan haar EIGEN salon te binden (zie de auth-stap in serve).
async function verifyUserToken(tok: string): Promise<string | null> {
  if (!tok) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${tok}`, "apikey": SUPABASE_SERVICE_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return typeof u?.id === "string" ? u.id : null;
  } catch {
    return null;
  }
}

// Telefoonnummer → E.164 op basis van het land van de SALON. Port van waDigits
// in src/shared.jsx (dezelfde regels als de WhatsApp-knoppen): "+…" en "00…"
// hebben al een landcode, "0…" krijgt de landcode van de salon, op Curaçao
// hoort er een 9 achter de 599 (7 lokale cijfers of "9xxxxxxx"), en korte
// lokale nummers (Caribisch: 7 cijfers) krijgen de landcode ervoor. Tot
// 05-10-2026 was dit NL-only: een 7-cijferig Bonaire-nummer werd overgeslagen
// en "0…" van een Bonaire- of Belgische salon werd +31… — een vreemde.
const WA_COUNTRY_PREFIX: Record<string, string> = { NL: "31", BE: "32", BQ: "599", CW: "599", AW: "297", SX: "1721", ES: "34", DE: "49", GB: "44", SR: "597" };
function normalisePhone(raw: string | null | undefined, countryCode = "NL"): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let d = s.replace(/[^0-9]/g, "");
  if (!d) return null;
  if (s.startsWith("+")) return d.length >= 8 ? "+" + d : null;
  const country = String(countryCode || "NL").toUpperCase();
  const cc = WA_COUNTRY_PREFIX[country] || "31";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = cc + d.slice(1);
  else if (country === "CW" && d.length === 7) d = "5999" + d;
  else if (country === "CW" && d.length === 8 && d.startsWith("9")) d = "599" + d;
  else if (d.length <= 8 && !d.startsWith(cc)) d = cc + d;
  return d.length >= 8 ? "+" + d : null;
}

// Taalkeuze voor één zin. Zelfde vorm als txt() in send-emails, zodat de SMS en
// de e-mail over hetzelfde geval niet uit elkaar kunnen lopen. Spaans hoort er
// echt bij: book-appointment slaat "es" op als de klant in het Spaans boekt, en
// tot nu toe viel die klant hier stilzwijgend terug op Nederlands.
function txt(lang: string, nl: string, en: string, es: string) {
  return lang === "en" ? en : lang === "es" ? es : nl;
}

function fmtDate(ds: string, lang: string) {
  try {
    const d = new Date(ds + "T12:00:00");
    if (lang === "en") {
      const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${d.getDate()} ${mo[d.getMonth()]}`;
    }
    if (lang === "es") {
      const mo = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
      return `${d.getDate()} ${mo[d.getMonth()]}`;
    }
    const mo = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return `${d.getDate()} ${mo[d.getMonth()]}`;
  } catch {
    return ds;
  }
}

type Booking = {
  client_name?: string;
  client_phone?: string;
  service_name?: string;
  date?: string;
  time?: string;
  price?: number | string;
  salon_name?: string;
  // Valutasymbool ("$", "Afl. ", …), meegegeven door de aanroeper op basis van
  // het salon-land — zelfde patroon als send-emails. Afwezig = € (oude callers).
  currency?: string;
  lang?: string;
  // Datum van vandaag in SALONTIJD, meegegeven door send-reminders. Bepaalt of de
  // herinnering "vandaag", "morgen" of de datum zelf moet zeggen.
  today?: string;
  owner_id?: string;
  old_date?: string | null;
  old_time?: string | null;
  old_price?: number | string | null;
};

// Message templates. Kept under 160 chars where possible so we don't get
// billed for a multi-part SMS. Names are truncated with an ellipsis when
// the salon name is long enough to blow the budget.
//
// De herinnering zei altijd "morgen". Dat klopte zolang de cron alleen afspraken
// van morgen oppakte, maar sinds send-reminders profiles.reminder_hours
// respecteert (1, 2, 4, 12, 24 of 48 uur) gaat dezelfde SMS net zo goed over
// vandaag of over overmorgen. Zie het appointment_reminder-blok hieronder.
function buildMessage(type: string, b: Booking): string {
  const lang = b.lang === "en" ? "en" : b.lang === "es" ? "es" : "nl";
  const salon = String(b.salon_name || "").slice(0, 30);
  const service = String(b.service_name || "").slice(0, 40);
  const date = b.date ? fmtDate(String(b.date), lang) : "";
  const time = (String(b.time || "").slice(0, 5)) || "";
  // Het euroteken stond hier hardgecodeerd, maar een Bonaire-salon rekent in
  // dollars. De aanroeper (book-appointment) leidt het symbool af uit het
  // salon-land en stuurt het mee, exact zoals bij send-emails; ontbreekt het
  // veld (een oudere aanroeper), dan blijft € de terugval.
  // Alleen vooraan trimmen, net als send-emails: "XCG " en "Afl. " houden hun
  // spatie ("XCG 45", niet "XCG45").
  const cur = (typeof b.currency === "string" && b.currency.trim()) ? b.currency.replace(/^\s+/, "") : "€";
  // Hele bedragen zonder decimalen (kort voor een SMS), duizendtallen met een
  // punt ("$1.500", 28-09-2026). Centen blijven staan ("$22,50"), anders stond
  // er een afgerond en dus verkeerd bedrag in de bevestiging.
  const priceNum = parseFloat(String(b.price));
  const priceStr = b.price != null && Number.isFinite(priceNum) ? (() => {
    const [i, d] = Math.abs(priceNum).toFixed(2).split(".");
    return `${cur}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${d === "00" ? "" : "," + d}`;
  })() : "";
  if (type === "booking_confirmation") {
    return txt(lang,
      `Afspraak bevestigd bij ${salon}: ${date} ${time}. ${service}${priceStr ? " - " + priceStr : ""}.`,
      `Booking confirmed at ${salon}: ${date} ${time}. ${service}${priceStr ? " - " + priceStr : ""}.`,
      `Cita confirmada en ${salon}: ${date} ${time}. ${service}${priceStr ? " - " + priceStr : ""}.`);
  }
  if (type === "appointment_reminder") {
    // Hier stond "morgen" hardgecodeerd, maar de salon kiest zelf hoeveel uur van
    // tevoren de herinnering vertrekt (profiles.reminder_hours): bij 1, 2, 4 of 12
    // uur gaat het over een afspraak van VANDAAG en bij 48 uur over overmorgen.
    // Zelfde aanpak als de e-mail (send-emails, appointment_reminder): het verschil
    // in hele dagen tussen b.date en b.today. b.today is de datum in SALONTIJD die
    // send-reminders meestuurt — onze eigen klok is UTC en zou een salon op Bonaire
    // of in Nederland rond middernacht een dag mis laten zitten. Ontbreekt b.today
    // (een andere aanroeper), dan is UTC de terugval.
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(b.today || ""))
      ? String(b.today)
      : new Date().toISOString().split("T")[0];
    const dayDiff = (() => {
      const t0 = Date.parse(today + "T00:00:00Z");
      const d0 = Date.parse(String(b.date || "") + "T00:00:00Z");
      return (isNaN(t0) || isNaN(d0)) ? null : Math.round((d0 - t0) / 86400000);
    })();
    // Verder weg dan morgen (of een onleesbare datum): de datum zelf. In een SMS
    // is "15 aug" net zo kort als "overmorgen" en het kan niet misgelezen worden.
    const when = dayDiff === 0
      ? txt(lang, "vandaag", "today", "hoy")
      : dayDiff === 1
      ? txt(lang, "morgen", "tomorrow", "mañana")
      : date;
    // Zonder datum én zonder dagverschil geen lege plek in de zin.
    const w = when ? `${when} ` : "";
    return txt(lang,
      `Herinnering: ${w}${time} bij ${salon}. ${service}. Tot dan!`,
      `Reminder: ${w}${time} at ${salon}. ${service}. See you then!`,
      `Recordatorio: ${w}${time} en ${salon}. ${service}. ¡Hasta pronto!`);
  }
  if (type === "appointment_updated") {
    return txt(lang,
      `Je afspraak bij ${salon} is gewijzigd: ${date} ${time}. Check je e-mail voor details.`,
      `Your appointment at ${salon} was updated: ${date} ${time}. Check your email for details.`,
      `Tu cita en ${salon} ha cambiado: ${date} ${time}. Revisa tu correo para los detalles.`);
  }
  if (type === "booking_cancelled") {
    return txt(lang,
      `Je afspraak bij ${salon} op ${date} ${time} is geannuleerd.`,
      `Your appointment at ${salon} on ${date} ${time} has been cancelled.`,
      `Tu cita en ${salon} el ${date} ${time} ha sido cancelada.`);
  }
  return "";
}

async function sendViaMessagebird(to: string, body: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!MESSAGEBIRD_ACCESS_KEY) return { ok: false, error: "missing_credentials" };
  try {
    const r = await fetch("https://rest.messagebird.com/messages", {
      method: "POST",
      headers: {
        "Authorization": `AccessKey ${MESSAGEBIRD_ACCESS_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        originator: MESSAGEBIRD_ORIGINATOR,
        recipients: [to],
        body,
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      console.error("Messagebird error:", r.status, data);
      return { ok: false, error: `messagebird_${r.status}` };
    }
    return { ok: true, id: data?.id || undefined };
  } catch (e) {
    console.error("Messagebird fetch failed:", e);
    return { ok: false, error: "messagebird_fetch_failed" };
  }
}

async function sendViaTwilio(to: string, body: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return { ok: false, error: "missing_credentials" };
  try {
    const form = new URLSearchParams();
    form.set("To", to);
    form.set("From", TWILIO_FROM_NUMBER);
    form.set("Body", body);
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      console.error("Twilio error:", r.status, data);
      return { ok: false, error: `twilio_${r.status}` };
    }
    return { ok: true, id: data?.sid || undefined };
  } catch (e) {
    console.error("Twilio fetch failed:", e);
    return { ok: false, error: "twilio_fetch_failed" };
  }
}

async function dispatch(to: string, body: string): Promise<{ ok: boolean; id?: string; error?: string; dryRun?: boolean }> {
  if (SMS_PROVIDER === "messagebird") return sendViaMessagebird(to, body);
  if (SMS_PROVIDER === "twilio") return sendViaTwilio(to, body);
  // Dry-run: alleen loggen. Het antwoord zegt eerlijk dat er niets verstuurd is
  // (sent:false, reason 'dry_run'); tot 05-10-2026 stond hier sent:true en
  // dacht elke aanroeper dat de klant een SMS had gekregen.
  console.log(`[SMS DRY-RUN provider=${SMS_PROVIDER}] to=${to} body=${JSON.stringify(body)}`);
  return { ok: true, dryRun: true };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return err(405, "method_not_allowed", origin);

  // Auth: allow either an internal secret (server-to-server callers like the
  // reminder cron) or a valid Supabase JWT (owner-facing flows).
  let authed = false;
  let callerId: string | null = null;
  const sec = req.headers.get("x-internal-secret");
  if (sec && sec === SUPABASE_SERVICE_KEY) authed = true;
  if (!authed) {
    const a = req.headers.get("authorization") || "";
    const tok = a.startsWith("Bearer ") ? a.slice(7) : "";
    if (tok) { callerId = await verifyUserToken(tok); authed = !!callerId; }
  }
  if (!authed) return err(401, "unauthorized", origin);

  let body: { type?: string; booking?: Booking & { appointment_id?: string } };
  try { body = await req.json(); } catch { return err(400, "invalid_json", origin); }
  const type = String(body.type || "");
  const b = body.booking || {};

  if (!ALLOWED_TYPES.has(type)) return err(400, "type_not_allowed", origin);
  if (!b.owner_id) return err(400, "missing_owner_id", origin);
  // Met een login (de eigenaar in de app) alleen voor je EIGEN salon. Tot
  // 05-10-2026 accepteerde dit elk JWT met elk owner_id en elk telefoonnummer
  // uit de aanvraag (R-05) — onschuldig zolang SMS droog draaide, maar niet
  // zodra er een provider aan staat.
  if (callerId && b.owner_id !== callerId) return err(403, "forbidden", origin);

  // Plan gate: only Professional-tier salons send SMS.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("plan, subscription_status, business_name, country_code")
    .eq("id", b.owner_id)
    .maybeSingle();
  if (profileErr || !profile) return err(404, "no_profile", origin);
  const plan = String(profile.plan || "");
  if (plan !== "professional") {
    return ok({ success: true, sent: false, skipped_reason: "plan_not_professional" }, origin);
  }
  // Optionally, refuse when subscription isn't active — an account in
  // past_due state shouldn't rack up SMS costs.
  if (profile.subscription_status && !["active", "trialing"].includes(String(profile.subscription_status))) {
    return ok({ success: true, sent: false, skipped_reason: "subscription_not_active" }, origin);
  }

  // Met een login: het nummer (en de naam) komen uit een afspraak van deze
  // salon, de salonnaam uit het profiel. De aanvraag bepaalt alleen nog de
  // inhoud (dienst, datum, tijd, prijs, taal).
  if (callerId) {
    const apptId = String(b.appointment_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apptId)) return err(400, "appointment_id_required", origin);
    const { data: ap, error: apErr } = await supabase
      .from("appointments")
      .select("client_phone, client_name, lang")
      .eq("id", apptId)
      .eq("owner_id", callerId)
      .maybeSingle();
    if (apErr) return err(500, "db_error", origin);
    if (!ap) return err(403, "appointment_not_found", origin);
    b.client_phone = ap.client_phone || "";
    b.client_name = ap.client_name || "";
    if (!b.lang && ap.lang) b.lang = ap.lang;
    b.salon_name = profile.business_name || "";
  }

  const to = normalisePhone(b.client_phone, profile.country_code || "NL");
  if (!to) return ok({ success: true, sent: false, skipped_reason: "no_valid_phone" }, origin);

  const message = buildMessage(type, b);
  if (!message) return ok({ success: true, sent: false, skipped_reason: "empty_message" }, origin);

  const result = await dispatch(to, message);
  if (!result.ok) {
    // Log the failure but don't 500 — the upstream flow should not retry
    // just because SMS hiccupped; the email will have gone anyway.
    console.error("SMS dispatch failed:", result.error);
    return ok({ success: false, sent: false, error: result.error }, origin);
  }
  // Geen provider ingesteld: niets verstuurd, en dat zeggen we ook.
  if (result.dryRun) return ok({ success: true, sent: false, reason: "dry_run" }, origin);
  return ok({
    success: true,
    sent: true,
    provider: SMS_PROVIDER || "none",
    message_id: result.id || null,
  }, origin);
});
