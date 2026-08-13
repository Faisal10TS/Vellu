// src/productReport.js
//
// PDF report of RETAIL PRODUCT sales — the counterpart of revenueReport.js
// (treatments). Salons need this for two very practical reasons:
//   1. cash-up at the end of the day: what was sold, and how was it paid?
//   2. the monthly hand-off to their bookkeeper.
//
// Lazy-loaded on first use so jsPDF (~400KB) never lands in the dashboard
// bundle — same pattern as revenueReport.js.
//
// Input is the appointment rows that carry a `products` array: kassa sales
// (is_sale) AND products rung up on a normal appointment. Both are product
// revenue, so both belong here.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { computeTax, linesFromSale, taxForSale } from "./taxEngine.js";

const ACCENT = [201, 169, 110]; // #c9a96e
const s = (v) => (v === null || v === undefined ? "" : String(v));
// 6 in plaats van 6.0, maar 8.5 blijft 8.5 \u2014 tarieven zijn niet altijd rond.
const fmtPct = (r) => String(Math.round((Number(r) || 0) * 100) / 100);

const MONTHS = {
  nl: ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
};
const fmtDate = (iso, lang = "nl") => {
  try {
    const [y, m, d] = String(iso).split("-").map(Number);
    const mo = (MONTHS[lang] || MONTHS.nl)[m - 1];
    return lang === "en" ? `${mo} ${d}, ${y}` : `${d} ${mo} ${y}`;
  } catch { return s(iso); }
};

// Payment labels — the kassa stores "pin" / "cash" / "online" (pay request).
// Older rows carry "on-arrival"; show that as "in de salon".
const PAY_LABEL = {
  nl: { pin: "Pin", cash: "Contant", online: "Betaalverzoek", "on-arrival": "In de salon" },
  en: { pin: "Card", cash: "Cash", online: "Payment request", "on-arrival": "In salon" },
  es: { pin: "Tarjeta", cash: "Efectivo", online: "Solicitud de pago", "on-arrival": "En el salón" },
};

/**
 * @param {object}   o
 * @param {object}   o.salon         profile-ish object (business_name, address, kvk_number, btw_id, ...)
 * @param {Array}    o.appointments  rows with a non-empty `products` array, already filtered to the range
 * @param {object}   o.range         { from, to, label }
 * @param {string}   o.lang          nl | en | es
 * @param {string}   o.currencySymbol
 * @param {string}   o.moneyLocale
 * @param {string}   o.taxLabel      "BTW" / "ABB" / "VAT"
 * @param {string}   o.taxIdLabel
 * @param {number}   o.taxRate       0.21 etc (prices are tax-INCLUSIVE)
 * @param {boolean}  o.showTax
 */
export function generateProductReportPDF({
  salon, appointments, range, lang = "nl",
  currencySymbol = "€", moneyLocale = "nl-NL",
  taxIdLabel = "BTW-id", taxCfg = null,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const money = (n) => currencySymbol + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(moneyLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cfg = taxCfg || {};
  const taxLabel = cfg.label || "BTW";
  // Dit is een INTERN stuk voor de eigenaar en zijn boekhouder. Op Aruba mag
  // het belastingbedrag niet op een klantfactuur, maar hier hoort het juist
  // wel te staan \u2014 vandaar showTaxInternal en niet showTax.
  const showTax = !!cfg.showTaxInternal;
  const payLabel = (pm) => (PAY_LABEL[lang] || PAY_LABEL.nl)[pm] || (PAY_LABEL[lang] || PAY_LABEL.nl)["on-arrival"];

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  const T = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);

  // ── Aggregate ────────────────────────────────────────────────────────
  // Per product, per day and per payment method in ONE pass over the rows.
  const byProduct = new Map();   // name -> { qty, revenue }
  const byDay = new Map();       // date -> { qty, revenue }
  const byPay = new Map();       // payment_method -> { count, revenue }
  const lines = [];              // flat transaction lines for the detail table
  // Grondslag per tarief. Nodig omdat \u00e9\u00e9n periode meerdere tarieven kan
  // bevatten: op de BES-eilanden is een behandeling belast en een doorverkocht
  // product niet, en in NL kan een salon 9% op diensten en 21% op producten
  // hanteren. Een enkel percentage over het totaal klopt dan nooit.
  const byRate = new Map();      // tarief -> grondslag in centen
  let totalRevenue = 0, totalQty = 0;

  for (const a of appointments) {
    const items = Array.isArray(a.products) ? a.products : [];
    if (!items.length) continue;
    let rowRevenue = 0, rowQty = 0;
    const names = [];
    for (const it of items) {
      const qty = parseInt(it.qty) || 1;
      const rev = (parseFloat(it.price) || 0) * qty;
      // Een ingewisselde kadobon is een negatieve regel: die hoort wel in het
      // geld (er kwam minder binnen) maar is geen verkocht stuk.
      const counts = rev >= 0 && it.kind !== "voucher_redeem";
      rowRevenue += rev; rowQty += counts ? qty : 0;
      names.push(qty > 1 ? `${s(it.name)} ×${qty}` : s(it.name));
      const p = byProduct.get(s(it.name)) || { qty: 0, revenue: 0 };
      p.qty += counts ? qty : 0; p.revenue += rev;
      byProduct.set(s(it.name), p);
    }
    const d = byDay.get(a.date) || { qty: 0, revenue: 0 };
    d.qty += rowQty; d.revenue += rowRevenue;
    byDay.set(a.date, d);

    const pm = byPay.get(a.payment_method || "on-arrival") || { count: 0, revenue: 0 };
    pm.count += 1; pm.revenue += rowRevenue;
    byPay.set(a.payment_method || "on-arrival", pm);

    // Belasting over de PRODUCTregels van deze rij. De motor weet zelf welke
    // regels belast zijn; een ingewisselde kadobon is een betaalmiddel en telt
    // niet mee in de grondslag.
    {
      const t = computeTax(items.map((it) => {
        const q = parseInt(it.qty) || 1;
        return {
          kind: it.kind === "voucher_redeem" ? "voucher"
            : (it.kind === "voucher_sale" || it.id === "giftcard") ? "voucher_issue"
            : "product",
          name: s(it.name), qty: q, gross: (parseFloat(it.price) || 0) * q,
        };
      }), cfg);
      for (const r of t.byRate) byRate.set(r.rate, (byRate.get(r.rate) || 0) + Math.round(r.gross * 100));
    }
    totalRevenue += rowRevenue; totalQty += rowQty;
    lines.push({
      date: a.date, time: a.time || "",
      what: names.join(", "),
      staff: s(a.staff_name || "").split(",")[0].trim(),
      pay: payLabel(a.payment_method),
      amount: rowRevenue,
      isSale: a.is_sale === true,
    });
  }
  lines.sort((x, y) => (`${x.date} ${x.time}`).localeCompare(`${y.date} ${y.time}`));

  // Afronden op rapportniveau per tarief, zodat netto + belasting exact
  // optellen tot de grondslag \u2014 nooit per regel afronden en dan sommeren.
  const rateRows = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, grossC]) => {
    const netC = Math.round(grossC / (1 + rate / 100));
    return { rate, gross: grossC / 100, net: netC / 100, tax: (grossC - netC) / 100 };
  });
  const taxableGross = rateRows.reduce((n, r) => n + r.gross, 0);
  const totalTax = rateRows.reduce((n, r) => n + r.tax, 0);
  const totalNet = totalRevenue - totalTax;

  // ── Header ───────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(26, 23, 20);
  doc.text(T("Productverkoop", "Product sales", "Venta de productos"), margin, 60);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text(range.label || `${fmtDate(range.from, lang)} — ${fmtDate(range.to, lang)}`, margin, 78);

  doc.setFontSize(10);
  doc.setTextColor(...ACCENT);
  doc.text("vellu", pageW - margin, 60, { align: "right" });
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(pageW - margin - 30, 66, pageW - margin, 66);

  // ── Company block ────────────────────────────────────────────────────
  let y = 110;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(26, 23, 20);
  doc.text(s(salon.business_name || salon.name), pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  for (const line of [
    s(salon.address),
    salon.kvk_number ? `KVK: ${s(salon.kvk_number)}` : "",
    salon.btw_id ? `${taxIdLabel}: ${s(salon.btw_id)}` : "",
    s(salon.salon_email),
  ].filter(Boolean)) {
    y += 12;
    doc.text(line, pageW - margin, y, { align: "right" });
  }

  // ── Summary ──────────────────────────────────────────────────────────
  y = Math.max(y + 34, 200);
  doc.setDrawColor(230, 230, 230);
  doc.line(margin, y - 14, pageW - margin, y - 14);

  const summary = [
    [T("Producten verkocht", "Products sold", "Productos vendidos"), String(totalQty)],
    [T("Transacties", "Transactions", "Transacciones"), String(lines.length)],
    [T("Omzet", "Revenue", "Ingresos"), money(totalRevenue)],
  ];
  // Maximaal vier tegels: de kolombreedte is (paginabreedte / aantal) en bij
  // vijf tegels lopen de bedragen in elkaar. De uitsplitsing per tarief staat
  // in de tabel eronder.
  if (showTax && rateRows.length > 0) {
    summary.push([`${T("Excl.", "Excl.", "Sin")} ${taxLabel}`, money(totalNet)]);
  }
  let sx = margin;
  const colW = (pageW - margin * 2) / summary.length;
  for (const [label, value] of summary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(String(label).toUpperCase(), sx, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(26, 23, 20);
    doc.text(String(value), sx, y + 18);
    sx += colW;
  }
  y += 44;

  const tableTheme = {
    theme: "grid",
    headStyles: { fillColor: [250, 248, 245], textColor: [120, 110, 100], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [60, 60, 60] },
    footStyles: { fillColor: [245, 243, 239], textColor: [26, 23, 20], fontStyle: "bold", fontSize: 10 },
    margin: { left: margin, right: margin },
  };

  // ── Per product ──────────────────────────────────────────────────────
  const productRows = [...byProduct.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([name, v]) => [name, String(v.qty), money(v.revenue)]);
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [[T("Product", "Product", "Producto"), T("Aantal", "Qty", "Cantidad"), T("Omzet", "Revenue", "Ingresos")]],
    body: productRows.length ? productRows : [[T("Geen verkopen in deze periode", "No sales in this period", "Sin ventas en este período"), "", ""]],
    foot: productRows.length ? [[T("Totaal", "Total", "Total"), String(totalQty), money(totalRevenue)]] : undefined,
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });

  // ── Payment split (cash-up) ──────────────────────────────────────────
  const payRows = [...byPay.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([pm, v]) => [payLabel(pm), String(v.count), money(v.revenue)]);
  if (payRows.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: doc.lastAutoTable.finalY + 22,
      head: [[T("Betaalwijze", "Payment method", "Método de pago"), T("Transacties", "Transactions", "Transacciones"), T("Bedrag", "Amount", "Importe")]],
      body: payRows,
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
  }

  // ── Belasting per tarief ──────────────────────────────────
  // Als tabel en niet als tegel, want de grondslag verschilt per tarief. Voor
  // een salon op de BES-eilanden staat hier vaak niets: doorverkochte producten
  // zijn daar onbelast. Dat is de juiste uitkomst, geen ontbrekend blok.
  if (showTax && rateRows.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: doc.lastAutoTable.finalY + 22,
      head: [[T("Tarief", "Rate", "Tipo"), T("Grondslag", "Taxable amount", "Base imponible"), T("Excl.", "Excl.", "Sin"), taxLabel]],
      body: rateRows.map((r) => [`${fmtPct(r.rate)}%`, money(r.gross), money(r.net), money(r.tax)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      foot: rateRows.length > 1
        ? [[T("Totaal", "Total", "Total"), money(taxableGross), money(taxableGross - totalTax), money(totalTax)]]
        : undefined,
    });
    // Onbelaste omzet expliciet benoemen, anders lijkt het rapport een fout te
    // maken: de omzet is hoger dan de grondslag.
    const untaxed = Math.round((totalRevenue - taxableGross) * 100) / 100;
    if (untaxed > 0.005) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        T(`Niet belast: ${money(untaxed)} — doorverkoop van producten is hier niet ${taxLabel}-plichtig.`,
          `Untaxed: ${money(untaxed)} — reselling products is not subject to ${taxLabel} here.`,
          `Sin impuesto: ${money(untaxed)} — la reventa de productos no est\u00e1 sujeta a ${taxLabel} aqu\u00ed.`),
        margin, doc.lastAutoTable.finalY + 13,
      );
      doc.lastAutoTable.finalY += 13;
    }
  }

  // ── Per day (only useful for multi-day ranges) ───────────────────────
  if (byDay.size > 1) {
    const dayRows = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => [fmtDate(date, lang), String(v.qty), money(v.revenue)]);
    autoTable(doc, {
      ...tableTheme,
      startY: doc.lastAutoTable.finalY + 22,
      head: [[T("Dag", "Day", "Día"), T("Aantal", "Qty", "Cantidad"), T("Omzet", "Revenue", "Ingresos")]],
      body: dayRows,
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
  }

  // ── Transactions ─────────────────────────────────────────────────────
  autoTable(doc, {
    ...tableTheme,
    startY: doc.lastAutoTable.finalY + 22,
    head: [[
      T("Datum", "Date", "Fecha"),
      T("Tijd", "Time", "Hora"),
      T("Verkocht", "Sold", "Vendido"),
      T("Medewerker", "Staff", "Personal"),
      T("Betaald", "Paid", "Pagado"),
      T("Bedrag", "Amount", "Importe"),
    ]],
    body: lines.length
      ? lines.map((l) => [fmtDate(l.date, lang), l.time, l.what, l.staff, l.pay, money(l.amount)])
      : [["", "", T("Geen verkopen in deze periode", "No sales in this period", "Sin ventas en este período"), "", "", ""]],
    foot: lines.length ? [["", "", "", "", T("Totaal", "Total", "Total"), money(totalRevenue)]] : undefined,
    columnStyles: { 5: { halign: "right", fontStyle: "bold" }, 2: { cellWidth: 150 } },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(
        T(
          `Bedragen in ${currencySymbol}, inclusief belasting. Alleen productverkoop — behandelingen staan in het omzetrapport. Belastingbedragen volgen uit de instellingen van deze salon; Vellu geeft geen fiscaal advies.`,
          `Amounts in ${currencySymbol}, tax included. Product sales only — treatments are in the revenue report. Tax amounts follow this salon\u2019s settings; Vellu does not provide tax advice.`,
          `Importes en ${currencySymbol}, impuestos incluidos. Solo venta de productos. Los importes de impuestos siguen la configuraci\u00f3n de este sal\u00f3n; Vellu no ofrece asesoramiento fiscal.`
        ),
        margin, pageH - 32
      );
      doc.text(
        `${T("Gegenereerd op", "Generated on", "Generado el")} ${new Date().toLocaleDateString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB")}`,
        margin, pageH - 20
      );
      doc.text(
        `${doc.internal.getCurrentPageInfo().pageNumber} / ${doc.internal.getNumberOfPages()}`,
        pageW - margin, pageH - 20, { align: "right" }
      );
    },
  });

  const fnSalon = s(salon.business_name || salon.name || "vellu").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 40);
  // Naam naar de PERIODE, niet naar de begindatum: een jaarrapport heette
  // anders "...-2026-01-01.pdf" en botste met het dagrapport van diezelfde
  // 1 januari. Nu wordt het 2026 / 2026-08 / 2026-08-12.
  const span = range.from === range.to ? s(range.from)
    : s(range.from).slice(0, 4) === s(range.to).slice(0, 4) && s(range.from).endsWith("-01-01") ? s(range.from).slice(0, 4)
    : s(range.from).slice(0, 7) === s(range.to).slice(0, 7) ? s(range.from).slice(0, 7)
    : `${s(range.from)}_${s(range.to)}`;
  const filename = `${fnSalon}-${T("productverkoop", "product-sales", "venta-productos")}-${span || "report"}.pdf`;
  doc.save(filename);

  return { filename, totalRevenue, totalQty, transactions: lines.length };
}


/**
 * Kassabon (bonnetje) voor één verkoop — bonrol-formaat (80 mm), hoogte groeit
 * mee met het aantal regels. Dit is wat de klant meekrijgt als er geen
 * e-mailadres is: wat is er gekocht, wat is er betaald en hoe.
 *
 * @param {object} o
 * @param {object} o.salon  profiel (business_name, address, kvk_number, btw_id, slug)
 * @param {object} o.sale   de appointments-rij van de verkoop (products, service_price, ...)
 */
export function generateReceiptPDF({
  salon, sale, lang = "nl",
  currencySymbol = "\u20ac", moneyLocale = "nl-NL",
  taxIdLabel = "BTW-id", taxCfg = null, receiptNumber = null,
  output = "save",
}) {
  const T = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);
  const money = (n) => currencySymbol + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(moneyLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const payLabel = (pm) => (PAY_LABEL[lang] || PAY_LABEL.nl)[pm] || (PAY_LABEL[lang] || PAY_LABEL.nl)["on-arrival"];

  const W = 226;      // 80 mm in pt
  const m = 14;
  const nameW = 134;

  // De belastingmotor levert zowel de regels als de groepering per tarief. Hij
  // weet dat een doorverkocht product op de BES-eilanden onbelast is en dat een
  // kadobon een betaalmiddel is en geen korting \u2014 twee dingen die deze bon
  // eerder fout deed. Een bevroren snapshot wint van de huidige instellingen,
  // zodat het herdrukken van een oude bon niet meebeweegt met een tariefwijziging.
  const tax = taxForSale(sale, taxCfg || {});
  const taxLabel = tax.label || "BTW";
  const items = tax.lines.map((l) => ({
    qty: parseInt(l.qty) || 1,
    name: s(l.name) || T("Behandeling", "Treatment", "Tratamiento"),
    amount: Number(l.gross) || 0,
  }));
  const gross = items.filter((i) => i.amount > 0).reduce((n, i) => n + i.amount, 0);
  const redeemed = items.filter((i) => i.amount < 0).reduce((n, i) => n + Math.abs(i.amount), 0);
  const grandTotal = tax.grandTotal;
  // Blijft leeg op Aruba: daar mag het belastingBEDRAG sinds 1-1-2019 niet
  // apart op een document voor de klant staan.
  const rateRows = tax.showTax ? tax.byRate : [];

  // Eerst meten met een wegwerp-doc, dan pas de bon op maat maken \u2014 anders is
  // een bon met twee producten een halve lege pagina.
  const probe = new jsPDF({ unit: "pt", format: [W, 400] });
  probe.setFont("helvetica", "normal");
  probe.setFontSize(8);
  const wrapped = items.map((it) => probe.splitTextToSize(`${it.qty > 1 ? it.qty + " x " : ""}${it.name}`, nameW));
  const itemLines = wrapped.reduce((n, l) => n + l.length, 0);

  const head = [s(salon.address), s(salon.city), s(salon.phone)].filter(Boolean);
  const ids = [];
  if (salon.kvk_number) ids.push(`KVK ${s(salon.kvk_number)}`);
  if (tax.showTax && salon.btw_id) ids.push(`${taxIdLabel} ${s(salon.btw_id)}`);

  // \u00c9\u00e9n tarief past op \u00e9\u00e9n regel; bij meerdere tarieven komt er een kopregel
  // boven, want "incl. 6% ABB" klopt dan niet meer voor de hele bon.
  const taxBlockLines = rateRows.length === 0 ? 0 : rateRows.length === 1 ? 1 : rateRows.length + 1;

  const H = 22 + 14 + head.length * 10 + (ids.length ? 12 : 0) + 12
    + 11 + (sale.client_name ? 11 : 0) + 10
    + itemLines * 11 + 10
    + (redeemed > 0 ? 22 : 0) + 15 + taxBlockLines * 11 + 10
    + 11 + (sale.payment_method === "online" ? 11 : 0) + (sale.staff_name ? 11 : 0)
    + 14 + 12 + 12 + 16;

  const doc = new jsPDF({ unit: "pt", format: [W, Math.round(H)] });
  let y = 22;

  const centre = (txt, size, style, color, gap) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
    doc.text(txt, W / 2, y, { align: "center" });
    y += gap;
  };
  const pair = (left, right, size, style, color, gap) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
    doc.text(left, m, y);
    doc.text(right, W - m, y, { align: "right" });
    y += gap;
  };
  const rule = () => {
    doc.setDrawColor(205, 205, 205); doc.setLineWidth(0.5);
    doc.line(m, y - 5, W - m, y - 5);
    y += 5;
  };

  // Kop
  centre(s(salon.business_name || salon.name || "Vellu"), 12, "bold", [26, 23, 20], 14);
  for (const h of head) centre(h, 7.5, "normal", [125, 125, 125], 10);
  if (ids.length) centre(ids.join("   "), 7, "normal", [150, 150, 150], 12);
  else y += 2;
  rule();

  // Wanneer + bonnummer
  // Een vereenvoudigde factuur vereist een DOORLOPEND nummer. Rijen van v\u00f3\u00f3r
  // die feature hebben er geen; die vallen terug op de afgekorte id, zodat een
  // herdruk van een oude bon nog steeds herkenbaar is.
  const shortId = String(sale.id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  const docNo = receiptNumber != null ? String(receiptNumber).padStart(5, "0")
    : (sale.receipt_number != null ? String(sale.receipt_number).padStart(5, "0") : shortId);
  pair(`${fmtDate(sale.date, lang)}  ${s(sale.time)}`, `${T("Bon", "Receipt", "Recibo")} ${docNo}`, 7.5, "normal", [125, 125, 125], 11);
  if (sale.client_name) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(125, 125, 125);
    doc.text(s(sale.client_name), m, y); y += 11;
  }
  rule();

  // Regels
  items.forEach((it, idx) => {
    const ls = wrapped[idx];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (it.amount < 0) doc.setTextColor(70, 130, 90); else doc.setTextColor(40, 40, 40);
    ls.forEach((l, k) => {
      doc.text(l, m, y);
      // Negatief bedrag als "-€25,00" en niet als "€-25,00".
      if (k === ls.length - 1) doc.text(it.amount < 0 ? `-${money(Math.abs(it.amount))}` : money(it.amount), W - m, y, { align: "right" });
      y += 11;
    });
  });
  rule();

  // Totalen
  if (redeemed > 0) {
    pair(T("Subtotaal", "Subtotal", "Subtotal"), money(gross), 8, "normal", [125, 125, 125], 11);
    pair(T("Kadobon", "Gift card", "Tarjeta regalo"), `-${money(redeemed)}`, 8, "normal", [70, 130, 90], 11);
  }
  pair(T("TOTAAL", "TOTAL", "TOTAL"), money(grandTotal), 11, "bold", [26, 23, 20], 15);
  // Per tarief, want \u00e9\u00e9n bon kan twee grondslagen hebben: op Bonaire is de
  // behandeling belast en het doorverkochte product niet.
  if (rateRows.length === 1) {
    pair(`${T("Incl.", "Incl.", "Inc.")} ${fmtPct(rateRows[0].rate)}% ${taxLabel}`, money(rateRows[0].tax), 7.5, "normal", [150, 150, 150], 11);
  } else if (rateRows.length > 1) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text(`${T("Waarvan", "Of which", "Del cual")} ${taxLabel}:`, m, y); y += 11;
    for (const r of rateRows) {
      pair(`  ${fmtPct(r.rate)}% ${T("over", "on", "sobre")} ${money(r.gross)}`, money(r.tax), 7, "normal", [150, 150, 150], 11);
    }
  }
  rule();

  // Betaling
  pair(T("Betaald met", "Paid with", "Pagado con"), payLabel(sale.payment_method), 8, "normal", [40, 40, 40], 11);
  if (sale.payment_method === "online") {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(165, 130, 60);
    doc.text(T("Nog te voldoen via het betaalverzoek", "Still to be paid via the payment request", "Pendiente mediante la solicitud de pago"), m, y);
    y += 11;
  }
  if (sale.staff_name) pair(T("Verkocht door", "Sold by", "Vendido por"), String(sale.staff_name).split(",")[0].trim(), 7.5, "normal", [125, 125, 125], 11);
  y += 3;
  rule();

  centre(T("Bedankt en tot ziens!", "Thank you, see you soon!", "\u00a1Gracias, hasta pronto!"), 8, "normal", [125, 125, 125], 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.text(`vellu.cc${salon.slug ? "/" + salon.slug : ""}`, W / 2, y, { align: "center" });

  const filename = `bon-${s(sale.date)}-${shortId || "vellu"}.pdf`;
  if (output === "print") {
    // autoPrint() zet een OpenAction in de PDF: zodra een viewer 'm laadt
    // springt het printvenster open. Via een onzichtbare iframe blijft de kassa
    // gewoon in beeld — geen tabblad dat de balie-medewerker moet wegklikken.
    doc.autoPrint();
    const url = doc.output("bloburl");
    try {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;";
      frame.src = url;
      document.body.appendChild(frame);
      // Ruim opruimen: de blob mag pas weg als het printvenster klaar is.
      setTimeout(() => { try { frame.remove(); URL.revokeObjectURL(url); } catch { /* al opgeruimd */ } }, 120000);
    } catch {
      // Blokkeert de browser de iframe, dan alsnog een tabblad.
      window.open(url, "_blank");
    }
  } else {
    doc.save(filename);
  }
  return { filename, total: grandTotal, redeemed, lines: items.length };
}
