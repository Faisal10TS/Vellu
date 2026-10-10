// Testbank voor "automatisch betalen na de proef" (10-10-2026).
//
// Draait de echte edge functions (create-subscription, mollie-webhook,
// cancel-subscription, change-plan, send-renewal-reminder, send-emails) en
// api/check-trials.js in Node, zonder netwerk en zonder productie:
//   - esbuild bundelt elke index.ts; imports van deno.land / esm.sh worden naar
//     stubs/ omgeleid (serve bewaart de handler, supabase-js is een in-memory
//     database);
//   - fetch is vervangen: Mollie, Resend en de functions/v1-aanroepen worden
//     alleen vastgelegd en krijgen een gescript antwoord.
// Er gaat dus nooit een mail, betaling of databasewijziging de deur uit.
//
// Gebruik: node supabase/tests/autopay/run.mjs   (exit 1 bij een fout)
//
// De verwachte afschrijvingsdatum komt uit src/autopay.js (de app): zo faalt de
// test ook als een van de vijf server-kopieën van de datumregel afwijkt.

process.env.TZ = "UTC"; // edge functions draaien in UTC (Deno Deploy)

import { build } from "esbuild";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const STUB_SERVE = path.join(HERE, "stubs", "serve.mjs");
const STUB_SUPA = path.join(HERE, "stubs", "supabase.mjs");
const { db, resetDb } = await import(pathToFileURL(STUB_SUPA).href);
const { autopayChargeYmd, autopayChargeDayReached, autopayOffDeadline } = await import(pathToFileURL(path.join(ROOT, "src", "autopay.js")).href);

// ── Omgeving ────────────────────────────────────────────────────────────
const ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc-test-key",
  MOLLIE_API_KEY: "test_mollie_key",
  RESEND_API_KEY: "re_test_key",
  ADMIN_ALERT_EMAIL: "admin@example.test",
  APP_URL: "https://vellu.cc",
  CRON_SECRET: "cron-test",
};
globalThis.Deno = { env: { get: (k) => ENV[k] } };
process.env.VITE_SUPABASE_URL = ENV.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
process.env.CRON_SECRET = ENV.CRON_SECRET;

// ── Nep-fetch ───────────────────────────────────────────────────────────
let calls;          // per test: { mollie: [], resend: [], fns: [] }
let mollie;         // per test: { payments: {}, subs: {}, override: null, seq }
function resetNet() {
  calls = { mollie: [], resend: [], fns: [] };
  mollie = { payments: {}, subs: {}, override: null, seq: 1 };
}
const json = (status, body) => new Response(body === undefined || status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mollieDefault(method, p, body) {
  let m;
  if (method === "GET" && (m = /^\/payments\/(tr_\w+)$/.exec(p))) {
    const pay = mollie.payments[m[1]];
    return pay ? json(200, pay) : json(404, { status: 404 });
  }
  if (method === "POST" && p === "/customers") return json(201, { id: "cst_new" });
  if (method === "POST" && p === "/payments") {
    const id = `tr_new${mollie.seq++}`;
    return json(201, { id, status: "open", _links: { checkout: { href: `https://mollie.test/checkout/${id}` } } });
  }
  if (method === "GET" && /^\/customers\/\w+\/mandates\/\w+$/.test(p)) return json(200, { status: "valid" });
  if (method === "DELETE" && /^\/customers\/\w+\/mandates\/\w+$/.test(p)) return json(204);
  if ((m = /^\/customers\/(\w+)\/subscriptions$/.exec(p)) && method === "POST") {
    const id = `sub_new${mollie.seq++}`;
    mollie.subs[id] = { id, status: "active", customerId: m[1], ...body };
    return json(201, mollie.subs[id]);
  }
  if ((m = /^\/customers\/(\w+)\/subscriptions\/(\w+)\/payments\?limit=\d+$/.exec(p)) && method === "GET") {
    const list = Object.values(mollie.payments).filter((x) => x.subscriptionId === m[2]);
    return json(200, { _embedded: { payments: list } });
  }
  if ((m = /^\/customers\/(\w+)\/subscriptions\?limit=\d+$/.exec(p)) && method === "GET") {
    const list = Object.values(mollie.subs).filter((s) => s.customerId === m[1]);
    return json(200, { _embedded: { subscriptions: list } });
  }
  if ((m = /^\/customers\/(\w+)\/subscriptions\/(\w+)$/.exec(p))) {
    const s = mollie.subs[m[2]];
    if (method === "DELETE") { if (!s) return json(404, { status: 404 }); s.status = "canceled"; return json(200, s); }
    if (method === "PATCH") { if (!s) return json(404, { status: 404 }); Object.assign(s, body); return json(200, s); }
    if (method === "GET") return s ? json(200, s) : json(404, { status: 404 });
  }
  return json(404, { status: 404, detail: `nep-Mollie kent ${method} ${p} niet` });
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = (init.method || "GET").toUpperCase();
  let body = null;
  if (init.body) { try { body = JSON.parse(init.body); } catch { body = init.body; } }
  if (u.startsWith("https://api.mollie.com/v2")) {
    const p = u.slice("https://api.mollie.com/v2".length);
    calls.mollie.push({ method, path: p, body });
    const o = mollie.override ? mollie.override(method, p, body) : undefined;
    return o || mollieDefault(method, p, body);
  }
  if (u === "https://api.resend.com/emails") {
    calls.resend.push(body);
    return json(200, { id: `re_${calls.resend.length}` });
  }
  if (u.startsWith(`${ENV.SUPABASE_URL}/functions/v1/`)) {
    calls.fns.push({ fn: u.split("/functions/v1/")[1], body });
    return json(200, { success: true });
  }
  throw new Error("onverwachte fetch: " + method + " " + u);
};

// ── Bundelen ────────────────────────────────────────────────────────────
const OUT = mkdtempSync(path.join(tmpdir(), "vellu-autopay-"));
const stubPlugin = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /^https:\/\// }, (a) => {
      if (a.path.includes("/http/server.ts")) return { path: STUB_SERVE };
      if (a.path.includes("supabase-js")) return { path: STUB_SUPA };
      return { errors: [{ text: "geen stub voor " + a.path }] };
    });
    b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: STUB_SUPA }));
  },
};
async function load(rel, kind = "deno") {
  const r = await build({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "esm", platform: "node", target: "node20", write: false, plugins: [stubPlugin], logLevel: "silent" });
  const file = path.join(OUT, rel.replace(/[\\/]/g, "_") + ".mjs");
  writeFileSync(file, r.outputFiles[0].text);
  globalThis.__handler = null;
  const mod = await import(pathToFileURL(file).href);
  return kind === "deno" ? globalThis.__handler : mod.default;
}
const H = {
  webhook: await load("supabase/functions/mollie-webhook/index.ts"),
  create: await load("supabase/functions/create-subscription/index.ts"),
  cancel: await load("supabase/functions/cancel-subscription/index.ts"),
  change: await load("supabase/functions/change-plan/index.ts"),
  remind: await load("supabase/functions/send-renewal-reminder/index.ts"),
  pending: await load("supabase/functions/check-pending-payments/index.ts"),
  emails: await load("supabase/functions/send-emails/index.ts"),
  checkTrials: await load("api/check-trials.js", "node"),
};

// ── Hulpjes ─────────────────────────────────────────────────────────────
const DAY = 86400000;
const OWNER = () => db().user.id;
const iso = (ms) => new Date(ms).toISOString();
const inDays = (n) => iso(Date.now() + n * DAY);
const ams = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
// Eerste afschrijving volgens de app (eerste Amsterdamse dag NA het einde van de proef).
const chargeYmd = (end) => autopayChargeYmd(end);
const addMonth = (isoStr) => { const d = new Date(isoStr); d.setMonth(d.getMonth() + 1); return d; };
const prof = () => db().tables.profiles.find((p) => p.id === OWNER());
function seedProfile(over = {}) {
  const p = {
    id: OWNER(), business_name: "Testsalon", email: "salon@example.test", country_code: "BQ", btw_id: null,
    plan: "starter", billing_interval: "monthly", subscription_status: "trialing",
    trial_ends_at: inDays(5), plan_expires_at: null, current_period_start: null,
    cancel_at_period_end: false, cancelled_at: null,
    mollie_customer_id: "cst_1", mollie_mandate_id: null, mollie_subscription_id: null,
    referral_credit_days: 0, referral_credit_days_redeemed: 0, plan_change_started_at: null,
    ...over,
  };
  if (!("plan_expires_at" in over)) p.plan_expires_at = p.trial_ends_at;
  db().tables.profiles.push(p);
  return p;
}
function mandatePayment(over = {}) {
  return {
    id: "tr_m1", status: "paid", amount: { value: "0.00", currency: "EUR" }, sequenceType: "first",
    customerId: "cst_1", mandateId: "mdt_1", method: "creditcard", description: "Vellu Starter: automatisch betalen na proef",
    createdAt: inDays(0),
    metadata: { owner_id: OWNER(), plan: "starter", billing_interval: "monthly", kind: "trial_autopay_mandate", method: "creditcard" },
    ...over,
  };
}
async function hook(paymentId) {
  const res = await H.webhook(new Request(`${ENV.SUPABASE_URL}/functions/v1/mollie-webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: paymentId }) }));
  return { status: res.status, text: await res.text() };
}
async function api(handler, fn, body) {
  const res = await handler(new Request(`${ENV.SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://vellu.cc", authorization: "Bearer user-jwt" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}
async function remind() {
  const res = await H.remind(new Request(`${ENV.SUPABASE_URL}/functions/v1/send-renewal-reminder`, { method: "POST", headers: { "x-internal-secret": ENV.SUPABASE_SERVICE_ROLE_KEY } }));
  return { status: res.status, body: await res.json() };
}
async function email(type, booking) {
  const res = await H.emails(new Request(`${ENV.SUPABASE_URL}/functions/v1/send-emails`, { method: "POST", headers: { "content-type": "application/json", "x-internal-secret": ENV.SUPABASE_SERVICE_ROLE_KEY }, body: JSON.stringify({ type, booking }) }));
  return { status: res.status, body: await res.json() };
}
const mcalls = (method, re) => calls.mollie.filter((c) => c.method === method && re.test(c.path));
const fnMails = (type) => calls.fns.filter((c) => c.fn === "send-emails" && c.body?.type === type);
const pushes = () => calls.fns.filter((c) => c.fn === "send-push-notification");
const rpc = (name) => db().rpcCalls.filter((c) => c.name === name);
// Pijlen (U+2190-21FF), symbolen/dingbats (U+2600-27BF) en emoji (U+1F300+); als
// codepunten opgebouwd zodat dit bestand zelf geen van die tekens bevat.
const cp = (n) => String.fromCodePoint(n);
const BAD_UNICODE = new RegExp(`[${cp(0x2190)}-${cp(0x21ff)}${cp(0x2600)}-${cp(0x27bf)}${cp(0x1f300)}-${cp(0x1ffff)}]`, "u");

// ── Testlijst ───────────────────────────────────────────────────────────
const tests = [];
const t = (name, fn) => tests.push({ name, fn });

// mollie-webhook ─────────────────────────────────────────────────────────
t("W1 machtiging creditcard 0,00 betaald: abonnement gepland, proef blijft", async () => {
  const p0 = seedProfile();
  mollie.payments.tr_m1 = mandatePayment();
  const r = await hook("tr_m1");
  assert.equal(r.status, 200); assert.equal(r.text, "ok");
  const posts = mcalls("POST", /^\/customers\/cst_1\/subscriptions$/);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.amount.value, "19.00");
  assert.equal(posts[0].body.amount.currency, "EUR");
  assert.equal(posts[0].body.interval, "1 month");
  assert.equal(posts[0].body.startDate, chargeYmd(p0.trial_ends_at));
  assert.ok(posts[0].body.startDate > ams(p0.trial_ends_at), "afschrijving pas de dag na het einde (Amsterdam)");
  assert.equal(posts[0].body.mandateId, "mdt_1");
  assert.equal(posts[0].body.metadata.kind, "trial_autopay");
  assert.equal(posts[0].body.metadata.mandate_payment_id, "tr_m1");
  const p = prof();
  assert.ok(p.mollie_subscription_id && p.mollie_subscription_id.startsWith("sub_new"));
  assert.equal(p.mollie_mandate_id, "mdt_1");
  assert.equal(p.mollie_customer_id, "cst_1", "klant-id uit de betaling in het profiel");
  assert.equal(p.subscription_status, "trialing");
  assert.equal(p.plan_expires_at, p0.plan_expires_at);
  assert.equal(p.billing_interval, "monthly");
  assert.equal(db().tables.payment_invoices.length, 0);
  assert.equal(rpc("grant_referral_credit").length, 0);
  assert.equal(fnMails("subscription_invoice").length, 0);
  const on = fnMails("trial_autopay_on");
  assert.equal(on.length, 1);
  assert.equal(on[0].body.booking.amount_now, 0);
  assert.equal(on[0].body.booking.first_charge_date, chargeYmd(p0.trial_ends_at));
  assert.equal(on[0].body.booking.autopay_off_deadline, autopayOffDeadline(p0.trial_ends_at).toISOString());
  assert.ok(Date.parse(on[0].body.booking.autopay_off_deadline) >= Date.parse(p0.trial_ends_at), "uitzetten kan tot minstens het einde van de proef");
  assert.equal(on[0].body.booking.first_charge_amount, 19);
  assert.equal(on[0].body.booking.owner_lang, "nl");
  const ev = db().tables.payment_events.find((e) => e.mollie_payment_id === "tr_m1" && e.event_type === "first.paid");
  assert.ok(ev && ev.processed_at, "first.paid verwerkt");
  assert.equal(calls.resend.length, 0, "geen beheerdersmelding");
});

t("W2 dezelfde webhook nog een keer: duplicaat, geen tweede abonnement", async () => {
  seedProfile();
  mollie.payments.tr_m1 = mandatePayment();
  await hook("tr_m1");
  const r = await hook("tr_m1");
  assert.equal(r.text, "ok (duplicate)");
  assert.equal(mcalls("POST", /\/subscriptions$/).length, 1);
  assert.equal(fnMails("trial_autopay_on").length, 1);
});

t("W3 iDEAL 0,01 betaald: mail meldt amount_now 0,01", async () => {
  seedProfile({ country_code: "NL" });
  mollie.payments.tr_m1 = mandatePayment({ amount: { value: "0.01", currency: "EUR" }, method: "ideal", metadata: { owner_id: OWNER(), plan: "starter", billing_interval: "monthly", kind: "trial_autopay_mandate", method: "ideal" } });
  const r = await hook("tr_m1");
  assert.equal(r.status, 200);
  const on = fnMails("trial_autopay_on");
  assert.equal(on.length, 1);
  assert.equal(on[0].body.booking.amount_now, 0.01);
  assert.equal(on[0].body.booking.method, "ideal");
  assert.equal(db().tables.payment_invoices.length, 0);
});

for (const st of ["canceled", "expired", "failed"]) {
  t(`W4 machtiging ${st}: geen salonmail, één beheerdersmelding, profiel onaangeroerd`, async () => {
    seedProfile();
    const before = JSON.stringify(prof());
    mollie.payments.tr_m1 = mandatePayment({ status: st, mandateId: undefined });
    const r = await hook("tr_m1");
    assert.equal(r.status, 200);
    assert.equal(fnMails("payment_failed").length, 0);
    assert.equal(calls.fns.length, 0);
    assert.equal(calls.resend.length, 1);
    assert.ok(calls.resend[0].subject.startsWith("Automatisch betalen afgebroken"), calls.resend[0].subject);
    assert.equal(JSON.stringify(prof()), before);
  });
}

t("W5 machtiging betaald maar salon is al actief: niets aanmaken, seintje", async () => {
  seedProfile({ subscription_status: "active", mollie_subscription_id: "sub_a", plan_expires_at: inDays(20) });
  mollie.payments.tr_m1 = mandatePayment();
  const r = await hook("tr_m1");
  assert.equal(r.status, 200);
  assert.equal(mcalls("POST", /\/subscriptions$/).length, 0);
  assert.equal(calls.resend.length, 1);
  assert.ok(calls.resend[0].subject.startsWith("Automatisch betalen zonder proef"));
  assert.equal(prof().mollie_subscription_id, "sub_a");
  assert.equal(fnMails("trial_autopay_on").length, 0);
});

t("W6 abonnement aanmaken mislukt: 500 + één melding; herhaling lukt zonder tweede melding", async () => {
  seedProfile();
  mollie.payments.tr_m1 = mandatePayment();
  let fail = true;
  mollie.override = (m, p) => (m === "POST" && /\/subscriptions$/.test(p) && fail ? json(500, { detail: "boom" }) : undefined);
  const r1 = await hook("tr_m1");
  assert.equal(r1.status, 500);
  assert.equal(calls.resend.length, 1);
  assert.ok(calls.resend[0].subject.startsWith("Automatisch betalen: abonnement niet aangemaakt"));
  assert.equal(prof().mollie_subscription_id, null);
  assert.equal(fnMails("trial_autopay_on").length, 0);
  fail = false;
  const r2 = await hook("tr_m1");
  assert.equal(r2.status, 200, r2.text);
  assert.equal(calls.resend.length, 1, "geen tweede melding");
  assert.ok(prof().mollie_subscription_id);
  assert.equal(fnMails("trial_autopay_on").length, 1);
});

t("W7 profiel professional: abonnement 35,00", async () => {
  seedProfile({ plan: "professional" });
  mollie.payments.tr_m1 = mandatePayment();
  await hook("tr_m1");
  const posts = mcalls("POST", /\/subscriptions$/);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.amount.value, "35.00");
  assert.equal(posts[0].body.description, "Vellu Professional (monthly)");
  assert.equal(fnMails("trial_autopay_on")[0].body.booking.first_charge_amount, 35);
});

t("W7b machtiging zonder geldige machtiging: niets aanmaken, één seintje", async () => {
  seedProfile();
  mollie.payments.tr_m1 = mandatePayment();
  mollie.override = (m, p) => (m === "GET" && /\/mandates\//.test(p) ? json(200, { status: "invalid" }) : undefined);
  const r = await hook("tr_m1");
  assert.equal(r.status, 200);
  assert.equal(mcalls("POST", /\/subscriptions$/).length, 0);
  assert.equal(calls.resend.length, 1);
  assert.ok(calls.resend[0].subject.startsWith("Geen machtiging bij automatisch betalen"));
  assert.equal(prof().mollie_subscription_id, null);
});

function recurring(over = {}) {
  return {
    id: "tr_r1", status: "paid", amount: { value: "19.00", currency: "EUR" }, sequenceType: "recurring",
    subscriptionId: "sub_t", customerId: "cst_1", mandateId: "mdt_1", description: "Vellu Starter (monthly)",
    createdAt: iso(Date.now() - 3 * 3600000),
    metadata: { owner_id: OWNER(), plan: "starter", billing_interval: "monthly", kind: "trial_autopay" },
    ...over,
  };
}

t("W8 eerste afschrijving na de proef betaald: actief, factuur, referral-tegoed", async () => {
  const end = iso(Date.now() - 2 * 3600000);
  seedProfile({ trial_ends_at: end, plan_expires_at: end, mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.payments.tr_r1 = recurring();
  const r = await hook("tr_r1");
  assert.equal(r.status, 200, r.text);
  const p = prof();
  assert.equal(p.subscription_status, "active");
  assert.equal(p.current_period_start, end);
  assert.equal(p.plan_expires_at, addMonth(end).toISOString());
  assert.equal(p.mollie_subscription_id, "sub_t");
  assert.equal(db().tables.payment_invoices.length, 1);
  assert.equal(fnMails("subscription_invoice").length, 1);
  assert.equal(rpc("grant_referral_credit").length, 1);
  const ev = db().tables.payment_events.find((e) => e.mollie_payment_id === "tr_r1" && e.event_type === "recurring.paid");
  assert.equal(ev.outcome.from_trial, true);
});

t("W9 idem met 14 dagen tegoed: tegoed verzilverd, abonnement herpland", async () => {
  const end = iso(Date.now() - 2 * 3600000);
  seedProfile({ trial_ends_at: end, plan_expires_at: end, mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1", referral_credit_days: 14 });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.payments.tr_r1 = recurring();
  const r = await hook("tr_r1");
  assert.equal(r.status, 200, r.text);
  const extraEnd = addMonth(end); extraEnd.setDate(extraEnd.getDate() + 14);
  const p = prof();
  assert.equal(p.plan_expires_at, extraEnd.toISOString());
  assert.equal(p.referral_credit_days, 0);
  assert.equal(p.referral_credit_days_redeemed, 14);
  assert.equal(mcalls("DELETE", /\/subscriptions\/sub_t$/).length, 1);
  const posts = mcalls("POST", /\/subscriptions$/);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.startDate, extraEnd.toISOString().slice(0, 10));
  assert.equal(p.mollie_subscription_id, posts.length ? Object.keys(mollie.subs).find((k) => k.startsWith("sub_new")) : null);
  assert.equal(rpc("grant_referral_credit").length, 1);
});

t("W10 eerste afschrijving na de proef mislukt: past_due, abonnement weg, mail after_trial", async () => {
  const end = iso(Date.now() - 2 * 3600000);
  seedProfile({ trial_ends_at: end, plan_expires_at: end, mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.payments.tr_r1 = recurring({ status: "failed", details: { failureReason: "insufficient_funds" } });
  const r = await hook("tr_r1");
  assert.equal(r.status, 200, r.text);
  const p = prof();
  assert.equal(p.subscription_status, "past_due");
  assert.equal(p.mollie_subscription_id, null);
  assert.equal(p.plan_expires_at, end);
  assert.equal(mcalls("DELETE", /\/subscriptions\/sub_t$/).length, 1);
  const pf = fnMails("payment_failed");
  assert.equal(pf.length, 1);
  assert.equal(pf[0].body.booking.after_trial, true);
  assert.equal(pf[0].body.booking.reason_code, "insufficient_funds");
  assert.equal(rpc("grant_referral_credit").length, 0);
  const again = await hook("tr_r1");
  assert.equal(again.text, "ok (duplicate)");
  assert.equal(fnMails("payment_failed").length, 1);
});

t("W10b mislukte eerste afschrijving: herhaling na een storing maakt het af zonder 'ander abonnement'", async () => {
  const end = iso(Date.now() - 2 * 3600000);
  seedProfile({ trial_ends_at: end, plan_expires_at: end, mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.payments.tr_r1 = recurring({ status: "failed" });
  // Eerste poging: het stoppen bij Mollie geeft een fout en ook de status is niet op te halen.
  mollie.override = (m, p) => (/\/subscriptions\/sub_t$/.test(p) ? json(500, { detail: "down" }) : undefined);
  const r1 = await hook("tr_r1");
  assert.equal(r1.status, 200);
  assert.equal(prof().subscription_status, "past_due");
  assert.equal(calls.resend.filter((m) => m.subject.startsWith("Oud Mollie-abonnement niet gestopt")).length, 1);
  assert.equal(fnMails("payment_failed").length, 1);
  assert.ok(!calls.resend.some((m) => m.subject.startsWith("Betaling van een ander abonnement")));
});

t("W12 herhaling van de machtiging na uitzetten: oud abonnement komt niet terug", async () => {
  seedProfile();
  mollie.payments.tr_m1 = mandatePayment();
  await hook("tr_m1");
  const subId = prof().mollie_subscription_id;
  // De vorige poging viel om vóór het afronden (geen profile_set, niet verwerkt),
  // en de salon zette automatisch betalen daarna uit.
  const ev = db().tables.payment_events.find((e) => e.mollie_payment_id === "tr_m1" && e.event_type === "first.paid");
  ev.processed_at = null; ev.claimed_at = "1970-01-01T00:00:00Z";
  delete ev.outcome.profile_set; delete ev.outcome.mail_sent;
  Object.assign(prof(), { mollie_subscription_id: null, mollie_mandate_id: null });
  mollie.subs[subId].status = "canceled";
  // Daarna zette ze het opnieuw aan: een nieuw, lopend abonnement.
  mollie.subs.sub_new2 = { id: "sub_new2", status: "active", customerId: "cst_1" };
  Object.assign(prof(), { mollie_subscription_id: "sub_new2", mollie_mandate_id: "mdt_2" });
  calls.fns.length = 0;
  const r = await hook("tr_m1");
  assert.equal(r.status, 200, r.text);
  assert.equal(prof().mollie_subscription_id, "sub_new2", "nieuwe stand blijft staan");
  assert.equal(mollie.subs.sub_new2.status, "active", "nieuw abonnement niet gestopt");
  assert.equal(fnMails("trial_autopay_on").length, 0);
});

t("W13 herhaling van een mislukte eerste afschrijving nadat de salon al opnieuw betaalde", async () => {
  const end = iso(Date.now() - 30 * 3600000);
  seedProfile({ trial_ends_at: end, plan_expires_at: end, mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.payments.tr_r1 = recurring({ status: "failed" });
  await hook("tr_r1");
  assert.equal(prof().subscription_status, "past_due");
  // Zij betaalt opnieuw (first.paid): actief met een nieuw abonnement.
  Object.assign(prof(), { subscription_status: "active", mollie_subscription_id: "sub_x", plan_expires_at: inDays(30) });
  // Mollie stuurt de mislukte betaling nog eens (vorige poging niet afgerond).
  const ev = db().tables.payment_events.find((e) => e.mollie_payment_id === "tr_r1" && e.event_type === "recurring.failed");
  ev.processed_at = null; ev.claimed_at = "1970-01-01T00:00:00Z"; delete ev.outcome.past_due_set;
  const r = await hook("tr_r1");
  assert.equal(r.status, 200, r.text);
  assert.equal(prof().subscription_status, "active", "blijft actief");
  assert.equal(prof().mollie_subscription_id, "sub_x", "nieuw abonnement blijft in het profiel");
});

t("W14 eerste afschrijving komt binnen terwijl de salon niet meer op trialing staat: toch referral-tegoed", async () => {
  const end = iso(Date.now() - 9 * DAY);
  seedProfile({ subscription_status: "past_due", trial_ends_at: end, plan_expires_at: end, mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.payments.tr_r1 = recurring();
  const r = await hook("tr_r1");
  assert.equal(r.status, 200, r.text);
  assert.equal(prof().subscription_status, "active");
  assert.equal(rpc("grant_referral_credit").length, 1);
});

t("W11a regressie: gewone first.paid (past_due) maakt factuur en geeft tegoed", async () => {
  seedProfile({ subscription_status: "past_due", plan_expires_at: iso(Date.now() - 5 * DAY), trial_ends_at: iso(Date.now() - 5 * DAY) });
  mollie.payments.tr_f1 = {
    id: "tr_f1", status: "paid", amount: { value: "19.00", currency: "EUR" }, sequenceType: "first",
    customerId: "cst_1", mandateId: "mdt_2", description: "Vellu Starter (monthly) — first payment", createdAt: inDays(0),
    metadata: { owner_id: OWNER(), plan: "starter", billing_interval: "monthly", kind: "subscription_first_payment" },
  };
  const r = await hook("tr_f1");
  assert.equal(r.status, 200, r.text);
  assert.equal(prof().subscription_status, "active");
  assert.equal(db().tables.payment_invoices.length, 1);
  assert.equal(rpc("grant_referral_credit").length, 1);
  assert.equal(fnMails("subscription_invoice").length, 1);
  assert.equal(fnMails("trial_autopay_on").length, 0);
});

t("W11b regressie: recurring.paid van een actieve salon geeft GEEN tegoed", async () => {
  const exp = iso(Date.now() - 3600000);
  seedProfile({ subscription_status: "active", plan_expires_at: exp, mollie_subscription_id: "sub_a", mollie_mandate_id: "mdt_1" });
  mollie.payments.tr_r2 = recurring({ id: "tr_r2", subscriptionId: "sub_a", metadata: { owner_id: OWNER(), plan: "starter", billing_interval: "monthly" } });
  const r = await hook("tr_r2");
  assert.equal(r.status, 200, r.text);
  assert.equal(prof().plan_expires_at, addMonth(exp).toISOString());
  assert.equal(rpc("grant_referral_credit").length, 0);
  assert.equal(db().tables.payment_invoices.length, 1);
});

t("W11c regressie: mislukte verlenging van een actieve salon zet alleen past_due", async () => {
  seedProfile({ subscription_status: "active", plan_expires_at: inDays(1), mollie_subscription_id: "sub_a", mollie_mandate_id: "mdt_1" });
  mollie.payments.tr_r3 = recurring({ id: "tr_r3", status: "failed", subscriptionId: "sub_a" });
  const r = await hook("tr_r3");
  assert.equal(r.status, 200);
  assert.equal(prof().subscription_status, "past_due");
  assert.equal(prof().mollie_subscription_id, "sub_a");
  assert.equal(mcalls("DELETE", /subscriptions/).length, 0);
  const pf = fnMails("payment_failed");
  assert.equal(pf.length, 1);
  assert.equal(pf[0].body.booking.after_trial, undefined);
});

// create-subscription ────────────────────────────────────────────────────
t("C1 proef loopt: gewoon abonneren geeft 409 trial_use_autopay (maand en jaar)", async () => {
  seedProfile();
  for (const bi of ["monthly", "yearly"]) {
    const r = await api(H.create, "create-subscription", { plan: "starter", billing_interval: bi });
    assert.equal(r.status, 409); assert.equal(r.body.error, "trial_use_autopay");
  }
  assert.equal(calls.mollie.length, 0);
});

t("C2 trial_autopay creditcard: 0,00, first, creditcard, juiste redirect + audit", async () => {
  const p0 = seedProfile({ mollie_customer_id: null });
  const r = await api(H.create, "create-subscription", { action: "trial_autopay", method: "creditcard" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(mcalls("POST", /^\/customers$/).length, 1);
  const pay = mcalls("POST", /^\/payments$/);
  assert.equal(pay.length, 1);
  const b = pay[0].body;
  assert.equal(b.amount.value, "0.00");
  assert.equal(b.method, "creditcard");
  assert.equal(b.sequenceType, "first");
  assert.equal(b.customerId, "cst_new");
  assert.equal(b.metadata.kind, "trial_autopay_mandate");
  assert.equal(b.metadata.plan, "starter");
  assert.ok(b.redirectUrl.endsWith("/owner?tab=billing&autopay=return"), b.redirectUrl);
  assert.equal(b.description, "Vellu Starter: automatisch betalen na proef");
  const ev = db().tables.payment_events.filter((e) => e.event_type === "first_payment.created");
  assert.equal(ev.length, 1); assert.equal(ev[0].amount_eur, 0);
  assert.equal(prof().mollie_customer_id, "cst_new");
  assert.deepEqual(
    { success: r.body.success, method: r.body.method, amount_now: r.body.amount_now, plan: r.body.plan, first_charge_date: r.body.first_charge_date, first_charge_amount: r.body.first_charge_amount },
    { success: true, method: "creditcard", amount_now: 0, plan: "starter", first_charge_date: chargeYmd(p0.trial_ends_at), first_charge_amount: 19 },
  );
  assert.ok(r.body.checkout_url && r.body.payment_id);
});

t("C3 trial_autopay iDEAL: 0,01 en Engelse omschrijving buiten NL-landen", async () => {
  seedProfile({ country_code: "GB", plan: "professional" });
  const r = await api(H.create, "create-subscription", { action: "trial_autopay", method: "ideal" });
  assert.equal(r.status, 200);
  const b = mcalls("POST", /^\/payments$/)[0].body;
  assert.equal(b.amount.value, "0.01");
  assert.equal(b.method, "ideal");
  assert.equal(b.metadata.plan, "professional");
  assert.equal(b.description, "Vellu Professional: automatic payment after trial");
  assert.equal(r.body.amount_now, 0.01);
  assert.equal(r.body.first_charge_amount, 35);
});

t("C4 weigeringen: al aan / niet in proef / proef voorbij / foute methode", async () => {
  seedProfile({ mollie_subscription_id: "sub_x" });
  let r = await api(H.create, "create-subscription", { action: "trial_autopay", method: "creditcard" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "autopay_already_on");
  Object.assign(prof(), { mollie_subscription_id: null, subscription_status: "active" });
  r = await api(H.create, "create-subscription", { action: "trial_autopay", method: "creditcard" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "not_trialing");
  Object.assign(prof(), { subscription_status: "trialing", trial_ends_at: inDays(-0.1) });
  r = await api(H.create, "create-subscription", { action: "trial_autopay", method: "creditcard" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "trial_ended");
  r = await api(H.create, "create-subscription", { action: "trial_autopay", method: "paypal" });
  assert.equal(r.status, 400); assert.equal(r.body.error, "invalid_method");
  assert.equal(calls.mollie.length, 0);
});

t("C5 regressie: past_due {plan} maakt nog steeds een volledige eerste betaling", async () => {
  seedProfile({ subscription_status: "past_due", trial_ends_at: inDays(-3), plan_expires_at: inDays(-3) });
  const r = await api(H.create, "create-subscription", { plan: "starter", billing_interval: "monthly" });
  assert.equal(r.status, 200);
  const b = mcalls("POST", /^\/payments$/)[0].body;
  assert.equal(b.amount.value, "19.00");
  assert.equal(b.sequenceType, "first");
  assert.deepEqual(b.method, ["ideal", "creditcard"]);
  assert.equal(b.metadata.kind, "subscription_first_payment");
  assert.ok(b.redirectUrl.endsWith("/owner?subscription=success"));
});

t("C6 proef voorbij: zonder abonnement mag betalen, met lopend automatisch betalen 409", async () => {
  seedProfile({ trial_ends_at: inDays(-0.5) });
  let r = await api(H.create, "create-subscription", { plan: "starter", billing_interval: "monthly" });
  assert.equal(r.status, 200);
  Object.assign(prof(), { mollie_subscription_id: "sub_t" });
  r = await api(H.create, "create-subscription", { plan: "starter", billing_interval: "monthly" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "autopay_charging");
});

// cancel-subscription ────────────────────────────────────────────────────
t("X1 uitzetten in P1: abonnement en machtiging weg, proef blijft", async () => {
  const p0 = seedProfile({ mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  const r = await api(H.cancel, "cancel-subscription", { action: "trial_autopay_off" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { success: true, mode: "trial_autopay_off", trial_ends_at: p0.trial_ends_at });
  assert.equal(mcalls("DELETE", /\/subscriptions\/sub_t$/).length, 1);
  assert.equal(mcalls("DELETE", /\/mandates\/mdt_1$/).length, 1);
  const p = prof();
  assert.equal(p.mollie_subscription_id, null);
  assert.equal(p.mollie_mandate_id, null);
  assert.equal(p.subscription_status, "trialing");
  assert.equal(p.trial_ends_at, p0.trial_ends_at);
  assert.equal(p.plan_expires_at, p0.plan_expires_at);
  assert.equal(p.cancel_at_period_end, false);
});

t("X2 dag van de afschrijving: 409 first_charge_started, geen Mollie", async () => {
  // 36 uur na het einde is de eerste Amsterdamse dag na het einde altijd begonnen.
  seedProfile({ trial_ends_at: inDays(-1.5), mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  const r = await api(H.cancel, "cancel-subscription", { action: "trial_autopay_off" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "first_charge_started");
  assert.equal(calls.mollie.length, 0);
  assert.equal(prof().mollie_subscription_id, "sub_t");
});

t("X2b proef net voorbij, afschrijvingsdag nog niet begonnen: uitzetten mag nog", async () => {
  const end = iso(Date.now() - 60000);
  seedProfile({ trial_ends_at: end, mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  const r = await api(H.cancel, "cancel-subscription", { action: "trial_autopay_off" });
  // Valt de test toevallig in de minuut na Amsterdamse middernacht, dan is de dag wel bereikt.
  if (autopayChargeDayReached(end)) { assert.equal(r.status, 409); return; }
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(prof().mollie_subscription_id, null);
});

t("X5 abonnement zonder Mollie-klant: 502 en profiel blijft staan", async () => {
  seedProfile({ mollie_customer_id: null, mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  const r = await api(H.cancel, "cancel-subscription", { action: "trial_autopay_off" });
  assert.equal(r.status, 502); assert.equal(r.body.error, "mollie_cancel_failed");
  assert.equal(prof().mollie_subscription_id, "sub_t", "niet leegmaken: het abonnement loopt nog");
  assert.equal(calls.mollie.length, 0);
});

t("X6 tweede checkout schrijft tussendoor een nieuw abonnement: ook dat wordt gestopt", async () => {
  seedProfile({ mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.subs.sub_t2 = { id: "sub_t2", status: "active", customerId: "cst_1" };
  // Zodra sub_t gestopt is, zet "de webhook van het andere tabblad" sub_t2 in het profiel.
  let swapped = false;
  mollie.override = (m, p) => {
    if (m === "DELETE" && /\/subscriptions\/sub_t$/.test(p) && !swapped) {
      swapped = true;
      mollie.subs.sub_t.status = "canceled";
      Object.assign(prof(), { mollie_subscription_id: "sub_t2", mollie_mandate_id: "mdt_2" });
      return json(200, mollie.subs.sub_t);
    }
    return undefined;
  };
  const r = await api(H.cancel, "cancel-subscription", { action: "trial_autopay_off" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(prof().mollie_subscription_id, null);
  assert.equal(mollie.subs.sub_t2.status, "canceled");
  assert.equal(mcalls("DELETE", /\/mandates\/mdt_2$/).length, 1);
});

t("X3 action zonder automatisch betalen: 409 autopay_not_on", async () => {
  seedProfile();
  const r = await api(H.cancel, "cancel-subscription", { action: "trial_autopay_off" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "autopay_not_on");
  assert.equal(calls.mollie.length, 0);
  assert.equal(prof().cancelled_at, null);
});

t("X4 regressie: actieve salon zegt op aan het einde van de periode", async () => {
  const exp = inDays(20);
  seedProfile({ subscription_status: "active", plan_expires_at: exp, mollie_subscription_id: "sub_a", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_a = { id: "sub_a", status: "active", customerId: "cst_1" };
  const r = await api(H.cancel, "cancel-subscription", {});
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, "at_period_end");
  assert.equal(r.body.access_until, exp);
  const p = prof();
  assert.equal(p.cancel_at_period_end, true);
  assert.equal(p.mollie_subscription_id, null);
  assert.equal(p.subscription_status, "active");
  assert.equal(p.mollie_mandate_id, "mdt_1");
  assert.equal(mcalls("DELETE", /\/mandates\//).length, 0);
});

// change-plan ────────────────────────────────────────────────────────────
t("P1 proef met automatisch betalen: Starter naar Professional via PATCH", async () => {
  const p0 = seedProfile({ mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  const r = await api(H.change, "change-plan", { plan: "professional", billing_interval: "monthly" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { success: true, trial_autopay: true, plan: "professional", billing_interval: "monthly", next_charge_on: chargeYmd(p0.trial_ends_at), next_charge_amount: 35, prorated_charge: 0 });
  const patch = mcalls("PATCH", /\/customers\/cst_1\/subscriptions\/sub_t$/);
  assert.equal(patch.length, 1);
  assert.equal(patch[0].body.amount.value, "35.00");
  assert.equal(patch[0].body.description, "Vellu Professional (monthly)");
  assert.equal(patch[0].body.metadata.plan, "professional");
  assert.equal(patch[0].body.metadata.kind, "trial_autopay");
  assert.equal(mcalls("POST", /./).length, 0);
  assert.equal(mcalls("DELETE", /./).length, 0);
  const p = prof();
  assert.equal(p.plan, "professional");
  assert.equal(p.subscription_status, "trialing");
  assert.equal(p.mollie_subscription_id, "sub_t");
  assert.equal(p.plan_expires_at, p0.plan_expires_at);
  assert.equal(p.plan_change_started_at, null, "slot vrijgegeven");
  const ev = db().tables.payment_events.find((e) => e.event_type === "subscription.changed");
  assert.equal(ev.raw_payload.trial_autopay, true);
});

t("P2 proef met automatisch betalen: jaarlijks 409, dag van afschrijving 409", async () => {
  seedProfile({ mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  let r = await api(H.change, "change-plan", { plan: "professional", billing_interval: "yearly" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "trial_autopay_monthly_only");
  Object.assign(prof(), { trial_ends_at: inDays(-1.5) });
  r = await api(H.change, "change-plan", { plan: "professional", billing_interval: "monthly" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "first_charge_started");
  r = await api(H.change, "change-plan", { plan: "starter", billing_interval: "monthly" });
  assert.equal(r.status, 400); assert.equal(r.body.error, "no_change");
  assert.equal(calls.mollie.length, 0);
  assert.equal(prof().plan, "starter");
  assert.equal(prof().plan_change_started_at, null);
});

t("P2b Mollie PATCH mislukt: 502, profiel ongewijzigd", async () => {
  seedProfile({ mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.override = (m) => (m === "PATCH" ? json(500, {}) : undefined);
  const r = await api(H.change, "change-plan", { plan: "professional", billing_interval: "monthly" });
  assert.equal(r.status, 502); assert.equal(r.body.error, "mollie_update_failed");
  assert.equal(prof().plan, "starter");
});

t("P2c proef zonder automatisch betalen: nog steeds 409 not_active", async () => {
  seedProfile();
  const r = await api(H.change, "change-plan", { plan: "professional", billing_interval: "monthly" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "not_active");
});

t("P3 regressie: actieve salon upgrade met nieuw abonnement en pro rata", async () => {
  seedProfile({ subscription_status: "active", plan_expires_at: inDays(20), current_period_start: inDays(-10), mollie_subscription_id: "sub_a", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_a = { id: "sub_a", status: "active", customerId: "cst_1" };
  const r = await api(H.change, "change-plan", { plan: "professional", billing_interval: "monthly" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.new_subscription_id);
  assert.ok(r.body.prorated_charge > 0);
  assert.equal(r.body.trial_autopay, undefined);
  assert.equal(mcalls("DELETE", /\/subscriptions\/sub_a$/).length, 1);
  assert.equal(mcalls("POST", /\/subscriptions$/)[0].body.amount.value, "35.00");
  const pr = mcalls("POST", /^\/payments$/);
  assert.equal(pr.length, 1); assert.equal(pr[0].body.metadata.kind, "upgrade_proration");
  assert.equal(prof().plan, "professional");
  assert.equal(prof().mollie_subscription_id, r.body.new_subscription_id);
});

// send-renewal-reminder ──────────────────────────────────────────────────
function seedReminderSalons() {
  const base = { id: OWNER() };
  db().tables.profiles.length = 0;
  const mk = (id, over) => {
    const p = { ...base, id, business_name: `Salon ${id}`, email: `${id}@example.test`, country_code: "BQ", plan: "starter", billing_interval: "monthly", subscription_status: "trialing", mollie_subscription_id: null, cancel_at_period_end: false, referral_credit_days: 0, ...over };
    p.plan_expires_at = p.trial_ends_at;
    db().tables.profiles.push(p);
    return p;
  };
  return {
    A: mk("aaaaaaaa", { trial_ends_at: inDays(2), mollie_subscription_id: "sub_A", referral_credit_days: 14 }),
    B: mk("bbbbbbbb", { trial_ends_at: inDays(2) }),
    // Proef eindigde gisteren (Amsterdam) om 12:00 UTC: vandaag is de eerste dag
    // die na het einde begint, dus de afschrijvingsdag.
    C: mk("cccccccc", { trial_ends_at: `${ams(Date.now() - DAY)}T12:00:00.000Z`, mollie_subscription_id: "sub_C", plan: "professional", country_code: "GB" }),
    D: mk("dddddddd", { trial_ends_at: inDays(-3), mollie_subscription_id: "sub_D" }),
  };
}

t("R1-R4 herinneringen: autopay-salons apart, zonder autopay ongewijzigd", async () => {
  const S = seedReminderSalons();
  const r = await remind();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const byOwner = (type, id) => fnMails(type).filter((m) => m.body.booking.owner_id === id);
  // R1
  const e = byOwner("trial_autopay_ending", S.A.id);
  assert.equal(e.length, 1);
  assert.equal(e[0].body.booking.first_charge_date, chargeYmd(S.A.trial_ends_at));
  assert.equal(e[0].body.booking.autopay_off_deadline, autopayOffDeadline(S.A.trial_ends_at).toISOString());
  assert.equal(e[0].body.booking.first_charge_amount, 19);
  assert.equal(e[0].body.booking.credit_days, 14);
  assert.ok(e[0].body.booking.days_left >= 1 && e[0].body.booking.days_left <= 3);
  assert.equal(byOwner("trial_ending", S.A.id).length, 0);
  const pA = pushes().filter((p) => p.body.tag === `trial-autopay-ending-${S.A.id}`);
  function pA0() { return pA[0]?.body?.body || ""; }
  assert.equal(pA.length, 1);
  assert.ok(pA[0].body.body.includes("€19,00"), pA[0].body.body);
  assert.equal(pA[0].body.url, "/owner?tab=billing");
  assert.equal(pA[0].body.title, "Je proefperiode eindigt bijna");
  // Bonaire: het uitzetmoment (Amsterdamse middernacht) is daar 18:00 of 19:00.
  assert.ok(/Uitzetten kan vóór \d+ \w+ (18|19):00, bij Abonnement\./.test(pA0()), pA0());
  // R2
  assert.equal(byOwner("trial_ending", S.B.id).length, 1);
  assert.equal(byOwner("trial_autopay_ending", S.B.id).length, 0);
  // R3
  const td = byOwner("trial_autopay_today", S.C.id);
  assert.equal(td.length, 1);
  assert.equal(td[0].body.booking.first_charge_amount, 35);
  assert.equal(td[0].body.booking.owner_lang, "en");
  assert.equal(byOwner("trial_autopay_ending", S.C.id).length, 0);
  const pC = pushes().filter((p) => p.body.tag === `trial-autopay-today-${S.C.id}`);
  assert.equal(pC.length, 1);
  assert.equal(pC[0].body.body, "Today we charge €35,00. Your dashboard stays open.");
  // R4
  assert.equal(byOwner("trial_expired", S.D.id).length, 0);
  assert.equal(byOwner("trial_autopay_today", S.D.id).length, 0);
  assert.ok(!calls.resend.some((m) => String(m.subject).startsWith("Proef afgelopen")));
  for (const p of pushes()) assert.ok(!BAD_UNICODE.test(p.body.title + p.body.body));
  // R5
  const before = calls.fns.length;
  await remind();
  assert.equal(calls.fns.length, before, "tweede run stuurt niets opnieuw");
});

// send-emails ────────────────────────────────────────────────────────────
const bookingBase = () => ({ owner_email: "salon@example.test", owner_id: OWNER(), owner_lang: "nl", country_code: "NL", business_name: "Testsalon", salon_name: "Testsalon", plan: "starter", trial_ends_at: "2026-10-23T19:55:00.000Z", first_charge_date: "2026-10-24", first_charge_amount: 19, autopay_off_deadline: "2026-10-23T22:00:00.000Z", credit_days: 0 });
function checkMail(m) {
  assert.equal(m.from, "Vellu <noreply@vellu.cc>");
  assert.equal(m.reply_to, "mirahventures@vellu.cc");
  assert.ok(!BAD_UNICODE.test(m.subject + m.html + m.text), "verboden teken in mail");
  assert.ok(!/€\s?\d+\.\d{2}\b/.test(m.html), "bedrag met punt als decimaalteken");
}

t("E1 trial_autopay_on creditcard (NL) en iDEAL (EN)", async () => {
  let r = await email("trial_autopay_on", { ...bookingBase(), amount_now: 0, credit_days: 14 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let m = calls.resend[0];
  checkMail(m);
  assert.equal(m.subject, "Automatisch betalen staat aan");
  assert.ok(m.html.includes("Er is nu niets afgeschreven."));
  assert.ok(m.html.includes("€19,00"));
  assert.ok(m.html.includes("Vrijdag 23 oktober 2026"));
  assert.ok(m.html.includes("Je tegoed van 14 dagen"));
  assert.ok(m.html.includes("https://vellu.cc/owner?tab=billing"));
  assert.ok(m.html.includes("Op <strong>Zaterdag 24 oktober 2026</strong> schrijven we"));
  // Nederland: het uitzetmoment is middernacht, dus gewoon "vóór <datum>".
  assert.ok(m.html.includes("Zet automatisch betalen uit vóór Zaterdag 24 oktober 2026 onder"), m.html);
  r = await email("trial_autopay_on", { ...bookingBase(), owner_lang: "en", amount_now: 0.01 });
  m = calls.resend[1];
  checkMail(m);
  assert.equal(m.subject, "Automatic payment is on");
  assert.ok(m.html.includes("Only €0,01 was charged"));
  assert.ok(!m.html.includes("Your credit of"));
  // Bonaire: zelfde moment is daar 18:00 de avond ervoor.
  await email("trial_autopay_on", { ...bookingBase(), country_code: "BQ", amount_now: 0 });
  m = calls.resend[2];
  checkMail(m);
  assert.ok(m.html.includes("vóór Vrijdag 23 oktober 2026 om 18:00"), m.html);
  // Pas aangezet toen de afschrijvingsdag al begonnen was: geen uitzetbelofte.
  await email("trial_autopay_on", { ...bookingBase(), autopay_off_deadline: iso(Date.now() - 3600000), amount_now: 0 });
  m = calls.resend[3];
  checkMail(m);
  assert.ok(m.html.includes("kan automatisch betalen niet meer uit"));
  assert.ok(!m.html.includes("Bedenk je je?"));
});

t("E2 trial_autopay_ending (morgen en over 3 dagen, ES) en trial_autopay_today", async () => {
  await email("trial_autopay_ending", { ...bookingBase(), days_left: 1 });
  let m = calls.resend[0];
  checkMail(m);
  assert.equal(m.subject, "Je proefperiode eindigt morgen: automatisch betalen staat aan");
  assert.ok(m.html.includes("Automatisch betalen beheren"));
  assert.ok(m.html.includes("Zet automatisch betalen uit vóór Zaterdag 24 oktober 2026."));
  await email("trial_autopay_ending", { ...bookingBase(), owner_lang: "es", days_left: 3, first_charge_amount: 35, plan: "professional" });
  m = calls.resend[1];
  checkMail(m);
  assert.equal(m.subject, "Tu prueba termina en 3 días: el pago automático está activado");
  assert.ok(m.html.includes("€35,00"));
  await email("trial_autopay_today", { ...bookingBase(), days_left: 0 });
  m = calls.resend[2];
  checkMail(m);
  assert.equal(m.subject, "Je Vellu-abonnement gaat vandaag in");
  assert.ok(m.html.includes("Vandaag schrijven we <strong>€19,00</strong> af"));
  await email("trial_autopay_ending", { ...bookingBase(), days_left: 0 });
  m = calls.resend[3];
  assert.equal(m.subject, "Je proefperiode eindigt vandaag: automatisch betalen staat aan");
});

t("E5 trial_ending (zonder automatisch betalen): geen 'kies vóór die tijd een plan' meer", async () => {
  await email("trial_ending", { ...bookingBase(), days_left: 3 });
  const m = calls.resend[0];
  checkMail(m);
  assert.ok(!m.html.includes("Kies vóór die tijd een plan"));
  assert.ok(m.html.includes("Zet dan automatisch betalen aan"));
  assert.ok(m.html.includes("Bekijk opties"));
  assert.ok(m.html.includes("https://vellu.cc/owner?tab=billing"));
});

t("E3 payment_failed met after_trial, en zonder (ongewijzigd)", async () => {
  const b = { ...bookingBase(), billing_interval: "monthly", amount: 19, reason_code: "insufficient_funds", reason_message: "" };
  await email("payment_failed", { ...b, after_trial: true });
  let m = calls.resend[0];
  checkMail(m);
  assert.ok(m.subject.startsWith("Je betaling is niet gelukt"));
  assert.ok(m.html.includes("De eerste afschrijving na je proef is niet gelukt"));
  assert.ok(m.html.includes("Automatisch betalen staat daarom uit."));
  assert.ok(m.html.includes("Plan kiezen"));
  assert.ok(m.html.includes("Er is niets van je rekening afgeschreven."));
  // Proef (op papier) nog niet voorbij: geen tegenstrijdige "je kunt Vellu gewoon blijven gebruiken".
  assert.ok(!m.html.includes("Je proefperiode loopt nog tot"));
  assert.ok(m.html.includes("Je dashboard blijft open tot het einde van je proef"));
  await email("payment_failed", b);
  m = calls.resend[1];
  assert.ok(m.html.includes("De betaling is niet gelukt"));
  assert.ok(m.html.includes("Opnieuw proberen"));
  assert.ok(!m.html.includes("Automatisch betalen staat daarom uit."));
});

t("E4 nieuwe types zijn niet vanuit de browser te versturen", async () => {
  // Met een gebruikerslogin (geen x-internal-secret) controleert send-emails het
  // token via fetch naar auth/v1/user; dat onderscheppen we hier niet, dus
  // alleen de lijst zelf controleren in de bron.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(path.join(ROOT, "supabase/functions/send-emails/index.ts"), "utf8");
  const browser = /const BROWSER_TYPES=\[([^\]]*)\]/.exec(src)[1];
  for (const ty of ["trial_autopay_on", "trial_autopay_ending", "trial_autopay_today"]) assert.ok(!browser.includes(ty));
  const platform = /const PLATFORM_TYPES=\[([^\]]*)\]/.exec(src)[1];
  for (const ty of ["trial_autopay_on", "trial_autopay_ending", "trial_autopay_today"]) assert.ok(platform.includes(`"${ty}"`));
});

// api/check-trials.js ────────────────────────────────────────────────────
t("K1 check-trials: proef met automatisch betalen nooit blind op past_due", async () => {
  db().tables.profiles.length = 0;
  const mk = (id, over) => db().tables.profiles.push({ id, subscription_status: "trialing", mollie_subscription_id: null, cancel_at_period_end: false, ...over });
  mk("e", { trial_ends_at: inDays(-2), mollie_subscription_id: "sub_e" });
  mk("f", { trial_ends_at: inDays(-9), mollie_subscription_id: "sub_f" });
  mk("g", { trial_ends_at: iso(Date.now() - 3600000) });
  mk("h", { trial_ends_at: inDays(3) });
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await H.checkTrials({ headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const st = (id) => db().tables.profiles.find((p) => p.id === id).subscription_status;
  assert.equal(st("e"), "trialing");
  assert.equal(st("f"), "trialing", "dat doet check-pending-payments, mét Mollie");
  assert.equal(st("g"), "past_due");
  assert.equal(st("h"), "trialing");
  assert.equal(res.body.trials_expired, 1);
});

// check-pending-payments: tweede ronde (automatisch betalen) ─────────────
async function pendingRun() {
  const res = await H.pending(new Request(`${ENV.SUPABASE_URL}/functions/v1/check-pending-payments`, { method: "POST" }));
  return { status: res.status, body: await res.json() };
}
t("CP1 eerste afschrijving zonder verwerkte uitkomst: webhook opnieuw aangetrapt", async () => {
  seedProfile({ trial_ends_at: inDays(-3), mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.payments.tr_r1 = recurring({ status: "paid" });
  const r = await pendingRun();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const hooks = calls.fns.filter((c) => c.fn === "mollie-webhook");
  assert.equal(hooks.length, 1); assert.equal(hooks[0].body.id, "tr_r1");
  assert.equal(prof().subscription_status, "trialing", "zelf niets omzetten; dat doet de webhook");
});
t("CP2 SEPA loopt nog: niets doen", async () => {
  seedProfile({ trial_ends_at: inDays(-4), mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1" };
  mollie.payments.tr_r1 = recurring({ status: "pending" });
  const r = await pendingRun();
  assert.equal(r.body.automatisch_betalen.loopt_nog, 1);
  assert.equal(calls.fns.filter((c) => c.fn === "mollie-webhook").length, 0);
  assert.equal(prof().subscription_status, "trialing");
  assert.equal(prof().mollie_subscription_id, "sub_t");
});
t("CP3 abonnement schreef nooit af: gestopt, past_due zonder abonnement, seintje", async () => {
  seedProfile({ trial_ends_at: inDays(-3), mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1", nextPaymentDate: ams(Date.now() - 2 * DAY) };
  const r = await pendingRun();
  assert.equal(r.body.automatisch_betalen.afgesloten, 1);
  assert.equal(mollie.subs.sub_t.status, "canceled");
  assert.equal(prof().subscription_status, "past_due");
  assert.equal(prof().mollie_subscription_id, null);
  assert.equal(calls.resend.filter((m) => m.subject.startsWith("Automatisch betalen schreef niet af")).length, 1);
  // Daarna mag ze gewoon opnieuw betalen (geen autopay_charging meer).
  const c = await api(H.create, "create-subscription", { plan: "starter", billing_interval: "monthly" });
  assert.equal(c.status, 200, JSON.stringify(c.body));
});
t("CP4 abonnement nog gepland voor later, of proef pas net voorbij: niets doen", async () => {
  seedProfile({ trial_ends_at: inDays(-3), mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  mollie.subs.sub_t = { id: "sub_t", status: "active", customerId: "cst_1", nextPaymentDate: ams(Date.now() + DAY) };
  await pendingRun();
  assert.equal(prof().subscription_status, "trialing");
  assert.equal(mollie.subs.sub_t.status, "active");
  db().tables.profiles.length = 0; resetNet();
  seedProfile({ trial_ends_at: inDays(-1), mollie_subscription_id: "sub_t", mollie_mandate_id: "mdt_1" });
  const r = await pendingRun();
  assert.equal(r.body.automatisch_betalen.bekeken, 0);
  assert.equal(calls.mollie.length, 0);
});

// ── Draaien ─────────────────────────────────────────────────────────────
let failed = 0;
const origError = console.error, origLog = console.log, origWarn = console.warn;
for (const { name, fn } of tests) {
  resetDb(); resetNet();
  const logs = [];
  console.error = (...a) => logs.push(a.join(" ")); console.log = (...a) => logs.push(a.join(" ")); console.warn = console.log;
  try {
    await fn();
    console.error = origError; console.log = origLog; console.warn = origWarn;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.error = origError; console.log = origLog; console.warn = origWarn;
    failed++;
    console.log(`FAIL  ${name}\n      ${String(e?.stack || e).split("\n").slice(0, 4).join("\n      ")}`);
    if (logs.length) console.log("      logs: " + logs.slice(-6).join(" | ").slice(0, 1200));
  }
}
console.log(`\n${tests.length - failed}/${tests.length} geslaagd`);
process.exit(failed ? 1 : 0);
