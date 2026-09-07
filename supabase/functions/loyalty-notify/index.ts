// supabase/functions/loyalty-notify/index.ts
//
// Stempelkaart, stap 2. Stap 1 is de database-trigger appointments_loyalty_stamp:
// die maakt bij de N-de afronding een persoonlijke code aan (kind = 'loyalty',
// notified_at = null). Deze functie maakt het af: mail naar de klant, push naar
// de eigenaar, notified_at zetten. Twee aanroepers:
//   - de app, direct na "Voltooid" (user-JWT van de eigenaar of een medewerker
//     van die salon) — het antwoord vertelt of er voor déze klant net iets is
//     uitgedeeld, zodat de app een toast kan tonen;
//   - send-followups, dagelijks als vangnet (x-internal-secret), voor alle salons.
// Idempotent: alleen rijen met notified_at = null worden aangeraakt.

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeImg(url: unknown): string | null {
  if (!url || typeof url !== "string") return null;
  try { const u = new URL(url); return (u.protocol === "https:" || u.protocol === "http:") ? u.toString() : null; } catch { return null; }
}
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const langFor = (apptLang: unknown, country: unknown) => {
  const l = String(apptLang || "").toLowerCase();
  if (l === "nl" || l === "en" || l === "es") return l;
  return DUTCH_COUNTRIES.has(String(country || "NL").toUpperCase()) ? "nl" : "en";
};
const txt = (lang: string, nl: string, en: string, es: string) => lang === "en" ? en : lang === "es" ? es : nl;
const ordinal = (lang: string, n: number) => lang === "en" ? `${n}${[, "st", "nd", "rd"][(n % 10 > 3 || Math.floor(n % 100 / 10) === 1) ? 0 : n % 10] || "th"}` : lang === "es" ? `${n}.ª` : `${n}e`;
const fmtDate = (lang: string, iso: string) => {
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
  catch { return iso; }
};

function renderHtml(o: { salonName: string; logo: string | null; accent: string; firstName: string; code: string; pct: number; visits: number; expires: string; slug: string; lang: string }) {
  const { salonName, logo, accent, firstName, code, pct, visits, expires, slug, lang } = o;
  const header = logo
    ? `<div style="text-align:center;margin-bottom:28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:separate;"><tr><td style="background:#ffffff;border-radius:14px;padding:14px 18px;text-align:center;"><img src="${esc(logo)}" alt="${esc(salonName)}" style="width:auto;height:auto;max-width:180px;display:block;border:0;" /></td></tr></table></div>`
    : `<div style="text-align:center;margin-bottom:28px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;color:#1a1a1a;">${esc(salonName)}</h1></div>`;
  const link = slug ? `https://vellu.cc/${esc(slug)}` : "";
  const heading = txt(lang,
    `Je ${ordinal(lang, visits)} bezoek${firstName ? `, ${firstName}` : ""}!`,
    `Your ${ordinal(lang, visits)} visit${firstName ? `, ${firstName}` : ""}!`,
    `¡Tu ${ordinal(lang, visits)} visita${firstName ? `, ${firstName}` : ""}!`);
  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#1a1a1a;background:#ffffff;">
    ${header}
    <div style="width:40px;height:1px;background:${esc(accent)};margin:0 auto 28px;"></div>
    <h1 style="font-size:26px;font-weight:600;margin:0 0 14px;text-align:center;color:#1a1a1a;">${esc(heading)}</h1>
    <p style="font-size:15px;line-height:1.7;color:#333;margin:0 0 24px;text-align:center;">
      ${txt(lang,
        `Je stempelkaart bij <strong>${esc(salonName)}</strong> is vol. Als dank: ${pct}% korting op je volgende afspraak.`,
        `Your loyalty card at <strong>${esc(salonName)}</strong> is full. As a thank-you: ${pct}% off your next appointment.`,
        `Tu tarjeta de fidelidad en <strong>${esc(salonName)}</strong> está completa. Como agradecimiento: ${pct}% de descuento en tu próxima cita.`)}
    </p>
    <div style="background:#f9f7f4;border-radius:14px;padding:22px;text-align:center;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#999;margin-bottom:6px;">${txt(lang, "Jouw code", "Your code", "Tu código")}</div>
      <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:${esc(accent)};">${esc(code)}</div>
      <div style="font-size:12px;color:#666;margin-top:8px;">${txt(lang, `${pct}% korting · geldig tot ${expires}`, `${pct}% off · valid until ${expires}`, `${pct}% de descuento · válido hasta ${expires}`)}</div>
    </div>
    <p style="font-size:13px;color:#666;text-align:center;line-height:1.6;margin:0 0 24px;">
      ${txt(lang, "Vul de code in bij het boeken (bij 'Heb je een kortingscode?') of noem hem in de salon.", "Enter the code when booking (under 'Have a discount code?') or mention it in the salon.", "Introduce el código al reservar (en '¿Tienes un código de descuento?') o dilo en el salón.")}
    </p>
    ${link ? `<div style="text-align:center;margin-bottom:24px;"><a href="${link}" style="display:inline-block;background:${esc(accent)};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-size:13px;font-weight:600;letter-spacing:0.06em;">${txt(lang, "Boek nu", "Book now", "Reservar ahora")}</a></div>` : ""}
    <p style="font-size:12px;color:#999;text-align:center;line-height:1.5;margin:0;">${txt(lang, "Bedankt dat je steeds terugkomt — tot snel!", "Thank you for coming back — see you soon!", "Gracias por volver siempre — ¡hasta pronto!")}</p>
  </div>`;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);
  if (!RESEND_API_KEY) return json(500, { error: "email_not_configured" }, origin);

  // ── Wie roept? ──
  let ownerScope: string | null = null; // null = alle salons (alleen intern)
  const internal = req.headers.get("x-internal-secret");
  if (internal && internal === SUPABASE_SERVICE_KEY) {
    ownerScope = null;
  } else {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "unauthorized" }, origin);
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (userErr || !uid) return json(401, { error: "unauthorized" }, origin);
    const { data: prof } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
    if (prof) ownerScope = prof.id;
    else {
      const { data: st } = await supabase.from("staff_members").select("owner_id").eq("user_id", uid).limit(1);
      if (!st || st.length === 0) return json(403, { error: "forbidden" }, origin);
      ownerScope = st[0].owner_id;
    }
  }

  let q = supabase
    .from("birthday_discount_codes")
    .select("id, owner_id, code, client_email, discount_pct, expires_on, visits_at, reward_no")
    .eq("kind", "loyalty")
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(25);
  if (ownerScope) q = q.eq("owner_id", ownerScope);
  const { data: rows, error: rowsErr } = await q;
  if (rowsErr) { console.error("loyalty rows:", rowsErr); return json(500, { error: "db_error" }, origin); }

  const sent: any[] = [];
  const salonCache = new Map<string, any>();
  for (const row of rows || []) {
    let salon = salonCache.get(row.owner_id);
    if (!salon) {
      const { data } = await supabase.from("profiles")
        .select("id, business_name, slug, accent_color, logo_url, country_code, email, salon_email, loyalty_visits, loyalty_discount_pct")
        .eq("id", row.owner_id).maybeSingle();
      salon = data; salonCache.set(row.owner_id, data);
    }
    if (!salon) continue;
    // Naam + taal van de klant: uit haar laatste afgeronde afspraak.
    const { data: appts } = await supabase.from("appointments")
      .select("client_name, lang")
      .eq("owner_id", row.owner_id).ilike("client_email", row.client_email.replace(/[\\%_]/g, (m: string) => `\\${m}`))
      .eq("status", "completed").order("date", { ascending: false }).order("time", { ascending: false }).limit(1);
    const appt: any = appts?.[0] || {};
    const lang = langFor(appt.lang, salon.country_code);
    const salonName = String(salon.business_name || "de salon");
    const accent = /^#[0-9a-fA-F]{6}$/.test(String(salon.accent_color || "")) ? String(salon.accent_color) : "#c9a96e";
    const firstName = String(appt.client_name || "").split(/\s+/)[0] || "";
    const pct = Number(row.discount_pct) || 0;
    const visits = Number(row.visits_at) || Number(salon.loyalty_visits) || 0;
    const expires = fmtDate(lang, String(row.expires_on));

    let mailed = false;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${salonName} <noreply@vellu.cc>`,
          to: [row.client_email],
          ...(salon.salon_email || salon.email ? { reply_to: salon.salon_email || salon.email } : {}),
          subject: txt(lang, `Je stempelkaart bij ${salonName} is vol — ${pct}% korting`, `Your loyalty card at ${salonName} is full — ${pct}% off`, `Tu tarjeta en ${salonName} está completa — ${pct}% de descuento`),
          html: renderHtml({ salonName, logo: safeImg(salon.logo_url), accent, firstName, code: row.code, pct, visits, expires, slug: String(salon.slug || ""), lang }),
        }),
      });
      if (res.ok) mailed = true;
      else console.error("Resend error:", res.status, await res.text().catch(() => ""));
    } catch (e) { console.error("Loyalty mail failed:", e); }
    if (!mailed) continue; // volgende keer opnieuw (send-followups veegt dagelijks)

    await supabase.from("birthday_discount_codes").update({ notified_at: new Date().toISOString() }).eq("id", row.id);

    // Eigenaar melden (push; geen abonnement = de functie doet niets).
    const nlOwner = DUTCH_COUNTRIES.has(String(salon.country_code || "NL").toUpperCase());
    const who = appt.client_name || row.client_email;
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY },
        body: JSON.stringify({
          user_id: row.owner_id,
          title: nlOwner ? "Stempelkaart vol" : "Loyalty card full",
          body: nlOwner ? `${who} verdiende ${pct}% korting (code ${row.code}) — gemaild` : `${who} earned ${pct}% off (code ${row.code}) — emailed`,
          url: "/owner",
          tag: `loyalty-${row.id}`,
        }),
      });
    } catch (e) { console.error("Loyalty push failed:", e); }

    sent.push({ code: row.code, client_email: row.client_email, client_name: appt.client_name || "", pct, visits, expires_on: row.expires_on });
  }
  return json(200, { sent }, origin);
});
