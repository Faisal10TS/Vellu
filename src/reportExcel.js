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
//   Omzetrapport:   Samenvatting (kop, kerncijfers, belasting per tarief, dan
//                   zoals in de PDF elke afspraak, bedrijfsgegevens, noten) +
//                   Afspraken (dezelfde regels als los blad, om te filteren).
//                   Esther/TTNB (23-09-2026) miste de regels op het eerste blad.
//   Productverkoop: Samenvatting (kerncijfers, per product, betaalwijzen,
//                   belasting per tarief, per dag, transacties — zoals de PDF)
//                   + Per product + Per dag (bij meer dagen) + Transacties (één
//                   regel per bon) + Regels (één per artikel) als eigen bladen
//   Kasboek:        Samenvatting (kerncijfers, per dag, mutaties, contante
//                   betalingen — zoals de PDF) + dezelfde drie als eigen blad
// Bedragen zijn echte getallen met een valutanotatie, datums echte datums,
// totalen SOM-formules met vooraf berekende waarde — zodat een boekhouder er
// meteen mee kan rekenen, sorteren en filteren.

import { buildXlsx, saveXlsx } from "./xlsx.js";
import { revenueReportData, productReportData, cashbookData, cashFlowOf, payLabel, revenueReportFilename, productReportFilename, cashbookFilename } from "./reportData.js";

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
// Zonder regels geen SOM-formule (SUM(H3:H2) zou de totaalregel zelf raken).
const sumOr = (col, first, last, v, kind = "money") => (last >= first
  ? sum(col, first, last, true, kind === "int" ? "intTotal" : "moneyTotal")(v)
  : (kind === "int" ? int(v, true) : money(v, true)));
// Tabel op een samenvattingsblad: vette kop, kopregel, regels, totaalregel
// (functie van eerste/laatste rij, zodat de SOM naar de eigen regels wijst),
// lege regel erna. Blad 1 hoort net zo volledig te zijn als de PDF — een
// klant kijkt niet verder dan het eerste blad (Esther/TTNB, 23-09-2026).
const addTable = (rows, title, head, body, totalFn) => {
  rows.push([{ v: title, s: "bold" }], head);
  const first = rows.length + 1;
  for (const r of body) rows.push(r);
  if (totalFn) rows.push(totalFn(first, rows.length));
  rows.push([]);
};

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
  // ── afsprakentabel: op blad 1 onder de kerncijfers, zoals in de PDF
  //    (Esther/TTNB, 23-09-2026: "in jouw excel staat alleen het totaal"), én
  //    als eigen blad om te sorteren en filteren. Met belasting erbij per regel
  //    netto en belasting in volle precisie (zie reportData.rows). ──
  const head = H(T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Klant", "Client", "Cliente"), T("Behandeling", "Service", "Servicio"), T("Medewerker", "Staff", "Personal"), T("Betaalwijze", "Payment", "Pago"), T("Factuurnr.", "Invoice no.", "N.º factura"), T("Bedrag", "Amount", "Importe"),
    ...(showTaxRows ? [T(`Netto (excl. ${label})`, `Net (excl. ${label})`, `Neto (excl. ${label})`), label] : []));
  const rowOf = (r) => {
    const a = r.appt;
    return [date(a.date), s(a.time), s(a.client_name), s(a.service_name), s(a.staff_name), a.payment_method ? payLabel(a.payment_method, lang) : "", s(a.invoice_number), money(r.gross),
      ...(showTaxRows ? [{ v: r.net, s: "money" }, { v: r.tax, s: "money" }] : [])];
  };
  // Zonder regels geen SOM-formule (SUM(H3:H2) zou de totaalregel zelf raken).
  const sumOrValue = (col, first, last, v) => (last >= first ? sum(col, first, last)(v) : money(v, true));
  const totalRow = (first, last) => [null, null, null, { v: T("Totaal", "Total", "Total"), s: "textTotal" }, null, null, null, sumOrValue("H", first, last, R.totalGross),
    ...(showTaxRows ? [sumOrValue("I", first, last, R.totalNet), sumOrValue("J", first, last, R.totalBtw)] : [])];
  sum1.push([{ v: T("Afspraken", "Appointments", "Citas"), s: "bold" }], head);
  const firstS = sum1.length + 1;
  for (const r of R.rows) sum1.push(rowOf(r));
  sum1.push(totalRow(firstS, sum1.length), []);

  sum1.push(...companyRows(salon, idLabel, T), []);
  const ratesNote = showTaxRows ? ` · ${label} ${R.byRate.map((r) => pctLabel(r.rate, moneyLocale)).join(" / ")}` : "";
  sum1.push(...noteRows([
    T("Belastingbedragen zijn berekend op basis van de instellingen van deze salon. Vellu geeft geen fiscaal advies.",
      "Tax amounts are calculated from this salon's settings. Vellu does not provide tax advice.",
      "Los importes de impuestos se calculan según la configuración de este salón. Vellu no ofrece asesoramiento fiscal."),
    T(`Bedragen in ${currencySymbol}${ratesNote}, belasting inbegrepen. Bij een regiowijziging worden eerdere bedragen niet omgerekend.`,
      `Amounts in ${currencySymbol}${ratesNote}, tax included. After a region change, earlier amounts are not converted.`,
      `Importes en ${currencySymbol}${ratesNote}, impuestos incluidos. Tras un cambio de región, los importes anteriores no se convierten.`),
    showTaxRows ? T(`Netto en ${label} per afspraak zijn niet afgerond; opgeteld komen ze daardoor precies uit op de kerncijfers.`,
      `Net and ${label} per appointment are not rounded, so their sums match the key figures exactly.`,
      `El neto y el ${label} por cita no están redondeados; sumados coinciden exactamente con las cifras clave.`) : null,
    `${T("Gegenereerd op", "Generated on", "Generado el")} ${new Date().toLocaleDateString(genLocale(lang))} · vellu.cc`,
  ]));

  // ── blad 2: afspraken (zelfde regels, bevroren kop + filter) ──
  const body = R.rows.map(rowOf);
  const lastRow = body.length + 1;
  const sheets = [
    { name: T("Samenvatting", "Summary", "Resumen"), cols: [24, 14, 24, 40, 18, 16, 14, 13, 13, 12], rows: sum1 },
    { name: T("Afspraken", "Appointments", "Citas"), cols: [12, 7, 24, 34, 18, 16, 14, 13, 13, 12], rows: [head, ...body, totalRow(2, lastRow)], freeze: true, filter: Math.max(1, lastRow) },
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

  // ── tabellen: op blad 1 in de volgorde van de PDF (per product,
  //    betaalwijzen, belasting, per dag, transacties) én als eigen bladen om
  //    te sorteren en filteren (Faisal 23-09-2026: "doe dat ook voor de kassa").
  //    Regels (één per artikel) staat niet in de PDF en blijft een eigen blad.
  //    De totaalregels zijn functies van (eerste, laatste) rij, zodat de
  //    SOM-formules op elk blad naar de juiste regels wijzen. ──
  const prodHead = H(T("Product", "Product", "Producto"), T("Aantal", "Qty", "Cantidad"), T("Omzet", "Revenue", "Ingresos"));
  const prodBody = P.products.map((p) => [p.name, int(p.qty), money(p.revenue)]);
  const prodTotal = (first, last) => [{ v: T("Totaal", "Total", "Total"), s: "textTotal" }, sumOr("B", first, last, P.totalQty, "int"), sumOr("C", first, last, P.totalRevenue)];

  const dayHead = H(T("Dag", "Day", "Día"), T("Aantal", "Qty", "Cantidad"), T("Omzet", "Revenue", "Ingresos"));
  const dayBody = P.days.map((d) => [date(d.date), int(d.qty), money(d.revenue)]);
  const dayTotal = (first, last) => [{ v: T("Totaal", "Total", "Total"), s: "textTotal" }, sumOr("B", first, last, P.totalQty, "int"), sumOr("C", first, last, P.totalRevenue)];

  const trHead = H(T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Verkocht", "Sold", "Vendido"), T("Medewerker", "Staff", "Personal"), T("Betaald", "Paid", "Pagado"), T("Soort", "Type", "Tipo"), T("Bedrag", "Amount", "Importe"));
  const trBody = P.lines.map((l) => [date(l.date), l.time, l.what, l.staff, l.pay, l.isSale ? T("Kassa", "Till", "Caja") : T("Bij afspraak", "With appointment", "Con cita"), money(l.amount)]);
  const trTotal = (first, last) => [null, null, null, null, null, { v: T("Totaal", "Total", "Total"), s: "textTotal" }, sumOr("G", first, last, P.totalRevenue)];

  const itHead = H(T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Product", "Product", "Producto"), T("Aantal", "Qty", "Cantidad"), T("Stukprijs", "Unit price", "Precio unitario"), T("Bedrag", "Amount", "Importe"), T("Medewerker", "Staff", "Personal"), T("Betaald", "Paid", "Pagado"));
  const itBody = P.items.map((i) => [date(i.date), i.time, i.kind === "voucher" ? `${i.name} (${T("kadobon ingewisseld", "gift card redeemed", "tarjeta regalo canjeada")})` : i.kind === "voucher_issue" ? `${i.name} (${T("kadobon verkocht", "gift card sold", "tarjeta regalo vendida")})` : i.name, int(i.qty), money(i.price), money(i.amount), i.staff, i.pay]);
  const itTotal = (first, last) => [null, null, null, null, { v: T("Totaal", "Total", "Total"), s: "textTotal" }, sumOr("F", first, last, P.totalRevenue), null, null];

  // ── blad 1: samenvatting, net zo volledig als de PDF ──
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
  addTable(sum1, T("Per product", "By product", "Por producto"), prodHead, prodBody, prodTotal);
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
  if (P.days.length > 1) addTable(sum1, T("Per dag", "By day", "Por día"), dayHead, dayBody, dayTotal);
  addTable(sum1, T("Transacties", "Transactions", "Transacciones"), trHead, trBody, trTotal);
  sum1.push(...companyRows(salon, cfg.idLabel || taxIdLabel, T), []);
  sum1.push(...noteRows([
    T(`Bedragen in ${currencySymbol}, inclusief belasting. Alleen productverkoop — behandelingen staan in het omzetrapport. Belastingbedragen volgen uit de instellingen van deze salon; Vellu geeft geen fiscaal advies.`,
      `Amounts in ${currencySymbol}, tax included. Product sales only — treatments are in the revenue report. Tax amounts follow this salon's settings; Vellu does not provide tax advice.`,
      `Importes en ${currencySymbol}, impuestos incluidos. Solo venta de productos. Los importes de impuestos siguen la configuración de este salón; Vellu no ofrece asesoramiento fiscal.`),
    `${T("Gegenereerd op", "Generated on", "Generado el")} ${new Date().toLocaleDateString(genLocale(lang))} · vellu.cc`,
  ]));

  // ── eigen bladen: dezelfde tabellen, met bevroren kopregel en filter ──
  const sheets = [
    { name: T("Samenvatting", "Summary", "Resumen"), cols: [30, 14, 44, 18, 16, 14, 13], rows: sum1 },
    { name: T("Per product", "By product", "Por producto"), cols: [34, 10, 14], rows: [prodHead, ...prodBody, prodTotal(2, prodBody.length + 1)], freeze: true, filter: prodBody.length + 1 },
    P.days.length > 1 ? { name: T("Per dag", "By day", "Por día"), cols: [14, 10, 14], rows: [dayHead, ...dayBody, dayTotal(2, dayBody.length + 1)], freeze: true, filter: dayBody.length + 1 } : null,
    { name: T("Transacties", "Transactions", "Transacciones"), cols: [12, 7, 44, 18, 16, 14, 13], rows: [trHead, ...trBody, trTotal(2, trBody.length + 1)], freeze: true, filter: trBody.length + 1 },
    { name: T("Regels", "Lines", "Líneas"), cols: [12, 7, 34, 8, 12, 13, 18, 16], rows: [itHead, ...itBody, itTotal(2, itBody.length + 1)], freeze: true, filter: itBody.length + 1 },
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

// ── Kasboek ──────────────────────────────────────────────────────────────
// Samenvatting + Per dag + Mutaties + Contante betalingen. Zelfde rekenlaag
// als het scherm en de PDF (cashbookData).
export function buildCashbookXlsx({ salon, movements, cashRows, range, lang = "nl", currencySymbol = "€" }) {
  const T = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);
  const D = cashbookData({ movements, cashRows, from: range.from, to: range.to });
  const KIND = { open: T("Beginsaldo", "Opening float", "Saldo inicial"), in: T("Kas in", "Cash in", "Entrada"), out: T("Kas uit", "Cash out", "Salida"), count: T("Telling", "Count", "Recuento") };
  const tijd = (iso) => { try { return new Date(iso).toLocaleTimeString(genLocale(lang), { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  // ── tabellen: op blad 1 zoals in de PDF (per dag, mutaties, contante
  //    betalingen) én als eigen bladen om te sorteren en filteren (Faisal
  //    23-09-2026). Totaalregels als functie van (eerste, laatste) rij. ──
  const dayHead = H(T("Dag", "Day", "Día"), T("Beginsaldo", "Opening float", "Saldo inicial"), T("Contant ontvangen", "Cash received", "Efectivo recibido"), T("Wisselgeld", "Change", "Cambio"), T("Contant verkocht (netto)", "Cash sales (net)", "Ventas (neto)"), T("Stortingen (kas in)", "Deposits (cash in)", "Depósitos"), T("Opnames (kas uit)", "Withdrawals (cash out)", "Retiradas"), T("Verwacht in kas", "Expected", "Esperado"), T("Geteld", "Counted", "Contado"), T("Verschil", "Difference", "Diferencia"), T("Opmerking", "Note", "Nota"));
  const dayBody = D.days.map((d) => [date(d.date), d.opening === null ? "" : money(d.opening), money(d.received), money(d.change), money(d.sales), money(d.cashIn), money(d.cashOut), money(d.expected), d.counted === null ? "" : money(d.counted), d.diff === null ? "" : money(d.diff), d.note]);
  const dayTotal = (first, last) => [{ v: T("Totaal", "Total", "Total"), s: "textTotal" }, null, sumOr("C", first, last, D.totals.received), sumOr("D", first, last, D.totals.change), sumOr("E", first, last, D.totals.sales), sumOr("F", first, last, D.totals.cashIn), sumOr("G", first, last, D.totals.cashOut), null, null, sumOr("J", first, last, D.totals.diff), null];

  const mvHead = H(T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Soort", "Type", "Tipo"), T("Reden / opmerking", "Reason / note", "Motivo / nota"), T("Bedrag", "Amount", "Importe"), T("Verwacht bij telling", "Expected at count", "Esperado al contar"), T("Verschil", "Difference", "Diferencia"));
  const mvBody = D.movements.map((m) => {
    const amt = parseFloat(m.amount) || 0;
    const diff = m.kind === "count" ? round2(amt - (parseFloat(m.expected) || 0)) : null;
    return [date(m.date), tijd(m.created_at), KIND[m.kind] || m.kind, s(m.reason), money(m.kind === "out" ? -amt : amt), m.kind === "count" && m.expected != null ? money(m.expected) : "", diff === null ? "" : money(diff)];
  });

  const csHead = H(T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Klant", "Client", "Cliente"), T("Omschrijving", "Description", "Descripción"), T("Medewerker", "Staff", "Personal"), T("Ontvangen", "Received", "Recibido"), T("Wisselgeld", "Change", "Cambio"), T("Bedrag", "Amount", "Importe"));
  const csBody = D.cashRows.map((a) => { const f = cashFlowOf(a); return [date(a.date), s(a.time), s(a.client_name), s(a.service_name), s(a.staff_name).split(",")[0].trim(), money(f.received), money(f.change), money(f.net)]; });
  const csTotal = (first, last) => [null, null, null, null, { v: T("Totaal", "Total", "Total"), s: "textTotal" }, sumOr("F", first, last, D.totals.received), sumOr("G", first, last, D.totals.change), sumOr("H", first, last, D.totals.sales)];

  // ── blad 1: samenvatting, net zo volledig als de PDF ──
  const sum1 = [
    [{ v: T("Kasboek", "Cash book", "Libro de caja"), s: "title" }],
    [{ v: s(salon.business_name || salon.name), s: "bold" }],
    [T("Periode", "Period", "Período"), range.label || `${range.from} — ${range.to}`],
    [T("Van", "From", "Desde"), date(range.from)],
    [T("Tot en met", "To", "Hasta"), date(range.to)],
    [],
    [{ v: T("Kerncijfers", "Key figures", "Cifras clave"), s: "bold" }],
    [T("Contant ontvangen (kas in uit verkopen)", "Cash received (cash in from sales)", "Efectivo recibido (entrada por ventas)"), money(D.totals.received)],
    [T("Wisselgeld teruggegeven (kas uit)", "Change given back (cash out)", "Cambio devuelto (salida)"), money(D.totals.change)],
    [T("Contant verkocht (netto)", "Cash sales (net)", "Ventas en efectivo (neto)"), money(D.totals.sales)],
    [T("Contante betalingen", "Cash payments", "Pagos en efectivo"), int(D.totals.salesCount)],
    [T("Stortingen (kas in)", "Deposits (cash in)", "Depósitos (entrada)"), money(D.totals.cashIn)],
    [T("Opnames (kas uit)", "Withdrawals (cash out)", "Retiradas (salida)"), money(D.totals.cashOut)],
    [T("Kasverschil (alle tellingen)", "Difference (all counts)", "Diferencia (todos los recuentos)"), D.totals.daysCounted ? money(D.totals.diff) : "—"],
    [T("Dagen met kasverkeer", "Days with cash activity", "Días con movimientos"), int(D.totals.days)],
    [T("Dagen geteld", "Days counted", "Días contados"), int(D.totals.daysCounted)],
    [],
  ];
  addTable(sum1, T("Per dag", "By day", "Por día"), dayHead, dayBody, dayTotal);
  addTable(sum1, T("Mutaties", "Movements", "Movimientos"), mvHead, mvBody, null);
  addTable(sum1, T("Contante betalingen", "Cash payments", "Pagos en efectivo"), csHead, csBody, csTotal);
  sum1.push(...companyRows(salon, salon.tax_id_label || "BTW-id", T), []);
  sum1.push(...noteRows([
    T("Verwacht in kas = beginsaldo + contant ontvangen − wisselgeld + stortingen − opnames. Kasverschil = geteld − verwacht op het moment van tellen.",
      "Expected in drawer = opening float + cash received − change + deposits − withdrawals. Difference = counted − expected at the time of counting.",
      "Esperado en caja = saldo inicial + efectivo recibido − cambio + depósitos − retiradas. Diferencia = contado − esperado en el momento del recuento."),
    T(`Bedragen in ${currencySymbol}. Contant ontvangen = wat de klant gaf (kassaverkopen én contant afgerekende behandelingen); wisselgeld = wat er terugging; contant verkocht (netto) = het verschil.`, `Amounts in ${currencySymbol}. Cash received = what the client handed over (till sales and treatments paid in cash); change = what went back; cash sales (net) = the difference.`, `Importes en ${currencySymbol}. Efectivo recibido = lo que entregó el cliente (ventas de caja y tratamientos en efectivo); cambio = lo devuelto; ventas en efectivo (neto) = la diferencia.`),
    `${T("Gegenereerd op", "Generated on", "Generado el")} ${new Date().toLocaleDateString(genLocale(lang))} · vellu.cc`,
  ]));

  // ── eigen bladen: dezelfde tabellen, met bevroren kopregel en filter ──
  const sheets = [
    { name: T("Samenvatting", "Summary", "Resumen"), cols: [34, 14, 24, 40, 18, 18, 15, 15, 12, 12, 30], rows: sum1 },
    { name: T("Per dag", "By day", "Por día"), cols: [12, 13, 16, 12, 18, 15, 15, 15, 12, 12, 30], rows: [dayHead, ...dayBody, dayTotal(2, dayBody.length + 1)], freeze: true, filter: dayBody.length + 1 },
    { name: T("Mutaties", "Movements", "Movimientos"), cols: [12, 7, 14, 36, 13, 18, 12], rows: [mvHead, ...mvBody], freeze: true, filter: Math.max(1, mvBody.length + 1) },
    { name: T("Contante betalingen", "Cash payments", "Pagos en efectivo"), cols: [12, 7, 24, 40, 18, 13, 12, 13], rows: [csHead, ...csBody, csTotal(2, csBody.length + 1)], freeze: true, filter: csBody.length + 1 },
  ];
  const bytes = buildXlsx({ sheets, currencySymbol });
  const filename = cashbookFilename({ salon, range, lang, ext: "xlsx" });
  return { filename, bytes, days: D.totals.days, movements: D.movements.length, cashPayments: D.cashRows.length, totals: D.totals };
}

export function downloadCashbookXlsx(opts) {
  const r = buildCashbookXlsx(opts);
  saveXlsx(r.filename, r.bytes);
  return r;
}
