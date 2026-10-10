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
// Foutcodes voor de app: 400 no_change; 409 not_active, no_mollie_customer,
// no_valid_mandate, yearly_oneoff (eenmalig betaald jaarabonnement, sinds
// 05-10-2026) en busy (er loopt al een wissel, sinds 05-10-2026); bij een proef
// met automatisch betalen (sinds 10-10-2026) ook 409 trial_autopay_monthly_only
// en first_charge_started, 502 mollie_update_failed en 500
// profile_update_failed.
//
// PROEF MET AUTOMATISCH BETALEN (sinds 10-10-2026): trialing + een Mollie-
// abonnement dat pas na het einde van de proef afschrijft. Wisselen tussen
// Starter en Professional past alleen het bedrag van dat abonnement aan (PATCH);
// er is nog niets betaald, dus geen pro rata en geen nieuw abonnement. Een proef
// ZONDER abonnement wisselt nog steeds in de app zelf (de guard-trigger op
// profiles staat dat alleen toe zolang mollie_subscription_id leeg is).
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

// ── AUTOPAY-DATUMREGELS (sinds 10-10-2026) ──────────────────────────────
// Letterlijk gekopieerd in create-subscription, mollie-webhook,
// cancel-subscription, change-plan en send-renewal-reminder; de app heeft
// dezelfde regels in src/autopay.js (edge functions hebben geen gedeelde module).
// Mollie schrijft een abonnement af op een Amsterdamse kalenderdag (startDate),
// op een tijdstip van die dag dat wij niet kennen. De eerste afschrijvingsdag is
// daarom de eerste Amsterdamse dag die pas NA het einde van de proef begint
// (meestal de dag na de einddatum): alleen zo wordt er nooit afgeschreven terwijl
// de proef nog loopt. Ook niet op Bonaire/Curaçao/Aruba/Sint Maarten, waar de
// Amsterdamse dag al om 18:00 of 19:00 de avond ervoor begint. Uitzetten en
// wisselen kan tot het begin van die dag (Amsterdamse middernacht), dus altijd
// tot minstens het einde van de proef.
const AMS = "Europe/Amsterdam";
function ymdIn(tz: string, d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
// Het tijdstip (ms) waarop Amsterdamse dag `ymd` begint: middernacht CET of CEST.
function amsMidnightMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  for (const h of [1, 2]) {
    const t = base - h * 3600000;
    if (ymdIn(AMS, new Date(t)) === ymd && ymdIn(AMS, new Date(t - 1)) !== ymd) return t;
  }
  return base - 3600000;
}
// Eerste Amsterdamse dag die op of na het einde van de proef begint.
function autopayFirstYmd(end: Date): string {
  const d = ymdIn(AMS, end);
  if (amsMidnightMs(d) >= end.getTime()) return d;
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
}
// Eerste afschrijving (= Mollie-startDate), nooit vóór vandaag (Amsterdam).
function autopayChargeYmd(trialEndsAt: unknown, now = new Date()): string {
  const end = new Date(String(trialEndsAt || "")); const today = ymdIn(AMS, now);
  if (isNaN(end.getTime())) return today;
  const d = autopayFirstYmd(end); return d > today ? d : today;
}
// Vanaf het begin van de eerste afschrijvingsdag kan Mollie de betaling al
// hebben aangemaakt: uitzetten/wisselen kan dan niet meer.
function autopayChargeDayReached(trialEndsAt: unknown, now = new Date()): boolean {
  const end = new Date(String(trialEndsAt || "")); if (isNaN(end.getTime())) return true;
  return ymdIn(AMS, now) >= autopayFirstYmd(end);
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

  // Profile + korte vergrendeling (sinds 05-10-2026). Twee wissel-verzoeken
  // tegelijk (twee tabbladen, of een herhaling tijdens een trage reactie) lazen
  // allebei het oude plan en maakten allebei een nieuw Mollie-abonnement plus
  // een pro-rata-afschrijving; alleen het laatste id werd bewaard en het andere
  // schreef ongemerkt door. Nu zet het verzoek eerst plan_change_started_at
  // (alleen als die leeg is of ouder dan 2 minuten) en leest het profiel in
  // dezelfde stap. Lukt dat niet, dan is er al een wissel bezig: 409 busy. De
  // vergrendeling wordt aan het eind altijd weer vrijgegeven (finally).
  const lockIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .update({ plan_change_started_at: lockIso })
    .eq("id", userId)
    .or(`plan_change_started_at.is.null,plan_change_started_at.lt."${staleIso}"`)
    .select("id, business_name, email, plan, billing_interval, subscription_status, mollie_customer_id, mollie_subscription_id, mollie_mandate_id, plan_expires_at, current_period_start, trial_ends_at")
    .maybeSingle();
  if (profileErr) {
    console.error("change-plan: lock/profile lookup failed", profileErr);
    return err(500, "lock_failed", origin);
  }
  if (!profile) {
    const { data: exists } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    return exists ? err(409, "busy", origin) : err(404, "no_profile", origin);
  }

  try {
    return await changePlan(profile, userId, newPlan, newInterval, origin);
  } finally {
    const { error: unlockErr } = await supabase
      .from("profiles")
      .update({ plan_change_started_at: null })
      .eq("id", userId)
      .eq("plan_change_started_at", lockIso);
    if (unlockErr) console.error("change-plan: unlock failed", unlockErr);
  }
});

// deno-lint-ignore no-explicit-any
async function changePlan(profile: any, userId: string, newPlan: string, newInterval: string, origin: string | null): Promise<Response> {
  // Proef met automatisch betalen: alleen het geplande abonnement bijwerken.
  if (profile.subscription_status === "trialing" && profile.mollie_subscription_id) {
    return await changeTrialAutopayPlan(profile, userId, newPlan, newInterval, origin);
  }

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

  // Jaarabonnement als EENMALIGE betaling (geen Mollie-abonnement, geen
  // doorlopende machtiging): hier niets wisselen. Er is geen machtiging (dan gaf
  // dit een kale no_valid_mandate), en met een oude machtiging van vroeger
  // maandbetalen zou hieronder ongevraagd een automatisch verlengend
  // jaarabonnement plus een incasso ontstaan, terwijl de salon juist koos voor
  // "wordt niet automatisch verlengd". De app verwijst zo'n salon naar support
  // of naar Verlengen.
  if ((profile.billing_interval || "monthly") === "yearly" && !profile.mollie_subscription_id) {
    return err(409, "yearly_oneoff", origin);
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
}

// Proef met automatisch betalen (sinds 10-10-2026). Er is nog niets betaald:
// het Mollie-abonnement (start = eerste dag na de proef) krijgt alleen het nieuwe
// bedrag, de omschrijving en het plan in de metadata. Geen pro rata, geen
// nieuw abonnement, en plan_expires_at blijft de einddatum van de proef.
// Volgorde: eerst Mollie, dan het profiel. Mislukt het profiel, dan PATCHt een
// herhaling gewoon nog een keer (hetzelfde resultaat).
// deno-lint-ignore no-explicit-any
async function changeTrialAutopayPlan(profile: any, userId: string, newPlan: string, newInterval: string, origin: string | null): Promise<Response> {
  // Automatisch betalen is altijd maandelijks; jaarlijks kiest ze na de proef.
  if (newInterval !== "monthly") return err(409, "trial_autopay_monthly_only", origin);
  if (newPlan === profile.plan) return err(400, "no_change", origin);
  if (autopayChargeDayReached(profile.trial_ends_at)) return err(409, "first_charge_started", origin);
  if (!profile.mollie_customer_id) return err(409, "no_mollie_customer", origin);

  const amount = PLAN_PRICES[newPlan].monthly;
  const description = `Vellu ${newPlan === "professional" ? "Professional" : "Starter"} (monthly)`;
  const startDate = autopayChargeYmd(profile.trial_ends_at);
  const patchRes = await mollieFetch(
    `/customers/${profile.mollie_customer_id}/subscriptions/${profile.mollie_subscription_id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        amount: { currency: "EUR", value: amount.toFixed(2) },
        description,
        metadata: { owner_id: userId, plan: newPlan, billing_interval: "monthly", kind: "trial_autopay" },
      }),
    },
  );
  if (!patchRes.ok) {
    console.error("Mollie subscription update (trial autopay) failed:", patchRes.status, patchRes.raw);
    return err(502, "mollie_update_failed", origin);
  }
  const { error: updErr } = await supabase.from("profiles").update({ plan: newPlan }).eq("id", userId);
  if (updErr) {
    console.error("change-plan (trial autopay): profile update failed", updErr);
    return err(500, "profile_update_failed", origin);
  }
  await supabase.from("payment_events").insert({
    owner_id: userId,
    mollie_customer_id: profile.mollie_customer_id,
    mollie_subscription_id: profile.mollie_subscription_id,
    event_type: "subscription.changed",
    status: "trialing",
    amount_eur: amount,
    description,
    raw_payload: {
      trial_autopay: true,
      from_plan: profile.plan,
      to_plan: newPlan,
      start_date: startDate,
    } as Record<string, unknown>,
  });
  return ok({
    success: true,
    trial_autopay: true,
    plan: newPlan,
    billing_interval: "monthly",
    next_charge_on: startDate,
    next_charge_amount: amount,
    prorated_charge: 0,
  }, origin);
}
