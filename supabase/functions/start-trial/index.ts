// supabase/functions/start-trial/index.ts
//
// Activate a 14-day free trial for the calling owner.
//
// Trial is a pure DB state — no Mollie interaction. The owner can use Vellu
// for free for 14 days, after which `subscription_status` flips to 'past_due'
// (handled by check-trials cron) and PlanSelection blocks the dashboard until
// they subscribe.
//
// Each owner can only trial ONCE (`trial_used` boolean enforced server-side).
// The plan + billing_interval they pick here are remembered as their default
// for the eventual paid subscription, but they can change before checkout.
//
// Auth: requires a valid Supabase JWT — extracted via getUser(jwt). Service
// role used for the DB write so we bypass RLS on profiles for system fields
// (`subscription_status`, `trial_used`, etc. should not be user-writable).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const TRIAL_DAYS = 14;
const VALID_PLANS = ["starter", "professional"] as const;
const VALID_INTERVALS = ["monthly", "yearly"] as const;

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

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return err(405, "method_not_allowed", origin);

  // Extract user from Authorization header
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return err(401, "no_auth", origin);

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return err(401, "invalid_auth", origin);
  const userId = userData.user.id;

  // Parse + validate body
  let body: { plan?: string; billing_interval?: string };
  try { body = await req.json(); }
  catch { return err(400, "invalid_json", origin); }

  const plan = body.plan;
  const interval = body.billing_interval;
  if (!plan || !VALID_PLANS.includes(plan as typeof VALID_PLANS[number])) {
    return err(400, "invalid_plan", origin);
  }
  if (!interval || !VALID_INTERVALS.includes(interval as typeof VALID_INTERVALS[number])) {
    return err(400, "invalid_billing_interval", origin);
  }

  // Atomic guard: only allow trial if `trial_used` is still false. We rely on
  // the WHERE clause + a returning select to detect "already used" without a
  // separate read-then-write race window.
  const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();

  const { data: updated, error: updErr } = await supabase
    .from("profiles")
    .update({
      plan,
      billing_interval: interval,
      subscription_status: "trialing",
      trial_used: true,
      trial_ends_at: trialEnd.toISOString(),
      current_period_start: now.toISOString(),
      plan_expires_at: trialEnd.toISOString(),
      cancel_at_period_end: false,
      cancelled_at: null,
    })
    .eq("id", userId)
    .eq("trial_used", false)
    .select("id, plan, subscription_status, trial_ends_at")
    .maybeSingle();

  if (updErr) {
    console.error("start-trial DB error:", updErr);
    return err(500, "db_error", origin);
  }
  if (!updated) {
    // Either profile doesn't exist OR trial was already used. Distinguish by
    // re-reading without the trial_used filter so the client gets a useful
    // error code (PlanSelection can show "trial already used, please subscribe").
    const { data: existing } = await supabase
      .from("profiles")
      .select("trial_used, subscription_status")
      .eq("id", userId)
      .maybeSingle();
    if (!existing) return err(404, "no_profile", origin);
    if (existing.trial_used) return err(409, "trial_already_used", origin);
    return err(500, "unknown", origin);
  }

  return ok({
    success: true,
    plan: updated.plan,
    subscription_status: updated.subscription_status,
    trial_ends_at: updated.trial_ends_at,
  }, origin);
});
