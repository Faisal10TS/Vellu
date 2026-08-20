// Mollie webhook receiver. Re-fetches payment from Mollie API for security.
// Idempotent on (mollie_payment_id, event_type). Deployed verify_jwt=false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY")!;
const MOLLIE_BASE_URL = "https://api.mollie.com/v2";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") || "mirahventures@vellu.cc";
// Owner-facing mail gaat in de taal van de SALON, niet van de klant. Zelfde
// verzameling als in cancel-appointment en send-reminders; hier gekopieerd
// omdat edge functions geen gedeelde module hebben.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function plain(status: number, body: string) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

async function mollieFetch(path: string, init?: RequestInit) {
  const r = await fetch(`${MOLLIE_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${MOLLIE_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: r.status, ok: r.ok, data, raw: text };
}

interface MolliePayment {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  description?: string;
  customerId?: string;
  mandateId?: string;
  subscriptionId?: string;
  sequenceType?: string;
  paidAt?: string;
  metadata?: Record<string, unknown> | null;
  _links?: Record<string, { href?: string }>;
}

function addInterval(from: Date, interval: "monthly" | "yearly", n = 1): Date {
  const d = new Date(from);
  if (interval === "monthly") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}

function classifyEvent(p: MolliePayment): string {
  const seq = p.sequenceType || "oneoff";
  return `${seq}.${p.status}`;
}

// Een eerste- of jaarbetaling die niet doorging. HIER GING EERDER NIETS UIT —
// alleen een console.log. Gevolg: een salon die wilde betalen zag een
// laadscherm, kreeg daarna niets te horen, en moest zelf navragen of er nu wel
// of geen geld was afgeschreven. Precies dat gebeurde op 19 augustus bij een
// salon op Bonaire: haar RBC-kaart werd door de bank geweigerd (3-D Secure was
// wél geslaagd), de betaling verliep, en niemand kreeg een seintje.
//
// Uitgefactoreerd zodat het maandpad (first) en het jaarpad (oneoff) exact
// hetzelfde doen: een mail naar de salon met wat er aan de hand is en wat te
// doen, plus een waarschuwing naar de beheerder.
async function notifyPaymentFailed(
  payment: MolliePayment,
  profile: Record<string, unknown>,
  meta: { plan?: string; billing_interval?: string } | null,
  ownerId: string,
): Promise<void> {
  console.log("payment did not complete:", payment.id, payment.status);

  // Mollie zet de reden in details.failureReason bij een weigering. Bij een
  // verlopen betaling is er geen failureReason; dan is de status zelf de reden
  // ("expired" = niet op tijd afgerond).
  const det = (payment as unknown as { details?: Record<string, unknown> }).details || {};
  const reasonCode = String(det.failureReason || payment.status || "");
  const reasonMessage = String(det.failureMessage || "");
  const p = profile;

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
      method: "POST",
      headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "payment_failed",
        booking: {
          owner_email: p.email,
          owner_id: ownerId,
          // Salon-taal, niet klant-taal: dit is een bericht aan de eigenaar.
          owner_lang: DUTCH_COUNTRIES.has(String(p.country_code || "NL")) ? "nl" : "en",
          business_name: p.business_name,
          salon_name: p.business_name,
          plan: meta?.plan || p.plan || "starter",
          billing_interval: meta?.billing_interval || p.billing_interval || "monthly",
          amount: parseFloat(payment.amount.value),
          trial_ends_at: p.trial_ends_at || null,
          reason_code: reasonCode,
          reason_message: reasonMessage,
        },
      }),
    });
  } catch (e) { console.error("payment_failed email error:", e); }

  // En een seintje naar onszelf. Een mislukte betaling is een klant die op het
  // punt stond te betalen en nu vastloopt; dat wil je dezelfde dag weten, niet
  // pas als hij eruit valt.
  try {
    if (RESEND_API_KEY) {
      const detail = [
        `Salon: ${p.business_name || "?"} (${p.email || "?"})`,
        `Bedrag: EUR ${payment.amount.value}`,
        `Plan: ${meta?.plan || "?"} (${meta?.billing_interval || "?"})`,
        `Status: ${payment.status}`,
        `Reden: ${reasonCode}${reasonMessage ? ` — ${reasonMessage}` : ""}`,
        det.cardIssuer ? `Kaart: ${det.cardLabel || "?"} van ${det.cardIssuer} (${det.cardIssuerCountry || "?"})` : "",
        `Mollie: ${payment.id}`,
      ].filter(Boolean).join("<br/>");
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Vellu Monitoring <noreply@vellu.cc>",
          to: [ADMIN_ALERT_EMAIL],
          subject: `Betaling mislukt: ${p.business_name || ownerId}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:640px;">
            <h2 style="margin:0 0 12px;">Een salon kon niet betalen</h2>
            <p style="color:#666;margin:0 0 16px;">De salon heeft hier zelf een mail over gekregen met wat te doen.</p>
            <p style="font-size:13px;line-height:1.7;">${detail}</p></div>`,
        }),
      });
    }
  } catch (e) { console.error("admin alert error:", e); }
}

async function logEvent(ownerId: string | null, p: MolliePayment, eventType: string): Promise<boolean> {
  const { error } = await supabase.from("payment_events").insert({
    owner_id: ownerId,
    mollie_payment_id: p.id,
    mollie_customer_id: p.customerId || null,
    mollie_subscription_id: p.subscriptionId || null,
    event_type: eventType,
    status: p.status,
    amount_eur: parseFloat(p.amount.value),
    currency: p.amount.currency,
    description: p.description || null,
    raw_payload: p as unknown as Record<string, unknown>,
  });
  if (!error) return true;
  const code = (error as { code?: string }).code;
  const msg = (error as { message?: string }).message || "";
  if (code === "23505" || msg.includes("payment_events_mollie_payment_event_type_uniq")) {
    return false;
  }
  console.error("payment_events insert error:", error);
  throw error;
}

// \u2500\u2500 BTW op Vellu's EIGEN abonnementsfactuur \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Let op: dit gaat NIET over de belasting die een salon aan haar klanten
// rekent (dat is src/taxEngine.js), maar over wat Vellu aan de salon factureert.
//
// Vellu is in Nederland gevestigd en levert een langs elektronische weg
// verrichte dienst. Voor een afnemer in Nederland is dat 21%. De Caribische
// delen van het Koninkrijk vallen BUITEN het EU-BTW-gebied \u2014 ook Bonaire,
// Saba en Sint Eustatius, die staatsrechtelijk w\u00e9l Nederland zijn. Dat
// onderscheid is precies waar het misgaat, en het stond hier hardgecodeerd op
// 21% voor iedereen.
const NL_VAT = 0.21;
// Buiten het EU-BTW-gebied. De BES-eilanden zijn staatsrechtelijk Nederland
// maar EU-rechtelijk LGO (art. 355 lid 2 VWEU): de BTW-richtlijn geldt er niet.
// Aruba, Curacao en Sint Maarten zijn zelfstandige landen met een eigen stelsel.
const OUTSIDE_EU_VAT = ["BQ", "AW", "CW", "SX"];
// NULL, niet 0. "0%" is een TARIEF en suggereert een in Nederland belaste
// nultarief-prestatie; hier is de dienst helemaal niet in Nederland belastbaar
// omdat de plaats van dienst bij de afnemer ligt (art. 6 lid 1 Wet OB voor een
// ondernemer, art. 6h voor een elektronische dienst aan een particulier).
// Zet daarom ook nooit een BTW-BEDRAG op zo'n factuur, ook geen 0,00: op grond
// van art. 37 Wet OB wordt elke op een factuur vermelde omzetbelasting
// verschuldigd, ook als ze niet verschuldigd was.
function vatRateForCustomer(countryCode: string | null | undefined): number | null {
  const cc = String(countryCode || "NL").toUpperCase();
  if (OUTSIDE_EU_VAT.includes(cc)) return null;
  return NL_VAT;
}

async function createInvoice(ownerId: string, eventId: string | null, p: MolliePayment, plan: string, interval: "monthly" | "yearly", customerCountry: string | null, periodStart: Date, periodEnd: Date) {
  const total = parseFloat(p.amount.value);
  // Het BEDRAG dat de klant betaalt verandert niet; alleen of er Nederlandse
  // BTW in verwerkt zit. Bij 0% is het hele bedrag de vergoeding.
  const vatRate = vatRateForCustomer(customerCountry);
  // Buiten het toepassingsgebied: het hele bedrag is de vergoeding en er is
  // geen BTW-bedrag — niet 0,00 maar helemaal geen.
  const exclVat = vatRate === null ? total : +(total / (1 + vatRate)).toFixed(2);
  const vatAmount = vatRate === null ? null : +(total - exclVat).toFixed(2);
  const { data: numRow, error: numErr } = await supabase.rpc("get_next_vellu_invoice_number");
  if (numErr) {
    console.error("get_next_vellu_invoice_number error:", numErr);
    return null;
  }
  const invoiceNumber = numRow as unknown as string;
  const { data: inv, error: invErr } = await supabase
    .from("payment_invoices")
    .insert({
      owner_id: ownerId,
      payment_event_id: eventId,
      invoice_number: invoiceNumber,
      issued_at: new Date().toISOString(),
      period_start: periodStart.toISOString().slice(0, 10),
      period_end: periodEnd.toISOString().slice(0, 10),
      plan,
      billing_interval: interval,
      amount_excl_vat: exclVat,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total_eur: total,
    })
    .select("id, invoice_number")
    .maybeSingle();
  // De bedragen meegeven zodat de factuurmail ze niet nog een keer zelf
  // uitrekent \u2014 dat stond op twee plekken los gekopieerd met /1.21 erin en
  // dreef daardoor af zodra het tarief per land ging verschillen.
  const amounts = { amount_excl_vat: exclVat, vat_amount: vatAmount, vat_rate: vatRate };
  if (invErr) {
    console.error("payment_invoices insert error:", invErr);
    return null;
  }
  return inv ? { ...(inv as Record<string, unknown>), ...amounts } : null;
}

serve(async (req) => {
  if (req.method !== "POST") return plain(405, "method not allowed");
  const ct = req.headers.get("content-type") || "";
  let paymentId = "";
  try {
    if (ct.includes("application/json")) {
      const j = await req.json();
      paymentId = (j as { id?: string }).id || "";
    } else {
      const form = await req.formData();
      paymentId = (form.get("id") as string) || "";
    }
  } catch (e) {
    console.error("webhook body parse error:", e);
    return plain(400, "bad body");
  }
  if (!paymentId || !/^tr_[A-Za-z0-9]+$/.test(paymentId)) {
    if (!/^sub_[A-Za-z0-9]+$/.test(paymentId)) return plain(400, "bad id");
  }
  const isSub = paymentId.startsWith("sub_");
  if (isSub) {
    console.log("Subscription event received:", paymentId);
    return plain(200, "ok");
  }
  const fetched = await mollieFetch(`/payments/${paymentId}`);
  if (!fetched.ok || !fetched.data) {
    console.error("mollie payment fetch failed:", fetched.status, fetched.raw);
    return plain(200, "ok");
  }
  const payment = fetched.data as MolliePayment;
  const ownerId = (payment.metadata as { owner_id?: string } | null)?.owner_id || null;
  const eventType = classifyEvent(payment);
  let firstTime = true;
  try {
    firstTime = await logEvent(ownerId, payment, eventType);
  } catch (e) {
    console.error("logEvent error:", e);
    return plain(500, "log error");
  }
  if (!firstTime) return plain(200, "ok (duplicate)");
  if (!ownerId) {
    console.warn("payment has no owner_id metadata:", payment.id);
    return plain(200, "ok (no owner)");
  }
  const meta = payment.metadata as { plan?: string; billing_interval?: string; kind?: string } | null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan, billing_interval, mollie_customer_id, mollie_mandate_id, mollie_subscription_id, plan_expires_at, subscription_status, referral_credit_days, referral_credit_days_redeemed, email, business_name, country_code, btw_id, trial_ends_at")
    .eq("id", ownerId)
    .maybeSingle();
  if (!profile) {
    console.warn("payment owner has no profile row:", ownerId);
    return plain(200, "ok (no profile)");
  }

  // ── JAARBETALING (eenmalig, GEEN machtiging) ──────────────────────────
  // create-subscription stuurt jaarabonnementen als sequenceType "oneoff" met
  // kind "yearly_oneoff": een gewone aankoop, geen doorlopende incasso. Reden
  // staat daar uitgelegd — een machtiging wordt door veel niet-Europese banken
  // geweigerd, een eenmalige betaling niet.
  //
  // Deze tak lijkt op first.paid hieronder, maar mist bewust de subscription-
  // creatie bij Mollie: er is geen mandaat en er hoeft niets automatisch te
  // verlengen. Toegang loopt puur op plan_expires_at; de app rekent daar live
  // mee (src/App.jsx ~195), dus als die datum verstrijkt vervalt de toegang
  // vanzelf. send-renewal-reminder herinnert de salon een week van tevoren.
  if (payment.sequenceType === "oneoff" && meta?.kind === "yearly_oneoff") {
    if (payment.status === "paid") {
      const plan = meta?.plan || profile.plan || "professional";
      const periodStart = new Date();
      const periodEnd = addInterval(periodStart, "yearly");

      // Referral-krediet uit de proefperiode wordt ook hier verzilverd: de
      // eerste betaalde periode wordt met de gespaarde dagen verlengd. Zelfde
      // regel als bij het maandpad, zodat "2 weken gratis" echt gratis is.
      let creditsUsed = 0;
      let periodEndWithCredit = periodEnd;
      if ((profile.referral_credit_days || 0) > 0) {
        creditsUsed = profile.referral_credit_days || 0;
        periodEndWithCredit = new Date(periodEnd);
        periodEndWithCredit.setDate(periodEndWithCredit.getDate() + creditsUsed);
      }

      const { data: evt } = await supabase
        .from("payment_events")
        .select("id")
        .eq("mollie_payment_id", payment.id)
        .eq("event_type", eventType)
        .maybeSingle();
      const invoiceRow = await createInvoice(
        ownerId, evt?.id || null, payment, plan, "yearly",
        (profile as Record<string, unknown>).country_code as string | null,
        periodStart, periodEnd,
      );
      const invoiceFields = invoiceRow ? {
        invoice_number: (invoiceRow as { invoice_number: string }).invoice_number,
        amount_excl_vat: (invoiceRow as { amount_excl_vat: number }).amount_excl_vat,
        vat_amount: (invoiceRow as { vat_amount: number }).vat_amount,
        vat_rate: (invoiceRow as { vat_rate: number }).vat_rate,
        period_start: periodStart.toISOString(),
      } : {};

      const yearUpdates: Record<string, unknown> = {
        plan,
        billing_interval: "yearly",
        subscription_status: "active",
        // GEEN mollie_subscription_id: er is bewust geen doorlopend abonnement
        // bij Mollie. Een eventueel oud abonnement-id wissen we, zodat de
        // recurring-takken hieronder deze salon niet als abonnee behandelen.
        mollie_subscription_id: null,
        mollie_mandate_id: null,
        current_period_start: periodStart.toISOString(),
        plan_expires_at: periodEndWithCredit.toISOString(),
        cancel_at_period_end: false,
        cancelled_at: null,
      };
      if (creditsUsed > 0) {
        yearUpdates.referral_credit_days = 0;
        yearUpdates.referral_credit_days_redeemed =
          ((profile as { referral_credit_days_redeemed?: number }).referral_credit_days_redeemed || 0) + creditsUsed;
      }
      await supabase.from("profiles").update(yearUpdates).eq("id", ownerId);

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: (profile as Record<string, unknown>).email,
              owner_id: ownerId,
              plan,
              billing_interval: "yearly",
              amount: parseFloat(payment.amount.value),
              period_end: periodEndWithCredit.toISOString(),
              business_name: (profile as Record<string, unknown>).business_name,
              credits_used: creditsUsed || 0,
              ...invoiceFields,
            },
          }),
        });
      } catch (e) { console.error("yearly subscription_invoice email error:", e); }
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      // Zelfde mislukte-betaling-afhandeling als bij het maandpad: een mail
      // naar de salon en een seintje naar de beheerder. Uitgefactoreerd zodat
      // beide takken exact hetzelfde doen.
      await notifyPaymentFailed(payment, profile, meta, ownerId);
    }
    return plain(200, "ok");
  }

  if (payment.sequenceType === "first") {
    if (payment.status === "paid") {
      const plan = meta?.plan || profile.plan || "starter";
      const interval = (meta?.billing_interval || profile.billing_interval || "monthly") as "monthly" | "yearly";
      const mandateId = payment.mandateId || profile.mollie_mandate_id || "";
      const periodStart = new Date();
      const periodEnd = addInterval(periodStart, interval);
      // Referral credit earned during the trial is honored at conversion:
      // the first paid period is extended by the credited days AND the
      // subscription only starts charging after them — so "2 weeks free"
      // are genuinely free, not just a drifting expiry date.
      let firstCreditsUsed = 0;
      let firstEnd = periodEnd;
      if ((profile.referral_credit_days || 0) > 0) {
        firstCreditsUsed = profile.referral_credit_days || 0;
        firstEnd = new Date(periodEnd);
        firstEnd.setDate(firstEnd.getDate() + firstCreditsUsed);
      }
      let subscriptionId = "";
      if (payment.customerId && mandateId) {
        const intervalStr = interval === "yearly" ? "12 months" : "1 month";
        const startDate = firstEnd.toISOString().slice(0, 10);
        const subRes = await mollieFetch(`/customers/${payment.customerId}/subscriptions`, {
          method: "POST",
          body: JSON.stringify({
            amount: payment.amount,
            interval: intervalStr,
            startDate,
            description: payment.description?.replace(" — first payment", "") || `Vellu ${plan}`,
            mandateId,
            webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
            metadata: { owner_id: ownerId, plan, billing_interval: interval },
          }),
        });
        if (subRes.ok && subRes.data && typeof subRes.data === "object") {
          subscriptionId = (subRes.data as { id: string }).id;
        } else {
          console.error("subscription create failed:", subRes.status, subRes.raw);
        }
      }
      const { data: evt } = await supabase
        .from("payment_events")
        .select("id")
        .eq("mollie_payment_id", payment.id)
        .eq("event_type", eventType)
        .maybeSingle();
      const invoiceRow = await createInvoice(ownerId, evt?.id || null, payment, plan, interval, (profile as Record<string, unknown>).country_code as string | null, periodStart, periodEnd);
      const invoiceFields = invoiceRow ? {
        invoice_number: (invoiceRow as { invoice_number: string }).invoice_number,
        amount_excl_vat: (invoiceRow as { amount_excl_vat: number }).amount_excl_vat,
        vat_amount: (invoiceRow as { vat_amount: number }).vat_amount,
        vat_rate: (invoiceRow as { vat_rate: number }).vat_rate,
        period_start: periodStart.toISOString(),
      } : {};
      const firstUpdates: Record<string, unknown> = {
        plan,
        billing_interval: interval,
        subscription_status: "active",
        mollie_mandate_id: mandateId,
        mollie_subscription_id: subscriptionId || profile.mollie_subscription_id,
        current_period_start: periodStart.toISOString(),
        plan_expires_at: firstEnd.toISOString(),
        cancel_at_period_end: false,
        cancelled_at: null,
      };
      if (firstCreditsUsed > 0) {
        firstUpdates.referral_credit_days = 0;
        firstUpdates.referral_credit_days_redeemed =
          ((profile as { referral_credit_days_redeemed?: number }).referral_credit_days_redeemed || 0) + firstCreditsUsed;
      }
      await supabase.from("profiles").update(firstUpdates).eq("id", ownerId);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: (profile as Record<string, unknown>).email,
              owner_id: ownerId,
              plan,
              billing_interval: interval,
              amount: parseFloat(payment.amount.value),
              period_end: firstEnd.toISOString(),
              business_name: (profile as Record<string, unknown>).business_name,
              credits_used: firstCreditsUsed || 0,
              ...invoiceFields,
            },
          }),
        });
      } catch (e) { console.error("subscription_invoice email error:", e); }
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      await notifyPaymentFailed(payment, profile, meta, ownerId);
    }
    return plain(200, "ok");
  }
  // ── PRO-RATA UPGRADE CHARGE (one-off, NOT a renewal) ──────────────────
  // A recurring mandate payment created by change-plan for a mid-period
  // upgrade. It must NOT move plan_expires_at, NOT touch current_period_start,
  // NOT consume referral_credit_days, and NOT flip the account to past_due:
  // the subscription itself is untouched. It only records + emails the invoice
  // for the difference. On failure the upgrade is already applied server-side,
  // so we just log it for manual follow-up.
  if (payment.sequenceType === "recurring" && meta?.kind === "upgrade_proration") {
    if (payment.status === "paid") {
      const plan = meta?.plan || profile.plan || "professional";
      const interval = (meta?.billing_interval || profile.billing_interval || "monthly") as "monthly" | "yearly";
      const metaP = payment.metadata as { period_start?: string; period_end?: string } | null;
      const periodStart = metaP?.period_start ? new Date(metaP.period_start) : new Date();
      const periodEnd = metaP?.period_end
        ? new Date(metaP.period_end)
        : (profile.plan_expires_at ? new Date(profile.plan_expires_at) : addInterval(periodStart, interval));
      const { data: evt } = await supabase
        .from("payment_events")
        .select("id")
        .eq("mollie_payment_id", payment.id)
        .eq("event_type", eventType)
        .maybeSingle();
      const invoiceRow = await createInvoice(ownerId, evt?.id || null, payment, plan, interval, (profile as Record<string, unknown>).country_code as string | null, periodStart, periodEnd);
      const invoiceFields = invoiceRow ? {
        invoice_number: (invoiceRow as { invoice_number: string }).invoice_number,
        amount_excl_vat: (invoiceRow as { amount_excl_vat: number }).amount_excl_vat,
        vat_amount: (invoiceRow as { vat_amount: number }).vat_amount,
        vat_rate: (invoiceRow as { vat_rate: number }).vat_rate,
        period_start: periodStart.toISOString(),
      } : {};
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: (profile as Record<string, unknown>).email,
              owner_id: ownerId,
              plan,
              billing_interval: interval,
              amount: parseFloat(payment.amount.value),
              period_end: periodEnd.toISOString(),
              business_name: (profile as Record<string, unknown>).business_name,
              ...invoiceFields,
            },
          }),
        });
      } catch (e) { console.error("proration invoice email error:", e); }
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      // Upgrade already applied; we simply didn't collect the small
      // difference. Log loudly for manual follow-up — do NOT flip the
      // account to past_due (the subscription itself is fine).
      console.error("upgrade proration charge did not settle:", payment.id, payment.status, "owner", ownerId);
    }
    return plain(200, "ok");
  }
  if (payment.sequenceType === "recurring") {
    if (payment.status === "paid") {
      const plan = profile.plan || "starter";
      const interval = (profile.billing_interval || "monthly") as "monthly" | "yearly";
      const prevEnd = profile.plan_expires_at ? new Date(profile.plan_expires_at) : new Date();
      const periodStart = prevEnd;
      const periodEnd = addInterval(prevEnd, interval);
      const { data: evt } = await supabase
        .from("payment_events")
        .select("id")
        .eq("mollie_payment_id", payment.id)
        .eq("event_type", eventType)
        .maybeSingle();
      const invoiceRow = await createInvoice(ownerId, evt?.id || null, payment, plan, interval, (profile as Record<string, unknown>).country_code as string | null, periodStart, periodEnd);
      const invoiceFields = invoiceRow ? {
        invoice_number: (invoiceRow as { invoice_number: string }).invoice_number,
        amount_excl_vat: (invoiceRow as { amount_excl_vat: number }).amount_excl_vat,
        vat_amount: (invoiceRow as { vat_amount: number }).vat_amount,
        vat_rate: (invoiceRow as { vat_rate: number }).vat_rate,
        period_start: periodStart.toISOString(),
      } : {};
      // Referral credit is stored in DAYS (3 weeks = 21 per referral) and
      // extends the paid period on top, at no charge.
      let extraEnd = periodEnd;
      let creditsUsed = 0;
      if ((profile.referral_credit_days || 0) > 0) {
        creditsUsed = profile.referral_credit_days || 0;
        extraEnd = new Date(periodEnd);
        extraEnd.setDate(extraEnd.getDate() + creditsUsed);
      }
      const updates: Record<string, unknown> = {
        subscription_status: "active",
        current_period_start: periodStart.toISOString(),
        plan_expires_at: extraEnd.toISOString(),
      };
      if (creditsUsed > 0) {
        updates.referral_credit_days = 0;
        // Lifetime redeemed counter — the dashboard shows open balance vs
        // redeemed; with the reward rate change (21 → 14 days) history can
        // only be tracked, not reconstructed.
        updates.referral_credit_days_redeemed =
          ((profile as { referral_credit_days_redeemed?: number }).referral_credit_days_redeemed || 0) + creditsUsed;
      }
      // Make the free days REAL: Mollie charges on its own fixed schedule,
      // so extending plan_expires_at alone would keep collecting every
      // interval and the credit would never become skipped payments.
      // Reschedule: cancel the running subscription and recreate it starting
      // when the credited period ends. Cancel-FIRST on purpose — if the
      // recreate fails the customer keeps access until extraEnd and we miss
      // at most one renewal (logged loudly for manual repair); the reverse
      // order could double-charge them, which is worse.
      if (creditsUsed > 0 && payment.customerId) {
        const oldSubId = payment.subscriptionId || profile.mollie_subscription_id || "";
        const mandateId = payment.mandateId || profile.mollie_mandate_id || "";
        if (oldSubId && mandateId) {
          const del = await mollieFetch(`/customers/${payment.customerId}/subscriptions/${oldSubId}`, { method: "DELETE" });
          if (!del.ok) {
            console.error("credit reschedule: cancel of", oldSubId, "failed:", del.status, del.raw, "— owner", ownerId, "keeps old schedule; credit only extends expiry this cycle");
          } else {
            const intervalStr = interval === "yearly" ? "12 months" : "1 month";
            const subRes = await mollieFetch(`/customers/${payment.customerId}/subscriptions`, {
              method: "POST",
              body: JSON.stringify({
                amount: payment.amount,
                interval: intervalStr,
                startDate: extraEnd.toISOString().slice(0, 10),
                description: payment.description || `Vellu ${plan}`,
                mandateId,
                webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
                metadata: { owner_id: ownerId, plan, billing_interval: interval },
              }),
            });
            if (subRes.ok && subRes.data && typeof subRes.data === "object") {
              updates.mollie_subscription_id = (subRes.data as { id: string }).id;
            } else {
              // Old subscription is cancelled and the new one failed: the
              // customer keeps access until extraEnd, but nothing will renew
              // after that. Log with everything needed for manual repair.
              console.error("credit reschedule: RECREATE FAILED after cancel — restore subscription manually! owner", ownerId, "customer", payment.customerId, "mandate", mandateId, "startDate", extraEnd.toISOString().slice(0, 10), "resp:", subRes.status, subRes.raw);
              updates.mollie_subscription_id = null;
            }
          }
        }
      }
      await supabase.from("profiles").update(updates).eq("id", ownerId);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: (profile as Record<string, unknown>).email,
              owner_id: ownerId,
              plan,
              billing_interval: interval,
              amount: parseFloat(payment.amount.value),
              period_end: extraEnd.toISOString(),
              business_name: (profile as Record<string, unknown>).business_name,
              credits_used: creditsUsed || 0,
              ...invoiceFields,
            },
          }),
        });
      } catch (e) { console.error("subscription_invoice email error:", e); }
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      await supabase
        .from("profiles")
        .update({ subscription_status: "past_due" })
        .eq("id", ownerId);
    }
    return plain(200, "ok");
  }
  return plain(200, "ok");
});
