// supabase/functions/send-followups/index.ts
//
// Vraagt de klant om een review NA het bezoek. Cron: dagelijks 10:30 UTC.
//
// Deze functie heeft sinds haar bestaan nog nooit één mail verstuurd (0 van 309
// afspraken): de cron-opdracht riep net.http_post aan met 'application/json' als
// DERDE positionele argument, en dat is `params jsonb` — geen content-type. Elke
// run eindigde in "invalid input syntax for type json". De cron is inmiddels op
// named arguments gezet, net als send-daily-reminders die wél werkte.
//
// Drie regels die de opzet bepalen:
//
//  1. NOOIT VÓÓR DE AFSPRAAK. De selectie kijkt alleen naar datums die al
//     voorbij zijn, en er staat een tweede check per rij. Een review-verzoek dat
//     binnenkomt voordat de klant geweest is, is erger dan geen review-verzoek.
//
//  2. GEEN KASSAVERKOPEN. Een losse verkoop is een 0-minuten "afspraak" met
//     is_sale = true. "Hoe was je afspraak?" over een fles shampoo slaat nergens
//     op. Oude rijen missen de vlag, vandaar ook de structurele check.
//
//  3. LOSSTAAND VAN DE FACTUUR. Dit is bewust een aparte mail: de factuur gaat
//     bij het afrekenen de deur uit, dit verzoek pas de dag erna. Zo staat de
//     review-vraag niet in de weg van een betaalverzoek, en andersom.
//
// Het venster is drie dagen breed zodat één mislukte cron-run de mail niet laat
// verdampen; followup_sent voorkomt dat iemand hem twee keer krijgt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Elke run landt in cron_health; de cron-watchdog kijkt daarnaar en slaat alarm
// als een job stilvalt. Nooit weghalen — dit is de enige manier waarop een
// stilgevallen cron opvalt zonder dat iemand het toevallig merkt.
async function recordHealth(status: string, ms: number, processed: number, err?: unknown) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "send-followups",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* health-logging mag de mail nooit tegenhouden */ }
}

// Hoeveel dagen terug we kijken. 1 = alleen gisteren; meer is puur inhaalmarge
// voor een dag dat de cron niet liep.
const GRACE_DAYS = 3;

const ymd = (d: Date) => d.toISOString().split("T")[0];
const shiftDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

// De klant leest de mail in de taal waarin hij geboekt heeft; valt die weg, dan
// de taal van het land van de salon (zelfde regel als de rest van de mails).
const DUTCH_COUNTRIES = ["NL", "BE", "AW", "CW", "BQ", "SX"];
const langFor = (apptLang: string | null, country: string | null) => {
  const l = String(apptLang || "").toLowerCase();
  if (l === "nl" || l === "en" || l === "es") return l;
  return DUTCH_COUNTRIES.includes(String(country || "NL").toUpperCase()) ? "nl" : "en";
};

const T = {
  nl: {
    subject: (s: string) => `Hoe was je afspraak bij ${s}?`,
    hi: (n: string) => n ? `Hoi ${n},` : "Hoi,",
    intro: (s: string) => `Je was onlangs bij <strong>${s}</strong>:`,
    ask: "We horen graag hoe het was — het kost je een halve minuut.",
    cta: "Beoordeel je afspraak",
    ctaGoogle: "Ook op Google",
    googleHint: (s: string) => `Een review op Google helpt ${s} nog meer`,
    rebook: "Opnieuw boeken →",
    at: "om",
  },
  en: {
    subject: (s: string) => `How was your visit to ${s}?`,
    hi: (n: string) => n ? `Hi ${n},` : "Hi,",
    intro: (s: string) => `You recently visited <strong>${s}</strong>:`,
    ask: "We'd love to hear how it went — it takes half a minute.",
    cta: "Rate your appointment",
    ctaGoogle: "Also on Google",
    googleHint: (s: string) => `A Google review helps ${s} even more`,
    rebook: "Book again →",
    at: "at",
  },
  es: {
    subject: (s: string) => `¿Cómo fue tu cita en ${s}?`,
    hi: (n: string) => n ? `Hola ${n},` : "Hola,",
    intro: (s: string) => `Estuviste hace poco en <strong>${s}</strong>:`,
    ask: "Nos encantaría saber cómo fue — te lleva medio minuto.",
    cta: "Valora tu cita",
    ctaGoogle: "También en Google",
    googleHint: (s: string) => `Una reseña en Google ayuda aún más a ${s}`,
    rebook: "Reservar de nuevo →",
    at: "a las",
  },
} as const;

// Zelfde bron en lengte als het annuleertoken in book-appointment: 32 bytes uit
// crypto.getRandomValues, hex. Geen Math.random() — dit token is het enige
// bewijs dat iemand écht bij deze salon is geweest.
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Hoe lang een review-uitnodiging geldig blijft. Ruim, want mensen laten zo'n
// mail weken staan; korter dan "voor altijd", want een slingerend token in een
// oude mailbox hoort een keer te verlopen.
const REVIEW_TOKEN_DAYS = 60;

// Een kassaverkoop herkennen, ook als de is_sale-vlag ontbreekt (rijen van vóór
// die kolom): geen dienst, geen duur, wel productregels.
const isSaleRow = (a: any) =>
  a?.is_sale === true ||
  (!a?.service_id && (parseInt(a?.service_duration) || 0) === 0 &&
    Array.isArray(a?.products) && a.products.length > 0);

serve(async () => {
  const t0 = Date.now();
  try {
    const todayStr = ymd(new Date());
    const fromStr = ymd(shiftDays(-GRACE_DAYS));
    const untilStr = ymd(shiftDays(-1));

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, owner_id, date, time, service_name, client_name, client_email, lang, status, is_sale, service_id, service_duration, products, profiles(business_name, slug, accent_color, country_code, google_place_id)")
      .eq("followup_sent", false)
      .gte("date", fromStr)
      .lte("date", untilStr)
      .not("status", "in", '("cancelled","no_show")');

    if (error) {
      console.error("Error fetching appointments:", error);
      await recordHealth("error", Date.now() - t0, 0, error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    let sent = 0, skipped = 0;
    for (const appt of appointments || []) {
      if (!appt.client_email) { skipped++; continue; }
      // Tweede slot op de deur: nooit op of na de dag van de afspraak zelf.
      if (!appt.date || appt.date >= todayStr) { skipped++; continue; }
      if (isSaleRow(appt)) { skipped++; continue; }

      const p: any = appt.profiles || {};
      const salonName = p.business_name || "de salon";
      const slug = p.slug || "";
      const accent = /^#[0-9a-f]{6}$/i.test(String(p.accent_color || "")) ? p.accent_color : "#c9a96e";
      const lang = langFor(appt.lang, p.country_code);
      const t = T[lang as keyof typeof T];

      // ?review=true kón nooit werken: de app geeft bewust een leeg e-mailadres
      // door (een ?email=-parameter is te vervalsen) terwijl de RLS-regel op
      // reviews een niet-leeg adres én een afgeronde afspraak eist. Elke insert
      // liep dus stuk. Nu krijgt elke uitnodiging een eigen token; submit_review
      // wisselt dat token in voor de identiteit die wij hier vastleggen.
      let reviewUrl = "";
      try {
        const token = generateToken();
        const expiresAt = new Date(Date.now() + REVIEW_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { error: tokenError } = await supabase.from("review_tokens").insert({
          token,
          appointment_id: appt.id,
          owner_id: appt.owner_id,
          client_email: appt.client_email,
          expires_at: expiresAt,
        });
        if (tokenError) throw tokenError;
        reviewUrl = `https://vellu.cc/${slug}?review=${token}`;
      } catch (tokenErr) {
        // Bewuste keuze: de mail gaat wél de deur uit, zonder reviewknop. De
        // rest (bedankje, Google-review, opnieuw boeken) heeft op zichzelf
        // waarde, en followup_sent gaat daarna op true — dus de klant krijgt
        // deze mail niet alsnog dubbel. Wel loggen, want structureel falen hier
        // betekent stilzwijgend geen enkele eigen review meer.
        console.error("Review token aanmaken mislukt (mail gaat zonder reviewknop):", appt.id, tokenErr);
      }
      const rebookUrl = `https://vellu.cc/${slug}`;
      // Zonder geldig token geen knop: een link die gegarandeerd op een foutmelding
      // uitkomt is slechter dan geen link. De uitnodigende zin gaat dan mee weg.
      const reviewBlock = reviewUrl
        ? `<p style="font-size: 14px; color: #555; line-height: 1.6;">${t.ask}</p>
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${reviewUrl}" style="display: inline-block; background: ${accent}; color: #0d0b0a; padding: 14px 32px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase;">${t.cta}</a>
                </div>`
        : "";
      // Heeft de salon een Google-vestiging gekoppeld, dan komt daar een TWEEDE
      // knop bij. Niet in plaats van de eigen review: die komt op de
      // boekingspagina te staan en werkt ook voor salons zonder Google-profiel.
      const googleBlock = p.google_place_id
        ? `<div style="text-align:center;margin:12px 0 24px;"><a href="https://search.google.com/local/writereview?placeid=${encodeURIComponent(p.google_place_id)}" style="display:inline-block;border:1px solid #4285f4;color:#4285f4;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:500;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;">${t.ctaGoogle}</a><div style="font-size:11px;color:#999;margin-top:8px;">${t.googleHint(salonName)}</div></div>`
        : "";

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
            subject: t.subject(salonName),
            html: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1714;">
                <div style="text-align: center; margin-bottom: 32px;">
                  <div style="font-size: 24px; font-weight: 300; letter-spacing: 0.18em; color: ${accent};">vellu</div>
                </div>

                <p style="font-size: 16px; margin-bottom: 8px;">${t.hi(appt.client_name?.split(" ")[0] || "")}</p>

                <p style="font-size: 14px; color: #555; line-height: 1.6;">${t.intro(salonName)}</p>

                <div style="background: #f8f7f5; border-radius: 12px; padding: 16px; margin: 16px 0;">
                  <div style="font-weight: 500;">${appt.service_name || ""}</div>
                  <div style="font-size: 13px; color: #888; margin-top: 4px;">${appt.date} ${t.at} ${appt.time || ""}</div>
                </div>

                ${reviewBlock}
                ${googleBlock}
                <div style="text-align: center; margin: 16px 0;">
                  <a href="${rebookUrl}" style="display: inline-block; border: 1px solid ${accent}; color: ${accent}; padding: 12px 28px; border-radius: 100px; text-decoration: none; font-weight: 500; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;">
                    ${t.rebook}
                  </a>
                </div>

                <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />

                <p style="font-size: 11px; color: #bbb; text-align: center;">
                  ${salonName} via Vellu · <a href="https://vellu.cc" style="color: ${accent}; text-decoration: none;">vellu.cc</a>
                </p>
              </div>
            `,
          }),
        });

        if (res.ok) {
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

    await recordHealth("success", Date.now() - t0, sent, null);
    return new Response(
      JSON.stringify({ success: true, sent, skipped, window: `${fromStr}..${untilStr}`, total: appointments?.length || 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Function error:", err);
    await recordHealth("error", Date.now() - t0, 0, err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
