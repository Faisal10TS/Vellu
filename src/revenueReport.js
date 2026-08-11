// Revenue PDF report generator.
//
// Called from the owner dashboard. Produces an A4 PDF suitable to send
// straight to an accountant or attach to a tax filing:
//   - Clean header with salon branding + report period
//   - Company block (salon name, address, KVK, BTW, IBAN) on the right
//   - Summary: totals, tax breakdown PER RATE, avg per appointment
//   - Detailed table: every completed appointment in range
//   - Footer with page numbers + generation timestamp
//
// Uses jsPDF + jspdf-autotable. Fully client-side — no server round trip,
// no external service, works offline. A typical 100-appointment month is
// ~3 pages and ~30 KB.
//
// Dit is een INTERN document: het gaat naar de eigenaar en zijn boekhouder,
// niet naar de klant. Daarom stuurt showTaxInternal wat hier zichtbaar is en
// niet showTax — een Arubaanse eigenaar mag het bedrag aan BBO/BAVP/BAZV niet
// op de klantfactuur zetten, maar moet het in zijn eigen omzetoverzicht wél
// terugzien.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { computeTax, linesFromSale } from "./taxEngine.js";

const ACCENT = [201, 169, 110]; // #c9a96e as RGB

// Safe string — avoids undefined/null blowing up pdf output.
const s = (v) => (v === null || v === undefined ? "" : String(v));

// Local date formatter in the report's language. Originally NL-only ("report
// goes to a Dutch accountant") — no longer true now salons exist outside NL,
// so the accountant reads whatever language the owner exports in.
const REPORT_MONTHS = {
  nl: ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
};
const fmtDateNL = (isoDate, lang = "nl") => {
  try {
    const [y, m, d] = isoDate.split("-").map(Number);
    const months = REPORT_MONTHS[lang] || REPORT_MONTHS.nl;
    return `${d} ${months[m - 1]} ${y}`;
  } catch {
    return isoDate;
  }
};

// Accepts:
//   salon: { business_name, address, city, kvk_number, btw_id, iban, invoice_prefix, logo_url, salon_email }
//   appointments: array of appointment rows (status=completed, date within range)
//   range: { from: "YYYY-MM-DD", to: "YYYY-MM-DD", label: "April 2026" }
//   lang: "nl" | "en" | "es"
//   staffName: optional — set when the report is filtered to one team member;
//     shown in the header and appended to the filename.
//   taxCfg: de uitkomst van resolveTax(profile) uit shared.jsx — de enige juiste
//     bron van tarieven. Ontbreekt hij, dan valt dit bestand terug op de losse
//     taxLabel/taxIdLabel/taxRate/showTax-parameters van vroeger (één tarief
//     over alles), zodat een oude aanroeper blijft werken.
export function generateRevenueReportPDF({
  salon, appointments, range, lang = "nl", staffName = "",
  currencySymbol = "€", moneyLocale = "nl-NL",
  taxLabel = "BTW", taxIdLabel = "BTW-id", taxRate = 0.21, showTax = true,
  taxCfg = null,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" }); // 595.28 x 841.89 pt

  // Currency is driven by the salon's country (passed in by the caller):
  // NL/BE → € + BTW, Bonaire → $ + ABB, etc.
  const eur = (n) => currencySymbol + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(moneyLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const T = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);
  // Tarieven zijn percentages (21, niet 0.21) en hoeven geen heel getal te zijn
  // — 2,5% BBO bestaat echt. Vandaar de locale-notatie in plaats van Math.round.
  const pct = (r) => `${(Math.round((Number(r) || 0) * 100) / 100).toLocaleString(moneyLocale)}%`;

  // De oude aanroeper geeft losse parameters door en rekent met één tarief over
  // alles; taxRate is daar een BREUK (0.21) terwijl resolveTax percentages
  // teruggeeft (21). Die vertaling gebeurt hier, zodat er verderop nog maar één
  // vorm bestaat: de cfg van de belastingmotor.
  const legacyPct = (Number(taxRate) || 0) * 100;
  const cfg = taxCfg || {
    label: taxLabel,
    idLabel: taxIdLabel,
    serviceRate: legacyPct,
    productRate: legacyPct,
    registered: !!showTax,
    showTax: !!showTax,
    showTaxInternal: !!showTax,
  };
  const label = cfg.label || taxLabel;
  const idLabel = cfg.idLabel || taxIdLabel;

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ── HEADER ────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(26, 23, 20);
  doc.text(T("Omzetrapport", "Revenue report", "Informe de ingresos"), margin, 60);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text(range.label || `${fmtDateNL(range.from, lang)} — ${fmtDateNL(range.to, lang)}`, margin, 78);
  if (staffName) {
    doc.setFontSize(10);
    doc.setTextColor(...ACCENT);
    doc.text(`${T("Medewerker", "Team member", "Miembro del equipo")}: ${s(staffName)}`, margin, 94);
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
    salon.btw_id ? `${idLabel}: ${s(salon.btw_id)}` : "",
    salon.iban ? `IBAN: ${s(salon.iban)}` : "",
    s(salon.salon_email),
  ].filter(Boolean);
  for (const line of companyLines) {
    y += 12;
    doc.text(line, pageW - margin, y, { align: "right" });
  }

  // ── SUMMARY ──────────────────────────────────────────────
  // Belasting komt uit de belastingmotor en niet uit één deling over het totaal.
  // Reden: één rapport kan meerdere grondslagen bevatten. Een Bonaire-salon die
  // producten aanslaat op een behandeling verkoopt 6% ABB-plichtige diensten
  // naast doorverkochte producten waarover al bij invoer ABB is betaald — die
  // mogen hier niet nog een keer belast worden. linesFromSale trekt elke rij
  // uiteen in regels, computeTax groepeert ze per tarief en rondt één keer op
  // documentniveau af, zodat netto + belasting exact de grondslag is.
  const allLines = appointments.flatMap((a) => linesFromSale(a));
  const computed = computeTax(allLines, cfg);
  // Intern document: showTaxInternal, niet showTax (zie kop van dit bestand).
  const showTaxRows = computed.showTaxInternal;

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const totalGross = computed.grandTotal;
  const totalBtw = showTaxRows ? computed.taxTotal : 0;
  const totalNet = round2(totalGross - totalBtw);
  const avg = appointments.length ? totalGross / appointments.length : 0;
  // Wat er naast de belaste grondslag in de omzet zit. Onbelast = de regels
  // zonder tarief (op de BES-eilanden de doorverkochte producten); kadobonnen
  // zijn een betaalmiddel en verlagen wél het ontvangen bedrag maar geen
  // grondslag — beide krijgen een eigen regel, anders telt de tabel niet op.
  const untaxedGross = round2(
    computed.lines.filter((l) => !l.taxable && l.kind !== "voucher").reduce((n, l) => n + l.gross, 0)
  );
  const voucherPaid = round2(computed.paidByVoucher);

  y = Math.max(y + 34, 220);
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, y - 14, pageW - margin, y - 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(26, 23, 20);
  doc.text(T("Samenvatting", "Summary", "Resumen"), margin, y);

  const summaryY = y + 20;
  const col1X = margin;
  const col2X = margin + 180;
  const col3X = margin + 360;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(T("Aantal afspraken", "Appointments", "Citas"), col1X, summaryY);
  doc.text(
    showTaxRows
      ? T(`Omzet incl. ${label}`, `Revenue incl. ${label}`, `Ingresos incl. ${label}`)
      : T("Omzet", "Revenue", "Ingresos"),
    col2X, summaryY
  );
  doc.text(T("Gem. per afspraak", "Avg per appt.", "Prom. por cita."), col3X, summaryY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(26, 23, 20);
  doc.text(String(appointments.length), col1X, summaryY + 18);
  doc.text(eur(totalGross), col2X, summaryY + 18);
  doc.text(eur(avg), col3X, summaryY + 18);

  // ── TAX BREAKDOWN ────────────────────────────────────────
  // Bij één tarief blijven het twee tegels — dat is het beeld dat de NL-salons
  // kennen. Zodra er meerdere grondslagen zijn passen er geen tegels meer naast
  // elkaar (de breedte per tegel wordt dan onleesbaar smal), dus wordt het een
  // echte tabel die per tarief grondslag en belasting laat zien én optelt.
  const btwY = summaryY + 44;
  let breakdownBottom = 0;
  // De uitsplitsing is niet alleen nodig bij MEERDERE tarieven. Op de
  // BES-eilanden is er precies één tarief (diensten) terwijl de doorverkochte
  // producten onbelast zijn — dan staat er anders "ABB 5,66" naast een omzet
  // van 115, wat neerkomt op 4,9% en nergens uit te herleiden is. Hetzelfde
  // geldt voor ingewisselde kadobonnen: die verlagen de omzet maar niet de
  // grondslag. Zodra een van die twee speelt, hoort de tabel er te staan.
  const needsBreakdown = computed.byRate.length > 1
    || Math.abs(untaxedGross) >= 0.01
    || voucherPaid >= 0.01;
  if (showTaxRows && computed.byRate.length === 1 && !needsBreakdown) {
    const only = computed.byRate[0];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`${label} (${pct(only.rate)})`, col1X, btwY);
    doc.text(T(`Netto (excl. ${label})`, `Net (excl. ${label})`, `Neto (excl. ${label})`), col2X, btwY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(26, 23, 20);
    doc.text(eur(totalBtw), col1X, btwY + 16);
    doc.text(eur(totalNet), col2X, btwY + 16);
    breakdownBottom = btwY + 16;
  } else if (showTaxRows && computed.byRate.length >= 1) {
    const rows = computed.byRate.map((r) => [`${label} ${pct(r.rate)}`, eur(r.gross), eur(r.tax)]);
    if (Math.abs(untaxedGross) >= 0.01) {
      rows.push([T("Onbelast", "Untaxed", "Sin impuesto"), eur(untaxedGross), eur(0)]);
    }
    if (voucherPaid >= 0.01) {
      rows.push([T("Ingewisselde kadobonnen", "Gift cards redeemed", "Tarjetas regalo canjeadas"), `-${eur(voucherPaid)}`, eur(0)]);
    }
    autoTable(doc, {
      startY: btwY - 8,
      head: [[
        T("Tarief", "Rate", "Tipo"),
        T("Grondslag", "Taxable base", "Base imponible"),
        T(label, label, label),
      ]],
      body: rows,
      foot: [[T("Totaal", "Total", "Total"), eur(totalGross), eur(totalBtw)]],
      theme: "plain",
      headStyles: { fillColor: [245, 243, 239], textColor: [80, 80, 80], fontStyle: "bold", fontSize: 9 },
      footStyles: { fillColor: [245, 243, 239], textColor: [26, 23, 20], fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [60, 60, 60] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: margin, right: margin },
      tableWidth: Math.min(320, pageW - margin * 2),
    });
    breakdownBottom = doc.lastAutoTable.finalY + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${T(`Netto (excl. ${label})`, `Net (excl. ${label})`, `Neto (excl. ${label})`)}: ${eur(totalNet)}`,
      margin, breakdownBottom + 12
    );
    breakdownBottom += 12;
  }

  // ── TABLE ────────────────────────────────────────────────
  // Volgt uit wat er werkelijk boven staat: één tegelrij, een tabel met n
  // tarieven, of helemaal niets. Nooit een vaste offset — die klopte alleen bij
  // precies één belastingregel.
  const tableStartY = breakdownBottom ? breakdownBottom + 26 : summaryY + 40;

  // Sort appointments by date asc then time asc for a chronological ledger
  const sorted = [...appointments].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || "") < (b.time || "") ? -1 : 1;
  });

  // Voetnoot op elke pagina: Vellu rekent met de instellingen van déze salon en
  // is geen belastingadviseur. Eerst opmeten, want de onderrand van de tabel
  // moet er ruimte voor laten — anders schuift de laatste rij eroverheen.
  const disclaimer = T(
    "Belastingbedragen zijn berekend op basis van de instellingen van deze salon. Vellu geeft geen fiscaal advies.",
    "Tax amounts are calculated from this salon's settings. Vellu does not provide tax advice.",
    "Los importes de impuestos se calculan segun la configuracion de este salon. Vellu no ofrece asesoramiento fiscal."
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const disclaimerLines = doc.splitTextToSize(disclaimer, pageW - margin * 2);
  const ratesNote = showTaxRows ? ` · ${label} ${computed.byRate.map((r) => pct(r.rate)).join(" / ")}` : "";

  autoTable(doc, {
    startY: tableStartY,
    head: [[
      T("Datum", "Date", "Fecha"),
      T("Tijd", "Time", "Hora"),
      T("Klant", "Client", "Cliente"),
      T("Behandeling", "Service", "Servicio"),
      T("Medewerker", "Staff", "Personal"),
      T("Bedrag", "Amount", "Importe"),
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
      T("Totaal", "Total", "Total"),
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
    margin: { left: margin, right: margin, bottom: 46 + 12 * disclaimerLines.length },
    didDrawPage: () => {
      // Footer: page number + generated date
      const pageStr = `${doc.internal.getCurrentPageInfo().pageNumber} / ${doc.internal.getNumberOfPages()}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      let noteY = pageH - 32 - 12 * disclaimerLines.length;
      for (const line of disclaimerLines) {
        doc.text(line, margin, noteY);
        noteY += 12;
      }
      // Currency/tax basis note: amounts reflect the salon's CURRENT region.
      // Values are never converted, so a report spanning a region change shows
      // pre-switch earnings in the new symbol/rate — flag that here.
      doc.text(
        T(
          `Bedragen in ${currencySymbol}${ratesNote}, belasting inbegrepen. Bij een regiowijziging worden eerdere bedragen niet omgerekend.`,
          `Amounts in ${currencySymbol}${ratesNote}, tax included. After a region change, earlier amounts are not converted.`,
          `Importes en ${currencySymbol}${ratesNote}, impuestos incluidos. Tras un cambio de region, los importes anteriores no se convierten.`
        ),
        margin,
        pageH - 32
      );
      doc.text(
        `${T("Gegenereerd op", "Generated on", "Generado el")} ${new Date().toLocaleDateString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB")} · vellu.cc`,
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
  const filename = `${fnSalon}${fnStaff}-${T("omzet", "revenue", "ingresos")}-${fnRange || range.from || "report"}.pdf`;

  doc.save(filename);

  return {
    filename,
    pages: doc.internal.getNumberOfPages(),
    totalGross,
    totalNet,
    totalBtw,
    count: appointments.length,
    // Per tarief, zodat een aanroeper (of een test) kan controleren waar de
    // belasting vandaan komt in plaats van één samengeklapt bedrag te zien.
    byRate: computed.byRate,
    untaxedGross,
    paidByVoucher: voucherPaid,
    taxLabel: label,
  };
}

// periodPreset lives in revenueReport.helpers.js so it can be imported eagerly
// without dragging jsPDF into the main bundle.
