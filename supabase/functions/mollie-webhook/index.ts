// Mollie webhook receiver. Re-fetches payment from Mollie API for security.
// Idempotent on (mollie_payment_id, event_type). Deployed verify_jwt=false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY")!;
const MOLLIE_BASE_URL = "https://api.mollie.com/v2";
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

async function createInvoice(ownerId: string, eventId: string | null, p: MolliePayment, plan: string, interval: "monthly" | "yearly", periodStart: Date, periodEnd: Date) {
  const total = parseFloat(p.amount.value);
  const vatRate = 0.21;
  const exclVat = +(total / (1 + vatRate)).toFixed(2);
  const vatAmount = +(total - exclVat).toFixed(2);
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
  if (invErr) {
    console.error("payment_invoices insert error:", invErr);
    return null;
  }
  return inv;
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
    .select("id, plan, billing_interval, mollie_customer_id, mollie_mandate_id, mollie_subscription_id, plan_expires_at, subscription_status, referral_credit_days, email, business_name")
    .eq("id", ownerId)
    .maybeSingle();
  if (!profile) {
    console.warn("payment owner has no profile row:", ownerId);
    return plain(200, "ok (no profile)");
  }
  if (payment.sequenceType === "first") {
    if (payment.status === "paid") {
      const plan = meta?.plan || profile.plan || "starter";
      const interval = (meta?.billing_interval || profile.billing_interval || "monthly") as "monthly" | "yearly";
      const mandateId = payment.mandateId || profile.mollie_mandate_id || "";
      const periodStart = new Date();
      const periodEnd = addInterval(periodStart, interval);
      let subscriptionId = "";
      if (payment.customerId && mandateId) {
        const intervalStr = interval === "yearly" ? "12 months" : "1 month";
        const startDate = periodEnd.toISOString().slice(0, 10);
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
      const invoiceRow = await createInvoice(ownerId, evt?.id || null, payment, plan, interval, periodStart, periodEnd);
      const invoiceFields = invoiceRow ? {
        invoice_number: (invoiceRow as { invoice_number: string }).invoice_number,
        amount_excl_vat: +(parseFloat(payment.amount.value) / 1.21).toFixed(2),
        vat_amount: +(parseFloat(payment.amount.value) - parseFloat(payment.amount.value) / 1.21).toFixed(2),
        vat_rate: 0.21,
        period_start: periodStart.toISOString(),
      } : {};
      await supabase
        .from("profiles")
        .update({
          plan,
          billing_interval: interval,
          subscription_status: "active",
          mollie_mandate_id: mandateId,
          mollie_subscription_id: subscriptionId || profile.mollie_subscription_id,
          current_period_start: periodStart.toISOString(),
          plan_expires_at: periodEnd.toISOString(),
          cancel_at_period_end: false,
          cancelled_at: null,
        })
        .eq("id", ownerId);
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
      } catch (e) { console.error("subscription_invoice email error:", e); }
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      console.log("first payment did not complete:", payment.id, payment.status);
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
      const invoiceRow = await createInvoice(ownerId, evt?.id || null, payment, plan, interval, periodStart, periodEnd);
      const invoiceFields = invoiceRow ? {
        invoice_number: (invoiceRow as { invoice_number: string }).invoice_number,
        amount_excl_vat: +(parseFloat(payment.amount.value) / 1.21).toFixed(2),
        vat_amount: +(parseFloat(payment.amount.value) - parseFloat(payment.amount.value) / 1.21).toFixed(2),
        vat_rate: 0.21,
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
      const invoiceRow = await createInvoice(ownerId, evt?.id || null, payment, plan, interval, periodStart, periodEnd);
      const invoiceFields = invoiceRow ? {
        invoice_number: (invoiceRow as { invoice_number: string }).invoice_number,
        amount_excl_vat: +(parseFloat(payment.amount.value) / 1.21).toFixed(2),
        vat_amount: +(parseFloat(payment.amount.value) - parseFloat(payment.amount.value) / 1.21).toFixed(2),
        vat_rate: 0.21,
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
      if (creditsUsed > 0) updates.referral_credit_days = 0;
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
