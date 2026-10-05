// supabase/functions/send-rebook-nudge/index.ts
// Cron: runs daily. Sends a "we miss you" email to clients
// based on each salon's configured rebook_nudge_days setting.
//
// 05-10-2026: de repo liep achter op de live versie (v12 schreef al naar
// cron_health, deze code niet — een deploy van de repo had cron-watchdog elke
// dag "stale" laten mailen). recordHealth staat er nu weer in, plus:
//   - alleen de planner mag hem starten (cron-secret, E2-04);
//   - de rijen worden geclaimd vóór de mail (geen dubbele mail bij overlap);
//   - de mail in de taal waarin de klant boekte (appointments.lang), anders
//     de taal van het salonland (E2-06) — hij was alleen Nederlands;
//   - naam en salonnaam ge-escapet in de HTML (E2-10);
//   - mislukte mails tellen mee in cron_health (E2-09).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function recordHealth(status: string, ms: number, processed: number, err: unknown) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "send-rebook-nudge",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* monitoring mag de job nooit laten vallen */ }
}

// Alleen de planner mag deze functie starten (audit E2-04): pg_cron stuurt
// x-cron-secret uit de vault (bevestigd door cron_secret_ok()), Vercel de
// CRON_SECRET-env, een handmatige aanroep x-internal-secret (service-role).
// Anders 401 zonder werk. Zelfde check als send-reminders.
async function cronAuthorized(req: Request): Promise<boolean> {
  const internal = req.headers.get("x-internal-secret") || "";
  if (internal && SUPABASE_SERVICE_KEY && internal === SUPABASE_SERVICE_KEY) return true;
  const cs = req.headers.get("x-cron-secret") || "";
  if (!cs) return false;
  if (CRON_SECRET && cs === CRON_SECRET) return true;
  try {
    const { data, error } = await supabase.rpc("cron_secret_ok", { p_secret: cs });
    return !error && data === true;
  } catch { return false; }
}

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Taal: die van de afspraak (de klant koos hem bij het boeken), anders het
// salonland — zelfde regel als send-followups.
const DUTCH_COUNTRIES = ["NL", "BE", "AW", "CW", "BQ", "SX"];
const langFor = (apptLang: unknown, country: unknown) => {
  const l = String(apptLang || "").toLowerCase();
  if (l === "nl" || l === "en" || l === "es") return l;
  return DUTCH_COUNTRIES.includes(String(country || "NL").toUpperCase()) ? "nl" : "en";
};
const txt = (lang: string, nl: string, en: string, es: string) => lang === "en" ? en : lang === "es" ? es : nl;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

serve(async (req) => {
  if (!(await cronAuthorized(req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const t0 = Date.now();
  try {
    // Get all salons with rebook nudge enabled (days > 0)
    const { data: salons, error: salonError } = await supabase
      .from("profiles")
      .select("id, business_name, slug, rebook_nudge_days, country_code")
      .gt("rebook_nudge_days", 0);

    if (salonError) {
      console.error("Error fetching salons:", salonError);
      await recordHealth("error", Date.now() - t0, 0, salonError.message);
      return new Response(JSON.stringify({ error: salonError.message }), { status: 500 });
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const salon of salons || []) {
      const nudgeDays = salon.rebook_nudge_days || 28;

      // Calculate the target date for this salon
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - nudgeDays);
      const targetDateStr = targetDate.toISOString().split("T")[0];

      // Find completed appointments from exactly nudgeDays ago for this salon
      const { data: appointments, error } = await supabase
        .from("appointments")
        .select("client_email, client_name, lang")
        .eq("owner_id", salon.id)
        .eq("status", "completed")
        .eq("date", targetDateStr)
        // IS NOT TRUE: de kolom mag NULL zijn (default false).
        .not("rebook_nudge_sent", "is", true);

      if (error || !appointments?.length) continue;

      // Deduplicate by client email
      const seen = new Set<string>();

      for (const appt of appointments) {
        if (!appt.client_email || seen.has(appt.client_email)) continue;
        seen.add(appt.client_email);
        // "." en andere niet-adressen (inloopklanten) weigert Resend toch.
        if (!VALID_EMAIL.test(String(appt.client_email).trim())) continue;

        // Check if client already rebooked
        const { data: newer } = await supabase
          .from("appointments")
          .select("id")
          .eq("client_email", appt.client_email)
          .eq("owner_id", salon.id)
          .gt("date", targetDateStr)
          .in("status", ["confirmed", "completed"])
          .limit(1);

        if (newer && newer.length > 0) {
          // Already rebooked, mark and skip
          await supabase.from("appointments").update({ rebook_nudge_sent: true })
            .eq("client_email", appt.client_email).eq("owner_id", salon.id).eq("date", targetDateStr);
          continue;
        }

        // Eerst claimen (E2-04): de rijen van deze klant op die dag op
        // rebook_nudge_sent = true zetten, alleen als dat nog niet zo was. Kreeg
        // deze run niets terug, dan was een andere run eerder.
        const { data: claimed, error: claimErr } = await supabase.from("appointments")
          .update({ rebook_nudge_sent: true })
          .eq("client_email", appt.client_email).eq("owner_id", salon.id).eq("date", targetDateStr)
          .not("rebook_nudge_sent", "is", true)
          .select("id");
        if (claimErr) { console.error("rebook claim failed:", claimErr.message); continue; }
        if (!claimed || claimed.length === 0) continue;
        const claimedIds = claimed.map((r: { id: string }) => r.id);

        const salonName = salon.business_name || "de salon";
        const slug = salon.slug || "";
        const rebookUrl = `https://vellu.cc/${slug}`;
        const firstName = appt.client_name?.split(" ")[0] || "";
        const weeksAgo = Math.round(nudgeDays / 7);
        const lang = langFor(appt.lang, salon.country_code);
        const eSalon = esc(salonName);
        const eFirst = esc(firstName);
        const weeksTxt = txt(lang,
          `${weeksAgo} ${weeksAgo === 1 ? "week" : "weken"}`,
          `${weeksAgo} ${weeksAgo === 1 ? "week" : "weeks"}`,
          `${weeksAgo} ${weeksAgo === 1 ? "semana" : "semanas"}`);

        let ok = false;
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${salonName.replace(/[<>\r\n"]/g, "")} via Vellu <noreply@vellu.cc>`,
              to: [appt.client_email],
              subject: txt(lang, `We missen je bij ${salonName}!`, `We miss you at ${salonName}!`, `¡Te echamos de menos en ${salonName}!`),
              html: `
                <div style="max-width:500px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
                  <div style="text-align:center;padding:32px 20px 24px;">
                    <div style="font-size:28px;font-weight:300;color:#1a1a1a;margin-bottom:8px;">
                      ${firstName ? txt(lang, `Hoi ${eFirst}!`, `Hi ${eFirst}!`, `¡Hola ${eFirst}!`) : txt(lang, "Hoi!", "Hi!", "¡Hola!")}
                    </div>
                    <div style="font-size:14px;color:#666;line-height:1.6;">
                      ${txt(lang,
                        `Het is alweer ${weeksTxt} geleden sinds je laatste bezoek bij <strong>${eSalon}</strong>. Tijd voor een nieuwe afspraak?`,
                        `It has been ${weeksTxt} since your last visit to <strong>${eSalon}</strong>. Time for a new appointment?`,
                        `Ya han pasado ${weeksTxt} desde tu última visita a <strong>${eSalon}</strong>. ¿Es hora de una nueva cita?`)}
                    </div>
                  </div>
                  <div style="text-align:center;padding:20px;">
                    <a href="${esc(rebookUrl)}" style="display:inline-block;background:#c9a96e;color:#0d0b0a;text-decoration:none;padding:14px 32px;border-radius:100px;font-size:14px;font-weight:600;letter-spacing:0.05em;">
                      ${txt(lang, "OPNIEUW BOEKEN", "BOOK AGAIN", "RESERVAR DE NUEVO")}
                    </a>
                  </div>
                  <div style="text-align:center;padding:16px 20px 32px;font-size:12px;color:#999;">
                    <a href="${esc(rebookUrl)}" style="color:#c9a96e;text-decoration:none;">vellu.cc/${esc(slug)}</a>
                  </div>
                </div>
              `,
            }),
          });

          ok = res.ok;
          if (!res.ok) console.error("Resend error:", res.status, await res.text().catch(() => ""));
        } catch (e) {
          console.error("Email error:", e);
        }
        if (ok) totalSent++;
        else {
          totalFailed++;
          // Claim teruggeven. Deze run kijkt alleen naar de dag van precies
          // rebook_nudge_days geleden, dus een herhaling komt er vanzelf niet;
          // de vlag terugzetten houdt wel eerlijk bij dat er niets ging.
          await supabase.from("appointments").update({ rebook_nudge_sent: false }).in("id", claimedIds);
        }
      }
    }

    // Alles mislukt = 'error', een deel = 'degraded' (E2-09).
    const attempts = totalSent + totalFailed;
    await recordHealth(
      attempts > 0 && totalFailed === attempts ? "error" : totalFailed > 0 ? "degraded" : "success",
      Date.now() - t0,
      totalSent,
      totalFailed > 0 ? `${totalFailed} van ${attempts} mails mislukt` : null,
    );
    return new Response(JSON.stringify({ success: true, nudges_sent: totalSent, failed: totalFailed, salons_checked: (salons || []).length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Rebook nudge error:", err);
    await recordHealth("error", Date.now() - t0, 0, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
