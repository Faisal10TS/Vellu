// src/cashbookReport.js
//
// PDF van het kasboek (Faisal 22-09-2026: "doe de export kasboek ook maar").
// Per dag: beginsaldo, contant verkocht, kas in, kas uit, verwacht, geteld en
// kasverschil; daaronder alle mutaties en de contante betalingen. Zelfde
// rekenlaag als het scherm en de Excel-versie (reportData.cashbookData).
// Lazy geladen, net als de andere jsPDF-rapporten.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cashbookData, cashbookFilename, cashFlowOf } from "./reportData.js";

const ACCENT = [201, 169, 110];
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
const fmtTime = (iso, lang = "nl") => {
  try { return new Date(iso).toLocaleTimeString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};

export function generateCashbookPDF({
  salon, movements, cashRows, range, lang = "nl",
  currencySymbol = "€", moneyLocale = "nl-NL",
  logo = null,
}) {
  const T = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);
  const money = (n) => currencySymbol + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(moneyLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (n) => (n < 0 ? `-${money(-n)}` : n > 0 ? `+${money(n)}` : money(0));
  const KIND = { open: T("Beginsaldo", "Opening float", "Saldo inicial"), in: T("Kas in", "Cash in", "Entrada"), out: T("Kas uit", "Cash out", "Salida"), count: T("Telling", "Count", "Recuento") };
  const D = cashbookData({ movements, cashRows, from: range.from, to: range.to });

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ── Kop ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(26, 23, 20);
  doc.text(T("Kasboek", "Cash book", "Libro de caja"), margin, 60);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(120, 120, 120);
  doc.text(range.label || `${fmtDate(range.from, lang)} — ${fmtDate(range.to, lang)}`, margin, 78);
  if (logo && logo.dataUrl) {
    try {
      const maxW = 120, maxH = 40;
      const ratio = (logo.w || 1) / (logo.h || 1);
      let w = maxW, h = maxW / ratio;
      if (h > maxH) { h = maxH; w = maxH * ratio; }
      doc.addImage(logo.dataUrl, /png/i.test(logo.dataUrl.slice(0, 30)) ? "PNG" : "JPEG", pageW - margin - w, 40, w, h);
    } catch { doc.setFontSize(10); doc.setTextColor(...ACCENT); doc.text("vellu", pageW - margin, 60, { align: "right" }); }
  } else {
    doc.setFontSize(10); doc.setTextColor(...ACCENT); doc.text("vellu", pageW - margin, 60, { align: "right" });
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.5); doc.line(pageW - margin - 30, 66, pageW - margin, 66);
  }
  // Bedrijfsblok
  let y = 110;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(26, 23, 20);
  doc.text(s(salon.business_name || salon.name), pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100); doc.setFontSize(9);
  for (const line of [s(salon.address), [s(salon.postcode), s(salon.city)].filter(Boolean).join(" "), salon.kvk_number ? `KVK: ${s(salon.kvk_number)}` : "", s(salon.salon_email)].filter(Boolean)) {
    y += 12; doc.text(line, pageW - margin, y, { align: "right" });
  }

  // ── Kerncijfers ─────────────────────────────────────────────────────
  y = Math.max(y + 34, 200);
  doc.setDrawColor(230, 230, 230); doc.line(margin, y - 14, pageW - margin, y - 14);
  const summary = [
    [T("Contant ontvangen", "Cash received", "Efectivo recibido"), money(D.totals.received)],
    [T("Wisselgeld terug", "Change given", "Cambio devuelto"), money(D.totals.change)],
    [T("Stortingen", "Deposits", "Depósitos"), money(D.totals.cashIn)],
    [T("Opnames", "Withdrawals", "Retiradas"), money(D.totals.cashOut)],
    [T("Kasverschil", "Difference", "Diferencia"), D.totals.daysCounted ? signed(D.totals.diff) : "—"],
  ];
  let sx = margin;
  const colW = (pageW - margin * 2) / summary.length;
  for (const [label, value] of summary) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(String(label).toUpperCase(), sx, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(26, 23, 20);
    doc.text(String(value), sx, y + 18);
    sx += colW;
  }
  y += 30;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text(T(`${D.totals.days} ${D.totals.days === 1 ? "dag" : "dagen"} met kasverkeer · ${D.totals.daysCounted} geteld · ${D.totals.salesCount} contante betalingen`,
    `${D.totals.days} ${D.totals.days === 1 ? "day" : "days"} with cash activity · ${D.totals.daysCounted} counted · ${D.totals.salesCount} cash payments`,
    `${D.totals.days} ${D.totals.days === 1 ? "día" : "días"} con movimientos · ${D.totals.daysCounted} contados · ${D.totals.salesCount} pagos en efectivo`), margin, y);
  y += 14;

  const tableTheme = {
    theme: "grid",
    headStyles: { fillColor: [250, 248, 245], textColor: [120, 110, 100], fontStyle: "bold", fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [60, 60, 60] },
    footStyles: { fillColor: [245, 243, 239], textColor: [26, 23, 20], fontStyle: "bold", fontSize: 8 },
    margin: { left: margin, right: margin, bottom: 46 },
  };
  const right = (n) => ({ halign: "right" });

  // ── Per dag ─────────────────────────────────────────────────────────
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [[T("Dag", "Day", "Día"), T("Beginsaldo", "Opening", "Inicial"), T("Ontvangen", "Received", "Recibido"), T("Wisselgeld", "Change", "Cambio"), T("Stortingen", "Deposits", "Depósitos"), T("Opnames", "Withdrawals", "Retiradas"), T("Verwacht", "Expected", "Esperado"), T("Geteld", "Counted", "Contado"), T("Verschil", "Difference", "Diferencia")]],
    body: D.days.length
      ? D.days.map((d) => [fmtDate(d.date, lang), d.opening === null ? "—" : money(d.opening), money(d.received), d.change ? money(d.change) : "", d.cashIn ? money(d.cashIn) : "", d.cashOut ? money(d.cashOut) : "", money(d.expected), d.counted === null ? "—" : money(d.counted), d.diff === null ? "—" : signed(d.diff)])
      : [[T("Geen kasverkeer in deze periode", "No cash activity in this period", "Sin movimientos en este período"), "", "", "", "", "", "", "", ""]],
    foot: D.days.length ? [[T("Totaal", "Total", "Total"), "", money(D.totals.received), money(D.totals.change), money(D.totals.cashIn), money(D.totals.cashOut), "", "", D.totals.daysCounted ? signed(D.totals.diff) : "—"]] : undefined,
    columnStyles: { 1: right(), 2: right(), 3: right(), 4: right(), 5: right(), 6: right(), 7: right(), 8: right() },
  });

  // ── Mutaties ────────────────────────────────────────────────────────
  if (D.movements.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: doc.lastAutoTable.finalY + 20,
      head: [[T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Soort", "Type", "Tipo"), T("Reden / opmerking", "Reason / note", "Motivo / nota"), T("Bedrag", "Amount", "Importe"), T("Verschil", "Difference", "Diferencia")]],
      body: D.movements.map((m) => {
        const amt = parseFloat(m.amount) || 0;
        const diff = m.kind === "count" ? Math.round((amt - (parseFloat(m.expected) || 0)) * 100) / 100 : null;
        return [fmtDate(m.date, lang), fmtTime(m.created_at, lang), KIND[m.kind] || m.kind, s(m.reason), m.kind === "out" ? `-${money(amt)}` : m.kind === "in" ? `+${money(amt)}` : money(amt), diff === null ? "" : signed(diff)];
      }),
      columnStyles: { 4: right(), 5: right(), 3: { cellWidth: 170 } },
    });
  }

  // ── Contante betalingen ─────────────────────────────────────────────
  if (D.cashRows.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: doc.lastAutoTable.finalY + 20,
      head: [[T("Datum", "Date", "Fecha"), T("Tijd", "Time", "Hora"), T("Klant", "Client", "Cliente"), T("Omschrijving", "Description", "Descripción"), T("Medewerker", "Staff", "Personal"), T("Ontvangen", "Received", "Recibido"), T("Wisselgeld", "Change", "Cambio"), T("Bedrag", "Amount", "Importe")]],
      body: D.cashRows.map((a) => { const f = cashFlowOf(a); return [fmtDate(a.date, lang), s(a.time), s(a.client_name), s(a.service_name).slice(0, 60), s(a.staff_name).split(",")[0].trim(), money(f.received), f.change ? money(f.change) : "", money(f.net)]; }),
      foot: [["", "", "", "", T("Totaal", "Total", "Total"), money(D.totals.received), money(D.totals.change), money(D.totals.sales)]],
      columnStyles: { 5: right(), 6: right(), 7: right(), 3: { cellWidth: 130 } },
    });
  }

  // ── Voettekst op elke pagina ────────────────────────────────────────
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    // Alleen ASCII-tekens in de PDF-tekst: een echt minteken (U+2212) zit niet
    // in de standaardfont, jsPDF schakelt dan naar 2-byte-tekst en de hele regel
    // wordt wijd gespatieerd met een verkeerd glyph. Twee regels hoog, boven
    // de regel "Gegenereerd op".
    doc.text(T(`Bedragen in ${currencySymbol}. Verwacht in kas = beginsaldo + contant ontvangen - wisselgeld + stortingen - opnames; kasverschil = geteld - verwacht op het moment van tellen.`,
      `Amounts in ${currencySymbol}. Expected = opening float + cash received - change + deposits - withdrawals; difference = counted - expected at the time of counting.`,
      `Importes en ${currencySymbol}. Esperado = saldo inicial + efectivo recibido - cambio + depósitos - retiradas; diferencia = contado - esperado en el momento del recuento.`), margin, pageH - 44, { maxWidth: pageW - margin * 2 });
    doc.text(`${T("Gegenereerd op", "Generated on", "Generado el")} ${new Date().toLocaleDateString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB")} · vellu.cc`, margin, pageH - 20);
    doc.text(`${p} / ${pages}`, pageW - margin, pageH - 20, { align: "right" });
  }

  const filename = cashbookFilename({ salon, range, lang, ext: "pdf" });
  doc.save(filename);
  return { filename, days: D.totals.days, movements: D.movements.length, cashPayments: D.cashRows.length, totals: D.totals };
}
