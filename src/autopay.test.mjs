// Snelle controle van de regels voor automatisch betalen na de proef.
// Draaien: node src/autopay.test.mjs (geen testframework nodig).
import assert from "node:assert/strict";
import {
  AUTOPAY_MONTHLY, AUTOPAY_FIRST_CHARGE_GRACE_MS, amsYmd,
  autopayChargeYmd, autopayChargeDayReached, autopayOffDeadline, autopayPhase, planIsActive,
} from "./autopay.js";

let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log("ok   " + name); }
  catch (e) { failed++; console.log("FAIL " + name + "\n     " + e.message); }
};

// "Nu" midden in oktober 2026 (Amsterdam = CEST, UTC+2).
const NOW = new Date("2026-10-10T10:00:00Z");

test("prijzen", () => {
  assert.equal(AUTOPAY_MONTHLY.starter, 19);
  assert.equal(AUTOPAY_MONTHLY.professional, 35);
  assert.equal(AUTOPAY_FIRST_CHARGE_GRACE_MS, 14 * 86400000);
});

test("amsYmd", () => {
  assert.equal(amsYmd(new Date("2026-10-10T21:59:00Z")), "2026-10-10");
  assert.equal(amsYmd(new Date("2026-10-10T22:01:00Z")), "2026-10-11");
});

// Sinds de review van 10-10-2026: de eerste afschrijving is de eerste
// Amsterdamse dag die NA het einde van de proef begint, nooit de dag zelf
// (Mollie kan op elk moment van de startdag afschrijven).
test("autopayChargeYmd: proef eindigt 's avonds = de dag erna", () => {
  assert.equal(autopayChargeYmd("2026-10-23T19:55:00Z", NOW), "2026-10-24");
});
test("autopayChargeYmd: proef eindigt na middernacht Amsterdam = dag daarna", () => {
  assert.equal(autopayChargeYmd("2026-10-23T23:30:00Z", NOW), "2026-10-25");
});
test("autopayChargeYmd: precies Amsterdamse middernacht = die dag", () => {
  assert.equal(autopayChargeYmd("2026-10-23T22:00:00Z", NOW), "2026-10-24");
  // Rond de wintertijd (25-10-2026) en in de wintertijd zelf.
  assert.equal(autopayChargeYmd("2026-10-24T22:00:00Z", NOW), "2026-10-25");
  assert.equal(autopayChargeYmd("2026-10-25T23:00:00Z", NOW), "2026-10-26");
  assert.equal(autopayChargeYmd("2026-11-05T23:00:00Z", NOW), "2026-11-06");
  assert.equal(autopayChargeYmd("2026-11-05T22:59:00Z", NOW), "2026-11-06");
});
test("autopayChargeYmd: Bonaire, proef eindigt 10:00 lokaal", () => {
  // 2026-10-24 10:00 op Bonaire = 14:00Z. Zelfde Amsterdamse dag (16:00), dus
  // de afschrijving is de 25e; die dag begint om 18:00 Bonaire-tijd op de 24e,
  // na het einde van de proef.
  assert.equal(autopayChargeYmd("2026-10-24T14:00:00Z", NOW), "2026-10-25");
  assert.equal(autopayOffDeadline("2026-10-24T14:00:00Z", NOW).toISOString(), "2026-10-24T22:00:00.000Z");
});
test("afschrijvingsdag begint nooit vóór het einde van de proef, en hooguit 25 uur erna", () => {
  // Elke 7 minuten over een jaar, inclusief beide zomertijdwissels.
  const from = Date.parse("2026-10-11T00:00:00Z");
  for (let t = from; t < from + 366 * 86400000; t += 7 * 60000) {
    const end = new Date(t);
    const dl = autopayOffDeadline(end, NOW).getTime();
    if (dl < t) throw new Error(`deadline vóór einde proef bij ${end.toISOString()}`);
    if (dl - t > 25 * 3600000) throw new Error(`deadline te laat bij ${end.toISOString()}`);
    if (autopayChargeDayReached(end, new Date(t - 1))) throw new Error(`al bereikt vóór einde proef bij ${end.toISOString()}`);
    if (!autopayChargeDayReached(end, new Date(dl))) throw new Error(`niet bereikt op de deadline bij ${end.toISOString()}`);
  }
});
test("autopayChargeYmd: verleden = vandaag", () => {
  assert.equal(autopayChargeYmd("2026-10-01T12:00:00Z", NOW), "2026-10-10");
});
test("autopayChargeYmd: ongeldig = vandaag", () => {
  assert.equal(autopayChargeYmd(null, NOW), "2026-10-10");
  assert.equal(autopayChargeYmd("onzin", NOW), "2026-10-10");
});

test("autopayChargeDayReached", () => {
  assert.equal(autopayChargeDayReached("2026-10-23T12:00:00Z", NOW), false);
  assert.equal(autopayChargeDayReached("2026-10-11T00:30:00Z", NOW), false);
  // Proef eindigt vandaag (Amsterdam): de afschrijvingsdag is morgen.
  assert.equal(autopayChargeDayReached("2026-10-10T20:00:00Z", NOW), false);
  // Proef eindigde gisteravond: vandaag is de afschrijvingsdag.
  assert.equal(autopayChargeDayReached("2026-10-09T20:00:00Z", NOW), true);
  assert.equal(autopayChargeDayReached("2026-10-05T12:00:00Z", NOW), true);
  assert.equal(autopayChargeDayReached(null, NOW), true);
});

test("autopayPhase", () => {
  const future = "2026-10-23T12:00:00Z";
  const past = "2026-10-05T12:00:00Z";
  const todayLater = "2026-10-10T20:00:00Z";
  assert.equal(autopayPhase(null, NOW), null);
  assert.equal(autopayPhase({ subscription_status: "active", mollie_subscription_id: "sub_1", trial_ends_at: future }, NOW), null);
  assert.equal(autopayPhase({ subscription_status: "past_due", trial_ends_at: future }, NOW), null);
  assert.equal(autopayPhase({ subscription_status: "trialing", mollie_subscription_id: null, trial_ends_at: future }, NOW), "off");
  assert.equal(autopayPhase({ subscription_status: "trialing", mollie_subscription_id: null, trial_ends_at: todayLater }, NOW), "off");
  assert.equal(autopayPhase({ subscription_status: "trialing", mollie_subscription_id: "sub_1", trial_ends_at: future }, NOW), "scheduled");
  assert.equal(autopayPhase({ subscription_status: "trialing", mollie_subscription_id: "sub_1", trial_ends_at: todayLater }, NOW), "scheduled");
  assert.equal(autopayPhase({ subscription_status: "trialing", mollie_subscription_id: "sub_1", trial_ends_at: "2026-10-09T20:00:00Z" }, NOW), "charging");
  assert.equal(autopayPhase({ subscription_status: "trialing", mollie_subscription_id: "sub_1", trial_ends_at: past }, NOW), "charging");
  assert.equal(autopayPhase({ subscription_status: "trialing", mollie_subscription_id: null, trial_ends_at: past }, NOW), "ended");
});

test("planIsActive: basis", () => {
  assert.equal(planIsActive(null, NOW), false);
  assert.equal(planIsActive({ plan: null }, NOW), false);
  assert.equal(planIsActive({ plan: "starter", plan_expires_at: null }, NOW), true);
  assert.equal(planIsActive({ plan: "starter", plan_expires_at: "2026-10-20T00:00:00Z" }, NOW), true);
  // Kale datum geldt tot het einde van die dag (lokale tijd).
  assert.equal(planIsActive({ plan: "starter", plan_expires_at: "2026-10-10" }, new Date(2026, 9, 10, 23, 0)), true);
});

test("planIsActive: proef zonder automatisch betalen = geen speling", () => {
  const exp = new Date(NOW.getTime() - 3600000).toISOString();
  assert.equal(planIsActive({ plan: "starter", plan_expires_at: exp, subscription_status: "trialing", mollie_subscription_id: null }, NOW), false);
});

test("planIsActive: proef mét automatisch betalen = 14 dagen speling", () => {
  const thirteenDays = new Date(NOW.getTime() - 13 * 86400000).toISOString();
  const fifteenDays = new Date(NOW.getTime() - 15 * 86400000).toISOString();
  const base = { plan: "starter", subscription_status: "trialing", mollie_subscription_id: "sub_1" };
  assert.equal(planIsActive({ ...base, plan_expires_at: thirteenDays }, NOW), true);
  assert.equal(planIsActive({ ...base, plan_expires_at: fifteenDays }, NOW), false);
});

test("planIsActive: actief abonnement houdt 3 dagen speling", () => {
  const twoDays = new Date(NOW.getTime() - 2 * 86400000).toISOString();
  const fourDays = new Date(NOW.getTime() - 4 * 86400000).toISOString();
  const base = { plan: "professional", subscription_status: "active", mollie_subscription_id: "sub_1" };
  assert.equal(planIsActive({ ...base, plan_expires_at: twoDays }, NOW), true);
  assert.equal(planIsActive({ ...base, plan_expires_at: fourDays }, NOW), false);
});

test("planIsActive: past_due = geen speling", () => {
  const oneDay = new Date(NOW.getTime() - 86400000).toISOString();
  assert.equal(planIsActive({ plan: "starter", plan_expires_at: oneDay, subscription_status: "past_due", mollie_subscription_id: null }, NOW), false);
  assert.equal(planIsActive({ plan: "starter", plan_expires_at: oneDay, subscription_status: "past_due", mollie_subscription_id: "sub_1" }, NOW), false);
});

if (failed) { console.log(`\n${failed} test(s) mislukt`); process.exit(1); }
console.log("\nalles ok");
