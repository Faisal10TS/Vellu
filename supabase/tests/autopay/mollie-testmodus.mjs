// Proef in Mollie-TESTMODUS: werkt "automatisch betalen na de proef" bij dit
// Mollie-account? Doet precies wat create-subscription (action trial_autopay)
// en mollie-webhook doen, maar met de TESTsleutel en zonder Vellu te raken:
//   1. testklant aanmaken;
//   2. machtigingsbetaling creditcard EUR 0,00 en iDEAL EUR 0,01 (sequenceType first);
//   3. jij rondt ze af op de testpagina van Mollie;
//   4. machtigingen controleren en per machtiging een abonnement met een
//      startdatum over 14 dagen aanmaken (zoals de webhook) en meteen weer stoppen;
//   5. testklant opruimen.
// Geen webhookUrl: de webhook in productie gebruikt de live-sleutel en kent
// deze testbetalingen niet.
//
// Gebruik: node supabase/tests/autopay/mollie-testmodus.mjs
// De sleutel wordt gevraagd (of zet MOLLIE_TEST_KEY). Alleen test_-sleutels.

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const API = "https://api.mollie.com/v2";
const rl = readline.createInterface({ input: stdin, output: stdout });

let key = (process.env.MOLLIE_TEST_KEY || "").trim();
if (!key) key = (await rl.question("Plak je Mollie TEST API-sleutel (begint met test_): ")).trim();
if (!key.startsWith("test_")) {
  console.log("\nDit is geen testsleutel. Gestopt: dit script werkt alleen in testmodus.");
  process.exit(1);
}

async function mollie(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* geen JSON */ }
  return { ok: res.ok, status: res.status, data };
}
const fout = (r) => `${r.status} ${r.data?.title || ""}: ${r.data?.detail || ""}`.trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const uitslag = [];

// 1. Testklant
const cust = await mollie("/customers", { method: "POST", body: JSON.stringify({ name: "Vellu testmodus", email: "test@example.com" }) });
if (!cust.ok) { console.log("\nKlant aanmaken mislukt:", fout(cust)); process.exit(1); }
const customerId = cust.data.id;
console.log(`\nTestklant: ${customerId}`);

// 2. Machtigingsbetalingen, zelfde vorm als create-subscription
const gevallen = [
  { method: "creditcard", value: "0.00", label: "Creditcard EUR 0,00" },
  { method: "ideal", value: "0.01", label: "iDEAL EUR 0,01" },
];
const betalingen = [];
for (const g of gevallen) {
  const r = await mollie("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: { currency: "EUR", value: g.value },
      customerId,
      sequenceType: "first",
      method: g.method,
      description: "Vellu Starter: automatisch betalen na proef (TEST)",
      redirectUrl: "https://vellu.cc/",
      metadata: { kind: "trial_autopay_mandate", method: g.method, test: true },
    }),
  });
  if (!r.ok) {
    console.log(`\n[${g.label}] betaling aanmaken MISLUKT: ${fout(r)}`);
    uitslag.push(`${g.label}: NIET OK, Mollie weigert de betaling (${fout(r)})`);
    continue;
  }
  betalingen.push({ ...g, id: r.data.id, url: r.data._links?.checkout?.href });
}

if (betalingen.length) {
  console.log("\nOpen deze link(s) in je browser en kies op de testpagina van Mollie dat de betaling GESLAAGD is (paid):\n");
  for (const b of betalingen) console.log(`  ${b.label}:\n  ${b.url}\n`);
  console.log("Ik wacht tot ze klaar zijn (maximaal 10 minuten)...");
}

// 3. Wachten tot elke betaling een eindstatus heeft
const EIND = ["paid", "failed", "canceled", "expired"];
const tot = Date.now() + 10 * 60 * 1000;
const status = {};
while (betalingen.some((b) => !EIND.includes(status[b.id])) && Date.now() < tot) {
  for (const b of betalingen) {
    if (EIND.includes(status[b.id])) continue;
    const r = await mollie(`/payments/${b.id}`);
    if (r.ok && r.data.status !== status[b.id]) {
      status[b.id] = r.data.status;
      console.log(`  ${b.label}: ${r.data.status}`);
    }
  }
  await sleep(4000);
}
rl.close();

// 4. Machtigingen en een abonnement zoals de webhook het maakt
const start = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const mandaten = await mollie(`/customers/${customerId}/mandates`);
const lijst = mandaten.ok ? (mandaten.data?._embedded?.mandates || []) : [];
for (const b of betalingen) {
  if (status[b.id] !== "paid") {
    uitslag.push(`${b.label}: NIET AFGEROND (status ${status[b.id] || "open"}), opnieuw draaien en op de testpagina "paid" kiezen`);
    continue;
  }
  const p = await mollie(`/payments/${b.id}`);
  const mandateId = p.data?.mandateId;
  const m = lijst.find((x) => x.id === mandateId);
  if (!mandateId || !m) { uitslag.push(`${b.label}: betaald, maar GEEN machtiging ontstaan`); continue; }
  const sub = await mollie(`/customers/${customerId}/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      amount: { currency: "EUR", value: "19.00" },
      interval: "1 month",
      startDate: start,
      description: `Vellu Starter (monthly) TEST ${b.method}`,
      mandateId,
    }),
  });
  if (!sub.ok) { uitslag.push(`${b.label}: machtiging ${m.method}/${m.status}, maar abonnement aanmaken MISLUKT (${fout(sub)})`); continue; }
  await mollie(`/customers/${customerId}/subscriptions/${sub.data.id}`, { method: "DELETE" });
  uitslag.push(`${b.label}: OK. Machtiging ${m.method} (${m.status}); abonnement EUR 19 vanaf ${start} kon worden aangemaakt (en is weer gestopt)`);
}

// 5. Opruimen
await mollie(`/customers/${customerId}`, { method: "DELETE" });

console.log("\n=== UITSLAG ===");
for (const u of uitslag) console.log("  " + u);
console.log("\nKopieer deze uitslag naar Claude.");
