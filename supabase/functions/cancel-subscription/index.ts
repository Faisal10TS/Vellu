// supabase/functions/cancel-subscription/index.ts
//
// Cancel an owner's Mollie subscription.
//
// Two modes:
//   • soft (default) — `cancel_at_period_end = true`. Mollie subscription
//     stays active so the owner keeps access until plan_expires_at, then we
//     stop renewing. Friendlier UX, recommended.
//   • hard — cancels at Mollie immediately AND zeroes plan_expires_at.
//     Refunds are NOT issued automatically; that's a separate Mollie call
//     a human should make through the dashboard.
//
// Auth: requires a valid Supabase JWT (only the owner can cancel their own
// subscription; admins go through the dashboard).

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
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: r.status, ok: r.ok, data, raw: text };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return err(405, "method_not_allowed", origin);
  if (!MOLLIE_API_KEY) return err(500, "config_error", origin);

  // Auth
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return err(401, "no_auth", origin);
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return err(401, "invalid_auth", origin);
  const userId = userData.user.id;

  // Parse body
  let body: { immediate?: boolean };
  try { body = await req.json(); } catch { body = {}; }
  const immediate = body.immediate === true;

  // Look up profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, mollie_customer_id, mollie_subscription_id, subscription_status, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr || !profile) return err(404, "no_profile", origin);

  // No Mollie subscription to cancel: a trial, a legacy/comped plan granted by
  // hand, or a first payment that never established recurring billing. There is
  // no recurring charge to stop at Mollie, so just reflect the cancellation
  // locally. Soft-cancel (default) keeps access until plan_expires_at (the
  // check-trials cron finalises it); immediate ends access now.
  if (!profile.mollie_subscription_id) {
    if (immediate) {
      await supabase
        .from("profiles")
        .update({
          subscription_status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_at_period_end: false,
          plan_expires_at: new Date().toISOString(),
        })
        .eq("id", userId);
      return ok({ success: true, mode: "immediate" }, origin);
    }
    await supabase
      .from("profiles")
      .update({
        cancel_at_period_end: true,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", userId);
    return ok({ success: true, mode: "at_period_end", access_until: profile.plan_expires_at }, origin);
  }

  if (immediate) {
    // Cancel at Mollie now + zero out access immediately
    const r = await mollieFetch(
      `/customers/${profile.mollie_customer_id}/subscriptions/${profile.mollie_subscription_id}`,
      { method: "DELETE" },
    );
    if (!r.ok && r.status !== 404) {
      console.error("Mollie cancel failed:", r.status, r.raw);
      return err(502, "mollie_cancel_failed", origin);
    }
    await supabase
      .from("profiles")
      .update({
        subscription_status: "cancelled",
        mollie_subscription_id: null,
        cancelled_at: new Date().toISOString(),
        cancel_at_period_end: false,
        plan_expires_at: new Date().toISOString(),
      })
      .eq("id", userId);
    return ok({ success: true, mode: "immediate" }, origin);
  }

  // Soft cancel: cancel at Mollie now (so they don't auto-charge again) but
  // leave plan_expires_at untouched so the owner keeps access until then.
  // Status stays "active" with cancel_at_period_end=true; the check-trials
  // cron flips it to "cancelled" once plan_expires_at passes.
  const r = await mollieFetch(
    `/customers/${profile.mollie_customer_id}/subscriptions/${profile.mollie_subscription_id}`,
    { method: "DELETE" },
  );
  if (!r.ok && r.status !== 404) {
    console.error("Mollie cancel failed:", r.status, r.raw);
    return err(502, "mollie_cancel_failed", origin);
  }
  await supabase
    .from("profiles")
    .update({
      cancel_at_period_end: true,
      mollie_subscription_id: null, // already cancelled at Mollie
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return ok({
    success: true,
    mode: "at_period_end",
    access_until: profile.plan_expires_at,
  }, origin);
});
