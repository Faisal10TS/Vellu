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
// AUTOMATISCH BETALEN NA DE PROEF (sinds 10-10-2026, action "trial_autopay").
// Een salon mag geen geld kwijt zijn op het moment dat ze tijdens haar proef
// "abonneert". Tot deze datum maakte dit pad dan een VOLLEDIGE eerste betaling
// (EUR 19 / 35) die meteen werd afgeschreven; de webhook schoof alleen de
// betaalde periode naar het einde van de proef. Nu:
//   - tijdens een lopende proef weigert het gewone pad ({plan, billing_interval})
//     met 409 trial_use_autopay, ook voor oude tabbladen die nog "Nu abonneren"
//     tonen;
//   - de enige optie tijdens de proef is "trial_autopay": een machtigings-
//     betaling van EUR 0,00 (creditcard; Mollie schrijft dan niets af) of
//     EUR 0,01 (iDEAL, alleen Nederland; iDEAL vraagt een echt bedrag en levert
//     een SEPA-machtiging op), met metadata kind "trial_autopay_mandate";
//   - mollie-webhook maakt daarna een Mollie-abonnement dat pas na het einde
//     van de proef voor het eerst afschrijft (de eerste Amsterdamse dag die na
//     het einde begint, zie autopayChargeYmd). De salon blijft 'trialing'; de
//     eerste echte afschrijving (recurring.paid) zet haar op actief.
// Het plan komt uit het profiel, nooit van de app: wisselen tijdens de proef
// loopt via change-plan (met abonnement) of via de app zelf (zonder).
//
// Auth: requires a valid Supabase JWT.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY")!;
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
// 2026-07-25: Professional lowered 39 -> 35 (yearly stays 10x monthly).
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 19.0, yearly: 190.0 },
  professional: { monthly: 35.0, yearly: 350.0 },
};

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
// Zelfde landenlijst als mollie-webhook: de omschrijving op de betaalpagina van
// Mollie en op het bankafschrift in de taal van de salon.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);

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

// Mollie-klant ophalen of aanmaken voor het pad "trial_autopay". Zelfde stappen
// als "Step 1" in het gewone pad hieronder (dat bewust ongewijzigd is gelaten).
async function ensureMollieCustomer(
  userId: string,
  userEmail: string,
  profile: { business_name?: string | null; email?: string | null; mollie_customer_id?: string | null },
): Promise<string | null> {
  if (profile.mollie_customer_id) return profile.mollie_customer_id;
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
    return null;
  }
  const customerId = (cRes.data as { id: string }).id;
  await supabase.from("profiles").update({ mollie_customer_id: customerId }).eq("id", userId);
  return customerId;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  // Return the customer to the SAME origin they started on after the Mollie
  // checkout. The Supabase auth session lives in localStorage scoped per
  // origin, so redirecting www.vellu.cc → vellu.cc (or vice versa) would land
  // them logged-out and never reach the dashboard. Only trust an allowlisted
  // origin; otherwise fall back to APP_URL.
  const returnOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : APP_URL;
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
  let body: { plan?: string; billing_interval?: string; action?: string; method?: string };
  try { body = await req.json(); }
  catch { return err(400, "invalid_json", origin); }

  // Terugkeer van de Mollie-betaalpagina (sinds 05-10-2026). Mollie stuurt de
  // salon bij ELKE uitkomst terug naar /owner?subscription=success, ook als ze
  // annuleerde, de kaart werd geweigerd of ze een bankoverschrijving koos. Met
  // deze vraag ziet het scherm de echte stand van de laatst gestarte betaling.
  // Alleen lezen, verder geen bijwerkingen.
  if (body.action === "last_payment_status") {
    const KNOWN = ["paid", "open", "pending", "authorized", "failed", "canceled", "expired"];
    let status: string | null = null;
    // Bij voorkeur de betaling die deze functie het laatst voor deze eigenaar startte.
    const { data: lastEvt } = await supabase
      .from("payment_events")
      .select("mollie_payment_id")
      .eq("owner_id", userId)
      .eq("event_type", "first_payment.created")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastEvt?.mollie_payment_id) {
      const r = await mollieFetch(`/payments/${lastEvt.mollie_payment_id}`);
      if (r.ok && r.data && typeof r.data === "object") status = String((r.data as { status?: string }).status || "") || null;
    } else {
      // Anders de laatste betaling van de Mollie-klant.
      const { data: prof } = await supabase.from("profiles").select("mollie_customer_id").eq("id", userId).maybeSingle();
      if (prof?.mollie_customer_id) {
        const r = await mollieFetch(`/customers/${prof.mollie_customer_id}/payments?limit=1`);
        type PayList = { _embedded?: { payments?: Array<{ status?: string }> } };
        if (r.ok && r.data && typeof r.data === "object") status = (r.data as PayList)._embedded?.payments?.[0]?.status || null;
      }
    }
    return ok({ status: status && KNOWN.includes(status) ? status : null }, origin);
  }

  // ── Automatisch betalen na de proef aanzetten (sinds 10-10-2026) ────────
  // Alleen de machtiging vastleggen: creditcard EUR 0,00 (Mollie: "No money
  // will then be debited"), iDEAL EUR 0,01 (vraagt een echt bedrag; die cent
  // wordt bewust niet teruggestort: een terugbetaling geeft per salon een
  // beheerdersmelding in mollie-webhook en kost meer dan hij oplevert). De echte
  // afschrijving plant mollie-webhook pas na het einde van de proef.
  if (body.action === "trial_autopay") {
    const method = String(body.method || "");
    if (method !== "creditcard" && method !== "ideal") return err(400, "invalid_method", origin);
    const { data: tp, error: tpErr } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, subscription_status, trial_ends_at, mollie_customer_id, mollie_subscription_id, referral_credit_days")
      .eq("id", userId)
      .maybeSingle();
    if (tpErr || !tp) return err(404, "no_profile", origin);
    if (tp.subscription_status !== "trialing") return err(409, "not_trialing", origin);
    const endMs = tp.trial_ends_at ? new Date(String(tp.trial_ends_at)).getTime() : NaN;
    if (!Number.isFinite(endMs) || endMs <= Date.now()) return err(409, "trial_ended", origin);
    if (tp.mollie_subscription_id) return err(409, "autopay_already_on", origin);

    // Plan uit het profiel, niet uit de aanvraag.
    const tPlan = PLAN_PRICES[String(tp.plan || "")] ? String(tp.plan) : "starter";
    const tCustomerId = await ensureMollieCustomer(userId, userEmail, tp);
    if (!tCustomerId) return err(502, "mollie_customer_failed", origin);

    const amountNow = method === "ideal" ? 0.01 : 0;
    const planLabel = tPlan === "professional" ? "Professional" : "Starter";
    const dutch = DUTCH_COUNTRIES.has(String(tp.country_code || "NL").toUpperCase());
    const tDescription = dutch
      ? `Vellu ${planLabel}: automatisch betalen na proef`
      : `Vellu ${planLabel}: automatic payment after trial`;
    const mandateBody: Record<string, unknown> = {
      amount: { currency: "EUR", value: amountNow.toFixed(2) },
      customerId: tCustomerId,
      sequenceType: "first",
      // Eén methode, geen lijst: EUR 0,00 mag alleen bij creditcard, en de salon
      // koos de methode al in de app (het bedrag hangt ervan af).
      method,
      description: tDescription,
      redirectUrl: `${returnOrigin}/owner?tab=billing&autopay=return`,
      webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
      metadata: {
        owner_id: userId,
        plan: tPlan,
        billing_interval: "monthly",
        // De webhook splitst hierop: abonnement plannen, GEEN factuur en GEEN
        // referral-tegoed voor de uitnodiger (dit is nog geen echte betaling).
        kind: "trial_autopay_mandate",
        method,
      },
    };
    const mRes = await mollieFetch("/payments", { method: "POST", body: JSON.stringify(mandateBody) });
    if (!mRes.ok || !mRes.data || typeof mRes.data !== "object") {
      console.error("Mollie mandate payment create failed:", mRes.status, mRes.raw);
      return err(502, "mollie_payment_failed", origin);
    }
    const mp = mRes.data as { id: string; _links?: { checkout?: { href: string } } };
    // Zelfde gebeurtenis als het gewone pad: check-pending-payments en
    // last_payment_status werken zo ongewijzigd ook voor deze betaling.
    await supabase.from("payment_events").insert({
      owner_id: userId,
      mollie_payment_id: mp.id,
      mollie_customer_id: tCustomerId,
      event_type: "first_payment.created",
      status: "pending",
      amount_eur: amountNow,
      description: tDescription,
      raw_payload: mp as unknown as Record<string, unknown>,
    });
    return ok({
      success: true,
      payment_id: mp.id,
      checkout_url: mp._links?.checkout?.href || null,
      method,
      amount_now: amountNow,
      plan: tPlan,
      first_charge_date: autopayChargeYmd(tp.trial_ends_at),
      first_charge_amount: PLAN_PRICES[tPlan].monthly,
    }, origin);
  }

  const plan = body.plan || "";
  const interval = body.billing_interval || "";
  if (!PLAN_PRICES[plan]) return err(400, "invalid_plan", origin);
  if (interval !== "monthly" && interval !== "yearly") return err(400, "invalid_billing_interval", origin);

  const amount = PLAN_PRICES[plan][interval as "monthly" | "yearly"];

  // Look up profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, business_name, email, mollie_customer_id, subscription_status, mollie_subscription_id, trial_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr || !profile) return err(404, "no_profile", origin);

  // Tijdens een lopende proef nooit meer meteen afschrijven (sinds 10-10-2026):
  // dat gaat via automatisch betalen hierboven, ook voor jaarlijks. Beschermt
  // tabbladen met de oude knop "Nu abonneren". Is de proef al voorbij maar heeft
  // check-trials haar nog niet op past_due gezet, dan mag ze gewoon betalen
  // vanaf het plan-scherm.
  if (profile.subscription_status === "trialing") {
    const endMs = profile.trial_ends_at ? new Date(String(profile.trial_ends_at)).getTime() : NaN;
    if (Number.isFinite(endMs) && endMs > Date.now()) return err(409, "trial_use_autopay", origin);
    // Proef voorbij terwijl automatisch betalen aanstaat: de eerste afschrijving
    // loopt al (SEPA duurt dagen). Een volledige betaling erbij zou dubbel
    // afschrijven. Mislukt die afschrijving, dan zet mollie-webhook haar op
    // past_due zonder abonnement en kan ze hier weer gewoon betalen.
    if (profile.mollie_subscription_id) return err(409, "autopay_charging", origin);
  }

  // If they already have an active subscription, refuse — they should hit
  // change-plan or cancel-then-resubscribe instead.
  // Een salon in past_due (mislukte incasso) of na opzeggen mag wel opnieuw
  // betalen: mollie-webhook stopt bij first.paid / de jaarbetaling het oude
  // Mollie-abonnement, en de nieuwe periode begint pas na de lopende toegang.
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

  // Step 2: de betaling zelf. Hier splitst het pad, en dat is de kern van deze
  // functie.
  //
  // MAANDELIJKS blijft een MACHTIGING (`sequenceType: "first"`). Twaalf keer per
  // jaar handmatig laten betalen is onwerkbaar, dus daar moet automatisch
  // geïncasseerd kunnen worden.
  //
  // JAARLIJKS wordt een GEWONE EENMALIGE BETALING (`sequenceType: "oneoff"`).
  // Eén keer per jaar hoeft niet automatisch; een factuur met een betaalverzoek
  // is voor een zakelijke klant normaal en vaak zelfs prettiger dan een stille
  // afschrijving van EUR 350. Het verschil is groot voor wie het moet betalen:
  //
  //   machtiging  -> de bank wordt gevraagd om HERHAALD te mogen afschrijven.
  //                  Banken keuren dat strenger, en veel niet-Europese
  //                  uitgevers weigeren het categorisch. Bovendien vallen alle
  //                  methodes af die geen machtiging kunnen afgeven —
  //                  bankoverschrijving bijvoorbeeld.
  //   eenmalig    -> gewone aankoop. Elke ingeschakelde methode mag, en de
  //                  kans op een weigering is veel kleiner.
  //
  // Aanleiding: op 19 augustus wilde een salon op Bonaire het jaarabonnement
  // afnemen. Haar RBC-creditcard werd door de eigen bank geweigerd terwijl
  // 3-D Secure wél slaagde. Ze had geen enkel alternatief, want iDEAL werkt
  // alleen met een Nederlandse bankrekening.
  const isYearly = interval === "yearly";
  const description =
    plan === "starter" ? "Vellu Starter" : "Vellu Professional";
  const intervalLabel = isYearly ? "yearly" : "monthly";

  const paymentBody: Record<string, unknown> = {
    amount: { currency: "EUR", value: amount.toFixed(2) },
    customerId,
    sequenceType: isYearly ? "oneoff" : "first",
    description: `${description} (${intervalLabel}) — ${isYearly ? "yearly payment" : "first payment"}`,
    redirectUrl: `${returnOrigin}/owner?subscription=success`,
    webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
    metadata: {
      owner_id: userId,
      plan,
      billing_interval: interval,
      // De webhook splitst hierop: "yearly_oneoff" activeert een jaar toegang
      // zonder een Mollie-abonnement aan te maken.
      kind: isYearly ? "yearly_oneoff" : "subscription_first_payment",
    },
  };

  if (!isYearly) {
    // LET OP — deze lijst moet blijven staan voor het machtigingspad, en de
    // reden staat er niet voor niets bij: zonder expliciete `method` kiest
    // Mollie uit ALLE ingeschakelde methodes en geeft hij
    // "No suitable payment methods found" zodra er één tussen zit die geen
    // machtiging kan afgeven (Apple Pay bijvoorbeeld). iDEAL en creditcard
    // maken allebei een herbruikbare SEPA- of kaartmachtiging.
    //
    // Wil je hier een methode bij, controleer dan eerst in het Mollie-dashboard
    // dat hij aanstaat én dat hij doorlopende machtigingen ondersteunt. PayPal
    // kan dat bijvoorbeeld wel; bankoverschrijving niet.
    paymentBody.method = ["ideal", "creditcard"];
  }
  // Voor het jaarlijkse pad juist GEEN lijst: bij een eenmalige betaling kan
  // elke ingeschakelde methode mee, inclusief bankoverschrijving en PayPal.
  // Wat je in het Mollie-dashboard aanzet verschijnt daar meteen.

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
