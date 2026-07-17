// send-reminders — daily cron (pg_cron 10:00 UTC + Vercel /api/send-reminders
// proxy at 09:00 UTC as backup): reminds clients about TOMORROW's appointments
// and sends each salon a digest of tomorrow's agenda.
//
// v12: client emails now go through send-emails (appointment_reminder
// template: salon branding, Reply-To, plain-text part) instead of bare Resend
// HTML; adds the client SMS (send-sms no-ops for non-Professional salons);
// and adds the NEW salon digest email ("Je afspraken voor morgen"). The
// digest only goes out in a run that newly reminded ≥1 appointment for that
// owner, so the double schedule (Vercel 09:00 + pg_cron 10:00) can't send it
// twice — the second run finds reminder_sent=true everywhere and no-ops.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_HEADERS = {
  "Content-Type": "application/json",
  "x-internal-secret": SUPABASE_SERVICE_KEY!,
};

async function recordHealth(status: string, ms: number, processed: number, err: unknown) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "send-reminders",
      status,
      duration_ms: ms,
      items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* don't let monitoring errors fail the job */ }
}

function esc(s: unknown) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(dateStr: string, lang: string) {
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (lang === "en") {
      const dy = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const mo = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return `${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]}`;
    }
    const dy = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
    const mo = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    return `${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]}`;
  } catch { return dateStr; }
}

// Salon-facing digest: tomorrow's agenda in one email. Sent directly via
// Resend (it's Vellu → salon, not salon → client, so no send-emails template).
async function sendOwnerDigest(owner: {
  email: string; salon_name: string; lang: string; date: string;
  appts: { time: string; client_name: string; service_name: string; staff_name?: string | null }[];
}) {
  if (!RESEND_API_KEY || !owner.email || owner.appts.length === 0) return false;
  const nl = owner.lang !== "en";
  const dateLabel = fmtDate(owner.date, owner.lang);
  const rows = owner.appts
    .slice()
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
    .map((a) => `<tr>
      <td style="padding:8px 12px 8px 0;font-weight:600;white-space:nowrap;vertical-align:top;">${esc((a.time || "").slice(0, 5))}</td>
      <td style="padding:8px 0;vertical-align:top;">
        <div style="font-weight:500;">${esc(a.client_name)}</div>
        <div style="color:#888;font-size:12px;">${esc(a.service_name)}${a.staff_name ? " · " + esc(a.staff_name) : ""}</div>
      </td>
    </tr>`).join("");
  const html = `<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
    <div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:#c9a96e;margin:12px auto;"></div></div>
    <h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${nl ? "Je afspraken voor morgen" : "Your appointments for tomorrow"}</h2>
    <p style="color:#666;margin-bottom:24px;">${nl
      ? `${dateLabel} — ${owner.appts.length} ${owner.appts.length === 1 ? "afspraak" : "afspraken"} bij <strong>${esc(owner.salon_name)}</strong>.`
      : `${dateLabel} — ${owner.appts.length} appointment${owner.appts.length === 1 ? "" : "s"} at <strong>${esc(owner.salon_name)}</strong>.`}</p>
    <div style="background:#f9f7f4;border-radius:12px;padding:16px 24px;margin-bottom:28px;"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
    <p style="color:#888;font-size:12px;text-align:center;">${nl ? "Alle klanten hebben zojuist automatisch een herinnering ontvangen." : "All clients have just received an automatic reminder."}</p>
  </div>`;
  const text = owner.appts.map((a) => `${(a.time || "").slice(0, 5)} — ${a.client_name} — ${a.service_name}${a.staff_name ? " (" + a.staff_name + ")" : ""}`).join("\n");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Vellu <noreply@vellu.cc>",
        to: owner.email,
        subject: nl
          ? `Morgen: ${owner.appts.length} ${owner.appts.length === 1 ? "afspraak" : "afspraken"} (${dateLabel})`
          : `Tomorrow: ${owner.appts.length} appointment${owner.appts.length === 1 ? "" : "s"} (${dateLabel})`,
        html,
        text,
      }),
    });
    return r.ok;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("*, profiles!owner_id(business_name, slug, accent_color, logo_url, email, salon_email, country_code)")
      .eq("date", tomorrowStr)
      .eq("status", "confirmed")
      .eq("reminder_sent", false)
      .is("cancelled_at", null);

    if (error) throw error;

    let sentCount = 0;
    // Owners whose clients we newly reminded in THIS run → digest candidates.
    const remindedOwners = new Set<string>();
    for (const apt of appointments || []) {
      const p = apt.profiles || {};
      const lang = (p.country_code === "NL" || p.country_code === "BE" || !p.country_code) ? "nl" : "en";
      const booking = {
        client_name: apt.client_name,
        client_email: apt.client_email,
        service_name: apt.service_name,
        date: apt.date,
        time: apt.time,
        price: apt.service_price,
        salon_name: p.business_name || "de salon",
        salon_slug: p.slug || "",
        salon_accent: p.accent_color || "",
        salon_logo: p.logo_url || "",
        // Reply-To: client replies land at the salon, not our noreply.
        salon_email: p.salon_email || p.email || "",
        owner_id: apt.owner_id,
        lang,
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
        method: "POST",
        headers: INTERNAL_HEADERS,
        body: JSON.stringify({ type: "appointment_reminder", booking }),
      });
      if (res.ok) {
        await supabase.from("appointments").update({ reminder_sent: true }).eq("id", apt.id);
        sentCount++;
        if (apt.owner_id) remindedOwners.add(apt.owner_id);
        // SMS reminder — send-sms no-ops for non-Professional salons or
        // missing phone, so it's safe to fire for every reminder.
        if (apt.client_phone) {
          fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
            method: "POST",
            headers: INTERNAL_HEADERS,
            body: JSON.stringify({ type: "appointment_reminder", booking: { ...booking, client_phone: apt.client_phone } }),
          }).catch((e) => console.error("reminder SMS failed:", apt.id, e));
        }
      } else {
        console.error("reminder email failed:", apt.id, await res.text().catch(() => ""));
      }
    }

    // Salon digests — the FULL agenda for tomorrow (also appointments that
    // were already reminder_sent, e.g. booked after an earlier run today).
    let digests = 0;
    for (const ownerId of remindedOwners) {
      const { data: dayAppts } = await supabase
        .from("appointments")
        .select("time, client_name, service_name, staff_name, profiles!owner_id(business_name, email, salon_email, country_code)")
        .eq("owner_id", ownerId)
        .eq("date", tomorrowStr)
        .eq("status", "confirmed")
        .is("cancelled_at", null);
      const first = dayAppts?.[0];
      if (!first) continue;
      const p = (first as { profiles?: Record<string, string | null> }).profiles || {};
      const ok = await sendOwnerDigest({
        email: p.salon_email || p.email || "",
        salon_name: p.business_name || "je salon",
        lang: (p.country_code === "NL" || p.country_code === "BE" || !p.country_code) ? "nl" : "en",
        date: tomorrowStr,
        appts: dayAppts || [],
      });
      if (ok) digests++;
    }

    await recordHealth("success", Date.now() - t0, sentCount, null);
    return new Response(
      JSON.stringify({ success: true, reminders_sent: sentCount, owner_digests: digests, date: tomorrowStr }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    await recordHealth("error", Date.now() - t0, 0, (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
