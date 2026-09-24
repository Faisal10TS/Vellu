// supabase/functions/send-source-request/index.ts
// Welkomstmail van Team Vellu aan nieuwe salons (Faisal 24-09-2026). Begon als
// "Hoe heb je Vellu gevonden?" met vijf antwoordknoppen — de database zegt niet
// hoe Mebeauty.nails en Aura Glow Nails ons vonden — maar Faisal wilde geen
// enquête en geen persoonlijke afzender: "a hello welcome to vellu we
// appreciate you for choosing us". Dus: een warm welkom met drie praktische
// tips, en de vraag hoe ze Vellu vonden alleen als één zin aan het eind
// (antwoord = reply, landt in mirahventures@vellu.cc). P.S. met de eigen
// uitnodigingscode en de lopende actie. Afzender altijd "Vellu", ondertekening
// "Team Vellu" — nooit een persoonsnaam (zie geheugen feedback_no_faisal_name).
//
// Zelfde opzet en beveiliging als send-rating-request (verify_jwt=false in
// config.toml, de functie controleert zelf):
//   1. vellu.cc/admin (beheerder, app_admins): Authorization = gebruikers-JWT;
//      body { mode, only_owners?, test_to?, test_lang? }. Opdrachtrij = logboek.
//   2. Opdracht via SQL: insert in app_source_send_jobs → POST { job_id,
//      secret }. Alleen een bestaande, nog niet gestarte opdracht met kloppend
//      geheim wordt uitgevoerd.
// Modi:
//   test    → één voorbeeldmail (demo-salon als voorbeeld) naar test_to
//             (meerdere adressen met komma) in test_lang (nl of en)
//   dry_run → alleen de ontvangerslijst
//   send    → echt versturen; zonder only_owners alle actieve niet-demo salons
//             die de mail nog niet kregen, met only_owners precies die salons.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE = "https://vellu.cc";
const FROM_ADDRESS = "noreply@vellu.cc";
const REPLY_TO = "mirahventures@vellu.cc";
const ALLOWED_ORIGINS = ["https://vellu.cc", "https://www.vellu.cc", "http://localhost:5173", "http://localhost:4173"];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUTCH = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const langOf = (cc: unknown): "nl" | "en" => (DUTCH.has(String(cc || "NL")) ? "nl" : "en");

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

type Promo = { until: Date; days: number } | null;
type Salon = { salon: string; slug: string; code: string; promo: Promo };

function render(lang: "nl" | "en", o: Salon) {
  const eSalon = esc(o.salon), eCode = esc(o.code);
  const pageUrl = `${SITE}/${o.slug}`;
  const refLink = `${SITE}/?ref=${encodeURIComponent(o.code)}`;
  const promoDate = o.promo ? new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long" }).format(o.promo.until) : "";
  const link = (url: string, label = url) => `<a href="${esc(url)}" style="color:#8A7356;">${esc(label)}</a>`;
  const t = lang === "nl" ? {
    subject: `Welkom bij Vellu, ${o.salon}`,
    hi: `Hoi ${eSalon},`,
    p1: "Welkom bij Vellu! Fijn dat je voor Vellu hebt gekozen, dat waarderen we enorm. Vanaf nu kunnen je klanten dag en nacht bij je boeken, en jij houdt je agenda, je klanten en je betalingen op één plek.",
    tipsTitle: "Zo haal je er meteen het meeste uit",
    tips: [
      `Je boekingspagina staat klaar op ${link(pageUrl, pageUrl.replace("https://", ""))}. Zet de link in je Instagram-bio en je WhatsApp-status, dan boeken klanten zelf.`,
      "Diensten, prijzen, foto's en je team regel je onder Instellingen. Alles wat je daar aanpast staat meteen op je boekingspagina.",
      "Vragen? De helpchat in je dashboard geeft direct antwoord, en op deze mail reageren kan altijd.",
    ],
    ask: "Eén vraagje nog, omdat we graag weten wat werkt: hoe heb je Vellu gevonden? Een korte reply is genoeg.",
    close: "Veel succes, en nogmaals welkom!",
    team: "Team Vellu",
    ps: `P.S. Ken je een salon die Vellu ook goed kan gebruiken? Deel je uitnodigingscode <strong>${eCode}</strong> of de link ${link(refLink)}. ${o.promo ? `Tot en met ${esc(promoDate)} krijgen jullie dan allebei een maand gratis.` : "Jullie krijgen dan allebei twee weken gratis."}`,
    plain: `Hoi ${o.salon},\n\nWelkom bij Vellu! Fijn dat je voor Vellu hebt gekozen, dat waarderen we enorm. Vanaf nu kunnen je klanten dag en nacht bij je boeken, en jij houdt je agenda, je klanten en je betalingen op één plek.\n\nZo haal je er meteen het meeste uit:\n- Je boekingspagina staat klaar op ${pageUrl}. Zet de link in je Instagram-bio en je WhatsApp-status, dan boeken klanten zelf.\n- Diensten, prijzen, foto's en je team regel je onder Instellingen. Alles wat je daar aanpast staat meteen op je boekingspagina.\n- Vragen? De helpchat in je dashboard geeft direct antwoord, en op deze mail reageren kan altijd.\n\nEén vraagje nog, omdat we graag weten wat werkt: hoe heb je Vellu gevonden? Een korte reply is genoeg.\n\nVeel succes, en nogmaals welkom!\nTeam Vellu\nvellu.cc\n\nP.S. Ken je een salon die Vellu ook goed kan gebruiken? Deel je uitnodigingscode ${o.code} of de link ${refLink}. ${o.promo ? `Tot en met ${promoDate} krijgen jullie dan allebei een maand gratis.` : "Jullie krijgen dan allebei twee weken gratis."}`,
  } : {
    subject: `Welcome to Vellu, ${o.salon}`,
    hi: `Hi ${eSalon},`,
    p1: "Welcome to Vellu! Thank you for choosing Vellu, we truly appreciate it. From now on your clients can book with you day and night, and you keep your calendar, your clients and your payments in one place.",
    tipsTitle: "Get the most out of it from day one",
    tips: [
      `Your booking page is ready at ${link(pageUrl, pageUrl.replace("https://", ""))}. Put the link in your Instagram bio and your WhatsApp status, and clients book by themselves.`,
      "Services, prices, photos and your team are all under Settings. Whatever you change there shows up on your booking page right away.",
      "Questions? The help chat in your dashboard answers straight away, and you can always reply to this email.",
    ],
    ask: "One small question, because we love to know what works: how did you find Vellu? A short reply is all it takes.",
    close: "Good luck, and welcome once more!",
    team: "Team Vellu",
    ps: `P.S. Know a salon that could use Vellu too? Share your invitation code <strong>${eCode}</strong> or the link ${link(refLink)}. ${o.promo ? `Until ${esc(promoDate)} you both get a month free.` : "You both get two weeks free."}`,
    plain: `Hi ${o.salon},\n\nWelcome to Vellu! Thank you for choosing Vellu, we truly appreciate it. From now on your clients can book with you day and night, and you keep your calendar, your clients and your payments in one place.\n\nGet the most out of it from day one:\n- Your booking page is ready at ${pageUrl}. Put the link in your Instagram bio and your WhatsApp status, and clients book by themselves.\n- Services, prices, photos and your team are all under Settings. Whatever you change there shows up on your booking page right away.\n- Questions? The help chat in your dashboard answers straight away, and you can always reply to this email.\n\nOne small question, because we love to know what works: how did you find Vellu? A short reply is all it takes.\n\nGood luck, and welcome once more!\nTeam Vellu\nvellu.cc\n\nP.S. Know a salon that could use Vellu too? Share your invitation code ${o.code} or the link ${refLink}. ${o.promo ? `Until ${promoDate} you both get a month free.` : "You both get two weeks free."}`,
  };
  const tips = t.tips.map((tip) => `<li style="margin:0 0 10px;">${tip}</li>`).join("");
  const html = `<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
  <div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:#8A7356;margin:12px auto;"></div></div>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${t.hi}</p>
  <p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#333;">${t.p1}</p>
  <div style="background:#f9f7f4;border-radius:12px;padding:20px 22px 12px;margin:0 0 24px;">
    <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:600;color:#8A7356;margin:0 0 12px;">${t.tipsTitle}</p>
    <ul style="font-size:14px;line-height:1.7;color:#333;margin:0;padding:0 0 0 18px;">${tips}</ul>
  </div>
  <p style="font-size:14px;line-height:1.7;margin:0 0 24px;color:#333;">${t.ask}</p>
  <p style="font-size:15px;line-height:1.7;margin:0;">${t.close}<br><strong>${t.team}</strong><br><span style="color:#888;font-size:13px;">vellu.cc</span></p>
  <div style="border-top:1px solid #e8e0d5;margin-top:28px;padding-top:16px;font-size:13px;line-height:1.7;color:#555;">${t.ps}</div>
  <div style="border-top:1px solid #e8e0d5;margin-top:24px;padding-top:14px;font-size:12px;color:#888;line-height:1.6;">${REPLY_TO}</div>
</div>`;
  return { subject: t.subject, fromName: "Vellu", html, text: t.plain };
}

async function sendResend(to: string[], fromName: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) return { ok: false, status: 0, body: "RESEND_API_KEY ontbreekt" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${fromName} <${FROM_ADDRESS}>`, to, reply_to: REPLY_TO, subject, html, text }),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
}

// Lopende referral-actie (referral_promos), anders de standaard van twee weken.
async function activePromo(): Promise<Promo> {
  const now = new Date().toISOString();
  const { data } = await supabase.from("referral_promos").select("ends_at, reward_days").lte("starts_at", now).gte("ends_at", now).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  return data?.ends_at ? { until: new Date(data.ends_at), days: Number(data.reward_days) || 30 } : null;
}

async function stateFor(ownerId: string): Promise<{ sent_at: string | null; sent_count: number }> {
  const { data } = await supabase.from("app_source_requests").select("sent_at, sent_count").eq("owner_id", ownerId).maybeSingle();
  if (data) return data;
  await supabase.from("app_source_requests").insert({ owner_id: ownerId });
  return { sent_at: null, sent_count: 0 };
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt.length < 20) return false;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user?.id) return false;
  const { data: adm } = await supabase.from("app_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return !!adm;
}

async function runJob(job: any): Promise<{ result: any; status: number }> {
  const promo = await activePromo();
  if (job.mode === "test") {
    const to = String(job.test_to || "delivered@resend.dev").split(",").map((x) => x.trim().toLowerCase()).filter((x) => EMAIL_RE.test(x));
    if (!to.length) return { result: { error: "invalid_test_to" }, status: 400 };
    const lang: "nl" | "en" = job.test_lang === "en" ? "en" : "nl";
    // Tijd in het onderwerp: elke testmail een eigen conversatie in Gmail.
    const stamp = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date());
    // Voorbeeldsalon = de demo-salon, zodat naam, link en code echt zijn maar
    // niemands klantgegevens in een testmail belanden.
    let sample: Salon = { salon: lang === "nl" ? "Jouw Salon" : "Your Salon", slug: "jouw-salon", code: "VOORBEELD", promo };
    const { data: demo } = await supabase.from("profiles").select("business_name, slug, referral_code").eq("is_demo", true).order("created_at").limit(1).maybeSingle();
    if (demo?.business_name) sample = { salon: String(demo.business_name).trim(), slug: String(demo.slug || "jouw-salon"), code: String(demo.referral_code || "VOORBEELD"), promo };
    const m = render(lang, sample);
    const r = await sendResend(to, m.fromName, `[TEST ${lang} ${stamp}] ${m.subject}`, m.html, m.text);
    return { result: { mode: "test", to, lang, sent: r.ok ? 1 : 0, results: [{ lang, to, subject: m.subject, ok: r.ok, status: r.status, body: r.ok ? undefined : r.body, html: m.html, text: m.text }] }, status: 200 };
  }

  const only: string[] = Array.isArray(job.only_owners) ? job.only_owners.map((x: unknown) => String(x)) : [];
  const { data: salons, error } = await supabase
    .from("profiles")
    .select("id, business_name, slug, email, salon_email, country_code, referral_code, subscription_status, is_demo")
    .eq("is_demo", false)
    .in("subscription_status", ["active", "trialing"]);
  if (error) return { result: { error: error.message }, status: 500 };

  const list: any[] = [];
  const skipped: any[] = [];
  for (const s of (salons || []).filter((x: any) => only.length === 0 || only.includes(x.id))) {
    const to = String(s.salon_email || s.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(to)) { skipped.push({ id: s.id, salon: s.business_name || "", reason: "geen geldig e-mailadres" }); continue; }
    if (!s.slug) { skipped.push({ id: s.id, salon: s.business_name || "", reason: "geen slug (boekingspagina)" }); continue; }
    const st = await stateFor(s.id);
    if (job.mode === "send" && only.length === 0 && st.sent_at) { skipped.push({ id: s.id, salon: s.business_name || "", reason: "al verstuurd", sent_at: st.sent_at }); continue; }
    list.push({ id: s.id, salon: String(s.business_name || "").trim(), slug: String(s.slug), code: String(s.referral_code || ""), to, lang: langOf(s.country_code), sent_count: st.sent_count || 0 });
  }

  if (job.mode === "dry_run") return { result: { mode: "dry_run", count: list.length, recipients: list, skipped }, status: 200 };

  const results: any[] = [];
  for (const r of list) {
    const m = render(r.lang, { salon: r.salon, slug: r.slug, code: r.code, promo });
    const sent = await sendResend([r.to], m.fromName, m.subject, m.html, m.text);
    if (sent.ok) await supabase.from("app_source_requests").update({ sent_at: new Date().toISOString(), sent_count: r.sent_count + 1 }).eq("owner_id", r.id);
    results.push({ id: r.id, salon: r.salon, to: r.to, lang: r.lang, ok: sent.ok, status: sent.status, body: sent.ok ? undefined : sent.body });
    await new Promise((res) => setTimeout(res, 400));
  }
  return { result: { mode: "send", sent: results.filter((x) => x.ok).length, results, skipped }, status: 200 };
}

serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  let job: any = null;
  if (body?.job_id) {
    const jobId = String(body.job_id || "");
    const secret = String(body.secret || "");
    if (!UUID_RE.test(jobId) || secret.length < 20) return json({ error: "unauthorized" }, 401);
    const { data: found } = await supabase.from("app_source_send_jobs").select("*").eq("id", jobId).is("started_at", null).maybeSingle();
    if (!found || found.secret !== secret) return json({ error: "unauthorized" }, 401);
    const { data: claimed } = await supabase.from("app_source_send_jobs").update({ started_at: new Date().toISOString() }).eq("id", jobId).is("started_at", null).select("*").maybeSingle();
    if (!claimed) return json({ error: "already_started" }, 409);
    job = claimed;
  } else {
    if (!(await callerIsAdmin(req))) return json({ error: "unauthorized" }, 401);
    const mode = ["test", "dry_run", "send"].includes(body?.mode) ? body.mode : null;
    if (!mode) return json({ error: "invalid_mode" }, 400);
    const testTo = mode === "test" ? String(body?.test_to || "").trim().toLowerCase() : null;
    if (mode === "test" && !testTo!.split(",").every((x) => EMAIL_RE.test(x.trim()))) return json({ error: "invalid_test_to" }, 400);
    const only = Array.isArray(body?.only_owners) ? body.only_owners.map((x: unknown) => String(x)).filter((x: string) => UUID_RE.test(x)) : [];
    const testLang = body?.test_lang === "en" ? "en" : "nl";
    const { data: made, error } = await supabase.from("app_source_send_jobs")
      .insert({ mode, test_to: testTo, test_lang: testLang, only_owners: only.length ? only : null, started_at: new Date().toISOString() })
      .select("*").single();
    if (error || !made) return json({ error: error?.message || "job_failed" }, 500);
    job = made;
  }

  const { result, status } = await runJob(job);
  await supabase.from("app_source_send_jobs").update({ finished_at: new Date().toISOString(), result }).eq("id", job.id);
  if (result?.results && job.mode === "test" && !body?.job_id) result.results = result.results.map((r: any) => ({ ...r, html: undefined, text: undefined }));
  return json(result, status);
});
