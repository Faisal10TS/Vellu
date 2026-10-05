// scripts/tax-engine-check.mjs
//
// Controleert de belastingmotor tegen de regels van alle vijf jurisdicties.
// Draaien met:  node scripts/tax-engine-check.mjs
//
// Draai dit ALTIJD na het aanpassen van een tarief in TAX_RULES of van de
// logica in src/taxEngine.js. Belastingtarieven wijzigen per 1 januari, en een
// verkeerd bedrag op een bon is geen bug die je later even rechtzet.

import { computeTax, linesFromSale, buildSnapshot, taxForSale, cfgFromSnapshot } from "../src/taxEngine.js";
import { revenueReportData, productReportData, cashFlowOf, cashbookData, paymentsAsCashRows, payLabel, pdfSafe, untaxedNote, revenueReportFilename, cashbookFilename, companyNumberLabel } from "../src/reportData.js";
import { build } from "esbuild";
import fs from "fs";

// shared.jsx bevat JSX; node kan dat niet lezen. Even door esbuild halen zodat
// we de ECHTE resolveTax testen en niet een kopie die kan afdrijven.
const BUILD_OPTS = {
  bundle: true, format: "esm", jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "@supabase/supabase-js", "react-router-dom", "@sentry/react", "qrcode"],
  logLevel: "silent", define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://x"), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("x"), "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(""), "import.meta.env.VITE_SUPABASE_KEY": JSON.stringify("k"), "import.meta.env.VITE_ANTHROPIC_KEY": JSON.stringify(""), "import.meta.env": "{}", "import.meta.env.MODE": JSON.stringify("test"), "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
};
await build({
  ...BUILD_OPTS,
  entryPoints: [new URL("../src/shared.jsx", import.meta.url).pathname.slice(1)],
  outfile: new URL("./_tmp_shared.mjs", import.meta.url).pathname.slice(1),
});
const { resolveTax, currencyForCountry, fmtAmt, fmtMoney } = await import(new URL("./_tmp_shared.mjs", import.meta.url).href);

let pass = 0, fail = 0;
const near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
function check(name, got, want) {
  const ok = typeof want === "number" ? near(got, want) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.log("  FOUT " + name + ": kreeg " + JSON.stringify(got) + ", verwacht " + JSON.stringify(want)); }
}

const salonNL = { country_code: "NL", tax_registered: true, btw_rate: 21, products_taxable: true };
const salonBON = { country_code: "BQ", tax_region: "BQ-BON", tax_registered: true, btw_rate: 6, products_taxable: false };
const salonSAB = { country_code: "BQ", tax_region: "BQ-SAB", tax_registered: true, btw_rate: 4, products_taxable: false };
const salonAW = { country_code: "AW", tax_registered: true, btw_rate: 7, products_taxable: true };
const salonCW = { country_code: "CW", tax_registered: false, btw_rate: null, products_taxable: true };
const salonSX = { country_code: "SX", tax_registered: true, btw_rate: 5, products_taxable: true };
const salonOud = { country_code: "NL", btw_id: "NL123B01", btw_rate: 21 }; // rij van vóór de migratie

console.log("\n== resolveTax ==");
check("NL label", resolveTax(salonNL).label, "BTW");
check("BON label", resolveTax(salonBON).label, "ABB");
check("BON idLabel", resolveTax(salonBON).idLabel, "CRIB");
check("BON productRate=0", resolveTax(salonBON).productRate, 0);
check("BON serviceRate", resolveTax(salonBON).serviceRate, 6);
check("SAB serviceRate 4", resolveTax(salonSAB).serviceRate, 4);
check("BQ zonder regio valt terug op Bonaire", resolveTax({ country_code: "BQ", tax_registered: true, btw_rate: 6 }).serviceRate, 6);
check("AW tarief 7", resolveTax(salonAW).serviceRate, 7);
check("AW mag NIET op klantdocument", resolveTax(salonAW).showTax, false);
check("AW mag WEL intern", resolveTax(salonAW).showTaxInternal, true);
check("CW tarief onbekend", resolveTax(salonCW).rateUnknown, true);
check("CW zonder tarief -> 0", resolveTax(salonCW).serviceRate, 0);
// Sint Maarten: ToT 5%, drukt op de ondernemer — zelfde weergaveregel als
// Aruba: niet op de klantbon, wel in de interne rapporten.
check("SX label", resolveTax(salonSX).label, "ToT");
check("SX tarief 5", resolveTax(salonSX).serviceRate, 5);
check("SX producten belast", resolveTax(salonSX).productRate, 5);
check("SX NIET op klantdocument", resolveTax(salonSX).showTax, false);
check("SX WEL intern", resolveTax(salonSX).showTaxInternal, true);
check("valuta SX is XCG (ISO-code, niet Cg)", currencyForCountry("SX").symbol.trim(), "XCG");
check("valuta SX code", currencyForCountry("SX").code, "XCG");
check("oude rij valt terug op btw_id", resolveTax(salonOud).registered, true);
check("leeg tariefveld wordt niet stiekem 0", resolveTax({ ...salonNL, btw_rate: "" }).serviceRate, 21);
check("valuta CW is XCG (ISO-code, niet Cg)", currencyForCountry("CW").symbol.trim(), "XCG");
check("valuta CW code", currencyForCountry("CW").code, "XCG");
// Bedragen: overal een komma als decimaalteken (Faisal 24-09-2026), elke munt.
check("XCG bedrag in de app met komma", fmtAmt(currencyForCountry("CW").symbol, 45), "XCG 45,00");
// Duizendtallen met een punt sinds 28-09-2026 ("$80.458,53", shared.jsx fmtAmt).
check("bedrag in de app met duizendtalpunt", fmtAmt("XCG ", 1234.5), "XCG 1.234,50");
check("euro bedrag met komma", fmtAmt("€", 45), "€45,00");
check("dollar bedrag met komma (Bonaire)", fmtAmt(currencyForCountry("BQ").symbol, 1234.5), "$1.234,50");
check("florin bedrag met komma", fmtAmt(currencyForCountry("AW").symbol, 45), "Afl. 45,00");
check("negatief bedrag", fmtAmt("€", -5), "€-5,00");
check("XCG in WhatsApp-tekst/PDF: komma en duizendtalpunt", fmtMoney(1234.5, "CW"), "XCG 1.234,50");
check("dollar in WhatsApp-tekst/PDF: komma en duizendtalpunt", fmtMoney(1234.5, "BQ"), "$1.234,50");
check("euro in WhatsApp-tekst/PDF", fmtMoney(1234.5, "NL"), "€1.234,50");

console.log("\n== computeTax: Nederland, alles belast ==");
{
  const r = computeTax([{ kind: "service", name: "Knippen", gross: 50 }, { kind: "product", name: "Shampoo", gross: 20 }], resolveTax(salonNL));
  check("1 tariefgroep", r.byRate.length, 1);
  check("grondslag 70", r.byRate[0].gross, 70);
  check("netto 57.85", r.byRate[0].net, 57.85);
  check("btw 12.15", r.byRate[0].tax, 12.15);
  check("netto+btw == grondslag", r.netTotal + r.taxTotal, 70);
  check("totaal 70", r.grandTotal, 70);
}

console.log("\n== computeTax: Bonaire, product NIET belast ==");
{
  const r = computeTax([{ kind: "service", name: "Manicure", gross: 50 }, { kind: "product", name: "Nagelriemolie", gross: 20 }], resolveTax(salonBON));
  check("1 tariefgroep (alleen dienst)", r.byRate.length, 1);
  check("grondslag is 50, niet 70", r.byRate[0].gross, 50);
  check("ABB 2.83 (niet 3.96)", r.taxTotal, 2.83);
  check("totaal blijft 70", r.grandTotal, 70);
  check("productregel rate 0", r.lines[1].rate, 0);
  check("productregel niet belast", r.lines[1].taxable, false);
}

console.log("\n== computeTax: kadobon is betaalmiddel, geen korting ==");
{
  const r = computeTax([
    { kind: "service", name: "Behandeling", gross: 100 },
    { kind: "voucher", name: "Kadobon KB-X", gross: -40 },
  ], resolveTax(salonBON));
  check("grondslag blijft 100", r.byRate[0].gross, 100);
  check("ABB over 100 = 5.66", r.taxTotal, 5.66);
  check("te betalen 60", r.grandTotal, 60);
  check("betaald met bon 40", r.paidByVoucher, 40);
}

console.log("\n== computeTax: verkoop van een kadobon wordt niet belast ==");
{
  const r = computeTax([{ kind: "voucher_issue", name: "Kadobon KB-Y", gross: 25 }], resolveTax(salonNL));
  check("geen tariefgroep", r.byRate.length, 0);
  check("geen belasting", r.taxTotal, 0);
  check("wel te betalen", r.grandTotal, 25);
}

console.log("\n== computeTax: twee tarieven op één bon ==");
{
  const cfg = resolveTax({ country_code: "NL", tax_registered: true, btw_rate: 9, products_taxable: true, product_tax_rate: 21 });
  const r = computeTax([{ kind: "service", name: "Knippen", gross: 40 }, { kind: "product", name: "Wax", gross: 30 }], cfg);
  check("2 tariefgroepen", r.byRate.length, 2);
  check("hoogste tarief eerst", r.byRate[0].rate, 21);
  check("21% over 30 -> 5.21", r.byRate[0].tax, 5.21);
  check("9% over 40 -> 3.30", r.byRate[1].tax, 3.30);
  check("som klopt met totaal", r.netTotal + r.taxTotal, 70);
}

console.log("\n== computeTax: niet belastingplichtig ==");
{
  const r = computeTax([{ kind: "service", name: "Knippen", gross: 50 }], resolveTax({ country_code: "NL", tax_registered: false, btw_rate: 21 }));
  check("geen tariefgroep", r.byRate.length, 0);
  check("geen belasting", r.taxTotal, 0);
  check("showTax uit", r.showTax, false);
}

console.log("\n== afronding: tien regels mogen geen cent verliezen ==");
{
  const lines = Array.from({ length: 10 }, (_, i) => ({ kind: "service", name: "R" + i, gross: 3.33 }));
  const r = computeTax(lines, resolveTax(salonNL));
  check("grondslag 33.30", r.byRate[0].gross, 33.30);
  check("netto+btw exact gelijk", Math.round((r.netTotal + r.taxTotal) * 100), 3330);
}

console.log("\n== linesFromSale: behandeling + producten uit één rij ==");
{
  const sale = { service_price: 23, service_name: "Manicure + Nagelriemolie x2",
    products: [{ id: "p1", name: "Nagelriemolie", price: 4, qty: 2 },
               { id: "voucher_redeem", kind: "voucher_redeem", name: "Kadobon KB-X ingewisseld", price: -25, qty: 1 }] };
  const l = linesFromSale(sale);
  check("3 regels", l.length, 3);
  check("dienst vooraan", l[0].kind, "service");
  check("dienst = 40 (23 - 8 + 25)", l[0].gross, 40);
  check("kadobon als voucher", l[2].kind, "voucher");
  const r = computeTax(l, resolveTax(salonBON));
  check("BON: alleen dienst belast", r.byRate[0].gross, 40);
  check("BON: ABB 2.26", r.taxTotal, 2.26);
  check("BON: te betalen 23", r.grandTotal, 23);
}

console.log("\n== snapshot bevriest de berekening ==");
{
  const lines = [{ kind: "service", name: "Knippen", gross: 50 }];
  const snap = buildSnapshot(computeTax(lines, resolveTax(salonBON)), resolveTax(salonBON), { country: "BQ", region: "BQ-BON", currency: "USD" });
  const saleMetSnap = { service_price: 50, products: [], tax_snapshot: snap };
  // salon verhoogt morgen het tarief naar 21 -> de oude bon mag niet meebewegen
  const na = taxForSale(saleMetSnap, resolveTax({ ...salonBON, btw_rate: 21 }));
  check("uit snapshot", na.fromSnapshot, true);
  check("nog steeds 6% -> 2.83", na.taxTotal, 2.83);
  const zonder = taxForSale({ service_price: 50, products: [] }, resolveTax({ ...salonBON, btw_rate: 21 }));
  check("zonder snapshot rekent met vandaag", zonder.taxTotal, 8.68);
}

console.log("\n== snapshot bewaart aantallen (bon: 2 x Nagelriemolie) ==");
{
  const items = [{ id: "p1", name: "Nagelriemolie", price: 4, qty: 2 }];
  const sale = { service_price: 8, products: items };
  const snap = buildSnapshot(computeTax(linesFromSale(sale), resolveTax(salonNL)), resolveTax(salonNL), {});
  check("qty in snapshot", snap.lines[0].qty, 2);
  check("qty terug via taxForSale", taxForSale({ ...sale, tax_snapshot: snap }, resolveTax(salonNL)).lines[0].qty, 2);
  // Oude snapshot zonder qty: aantal uit de products-array.
  const oud = { ...snap, lines: snap.lines.map(({ qty, ...l }) => l) };
  check("oude snapshot: qty uit products", taxForSale({ ...sale, tax_snapshot: oud }, resolveTax(salonNL)).lines[0].qty, 2);
}

console.log("\n== rapporten rekenen met de bevroren instellingen per rij ==");
{
  // NL-salon zat tot 1 september in de KOR (niet plichtig) en is nu plichtig.
  const kor = resolveTax({ ...salonNL, tax_registered: false });
  const nu = resolveTax(salonNL);
  const bevroren = (row, cfg) => ({ ...row, tax_snapshot: buildSnapshot(computeTax(linesFromSale(row), cfg), cfg, {}) });
  const jan = bevroren({ date: "2026-01-10", time: "10:00", service_price: 121, products: [] }, kor);
  const okt = bevroren({ date: "2026-10-01", time: "10:00", service_price: 121, products: [] }, nu);
  const oudZonderSnap = { date: "2026-10-02", time: "10:00", service_price: 121, products: [] };
  const R = revenueReportData({ appointments: [jan, okt, oudZonderSnap], cfg: nu });
  check("KOR-rij telt geen BTW: alleen 2 x 121 belast", R.byRate[0].gross, 242);
  check("BTW 42,00", R.totalBtw, 42);
  check("omzet 363", R.totalGross, 363);
  check("onbelast 121 (KOR-periode)", R.untaxedGross, 121);
  check("regel KOR-rij zonder BTW", R.rows[0].tax, 0);
  // Omgekeerd: salon nu KOR, oude rij was plichtig -> BTW blijft zichtbaar.
  const R2 = revenueReportData({ appointments: [okt], cfg: kor });
  check("oude plichtige rij toont BTW ook als salon nu KOR is", R2.showTaxRows, true);
  check("BTW 21 uit de bevroren rij", R2.totalBtw, 21);
  // Rapport van één stylist: haar aandeel (lager bedrag) met de bevroren cfg.
  const deel = { ...jan, service_price: 60 };
  check("aandeel stylist volgt bevroren KOR", revenueReportData({ appointments: [deel], cfg: nu }).totalBtw, 0);
  check("cfgFromSnapshot zonder snapshot = cfg", cfgFromSnapshot(oudZonderSnap, nu).serviceRate, 21);
  // Kassaverkopen apart geteld.
  const R3 = revenueReportData({ appointments: [okt, { ...oudZonderSnap, is_sale: true }], cfg: nu });
  check("afspraken 1", R3.apptCount, 1);
  check("kassaverkopen 1", R3.saleCount, 1);
}

console.log("\n== productrapport: onbelast-toelichting en betaalwijze ==");
{
  const giftNL = [{ date: "2026-10-01", time: "10:00", service_price: 25, is_sale: true, payment_method: null, products: [{ id: "giftcard", kind: "voucher_sale", name: "Kadobon KB-1", price: 25, qty: 1 }, { id: "p1", name: "Shampoo", price: 0, qty: 1 }] },
    { date: "2026-10-01", time: "11:00", service_price: 20, is_sale: true, payment_method: "prepaid", products: [{ id: "p2", name: "Wax", price: 20, qty: 1 }] }];
  const P = productReportData({ appointments: giftNL, cfg: resolveTax(salonNL), lang: "nl" });
  check("NL: onbelast is kadobonverkoop", P.untaxedWhy.giftCards && !P.untaxedWhy.resale, true);
  check("NL: toelichting noemt kadobonnen", /kadobonnen/.test(untaxedNote(P, "nl")) && !/doorverkoop/.test(untaxedNote(P, "nl")), true);
  check("open post heet Later / factuur", P.lines[0].pay, "Later / factuur");
  check("vooruitbetaald heet niet 'In de salon'", P.lines[1].pay, "Vooruitbetaald");
  const PB = productReportData({ appointments: [giftNL[1]], cfg: resolveTax(salonBON), lang: "en" });
  check("BON: onbelast is doorverkoop", PB.untaxedWhy.resale, true);
  check("payLabel null", payLabel(null, "es"), "Después / factura");
  check("payLabel prepaid en", payLabel("prepaid", "en"), "Paid in advance");
}

console.log("\n== kasboek: alleen het contante deel ==");
{
  // Vooruitbetaald 45 online, rest 30 contant: afspraak blijft "prepaid",
  // het restant is een client_payments-rij.
  const appt = { id: "a1", date: "2026-10-05", time: "16:00", status: "completed", payment_method: "prepaid", service_price: 75, amount_paid: 75, paid_at: "2026-10-05T14:00:00Z" };
  const pay = paymentsAsCashRows([{ id: "p1", appointment_id: "a1", method: "cash", amount: 30, paid_on: "2026-10-05", created_at: "2026-10-05T14:05:00Z" }]);
  const sale = { id: "s1", date: "2026-10-05", time: "10:00", status: "completed", payment_method: "cash", service_price: 12, cash_received: 20, paid_at: "x", created_at: "2026-10-05T08:00:00Z" };
  const booked = { id: "b1", date: "2026-10-05", time: "16:30", status: "completed", payment_method: "cash", service_price: 50, paid_at: "x", created_at: "2026-09-28T09:00:00Z" };
  const D = cashbookData({ movements: [], cashRows: [appt, ...pay, sale, booked].filter((a) => a.payment_method === "cash"), from: "2026-10-01", to: "2026-10-31" });
  check("netto contant = 30 + 12 + 50", D.totals.sales, 92);
  check("wisselgeld 8", D.totals.change, 8);
  check("3 contante betalingen (prepaid telt niet)", D.totals.salesCount, 3);
  check("op tijd gesorteerd: 10:00 eerst", D.cashRows[0].id, "s1");
  // Product na afrekenen erbij: 45 contant betaald, 15 nog open.
  check("open restant zit niet in de la", cashFlowOf({ payment_method: "cash", service_price: 60, amount_paid: 45, paid_at: null }).net, 45);
  check("oude contante rij zonder amount_paid telt volledig", cashFlowOf({ payment_method: "cash", service_price: 60 }).net, 60);
  check("betaald (paid_at) telt volledig", cashFlowOf({ payment_method: "cash", service_price: 60, amount_paid: 45, paid_at: "x" }).net, 60);
  // Betaling teruggezet naar open (togglePaid): amount_paid 0, paid_at leeg.
  const reopened = { id: "r1", date: "2026-10-05", time: "11:00", status: "completed", payment_method: "cash", service_price: 40, amount_paid: 0, paid_at: null };
  const D2 = cashbookData({ movements: [], cashRows: [sale, reopened], from: "2026-10-01", to: "2026-10-31" });
  check("teruggezet naar open: geen kasregel", D2.cashRows.map((a) => a.id), ["s1"]);
  check("teruggezet naar open: telt niet als betaling", D2.totals.salesCount, 1);
  check("teruggezet naar open: netto onveranderd", D2.totals.sales, 12);
  // Tijd van een contante betaling op de klok van de salon (Bonaire UTC-4).
  const payT = (tz) => paymentsAsCashRows([{ id: "p2", method: "cash", amount: 10, paid_on: "2026-10-05", created_at: "2026-10-05T14:05:00Z" }], "nl", tz)[0].time;
  check("betaaltijd op salonklok Bonaire", payT("America/Kralendijk"), "10:05");
  check("betaaltijd op salonklok Amsterdam", payT("Europe/Amsterdam"), "16:05");
}

console.log("\n== bestandsnamen per volledige periode ==");
{
  const salon = { business_name: "Bloom" };
  const f = (from, to) => revenueReportFilename({ salon, range: { from, to }, lang: "nl" });
  check("maand", f("2026-01-01", "2026-01-31"), "bloom-omzet-2026-01.pdf");
  check("kwartaal", f("2026-01-01", "2026-03-31"), "bloom-omzet-2026-Q1.pdf");
  check("jaar", f("2026-01-01", "2026-12-31"), "bloom-omzet-2026.pdf");
  check("dag", f("2026-02-03", "2026-02-03"), "bloom-omzet-2026-02-03.pdf");
  check("ingekort tot vandaag", cashbookFilename({ salon, range: { from: "2026-01-01", to: "2026-10-05" }, lang: "en" }), "bloom-cash-book-2026-01-01_2026-10-05.pdf");
  check("februari schrikkeljaar", f("2028-02-01", "2028-02-29"), "bloom-omzet-2028-02.pdf");
}

console.log("\n== PDF-tekst (WinAnsi) en labels ==");
{
  check("minteken wordt -", pdfSafe("Verkoop · Shampoo (korting \u2212€5,00)"), "Verkoop · Shampoo (korting -€5,00)");
  check("Ş en Ł worden kale letters", pdfSafe("Şule Łukasz ğ"), "Sule Lukasz g");
  check("WinAnsi blijft staan", pdfSafe("José – ’t “x” … €"), "José – ’t “x” … €");
  check("los accentteken (NFD) blijft een é", pdfSafe("Angélique"), "Angélique");
  check("BE: ondernemingsnummer", companyNumberLabel({ country_code: "BE" }, "nl"), "Ondernemingsnr.");
  check("NL: KVK", companyNumberLabel({ country_code: "NL" }, "nl"), "KVK");
}

console.log("\n== klanten-CSV: formulecellen en dubbele klanten ==");
{
  // clientExport.js praat met supabase en de DOM. Met een nep-supabase (de
  // tabellen hieronder) en een nep-download draait hier de ECHTE export.
  const fakeSupabase = {
    name: "fake-supabase",
    setup(b) {
      b.onResolve({ filter: /[\\/]supabase\.js$/ }, () => ({ path: "fake-supabase", namespace: "fake" }));
      b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ loader: "js", contents: `
        const q = (t) => { const self = { select: () => self, eq: () => self, order: () => self,
          range: (a, z) => Promise.resolve({ data: ((globalThis.__csvTables || {})[t] || []).slice(a, z + 1), error: null }) }; return self; };
        export const supabase = { from: q };
        export const supabaseUrl = "http://x";` }));
    },
  };
  await build({
    ...BUILD_OPTS, plugins: [fakeSupabase],
    entryPoints: [new URL("../src/clientExport.js", import.meta.url).pathname.slice(1)],
    outfile: new URL("./_tmp_clientexport.mjs", import.meta.url).pathname.slice(1),
  });
  const { exportClientsCSV, csvCell } = await import(new URL("./_tmp_clientexport.mjs", import.meta.url).href);

  check("telefoon met + blijft zonder apostrof", csvCell("+31 6 12345678"), "+31 6 12345678");
  check("telefoon met haakjes blijft", csvCell("+1 (721) 555-0100"), "+1 (721) 555-0100");
  check("negatief bedrag blijft", csvCell("-12,50"), "-12,50");
  check("=HYPERLINK krijgt apostrof", csvCell("=HYPERLINK(\"http://x\",\"klik\")"), "\"'=HYPERLINK(\"\"http://x\"\",\"\"klik\"\")\"");
  check("@SUM krijgt apostrof", csvCell("@SUM(A1)"), "'@SUM(A1)");
  check("+ met tekst krijgt apostrof", csvCell("+1+cmd|' /C calc'!A0"), "'+1+cmd|' /C calc'!A0");
  check("rekensom met + krijgt apostrof", csvCell("-2+3"), "'-2+3");

  const appt = (id, client_name, client_email, client_phone, extra = {}) => ({ id, date: "2026-09-0" + id, time: "10:00", status: "completed", service_price: 10, service_name: "Knippen", staff_name: "Noor", client_name, client_email, client_phone, is_sale: false, clients: null, ...extra });
  globalThis.__csvTables = {
    appointments: [
      // Eerst de boeking ZONDER e-mail: de volgorde mag niet uitmaken.
      appt("1", "Lia Bos", null, "06 1234 5678"),
      appt("2", "Lia Bos", "lia@example.com", "0612345678", { clients: { first_name: "Lia", last_name: "Bos", email: "lia@example.com", phone: "0612345678" } }),
      appt("3", "Rosa Marte", "rosa@example.com", "+599 717 1234"),
      appt("4", "Kim de Vries", null, "06 8765 4321"),
      appt("5", "Anna", "anna@example.com", ""),
      appt("6", "Anna", null, ""),
      appt("7", "Losse verkoop", null, null, { is_sale: true }),
      appt("8", "=HYPERLINK(\"http://x\",\"klik\") Evil", "evil@example.com", "+31 6 12345678"),
    ],
    manual_clients: [
      // Alleen telefoon in de klantenlijst, later online geboekt mét e-mail.
      { name: "Rosa Marte", email: null, phone: "+5997171234", hidden: false },
      // In de klantenlijst mét e-mail, afspraak zonder e-mail.
      { name: "Kim de Vries", email: "kim@example.com", phone: "0687654321", hidden: false },
    ],
  };
  let blob = null;
  globalThis.document = { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } };
  const origCreate = URL.createObjectURL, origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (b) => { blob = b; return "blob:x"; };
  URL.revokeObjectURL = () => {};
  const res = await exportClientsCSV({ ownerId: "o1", salonName: "Bloom", lang: "nl", countryCode: "NL" });
  URL.createObjectURL = origCreate; URL.revokeObjectURL = origRevoke;
  delete globalThis.document;
  const lines = (await blob.text()).replace(/^﻿/, "").split("\r\n").slice(1).map((l) => l.split(";"));
  const by = (email) => lines.filter((l) => l[2] === email);
  check("CSV: 6 klanten (Lia, Rosa, Kim, 2x Anna, Evil; losse verkoop niet)", res.count, 6);
  check("CSV: Lia één regel, beide afspraken", by("lia@example.com").map((l) => l[7]), ["2"]);
  check("CSV: Rosa één regel (klantenlijst zonder e-mail overgeslagen)", lines.filter((l) => l[0] === "Rosa").length, 1);
  check("CSV: Kim één regel met het adres uit de klantenlijst", by("kim@example.com").map((l) => l[7]), ["1"]);
  check("CSV: Anna zonder telefoon niet bij Anna met e-mail", lines.filter((l) => l[0] === "Anna").length, 2);
  check("CSV: telefoon met + ongewijzigd in de export", by("evil@example.com").map((l) => l[3]), ["+31 6 12345678"]);
  check("CSV: formule in de naam geneutraliseerd", by("evil@example.com").map((l) => l[0]), ["\"'=HYPERLINK(\"\"http://x\"\",\"\"klik\"\")\""]);
  fs.unlinkSync(new URL("./_tmp_clientexport.mjs", import.meta.url));
}

fs.unlinkSync(new URL("./_tmp_shared.mjs", import.meta.url));
console.log("\n" + pass + " geslaagd, " + fail + " gefaald");
process.exit(fail ? 1 : 0);
