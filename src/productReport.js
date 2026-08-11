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

const ACCENT = [201, 169, 110]; // #c9a96e
const s = (v) => (v === null || v === undefined ? "" : String(v));

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
  taxLabel = "BTW", taxIdLabel = "BTW-id", taxRate = 0.21, showTax = true,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const money = (n) => currencySymbol + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(moneyLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taxPct = Math.round((Number(taxRate) || 0) * 100);
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
  let totalRevenue = 0, totalQty = 0;

  for (const a of appointments) {
    const items = Array.isArray(a.products) ? a.products : [];
    if (!items.length) continue;
    let rowRevenue = 0, rowQty = 0;
    const names = [];
    for (const it of items) {
      const qty = parseInt(it.qty) || 1;
      const rev = (parseFloat(it.price) || 0) * qty;
      rowRevenue += rev; rowQty += qty;
      names.push(qty > 1 ? `${s(it.name)} ×${qty}` : s(it.name));
      const p = byProduct.get(s(it.name)) || { qty: 0, revenue: 0 };
      p.qty += qty; p.revenue += rev;
      byProduct.set(s(it.name), p);
    }
    const d = byDay.get(a.date) || { qty: 0, revenue: 0 };
    d.qty += rowQty; d.revenue += rowRevenue;
    byDay.set(a.date, d);

    const pm = byPay.get(a.payment_method || "on-arrival") || { count: 0, revenue: 0 };
    pm.count += 1; pm.revenue += rowRevenue;
    byPay.set(a.payment_method || "on-arrival", pm);

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

  const totalNet = showTax ? totalRevenue / (1 + taxRate) : totalRevenue;
  const totalTax = totalRevenue - totalNet;

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
  if (showTax) {
    summary.push([`${T("Excl.", "Excl.", "Sin")} ${taxLabel}`, money(totalNet)]);
    summary.push([`${taxLabel} ${taxPct}%`, money(totalTax)]);
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
          `Bedragen in ${currencySymbol}${showTax ? ` · ${taxLabel} ${taxPct}% (inbegrepen)` : ""}. Alleen productverkoop — behandelingen staan in het omzetrapport.`,
          `Amounts in ${currencySymbol}${showTax ? ` · ${taxLabel} ${taxPct}% (included)` : ""}. Product sales only — treatments are in the revenue report.`,
          `Importes en ${currencySymbol}${showTax ? ` · ${taxLabel} ${taxPct}% (incluido)` : ""}. Solo venta de productos.`
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
  const filename = `${fnSalon}-${T("productverkoop", "product-sales", "venta-productos")}-${range.from || "report"}.pdf`;
  doc.save(filename);

  return { filename, totalRevenue, totalQty, transactions: lines.length };
}
