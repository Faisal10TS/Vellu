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

const BTW_RATE = 0.21; // NL standard rate; services are 21% BTW.
const ACCENT = [201, 169, 110]; // #c9a96e as RGB

// Safe string — avoids undefined/null blowing up pdf output.
const s = (v) => (v === null || v === undefined ? "" : String(v));

// Format EUR amount.
const eur = (n) => `€${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(".", ",")}`;

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
export function generateRevenueReportPDF({ salon, appointments, range, lang = "nl" }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" }); // 595.28 x 841.89 pt

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
    salon.btw_id ? `BTW: ${s(salon.btw_id)}` : "",
    salon.iban ? `IBAN: ${s(salon.iban)}` : "",
    s(salon.salon_email),
  ].filter(Boolean);
  for (const line of companyLines) {
    y += 12;
    doc.text(line, pageW - margin, y, { align: "right" });
  }

  // ── SUMMARY ──────────────────────────────────────────────
  const totalGross = appointments.reduce((sum, a) => sum + (parseFloat(a.service_price) || 0), 0);
  const totalNet = totalGross / (1 + BTW_RATE);
  const totalBtw = totalGross - totalNet;
  const avg = appointments.length ? totalGross / appointments.length : 0;

  y = Math.max(y + 34, 220);
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, y - 14, pageW - margin, y - 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(26, 23, 20);
  doc.text(lang === "nl" ? "Samenvatting" : "Summary", margin, y);

  const summaryY = y + 20;
  const col1X = margin;
  const col2X = margin + 180;
  const col3X = margin + 360;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(lang === "nl" ? "Aantal afspraken" : "Appointments", col1X, summaryY);
  doc.text(lang === "nl" ? "Omzet incl. BTW" : "Revenue incl. VAT", col2X, summaryY);
  doc.text(lang === "nl" ? "Gem. per afspraak" : "Avg per appt.", col3X, summaryY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(26, 23, 20);
  doc.text(String(appointments.length), col1X, summaryY + 18);
  doc.text(eur(totalGross), col2X, summaryY + 18);
  doc.text(eur(avg), col3X, summaryY + 18);

  // BTW breakdown
  const btwY = summaryY + 44;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(lang === "nl" ? "BTW (21%)" : "VAT (21%)", col1X, btwY);
  doc.text(lang === "nl" ? "Netto (excl. BTW)" : "Net (excl. VAT)", col2X, btwY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(26, 23, 20);
  doc.text(eur(totalBtw), col1X, btwY + 16);
  doc.text(eur(totalNet), col2X, btwY + 16);

  // ── TABLE ────────────────────────────────────────────────
  const tableStartY = btwY + 48;

  // Sort appointments by date asc then time asc for a chronological ledger
  const sorted = [...appointments].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || "") < (b.time || "") ? -1 : 1;
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [[
      lang === "nl" ? "Datum" : "Date",
      lang === "nl" ? "Tijd" : "Time",
      lang === "nl" ? "Klant" : "Client",
      lang === "nl" ? "Behandeling" : "Service",
      lang === "nl" ? "Medewerker" : "Staff",
      lang === "nl" ? "Bedrag" : "Amount",
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
      doc.text(
        `${lang === "nl" ? "Gegenereerd op" : "Generated on"} ${new Date().toLocaleDateString("nl-NL")} · vellu.cc`,
        margin,
        pageH - 20
      );
      doc.text(pageStr, pageW - margin, pageH - 20, { align: "right" });
    },
  });

  // ── FILENAME ─────────────────────────────────────────────
  const fnSalon = s(salon.business_name || salon.name || "vellu").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 40);
  const fnRange = (range.from || "").slice(0, 7); // YYYY-MM for month files
  const filename = `${fnSalon}-omzet-${fnRange || range.from || "rapport"}.pdf`;

  doc.save(filename);

  return { filename, pages: doc.internal.getNumberOfPages(), totalGross, totalNet, totalBtw, count: appointments.length };
}

// periodPreset lives in revenueReport.helpers.js so it can be imported eagerly
// without dragging jsPDF into the main bundle.
