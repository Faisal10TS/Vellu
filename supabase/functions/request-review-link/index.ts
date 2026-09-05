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
//  2. ALLEEN AFGERONDE BEZOEKEN, geen kassaverkopen — zelfde selectie als
//     send-followups. De jongste afspraak zonder review wint; een nog geldige,
//     ongebruikte token voor die afspraak wordt hergebruikt.
//  3. MAX 3 MAILS PER ADRES PER SALON PER 24 UUR, geteld op review_tokens.
//     Wie de knop spamt, spamt alleen zijn eigen inbox — en ook dat begrensd.
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

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }, origin); }
  const slug = String(body?.salon_slug || "").trim().toLowerCase();
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json(400, { error: "invalid_salon" }, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return json(400, { error: "invalid_email" }, origin);

  // Vanaf hier is elk antwoord hetzelfde (regel 1).
  const generic = () => json(200, { ok: true }, origin);

  const { data: salon } = await supabase
    .from("profiles")
    .select("id, business_name, slug, accent_color, country_code")
    .eq("slug", slug)
    .maybeSingle();
  if (!salon) return generic();

  const pattern = likeEscape(email);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recent } = await supabase
    .from("review_tokens")
    .select("token", { count: "exact", head: true })
    .eq("owner_id", salon.id)
    .ilike("client_email", pattern)
    .gte("created_at", since);
  if ((recent || 0) >= MAX_PER_DAY) { console.log("throttled", salon.id); return generic(); }

  // Afgeronde bezoeken: datum vóór vandaag (zelfde grens als send-followups),
  // niet geannuleerd/no-show. Jongste eerst.
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select("id, date, time, service_name, client_name, client_email, lang, status, is_sale, service_id, service_duration, products")
    .eq("owner_id", salon.id)
    .ilike("client_email", pattern)
    .lt("date", todayStr)
    .not("status", "in", '("cancelled","no_show")')
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .limit(25);
  if (apptErr) { console.error("appointments lookup:", apptErr); return generic(); }
  const candidates = (appts || []).filter((a) => !isSaleRow(a));
  if (candidates.length === 0) return generic();

  // Al beoordeeld = er staat een review, óf de token van die afspraak is ooit
  // ingewisseld (used_at). Dat tweede vangt een review die de eigenaar daarna
  // heeft verwijderd: die krijgt de klant niet via deze weg een tweede keer.
  const ids = candidates.map((a) => a.id);
  const [{ data: done }, { data: toks }] = await Promise.all([
    supabase.from("reviews").select("appointment_id").in("appointment_id", ids),
    supabase.from("review_tokens").select("appointment_id, token, used_at, expires_at").in("appointment_id", ids),
  ]);
  const reviewed = new Set((done || []).map((r: any) => r.appointment_id));
  const tokenByAppt = new Map((toks || []).map((t: any) => [t.appointment_id, t]));
  const appt = candidates.find((a) => !reviewed.has(a.id) && !tokenByAppt.get(a.id)?.used_at);
  if (!appt) return generic();

  // Eén token per afspraak (unique index review_tokens_appointment_uniq):
  // geldig → hergebruiken; verlopen → dezelfde rij verversen met een nieuwe
  // token en einddatum; nog geen rij → aanmaken.
  const expiresAt = new Date(Date.now() + REVIEW_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const existing = tokenByAppt.get(appt.id);
  let token: string;
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    token = String(existing.token);
  } else if (existing) {
    token = generateToken();
    const { error: updErr } = await supabase.from("review_tokens")
      .update({ token, expires_at: expiresAt, created_at: new Date().toISOString() })
      .eq("token", existing.token);
    if (updErr) { console.error("review token refresh:", updErr); return generic(); }
  } else {
    token = generateToken();
    const { error: tokErr } = await supabase.from("review_tokens").insert({
      token, appointment_id: appt.id, owner_id: salon.id, client_email: appt.client_email, expires_at: expiresAt,
    });
    if (tokErr) { console.error("review token insert:", tokErr); return generic(); }
  }

  const salonName = String(salon.business_name || "de salon");
  const accent = /^#[0-9a-f]{6}$/i.test(String(salon.accent_color || "")) ? String(salon.accent_color) : "#c9a96e";
  const lang = langFor(body?.lang, appt.lang, salon.country_code) as keyof typeof T;
  const t = T[lang];
  const reviewUrl = `https://vellu.cc/${salon.slug}?review=${token}`;
  const firstName = String(appt.client_name || "").split(/\s+/)[0] || "";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Vellu <noreply@vellu.cc>",
        to: [appt.client_email],
        subject: t.subject(salonName),
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1714;">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="font-size: 24px; font-weight: 300; letter-spacing: 0.18em; color: ${accent};">vellu</div>
            </div>
            <p style="font-size: 16px; margin-bottom: 8px;">${t.hi(firstName)}</p>
            <p style="font-size: 14px; color: #555; line-height: 1.6;">${t.intro(salonName)}</p>
            <div style="background: #f8f7f5; border-radius: 12px; padding: 16px; margin: 16px 0;">
              <div style="font-weight: 500;">${appt.service_name || ""}</div>
              <div style="font-size: 13px; color: #888; margin-top: 4px;">${appt.date} ${t.at} ${appt.time || ""}</div>
            </div>
            <p style="font-size: 14px; color: #555; line-height: 1.6;">${t.ask}</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${reviewUrl}" style="display: inline-block; background: ${accent}; color: #0d0b0a; padding: 14px 32px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase;">${t.cta}</a>
            </div>
            <p style="font-size: 12px; color: #999; line-height: 1.6;">${t.note}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="font-size: 11px; color: #bbb; text-align: center;">
              ${salonName} via Vellu · <a href="https://vellu.cc" style="color: ${accent}; text-decoration: none;">vellu.cc</a>
            </p>
          </div>`,
      }),
    });
    if (!res.ok) console.error("Resend error:", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("Email send error:", e);
  }
  return generic();
});
