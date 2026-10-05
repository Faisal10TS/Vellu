// supabase/functions/request-review-link/index.ts
//
// "Schrijf een review" op de boekingspagina liep dood: een review kan alleen
// met de token uit de uitnodigingsmail (send-followups), dus de knop toonde
// enkel de mededeling dat het niet kon. Nu vraagt de pagina om het e-mailadres
// waarmee de klant heeft geboekt, en sturen wij die klant haar persoonlijke
// reviewlink — precies dezelfde token-flow als de follow-upmail, dus een review
// blijft het bewijs van een écht bezoek.
//
// Drie regels:
//  1. HET ANTWOORD VERRAADT NIETS. Onbekend adres, geen afgeronde afspraak,
//     alles al beoordeeld of gethrottled: altijd dezelfde 200 { ok: true }.
//     Anders kon iemand met deze functie uitvinden wie klant is bij een salon.
//     Sinds 05-10-2026 ook niet via de TIJD: het antwoord gaat meteen na de
//     invoercontrole terug en het opzoeken + mailen loopt daarna op de
//     achtergrond (EdgeRuntime.waitUntil).
//  2. ALLEEN AFGERONDE BEZOEKEN (status completed, datum vóór vandaag in de
//     tijdzone van de salon), geen kassaverkopen. De jongste afspraak zonder
//     review wint; een nog geldige, ongebruikte token voor die afspraak wordt
//     hergebruikt.
//  3. VERZENDINGEN TELLEN, NIET TOKENS (review_tokens.last_sent_at): dezelfde
//     link gaat hooguit één keer per uur de deur uit, en per adres per salon
//     hooguit 3 verschillende links per 24 uur. Hiervoor telde de limiet alleen
//     NIEUWE tokens, dus een hergebruikte token kon eindeloos gemaild worden.
//     Plus een limiet per IP, zoals de andere publieke functies.
//
// Auth: publieke pagina zonder sessie → verify_jwt = false (zie config.toml).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const ALLOWED_ORIGINS = [
  "https://vellu.cc", "https://www.vellu.cc", "https://vellu.io", "https://www.vellu.io",
  "http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176",
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
const json = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });

// Zelfde bron en lengte als in send-followups/book-appointment.
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const REVIEW_TOKEN_DAYS = 60;
const MAX_PER_DAY = 3;
const RESEND_AFTER_MS = 60 * 60 * 1000; // dezelfde link hooguit 1x per uur

// Limiet per IP (in het geheugen, per isolate), zoals book-appointment en
// waitlist-notify.
const RATE_LIMIT: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
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
// IP: eerst de headers die de gateway zelf zet, pas daarna het eerste
// x-forwarded-for-veld (zelfde helper als book-appointment).
function clientIp(req: Request): string {
  const h = req.headers;
  const ip = h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0];
  return String(ip || "").trim() || "unknown";
}

// HTML-escape voor alles wat een boeker zelf intypte (naam) of wat de salon
// invulde (dienst, salonnaam) — zelfde als esc() in send-emails. Zonder dit kon
// een naam als <a href=...> als echte link in een Vellu-mail belanden.
const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// "Vandaag" in de tijdzone van de salon: op Bonaire is het om 21:00 lokaal in
// UTC al morgen, en dan telde een afspraak van vanavond al als geweest.
const TZ_BY_COUNTRY: Record<string, string> = {
  NL: "Europe/Amsterdam", BE: "Europe/Brussels", GB: "Europe/London",
  AW: "America/Curacao", CW: "America/Curacao", BQ: "America/Curacao", SX: "America/Curacao",
};
const salonToday = (country: string | null) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ_BY_COUNTRY[country || ""] || "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
};

// Kassaverkoop herkennen, ook zonder is_sale-vlag (zelfde als send-followups).
const isSaleRow = (a: any) =>
  a?.is_sale === true ||
  (!a?.service_id && (parseInt(a?.service_duration) || 0) === 0 && Array.isArray(a?.products) && a.products.length > 0);

// ilike-patroon: `_` en `%` zijn jokers, en `_` komt in e-mailadressen voor.
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const DUTCH_COUNTRIES = ["NL", "BE", "AW", "CW", "BQ", "SX"];
const langFor = (reqLang: unknown, apptLang: string | null, country: string | null) => {
  for (const cand of [reqLang, apptLang]) {
    const l = String(cand || "").toLowerCase();
    if (l === "nl" || l === "en" || l === "es") return l;
  }
  return DUTCH_COUNTRIES.includes(String(country || "NL").toUpperCase()) ? "nl" : "en";
};

const T = {
  nl: {
    subject: (s: string) => `Je reviewlink voor ${s}`,
    hi: (n: string) => n ? `Hoi ${n},` : "Hoi,",
    intro: (s: string) => `Je vroeg op de pagina van <strong>${s}</strong> om je reviewlink. Dit is 'm — hij hoort bij je laatste bezoek:`,
    ask: "Beoordelen kost je een halve minuut. Je kunt je review ook anoniem plaatsen.",
    cta: "Beoordeel je afspraak",
    note: "Niet zelf aangevraagd? Dan kun je deze mail gewoon negeren; zonder de knop gebeurt er niets.",
    at: "om",
  },
  en: {
    subject: (s: string) => `Your review link for ${s}`,
    hi: (n: string) => n ? `Hi ${n},` : "Hi,",
    intro: (s: string) => `You asked for your review link on the page of <strong>${s}</strong>. Here it is — it belongs to your most recent visit:`,
    ask: "It takes half a minute. You can also post your review anonymously.",
    cta: "Rate your appointment",
    note: "Didn't request this? Just ignore this email — nothing happens without the button.",
    at: "at",
  },
  es: {
    subject: (s: string) => `Tu enlace para dejar una reseña en ${s}`,
    hi: (n: string) => n ? `Hola ${n},` : "Hola,",
    intro: (s: string) => `Pediste tu enlace de reseña en la página de <strong>${s}</strong>. Aquí lo tienes — corresponde a tu última visita:`,
    ask: "Te lleva medio minuto. También puedes publicar tu reseña de forma anónima.",
    cta: "Valora tu cita",
    note: "¿No lo pediste tú? Ignora este correo; sin el botón no pasa nada.",
    at: "a las",
  },
} as const;

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);
  if (!RESEND_API_KEY) return json(500, { error: "email_not_configured" }, origin);
  if (!rateLimit(clientIp(req))) return json(429, { error: "rate_limited" }, origin);

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }, origin); }
  const slug = String(body?.salon_slug || "").trim().toLowerCase();
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json(400, { error: "invalid_salon" }, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return json(400, { error: "invalid_email" }, origin);

  // Vanaf hier is elk antwoord hetzelfde (regel 1), en het komt meteen: het
  // opzoeken en mailen gebeurt op de achtergrond, zodat ook de responstijd
  // niet verraadt of het adres klant is. Zonder EdgeRuntime.waitUntil (lokaal)
  // wachten we gewoon, zoals vroeger.
  const taak = verwerk(slug, email, body?.lang).catch((e) => console.error("review link task failed:", e));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(taak);
  else await taak;
  return json(200, { ok: true }, origin);
});

async function verwerk(slug: string, email: string, reqLang: unknown) {
  const { data: salon } = await supabase
    .from("profiles")
    .select("id, business_name, slug, accent_color, country_code")
    .eq("slug", slug)
    .maybeSingle();
  if (!salon) return;

  // Regel 3: verzendingen tellen. Hooguit MAX_PER_DAY verschillende links per
  // adres per salon in 24 uur, geteld op last_sent_at (niet op created_at: een
  // hergebruikte token telde daar nooit mee).
  const pattern = likeEscape(email);
  const now = Date.now();
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { count: recent } = await supabase
    .from("review_tokens")
    .select("token", { count: "exact", head: true })
    .eq("owner_id", salon.id)
    .ilike("client_email", pattern)
    .gte("last_sent_at", since);
  if ((recent || 0) >= MAX_PER_DAY) { console.log("throttled", salon.id); return; }

  // Afgeronde bezoeken: status completed en datum vóór vandaag in de tijdzone
  // van de salon. Jongste eerst.
  const todayStr = salonToday(salon.country_code);
  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select("id, date, time, service_name, client_name, client_email, lang, status, is_sale, service_id, service_duration, products")
    .eq("owner_id", salon.id)
    .ilike("client_email", pattern)
    .lt("date", todayStr)
    .eq("status", "completed")
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .limit(25);
  if (apptErr) { console.error("appointments lookup:", apptErr); return; }
  const candidates = (appts || []).filter((a) => !isSaleRow(a));
  if (candidates.length === 0) return;

  // Al beoordeeld = er staat een review, óf de token van die afspraak is ooit
  // ingewisseld (used_at). Dat tweede vangt een review die de eigenaar daarna
  // heeft verwijderd: die krijgt de klant niet via deze weg een tweede keer.
  const ids = candidates.map((a) => a.id);
  const [{ data: done }, { data: toks }] = await Promise.all([
    supabase.from("reviews").select("appointment_id").in("appointment_id", ids),
    supabase.from("review_tokens").select("appointment_id, token, used_at, expires_at, last_sent_at").in("appointment_id", ids),
  ]);
  const reviewed = new Set((done || []).map((r: any) => r.appointment_id));
  const tokenByAppt = new Map((toks || []).map((t: any) => [t.appointment_id, t]));
  const appt = candidates.find((a) => !reviewed.has(a.id) && !tokenByAppt.get(a.id)?.used_at);
  if (!appt) return;

  // Eén token per afspraak (unique index review_tokens_appointment_uniq):
  // geldig → hergebruiken; verlopen → dezelfde rij verversen met een nieuwe
  // token en einddatum; nog geen rij → aanmaken. Elke verzending stempelt
  // last_sent_at; dezelfde link gaat hooguit één keer per uur weg. Het stempel
  // bij hergebruik is voorwaardelijk (claim), zodat twee gelijktijdige
  // aanvragen niet allebei mailen.
  const nowIso = new Date(now).toISOString();
  const hourAgo = new Date(now - RESEND_AFTER_MS).toISOString();
  const expiresAt = new Date(now + REVIEW_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const existing = tokenByAppt.get(appt.id);
  let token: string;
  if (existing && new Date(existing.expires_at).getTime() > now) {
    token = String(existing.token);
    const { data: claimed, error: claimErr } = await supabase.from("review_tokens")
      .update({ last_sent_at: nowIso })
      .eq("token", existing.token)
      .or(`last_sent_at.is.null,last_sent_at.lt."${hourAgo}"`)
      .select("token");
    if (claimErr) { console.error("review token claim:", claimErr); return; }
    if (!claimed || claimed.length === 0) { console.log("resend too soon", salon.id); return; }
  } else if (existing) {
    if (existing.last_sent_at && new Date(existing.last_sent_at).getTime() > now - RESEND_AFTER_MS) return;
    token = generateToken();
    const { data: refreshed, error: updErr } = await supabase.from("review_tokens")
      .update({ token, expires_at: expiresAt, created_at: nowIso, last_sent_at: nowIso })
      .eq("token", existing.token)
      .select("token");
    if (updErr) { console.error("review token refresh:", updErr); return; }
    if (!refreshed || refreshed.length === 0) return; // een parallelle aanvraag was ons voor
  } else {
    token = generateToken();
    const { error: tokErr } = await supabase.from("review_tokens").insert({
      token, appointment_id: appt.id, owner_id: salon.id, client_email: appt.client_email, expires_at: expiresAt, last_sent_at: nowIso,
    });
    if (tokErr) { console.error("review token insert:", tokErr); return; }
  }

  const salonName = String(salon.business_name || "de salon");
  const eSalon = esc(salonName);
  const accent = /^#[0-9a-f]{6}$/i.test(String(salon.accent_color || "")) ? String(salon.accent_color) : "#c9a96e";
  const lang = langFor(reqLang, appt.lang, salon.country_code) as keyof typeof T;
  const t = T[lang];
  const reviewUrl = `https://vellu.cc/${encodeURIComponent(String(salon.slug || ""))}?review=${token}`;
  const firstName = esc(String(appt.client_name || "").split(/\s+/)[0] || "");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Vellu <noreply@vellu.cc>",
        to: [appt.client_email],
        subject: t.subject(salonName.replace(/[\r\n]+/g, " ")),
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1714;">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="font-size: 24px; font-weight: 300; letter-spacing: 0.18em; color: ${accent};">vellu</div>
            </div>
            <p style="font-size: 16px; margin-bottom: 8px;">${t.hi(firstName)}</p>
            <p style="font-size: 14px; color: #555; line-height: 1.6;">${t.intro(eSalon)}</p>
            <div style="background: #f8f7f5; border-radius: 12px; padding: 16px; margin: 16px 0;">
              <div style="font-weight: 500;">${esc(appt.service_name || "")}</div>
              <div style="font-size: 13px; color: #888; margin-top: 4px;">${esc(appt.date)} ${t.at} ${esc(appt.time || "")}</div>
            </div>
            <p style="font-size: 14px; color: #555; line-height: 1.6;">${t.ask}</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${esc(reviewUrl)}" style="display: inline-block; background: ${accent}; color: #0d0b0a; padding: 14px 32px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase;">${t.cta}</a>
            </div>
            <p style="font-size: 12px; color: #999; line-height: 1.6;">${t.note}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="font-size: 11px; color: #bbb; text-align: center;">
              ${eSalon} via Vellu · <a href="https://vellu.cc" style="color: ${accent}; text-decoration: none;">vellu.cc</a>
            </p>
          </div>`,
      }),
    });
    if (!res.ok) console.error("Resend error:", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("Email send error:", e);
  }
}
