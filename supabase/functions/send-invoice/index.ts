import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "hello@vellu.cc";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const {
      clientName,
      clientEmail,
      serviceName,
      servicePrice,
      serviceDuration,
      date,
      time,
      businessName,
      invoiceId,
    } = await req.json();

    const btw = (parseFloat(servicePrice) * 0.21).toFixed(2);
    const total = (parseFloat(servicePrice) * 1.21).toFixed(2);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Factuur / Invoice</title>
      </head>
      <body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
        <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <div style="background:#0f0e0e;padding:32px;text-align:center;">
            <div style="font-family:Georgia,serif;font-size:28px;color:#c9a96e;letter-spacing:-0.5px;">Vellu</div>
            <div style="font-size:12px;color:rgba(240,236,230,0.5);margin-top:4px;">Beauty booking, beautifully simple</div>
          </div>

          <!-- Body -->
          <div style="padding:32px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
              <div>
                <div style="font-size:22px;font-weight:700;color:#1a1a1a;">Factuur</div>
                <div style="font-size:13px;color:#888;margin-top:4px;">${businessName}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:12px;color:#888;">#${invoiceId}</div>
                <div style="font-size:12px;color:#888;margin-top:2px;">${date}</div>
              </div>
            </div>

            <!-- Client -->
            <div style="background:#f9f7f4;border-radius:12px;padding:16px;margin-bottom:24px;">
              <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Factuur voor</div>
              <div style="font-weight:600;font-size:15px;color:#1a1a1a;">${clientName}</div>
              <div style="font-size:13px;color:#666;margin-top:2px;">${clientEmail}</div>
            </div>

            <!-- Service -->
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <thead>
                <tr style="border-bottom:2px solid #f0ece6;">
                  <th style="text-align:left;padding:10px 0;font-size:12px;color:#999;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Behandeling</th>
                  <th style="text-align:right;padding:10px 0;font-size:12px;color:#999;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom:1px solid #f0ece6;">
                  <td style="padding:14px 0;">
                    <div style="font-weight:500;font-size:14px;color:#1a1a1a;">${serviceName}</div>
                    <div style="font-size:12px;color:#999;margin-top:3px;">${time} · ${serviceDuration} min</div>
                  </td>
                  <td style="padding:14px 0;text-align:right;font-size:14px;font-weight:500;color:#1a1a1a;">€${parseFloat(servicePrice).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <!-- Totals -->
            <div style="margin-bottom:8px;display:flex;justify-content:space-between;">
              <span style="font-size:13px;color:#888;">BTW (21%)</span>
              <span style="font-size:13px;color:#888;">€${btw}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:2px solid #f0ece6;">
              <span style="font-size:16px;font-weight:700;color:#1a1a1a;">Totaal</span>
              <span style="font-size:18px;font-weight:700;color:#c9a96e;">€${total}</span>
            </div>

            <!-- Thank you -->
            <div style="margin-top:32px;padding:20px;background:#f9f7f4;border-radius:12px;text-align:center;">
              <div style="font-size:14px;color:#666;">Bedankt voor je bezoek! 💅</div>
              <div style="font-size:12px;color:#999;margin-top:4px;">We zien je graag terug.</div>
            </div>
          </div>

          <!-- Footer -->
          <div style="padding:20px 32px;border-top:1px solid #f0ece6;text-align:center;">
            <div style="font-size:11px;color:#bbb;">Verstuurd via <span style="color:#c9a96e;">Vellu</span> · vellu.cc</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${businessName} via Vellu <${FROM_EMAIL}>`,
        to: [clientEmail],
        subject: `Factuur van ${businessName} - ${date}`,
        html,
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify({ success: true, data }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
