// send-renewal-reminder — dagelijkse herinneringen rond aflopende toegang.
//
// 1. JAARABONNEES: een jaarabonnement is een EENMALIGE betaling (zie
//    create-subscription): geen doorlopende machtiging, dus geen automatische
//    incasso. Toegang loopt puur op profiles.plan_expires_at. Een week van
//    tevoren een mail met een knop om opnieuw te betalen. Maandabonnees raakt
//    dit niet: die hebben een Mollie-abonnement (mollie_subscription_id).
//
// 2. PROEFPERIODES (sinds 11-09-2026): hier ging eerder NIETS uit. Een salon
//    zag alleen "nog X dagen" onder Abonnement & account en werd op de dag zelf
//    zonder bericht uit het dashboard gezet (planIsActive kent geen coulance
//    voor proeven). Brilliant Beauty en Honeysets liepen zo op 10-09 blind uit
//    hun proef; de eerste probeerde 's avonds nog vijf keer te betalen.
//    Nu: 3 dagen vóór het einde een mail (trial_ending) en op de dag van
//    aflopen een mail + push + kopie aan de beheerder (trial_expired). De
//    boekingspagina blijft na afloop gewoon werken (book-appointment kijkt niet
//    naar het abonnement); alleen het dashboard staat op pauze.
//
// 2b/3b. PROEF MET AUTOMATISCH BETALEN (sinds 10-10-2026): trialing + een
//    Mollie-abonnement dat pas na het einde van de proef voor het eerst
//    afschrijft (de eerste Amsterdamse dag die na het einde begint). Secties 2 en 3 slaan die salons al over (mollie_subscription_id
//    IS NULL), want "kies een plan" en "je dashboard staat op pauze" kloppen voor
//    hen niet. Zij krijgen 3 dagen vooraf trial_autopay_ending (datum, bedrag,
//    hoe uit te zetten) en op de dag van de afschrijving trial_autopay_today,
//    allebei mail + push. Geen kopie aan de beheerder.
//
// DEDUPE: renewal_reminder_log (owner_id, plan_expires_at, kind) — insert on
// conflict = al gemaild. Vensters i.p.v. exacte dagen zodat een gemiste run
// niet betekent dat er nooit meer een herinnering komt.
//
// TOEGANG: verify_jwt=false (cron, geen gebruikers-JWT). Sinds 05-10-2026 wel
// een geheim: x-internal-secret = service-role-sleutel, of x-cron-secret =
// CRON_SECRET (Vercel) of het vault-geheim cron_secret (pg_cron-job
// send-renewal-reminder-daily, gecontroleerd via rpc cron_secret_ok). Zonder
// geheim 401, zodat niemand van buiten mails, pushes en beheerdersmeldingen
// kan laten afgaan.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") || "mirahventures@vellu.cc";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Zelfde controle als de cron-functies van send-reminders c.s.
async function cronAuthorized(req: Request): Promise<boolean> {
  const internal = req.headers.get("x-internal-secret") || "";
  if (internal && internal === SUPABASE_SERVICE_KEY) return true;
  const cron = req.headers.get("x-cron-secret") || "";
  if (!cron) return false;
  if (CRON_SECRET && cron === CRON_SECRET) return true;
  try {
    const { data, error } = await supabase.rpc("cron_secret_ok", { p_secret: cron });
    return !error && data === true;
  } catch { return false; }
}

const DAGEN_VOORAF = 7;          // jaarabonnement
const PROEF_DAGEN_VOORAF = 3;    // proef: eerste mail
const PROEF_VENSTER_NA_DAGEN = 7; // proef afgelopen: tot een week terug (gemiste run, of de eerste run na deze uitbreiding)

const DUTCH = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const langOf = (cc: unknown) => DUTCH.has(String(cc || "NL").toUpperCase()) ? "nl" : "en";
const DAY_MS = 24 * 60 * 60 * 1000;

// Maandprijzen, kopie van PLAN_PRICES in create-subscription: het bedrag van de
// eerste afschrijving bij automatisch betalen.
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
// Bedrag zoals de app en send-emails het schrijven: komma, duizendtallen met een
// punt ("€19,00"). Kopie van fN in send-emails; nooit toFixed(2) met een punt.
const fN = (p: unknown) => {
  const v = parseFloat(String(p)) || 0;
  const [i, d] = Math.abs(v).toFixed(2).split(".");
  return (v < 0 && +Math.abs(v).toFixed(2) !== 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d;
};
// Tijdzone per land, zelfde tabel als TZ_BY_COUNTRY in shared.jsx en
// send-emails. Onbekend land = Amsterdam.
const TZ_BY_COUNTRY: Record<string, string> = { NL: "Europe/Amsterdam", BE: "Europe/Brussels", GB: "Europe/London", AW: "America/Curacao", CW: "America/Curacao", BQ: "America/Curacao", SX: "America/Curacao" };
const tzFor = (cc: unknown) => TZ_BY_COUNTRY[String(cc || "").toUpperCase()] || "Europe/Amsterdam";
// Uiterste uitzetmoment (begin van de afschrijvingsdag in Amsterdam) op de klok
// van de salon, voor de push: "vóór 25 oktober" in Nederland, "vóór 24 oktober
// 18:00" op Bonaire. Zelfde regel als offByTxt in send-emails.
const pushOffBy = (deadline: Date, cc: unknown, lang: string) => {
  const tz = tzFor(cc);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(deadline);
  const dag = new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long", timeZone: tz }).format(deadline);
  if (hm === "00:00") return lang === "nl" ? `vóór ${dag}` : `before ${dag}`;
  return lang === "nl" ? `vóór ${dag} ${hm}` : `before ${hm} on ${dag}`;
};
// Kale datum (YYYY-MM-DD) als "23 oktober" / "23 October" voor de push.
const pushDate = (ymd: string, lang: string) =>
  new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(ymd + "T12:00:00Z"));

async function push(userId: string, title: string, body: string, url: string, tag: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, title, body, url, tag }),
  });
  if (!r.ok) console.error(`send-push-notification ${tag} → ${r.status}`);
}

async function recordHealth(status: string, ms: number, processed: number, err: string | null) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "send-renewal-reminder",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* logtabel mag de run nooit laten falen */ }
}

// Claim vóór het mailen: slaagt de insert, dan is dit de eerste keer voor
// (salon, datum, soort); botst hij, dan is er al gemaild.
async function claim(ownerId: string, key: string, kind: string): Promise<boolean> {
  const { error } = await supabase.from("renewal_reminder_log").insert({ owner_id: ownerId, plan_expires_at: key, kind });
  return !error;
}

async function mail(type: string, booking: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
    method: "POST",
    headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type, booking }),
  });
  if (!r.ok) console.error(`send-emails ${type} → ${r.status}`, await r.text().catch(() => ""));
}

serve(async (req) => {
  if (!(await cronAuthorized(req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const t0 = Date.now();
  let verstuurd = 0;
  try {
    const nu = new Date();

    // ── 1. Jaarabonnees: een week vóór de vervaldatum ────────────────────
    const grens = new Date(nu.getTime() + DAGEN_VOORAF * DAY_MS);
    const { data: jaar, error: e1 } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, billing_interval, plan_expires_at, subscription_status, mollie_subscription_id, cancel_at_period_end")
      .eq("billing_interval", "yearly")
      .eq("subscription_status", "active")
      .is("mollie_subscription_id", null)   // alleen eenmalige jaarbetalers, geen machtiging
      .not("plan_expires_at", "is", null)
      .lte("plan_expires_at", grens.toISOString())
      .gt("plan_expires_at", nu.toISOString());
    if (e1) throw e1;
    for (const s of jaar || []) {
      if (s.cancel_at_period_end || !s.email) continue; // wie zelf opzegde hoeft geen "verleng nu"
      if (!(await claim(s.id, s.plan_expires_at, "renewal"))) continue;
      try {
        await mail("renewal_reminder", {
          owner_email: s.email, owner_id: s.id, owner_lang: langOf(s.country_code), country_code: s.country_code || "NL",
          business_name: s.business_name, salon_name: s.business_name,
          plan: s.plan || "professional", plan_expires_at: s.plan_expires_at,
        });
        verstuurd++;
      } catch (e) { console.error("renewal reminder email error for", s.id, e); }
    }

    // ── 2. Proef eindigt binnen 3 dagen ──────────────────────────────────
    const proefGrens = new Date(nu.getTime() + PROEF_DAGEN_VOORAF * DAY_MS);
    const { data: bijna, error: e2 } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, trial_ends_at, subscription_status, mollie_subscription_id")
      .eq("subscription_status", "trialing")
      .is("mollie_subscription_id", null)
      .not("trial_ends_at", "is", null)
      .gt("trial_ends_at", nu.toISOString())
      .lte("trial_ends_at", proefGrens.toISOString());
    if (e2) throw e2;
    for (const s of bijna || []) {
      if (!s.email) continue;
      if (!(await claim(s.id, s.trial_ends_at, "trial_ending"))) continue;
      const daysLeft = Math.max(1, Math.ceil((new Date(s.trial_ends_at).getTime() - nu.getTime()) / DAY_MS));
      try {
        await mail("trial_ending", {
          owner_email: s.email, owner_id: s.id, owner_lang: langOf(s.country_code), country_code: s.country_code || "NL",
          business_name: s.business_name, salon_name: s.business_name,
          plan: s.plan || "starter", trial_ends_at: s.trial_ends_at, days_left: daysLeft,
        });
        verstuurd++;
      } catch (e) { console.error("trial_ending email error for", s.id, e); }
    }

    // ── 2b. Automatisch betalen: proef eindigt binnen 3 dagen ────────────
    // Zelfde venster als sectie 2. Is de dag van de afschrijving al bereikt,
    // dan dekt sectie 3b die dag.
    const { data: apBijna, error: e2b } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, trial_ends_at, subscription_status, mollie_subscription_id, referral_credit_days")
      .eq("subscription_status", "trialing")
      .not("mollie_subscription_id", "is", null)
      .not("trial_ends_at", "is", null)
      .gt("trial_ends_at", nu.toISOString())
      .lte("trial_ends_at", proefGrens.toISOString());
    if (e2b) throw e2b;
    for (const s of apBijna || []) {
      if (!s.email) continue;
      if (autopayChargeDayReached(s.trial_ends_at, nu)) continue;
      if (!(await claim(s.id, s.trial_ends_at, "trial_autopay_ending"))) continue;
      const lang = langOf(s.country_code);
      const plan = PLAN_PRICES[String(s.plan || "")] ? String(s.plan) : "starter";
      const chargeYmd = autopayChargeYmd(s.trial_ends_at, nu);
      const amount = PLAN_PRICES[plan].monthly;
      const offDeadline = new Date(amsMidnightMs(chargeYmd));
      // Dagen tot de EINDDATUM van de proef in kalenderdagen op de klok van de
      // salon: het onderwerp ("eindigt morgen") moet kloppen met de einddatum
      // in de mail, en die staat ook op haar klok. 0 = vandaag. De klok-
      // berekening van sectie 2 zei "over 2 dagen" bij een proef die morgen om
      // 21:00 afloopt.
      const tz = tzFor(s.country_code);
      const daysLeft = Math.max(0, Math.round((Date.parse(ymdIn(tz, new Date(String(s.trial_ends_at))) + "T12:00:00Z") - Date.parse(ymdIn(tz, nu) + "T12:00:00Z")) / DAY_MS));
      try {
        await mail("trial_autopay_ending", {
          owner_email: s.email, owner_id: s.id, owner_lang: lang, country_code: s.country_code || "NL",
          business_name: s.business_name, salon_name: s.business_name,
          plan, trial_ends_at: s.trial_ends_at, days_left: daysLeft,
          first_charge_date: chargeYmd, first_charge_amount: amount,
          autopay_off_deadline: offDeadline.toISOString(),
          credit_days: s.referral_credit_days || 0,
        });
        verstuurd++;
      } catch (e) { console.error("trial_autopay_ending email error for", s.id, e); }
      try {
        const datum = pushDate(chargeYmd, lang);
        const bedrag = "€" + fN(amount);
        const uiterlijk = pushOffBy(offDeadline, s.country_code, lang);
        await push(
          s.id,
          lang === "nl" ? "Je proefperiode eindigt bijna" : "Your trial is almost over",
          lang === "nl" ? `Op ${datum} schrijven we ${bedrag} af. Uitzetten kan ${uiterlijk}, bij Abonnement.` : `On ${datum} we will charge ${bedrag}. You can turn this off ${uiterlijk} under Subscription.`,
          "/owner?tab=billing", `trial-autopay-ending-${s.id}`,
        );
      } catch (e) { console.error("trial_autopay_ending push error for", s.id, e); }
    }

    // ── 3. Proef afgelopen zonder plan: mail + push + kopie aan beheerder ─
    const proefTerug = new Date(nu.getTime() - PROEF_VENSTER_NA_DAGEN * DAY_MS);
    const { data: voorbij, error: e3 } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, trial_ends_at, subscription_status, mollie_subscription_id")
      .eq("subscription_status", "trialing")
      .is("mollie_subscription_id", null)
      .not("trial_ends_at", "is", null)
      .lte("trial_ends_at", nu.toISOString())
      .gte("trial_ends_at", proefTerug.toISOString());
    if (e3) throw e3;
    for (const s of voorbij || []) {
      if (!s.email) continue;
      if (!(await claim(s.id, s.trial_ends_at, "trial_expired"))) continue;
      const lang = langOf(s.country_code);
      try {
        await mail("trial_expired", {
          owner_email: s.email, owner_id: s.id, owner_lang: lang, country_code: s.country_code || "NL",
          business_name: s.business_name, salon_name: s.business_name,
          plan: s.plan || "starter", trial_ends_at: s.trial_ends_at, days_left: 0,
        });
        verstuurd++;
      } catch (e) { console.error("trial_expired email error for", s.id, e); }
      // Push naar de eigenaar (alleen als ze meldingen aan heeft; anders no-op).
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: s.id,
            title: lang === "nl" ? "Je proefperiode is afgelopen" : "Your trial has ended",
            body: lang === "nl" ? "Kies een plan om je dashboard weer te openen. Je boekingspagina blijft werken." : "Choose a plan to reopen your dashboard. Your booking page keeps working.",
            url: "/owner", tag: `trial-expired-${s.id}`,
          }),
        });
      } catch (e) { console.error("trial push error for", s.id, e); }
      // Kopie aan de beheerder: een afgelopen proef zonder betaling is een
      // salon die je dezelfde dag wilt nabellen, net als bij een mislukte betaling.
      try {
        if (RESEND_API_KEY) {
          const rows = [
            `Salon: ${s.business_name || "?"} (${s.email})`,
            `Land: ${s.country_code || "?"}`,
            `Plan tijdens proef: ${s.plan || "?"}`,
            `Proef eindigde op: ${String(s.trial_ends_at).slice(0, 16).replace("T", " ")} UTC`,
            `Geen Mollie-abonnement; de salon heeft zojuist de "proef afgelopen"-mail gekregen.`,
          ].join("<br/>");
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Vellu Monitoring <noreply@vellu.cc>",
              to: [ADMIN_ALERT_EMAIL],
              subject: `Proef afgelopen zonder betaling: ${s.business_name || s.id}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:640px;"><h2 style="margin:0 0 12px;">Een proefperiode is afgelopen zonder plan</h2><p style="font-size:13px;line-height:1.7;">${rows}</p></div>`,
            }),
          });
        }
      } catch (e) { console.error("admin trial alert error for", s.id, e); }
    }

    // ── 3b. Automatisch betalen: de dag van de eerste afschrijving ──────
    // De eerste Amsterdamse dag die na het einde van de proef begint = de
    // startdatum van het Mollie-abonnement (autopayFirstYmd). De cron draait om
    // 08:00 UTC, dan is het in Amsterdam al die dag. Een salon wiens kaart vóór die tijd al werd belast staat al op
    // actief en krijgt alleen de factuurmail; zo bedoeld.
    const { data: apVandaag, error: e3b } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, trial_ends_at, subscription_status, mollie_subscription_id, referral_credit_days")
      .eq("subscription_status", "trialing")
      .not("mollie_subscription_id", "is", null)
      .not("trial_ends_at", "is", null)
      .gte("trial_ends_at", new Date(nu.getTime() - 2 * DAY_MS).toISOString())
      .lte("trial_ends_at", new Date(nu.getTime() + 2 * DAY_MS).toISOString());
    if (e3b) throw e3b;
    const vandaagAms = ymdIn(AMS, nu);
    for (const s of apVandaag || []) {
      if (!s.email) continue;
      const end = new Date(String(s.trial_ends_at));
      if (isNaN(end.getTime()) || autopayFirstYmd(end) !== vandaagAms) continue;
      if (!(await claim(s.id, s.trial_ends_at, "trial_autopay_today"))) continue;
      const lang = langOf(s.country_code);
      const plan = PLAN_PRICES[String(s.plan || "")] ? String(s.plan) : "starter";
      const amount = PLAN_PRICES[plan].monthly;
      try {
        await mail("trial_autopay_today", {
          owner_email: s.email, owner_id: s.id, owner_lang: lang, country_code: s.country_code || "NL",
          business_name: s.business_name, salon_name: s.business_name,
          plan, trial_ends_at: s.trial_ends_at, days_left: 0,
          first_charge_date: vandaagAms, first_charge_amount: amount,
          credit_days: s.referral_credit_days || 0,
        });
        verstuurd++;
      } catch (e) { console.error("trial_autopay_today email error for", s.id, e); }
      try {
        const bedrag = "€" + fN(amount);
        await push(
          s.id,
          lang === "nl" ? "Je abonnement gaat vandaag in" : "Your subscription starts today",
          lang === "nl" ? `Vandaag schrijven we ${bedrag} af. Je dashboard blijft gewoon open.` : `Today we charge ${bedrag}. Your dashboard stays open.`,
          "/owner?tab=billing", `trial-autopay-today-${s.id}`,
        );
      } catch (e) { console.error("trial_autopay_today push error for", s.id, e); }
    }

    await recordHealth("success", Date.now() - t0, verstuurd, null);
    return new Response(JSON.stringify({ ok: true, verstuurd }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await recordHealth("error", Date.now() - t0, verstuurd, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
