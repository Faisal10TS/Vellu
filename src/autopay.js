// Automatisch betalen na de proef (10-10-2026).
//
// Een salon in haar proef kan haar betaalgegevens vastleggen zonder dat er
// iets wordt afgeschreven (creditcard €0,00, iDEAL €0,01). De webhook zet dan
// een Mollie-abonnement klaar dat pas na het einde van de proef voor het eerst
// afschrijft. Er is geen aparte kolom: "staat aan" = subscription_status
// 'trialing' mét mollie_subscription_id.
//
// Bewust zonder JSX, zodat dit bestand los met node te testen is
// (src/autopay.test.mjs). De datumregels hieronder staan LETTERLIJK hetzelfde
// in de edge functions (create-subscription, mollie-webhook,
// cancel-subscription, change-plan, send-renewal-reminder): die hebben geen
// gedeelde module, en als de app een andere dag toont dan Mollie afschrijft,
// beloven we de salon iets wat niet klopt.

// Alleen voor weergave; de echte prijzen staan server-side (PLAN_PRICES).
export const AUTOPAY_MONTHLY = { starter: 19, professional: 35 };

// De eerste SEPA-incasso na de proef staat dagen op "pending" voordat de
// webhook de salon op actief zet (rond feestdagen ruim een week), en de eerste
// afschrijving valt zelf al tot een dag na het einde van de proef. Zonder
// speling stond ze precies op de dag dat ze voor het eerst betaalt voor een
// dichte deur, en het plan-scherm zou haar dan een tweede betaling laten
// proberen (create-subscription weigert die met autopay_charging). Ruim, want
// de speling eindigt vanzelf zodra er duidelijkheid is: betaald = actief,
// mislukt = past_due, en check-pending-payments sluit een abonnement dat nooit
// afschreef binnen een paar dagen af (past_due zonder abonnement).
export const AUTOPAY_FIRST_CHARGE_GRACE_MS = 14 * 86400000;

// Lopend betaald abonnement: 3 dagen speling (zie planIsActive).
export const RENEWAL_GRACE_MS = 3 * 86400000;

const AMS = "Europe/Amsterdam";
// Eén formatter per tijdzone: een nieuwe Intl.DateTimeFormat per aanroep is
// traag, en de kaart en de banner rekenen bij elke render.
const ymdFmt = {};
function ymdIn(tz, d) {
  const f = ymdFmt[tz] || (ymdFmt[tz] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }));
  return f.format(d);
}

// Kalenderdag in Amsterdam (JJJJ-MM-DD). Mollie rekent op Amsterdamse datums.
export function amsYmd(d = new Date()) {
  return ymdIn(AMS, d);
}

// Mollie schrijft een abonnement af op een Amsterdamse kalenderdag (startDate),
// op een tijdstip van die dag dat wij niet kennen. De eerste afschrijvingsdag is
// daarom de eerste Amsterdamse dag die pas NA het einde van de proef begint
// (meestal de dag na de einddatum): alleen zo wordt er nooit afgeschreven terwijl
// de proef nog loopt. Ook niet op Bonaire/Curaçao/Aruba/Sint Maarten, waar de
// Amsterdamse dag al om 18:00 of 19:00 de avond ervoor begint. Uitzetten en
// wisselen kan tot het begin van die dag, dus altijd tot minstens het einde van
// de proef.

// Het tijdstip (ms) waarop Amsterdamse dag `ymd` begint: middernacht CET of CEST.
function amsMidnightMs(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  for (const h of [1, 2]) {
    const t = base - h * 3600000;
    if (ymdIn(AMS, new Date(t)) === ymd && ymdIn(AMS, new Date(t - 1)) !== ymd) return t;
  }
  return base - 3600000;
}

// Eerste Amsterdamse dag die op of na het einde van de proef begint.
function autopayFirstYmd(end) {
  const d = ymdIn(AMS, end);
  if (amsMidnightMs(d) >= end.getTime()) return d;
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
}

// Eerste afschrijving (= Mollie-startDate), nooit vóór vandaag (Amsterdam).
export function autopayChargeYmd(trialEndsAt, now = new Date()) {
  const end = new Date(String(trialEndsAt || ""));
  const today = ymdIn(AMS, now);
  if (isNaN(end.getTime())) return today;
  const d = autopayFirstYmd(end);
  return d > today ? d : today;
}

// Vanaf het begin van de eerste afschrijvingsdag kan Mollie de betaling al
// hebben aangemaakt: uitzetten/wisselen kan dan niet meer.
export function autopayChargeDayReached(trialEndsAt, now = new Date()) {
  const end = new Date(String(trialEndsAt || ""));
  if (isNaN(end.getTime())) return true;
  return ymdIn(AMS, now) >= autopayFirstYmd(end);
}

// Uiterste moment om uit te zetten of te wisselen (Date): het begin van de
// eerste afschrijvingsdag in Amsterdam. Zelfde moment waarop cancel-subscription
// en change-plan first_charge_started gaan geven.
export function autopayOffDeadline(trialEndsAt, now = new Date()) {
  return new Date(amsMidnightMs(autopayChargeYmd(trialEndsAt, now)));
}

// Fase van automatisch betalen voor een profiel
// ({ subscription_status, mollie_subscription_id, trial_ends_at }):
//   null        geen proef
//   "off"       proef loopt, niets vastgelegd
//   "scheduled" vastgelegd, eerste afschrijving nog niet begonnen
//   "charging"  afschrijvingsdag bereikt, webhook heeft haar nog niet actief gezet
//   "ended"     proef voorbij zonder automatisch betalen
export function autopayPhase(p, now = new Date()) {
  if (!p || p.subscription_status !== "trialing") return null;
  const hasSub = !!p.mollie_subscription_id;
  const end = new Date(String(p.trial_ends_at || ""));
  if (hasSub) return autopayChargeDayReached(p.trial_ends_at, now) ? "charging" : "scheduled";
  if (isNaN(end.getTime())) return "ended";
  return end.getTime() > now.getTime() ? "off" : "ended";
}

// ─── PLAN-TOEGANG ─────────────────────────────────────────────
// Mag deze eigenaar de app in? Normaal: een plan én plan_expires_at in de
// toekomst (een datum zonder tijd geldt tot het EINDE van die dag).
//
// Verlengingscoulance (sinds 2026-08-22): voor een LOPEND betaald abonnement
// (subscription_status 'active' + Mollie-abonnement) geldt 3 dagen speling ná
// plan_expires_at. Mollie incasseert de verlenging op zijn eigen moment en pas
// de webhook (recurring.paid) schuift plan_expires_at op; komt die webhook te
// laat of even niet aan, dan stond een betalende salon tot nu toe op de minuut
// voor een dichte deur. Mislukt de incasso écht, dan zet de webhook
// subscription_status op 'past_due' en vervalt de coulance direct.
//
// Proef mét automatisch betalen (sinds 10-10-2026): 14 dagen speling (zie
// AUTOPAY_FIRST_CHARGE_GRACE_MS), want de eerste afschrijving valt na het einde
// van de proef en een SEPA-incasso staat dagen op "pending". Mislukt hij, dan
// zet de webhook de salon meteen op 'past_due' en is de speling ook direct
// voorbij. Proeven zonder automatisch betalen en jaarklanten-zonder-abonnement
// (eenmalige betaling) hebben geen mollie_subscription_id en krijgen geen
// speling.
//
// Staat hier (en niet in App.jsx) zodat de test hem zonder JSX kan importeren.
export function planIsActive(owner, now = new Date()) {
  if (!owner?.plan) return false;
  const raw = owner.plan_expires_at;
  if (!raw) return true;
  const exp = new Date(typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + "T23:59:59" : raw);
  if (exp > now) return true;
  const renewing = !!owner.mollie_subscription_id && (owner.subscription_status === "active" || owner.subscription_status === "trialing");
  const grace = owner.subscription_status === "trialing" ? AUTOPAY_FIRST_CHARGE_GRACE_MS : RENEWAL_GRACE_MS;
  return renewing && (now - exp) < grace;
}
