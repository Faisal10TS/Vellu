// Revenue PDF report generator.
//
// Called from the owner dashboard. Produces an A4 PDF suitable to send
// straight to an accountant or attach to a tax filing:
//   - Clean header with salon branding + report period
//   - Company block (salon name, address, KVK, BTW, IBAN) on the right
//   - Summary: totals, BTW breakdown, avg per appointment
//   - Detailed table: every completed appointment in range
//   - Footer with page numbers + generation timestamp
//
// Uses jsPDF + jspdf-autotable. Fully client-side — no server round trip,
// no external service, works offline. A typical 100-appointment month is
// ~3 pages and ~30 KB.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const ACCENT = [201, 169, 110]; // #c9a96e as RGB

// Safe string — avoids undefined/null blowing up pdf output.
const s = (v) => (v === null || v === undefined ? "" : String(v));

// Local date formatter — we want Dutch output even when the user's browser
// locale is English, because the report will be sent to a Dutch accountant.
const fmtDateNL = (isoDate) => {
  try {
    const [y, m, d] = isoDate.split("-").map(Number);
    const months = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
    return `${d} ${months[m - 1]} ${y}`;
  } catch {
    return isoDate;
  }
};

// Accepts:
//   salon: { business_name, address, city, kvk_number, btw_id, iban, invoice_prefix, logo_url, salon_email }
//   appointments: array of appointment rows (status=completed, date within range)
//   range: { from: "YYYY-MM-DD", to: "YYYY-MM-DD", label: "April 2026" }
//   lang: "nl" | "en"  (column headers only; numeric formatting stays NL)
//   staffName: optional — set when the report is filtered to one team member;
//     shown in the header and appended to the filename.
export function generateRevenueReportPDF({ salon, appointments, range, lang = "nl", staffName = "", currencySymbol = "€", moneyLocale = "nl-NL", taxLabel = "BTW", taxIdLabel = "BTW-id", taxRate = 0.21, showTax = true }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" }); // 595.28 x 841.89 pt

  // Currency + tax are driven by the salon's country (passed in by the caller):
  // NL/BE → € + BTW, Bonaire → $ + ABB, etc. Prices are tax-INCLUSIVE, so
  // net = gross / (1 + rate). `showTax` is false for salons that don't charge
  // tax — then net = gross and no tax rows are drawn.
  const eur = (n) => currencySymbol + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(moneyLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taxPct = Math.round((Number(taxRate) || 0) * 100);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ── HEADER ────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(26, 23, 20);
  doc.text("Omzetrapport", margin, 60);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text(range.label || `${fmtDateNL(range.from)} — ${fmtDateNL(range.to)}`, margin, 78);
  if (staffName) {
    doc.setFontSize(10);
    doc.setTextColor(...ACCENT);
    doc.text(`${lang === "nl" ? "Medewerker" : lang === "es" ? "Miembro del equipo" : "Team member"}: ${s(staffName)}`, margin, 94);
  }

  // Vellu wordmark top-right (just text, no image — keeps PDF tiny)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...ACCENT);
  doc.text("vellu", pageW - margin, 60, { align: "right" });
  // Thin accent line under wordmark
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(pageW - margin - 30, 66, pageW - margin, 66);

  // ── COMPANY BLOCK ────────────────────────────────────────
  // Right-aligned address block, invoice-style
  let y = 110;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(26, 23, 20);
  doc.text(s(salon.business_name || salon.name), pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  const companyLines = [
    s(salon.address),
    [s(salon.postcode), s(salon.city)].filter(Boolean).join(" "),
    salon.kvk_number ? `KVK: ${s(salon.kvk_number)}` : "",
    salon.btw_id ? `${taxIdLabel}: ${s(salon.btw_id)}` : "",
    salon.iban ? `IBAN: ${s(salon.iban)}` : "",
    s(salon.salon_email),
  ].filter(Boolean);
  for (const line of companyLines) {
    y += 12;
    doc.text(line, pageW - margin, y, { align: "right" });
  }

  // ── SUMMARY ──────────────────────────────────────────────
  const totalGross = appointments.reduce((sum, a) => sum + (parseFloat(a.service_price) || 0), 0);
  const totalNet = showTax ? totalGross / (1 + taxRate) : totalGross;
  const totalBtw = totalGross - totalNet;
  const avg = appointments.length ? totalGross / appointments.length : 0;

  y = Math.max(y + 34, 220);
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, y - 14, pageW - margin, y - 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(26, 23, 20);
  doc.text(lang === "nl" ? "Samenvatting" : lang === "es" ? "Resumen" : "Summary", margin, y);

  const summaryY = y + 20;
  const col1X = margin;
  const col2X = margin + 180;
  const col3X = margin + 360;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(lang === "nl" ? "Aantal afspraken" : lang === "es" ? "Citas" : "Appointments", col1X, summaryY);
  doc.text(showTax ? (lang === "nl" ? `Omzet incl. ${taxLabel}` : lang === "es" ? `Ingresos incl. ${taxLabel}` : `Revenue incl. ${taxLabel}`) : (lang === "nl" ? "Omzet" : lang === "es" ? "Ingresos" : "Revenue"), col2X, summaryY);
  doc.text(lang === "nl" ? "Gem. per afspraak" : lang === "es" ? "Prom. por cita." : "Avg per appt.", col3X, summaryY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(26, 23, 20);
  doc.text(String(appointments.length), col1X, summaryY + 18);
  doc.text(eur(totalGross), col2X, summaryY + 18);
  doc.text(eur(avg), col3X, summaryY + 18);

  // Tax breakdown — only for salons that actually charge tax (showTax).
  const btwY = summaryY + 44;
  if (showTax) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`${taxLabel} (${taxPct}%)`, col1X, btwY);
    doc.text(lang === "nl" ? `Netto (excl. ${taxLabel})` : lang === "es" ? `Neto (excl. ${taxLabel})` : `Net (excl. ${taxLabel})`, col2X, btwY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(26, 23, 20);
    doc.text(eur(totalBtw), col1X, btwY + 16);
    doc.text(eur(totalNet), col2X, btwY + 16);
  }

  // ── TABLE ────────────────────────────────────────────────
  const tableStartY = showTax ? btwY + 48 : summaryY + 40;

  // Sort appointments by date asc then time asc for a chronological ledger
  const sorted = [...appointments].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || "") < (b.time || "") ? -1 : 1;
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [[
      lang === "nl" ? "Datum" : lang === "es" ? "Fecha" : "Date",
      lang === "nl" ? "Tijd" : lang === "es" ? "Hora" : "Time",
      lang === "nl" ? "Klant" : lang === "es" ? "Cliente" : "Client",
      lang === "nl" ? "Behandeling" : lang === "es" ? "Servicio" : "Service",
      lang === "nl" ? "Medewerker" : lang === "es" ? "Personal" : "Staff",
      lang === "nl" ? "Bedrag" : lang === "es" ? "Importe" : "Amount",
    ]],
    body: sorted.map(a => [
      a.date,
      s(a.time),
      s(a.client_name),
      s(a.service_name).slice(0, 60),
      s(a.staff_name),
      eur(a.service_price),
    ]),
    foot: [[
      "", "", "",
      lang === "nl" ? "Totaal" : "Total",
      "",
      eur(totalGross),
    ]],
    theme: "plain",
    headStyles: {
      fillColor: [245, 243, 239],
      textColor: [80, 80, 80],
      fontStyle: "bold",
      fontSize: 9,
    },
    footStyles: {
      fillColor: [245, 243, 239],
      textColor: [26, 23, 20],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [60, 60, 60],
    },
    columnStyles: {
      5: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      // Footer: page number + generated date
      const pageStr = `${doc.internal.getCurrentPageInfo().pageNumber} / ${doc.internal.getNumberOfPages()}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      // Currency/tax basis note: amounts reflect the salon's CURRENT region.
      // Values are never converted, so a report spanning a region change shows
      // pre-switch earnings in the new symbol/rate — flag that here.
      doc.text(
        lang === "nl"
          ? `Bedragen in ${currencySymbol}${showTax ? ` · ${taxLabel} ${taxPct}%` : ""}. Bij een regiowijziging worden eerdere bedragen niet omgerekend.`
          : `Amounts in ${currencySymbol}${showTax ? ` · ${taxLabel} ${taxPct}%` : ""}. After a region change, earlier amounts are not converted.`,
        margin,
        pageH - 32
      );
      doc.text(
        `${lang === "nl" ? "Gegenereerd op" : lang === "es" ? "Generado el" : "Generated on"} ${new Date().toLocaleDateString("nl-NL")} · vellu.cc`,
        margin,
        pageH - 20
      );
      doc.text(pageStr, pageW - margin, pageH - 20, { align: "right" });
    },
  });

  // ── FILENAME ─────────────────────────────────────────────
  const fnSalon = s(salon.business_name || salon.name || "vellu").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 40);
  const fnStaff = staffName ? "-" + s(staffName).replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 30) : "";
  const fnRange = (range.from || "").slice(0, 7); // YYYY-MM for month files
  const filename = `${fnSalon}${fnStaff}-omzet-${fnRange || range.from || "rapport"}.pdf`;

  doc.save(filename);

  return { filename, pages: doc.internal.getNumberOfPages(), totalGross, totalNet, totalBtw, count: appointments.length };
}

// periodPreset lives in revenueReport.helpers.js so it can be imported eagerly
// without dragging jsPDF into the main bundle.
