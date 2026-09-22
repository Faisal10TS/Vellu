// src/reportData.js
//
// De REKENLAAG van de twee rapporten (omzet = behandelingen, productverkoop =
// kassa), los van de weergave. Het PDF-rapport en de Excel-export (sinds
// 22-09-2026) halen hun getallen allebei hier vandaan, zodat een boekhouder
// die beide bestanden naast elkaar legt nooit twee verschillende totalen ziet.
// Geen jsPDF, geen DOM: dit bestand mag overal geïmporteerd worden.
//
// Belasting komt uit de belastingmotor (taxEngine.js) en niet uit één deling
// over het totaal: één periode kan meerdere grondslagen bevatten (BES-eilanden:
// diensten belast, doorverkochte producten niet; NL: 9% en 21%), en een
// ingewisselde kadobon verlaagt het ontvangen bedrag maar niet de grondslag.

import { computeTax, linesFromSale } from "./taxEngine.js";

const s = (v) => (v === null || v === undefined ? "" : String(v));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Betaalwijze-labels — de kassa slaat "pin" / "cash" / "online" (betaalverzoek)
// op; oudere rijen dragen "on-arrival": toon dat als "in de salon".
export const PAY_LABEL = {
  nl: { pin: "Pin", cash: "Contant", transfer: "Overschrijving", online: "Betaalverzoek", "on-arrival": "In de salon" },
  en: { pin: "Card", cash: "Cash", transfer: "Bank transfer", online: "Payment request", "on-arrival": "In salon" },
  es: { pin: "Tarjeta", cash: "Efectivo", transfer: "Transferencia", online: "Solicitud de pago", "on-arrival": "En el salón" },
};
export const payLabel = (pm, lang = "nl") => (PAY_LABEL[lang] || PAY_LABEL.nl)[pm] || (PAY_LABEL[lang] || PAY_LABEL.nl)["on-arrival"];

// ── Omzetrapport ─────────────────────────────────────────────────────────
// appointments: afgeronde afspraken binnen de periode (bij een rapport voor één
// stylist al teruggebracht tot háár aandeel, zie staffShareOf in shared.jsx).
// cfg: uitkomst van resolveTax(profile) — of de legacy-cfg die revenueReport.js
// uit losse parameters bouwt.
export function revenueReportData({ appointments, cfg }) {
  const list = Array.isArray(appointments) ? appointments : [];
  const allLines = list.flatMap((a) => linesFromSale(a));
  const computed = computeTax(allLines, cfg || {});
  // Intern document: showTaxInternal, niet showTax — een Arubaanse eigenaar mag
  // het bedrag aan BBO/BAVP/BAZV niet op de klantfactuur zetten, maar moet het
  // in zijn eigen omzetoverzicht wél terugzien.
  const showTaxRows = computed.showTaxInternal;

  const totalGross = computed.grandTotal;
  const totalBtw = showTaxRows ? computed.taxTotal : 0;
  const totalNet = round2(totalGross - totalBtw);
  const avg = list.length ? totalGross / list.length : 0;
  // Wat er naast de belaste grondslag in de omzet zit. Onbelast = de regels
  // zonder tarief (op de BES-eilanden de doorverkochte producten); kadobonnen
  // zijn een betaalmiddel en verlagen wél het ontvangen bedrag maar geen
  // grondslag — beide krijgen een eigen regel, anders telt de tabel niet op.
  const untaxedGross = round2(
    computed.lines.filter((l) => !l.taxable && l.kind !== "voucher").reduce((n, l) => n + l.gross, 0)
  );
  const voucherPaid = round2(computed.paidByVoucher);
  // De uitsplitsing is niet alleen nodig bij MEERDERE tarieven: ook bij één
  // tarief naast onbelaste omzet of een ingewisselde kadobon, anders is het
  // belastingbedrag nergens uit te herleiden.
  const needsBreakdown = computed.byRate.length > 1
    || Math.abs(untaxedGross) >= 0.01
    || voucherPaid >= 0.01;

  // Chronologisch grootboek: datum op, dan tijd op.
  const sorted = [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || "") < (b.time || "") ? -1 : 1;
  });

  return { computed, count: list.length, totalGross, totalBtw, totalNet, avg, untaxedGross, voucherPaid, showTaxRows, needsBreakdown, byRate: computed.byRate, sorted };
}

// ── Productverkoop ───────────────────────────────────────────────────────
// appointments: rijen met een products-array binnen de periode — kassaverkopen
// (is_sale) én producten die op een gewone afspraak zijn aangeslagen.
export function productReportData({ appointments, cfg, lang = "nl" }) {
  const list = Array.isArray(appointments) ? appointments : [];
  const c = cfg || {};
  const showTax = !!c.showTaxInternal;
  const taxLabel = c.label || "BTW";

  // Per product, per dag en per betaalwijze in ÉÉN gang over de rijen.
  const byProduct = new Map();   // naam -> { qty, revenue }
  const byDay = new Map();       // datum -> { qty, revenue }
  const byPay = new Map();       // betaalwijze -> { count, revenue }
  const lines = [];              // één regel per transactie (bon)
  const items = [];              // één regel per verkocht artikel
  // Grondslag per tarief in centen, zodat er niets wegdrijft.
  const byRate = new Map();
  let voucherCents = 0;
  let totalRevenue = 0, totalQty = 0;

  for (const a of list) {
    const prods = Array.isArray(a.products) ? a.products : [];
    if (!prods.length) continue;
    let rowRevenue = 0, rowQty = 0;
    const names = [];
    const staff = s(a.staff_name || "").split(",")[0].trim();
    const pm = a.payment_method || "on-arrival";
    for (const it of prods) {
      const qty = parseInt(it.qty) || 1;
      const price = parseFloat(it.price) || 0;
      const rev = price * qty;
      // Een ingewisselde kadobon is een negatieve regel: die hoort wel in het
      // geld (er kwam minder binnen) maar is geen verkocht stuk.
      const counts = rev >= 0 && it.kind !== "voucher_redeem";
      rowRevenue += rev; rowQty += counts ? qty : 0;
      names.push(qty > 1 ? `${s(it.name)} ×${qty}` : s(it.name));
      const p = byProduct.get(s(it.name)) || { qty: 0, revenue: 0 };
      p.qty += counts ? qty : 0; p.revenue += rev;
      byProduct.set(s(it.name), p);
      items.push({
        date: a.date, time: a.time || "", name: s(it.name), qty, price, amount: rev,
        kind: it.kind === "voucher_redeem" ? "voucher" : (it.kind === "voucher_sale" || it.id === "giftcard") ? "voucher_issue" : "product",
        staff, paymentMethod: pm, pay: payLabel(a.payment_method, lang),
      });
    }
    const d = byDay.get(a.date) || { qty: 0, revenue: 0 };
    d.qty += rowQty; d.revenue += rowRevenue;
    byDay.set(a.date, d);

    const pr = byPay.get(pm) || { count: 0, revenue: 0 };
    pr.count += 1; pr.revenue += rowRevenue;
    byPay.set(pm, pr);

    // Belasting over de PRODUCTregels van deze rij. De motor weet zelf welke
    // regels belast zijn; een ingewisselde kadobon telt niet in de grondslag.
    const t = computeTax(prods.map((it) => {
      const q = parseInt(it.qty) || 1;
      return {
        kind: it.kind === "voucher_redeem" ? "voucher"
          : (it.kind === "voucher_sale" || it.id === "giftcard") ? "voucher_issue"
          : "product",
        name: s(it.name), qty: q, gross: (parseFloat(it.price) || 0) * q,
      };
    }), c);
    for (const r of t.byRate) byRate.set(r.rate, (byRate.get(r.rate) || 0) + Math.round(r.gross * 100));
    voucherCents += Math.round(t.paidByVoucher * 100);

    totalRevenue += rowRevenue; totalQty += rowQty;
    lines.push({
      date: a.date, time: a.time || "",
      what: names.join(", "),
      staff,
      paymentMethod: pm,
      pay: payLabel(a.payment_method, lang),
      amount: rowRevenue,
      isSale: a.is_sale === true,
    });
  }
  const chrono = (x, y) => (`${x.date} ${x.time}`).localeCompare(`${y.date} ${y.time}`);
  lines.sort(chrono);
  items.sort(chrono);

  // Afronden op rapportniveau per tarief, zodat netto + belasting exact
  // optellen tot de grondslag — nooit per regel afronden en dan sommeren.
  const rateRows = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, grossC]) => {
    const netC = Math.round(grossC / (1 + rate / 100));
    return { rate, gross: grossC / 100, net: netC / 100, tax: (grossC - netC) / 100 };
  });
  const taxableGross = rateRows.reduce((n, r) => n + r.gross, 0);
  const totalTax = rateRows.reduce((n, r) => n + r.tax, 0);
  const totalNet = round2(totalRevenue - totalTax);
  const voucherPaid = round2(voucherCents / 100);
  // Wat er naast de belaste grondslag in de omzet zit (BES: doorverkoop). De
  // kadobon moet er weer bij, want die zit als min-post in de omzet maar niet
  // in de grondslag.
  const untaxed = round2(totalRevenue - taxableGross + voucherPaid);

  return {
    products: [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue })),
    days: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, qty: v.qty, revenue: v.revenue })),
    payments: [...byPay.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([method, v]) => ({ method, label: payLabel(method, lang), count: v.count, revenue: v.revenue })),
    lines, items, rateRows,
    totalRevenue, totalQty, taxableGross, totalTax, totalNet, voucherPaid, untaxed,
    showTax, taxLabel,
  };
}

// ── Bestandsnamen ────────────────────────────────────────────────────────
const fileSlug = (v, n) => s(v).replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, n);
const T3 = (lang, nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);

export function revenueReportFilename({ salon, staffName = "", range, lang = "nl", ext = "pdf" }) {
  const fnSalon = fileSlug(salon?.business_name || salon?.name || "vellu", 40);
  const fnStaff = staffName ? "-" + fileSlug(staffName, 30) : "";
  const fnRange = (range?.from || "").slice(0, 7); // YYYY-MM
  return `${fnSalon}${fnStaff}-${T3(lang, "omzet", "revenue", "ingresos")}-${fnRange || range?.from || "report"}.${ext}`;
}

export function productReportFilename({ salon, range, lang = "nl", ext = "pdf" }) {
  const fnSalon = fileSlug(salon?.business_name || salon?.name || "vellu", 40);
  const from = s(range?.from), to = s(range?.to);
  // Naam naar de PERIODE: 2026 / 2026-08 / 2026-08-12, anders botst het
  // jaarrapport met het dagrapport van 1 januari.
  const span = from === to ? from
    : from.slice(0, 4) === to.slice(0, 4) && from.endsWith("-01-01") ? from.slice(0, 4)
    : from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7)
    : `${from}_${to}`;
  return `${fnSalon}-${T3(lang, "productverkoop", "product-sales", "venta-productos")}-${span || "report"}.${ext}`;
}
