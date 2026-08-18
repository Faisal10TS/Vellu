// cron-watchdog — draait één keer per dag en controleert of elke bewaakte cron
// in de afgelopen N uur een geslaagde hartslag heeft gemeld. Mailt de beheerder
// zodra er één ontbreekt. Het alarmadres komt uit de ADMIN_ALERT_EMAIL-secret.
//
// 2026-08-18:
//  - send-reminders-digest toegevoegd. Die schreef al netjes naar cron_health
//    (bewezen: 4 hartslagen, laatste 3,4 uur geleden) maar werd door niemand
//    bewaakt, dus een stilstand was onzichtbaar.
//  - het privé-mailadres dat hier als vaste terugval in stond is eruit. Stond
//    ADMIN_ALERT_EMAIL niet ingesteld, dan ging de waarschuwing daarheen; nu
//    valt hij terug op een adres dat in de repo mag staan.
//
// BEKENDE BEPERKING, bewust niet weggemoffeld: deze functie kan zichzelf niet
// bewaken. Valt hij stil, dan is er ook niemand die dat constateert — precies
// wat er vier maanden lang gebeurd is toen pg_net ontbrak. Zichzelf aan
// MONITORED toevoegen lost dat niet op: een functie die niet draait, kan ook
// niet klagen dat hij niet draait. Daar is een externe hartslag voor nodig
// (een uptime-monitor die dit endpoint dagelijks aanroept en alarmeert als het
// antwoord uitblijft). Zolang die er niet is, blijft dit een blinde vlek.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN = Deno.env.get("ADMIN_ALERT_EMAIL") || "mirahventures@vellu.cc";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MONITORED = [
  { name: "send-reminders", schedule: "daily 10:00", maxAgeHours: 25 },
  { name: "send-reminders-digest", schedule: "daily 09:00 UTC", maxAgeHours: 25 },
  { name: "send-followups", schedule: "daily 10:30", maxAgeHours: 25 },
  { name: "send-rebook-nudge", schedule: "daily 11:00", maxAgeHours: 25 },
  { name: "db-backup", schedule: "daily 03:00", maxAgeHours: 25 },
];

async function emailAdmin(subject, html) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Vellu Monitoring <noreply@vellu.cc>",
      to: [ADMIN], subject, html,
    }),
  });
}

serve(async () => {
  const issues = [];
  const nowMs = Date.now();

  for (const job of MONITORED) {
    const { data: last } = await supabase
      .from("cron_health")
      .select("ran_at, status, error_message, duration_ms, items_processed")
      .eq("job_name", job.name)
      .order("ran_at", { ascending: false })
      .limit(1);

    const lastRow = last?.[0];
    if (!lastRow) {
      issues.push({ job: job.name, type: "never_ran", detail: "No heartbeat ever recorded. Is the cron scheduled?" });
      continue;
    }
    const ageHours = (nowMs - new Date(lastRow.ran_at).getTime()) / 3_600_000;
    if (ageHours > job.maxAgeHours) {
      issues.push({
        job: job.name,
        type: "stale",
        detail: `Last heartbeat ${ageHours.toFixed(1)}h ago (threshold ${job.maxAgeHours}h). Expected: ${job.schedule}.`,
      });
      continue;
    }
    if (lastRow.status === "error") {
      issues.push({
        job: job.name,
        type: "errored",
        detail: `Last run failed: ${lastRow.error_message || "(no error message)"}`,
      });
    }
  }

  try {
    await supabase.from("cron_health").insert({
      job_name: "cron-watchdog",
      status: "success",
      items_processed: issues.length,
    });
  } catch {}

  if (issues.length === 0) {
    return new Response(JSON.stringify({ ok: true, issues: [] }), { headers: { "Content-Type": "application/json" } });
  }

  const rowsHtml = issues.map(i =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-family:monospace;">${i.job}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee;color:#d32f2f;">${i.type}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee;">${i.detail}</td></tr>`
  ).join("");

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 8px;">⚠️ Vellu cron issues</h2>
    <p style="color:#666;margin:0 0 16px;">One or more scheduled jobs haven't reported a recent healthy heartbeat.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f5f5f5;"><th style="text-align:left;padding:8px 12px;">Job</th><th style="text-align:left;padding:8px 12px;">Issue</th><th style="text-align:left;padding:8px 12px;">Detail</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="color:#888;font-size:12px;margin-top:16px;">Check Supabase → Edge Functions → Logs for the affected function. Heartbeats are in the <code>cron_health</code> table.</p>
  </div>`;

  await emailAdmin(`⚠️ Vellu: ${issues.length} cron issue${issues.length > 1 ? "s" : ""}`, html);
  return new Response(JSON.stringify({ ok: false, issues }), { headers: { "Content-Type": "application/json" } });
});
