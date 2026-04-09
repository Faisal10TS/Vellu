import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "noreply@vellu.cc";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Resend API error:", data);
    throw new Error(data?.message || `Email send failed (${res.status})`);
  }
  return data;
}

// Bilingual text helper
const txt = (lang: string, nl: string, en: string) => lang === "en" ? en : nl;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const formatDate = (dateStr: string, lang = "nl") => {
    try {
      const d = new Date(dateStr + "T12:00:00");
      if (lang === "en") {
        const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
      }
      const days = ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"];
      const months = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
      return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch { return dateStr; }
  };

  const logoHeader = (booking: any) => {
    if (booking.salon_logo) {
      return `<div style="text-align:center;margin-bottom:32px;"><img src="${booking.salon_logo}" alt="${booking.salon_name}" style="max-height:60px;max-width:200px;margin-bottom:12px;" /><div style="width:40px;height:1px;background:#c9a96e;margin:0 auto;"></div></div>`;
    }
    return `<div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:#c9a96e;margin:12px auto;"></div></div>`;
  };

  const fmtPrice = (p: any) => `€${parseFloat(p || 0).toFixed(2)}`;

  try {
    const { type, booking } = await req.json();
    const lang = booking.lang || "nl";
    const niceDate = formatDate(booking.date, lang);

    if (type === "booking_confirmation") {
      const cancelSection = booking.cancel_url ? `
        <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:28px;text-align:center;">
          <p style="color:#666;font-size:13px;margin:0 0 12px;">${txt(lang, "Kun je niet komen? Annuleer tot 24 uur van tevoren:", "Can't make it? Cancel up to 24 hours in advance:")}</p>
          <a href="${booking.cancel_url}" style="display:inline-block;background:#fee2e2;color:#dc2626;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:500;">${txt(lang, "Afspraak annuleren", "Cancel appointment")}</a>
        </div>
      ` : '';

      await sendEmail(
        booking.client_email,
        txt(lang, `Bevestiging afspraak bij ${booking.salon_name}`, `Appointment confirmed at ${booking.salon_name}`),
        `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          ${logoHeader(booking)}
          <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 8px;">${txt(lang, "Je afspraak is bevestigd", "Your appointment is confirmed")}</h2>
          <p style="color: #666; margin-bottom: 28px;">${txt(lang, `Bedankt voor je boeking bij <strong>${booking.salon_name}</strong>`, `Thank you for booking at <strong>${booking.salon_name}</strong>`)}</p>
          <div style="background: #f9f7f4; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Behandeling", "Treatment")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Datum", "Date")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${niceDate}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Tijd", "Time")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.time}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Betaling", "Payment")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.payment === "online" ? txt(lang, "Online betaald", "Paid online") : txt(lang, "Betalen bij afspraak", "Pay at appointment")}</td></tr>
              <tr style="border-top: 1px solid #e8e0d5;"><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e;">${txt(lang, "Totaal", "Total")}</td><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e; text-align: right;">${fmtPrice(booking.price)}</td></tr>
            </table>
          </div>
          ${cancelSection}
          <p style="color: #888; font-size: 13px; text-align: center;">${txt(lang, `Tot dan, ${booking.client_name}!`, `See you then, ${booking.client_name}!`)}</p>
        </div>
        `
      );
    }

    if (type === "booking_notification") {
      // Send to owner and/or staff members
      const recipients: string[] = [];
      if (booking.owner_email) recipients.push(booking.owner_email);
      if (booking.staff_emails?.length > 0) recipients.push(...booking.staff_emails);

      for (const email of recipients) {
        await sendEmail(
          email,
          `Nieuwe boeking: ${booking.client_name}`,
          `
          <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
            ${logoHeader(booking)}
            <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 8px;">Nieuwe boeking!</h2>
            <p style="color: #666; margin-bottom: 28px;">Er is een nieuwe afspraak gemaakt bij <strong>${booking.salon_name}</strong></p>
            <div style="background: #f9f7f4; border-radius: 12px; padding: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Klant</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.client_name}</td></tr>
                ${booking.client_phone ? `<tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Telefoon</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.client_phone}</td></tr>` : ''}
                <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Behandeling</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
                <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Datum</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${formatDate(booking.date)}</td></tr>
                <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Tijd</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.time}</td></tr>
                <tr style="border-top: 1px solid #e8e0d5;"><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e;">Totaal</td><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e; text-align: right;">${fmtPrice(booking.price)}</td></tr>
              </table>
            </div>
          </div>
          `
        );
      }
    }

    if (type === "booking_cancelled") {
      await sendEmail(
        booking.client_email,
        txt(lang, "Afspraak geannuleerd", "Appointment cancelled"),
        `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          ${logoHeader(booking)}
          <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 8px;">${txt(lang, "Afspraak geannuleerd", "Appointment cancelled")}</h2>
          <p style="color: #666; margin-bottom: 28px;">${txt(lang, "Je afspraak is succesvol geannuleerd.", "Your appointment has been successfully cancelled.")}</p>
          <div style="background: #f9f7f4; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Behandeling", "Treatment")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Was gepland op", "Was scheduled for")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.date} ${txt(lang, "om", "at")} ${booking.time}</td></tr>
            </table>
          </div>
          <p style="color: #888; font-size: 13px; text-align: center;">${txt(lang, "Wil je opnieuw boeken? Ga naar vellu.cc", "Want to rebook? Visit vellu.cc")}</p>
        </div>
        `
      );
    }

    if (type === "invoice") {
      const businessDetails: string[] = [];
      if (booking.salon_address) businessDetails.push(booking.salon_address);
      if (booking.salon_kvk) businessDetails.push(`KVK: ${booking.salon_kvk}`);
      if (booking.salon_btw) businessDetails.push(`BTW: ${booking.salon_btw}`);
      if (booking.salon_iban) businessDetails.push(`IBAN: ${booking.salon_iban}`);

      const businessSection = businessDetails.length > 0 ? `
        <div style="background: #f0ede8; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #999; margin-bottom: 8px;">${txt(lang, "Bedrijfsgegevens", "Business details")}</div>
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">${booking.salon_name}</div>
          ${businessDetails.map((d: string) => `<div style="font-size: 12px; color: #666;">${d}</div>`).join('')}
        </div>
      ` : '';

      await sendEmail(
        booking.client_email,
        `${txt(lang, "Factuur", "Invoice")} ${booking.invoice_number || ''} - ${booking.salon_name}`,
        `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          ${logoHeader(booking)}
          <h2 style="font-weight: 400; font-size: 22px; margin: 0 0 4px;">${txt(lang, "Factuur", "Invoice")}</h2>
          <p style="color: #888; font-size: 13px; margin: 0 0 24px;">${booking.salon_name} &middot; ${niceDate}</p>
          ${booking.invoice_number ? `<div style="background: #f9f7f4; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #c9a96e; display: inline-block; margin-bottom: 16px;">${booking.invoice_number}</div>` : ''}
          ${businessSection}
          <div style="background: #f9f7f4; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Klant", "Client")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.client_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Behandeling", "Treatment")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Datum", "Date")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${niceDate}</td></tr>
              <tr style="border-top: 1px solid #e8e0d5;"><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e;">${txt(lang, "Totaal", "Total")}</td><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e; text-align: right;">${fmtPrice(booking.price)}</td></tr>
            </table>
          </div>
          <p style="color: #888; font-size: 12px; text-align: center;">${txt(lang, "Bedankt voor je bezoek!", "Thank you for your visit!")}</p>
        </div>
        `
      );
    }

    if (type === "appointment_reminder") {
      await sendEmail(
        booking.client_email,
        txt(lang, `Herinnering: Morgen afspraak bij ${booking.salon_name}`, `Reminder: Appointment tomorrow at ${booking.salon_name}`),
        `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          ${logoHeader(booking)}
          <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 8px;">${txt(lang, "Niet vergeten!", "Don't forget!")}</h2>
          <p style="color: #666; margin-bottom: 28px;">${txt(lang, `Je hebt morgen een afspraak bij <strong>${booking.salon_name}</strong>`, `You have an appointment tomorrow at <strong>${booking.salon_name}</strong>`)}</p>
          <div style="background: #f9f7f4; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Behandeling", "Treatment")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.service_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Datum", "Date")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${niceDate}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">${txt(lang, "Tijd", "Time")}</td><td style="padding: 8px 0; font-weight: 500; text-align: right;">${booking.time}</td></tr>
              <tr style="border-top: 1px solid #e8e0d5;"><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e;">${txt(lang, "Totaal", "Total")}</td><td style="padding: 12px 0 4px; font-weight: 600; color: #c9a96e; text-align: right;">${fmtPrice(booking.price)}</td></tr>
            </table>
          </div>
          <p style="color: #888; font-size: 13px; text-align: center;">${txt(lang, `We zien je morgen, ${booking.client_name}!`, `See you tomorrow, ${booking.client_name}!`)}</p>
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
