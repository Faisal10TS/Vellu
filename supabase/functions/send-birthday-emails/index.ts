// supabase/functions/send-birthday-emails/index.ts
//
// Runs once a day and sends a birthday wish + discount code to every client
// whose birthday (month + day) matches "today", scoped per salon.
//
// Gates:
//   1. Salon has profiles.birthday_email_enabled = true.
//   2. Client has clients.birthday OR manual_clients.birthday set and today's
//      month + day match. Year is ignored so a 2005-06-30 birthday triggers
//      every year on June 30.
//   3. We haven't already logged a send for (owner, client_email, today) —
//      the birthday_email_log UNIQUE constraint enforces this even if the
//      cron overlaps itself.
//
// Discount code format:
//   {prefix or "BDAY"}-{first 6 chars of email local-part, uppercase, alnum}-{pct}
//   e.g. BDAY-ESTHER-15. Prefix comes from profiles.birthday_email_code_prefix.
//
// Auth: cron secret via x-cron-secret header (Vercel cron), or internal
// service-role secret for manual invocation.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const FROM_ADDRESS = "noreply@vellu.cc";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeImg(url: unknown): string | null {
  if (!url || typeof url !== "string") return null;
  try { const u = new URL(url); return (u.protocol === "https:" || u.protocol === "http:") ? u.toString() : null; }
  catch { return null; }
}

function localPart(email: string): string {
  const at = email.indexOf("@");
  return at < 0 ? email : email.slice(0, at);
}

function makeCode(prefix: string, email: string, pct: number): string {
  const local = localPart(email).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "FRIEND";
  const p = (prefix || "BDAY").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "BDAY";
  return `${p}-${local}-${pct}`;
}

function renderHtml({ salonName, logo, accent, firstName, code, pct, slug }: {
  salonName: string;
  logo: string | null;
  accent: string;
  firstName: string;
  code: string;
  pct: number;
  slug: string;
}) {
  const header = logo
    ? `<div style="text-align:center;margin-bottom:28px;"><img src="${esc(logo)}" alt="${esc(salonName)}" style="max-height:56px;max-width:200px;" /></div>`
    : `<div style="text-align:center;margin-bottom:28px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;color:#1a1a1a;">${esc(salonName)}</h1></div>`;
  const link = slug ? `https://vellu.cc/${esc(slug)}` : "";
  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#1a1a1a;background:#ffffff;">
    ${header}
    <div style="width:40px;height:1px;background:${esc(accent)};margin:0 auto 28px;"></div>
    <h1 style="font-size:26px;font-weight:600;margin:0 0 14px;text-align:center;color:#1a1a1a;">🎉 ${esc(firstName ? `Gefeliciteerd, ${firstName}!` : "Gefeliciteerd!")}</h1>
    <p style="font-size:15px;line-height:1.7;color:#333;margin:0 0 24px;text-align:center;">
      Van iedereen bij <strong>${esc(salonName)}</strong> — een fijne verjaardag toegewenst. Als kadootje ${pct}% korting op je volgende afspraak.
    </p>
    <div style="background:#f9f7f4;border-radius:14px;padding:22px;text-align:center;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#999;margin-bottom:6px;">Jouw code</div>
      <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:${esc(accent)};">${esc(code)}</div>
      <div style="font-size:12px;color:#666;margin-top:8px;">${pct}% korting · geldig deze maand</div>
    </div>
    ${link ? `<div style="text-align:center;margin-bottom:24px;"><a href="${link}" style="display:inline-block;background:${esc(accent)};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-size:13px;font-weight:600;letter-spacing:0.06em;">Boek nu</a></div>` : ""}
    <p style="font-size:12px;color:#999;text-align:center;line-height:1.5;margin:0;">
      🎂 Nog een fijne dag, van ons allemaal!
    </p>
  </div>`;
}

async function sendEmail(to: string, subject: string, html: string, salonName: string, replyTo?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${salonName} <${FROM_ADDRESS}>`,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${txt}`);
  }
  return res.json().catch(() => ({}));
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }
  if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "email_not_configured" }), { status: 500 });

  // Auth: cron secret (Vercel) OR internal service-role secret.
  const cronHeader = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  const isInternal = cronHeader && cronHeader === SUPABASE_SERVICE_KEY;
  if (!isCron && !isInternal) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const sentOn = today.toISOString().slice(0, 10);

  // Only salons that have opted in and have a discount % configured.
  const { data: salons, error: salonErr } = await supabase
    .from("profiles")
    .select("id, business_name, email, salon_email, accent_color, logo_url, slug, birthday_email_discount_pct, birthday_email_code_prefix, subscription_status")
    .eq("birthday_email_enabled", true)
    .not("birthday_email_discount_pct", "is", null);
  if (salonErr) {
    console.error("Load salons failed:", salonErr);
    return new Response(JSON.stringify({ error: "db_error" }), { status: 500 });
  }

  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const salon of salons || []) {
    // Skip inactive subscriptions so a cancelled account doesn't keep spending
    // our email quota / Twilio credits (once we wire that in).
    if (salon.subscription_status && !["active", "trialing"].includes(String(salon.subscription_status))) {
      continue;
    }
    const pct = salon.birthday_email_discount_pct as number;
    const prefix = String(salon.birthday_email_code_prefix || "BDAY");
    const salonName = String(salon.business_name || "Vellu");
    const accent = /^#[0-9a-fA-F]{6}$/.test(String(salon.accent_color || "")) ? String(salon.accent_color) : "#c9a96e";
    const logo = safeImg(salon.logo_url);
    const replyTo = String(salon.salon_email || salon.email || "") || undefined;
    const slug = String(salon.slug || "");

    // Collect all birthday-matching client contacts this salon has ever seen.
    // Manual clients live under manual_clients; appointment-derived contacts
    // live indirectly via the clients table joined by email in appointments.
    // We just take the union and dedupe by email.

    // Manual clients: filter server-side using extract() to keep the payload small.
    const { data: manuals } = await supabase
      .from("manual_clients")
      .select("email, name, birthday")
      .eq("owner_id", salon.id)
      .eq("hidden", false)
      .not("email", "is", null)
      .not("birthday", "is", null);

    // Appointment-derived: appointments hold a client_email + client_name and
    // a client_id linking to public.clients where we now store birthday too.
    const { data: apptRows } = await supabase
      .from("appointments")
      .select("client_email, client_name, clients(first_name, last_name, birthday)")
      .eq("owner_id", salon.id)
      .not("client_email", "is", null);

    type Contact = { email: string; name: string; birthday: string };
    const byEmail: Record<string, Contact> = {};
    const takeIfBdayToday = (email: string, name: string, birthday: string | null | undefined) => {
      if (!email || !birthday) return;
      const em = email.trim().toLowerCase();
      if (!em) return;
      const bstr = String(birthday);
      if (bstr.length < 10) return;
      const bmm = bstr.slice(5, 7);
      const bdd = bstr.slice(8, 10);
      if (bmm !== mm || bdd !== dd) return;
      if (!byEmail[em]) byEmail[em] = { email: em, name: name || "", birthday: bstr };
    };
    for (const m of manuals || []) takeIfBdayToday(String(m.email), String(m.name || ""), m.birthday as string);
    for (const a of apptRows || []) {
      const cliRow = a as { client_email: string; client_name?: string; clients?: { first_name?: string; last_name?: string; birthday?: string } };
      const email = String(cliRow.client_email || "");
      const client = cliRow.clients;
      const fullName = cliRow.client_name || [client?.first_name, client?.last_name].filter(Boolean).join(" ");
      takeIfBdayToday(email, fullName, client?.birthday);
    }

    const targets = Object.values(byEmail);
    if (targets.length === 0) continue;

    // Filter out any (owner, email, today) rows already logged so a re-run
    // doesn't double-send.
    const emails = targets.map(t => t.email);
    const { data: alreadyLogged } = await supabase
      .from("birthday_email_log")
      .select("client_email")
      .eq("owner_id", salon.id)
      .eq("sent_on", sentOn)
      .in("client_email", emails);
    const doneSet = new Set((alreadyLogged || []).map(r => String(r.client_email).toLowerCase()));

    for (const t of targets) {
      if (doneSet.has(t.email)) { totalSkipped++; continue; }
      const firstName = String(t.name || "").split(/\s+/)[0] || "";
      const code = makeCode(prefix, t.email, pct);
      const html = renderHtml({ salonName, logo, accent, firstName, code, pct, slug });
      const subject = `🎉 Gefeliciteerd van ${salonName}`;
      try {
        await sendEmail(t.email, subject, html, salonName, replyTo);
        // Insert log row — the UNIQUE constraint guarantees we only ever
        // record one send per (owner, email, day).
        const { error: logErr } = await supabase.from("birthday_email_log").insert({
          owner_id: salon.id,
          client_email: t.email,
          sent_on: sentOn,
          discount_code: code,
        });
        if (logErr && logErr.code !== "23505") {
          // Any error other than a duplicate key is worth surfacing but
          // shouldn't stop the loop.
          console.error("Log insert failed:", logErr);
        }
        totalSent++;
      } catch (e) {
        console.error(`Birthday email failed for ${t.email}:`, e);
        totalErrors++;
      }
    }
  }

  return new Response(JSON.stringify({
    success: true,
    sent: totalSent,
    skipped_already_sent: totalSkipped,
    errors: totalErrors,
    date: sentOn,
  }), { headers: { "Content-Type": "application/json" } });
});
