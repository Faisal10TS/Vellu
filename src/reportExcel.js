// src/reportExcel.js
//
// Excel-versie (.xlsx) van de twee rapporten die er als PDF al waren:
// omzetrapport (Facturen) en productverkoop (Kassa). Faisal, 22-09-2026:
// "is it possible that all the pdf reports can be downloaded as excel too?"
//
// De GETALLEN komen uit reportData.js — dezelfde rekenlaag als de PDF — zodat
// beide bestanden altijd op hetzelfde uitkomen. Dit bestand bepaalt alleen
// welke werkbladen er zijn en wat er in welke kolom staat. Lazy geladen, net
// als de PDF-modules.
//
// Opzet per bestand:
//   Omzetrapport:   Samenvatting (kop, kerncijfers, belasting per tarief,
//                   bedrijfsgegevens, noten) + Afspraken (één regel per afspraak)
//   Productverkoop: Samenvatting (kerncijfers, betaalwijzen, belasting per
//                   tarief) + Per product + Per dag (bij meer dagen) +
//                   Transacties (één regel per bon) + Regels (één per artikel)
// Bedragen zijn echte getallen met een valutanotatie, datums echte datums,
// totalen SOM-formules met vooraf berekende waarde — zodat een boekhouder er
// meteen mee kan rekenen, sorteren en filteren.

import { buildXlsx, saveXlsx } from "./xlsx.js";
import { revenueReportData, productReportData, revenueReportFilename, productReportFilename } from "./reportData.js";

const s = (v) => (v === null || v === undefined ? "" : String(v));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (v, total = false) => ({ v: round2(v), s: total ? "moneyTotal" : "money" });
const int = (v, total = false) => ({ v: Math.round(Number(v) || 0), s: total ? "intTotal" : "int" });
const date = (iso) => ({ d: s(iso).slice(0, 10) });
const H = (...labels) => labels.map((l) => ({ v: l, s: "header" }));
const sum = (col, from, to, total = true, style = "moneyTotal") => (v) => ({ f: `SUM(${col}${from}:${col}${to})`, v: round2(v), s: total ? style : "money" });
const pctLabel = (rate, locale) => `${(Math.round((Number(rate) || 0) * 100) / 100).toLocaleString(locale)}%`;
const genLocale = (lang) => (lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB");

// Bedrijfsblok + noten die onder elke samenvatting horen.
function companyRows(salon, idLabel, T) {
  const rows = [
    [T("Bedrijf", "Business", "Empresa"), s(salon.business_name || salon.name)],
    salon.address ? [T("Adres", "Address", "Dirección"), s(salon.address)] : null,
    (salon.postcode || salon.city) ? [T("Plaats", "City", "Ciudad"), [s(salon.postcode), s(salon.city)].filter(Boolean).join(" ")] : null,
    salon.kvk_number ? ["KVK", s(salon.kvk_number)] : null,
    salon.btw_id ? [idLabel, s(salon.btw_id)] : null,
    salon.iban ? ["IBAN", s(salon.iban)] : null,
    salon.salon_email ? [T("E-mail", "Email", "Correo"), s(salon.salon_email)] : null,
  ].filter(Boolean);
  return rows.map(([k, v]) => [{ v: k, s: "bold" }, v]);
}
const noteRows = (lines) => lines.filter(Boolean).map((l) => [{ v: l, s: "muted" }]);

// ── Omzetrapport ─────────────────────────────────────────────────────────
// Zelfde parameters als generateRevenueReportPDF (zonder logo).
export function buildRevenueReportXlsx({
  salon, appointments, range, lang = "nl", staffName = "",
  currencySymbol = "€", moneyLocale = "nl-NL",
  taxLabel = "BTW", taxIdLabel = "BTW-id", taxRate = 0.21, showTax = true,
  taxCfg = null,
}) {
  const T = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);
  // Zelfde terugval als de PDF voor een oude aanroeper zonder taxCfg.
  const legacyPct = (Number(taxRate) || 0) * 100;
  const cfg = taxCfg || { label: taxLabel, idLabel: taxIdLabel, serviceRate: legacyPct, productRate: legacyPct, registered: !!showTax, showTax: !!showTax, showTaxInternal: !!showTax };
  const label = cfg.label || taxLabel;
  const idLabel = cfg.idLabel || taxIdLabel;
  const R = revenueReportData({ appointments, cfg });
  const showTaxRows = R.showTaxRows;

  // ── blad 1: samenvatting ──
  const sum1 = [
    [{ v: T("Omzetrapport", "Revenue report", "Informe de ingresos"), s: "title" }],
    [{ v: s(salon.business_name || salon.name), s: "bold" }],
    [T("Periode", "Period", "Período"), range.label || `${range.from} — ${range.to}`],
    [T("Van", "From", "Desde"), date(range.from)],
    [T("Tot en met", "To", "Hasta"), date(range.to)],
    staffName ? [T("Medewerker", "Team member", "Miembro del equipo"), s(staffName)] : null,
    [],
    [{ v: T("Kerncijfers", "Key figures", "Cifras clave"), s: "bold" }],
    [T("Aantal afspraken", "Appointments", "Citas"), int(R.count)],
    [showTaxRows ? T(`Omzet incl. ${label}`, `Revenue incl. ${label}`, `Ingresos incl. ${label}`) : T("Omzet", "Revenue", "Ingresos"), money(R.totalGross)],
    showTaxRows ? [label, money(R.totalBtw)] : null,
    showTaxRows ? [T(`Netto (excl. ${label})`, `Net (excl. ${label})`, `Neto (excl. ${label})`), money(R.totalNet)] : null,
    [T("Gemiddeld per afspraak", "Average per appointment", "Promedio por cita"), money(R.avg)],
    [],
  ].filter(Boolean);
  if (showTaxRows && R.byRate.length) {
    sum1.push(H(T("Tarief", "Rate", "Tipo"), T("Grondslag", "Taxable base", "Base imponible"), T(`Netto (excl. ${label})`, `Net (excl. ${label})`, `Neto (excl. ${label})`), label));
    for (const r of R.byRate) sum1.push([`${label} ${pctLabel(r.rate, moneyLocale)}`, money(r.gross), money(r.net), money(r.tax)]);
    if (Math.abs(R.untaxedGross) >= 0.01) sum1.push([T("Onbelast", "Untaxed", "Sin impuesto"), money(R.untaxedGross), money(R.untaxedGross), money(0)]);
    if (R.voucherPaid >= 0.01) sum1.push([T("Ingewisselde kadobonnen", "Gift cards redeemed", "Tarjetas regalo canjeadas"), money(-R.voucherPaid), money(-R.voucherPaid), money(0)]);
    sum1.push([{ v: T("Totaal", "Total", "Total"), s: "textTotal" }, money(R.totalGross, true), money(R.totalNet, true), money(R.totalBtw, true)]);
    sum1.push([]);
  }
  sum1.push(...companyRows(salon, idLabel, T), []);
  const ratesNote = showTaxRows ? ` · ${label} ${R.byRate.map((r) => pctLabel(r.rate, moneyLocale)).join(" / ")}` : "";
  sum1.push(...noteRows([
    T("Belastingbedragen zijn berekend op basis van de instellingen van deze salon. Vellu geeft geen fiscaal advies.",
      "Tax amounts are calculated from this salon's settings. Vellu does not provide tax advice.",
      "Los importes de impuestos se calculan según la configuración de este salón. Vellu no ofrece asesoramiento fiscal."),
    T(`Bedragen in ${currencySymbol}${ratesNote}, belasting inbegrepen. Bij een regiowijziging worden eerdere bedragen niet omgerekend.`,
      `Amounts in ${currencySymbol}${ratesNote}, tax included. After a region change, earlier amounts are not converted.`,
      `Importes en ${currencySymbol}${ratesNote}, impuestos incluidos. Tras un cambio de región, los importes anteriores no se convierten.`),
    `${T("Gegenereerd op", "Generated on", "Generado el")} ${new Date().toLocaleDateString(genLocale(lang))} · vellu.cc`,
  ]));

  // ── blad 2: afspraken ──
  const head = H(T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Klant", "Client", "Cliente"), T("Behandeling", "Service", "Servicio"), T("Medewerker", "Staff", "Personal"), T("Betaalwijze", "Payment", "Pago"), T("Factuurnr.", "Invoice no.", "N.º factura"), T("Bedrag", "Amount", "Importe"));
  const body = R.sorted.map((a) => [
    date(a.date), s(a.time), s(a.client_name), s(a.service_name), s(a.staff_name),
    a.payment_method ? T({ pin: "Pin", cash: "Contant", transfer: "Overschrijving", online: "Betaalverzoek", "on-arrival": "In de salon" }[a.payment_method] || s(a.payment_method),
      { pin: "Card", cash: "Cash", transfer: "Bank transfer", online: "Payment request", "on-arrival": "In salon" }[a.payment_method] || s(a.payment_method),
      { pin: "Tarjeta", cash: "Efectivo", transfer: "Transferencia", online: "Solicitud de pago", "on-arrival": "En el salón" }[a.payment_method] || s(a.payment_method)) : "",
    s(a.invoice_number), money(a.service_price),
  ]);
  const lastRow = body.length + 1;
  const total = [null, null, null, { v: T("Totaal", "Total", "Total"), s: "textTotal" }, null, null, null, sum("H", 2, lastRow)(R.totalGross)];
  const sheets = [
    { name: T("Samenvatting", "Summary", "Resumen"), cols: [30, 18, 18, 14], rows: sum1 },
    { name: T("Afspraken", "Appointments", "Citas"), cols: [12, 7, 24, 34, 18, 16, 14, 13], rows: [head, ...body, total], freeze: true, filter: lastRow },
  ];
  const bytes = buildXlsx({ sheets, currencySymbol });
  const filename = revenueReportFilename({ salon, staffName, range, lang, ext: "xlsx" });
  return { filename, bytes, count: R.count, totalGross: R.totalGross, totalNet: R.totalNet, totalBtw: R.totalBtw, byRate: R.byRate, untaxedGross: R.untaxedGross, paidByVoucher: R.voucherPaid, taxLabel: label };
}

export function downloadRevenueReportXlsx(opts) {
  const r = buildRevenueReportXlsx(opts);
  saveXlsx(r.filename, r.bytes);
  return r;
}

// ── Productverkoop ───────────────────────────────────────────────────────
// Zelfde parameters als generateProductReportPDF (zonder logo).
export function buildProductReportXlsx({
  salon, appointments, range, lang = "nl",
  currencySymbol = "€", moneyLocale = "nl-NL",
  taxIdLabel = "BTW-id", taxCfg = null,
}) {
  const T = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);
  const cfg = taxCfg || {};
  const P = productReportData({ appointments, cfg, lang });
  const { taxLabel, showTax } = P;

  // ── blad 1: samenvatting ──
  const sum1 = [
    [{ v: T("Productverkoop", "Product sales", "Venta de productos"), s: "title" }],
    [{ v: s(salon.business_name || salon.name), s: "bold" }],
    [T("Periode", "Period", "Período"), range.label || `${range.from} — ${range.to}`],
    [T("Van", "From", "Desde"), date(range.from)],
    [T("Tot en met", "To", "Hasta"), date(range.to)],
    [],
    [{ v: T("Kerncijfers", "Key figures", "Cifras clave"), s: "bold" }],
    [T("Producten verkocht", "Products sold", "Productos vendidos"), int(P.totalQty)],
    [T("Transacties", "Transactions", "Transacciones"), int(P.lines.length)],
    [T("Omzet", "Revenue", "Ingresos"), money(P.totalRevenue)],
    showTax && P.rateRows.length ? [T(`Excl. ${taxLabel}`, `Excl. ${taxLabel}`, `Sin ${taxLabel}`), money(P.totalNet)] : null,
    showTax && P.rateRows.length ? [taxLabel, money(P.totalTax)] : null,
    [],
  ].filter(Boolean);
  if (P.payments.length) {
    sum1.push(H(T("Betaalwijze", "Payment method", "Método de pago"), T("Transacties", "Transactions", "Transacciones"), T("Bedrag", "Amount", "Importe")));
    for (const p of P.payments) sum1.push([p.label, int(p.count), money(p.revenue)]);
    sum1.push([{ v: T("Totaal", "Total", "Total"), s: "textTotal" }, int(P.lines.length, true), money(P.totalRevenue, true)]);
    sum1.push([]);
  }
  if (showTax && P.rateRows.length) {
    sum1.push(H(T("Tarief", "Rate", "Tipo"), T("Grondslag", "Taxable amount", "Base imponible"), T("Excl.", "Excl.", "Sin"), taxLabel));
    for (const r of P.rateRows) sum1.push([pctLabel(r.rate, moneyLocale), money(r.gross), money(r.net), money(r.tax)]);
    if (Math.abs(P.untaxed) >= 0.01) sum1.push([T("Onbelast", "Untaxed", "Sin impuesto"), money(P.untaxed), money(P.untaxed), money(0)]);
    if (P.voucherPaid >= 0.01) sum1.push([T("Ingewisselde kadobonnen", "Gift cards redeemed", "Tarjetas regalo canjeadas"), money(-P.voucherPaid), money(-P.voucherPaid), money(0)]);
    sum1.push([{ v: T("Totaal", "Total", "Total"), s: "textTotal" }, money(P.totalRevenue, true), money(P.totalNet, true), money(P.totalTax, true)]);
    if (P.untaxed >= 0.01) sum1.push(...noteRows([T(`De regel "Onbelast" is doorverkoop van producten; die is hier niet ${taxLabel}-plichtig.`, `The "Untaxed" row is resale of products, which is not subject to ${taxLabel} here.`, `La fila "Sin impuesto" es reventa de productos, que no está sujeta a ${taxLabel} aquí.`)]));
    sum1.push([]);
  }
  sum1.push(...companyRows(salon, cfg.idLabel || taxIdLabel, T), []);
  sum1.push(...noteRows([
    T(`Bedragen in ${currencySymbol}, inclusief belasting. Alleen productverkoop — behandelingen staan in het omzetrapport. Belastingbedragen volgen uit de instellingen van deze salon; Vellu geeft geen fiscaal advies.`,
      `Amounts in ${currencySymbol}, tax included. Product sales only — treatments are in the revenue report. Tax amounts follow this salon's settings; Vellu does not provide tax advice.`,
      `Importes en ${currencySymbol}, impuestos incluidos. Solo venta de productos. Los importes de impuestos siguen la configuración de este salón; Vellu no ofrece asesoramiento fiscal.`),
    `${T("Gegenereerd op", "Generated on", "Generado el")} ${new Date().toLocaleDateString(genLocale(lang))} · vellu.cc`,
  ]));

  // ── blad 2: per product ──
  const prodHead = H(T("Product", "Product", "Producto"), T("Aantal", "Qty", "Cantidad"), T("Omzet", "Revenue", "Ingresos"));
  const prodBody = P.products.map((p) => [p.name, int(p.qty), money(p.revenue)]);
  const prodLast = prodBody.length + 1;
  const prodTotal = [{ v: T("Totaal", "Total", "Total"), s: "textTotal" }, sum("B", 2, prodLast, true, "intTotal")(P.totalQty), sum("C", 2, prodLast)(P.totalRevenue)];

  // ── blad 3: per dag (alleen bij meer dan één dag) ──
  const daySheet = P.days.length > 1 ? (() => {
    const body = P.days.map((d) => [date(d.date), int(d.qty), money(d.revenue)]);
    const last = body.length + 1;
    return { name: T("Per dag", "By day", "Por día"), cols: [14, 10, 14], rows: [H(T("Dag", "Day", "Día"), T("Aantal", "Qty", "Cantidad"), T("Omzet", "Revenue", "Ingresos")), ...body, [{ v: T("Totaal", "Total", "Total"), s: "textTotal" }, sum("B", 2, last, true, "intTotal")(P.totalQty), sum("C", 2, last)(P.totalRevenue)]], freeze: true, filter: last };
  })() : null;

  // ── blad 4: transacties (één regel per bon) ──
  const trHead = H(T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Verkocht", "Sold", "Vendido"), T("Medewerker", "Staff", "Personal"), T("Betaald", "Paid", "Pagado"), T("Soort", "Type", "Tipo"), T("Bedrag", "Amount", "Importe"));
  const trBody = P.lines.map((l) => [date(l.date), l.time, l.what, l.staff, l.pay, l.isSale ? T("Kassa", "Till", "Caja") : T("Bij afspraak", "With appointment", "Con cita"), money(l.amount)]);
  const trLast = trBody.length + 1;
  const trTotal = [null, null, null, null, null, { v: T("Totaal", "Total", "Total"), s: "textTotal" }, sum("G", 2, trLast)(P.totalRevenue)];

  // ── blad 5: regels (één regel per artikel) ──
  const itHead = H(T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Product", "Product", "Producto"), T("Aantal", "Qty", "Cantidad"), T("Stukprijs", "Unit price", "Precio unitario"), T("Bedrag", "Amount", "Importe"), T("Medewerker", "Staff", "Personal"), T("Betaald", "Paid", "Pagado"));
  const itBody = P.items.map((i) => [date(i.date), i.time, i.kind === "voucher" ? `${i.name} (${T("kadobon ingewisseld", "gift card redeemed", "tarjeta regalo canjeada")})` : i.kind === "voucher_issue" ? `${i.name} (${T("kadobon verkocht", "gift card sold", "tarjeta regalo vendida")})` : i.name, int(i.qty), money(i.price), money(i.amount), i.staff, i.pay]);
  const itLast = itBody.length + 1;
  const itTotal = [null, null, null, null, { v: T("Totaal", "Total", "Total"), s: "textTotal" }, sum("F", 2, itLast)(P.totalRevenue), null, null];

  const sheets = [
    { name: T("Samenvatting", "Summary", "Resumen"), cols: [30, 18, 18, 14], rows: sum1 },
    { name: T("Per product", "By product", "Por producto"), cols: [34, 10, 14], rows: [prodHead, ...prodBody, prodTotal], freeze: true, filter: prodLast },
    daySheet,
    { name: T("Transacties", "Transactions", "Transacciones"), cols: [12, 7, 44, 18, 16, 14, 13], rows: [trHead, ...trBody, trTotal], freeze: true, filter: trLast },
    { name: T("Regels", "Lines", "Líneas"), cols: [12, 7, 34, 8, 12, 13, 18, 16], rows: [itHead, ...itBody, itTotal], freeze: true, filter: itLast },
  ].filter(Boolean);
  const bytes = buildXlsx({ sheets, currencySymbol });
  const filename = productReportFilename({ salon, range, lang, ext: "xlsx" });
  return { filename, bytes, totalRevenue: P.totalRevenue, totalQty: P.totalQty, transactions: P.lines.length, items: P.items.length };
}

export function downloadProductReportXlsx(opts) {
  const r = buildProductReportXlsx(opts);
  saveXlsx(r.filename, r.bytes);
  return r;
}
