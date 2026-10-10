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
//   • trial_autopay_off (sinds 10-10-2026) — automatisch betalen na de proef
//     uitzetten. Tijdens de proef met een gepland Mollie-abonnement (trialing +
//     mollie_subscription_id) stopt dit het abonnement én trekt het de
//     machtiging in: "uitzetten" moet betekenen dat er niets meer kan worden
//     afgeschreven. De proef loopt gewoon door tot trial_ends_at; daarna de
//     gewone stand na een proef. Weer aanzetten = opnieuw de checkout van
//     EUR 0,00 / 0,01. Kan tot het begin van de eerste afschrijvingsdag
//     (Amsterdamse middernacht, altijd na het einde van de proef); daarna 409
//     first_charge_started. Zonder Mollie-klant in het profiel 502 (profiel
//     blijft staan, want het abonnement loopt dan nog); verandert het profiel
//     steeds tussen lezen en schrijven, dan 409 autopay_changed. Ook een oude app
//     die zonder action opzegt komt in een proef met abonnement in deze tak:
//     de gewone opzegpaden zouden de toegang van de proef afsluiten.
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
// Kopie uit mollie-webhook: een abonnement stoppen, en een al gestopt
// abonnement (Mollie geeft dan een foutcode) ook als gelukt tellen.
const LIVE_SUB_STATUSES = ["pending", "active", "suspended"];
async function cancelMollieSubscription(customerId: string, subId: string): Promise<boolean> {
  const r = await mollieFetch(`/customers/${customerId}/subscriptions/${subId}`, { method: "DELETE" });
  if (r.ok || r.status === 404 || r.status === 410) return true;
  const g = await mollieFetch(`/customers/${customerId}/subscriptions/${subId}`);
  const st = g.ok && g.data && typeof g.data === "object" ? String((g.data as { status?: string }).status || "") : "";
  if (st && !LIVE_SUB_STATUSES.includes(st)) return true;
  console.error("mollie subscription cancel failed:", subId, r.status, r.raw);
  return false;
}
// Kopie uit mollie-webhook: stopt elk lopend abonnement van deze klant behalve
// keepId en geeft terug wat niet lukte.
async function cancelOtherSubscriptions(customerId: string, keepId: string | null): Promise<string[]> {
  const list = await mollieFetch(`/customers/${customerId}/subscriptions?limit=250`);
  if (!list.ok || !list.data || typeof list.data !== "object") {
    console.error("mollie subscription list failed:", list.status, list.raw);
    return ["(lijst met abonnementen niet op te halen)"];
  }
  type SubList = { _embedded?: { subscriptions?: Array<{ id?: string; status?: string }> } };
  const subs = (list.data as SubList)._embedded?.subscriptions || [];
  const failed: string[] = [];
  for (const s of subs) {
    if (!s?.id || s.id === keepId || !LIVE_SUB_STATUSES.includes(String(s.status || ""))) continue;
    if (!(await cancelMollieSubscription(customerId, s.id))) failed.push(s.id);
  }
  return failed;
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
  let body: { immediate?: boolean; action?: string };
  try { body = await req.json(); } catch { body = {}; }
  const immediate = body.immediate === true;

  // Look up profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, mollie_customer_id, mollie_subscription_id, mollie_mandate_id, subscription_status, plan_expires_at, trial_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr || !profile) return err(404, "no_profile", origin);

  // ── Automatisch betalen na de proef uitzetten (sinds 10-10-2026) ──────
  if (profile.subscription_status === "trialing" && profile.mollie_subscription_id) {
    // Vanaf de dag van de eerste afschrijving kan Mollie hem al hebben
    // aangemaakt; dat is niet meer tegen te houden. Opzeggen kan zodra hij
    // binnen is (dan geldt het gewone opzeggen aan het einde van de periode).
    if (autopayChargeDayReached(profile.trial_ends_at)) return err(409, "first_charge_started", origin);
    const PROFILE_COLS = "id, mollie_customer_id, mollie_subscription_id, mollie_mandate_id, subscription_status, plan_expires_at, trial_ends_at";
    let cur = profile;
    // Hooguit drie rondes: tussen lezen en wegschrijven kan de webhook van een
    // tweede checkout (ander tabblad) een nieuw abonnement in het profiel zetten.
    // Dat nieuwe abonnement is dan nog niet gestopt; het profiel leegmaken zou
    // "uit" melden terwijl Mollie straks gewoon afschrijft.
    for (let ronde = 0; ronde < 3; ronde++) {
      const cid = String(cur.mollie_customer_id || "");
      const sid = String(cur.mollie_subscription_id || "");
      // Zonder Mollie-klant kunnen we het abonnement niet stoppen. Dan het
      // profiel NIET leegmaken: anders zegt de app "er wordt niets afgeschreven"
      // terwijl het abonnement bij Mollie gewoon blijft lopen.
      if (!cid) {
        console.error("trial_autopay_off: abonnement zonder Mollie-klant in het profiel:", userId, sid);
        return err(502, "mollie_cancel_failed", origin);
      }
      if (!(await cancelMollieSubscription(cid, sid))) return err(502, "mollie_cancel_failed", origin);
      const others = await cancelOtherSubscriptions(cid, null);
      if (others.length) console.error("trial_autopay_off: andere abonnementen niet gestopt:", userId, others.join(", "));
      // Machtiging intrekken, zodat er echt niets meer kan worden afgeschreven.
      // Lukt dat niet, dan is er nog steeds geen abonnement: alleen loggen.
      if (cur.mollie_mandate_id) {
        const rv = await mollieFetch(`/customers/${cid}/mandates/${cur.mollie_mandate_id}`, { method: "DELETE" });
        if (!rv.ok && rv.status !== 404 && rv.status !== 410) {
          console.error("trial_autopay_off: mandate revoke failed:", cur.mollie_mandate_id, rv.status, rv.raw);
        }
      }
      // Proef, trial_ends_at en plan_expires_at blijven zoals ze zijn. Alleen
      // leegmaken als het profiel nog precies het abonnement heeft dat we net
      // stopten.
      const { data: rows, error: updErr } = await supabase
        .from("profiles")
        .update({
          mollie_subscription_id: null,
          mollie_mandate_id: null,
          cancel_at_period_end: false,
          cancelled_at: null,
        })
        .eq("id", userId)
        .eq("subscription_status", "trialing")
        .eq("mollie_subscription_id", sid)
        .select("id");
      if (updErr) {
        // Mollie is al gestopt; een nieuwe poging komt weer hier (DELETE geeft dan
        // 404 = in orde) en ruimt het profiel alsnog op.
        console.error("trial_autopay_off: profile update failed:", userId, updErr);
        return err(500, "profile_update_failed", origin);
      }
      if (rows && rows.length > 0) {
        return ok({ success: true, mode: "trial_autopay_off", trial_ends_at: cur.trial_ends_at }, origin);
      }
      // Het profiel veranderde intussen: opnieuw lezen en zo nodig de nieuwe
      // stand ook stoppen.
      const { data: fresh, error: freshErr } = await supabase.from("profiles").select(PROFILE_COLS).eq("id", userId).maybeSingle();
      if (freshErr || !fresh) return err(404, "no_profile", origin);
      if (fresh.subscription_status !== "trialing") return err(409, "autopay_not_on", origin);
      if (!fresh.mollie_subscription_id) {
        return ok({ success: true, mode: "trial_autopay_off", trial_ends_at: fresh.trial_ends_at }, origin);
      }
      if (autopayChargeDayReached(fresh.trial_ends_at)) return err(409, "first_charge_started", origin);
      cur = fresh;
    }
    console.error("trial_autopay_off: profiel bleef veranderen, opgegeven:", userId);
    return err(409, "autopay_changed", origin);
  }
  if (body.action === "trial_autopay_off") return err(409, "autopay_not_on", origin);

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
