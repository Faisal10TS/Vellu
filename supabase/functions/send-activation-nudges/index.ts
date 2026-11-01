// supabase/functions/send-activation-nudges/index.ts
// ACTIVATIEMAILS van Team Vellu (Faisal 01-11-2026, "Automatic emails"). De
// analyse die dag: 7 van de 14 salons liepen vast, op twee plekken.
//   no_services  2 dagen na aanmelden nog geen zichtbare dienst → mail "zet je
//                behandelingen erop met één foto", knop naar Prijslijst
//                inlezen (vellu.cc/owner?tab=services&pricelist=1).
//   no_bookings  4 dagen na aanmelden wél diensten, maar hooguit één afspraak
//                (vaak een eigen test) → drie manieren om de link bij klanten
//                te krijgen, knop naar de eigen boekingspagina.
// Regels:
//   - elke soort hooguit één keer per salon (activation_nudges, PK owner+kind);
//   - alleen tijdens een lopende proef of een actief abonnement: na een
//     verlopen proef staat het dashboard op pauze en kan de salon er niets mee;
//   - alleen salons die korter dan 30 dagen geleden zijn aangemeld, dus geen
//     inhaalronde voor oude accounts;
//   - nooit demo of gedeactiveerd, altijd een geldig adres en een slug.
// Geen proefverlenging (Faisal 01-11: "we are not extending the trial unless
// i say so"). Engels voor iedereen, net als de welkomstmail (MAIL_LANG).
// Afzender "Vellu", ondertekening "Team Vellu", nooit een persoonsnaam;
// reply-to mirahventures@vellu.cc.
//
// Aanroepen (verify_jwt=false in config.toml, de functie controleert zelf):
//   1. pg_cron-job send-activation-nudges-daily met x-cron-secret (vault, via
//      rpc cron_secret_ok) → mode send. Die job komt pas na Faisals akkoord.
//   2. Opdracht via SQL: insert into activation_nudge_jobs (mode, test_to |
//      only_owners) returning id, secret → POST { job_id, secret }.
// Modi:
//   test    → beide mails (demo-salon als voorbeeld) naar test_to
//   dry_run → wie nu welke mail zou krijgen, en waarom de rest niet
//   send    → echt versturen (met only_owners alleen die salons)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const SITE = "https://vellu.cc";
const FROM_ADDRESS = "noreply@vellu.cc";
const REPLY_TO = "mirahventures@vellu.cc";
const MAIL_LANG: "nl" | "en" = "en";

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_SERVICES_AFTER_DAYS = 2;
const NO_BOOKINGS_AFTER_DAYS = 4;
const MAX_ACCOUNT_AGE_DAYS = 30;
const KINDS = ["no_services", "no_bookings"] as const;
type Kind = typeof KINDS[number];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Zelfde controle als send-renewal-reminder c.s.
async function cronAuthorized(req: Request): Promise<boolean> {
  const internal = req.headers.get("x-internal-secret") || "";
  if (internal && internal === SUPABASE_SERVICE_KEY) return true;
  const cron = req.headers.get("x-cron-secret") || "";
  if (!cron) return false;
  if (CRON_SECRET && cron === CRON_SECRET) return true;
  try {
    const { data, error } = await supabase.rpc("cron_secret_ok", { p_secret: cron });
    return !error && data === true;
  } catch { return false; }
}

type Salon = { salon: string; slug: string };

function render(kind: Kind, lang: "nl" | "en", o: Salon) {
  const eSalon = esc(o.salon);
  const pageUrl = `${SITE}/${o.slug}`;
  const pageLabel = pageUrl.replace("https://", "");
  const link = (url: string, label = url) => `<a href="${esc(url)}" style="color:#8A7356;">${esc(label)}</a>`;
  const button = (url: string, label: string) => `<p style="margin:0 0 24px;"><a href="${esc(url)}" style="display:inline-block;background:#8A7356;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.04em;padding:13px 26px;border-radius:8px;">${esc(label)}</a></p>`;
  const nl = lang === "nl";
  let t: { subject: string; paras: string[]; tipsTitle?: string; tips?: string[]; btnUrl: string; btnLabel: string; after?: string; plain: string };
  if (kind === "no_services") {
    const importUrl = `${SITE}/owner?tab=services&pricelist=1`;
    t = nl ? {
      subject: "Zet je behandelingen op Vellu met één foto",
      paras: [
        "Je Vellu-account staat klaar, maar op je boekingspagina staan nog geen behandelingen. Daardoor kunnen klanten nog niet bij je boeken.",
        "De snelste manier: maak een foto van je prijslijst (of kies een pdf) en Vellu leest hem voor je in. Je krijgt de hele lijst met prijzen en tijden te zien, controleert hem en zet alles in één keer op je pagina.",
      ],
      btnUrl: importUrl, btnLabel: "Prijslijst uploaden",
      after: "Liever één voor één? Dat kan onder Instellingen, Diensten.",
      plain: `Hoi ${o.salon},\n\nJe Vellu-account staat klaar, maar op je boekingspagina staan nog geen behandelingen. Daardoor kunnen klanten nog niet bij je boeken.\n\nDe snelste manier: maak een foto van je prijslijst (of kies een pdf) en Vellu leest hem voor je in. Je krijgt de hele lijst met prijzen en tijden te zien, controleert hem en zet alles in één keer op je pagina.\n\nPrijslijst uploaden: ${importUrl}\n\nLiever één voor één? Dat kan onder Instellingen, Diensten.\n\nVragen? Reageer gewoon op deze mail.\n\nTeam Vellu\nvellu.cc`,
    } : {
      subject: "Put your treatments on Vellu with one photo",
      paras: [
        "Your Vellu account is ready, but your booking page doesn't show any treatments yet, so clients can't book with you.",
        "The quickest way: take a photo of your price list (or choose a PDF) and Vellu reads it for you. You see the whole list with prices and times, check it, and add everything to your page in one go.",
      ],
      btnUrl: importUrl, btnLabel: "Upload my price list",
      after: "Prefer to add them one by one? You can do that under Settings, Services.",
      plain: `Hi ${o.salon},\n\nYour Vellu account is ready, but your booking page doesn't show any treatments yet, so clients can't book with you.\n\nThe quickest way: take a photo of your price list (or choose a PDF) and Vellu reads it for you. You see the whole list with prices and times, check it, and add everything to your page in one go.\n\nUpload my price list: ${importUrl}\n\nPrefer to add them one by one? You can do that under Settings, Services.\n\nQuestions? Just reply to this email.\n\nTeam Vellu\nvellu.cc`,
    };
  } else {
    t = nl ? {
      subject: "Zo komen je eerste boekingen via Vellu binnen",
      paras: [
        `Je behandelingen staan op Vellu, goed bezig! Nu moeten je klanten je boekingspagina nog vinden: ${link(pageUrl, pageLabel)}`,
      ],
      tipsTitle: "Drie tips om te beginnen",
      tips: [
        "Zet de link overal waar klanten je vinden: in je bio op Instagram of TikTok, op je Facebook-pagina, in je WhatsApp-status, je Google-bedrijfsprofiel of je eigen website. Wie hem ziet, kan meteen boeken, ook 's avonds, zonder je eerst een bericht te sturen.",
        "Vraagt iemand om een afspraak, via WhatsApp, Instagram, Facebook, sms of telefoon? Stuur de link, dan hoef je niet heen en weer over tijden.",
        "Zet de afspraken die je al hebt in je Vellu-agenda. Vul je het e-mailadres van de klant in, dan krijgt de klant vooraf automatisch een herinnering, en heb je je hele agenda op één plek.",
      ],
      btnUrl: pageUrl, btnLabel: "Bekijk mijn boekingspagina",
      plain: `Hoi ${o.salon},\n\nJe behandelingen staan op Vellu, goed bezig! Nu moeten je klanten je boekingspagina nog vinden: ${pageUrl}\n\nDrie tips om te beginnen:\n- Zet de link overal waar klanten je vinden: in je bio op Instagram of TikTok, op je Facebook-pagina, in je WhatsApp-status, je Google-bedrijfsprofiel of je eigen website. Wie hem ziet, kan meteen boeken, ook 's avonds, zonder je eerst een bericht te sturen.\n- Vraagt iemand om een afspraak, via WhatsApp, Instagram, Facebook, sms of telefoon? Stuur de link, dan hoef je niet heen en weer over tijden.\n- Zet de afspraken die je al hebt in je Vellu-agenda. Vul je het e-mailadres van de klant in, dan krijgt de klant vooraf automatisch een herinnering, en heb je je hele agenda op één plek.\n\nBekijk mijn boekingspagina: ${pageUrl}\n\nVragen? Reageer gewoon op deze mail.\n\nTeam Vellu\nvellu.cc`,
    } : {
      subject: "Getting your first bookings through Vellu",
      paras: [
        `Your treatments are on Vellu, nice work! Now your clients need to find your booking page: ${link(pageUrl, pageLabel)}`,
      ],
      tipsTitle: "Three tips to get started",
      tips: [
        "Put the link wherever clients find you: your Instagram or TikTok bio, your Facebook page, your WhatsApp status, your Google Business profile or your own website. Anyone who sees it can book straight away, even in the evening, without messaging you first.",
        "Someone asks for an appointment by WhatsApp, Instagram, Facebook, text or phone? Send them the link, so you don't have to go back and forth about times.",
        "Add the appointments you already have to your Vellu calendar. If you fill in the client's email address, they automatically get a reminder beforehand, and your whole calendar is in one place.",
      ],
      btnUrl: pageUrl, btnLabel: "View my booking page",
      plain: `Hi ${o.salon},\n\nYour treatments are on Vellu, nice work! Now your clients need to find your booking page: ${pageUrl}\n\nThree tips to get started:\n- Put the link wherever clients find you: your Instagram or TikTok bio, your Facebook page, your WhatsApp status, your Google Business profile or your own website. Anyone who sees it can book straight away, even in the evening, without messaging you first.\n- Someone asks for an appointment by WhatsApp, Instagram, Facebook, text or phone? Send them the link, so you don't have to go back and forth about times.\n- Add the appointments you already have to your Vellu calendar. If you fill in the client's email address, they automatically get a reminder beforehand, and your whole calendar is in one place.\n\nView my booking page: ${pageUrl}\n\nQuestions? Just reply to this email.\n\nTeam Vellu\nvellu.cc`,
    };
  }
  const hi = nl ? `Hoi ${eSalon},` : `Hi ${eSalon},`;
  const questions = nl ? "Vragen? Reageer gewoon op deze mail." : "Questions? Just reply to this email.";
  const tips = t.tips ? `<div style="background:#f9f7f4;border-radius:12px;padding:20px 22px 12px;margin:0 0 24px;">
    <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:600;color:#8A7356;margin:0 0 12px;">${esc(t.tipsTitle)}</p>
    <ul style="font-size:14px;line-height:1.7;color:#333;margin:0;padding:0 0 0 18px;">${t.tips.map((tip) => `<li style="margin:0 0 10px;">${esc(tip)}</li>`).join("")}</ul>
  </div>` : "";
  // paras mogen een link bevatten (al ge-escaped via link()); de rest is vaste tekst.
  const paras = t.paras.map((p) => `<p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#333;">${p}</p>`).join("");
  const html = `<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
  <div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:#8A7356;margin:12px auto;"></div></div>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${hi}</p>
  ${paras}
  ${tips}
  ${button(t.btnUrl, t.btnLabel)}
  ${t.after ? `<p style="font-size:14px;line-height:1.7;margin:0 0 18px;color:#555;">${esc(t.after)}</p>` : ""}
  <p style="font-size:15px;line-height:1.7;margin:0;">${questions}<br><br><strong>Team Vellu</strong><br><span style="color:#888;font-size:13px;">vellu.cc</span></p>
  <div style="border-top:1px solid #e8e0d5;margin-top:28px;padding-top:14px;font-size:12px;color:#888;line-height:1.6;">${REPLY_TO}</div>
</div>`;
  return { subject: t.subject, html, text: t.plain };
}

async function sendResend(to: string[], subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) return { ok: false, status: 0, body: "RESEND_API_KEY ontbreekt" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `Vellu <${FROM_ADDRESS}>`, to, reply_to: REPLY_TO, subject, html, text }),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
}

async function recordHealth(status: string, ms: number, processed: number, err: string | null) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "send-activation-nudges",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* logtabel mag de run nooit laten falen */ }
}

// Welke salon krijgt nu welke mail? Eén lijst met kandidaten en één met wie
// (en waarom) niet, zodat een dry_run precies laat zien wat send zou doen.
async function plan(only: string[]) {
  const now = Date.now();
  const since = new Date(now - MAX_ACCOUNT_AGE_DAYS * DAY_MS).toISOString();
  const { data: salons, error } = await supabase
    .from("profiles")
    .select("id, business_name, slug, email, salon_email, created_at, subscription_status, trial_ends_at, is_demo, deactivated_at")
    .eq("is_demo", false)
    .is("deactivated_at", null)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  const list = (salons || []).filter((s: any) => only.length === 0 || only.includes(s.id));
  const ids = list.map((s: any) => s.id);
  const sentRows = ids.length ? (await supabase.from("activation_nudges").select("owner_id, kind").in("owner_id", ids)).data || [] : [];
  const sent = new Set(sentRows.map((r: any) => `${r.owner_id}:${r.kind}`));

  const due: any[] = [];
  const skipped: any[] = [];
  for (const s of list) {
    const name = String(s.business_name || "").trim();
    const skip = (reason: string) => skipped.push({ id: s.id, salon: name, reason });
    // Het eerste GELDIGE adres: ÉLANÉ had een salonadres met een tikfout en een
    // goed inlogadres; "salon_email || email" sloeg haar dan over.
    const to = [s.salon_email, s.email].map((x) => String(x || "").trim().toLowerCase()).find((x) => EMAIL_RE.test(x)) || "";
    if (!to) { skip("geen geldig e-mailadres"); continue; }
    if (!s.slug) { skip("geen slug (boekingspagina)"); continue; }
    const trialRunning = s.subscription_status === "trialing" && s.trial_ends_at && new Date(s.trial_ends_at).getTime() > now;
    if (!(s.subscription_status === "active" || trialRunning)) { skip(`geen lopende proef of abonnement (${s.subscription_status || "geen"})`); continue; }
    const ageDays = (now - new Date(s.created_at).getTime()) / DAY_MS;
    if (ageDays < NO_SERVICES_AFTER_DAYS) { skip(`te nieuw (${ageDays.toFixed(1)} dagen)`); continue; }
    const { count: svcCount } = await supabase.from("services").select("id", { count: "exact", head: true }).eq("owner_id", s.id).eq("visible", true);
    let kind: Kind | null = null;
    if ((svcCount || 0) === 0) {
      kind = "no_services";
    } else if (ageDays >= NO_BOOKINGS_AFTER_DAYS) {
      // Kassaverkopen tellen niet; een eigen testboeking op dag één wel als
      // afspraak, vandaar "hooguit één".
      const { count: apptCount } = await supabase.from("appointments").select("id", { count: "exact", head: true }).eq("owner_id", s.id).or("is_sale.is.null,is_sale.eq.false");
      if ((apptCount || 0) <= 1) kind = "no_bookings";
      else { skip(`in gebruik (${apptCount} afspraken)`); continue; }
    } else { skip(`diensten staan erop, boekingsmail pas na ${NO_BOOKINGS_AFTER_DAYS} dagen`); continue; }
    if (sent.has(`${s.id}:${kind}`)) { skip(`${kind} al verstuurd`); continue; }
    due.push({ id: s.id, salon: name, slug: String(s.slug), to, kind, age_days: Math.round(ageDays * 10) / 10 });
  }
  return { due, skipped };
}

async function runJob(job: any): Promise<{ result: any; status: number }> {
  if (job.mode === "test") {
    const to = String(job.test_to || "delivered@resend.dev").split(",").map((x) => x.trim().toLowerCase()).filter((x) => EMAIL_RE.test(x));
    if (!to.length) return { result: { error: "invalid_test_to" }, status: 400 };
    const lang: "nl" | "en" = job.test_lang === "nl" ? "nl" : "en";
    const stamp = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date());
    // Voorbeeldsalon = de demo-salon: echte naam en link, geen klantgegevens.
    let sample: Salon = { salon: "Your Salon", slug: "jouw-salon" };
    const { data: demo } = await supabase.from("profiles").select("business_name, slug").eq("is_demo", true).order("created_at").limit(1).maybeSingle();
    if (demo?.business_name) sample = { salon: String(demo.business_name).trim(), slug: String(demo.slug || "jouw-salon") };
    const results: any[] = [];
    for (const kind of KINDS) {
      const m = render(kind, lang, sample);
      const r = await sendResend(to, `[TEST ${kind} ${stamp}] ${m.subject}`, m.html, m.text);
      results.push({ kind, lang, to, subject: m.subject, ok: r.ok, status: r.status, body: r.ok ? undefined : r.body });
      await new Promise((res) => setTimeout(res, 400));
    }
    return { result: { mode: "test", sent: results.filter((x) => x.ok).length, results }, status: 200 };
  }

  const only: string[] = Array.isArray(job.only_owners) ? job.only_owners.map((x: unknown) => String(x)) : [];
  const { due, skipped } = await plan(only);
  if (job.mode === "dry_run") return { result: { mode: "dry_run", count: due.length, due, skipped }, status: 200 };

  const results: any[] = [];
  for (const d of due) {
    // Eerst claimen (PK owner+kind): botst de insert, dan heeft een parallelle
    // run hem al; mislukt de mail, dan de claim weer weg zodat morgen opnieuw kan.
    const { error: claimErr } = await supabase.from("activation_nudges").insert({ owner_id: d.id, kind: d.kind });
    if (claimErr) { results.push({ ...d, ok: false, reason: "al geclaimd" }); continue; }
    const m = render(d.kind, MAIL_LANG, { salon: d.salon, slug: d.slug });
    const r = await sendResend([d.to], m.subject, m.html, m.text);
    if (!r.ok) await supabase.from("activation_nudges").delete().eq("owner_id", d.id).eq("kind", d.kind);
    results.push({ ...d, ok: r.ok, status: r.status, body: r.ok ? undefined : r.body });
    await new Promise((res) => setTimeout(res, 400));
  }
  return { result: { mode: "send", sent: results.filter((x) => x.ok).length, results, skipped }, status: 200 };
}

serve(async (req) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  // Opdracht uit activation_nudge_jobs (test / dry_run / send via SQL).
  if (body?.job_id) {
    const jobId = String(body.job_id || "");
    const secret = String(body.secret || "");
    if (!UUID_RE.test(jobId) || secret.length < 20) return json({ error: "unauthorized" }, 401);
    const { data: found } = await supabase.from("activation_nudge_jobs").select("*").eq("id", jobId).is("started_at", null).maybeSingle();
    if (!found || found.secret !== secret) return json({ error: "unauthorized" }, 401);
    const { data: job } = await supabase.from("activation_nudge_jobs").update({ started_at: new Date().toISOString() }).eq("id", jobId).is("started_at", null).select("*").maybeSingle();
    if (!job) return json({ error: "already_started" }, 409);
    let out: { result: any; status: number };
    try { out = await runJob(job); } catch (e) { out = { result: { error: String((e as Error)?.message || e) }, status: 500 }; }
    await supabase.from("activation_nudge_jobs").update({ finished_at: new Date().toISOString(), result: out.result }).eq("id", job.id);
    return json(out.result, out.status);
  }

  // Dagelijkse cron: altijd mode send.
  if (!(await cronAuthorized(req))) return json({ error: "unauthorized" }, 401);
  const t0 = Date.now();
  try {
    const { result } = await runJob({ mode: "send" });
    const failed = (result.results || []).filter((r: any) => !r.ok && r.reason !== "al geclaimd").length;
    await recordHealth(failed ? "degraded" : "success", Date.now() - t0, result.sent || 0, failed ? `${failed} mail(s) mislukt` : null);
    return json(result);
  } catch (e) {
    await recordHealth("error", Date.now() - t0, 0, String((e as Error)?.message || e));
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
