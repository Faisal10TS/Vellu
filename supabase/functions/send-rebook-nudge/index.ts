// supabase/functions/send-rebook-nudge/index.ts
// Cron: runs daily. Sends a "we miss you" email to clients
// who haven't booked in 4+ weeks after their last completed appointment.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async () => {
  try {
    // Find clients whose last completed appointment was exactly 28 days ago
    // (so they get nudged once, not repeatedly)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 28);
    const targetDateStr = targetDate.toISOString().split("T")[0];

    // Get all completed appointments from 28 days ago
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("client_email, client_name, owner_id, profiles(business_name, slug)")
      .eq("status", "completed")
      .eq("date", targetDateStr)
      .eq("rebook_nudge_sent", false);

    if (error) {
      console.error("Error fetching appointments:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    // Deduplicate by client email + salon (only send one nudge per client per salon)
    const seen = new Set<string>();
    const toSend: typeof appointments = [];
    for (const appt of appointments || []) {
      if (!appt.client_email) continue;
      const key = `${appt.client_email}-${appt.owner_id}`;
      if (seen.has(key)) continue;

      // Check if the client has a newer appointment (they already rebooked)
      const { data: newer } = await supabase
        .from("appointments")
        .select("id")
        .eq("client_email", appt.client_email)
        .eq("owner_id", appt.owner_id)
        .gt("date", targetDateStr)
        .in("status", ["confirmed", "completed"])
        .limit(1);

      if (newer && newer.length > 0) {
        // Client already rebooked, skip and mark as sent
        await supabase.from("appointments").update({ rebook_nudge_sent: true })
          .eq("client_email", appt.client_email).eq("owner_id", appt.owner_id).eq("date", targetDateStr);
        seen.add(key);
        continue;
      }

      seen.add(key);
      toSend.push(appt);
    }

    let sent = 0;
    for (const appt of toSend) {
      const salonName = appt.profiles?.business_name || "de salon";
      const slug = appt.profiles?.slug || "";
      const rebookUrl = `https://vellu.cc/${slug}`;
      const firstName = appt.client_name?.split(" ")[0] || "";

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
                    Het is alweer 4 weken geleden sinds je laatste bezoek bij <strong>${salonName}</strong>.
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
            .eq("client_email", appt.client_email).eq("owner_id", appt.owner_id).eq("date", targetDateStr);
          sent++;
        }
      } catch (e) {
        console.error("Email error:", e);
      }
    }

    return new Response(JSON.stringify({ success: true, nudges_sent: sent, checked: (appointments || []).length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Rebook nudge error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
