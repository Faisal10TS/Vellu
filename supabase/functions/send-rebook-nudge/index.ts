// supabase/functions/send-rebook-nudge/index.ts
// Cron: runs daily. Sends a "we miss you" email to clients
// based on each salon's configured rebook_nudge_days setting.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async () => {
  try {
    // Get all salons with rebook nudge enabled (days > 0)
    const { data: salons, error: salonError } = await supabase
      .from("profiles")
      .select("id, business_name, slug, rebook_nudge_days")
      .gt("rebook_nudge_days", 0);

    if (salonError) {
      console.error("Error fetching salons:", salonError);
      return new Response(JSON.stringify({ error: salonError.message }), { status: 500 });
    }

    let totalSent = 0;

    for (const salon of salons || []) {
      const nudgeDays = salon.rebook_nudge_days || 28;

      // Calculate the target date for this salon
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - nudgeDays);
      const targetDateStr = targetDate.toISOString().split("T")[0];

      // Find completed appointments from exactly nudgeDays ago for this salon
      const { data: appointments, error } = await supabase
        .from("appointments")
        .select("client_email, client_name")
        .eq("owner_id", salon.id)
        .eq("status", "completed")
        .eq("date", targetDateStr)
        .eq("rebook_nudge_sent", false);

      if (error || !appointments?.length) continue;

      // Deduplicate by client email
      const seen = new Set<string>();

      for (const appt of appointments) {
        if (!appt.client_email || seen.has(appt.client_email)) continue;
        seen.add(appt.client_email);

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

        const salonName = salon.business_name || "de salon";
        const slug = salon.slug || "";
        const rebookUrl = `https://vellu.cc/${slug}`;
        const firstName = appt.client_name?.split(" ")[0] || "";
        const weeksAgo = Math.round(nudgeDays / 7);

        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${salonName} via Vellu <noreply@vellu.cc>`,
              to: [appt.client_email],
              subject: `We missen je bij ${salonName}!`,
              html: `
                <div style="max-width:500px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
                  <div style="text-align:center;padding:32px 20px 24px;">
                    <div style="font-size:28px;font-weight:300;color:#1a1a1a;margin-bottom:8px;">
                      ${firstName ? `Hoi ${firstName}!` : "Hoi!"}
                    </div>
                    <div style="font-size:14px;color:#666;line-height:1.6;">
                      Het is alweer ${weeksAgo} ${weeksAgo === 1 ? "week" : "weken"} geleden sinds je laatste bezoek bij <strong>${salonName}</strong>.
                      Tijd voor een nieuwe afspraak?
                    </div>
                  </div>
                  <div style="text-align:center;padding:20px;">
                    <a href="${rebookUrl}" style="display:inline-block;background:#c9a96e;color:#0d0b0a;text-decoration:none;padding:14px 32px;border-radius:100px;font-size:14px;font-weight:600;letter-spacing:0.05em;">
                      OPNIEUW BOEKEN
                    </a>
                  </div>
                  <div style="text-align:center;padding:16px 20px 32px;font-size:12px;color:#999;">
                    <a href="${rebookUrl}" style="color:#c9a96e;text-decoration:none;">vellu.cc/${slug}</a>
                  </div>
                </div>
              `,
            }),
          });

          if (res.ok) {
            await supabase.from("appointments").update({ rebook_nudge_sent: true })
              .eq("client_email", appt.client_email).eq("owner_id", salon.id).eq("date", targetDateStr);
            totalSent++;
          }
        } catch (e) {
          console.error("Email error:", e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, nudges_sent: totalSent, salons_checked: (salons || []).length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Rebook nudge error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
