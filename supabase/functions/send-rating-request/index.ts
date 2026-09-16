// supabase/functions/send-rating-request/index.ts
// Beoordelingsmail "Hoe bevalt Vellu?" aan de salons (Faisal 16-09-2026):
// per salon een mail met een persoonlijke link vellu.cc/beoordeel/<token>
// naar de korte enquête (cijfer 1-5, wat werkt, wat mis je). De pagina staat
// in src/RateVellu.jsx; tokens en antwoorden in app_rating_invites /
// app_ratings (migraties beoordeel_vellu + beoordeel_vellu_per_mail).
//
// Aansturing via een opdracht in app_rating_send_jobs (aangemaakt met SQL):
//   POST { "job_id": "<uuid>", "secret": "<geheim uit de rij>" }
// De functie doet alleen iets bij een bestaande, nog niet gestarte opdracht
// met een kloppend geheim (verify_jwt=false in config.toml, geen gebruikers-
// JWT). De uitkomst komt in de opdrachtrij, zodat er een logboek overblijft.
//   mode 'test'    → NL- en EN-voorbeeld naar test_to (delivered@resend.dev),
//                    niets naar salons; de html komt mee terug voor een preview
//   mode 'dry_run' → alleen de ontvangerslijst (maakt wel de tokens aan)
//   mode 'send'    → echt versturen: alle actieve niet-demo salons, of alleen
//                    only_owners als dat gevuld is

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE = "https://vellu.cc";
const FROM_ADDRESS = "noreply@vellu.cc";
const REPLY_TO = "mirahventures@vellu.cc";

const DUTCH = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const langOf = (cc: unknown): "nl" | "en" => DUTCH.has(String(cc || "NL").toUpperCase()) ? "nl" : "en";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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
async function inviteFor(ownerId: string): Promise<string | null> {
  const { data } = await supabase.from("app_rating_invites").select("token").eq("owner_id", ownerId).maybeSingle();
  if (data?.token) return data.token;
  const { data: made, error } = await supabase.from("app_rating_invites").insert({ owner_id: ownerId }).select("token").single();
  if (error) return null;
  return made.token;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const jobId = String(body?.job_id || "");
  const secret = String(body?.secret || "");
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || secret.length < 20) return json({ error: "unauthorized" }, 401);

  const { data: job } = await supabase.from("app_rating_send_jobs").select("*").eq("id", jobId).is("started_at", null).maybeSingle();
  if (!job || job.secret !== secret) return json({ error: "unauthorized" }, 401);
  // Opdracht claimen: één uitvoering, ook bij een dubbele aanroep.
  const { data: claimed } = await supabase.from("app_rating_send_jobs").update({ started_at: new Date().toISOString() }).eq("id", jobId).is("started_at", null).select("id").maybeSingle();
  if (!claimed) return json({ error: "already_started" }, 409);
  const finish = async (result: unknown, status = 200) => {
    await supabase.from("app_rating_send_jobs").update({ finished_at: new Date().toISOString(), result }).eq("id", jobId);
    return json(result, status);
  };

  // Voorbeeldmails naar het testadres — geen salon, geen token.
  if (job.mode === "test") {
    const to = String(job.test_to || "delivered@resend.dev");
    const out: any[] = [];
    for (const lang of ["nl", "en"] as const) {
      const m = render(lang, lang === "nl" ? "TTNB Den Haag" : "Beauty by Eydy", `${SITE}/beoordeel/voorbeeld`);
      const r = await sendResend(to, m.fromName, `[TEST ${lang}] ${m.subject}`, m.html, m.text);
      out.push({ lang, to, subject: m.subject, ok: r.ok, status: r.status, body: r.ok ? undefined : r.body, html: m.html, text: m.text });
    }
    return finish({ mode: "test", results: out });
  }

  const only: string[] = Array.isArray(job.only_owners) ? job.only_owners.map((x: unknown) => String(x)) : [];
  const { data: salons, error } = await supabase
    .from("profiles")
    .select("id, business_name, email, salon_email, country_code, subscription_status, is_demo")
    .eq("is_demo", false)
    .in("subscription_status", ["active", "trialing"]);
  if (error) return finish({ error: error.message }, 500);

  const list: any[] = [];
  for (const s of (salons || []).filter((x: any) => only.length === 0 || only.includes(x.id))) {
    const to = String(s.salon_email || s.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) continue;
    const token = await inviteFor(s.id);
    list.push({ id: s.id, salon: s.business_name || "", to, lang: langOf(s.country_code), link: token ? `${SITE}/beoordeel/${token}` : null });
  }

  if (job.mode === "dry_run") return finish({ mode: "dry_run", count: list.length, recipients: list.map((r) => ({ ...r, link: r.link ? r.link.replace(/[0-9a-f]{32}$/, "…") : null })) });

  const results: any[] = [];
  for (const r of list) {
    if (!r.link) { results.push({ id: r.id, salon: r.salon, to: r.to, ok: false, body: "geen token" }); continue; }
    const m = render(r.lang, r.salon, r.link);
    const sent = await sendResend(r.to, m.fromName, m.subject, m.html, m.text);
    if (sent.ok) {
      const { data: inv } = await supabase.from("app_rating_invites").select("sent_count").eq("owner_id", r.id).maybeSingle();
      await supabase.from("app_rating_invites").update({ sent_at: new Date().toISOString(), sent_count: (inv?.sent_count || 0) + 1 }).eq("owner_id", r.id);
    }
    results.push({ id: r.id, salon: r.salon, to: r.to, lang: r.lang, ok: sent.ok, status: sent.status, body: sent.ok ? undefined : sent.body });
    await new Promise((res) => setTimeout(res, 400));
  }
  return finish({ mode: "send", sent: results.filter((x) => x.ok).length, results });
});
