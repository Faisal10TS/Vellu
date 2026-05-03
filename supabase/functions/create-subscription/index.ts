// supabase/functions/create-subscription/index.ts
//
// Kicks off a Mollie subscription for the calling owner.
//
// Mollie's recurring model requires a "first payment" to establish a SEPA /
// card mandate. Without a mandate, Mollie can't charge the customer
// automatically. So the flow is:
//
//   1. (here) Create or look up a Mollie customer for this owner
//   2. (here) Create a "first" payment, get the checkout URL, return it
//   3. Owner completes payment at Mollie's hosted checkout
//   4. (mollie-webhook) Mollie pings us → we re-fetch the payment to verify
//      it's `paid` and a mandate was created
//   5. (mollie-webhook) Create the actual `subscription` resource so Mollie
//      auto-charges on schedule (1 month or 1 year)
//   6. (mollie-webhook) Each renewal payment fires another webhook → we
//      extend `plan_expires_at` and create an invoice row
//
// This function never touches the `subscription_status` field; that flips
// from `trialing`/null/`past_due` → `active` only after the FIRST PAYMENT
// confirms in the webhook. No room for race-conditions from a half-paid
// checkout.
//
// Referral credits: NOT used during initial first-payment because we still
// need a mandate to be established. Credits are decremented in the webhook
// during recurring renewals (see referral_credit logic in mollie-webhook).
//
// Auth: requires a valid Supabase JWT.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY")!;
const MOLLIE_PROFILE_ID = Deno.env.get("MOLLIE_PROFILE_ID") || "";
const MOLLIE_BASE_URL = "https://api.mollie.com/v2";
const APP_URL = Deno.env.get("APP_URL") || "https://vellu.cc";

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
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 19.0, yearly: 190.0 },
  professional: { monthly: 39.0, yearly: 390.0 },
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

function err(status: number, code: string, origin: string | null) {
  return new Response(JSON.stringify({ error: code }), {
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

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return err(405, "method_not_allowed", origin);
  if (!MOLLIE_API_KEY) {
    console.error("create-subscription: MOLLIE_API_KEY not set");
    return err(500, "config_error", origin);
  }

  // Auth
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return err(401, "no_auth", origin);
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return err(401, "invalid_auth", origin);
  const userId = userData.user.id;
  const userEmail = userData.user.email || "";

  // Parse + validate body
  let body: { plan?: string; billing_interval?: string };
  try { body = await req.json(); }
  catch { return err(400, "invalid_json", origin); }

  const plan = body.plan || "";
  const interval = body.billing_interval || "";
  if (!PLAN_PRICES[plan]) return err(400, "invalid_plan", origin);
  if (interval !== "monthly" && interval !== "yearly") return err(400, "invalid_billing_interval", origin);

  const amount = PLAN_PRICES[plan][interval as "monthly" | "yearly"];

  // Look up profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, business_name, email, mollie_customer_id, subscription_status, mollie_subscription_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr || !profile) return err(404, "no_profile", origin);

  // If they already have an active subscription, refuse — they should hit
  // change-plan or cancel-then-resubscribe instead.
  if (profile.subscription_status === "active" && profile.mollie_subscription_id) {
    return err(409, "already_subscribed", origin);
  }

  // Step 1: Ensure Mollie customer exists
  let customerId = profile.mollie_customer_id || "";
  if (!customerId) {
    const cRes = await mollieFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: profile.business_name || "Vellu Customer",
        email: profile.email || userEmail,
        metadata: { owner_id: userId },
      }),
    });
    if (!cRes.ok || !cRes.data || typeof cRes.data !== "object") {
      console.error("Mollie customer create failed:", cRes.status, cRes.raw);
      return err(502, "mollie_customer_failed", origin);
    }
    customerId = (cRes.data as { id: string }).id;
    await supabase.from("profiles").update({ mollie_customer_id: customerId }).eq("id", userId);
  }

  // Step 2: Create the first payment. `sequenceType: "first"` tells Mollie
  // this payment also establishes a mandate for future recurring charges.
  const description =
    plan === "starter" ? "Vellu Starter" : "Vellu Professional";
  const intervalLabel = interval === "yearly" ? "yearly" : "monthly";

  const paymentBody: Record<string, unknown> = {
    amount: { currency: "EUR", value: amount.toFixed(2) },
    customerId,
    sequenceType: "first",
    description: `${description} (${intervalLabel}) — first payment`,
    redirectUrl: `${APP_URL}/owner?subscription=success`,
    webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
    metadata: {
      owner_id: userId,
      plan,
      billing_interval: interval,
      kind: "subscription_first_payment",
    },
  };
  if (MOLLIE_PROFILE_ID) paymentBody.profileId = MOLLIE_PROFILE_ID;

  const pRes = await mollieFetch("/payments", {
    method: "POST",
    body: JSON.stringify(paymentBody),
  });
  if (!pRes.ok || !pRes.data || typeof pRes.data !== "object") {
    console.error("Mollie payment create failed:", pRes.status, pRes.raw);
    return err(502, "mollie_payment_failed", origin);
  }
  const payment = pRes.data as {
    id: string;
    _links?: { checkout?: { href: string } };
  };

  // Audit log: record the first-payment creation event so we can correlate
  // dropped checkouts later. Status is null because we don't know yet.
  await supabase.from("payment_events").insert({
    owner_id: userId,
    mollie_payment_id: payment.id,
    mollie_customer_id: customerId,
    event_type: "first_payment.created",
    status: "pending",
    amount_eur: amount,
    description: paymentBody.description as string,
    raw_payload: payment as unknown as Record<string, unknown>,
  });

  return ok({
    success: true,
    payment_id: payment.id,
    checkout_url: payment._links?.checkout?.href || null,
  }, origin);
});
