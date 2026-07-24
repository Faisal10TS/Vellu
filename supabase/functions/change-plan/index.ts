// supabase/functions/change-plan/index.ts
//
// Upgrade or downgrade an owner's Mollie subscription (Starter ⇄ Professional,
// and/or monthly ⇄ yearly) without a new checkout flow.
//
// Mollie's recurring model treats a "subscription" as immutable — to change
// the amount or interval you cancel the old one and create a new one. The
// existing SEPA/card mandate stays valid on the customer object, so the new
// subscription can be created server-side without bouncing the owner through
// a hosted-checkout page.
//
// Charging strategy:
//   • Old subscription is cancelled at Mollie immediately so no double charge.
//   • New subscription starts on `plan_expires_at` (= the already-paid-through
//     date), so the next auto-charge lands there at the new amount.
//   • profile.plan flips to the new tier RIGHT NOW so features unlock.
//   • On an UPGRADE within the same interval, the pro-rata price difference
//     for the remaining PAID days is charged AFTER the upgrade is applied
//     (never before — we don't take money for a tier we haven't delivered).
//
// Auth: requires a valid Supabase JWT.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY")!;
const MOLLIE_BASE_URL = "https://api.mollie.com/v2";

const ALLOWED_ORIGINS = [
  "https://vellu.cc",
  "https://www.vellu.cc",
  "https://vellu.io",
  "https://www.vellu.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

// Plan pricing in EUR. Server is the source of truth — never trust client.
// 2026-07-25: Professional lowered 39 -> 35 (yearly stays 10x monthly).
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 19.0, yearly: 190.0 },
  professional: { monthly: 35.0, yearly: 350.0 },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function err(status: number, code: string, origin: string | null, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: code, ...(extra || {}) }), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function ok(body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
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
  try { data = text ? JSON.parse(text) : null; } catch { /* leave raw */ }
  return { status: r.status, ok: r.ok, data, raw: text };
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addInterval(from: Date, interval: "monthly" | "yearly", n = 1): Date {
  const d = new Date(from);
  if (interval === "monthly") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return err(405, "method_not_allowed", origin);
  if (!MOLLIE_API_KEY) {
    console.error("change-plan: MOLLIE_API_KEY not set");
    return err(500, "config_error", origin);
  }

  // Auth
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return err(401, "no_auth", origin);
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return err(401, "invalid_auth", origin);
  const userId = userData.user.id;

  // Body
  let body: { plan?: string; billing_interval?: string };
  try { body = await req.json(); } catch { return err(400, "invalid_json", origin); }
  const newPlan = body.plan || "";
  const newInterval = body.billing_interval || "monthly";
  if (!PLAN_PRICES[newPlan]) return err(400, "invalid_plan", origin);
  if (newInterval !== "monthly" && newInterval !== "yearly") return err(400, "invalid_billing_interval", origin);

  // Profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, business_name, email, plan, billing_interval, subscription_status, mollie_customer_id, mollie_subscription_id, mollie_mandate_id, plan_expires_at, current_period_start")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr || !profile) return err(404, "no_profile", origin);

  // Need an established subscription to change. Trials should go through the
  // normal subscribe flow (which sets up the first mandate via checkout).
  if (profile.subscription_status !== "active") {
    return err(409, "not_active", origin, { status: profile.subscription_status });
  }
  if (!profile.mollie_customer_id) {
    return err(409, "no_mollie_customer", origin);
  }

  // Same plan + same interval = nothing to do.
  if (profile.plan === newPlan && (profile.billing_interval || "monthly") === newInterval) {
    return err(400, "no_change", origin);
  }

  // Resolve a usable mandate. Prefer the one we cached during first-payment;
  // fall back to the customer's first valid mandate at Mollie.
  let mandateId = profile.mollie_mandate_id || "";
  if (!mandateId) {
    const m = await mollieFetch(`/customers/${profile.mollie_customer_id}/mandates?limit=50`);
    if (!m.ok || typeof m.data !== "object" || !m.data) {
      console.error("Mollie mandate fetch failed:", m.status, m.raw);
      return err(502, "mollie_mandate_lookup_failed", origin);
    }
    type MollieMandateList = { _embedded?: { mandates?: Array<{ id: string; status: string }> } };
    const list = (m.data as MollieMandateList)._embedded?.mandates || [];
    const valid = list.find((x) => x.status === "valid");
    if (!valid) return err(409, "no_valid_mandate", origin);
    mandateId = valid.id;
  }

  // ── Pro-rata upgrade: compute only (money is charged LAST) ───
  // On an UPGRADE within the same billing interval we collect the price
  // difference for the remaining PAID days. Computed here, charged only AFTER
  // the upgrade is applied — we never take payment for a tier we haven't yet
  // delivered. Downgrades and interval switches keep the no-charge model.
  let proratedCharge = 0;               // intended amount
  let prorationPeriodStart: Date | null = null;
  let prorationPeriodEnd: Date | null = null;
  {
    const oldAmount = PLAN_PRICES[profile.plan as string]?.[
      (profile.billing_interval || "monthly") as "monthly" | "yearly"
    ] ?? 0;
    const sameInterval = (profile.billing_interval || "monthly") === newInterval;
    const newAmount = PLAN_PRICES[newPlan][newInterval as "monthly" | "yearly"];
    if (sameInterval && oldAmount > 0 && newAmount > oldAmount && profile.plan_expires_at) {
      const expiresAt = new Date(profile.plan_expires_at);
      // Period start: the stored value, or derived as expiry minus one interval
      // for older rows that never recorded current_period_start.
      const rawStart = profile.current_period_start
        ? new Date(profile.current_period_start)
        : addInterval(expiresAt, newInterval as "monthly" | "yearly", -1);
      // Cap at the PAID window. Referral credit can push plan_expires_at past
      // one interval; those bonus days were free, so never charge a slice of
      // them.
      const oneInterval = addInterval(rawStart, newInterval as "monthly" | "yearly", 1);
      const paidEnd = expiresAt.getTime() < oneInterval.getTime() ? expiresAt : oneInterval;
      const nowMs = Date.now();
      if (paidEnd.getTime() > nowMs && paidEnd.getTime() > rawStart.getTime()) {
        const periodDays = (paidEnd.getTime() - rawStart.getTime()) / 86400000;
        const remainingDays = Math.max(0, (paidEnd.getTime() - nowMs) / 86400000);
        const frac = Math.min(1, remainingDays / Math.max(1, periodDays));
        const amt = +((newAmount - oldAmount) * frac).toFixed(2);
        if (amt >= 1) {                 // don't bother the bank for cents
          proratedCharge = amt;
          prorationPeriodStart = new Date(nowMs);
          prorationPeriodEnd = paidEnd;
        }
      }
    }
  }

  // Cancel the old Mollie subscription. 404 is fine — means it was already
  // cancelled out-of-band; we just proceed to create the new one. Anything
  // else is fatal: we don't want to end up with two parallel subscriptions.
  if (profile.mollie_subscription_id) {
    const cancelRes = await mollieFetch(
      `/customers/${profile.mollie_customer_id}/subscriptions/${profile.mollie_subscription_id}`,
      { method: "DELETE" },
    );
    if (!cancelRes.ok && cancelRes.status !== 404) {
      console.error("Mollie cancel (during change-plan) failed:", cancelRes.status, cancelRes.raw);
      return err(502, "mollie_cancel_failed", origin);
    }
  }

  // Create the new subscription. startDate = current plan_expires_at so the
  // owner isn't charged again this period (already paid at the old rate). If
  // plan_expires_at is somehow null or already in the past, default to now
  // (Mollie will charge today, which is the right thing in those edge cases).
  const now = new Date();
  const expires = profile.plan_expires_at ? new Date(profile.plan_expires_at) : now;
  const startDate = expires > now ? expires : now;

  const amount = PLAN_PRICES[newPlan][newInterval as "monthly" | "yearly"];
  const intervalLabel = newInterval === "yearly" ? "12 months" : "1 month";
  const description =
    newPlan === "starter"
      ? `Vellu Starter (${newInterval})`
      : `Vellu Professional (${newInterval})`;

  const subBody: Record<string, unknown> = {
    amount: { currency: "EUR", value: amount.toFixed(2) },
    interval: intervalLabel,
    description,
    startDate: ymd(startDate),
    mandateId,
    webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
    metadata: {
      owner_id: userId,
      plan: newPlan,
      billing_interval: newInterval,
      kind: "subscription_change",
      previous_plan: profile.plan,
      previous_billing_interval: profile.billing_interval || "monthly",
    },
  };

  const subRes = await mollieFetch(
    `/customers/${profile.mollie_customer_id}/subscriptions`,
    { method: "POST", body: JSON.stringify(subBody) },
  );
  if (!subRes.ok || !subRes.data || typeof subRes.data !== "object") {
    console.error("Mollie subscription create (during change-plan) failed:", subRes.status, subRes.raw);
    // Best-effort revert flag: we already cancelled the old sub. Surface the
    // error so the client can ask the owner to retry / contact support.
    return err(502, "mollie_subscription_failed", origin);
  }
  const newSubId = (subRes.data as { id: string }).id;

  // Flip local state. Plan changes immediately so the new tier's features
  // unlock right now; mollie_subscription_id points to the new sub so the
  // webhook updates the right row when the first renewal lands.
  const updates: Record<string, unknown> = {
    plan: newPlan,
    billing_interval: newInterval,
    mollie_subscription_id: newSubId,
    cancel_at_period_end: false, // re-affirm: we have an active forward schedule
  };
  const { error: updErr } = await supabase.from("profiles").update(updates).eq("id", userId);
  if (updErr) {
    console.error("change-plan: profile update failed", updErr);
    // Mollie side is already updated; profile not. Better to report so we can
    // patch up by hand than to silently 200.
    return err(500, "profile_update_failed", origin);
  }

  // Collect the pro-rata difference NOW — AFTER the upgrade is live. If it
  // fails we do NOT roll back: the owner already has the tier, and under-
  // collecting a few euros beats charging for nothing. Logged for follow-up;
  // never surfaced to the owner as an error. A retry can't double-charge —
  // profile.plan is already the new plan, so the no_change guard stops it.
  let proratedCharged = 0;
  if (proratedCharge > 0 && prorationPeriodStart && prorationPeriodEnd) {
    const chargeRes = await mollieFetch("/payments", {
      method: "POST",
      body: JSON.stringify({
        amount: { currency: "EUR", value: proratedCharge.toFixed(2) },
        customerId: profile.mollie_customer_id,
        sequenceType: "recurring",
        mandateId,
        description: `Vellu ${newPlan === "professional" ? "Professional" : "Starter"} upgrade — pro rata`,
        webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
        metadata: {
          owner_id: userId,
          plan: newPlan,
          billing_interval: newInterval,
          // The webhook keys on this: invoice WITHOUT extending plan_expires_at
          // or consuming referral credits.
          kind: "upgrade_proration",
          period_start: prorationPeriodStart.toISOString(),
          period_end: prorationPeriodEnd.toISOString(),
        },
      }),
    });
    if (chargeRes.ok && chargeRes.data && typeof chargeRes.data === "object") {
      proratedCharged = proratedCharge;
    } else {
      console.error("proration charge failed (upgrade kept):", chargeRes.status, chargeRes.raw);
    }
  }

  // Audit
  await supabase.from("payment_events").insert({
    owner_id: userId,
    mollie_customer_id: profile.mollie_customer_id,
    mollie_subscription_id: newSubId,
    event_type: "subscription.changed",
    status: "active",
    amount_eur: amount,
    description,
    raw_payload: {
      from_plan: profile.plan,
      to_plan: newPlan,
      from_interval: profile.billing_interval || "monthly",
      to_interval: newInterval,
      start_date: ymd(startDate),
      mandate_id: mandateId,
      new_subscription_id: newSubId,
      cancelled_subscription_id: profile.mollie_subscription_id || null,
      prorated_charge: proratedCharged,
    } as Record<string, unknown>,
  });

  return ok({
    success: true,
    plan: newPlan,
    billing_interval: newInterval,
    next_charge_on: ymd(startDate),
    next_charge_amount: amount,
    prorated_charge: proratedCharged,
    new_subscription_id: newSubId,
  }, origin);
});
