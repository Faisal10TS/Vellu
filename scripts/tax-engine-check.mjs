// scripts/tax-engine-check.mjs
//
// Controleert de belastingmotor tegen de regels van alle vijf jurisdicties.
// Draaien met:  node scripts/tax-engine-check.mjs
//
// Draai dit ALTIJD na het aanpassen van een tarief in TAX_RULES of van de
// logica in src/taxEngine.js. Belastingtarieven wijzigen per 1 januari, en een
// verkeerd bedrag op een bon is geen bug die je later even rechtzet.

import { computeTax, linesFromSale, buildSnapshot, taxForSale } from "../src/taxEngine.js";
import { build } from "esbuild";
import fs from "fs";

// shared.jsx bevat JSX; node kan dat niet lezen. Even door esbuild halen zodat
// we de ECHTE resolveTax testen en niet een kopie die kan afdrijven.
await build({
  entryPoints: [new URL("../src/shared.jsx", import.meta.url).pathname.slice(1)], bundle: true, format: "esm", jsx: "automatic",
  outfile: new URL("./_tmp_shared.mjs", import.meta.url).pathname.slice(1), external: ["react", "react-dom", "react/jsx-runtime", "@supabase/supabase-js", "react-router-dom", "@sentry/react", "qrcode"],
  logLevel: "silent", define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://x"), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("x"), "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(""), "import.meta.env.VITE_SUPABASE_KEY": JSON.stringify("k"), "import.meta.env.VITE_ANTHROPIC_KEY": JSON.stringify(""), "import.meta.env": "{}", "import.meta.env.MODE": JSON.stringify("test"), "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
});
const { resolveTax, currencyForCountry } = await import(new URL("./_tmp_shared.mjs", import.meta.url).href);

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
check("valuta SX is Cg", currencyForCountry("SX").symbol.trim(), "Cg");
check("valuta SX code", currencyForCountry("SX").code, "XCG");
check("oude rij valt terug op btw_id", resolveTax(salonOud).registered, true);
check("leeg tariefveld wordt niet stiekem 0", resolveTax({ ...salonNL, btw_rate: "" }).serviceRate, 21);
check("valuta CW is Cg", currencyForCountry("CW").symbol.trim(), "Cg");
check("valuta CW code", currencyForCountry("CW").code, "XCG");

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

fs.unlinkSync(new URL("./_tmp_shared.mjs", import.meta.url));
console.log("\n" + pass + " geslaagd, " + fail + " gefaald");
process.exit(fail ? 1 : 0);
