// supabase/functions/send-rating-request/index.ts
// Beoordelingsmail "Hoe bevalt Vellu?" aan de salons (Faisal 16-09-2026):
// per salon een mail met een persoonlijke link vellu.cc/beoordeel/<token>
// naar de korte enquête (cijfer 1-5, wat werkt, wat mis je). De pagina staat
// in src/RateVellu.jsx; tokens en antwoorden in app_rating_invites /
// app_ratings (migraties beoordeel_vellu + beoordeel_vellu_per_mail).
//
// Twee manieren om te sturen (verify_jwt=false in config.toml, de functie
// controleert zelf):
//   1. vellu.cc/admin → Ratings (Faisal zelf): Authorization = gebruikers-JWT
//      van een beheerder (app_admins); body { mode, only_owners?, test_to? }.
//      De functie maakt dan zelf de opdrachtrij aan (logboek).
//   2. Opdracht via SQL: insert in app_rating_send_jobs → POST { job_id,
//      secret }. Alleen een bestaande, nog niet gestarte opdracht met kloppend
//      geheim wordt uitgevoerd.
// Modi:
//   test    → NL- en EN-voorbeeld naar test_to, niets naar salons; de html
//             komt mee terug (preview)
//   dry_run → alleen de ontvangerslijst (maakt wel de tokens aan)
//   send    → echt versturen. Zonder only_owners: alle actieve niet-demo
//             salons die de mail nog NIET kregen (herhalen gaat per salon
//             met only_owners, dan wordt dezelfde link opnieuw gemaild).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE = "https://vellu.cc";
const FROM_ADDRESS = "noreply@vellu.cc";
const REPLY_TO = "mirahventures@vellu.cc";
const ALLOWED_ORIGINS = ["https://vellu.cc", "https://www.vellu.cc", "http://localhost:5173", "http://localhost:4173"];

const DUTCH = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const langOf = (cc: unknown): "nl" | "en" => DUTCH.has(String(cc || "NL").toUpperCase()) ? "nl" : "en";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function render(lang: "nl" | "en", salon: string, link: string) {
  const eS = esc(salon), eL = esc(link);
  const t = lang === "nl" ? {
    subject: "Hoe bevalt Vellu? Geef je cijfer in één minuut",
    fromName: "Faisal van Vellu",
    hi: `Hoi ${eS},`,
    p1: "Je werkt nu een tijdje met Vellu, en ik wil graag weten wat je ervan vindt. Het kost je één minuut: een cijfer van 1 tot 5 en twee korte vragen. Wat werkt goed, en wat mis je?",
    btn: "Geef je cijfer",
    p2: "Je cijfer telt mee in het gemiddelde op vellu.cc. Je salonnaam en je woorden komen er alleen als je dat op de pagina aanvinkt.",
    p3: "Liever direct antwoorden? Reageer gewoon op deze mail.",
    thanks: "Dankjewel,",
    fallback: "Werkt de knop niet? Kopieer deze link in je browser:",
    plain: `Hoi ${salon},\n\nJe werkt nu een tijdje met Vellu, en ik wil graag weten wat je ervan vindt. Het kost je één minuut: een cijfer van 1 tot 5 en twee korte vragen. Wat werkt goed, en wat mis je?\n\nGeef je cijfer: ${link}\n\nJe cijfer telt mee in het gemiddelde op vellu.cc. Je salonnaam en je woorden komen er alleen als je dat op de pagina aanvinkt.\n\nLiever direct antwoorden? Reageer gewoon op deze mail.\n\nDankjewel,\nFaisal\nVellu · vellu.cc`,
  } : {
    subject: "How is Vellu working for you? Rate it in one minute",
    fromName: "Faisal from Vellu",
    hi: `Hi ${eS},`,
    p1: "You have been using Vellu for a while now, and I would love to hear what you think. It takes one minute: a score from 1 to 5 and two short questions. What works well, and what do you miss?",
    btn: "Give your score",
    p2: "Your score counts towards the average on vellu.cc. Your salon name and your words only appear there if you tick the box on the page.",
    p3: "Prefer to answer directly? Just reply to this email.",
    thanks: "Thank you,",
    fallback: "Button not working? Copy this link into your browser:",
    plain: `Hi ${salon},\n\nYou have been using Vellu for a while now, and I would love to hear what you think. It takes one minute: a score from 1 to 5 and two short questions. What works well, and what do you miss?\n\nGive your score: ${link}\n\nYour score counts towards the average on vellu.cc. Your salon name and your words only appear there if you tick the box on the page.\n\nPrefer to answer directly? Just reply to this email.\n\nThank you,\nFaisal\nVellu · vellu.cc`,
  };
  const html = `<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
  <div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:#8A7356;margin:12px auto;"></div></div>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${t.hi}</p>
  <p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#333;">${t.p1}</p>
  <div style="text-align:center;margin:0 0 24px;"><a href="${eL}" style="display:inline-block;background:#5B4C3A;color:#F4EFE6;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:15px 34px;border-radius:8px;">${t.btn}</a></div>
  <p style="font-size:14px;line-height:1.7;margin:0 0 14px;color:#333;">${t.p2}</p>
  <p style="font-size:14px;line-height:1.7;margin:0 0 24px;color:#333;">${t.p3}</p>
  <p style="font-size:15px;line-height:1.7;margin:0;">${t.thanks}<br><strong>Faisal</strong><br><span style="color:#888;font-size:13px;">Vellu · vellu.cc</span></p>
  <div style="border-top:1px solid #e8e0d5;margin-top:32px;padding-top:14px;font-size:12px;color:#888;line-height:1.6;">${t.fallback}<br><a href="${eL}" style="color:#8A7356;word-break:break-all;">${eL}</a><br>${REPLY_TO}</div>
</div>`;
  return { subject: t.subject, fromName: t.fromName, html, text: t.plain };
}

async function sendResend(to: string, fromName: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) return { ok: false, status: 0, body: "RESEND_API_KEY ontbreekt" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${fromName} <${FROM_ADDRESS}>`, to: [to], reply_to: REPLY_TO, subject, html, text }),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
}

// Uitnodiging per salon: bestaande token hergebruiken (dezelfde link blijft
// werken), anders een nieuwe rij met een verse token.
async function inviteFor(ownerId: string): Promise<{ token: string; sent_at: string | null; sent_count: number } | null> {
  const { data } = await supabase.from("app_rating_invites").select("token, sent_at, sent_count").eq("owner_id", ownerId).maybeSingle();
  if (data?.token) return data;
  const { data: made, error } = await supabase.from("app_rating_invites").insert({ owner_id: ownerId }).select("token, sent_at, sent_count").single();
  if (error) return null;
  return made;
}

// Is de aanroeper een ingelogde beheerder (app_admins)? Voor de knop in
// vellu.cc/admin; de gateway controleert de JWT niet (verify_jwt=false).
async function callerIsAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt.length < 20) return false;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user?.id) return false;
  const { data: adm } = await supabase.from("app_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return !!adm;
}

async function runJob(job: any): Promise<{ result: any; status: number }> {
  // Voorbeeldmails naar het testadres — geen salon, geen token.
  if (job.mode === "test") {
    const to = String(job.test_to || "delivered@resend.dev");
    const out: any[] = [];
    for (const lang of ["nl", "en"] as const) {
      const m = render(lang, lang === "nl" ? "TTNB Den Haag" : "Beauty by Eydy", `${SITE}/beoordeel/voorbeeld`);
      const r = await sendResend(to, m.fromName, `[TEST ${lang}] ${m.subject}`, m.html, m.text);
      out.push({ lang, to, subject: m.subject, ok: r.ok, status: r.status, body: r.ok ? undefined : r.body, html: m.html, text: m.text });
    }
    return { result: { mode: "test", to, sent: out.filter((x) => x.ok).length, results: out }, status: 200 };
  }

  const only: string[] = Array.isArray(job.only_owners) ? job.only_owners.map((x: unknown) => String(x)) : [];
  const { data: salons, error } = await supabase
    .from("profiles")
    .select("id, business_name, email, salon_email, country_code, subscription_status, is_demo")
    .eq("is_demo", false)
    .in("subscription_status", ["active", "trialing"]);
  if (error) return { result: { error: error.message }, status: 500 };

  const list: any[] = [];
  const skipped: any[] = [];
  for (const s of (salons || []).filter((x: any) => only.length === 0 || only.includes(x.id))) {
    const to = String(s.salon_email || s.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(to)) { skipped.push({ id: s.id, salon: s.business_name || "", reason: "geen geldig e-mailadres" }); continue; }
    const inv = await inviteFor(s.id);
    if (!inv) { skipped.push({ id: s.id, salon: s.business_name || "", reason: "geen token" }); continue; }
    // "Aan iedereen" = alleen wie de mail nog niet kreeg; herhalen gaat per salon.
    if (job.mode === "send" && only.length === 0 && inv.sent_at) { skipped.push({ id: s.id, salon: s.business_name || "", reason: "al verstuurd", sent_at: inv.sent_at }); continue; }
    list.push({ id: s.id, salon: s.business_name || "", to, lang: langOf(s.country_code), link: `${SITE}/beoordeel/${inv.token}`, sent_count: inv.sent_count || 0 });
  }

  if (job.mode === "dry_run") {
    return { result: { mode: "dry_run", count: list.length, recipients: list.map((r) => ({ ...r, link: r.link.replace(/[0-9a-f]{32}$/, "…") })), skipped }, status: 200 };
  }

  const results: any[] = [];
  for (const r of list) {
    const m = render(r.lang, r.salon, r.link);
    const sent = await sendResend(r.to, m.fromName, m.subject, m.html, m.text);
    if (sent.ok) await supabase.from("app_rating_invites").update({ sent_at: new Date().toISOString(), sent_count: r.sent_count + 1 }).eq("owner_id", r.id);
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
    // Pad 2: opdracht via SQL (job_id + geheim).
    const jobId = String(body.job_id || "");
    const secret = String(body.secret || "");
    if (!UUID_RE.test(jobId) || secret.length < 20) return json({ error: "unauthorized" }, 401);
    const { data: found } = await supabase.from("app_rating_send_jobs").select("*").eq("id", jobId).is("started_at", null).maybeSingle();
    if (!found || found.secret !== secret) return json({ error: "unauthorized" }, 401);
    // Opdracht claimen: één uitvoering, ook bij een dubbele aanroep.
    const { data: claimed } = await supabase.from("app_rating_send_jobs").update({ started_at: new Date().toISOString() }).eq("id", jobId).is("started_at", null).select("*").maybeSingle();
    if (!claimed) return json({ error: "already_started" }, 409);
    job = claimed;
  } else {
    // Pad 1: beheerder vanuit vellu.cc/admin (JWT), opdrachtrij als logboek.
    if (!(await callerIsAdmin(req))) return json({ error: "unauthorized" }, 401);
    const mode = ["test", "dry_run", "send"].includes(body?.mode) ? body.mode : null;
    if (!mode) return json({ error: "invalid_mode" }, 400);
    const testTo = mode === "test" ? String(body?.test_to || "").trim().toLowerCase() : null;
    if (mode === "test" && !EMAIL_RE.test(testTo || "")) return json({ error: "invalid_test_to" }, 400);
    const only = Array.isArray(body?.only_owners) ? body.only_owners.map((x: unknown) => String(x)).filter((x: string) => UUID_RE.test(x)) : [];
    const { data: made, error } = await supabase.from("app_rating_send_jobs")
      .insert({ mode, test_to: testTo, only_owners: only.length ? only : null, started_at: new Date().toISOString() })
      .select("*").single();
    if (error || !made) return json({ error: error?.message || "job_failed" }, 500);
    job = made;
  }

  const { result, status } = await runJob(job);
  await supabase.from("app_rating_send_jobs").update({ finished_at: new Date().toISOString(), result }).eq("id", job.id);
  // De html van de testmails hoort in het logboek, niet in het antwoord aan de browser.
  if (result?.results && job.mode === "test" && !body?.job_id) result.results = result.results.map((r: any) => ({ ...r, html: undefined, text: undefined }));
  return json(result, status);
});
