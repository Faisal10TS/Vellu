// supabase/functions/mollie-webhook/index.ts
//
// Mollie webhook receiver — handles payment status changes for both:
//   • first payments (mandate establishment after PlanSelection checkout)
//   • recurring payments (auto-charges from Mollie subscription resource)
//   • subscription lifecycle events (Mollie sends a different webhook for these)
//
// Security model: Mollie webhooks are NOT signed. The webhook body is just
// `id=tr_xxxxx`. To prevent forgery we IGNORE the request body's claims and
// re-fetch the payment from Mollie's API using our secret key. Either:
//   - the ID is unknown to Mollie → 404 → drop it
//   - the ID is ours → we get the AUTHORITATIVE status
// This is the standard Mollie webhook pattern.
//
// Idempotency: each (mollie_payment_id, event_type) pair has a UNIQUE index
// in payment_events. We attempt the insert and treat unique-violation as
// "already processed → noop" so retries from Mollie are safe.
//
// IMPORTANT: this function MUST NOT require a JWT (deployed with
// verify_jwt=false). It's called by Mollie servers, not authenticated users.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY")!;
const MOLLIE_BASE_URL = "https://api.mollie.com/v2";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// CORS not really applicable for Mollie webhooks — just return text.
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
  status: string;                      // open, paid, failed, expired, canceled, ...
  amount: { value: string; currency: string };
  description?: string;
  customerId?: string;
  mandateId?: string;
  subscriptionId?: string;
  sequenceType?: string;               // "oneoff" | "first" | "recurring"
  paidAt?: string;
  metadata?: Record<string, unknown> | null;
  _links?: Record<string, { href?: string }>;
}

// Add `n` periods of `interval` to a date. Mollie subscription intervals use
// "1 month" / "12 months" semantics. We mirror that.
function addInterval(from: Date, interval: "monthly" | "yearly", n = 1): Date {
  const d = new Date(from);
  if (interval === "monthly") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}

// Map Mollie sequence + status to our event_type label for the audit log.
function classifyEvent(p: MolliePayment): string {
  const seq = p.sequenceType || "oneoff";
  return `${seq}.${p.status}`;
}

// Insert audit row. Returns true if newly inserted, false if duplicate (already
// processed). Other errors throw.
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
  // Postgres unique-violation code = 23505. Treat as already-processed.
  // Different supabase-js versions surface the code differently — check the message too.
  const code = (error as { code?: string }).code;
  const msg = (error as { message?: string }).message || "";
  if (code === "23505" || msg.includes("payment_events_mollie_payment_event_type_uniq")) {
    return false;
  }
  console.error("payment_events insert error:", error);
  throw error;
}

// Generate + persist a Vellu invoice for a paid recurring payment.
async function createInvoice(ownerId: string, eventId: string | null, p: MolliePayment, plan: string, interval: "monthly" | "yearly", periodStart: Date, periodEnd: Date) {
  const total = parseFloat(p.amount.value);
  // Vellu invoices are issued from NL with 21% BTW (assuming non-KOR). If
  // the user opts into KOR, set vat_rate to 0 and adjust the template. For
  // now we hardcode 21% to keep the first iteration simple.
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
  // Mollie sends application/x-www-form-urlencoded with body `id=tr_xxx`.
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
    // Could also be sub_ for subscription events — handle below.
    if (!/^sub_[A-Za-z0-9]+$/.test(paymentId)) return plain(400, "bad id");
  }

  // Re-fetch the payment from Mollie. This is the security boundary: if
  // someone POSTs us a fake id, this 404s and we exit.
  const isSub = paymentId.startsWith("sub_");
  if (isSub) {
    // Mollie subscription event — we'd need the customer ID to query, but
    // Mollie sends the ID directly. Without customer context we'd have to
    // probe. For now we just log and return 200 — actual state comes from
    // the recurring payment events.
    console.log("Subscription event received:", paymentId, "(noop, handled via recurring payment events)");
    return plain(200, "ok");
  }

  const fetched = await mollieFetch(`/payments/${paymentId}`);
  if (!fetched.ok || !fetched.data) {
    console.error("mollie payment fetch failed:", fetched.status, fetched.raw);
    // 404 → unknown payment → silent drop (200 so Mollie doesn't retry forever)
    return plain(200, "ok");
  }
  const payment = fetched.data as MolliePayment;
  const ownerId = (payment.metadata as { owner_id?: string } | null)?.owner_id || null;

  // Derive event_type for audit logging
  const eventType = classifyEvent(payment);

  // Idempotent insert
  let firstTime = true;
  try {
    firstTime = await logEvent(ownerId, payment, eventType);
  } catch (e) {
    console.error("logEvent error:", e);
    return plain(500, "log error");
  }
  if (!firstTime) {
    // Already processed this exact event_type for this payment → noop.
    return plain(200, "ok (duplicate)");
  }

  // Without owner_id metadata we can't update profile state — log + bail.
  if (!ownerId) {
    console.warn("payment has no owner_id metadata:", payment.id);
    return plain(200, "ok (no owner)");
  }

  const meta = payment.metadata as { plan?: string; billing_interval?: string; kind?: string } | null;

  // Pull current profile for context (mandate, subscription, etc.)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan, billing_interval, mollie_customer_id, mollie_mandate_id, mollie_subscription_id, plan_expires_at, subscription_status, referral_credit_months, email, business_name")
    .eq("id", ownerId)
    .maybeSingle();
  if (!profile) {
    console.warn("payment owner has no profile row:", ownerId);
    return plain(200, "ok (no profile)");
  }

  // ── FIRST PAYMENT (mandate establishment) ─────────────────────────────
  if (payment.sequenceType === "first") {
    if (payment.status === "paid") {
      const plan = meta?.plan || profile.plan || "starter";
      const interval = (meta?.billing_interval || profile.billing_interval || "monthly") as "monthly" | "yearly";
      const mandateId = payment.mandateId || profile.mollie_mandate_id || "";
      const periodStart = new Date();
      const periodEnd = addInterval(periodStart, interval);

      // Create the recurring subscription resource so Mollie auto-charges.
      // We tell Mollie: same amount, every 1 month or 12 months, starting
      // one period from now (since we just collected the first payment).
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

      // Find the audit row id we just inserted (to link the invoice)
      const { data: evt } = await supabase
        .from("payment_events")
        .select("id")
        .eq("mollie_payment_id", payment.id)
        .eq("event_type", eventType)
        .maybeSingle();

      // Generate invoice for the first payment
      const invoiceRow = await createInvoice(ownerId, evt?.id || null, payment, plan, interval, periodStart, periodEnd);
      const invoiceFields = invoiceRow ? {
        invoice_number: (invoiceRow as { invoice_number: string }).invoice_number,
        amount_excl_vat: +(parseFloat(payment.amount.value) / 1.21).toFixed(2),
        vat_amount: +(parseFloat(payment.amount.value) - parseFloat(payment.amount.value) / 1.21).toFixed(2),
        vat_rate: 0.21,
        period_start: periodStart.toISOString(),
      } : {};

      // Flip profile to active
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

      // Fire-and-forget: send subscription invoice email.
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: profile && (profile as Record<string, unknown>).email,
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
      // First payment didn't go through. Don't activate. Optionally email
      // them a "your checkout didn't complete" note — kept light for now.
      console.log("first payment did not complete:", payment.id, payment.status);
    }
    return plain(200, "ok");
  }

  // ── RECURRING PAYMENT (auto-charge) ───────────────────────────────────
  if (payment.sequenceType === "recurring") {
    if (payment.status === "paid") {
      const plan = profile.plan || "starter";
      const interval = (profile.billing_interval || "monthly") as "monthly" | "yearly";
      // New period extends from previous expiry (or now if missing)
      const prevEnd = profile.plan_expires_at ? new Date(profile.plan_expires_at) : new Date();
      const periodStart = prevEnd;
      const periodEnd = addInterval(prevEnd, interval);

      // Find audit row id
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

      // If owner had referral credits, decrement and extend expiry by extra
      // periods at no charge. Done AFTER the actual paid renewal — credits
      // ride on top, not instead of. (Alternative behaviour: skip the charge
      // entirely. We'd need a Mollie subscription pause for that, which is
      // more complex. Doing extension-on-top first.)
      let extraEnd = periodEnd;
      let creditsUsed = 0;
      if ((profile.referral_credit_months || 0) > 0) {
        creditsUsed = profile.referral_credit_months || 0;
        extraEnd = addInterval(periodEnd, "monthly", creditsUsed);
      }

      const updates: Record<string, unknown> = {
        subscription_status: profile.subscription_status === "past_due" ? "active" : "active",
        current_period_start: periodStart.toISOString(),
        plan_expires_at: extraEnd.toISOString(),
      };
      if (creditsUsed > 0) updates.referral_credit_months = 0;
      await supabase.from("profiles").update(updates).eq("id", ownerId);

      // Send recurring invoice email
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
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
      // Recurring charge failed → mark past_due. Mollie will retry per its
      // own dunning schedule; we don't need to chase it here.
      await supabase
        .from("profiles")
        .update({ subscription_status: "past_due" })
        .eq("id", ownerId);
      // TODO: send dunning email
    }
    return plain(200, "ok");
  }

  // ── ONEOFF or unknown sequence ────────────────────────────────────────
  // Not used in our flow yet — log and return 200.
  return plain(200, "ok");
});
