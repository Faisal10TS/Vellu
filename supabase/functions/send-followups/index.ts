// supabase/functions/send-followups/index.ts
// Cron schedule: daily at 10:00 (same as send-reminders)
// Sends follow-up emails 24h after completed appointments

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async () => {
  try {
    // Find appointments completed yesterday that haven't had follow-up sent
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("*, profiles(business_name, slug)")
      .eq("status", "completed")
      .eq("followup_sent", false)
      .eq("date", yesterdayStr);

    if (error) {
      console.error("Error fetching appointments:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    let sent = 0;
    for (const appt of appointments || []) {
      if (!appt.client_email) continue;

      const salonName = appt.profiles?.business_name || "de salon";
      const slug = appt.profiles?.slug || "";
      const reviewUrl = `https://vellu.cc/${slug}?review=true&email=${encodeURIComponent(appt.client_email)}`;
      const rebookUrl = `https://vellu.cc/${slug}`;

      // Send email via Resend
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Vellu <noreply@vellu.cc>",
            to: [appt.client_email],
            subject: `Hoe was je afspraak bij ${salonName}?`,
            html: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1714;">
                <div style="text-align: center; margin-bottom: 32px;">
                  <div style="font-size: 24px; font-weight: 300; letter-spacing: 0.18em; color: #c9a96e;">vellu</div>
                </div>
                
                <p style="font-size: 16px; margin-bottom: 8px;">Hoi ${appt.client_name?.split(" ")[0] || ""},</p>
                
                <p style="font-size: 14px; color: #555; line-height: 1.6;">
                  Je had gisteren een afspraak bij <strong>${salonName}</strong>:
                </p>
                
                <div style="background: #f8f7f5; border-radius: 12px; padding: 16px; margin: 16px 0;">
                  <div style="font-weight: 500;">${appt.service_name}</div>
                  <div style="font-size: 13px; color: #888; margin-top: 4px;">${appt.date} om ${appt.time}</div>
                </div>
                
                <p style="font-size: 14px; color: #555; line-height: 1.6;">
                  We horen graag hoe het was!
                </p>
                
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${reviewUrl}" style="display: inline-block; background: #c9a96e; color: #0d0b0a; padding: 14px 32px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase;">
                    ⭐ Beoordeel je afspraak
                  </a>
                </div>
                
                <div style="text-align: center; margin: 16px 0;">
                  <a href="${rebookUrl}" style="display: inline-block; border: 1px solid #c9a96e; color: #c9a96e; padding: 12px 28px; border-radius: 100px; text-decoration: none; font-weight: 500; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;">
                    Boek opnieuw →
                  </a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
                
                <p style="font-size: 11px; color: #bbb; text-align: center;">
                  ${salonName} via Vellu · <a href="https://vellu.cc" style="color: #c9a96e; text-decoration: none;">vellu.cc</a>
                </p>
              </div>
            `,
          }),
        });

        if (res.ok) {
          // Mark as sent
          await supabase
            .from("appointments")
            .update({ followup_sent: true, followup_sent_at: new Date().toISOString() })
            .eq("id", appt.id);
          sent++;
        } else {
          console.error("Resend error:", await res.text());
        }
      } catch (emailError) {
        console.error("Email send error:", emailError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, total: appointments?.length || 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
