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

import { computeTax, linesFromSale, cfgFromSnapshot } from "./taxEngine.js";

const s = (v) => (v === null || v === undefined ? "" : String(v));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Betaalwijze-labels — de kassa slaat "pin" / "cash" / "online" (betaalverzoek)
// op; oudere rijen dragen "on-arrival": toon dat als "in de salon". Geen
// betaalwijze (null) = afgerond met "Later / factuur"; "prepay" wacht nog op
// de vooruitbetaling, "prepaid" is vooruitbetaald — die drie zijn dus NIET in
// de salon betaald en mogen ook niet zo heten.
export const PAY_LABEL = {
  nl: { pin: "Pin", cash: "Contant", transfer: "Overschrijving", online: "Betaalverzoek", account: "Op rekening", prepay: "Vooruitbetaling", prepaid: "Vooruitbetaald", later: "Later / factuur", "on-arrival": "In de salon" },
  en: { pin: "Card", cash: "Cash", transfer: "Bank transfer", online: "Payment request", account: "On account", prepay: "Prepayment", prepaid: "Paid in advance", later: "Later / invoice", "on-arrival": "In salon" },
  es: { pin: "Tarjeta", cash: "Efectivo", transfer: "Transferencia", online: "Solicitud de pago", account: "A cuenta", prepay: "Pago por adelantado", prepaid: "Pagado por adelantado", later: "Después / factura", "on-arrival": "En el salón" },
};
export const payLabel = (pm, lang = "nl") => {
  const L = PAY_LABEL[lang] || PAY_LABEL.nl;
  return L[pm || "later"] || L["on-arrival"];
};

// Tekst voor jsPDF. De standaardfont (helvetica) kent alleen WinAnsi
// (CP1252); één teken daarbuiten — een echt minteken U+2212 uit de kassa, een
// naam met Ş of Ł — en jsPDF schrijft de HELE string als 2-byte-tekst: wijd
// gespatieerd en met verkeerde tekens. Dus: mintekens en verwante streepjes
// naar "-", letters met een accent buiten WinAnsi naar de kale letter, de
// rest weg. Tekens die wél in WinAnsi zitten (é, ñ, €, –, —, ’, “ ”, …, ·)
// blijven staan; die tekent jsPDF goed.
const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const PDF_MAP = { "\u2212": "-", "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2015": "-", "\u2032": "'", "\u2033": "\"", "\u201b": "'", "\u201f": "\"", "\u2009": " ", "\u200a": " ", "\u202f": " ", "\u2007": " ", "\u0141": "L", "\u0142": "l", "\u0110": "D", "\u0111": "d", "\u0131": "i", "\u0127": "h", "\u0126": "H" };
const winAnsi = (ch) => {
  const c = ch.codePointAt(0);
  return ch === "\n" || ch === "\r" || ch === "\t" || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.has(ch);
};
export const pdfSafe = (v) => {
  const str = s(v);
  let out = "";
  for (const ch of str) {
    if (winAnsi(ch)) { out += ch; continue; }
    if (PDF_MAP[ch] !== undefined) { out += PDF_MAP[ch]; continue; }
    const bare = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (bare && [...bare].every(winAnsi)) out += bare;
  }
  return out;
};
// jspdf-autotable-hook: elke cel (kop, regels, voet) door pdfSafe.
export const pdfSafeCells = (data) => {
  if (data && data.cell && Array.isArray(data.cell.text)) data.cell.text = data.cell.text.map(pdfSafe);
};

// Label van het handelsregisternummer (profiles.kvk_number). Nederland en de
// Caribische eilanden hebben een Kamer van Koophandel; België niet — daar is
// het het ondernemingsnummer (KBO).
export const companyNumberLabel = (salon, lang = "nl") => (String(salon?.country_code || "").toUpperCase() === "BE"
  ? (lang === "es" ? "N.º de empresa" : lang === "en" ? "Enterprise no." : "Ondernemingsnr.")
  : "KVK");

// ── Omzetrapport ─────────────────────────────────────────────────────────
// appointments: afgeronde afspraken binnen de periode (bij een rapport voor één
// stylist al teruggebracht tot háár aandeel, zie staffShareOf in shared.jsx).
// cfg: uitkomst van resolveTax(profile) — of de legacy-cfg die revenueReport.js
// uit losse parameters bouwt.
export function revenueReportData({ appointments, cfg }) {
  const list = Array.isArray(appointments) ? appointments : [];
  // Belasting PER RIJ, met de instellingen van het moment van afrekenen
  // (tax_snapshot, zie cfgFromSnapshot) en anders die van vandaag. Daarna per
  // tarief de grondslag optellen in centen en één keer op rapportniveau
  // afronden — net als computeTax over één document, zodat netto + belasting
  // exact op de grondslag uitkomt.
  const taxes = list.map((a) => computeTax(linesFromSale(a), cfgFromSnapshot(a, cfg || {})));
  const taxOf = new Map(list.map((a, i) => [a, taxes[i]]));
  const rateCents = new Map();
  let grandCents = 0, voucherCents = 0;
  const allLines = [];
  for (const t of taxes) {
    for (const r of t.byRate) rateCents.set(r.rate, (rateCents.get(r.rate) || 0) + Math.round(r.gross * 100));
    grandCents += Math.round(t.grandTotal * 100);
    voucherCents += Math.round(t.paidByVoucher * 100);
    allLines.push(...t.lines);
  }
  const byRate = [...rateCents.entries()].sort((a, b) => b[0] - a[0]).map(([rate, grossC]) => {
    const netC = Math.round(grossC / (1 + rate / 100));
    return { rate, gross: grossC / 100, net: netC / 100, tax: (grossC - netC) / 100 };
  });
  const taxCents = byRate.reduce((n, r) => n + Math.round(r.tax * 100), 0);
  const taxableCents = byRate.reduce((n, r) => n + Math.round(r.gross * 100), 0);
  // Zelfde vorm als computeTax (revenueReport.js leest computed.byRate).
  const computed = {
    lines: allLines,
    byRate,
    taxableGross: taxableCents / 100,
    netTotal: (taxableCents - taxCents) / 100,
    taxTotal: taxCents / 100,
    paidByVoucher: voucherCents / 100,
    grandTotal: grandCents / 100,
    showTax: taxes.some((t) => t.showTax),
    // Intern document: showTaxInternal, niet showTax — een Arubaanse eigenaar
    // mag het bedrag aan BBO/BAVP/BAZV niet op de klantfactuur zetten, maar
    // moet het in zijn eigen omzetoverzicht wél terugzien. Waar is zodra één
    // rij belasting droeg, ook als de salon vandaag niet (meer) plichtig is.
    showTaxInternal: taxes.some((t) => t.showTaxInternal),
    label: (cfg && cfg.label) || "BTW",
  };
  const showTaxRows = computed.showTaxInternal;

  const totalGross = computed.grandTotal;
  const totalBtw = showTaxRows ? computed.taxTotal : 0;
  const totalNet = round2(totalGross - totalBtw);
  const avg = list.length ? totalGross / list.length : 0;
  // Kassaverkopen (is_sale) zijn geen afspraken: apart tellen, zodat "Aantal
  // afspraken" en het gemiddelde per afspraak niet stilletjes de losse
  // productverkopen meenemen.
  const saleCount = list.filter((a) => a.is_sale === true).length;
  const apptCount = list.length - saleCount;
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

  // Per afspraak (voor de regeltabellen in Excel): bedrag, netto en belasting.
  // Bewust met VOLLE precisie en niet per regel afgerond: de belastingmotor
  // rondt per tarief op documentniveau af, en een kolom vol afgeronde centen
  // zou opgeteld een paar cent naast de kerncijfers uitkomen. Onafgerond
  // sommeert de kolom tot (op de weergave na) precies het documenttotaal.
  const rows = sorted.map((a) => {
    const t = taxOf.get(a);
    const tax = showTaxRows
      ? t.lines.reduce((n, l) => n + (l.taxable && l.rate > 0 ? l.gross - l.gross / (1 + l.rate / 100) : 0), 0)
      : 0;
    const gross = Number(a.service_price) || 0;
    return { appt: a, gross, tax, net: gross - tax };
  });

  return { computed, count: list.length, apptCount, saleCount, totalGross, totalBtw, totalNet, avg, untaxedGross, voucherPaid, showTaxRows, needsBreakdown, byRate: computed.byRate, sorted, rows };
}

// ── Productverkoop ───────────────────────────────────────────────────────
// appointments: rijen met een products-array binnen de periode — kassaverkopen
// (is_sale) én producten die op een gewone afspraak zijn aangeslagen.
export function productReportData({ appointments, cfg, lang = "nl" }) {
  const list = Array.isArray(appointments) ? appointments : [];
  const c = cfg || {};
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
  let anyTaxInternal = false;
  // Waaruit de onbelaste omzet bestaat (voor de toelichting onder de tabel):
  // verkochte kadobonnen, doorverkoop die hier niet belast is (BES), of
  // verkopen uit een periode zonder belastingplicht.
  const untaxedWhy = { giftCards: false, resale: false, unregistered: false };

  for (const a of list) {
    const prods = Array.isArray(a.products) ? a.products : [];
    if (!prods.length) continue;
    let rowRevenue = 0, rowQty = 0;
    const names = [];
    const staff = s(a.staff_name || "").split(",")[0].trim();
    // Geen betaalwijze = "Later / factuur", niet "in de salon".
    const pm = a.payment_method || "later";
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
    // Met de instellingen van het moment van afrekenen (tax_snapshot), niet
    // met die van vandaag — zie cfgFromSnapshot.
    const rowCfg = cfgFromSnapshot(a, c);
    const t = computeTax(prods.map((it) => {
      const q = parseInt(it.qty) || 1;
      return {
        kind: it.kind === "voucher_redeem" ? "voucher"
          : (it.kind === "voucher_sale" || it.id === "giftcard") ? "voucher_issue"
          : "product",
        name: s(it.name), qty: q, gross: (parseFloat(it.price) || 0) * q,
      };
    }), rowCfg);
    for (const r of t.byRate) byRate.set(r.rate, (byRate.get(r.rate) || 0) + Math.round(r.gross * 100));
    voucherCents += Math.round(t.paidByVoucher * 100);
    if (t.showTaxInternal) anyTaxInternal = true;
    for (const l of t.lines) {
      if (l.taxable || l.kind === "voucher" || Math.abs(l.gross) < 0.005) continue;
      if (l.kind === "voucher_issue") untaxedWhy.giftCards = true;
      else if (rowCfg.registered) untaxedWhy.resale = true;
      else untaxedWhy.unregistered = true;
    }

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
  // Intern stuk: belastingregels zodra de salon vandaag plichtig is, of zodra
  // een rij uit de periode bevroren is met belasting (KOR-wissel e.d.).
  const showTax = !!c.showTaxInternal || anyTaxInternal;
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
    totalRevenue, totalQty, taxableGross, totalTax, totalNet, voucherPaid, untaxed, untaxedWhy,
    showTax, taxLabel,
  };
}

// Toelichting onder de belastingtabel van het productrapport (PDF en Excel):
// WAAROM er onbelaste omzet is. Op de BES-eilanden is dat doorverkoop van
// producten; in Nederland kan het alleen de verkoop van een kadobon zijn (die
// wordt pas bij inwisselen belast) — "doorverkoop is hier niet plichtig" was
// daar gewoon onjuist.
export function untaxedNote(P, lang = "nl") {
  const why = (P && P.untaxedWhy) || {};
  const label = (P && P.taxLabel) || "BTW";
  const parts = [
    why.giftCards ? T3(lang, "verkochte kadobonnen (belast bij inwisselen)", "gift cards sold (taxed when redeemed)", "tarjetas regalo vendidas (se gravan al canjearse)") : null,
    why.resale ? T3(lang, `doorverkoop van producten (hier niet ${label}-plichtig)`, `resale of products (not subject to ${label} here)`, `reventa de productos (no sujeta a ${label} aquí)`) : null,
    why.unregistered ? T3(lang, "verkopen uit een periode zonder belastingplicht", "sales from a period without tax registration", "ventas de un periodo sin registro fiscal") : null,
  ].filter(Boolean);
  if (!parts.length) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} ${T3(lang, "en", "and", "y")} ${parts[parts.length - 1]}`;
  return T3(lang, `De regel "Onbelast" bestaat uit ${list}.`, `The "Untaxed" row consists of ${list}.`, `La fila "Sin impuesto" corresponde a ${list}.`);
}

// ── Bestandsnamen ────────────────────────────────────────────────────────
const fileSlug = (v, n) => s(v).replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, n);
function T3(lang, nl, en, es) { return lang === "es" ? (es || en) : lang === "en" ? en : nl; }

export function revenueReportFilename({ salon, staffName = "", range, lang = "nl", ext = "pdf" }) {
  const fnSalon = fileSlug(salon?.business_name || salon?.name || "vellu", 40);
  const fnStaff = staffName ? "-" + fileSlug(staffName, 30) : "";
  return `${fnSalon}${fnStaff}-${T3(lang, "omzet", "revenue", "ingresos")}-${periodSpan(range) || "report"}.${ext}`;
}

// Naam naar de VOLLEDIGE periode, zodat geen twee verschillende periodes
// dezelfde bestandsnaam krijgen (januari, Q1 en het hele jaar heetten eerst
// alle drie "-2026-01" of "-2026"):
//   één dag            → 2026-08-12
//   1 jan t/m 31 dec   → 2026
//   een heel kwartaal  → 2026-Q3
//   een hele maand     → 2026-08
//   al het andere      → 2026-01-01_2026-10-05 (ook een periode die tot en
//                        met vandaag is ingekort: dan staat er wat erin zit)
const lastDayOf = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
function periodSpan(range) {
  const from = s(range?.from), to = s(range?.to);
  if (!from || !to || from === to) return from || to;
  const y = from.slice(0, 4);
  if (from === `${y}-01-01` && to === `${y}-12-31`) return y;
  const quarter = { "01-01": 1, "04-01": 2, "07-01": 3, "10-01": 4 }[from.slice(5)];
  if (quarter && to === lastDayOf(`${y}-${String(quarter * 3).padStart(2, "0")}`)) return `${y}-Q${quarter}`;
  if (from.endsWith("-01") && to === lastDayOf(from.slice(0, 7))) return from.slice(0, 7);
  return `${from}_${to}`;
}

export function productReportFilename({ salon, range, lang = "nl", ext = "pdf" }) {
  const fnSalon = fileSlug(salon?.business_name || salon?.name || "vellu", 40);
  return `${fnSalon}-${T3(lang, "productverkoop", "product-sales", "venta-productos")}-${periodSpan(range) || "report"}.${ext}`;
}

export function cashbookFilename({ salon, range, lang = "nl", ext = "pdf" }) {
  const fnSalon = fileSlug(salon?.business_name || salon?.name || "vellu", 40);
  return `${fnSalon}-${T3(lang, "kasboek", "cash-book", "libro-caja")}-${periodSpan(range) || "export"}.${ext}`;
}

// Geldstroom van één contante betaling: wat de klant gaf (cash_received, of het
// bedrag zelf als dat niet is ingevuld = gepast), wat er terugging (wisselgeld)
// en wat er netto in de la bleef (het verkoopbedrag). Kas in = received, kas
// uit = change; received − change = net.
//
// Alleen wat er werkelijk contant binnenkwam telt (RP-01, 05-10-2026). Een
// contante rij die (weer) open staat — paid_at leeg mét een amount_paid lager
// dan de prijs, bv. een product dat na het afrekenen nog werd aangeslagen, of
// "betaling teruggezet naar open" — draagt alleen dat betaalde deel bij; het
// open restant zit nog niet in de la. Oude contante rijen zonder amount_paid
// en rijen met paid_at zijn volledig betaald, zoals overal (paidAmountOf).
// Een vooruitbetaalde afspraak houdt payment_method "prepaid" en komt hier
// dus niet langs; het contante restant ervan is een client_payments-rij
// (paymentsAsCashRows) en telt zo precies één keer.
export function cashFlowOf(a) {
  const price = round2(parseFloat(a?.service_price) || 0);
  const partly = !a?.paid_at && a?.amount_paid != null && a.amount_paid !== "";
  const net = partly ? Math.min(price, Math.max(0, round2(parseFloat(a.amount_paid) || 0))) : price;
  const raw = a?.cash_received != null && a.cash_received !== "" ? round2(parseFloat(a.cash_received) || 0) : net;
  const received = net > 0 ? Math.max(raw, net) : 0;
  return { price, received, change: round2(received - net), net };
}

// ── Kasboek ──────────────────────────────────────────────────────────────
// movements: cash_movements-rijen (open/in/out/count) van de periode;
// cashRows: appointments-rijen die contant zijn afgerekend (kassa én
// behandelingen). Per dag dezelfde regels als in Kasboek.jsx:
//   verwacht = beginsaldo + contant verkocht + kas in − kas uit
//   verschil = geteld − verwacht op het moment van tellen (bevroren in de rij)
export function cashbookData({ movements, cashRows, from, to }) {
  // Kasboekregels op het moment van invoeren (created_at); contante betalingen
  // op datum + tijd van de verkoop/afspraak. created_at van een afspraak is het
  // moment van BOEKEN (vaak dagen eerder), dus daarop sorteren zette een
  // behandeling van 16:00 vóór een losse verkoop van 10:00.
  const byCreated = (a, b) => (`${a.date} ${a.created_at || a.time || ""}`).localeCompare(`${b.date} ${b.created_at || b.time || ""}`);
  const byTime = (a, b) => (`${a.date} ${s(a.time).slice(0, 5)}`).localeCompare(`${b.date} ${s(b.time).slice(0, 5)}`);
  const mv = (Array.isArray(movements) ? movements : []).filter((m) => m.date >= from && m.date <= to).slice().sort(byCreated);
  const cs = (Array.isArray(cashRows) ? cashRows : []).filter((a) => a.date >= from && a.date <= to && a.payment_method === "cash" && a.status === "completed").slice().sort(byTime);
  const dates = [...new Set([...mv.map((m) => m.date), ...cs.map((a) => a.date)])].sort();
  const days = dates.map((date) => {
    const dm = mv.filter((m) => m.date === date);
    const opening = [...dm].reverse().find((m) => m.kind === "open") || null;
    const count = [...dm].reverse().find((m) => m.kind === "count") || null;
    const daySales = cs.filter((a) => a.date === date);
    const flows = daySales.map(cashFlowOf);
    const received = round2(flows.reduce((n, f) => n + f.received, 0)); // kas in uit verkopen
    const change = round2(flows.reduce((n, f) => n + f.change, 0));     // kas uit: wisselgeld
    const sales = round2(received - change);                             // netto in de la
    const cashIn = round2(dm.filter((m) => m.kind === "in").reduce((n, m) => n + (parseFloat(m.amount) || 0), 0));
    const cashOut = round2(dm.filter((m) => m.kind === "out").reduce((n, m) => n + (parseFloat(m.amount) || 0), 0));
    const expected = round2((opening ? parseFloat(opening.amount) || 0 : 0) + sales + cashIn - cashOut);
    const counted = count ? round2(parseFloat(count.amount) || 0) : null;
    const diff = count ? round2(counted - (count.expected != null ? parseFloat(count.expected) || 0 : expected)) : null;
    return { date, opening: opening ? round2(parseFloat(opening.amount) || 0) : null, received, change, sales, salesCount: daySales.length, cashIn, cashOut, expected, counted, countedAt: count ? count.created_at : null, diff, note: count && count.reason ? String(count.reason) : "" };
  });
  const totals = {
    received: round2(days.reduce((n, d) => n + d.received, 0)),
    change: round2(days.reduce((n, d) => n + d.change, 0)),
    sales: round2(days.reduce((n, d) => n + d.sales, 0)),
    salesCount: cs.length,
    cashIn: round2(days.reduce((n, d) => n + d.cashIn, 0)),
    cashOut: round2(days.reduce((n, d) => n + d.cashOut, 0)),
    diff: round2(days.reduce((n, d) => n + (d.diff || 0), 0)),
    daysCounted: days.filter((d) => d.counted !== null).length,
    days: days.length,
  };
  return { days, movements: mv, cashRows: cs, totals };
}

// ── Klantenrekening (25-09-2026) ─────────────────────────────────────────
// Een contante (deel)betaling op een open post (verkoop op rekening, "later /
// factuur") telt in het kasboek op de dag van ONTVANGST, niet op de dag van
// de verkoop. Elke client_payments-rij met method "cash" wordt hier een
// kasregel in dezelfde vorm als een contant afgerekende verkoop, zodat
// cashbookData en cashFlowOf er niets van hoeven te weten: bedrag = ontvangen,
// geen wisselgeld. Naam en omschrijving staan op de betaling zelf (kopie van
// de verkoop), dus de vaak maanden oudere verkooprij is niet nodig.
export function paymentsAsCashRows(payments, lang = "nl") {
  const L = (nl, en, es) => (lang === "es" ? es : lang === "en" ? en : nl);
  return (Array.isArray(payments) ? payments : [])
    .filter((p) => p && p.method === "cash" && (parseFloat(p.amount) || 0) > 0)
    .map((p) => {
      const t = p.created_at ? new Date(p.created_at) : null;
      const time = t && !Number.isNaN(t.getTime()) ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "";
      const amount = round2(p.amount);
      return {
        id: `pay:${p.id}`, payment_id: p.id, appointment_id: p.appointment_id, is_payment: true,
        date: p.paid_on, time, created_at: p.created_at,
        client_name: s(p.client_name), client_email: "",
        service_name: `${L("Betaling op rekening", "Payment on account", "Pago a cuenta")}${p.label ? ` · ${s(p.label)}` : ""}`,
        staff_name: p.staff_name || null,
        service_price: amount, cash_received: amount, payment_method: "cash", status: "completed",
      };
    });
}
