import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "noreply@vellu.cc";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { type, booking } = await req.json();

    if (type === "booking_confirmation") {
      // 1. Email to client
      await sendEmail(
        booking.client_email,
        `Bevestiging afspraak bij ${booking.salon_name}`,
        `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 32px; font-weight: 300; letter-spacing: 0.1em; margin: 0;">vellu</h1>
            <div style="width: 40px; height: 1px; background: #c9a96e; margin: 12px auto;"></div>
          </div>
          <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 8px;">Je afspraak is bevestigd ✨</h2>
          <p style="color: #666; margin-bottom: 28px;">Bedankt voor je boeking bij <strong>${booking.salon_name}</strong></p>
          <div style="background: #f9f7f4; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Behandeling</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Datum</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.date}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Tijd</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.time}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Betaling</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.payment === "online" ? "Online betaald" : "Betalen bij afspraak"}</td></tr>
              <tr style="border-top: 1px solid #e8e0d5;"><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e;">Totaal</td><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e; text-align: right;">€${booking.price}</td></tr>
            </table>
          </div>
          <p style="color: #888; font-size: 13px; text-align: center;">Tot dan, ${booking.client_name}! 💅</p>
        </div>
        `
      );

      // 2. Notification to owner
      await sendEmail(
        booking.owner_email,
        `Nieuwe boeking: ${booking.client_name}`,
        `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 32px; font-weight: 300; letter-spacing: 0.1em; margin: 0;">vellu</h1>
            <div style="width: 40px; height: 1px; background: #c9a96e; margin: 12px auto;"></div>
          </div>
          <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 8px;">Nieuwe boeking! 🎉</h2>
          <p style="color: #666; margin-bottom: 28px;">Er is een nieuwe afspraak gemaakt bij <strong>${booking.salon_name}</strong></p>
          <div style="background: #f9f7f4; border-radius: 12px; padding: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Klant</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.client_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Email</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.client_email}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Behandeling</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Datum</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.date}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Tijd</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.time}</td></tr>
              <tr style="border-top: 1px solid #e8e0d5;"><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e;">Totaal</td><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e; text-align: right;">€${booking.price}</td></tr>
            </table>
          </div>
        </div>
        `
      );
    }

    if (type === "invoice") {
      await sendEmail(
        booking.client_email,
        `Factuur - ${booking.salon_name}`,
        `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 32px; font-weight: 300; letter-spacing: 0.1em; margin: 0;">vellu</h1>
            <div style="width: 40px; height: 1px; background: #c9a96e; margin: 12px auto;"></div>
          </div>
          <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 4px;">Factuur</h2>
          <p style="color: #888; font-size: 13px; margin-bottom: 28px;">${booking.salon_name} · ${booking.date}</p>
          <div style="background: #f9f7f4; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Klant</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.client_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Behandeling</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Datum</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.date}</td></tr>
              <tr style="border-top: 1px solid #e8e0d5;"><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e;">Totaal</td><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e; text-align: right;">€${booking.price}</td></tr>
            </table>
          </div>
          <p style="color: #888; font-size: 12px; text-align: center;">Bedankt voor je bezoek! 💅</p>
        </div>
        `
      );
    }

    if (type === "appointment_reminder") {
      await sendEmail(
        booking.client_email,
        `Herinnering: Morgen afspraak bij ${booking.salon_name}`,
        `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 32px; font-weight: 300; letter-spacing: 0.1em; margin: 0;">vellu</h1>
            <div style="width: 40px; height: 1px; background: #c9a96e; margin: 12px auto;"></div>
          </div>
          <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 8px;">Niet vergeten! ⏰</h2>
          <p style="color: #666; margin-bottom: 28px;">Je hebt morgen een afspraak bij <strong>${booking.salon_name}</strong></p>
          <div style="background: #f9f7f4; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Behandeling</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Datum</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.date}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Tijd</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.time}</td></tr>
              <tr style="border-top: 1px solid #e8e0d5;"><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e;">Totaal</td><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e; text-align: right;">€${booking.price}</td></tr>
            </table>
          </div>
          <p style="color: #888; font-size: 13px; text-align: center;">We zien je morgen, ${booking.client_name}! 💅</p>
          ${booking.salon_slug ? `<p style="text-align: center; margin-top: 20px;"><a href="https://vellu.cc/${booking.salon_slug}" style="color: #c9a96e; text-decoration: none; font-size: 12px;">vellu.cc/${booking.salon_slug}</a></p>` : ''}
        </div>
        `
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
