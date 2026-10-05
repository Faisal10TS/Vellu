// src/taxEngine.js
//
// De enige plek waar belasting wordt uitgerekend. Vóór dit bestand stond de
// formule `bedrag / (1 + tarief)` vier keer los in de codebase (kassabon,
// productrapport, omzetrapport, factuurmail) en die vier gingen op de
// Caribische eilanden alle vier op dezelfde manier de mist in.
//
// Drie regels die je moet kennen om deze module te begrijpen:
//
//  1. PRIJZEN ZIJN BELASTING-INCLUSIEF. Er wordt nooit iets bovenop de prijs
//     geteld — de belasting wordt eruit teruggerekend. Op Bonaire, Aruba en
//     Curaçao is dat niet alleen gewoonte maar voorschrift.
//
//  2. NIET ALLES IS BELAST TEGEN HETZELFDE TARIEF. Op de BES-eilanden is een
//     behandeling belast (ABB 6% op Bonaire, 4% op Saba/Statia) maar de
//     doorverkoop van een ingekocht product niet: die ABB is al bij invoer
//     betaald en zit in de inkoopprijs. Eén bon kan dus twee grondslagen
//     hebben. Vandaar de groepering per tarief.
//
//  3. EEN KADOBON IS EEN BETAALMIDDEL, GEEN KORTING. Wie een behandeling van
//     100 afrekent met een kadobon van 40, heeft nog steeds een dienst van 100
//     afgenomen. De grondslag blijft 100; alleen het te betalen bedrag wordt
//     60. Het omgekeerde (belasting rekenen over 60) is de fout die de vorige
//     implementatie maakte.
//
// Afronding gebeurt per tarief-groep op documentniveau, in hele centen, zodat
// som(netto) + som(belasting) exact gelijk is aan de grondslag. Nooit per regel
// afronden en dan optellen — dan loopt een bon met tien regels centen mis.

// ── Regelsoorten ────────────────────────────────────────────────────────
// service | extra | variant → belast tegen het DIENSTEN-tarief
// product                   → belast tegen het PRODUCT-tarief (0 als de salon
//                             geen producent is, zie regel 2 hierboven)
// voucher                   → inwisseling: betaalmiddel, verlaagt het te
//                             betalen bedrag maar niet de grondslag
// voucher_issue             → verkoop van een kadobon: telt mee in het te
//                             betalen bedrag, maar wordt NIET belast — anders
//                             hef je twee keer, want bij inwisseling wordt de
//                             volle dienst-/productprijs al belast
// discount                  → echte korting: verlaagt de grondslag zelf
const SERVICE_KINDS = ["service", "extra", "variant"];

const cents = (n) => Math.round((Number(n) || 0) * 100);
const fromCents = (c) => c / 100;

/**
 * Rekent de belasting uit over een set regels.
 *
 * @param {Array} lines  [{ kind, name, gross, qty }] — gross is het TOTAAL van
 *                       die regel (prijs × aantal), belasting-inclusief.
 * @param {object} cfg   uitkomst van resolveTax() in shared.jsx
 * @returns {{ lines, byRate, taxableGross, netTotal, taxTotal, paidByVoucher, grandTotal, showTax, label }}
 */
export function computeTax(lines, cfg = {}) {
  const serviceRate = Number(cfg.serviceRate) || 0;
  const productRate = Number(cfg.productRate) || 0;
  const registered = cfg.registered !== false && !!cfg.registered;

  const rateFor = (kind) => {
    if (!registered) return 0;
    if (kind === "product") return productRate;
    if (SERVICE_KINDS.includes(kind)) return serviceRate;
    return 0; // voucher, voucher_issue en onbekende soorten: geen grondslag
  };
  const isTaxable = (kind) => registered && rateFor(kind) > 0 && kind !== "voucher" && kind !== "voucher_issue";

  const resolved = (Array.isArray(lines) ? lines : []).map((l) => {
    const kind = String(l.kind || "service");
    const gross = Number(l.gross) || 0;
    return { ...l, kind, gross, rate: isTaxable(kind) ? rateFor(kind) : 0, taxable: isTaxable(kind) };
  });

  // Grondslag per tarief, in centen zodat er niets wegdrijft.
  const byRateCents = new Map();
  let taxableCents = 0;
  let voucherCents = 0;
  let grandCents = 0;

  for (const l of resolved) {
    const c = cents(l.gross);
    grandCents += c;
    if (l.kind === "voucher") { voucherCents += Math.abs(c); continue; }
    if (!l.taxable) continue;
    byRateCents.set(l.rate, (byRateCents.get(l.rate) || 0) + c);
    taxableCents += c;
  }

  const byRate = [...byRateCents.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, grossC]) => {
      // Afronden op documentniveau: netto naar boven/beneden, belasting is het
      // verschil. Zo klopt netto + belasting altijd precies met de grondslag.
      const netC = Math.round(grossC / (1 + rate / 100));
      return { rate, gross: fromCents(grossC), net: fromCents(netC), tax: fromCents(grossC - netC) };
    });

  const netCents = byRate.reduce((s, r) => s + cents(r.net), 0);
  const taxCents = byRate.reduce((s, r) => s + cents(r.tax), 0);

  return {
    lines: resolved,
    byRate,
    taxableGross: fromCents(taxableCents),
    netTotal: fromCents(netCents),
    taxTotal: fromCents(taxCents),
    paidByVoucher: fromCents(voucherCents),
    grandTotal: fromCents(grandCents),
    showTax: !!cfg.showTax && byRate.length > 0,
    showTaxInternal: !!cfg.showTaxInternal && byRate.length > 0,
    label: cfg.label || "BTW",
  };
}

/**
 * Reconstrueert de regels van een verkoop/afspraak uit een appointments-rij.
 *
 * `products` bevat alleen de producten; de behandeling zelf zit in het verschil
 * tussen service_price en de som van die productregels. Die restpost is precies
 * wat er als dienst is verkocht — en dus het deel dat op de eilanden wél belast
 * is terwijl de producten dat niet zijn.
 */
export function linesFromSale(sale) {
  const out = [];
  const items = Array.isArray(sale?.products) ? sale.products : [];
  let itemsSum = 0;
  for (const it of items) {
    const qty = parseInt(it.qty) || 1;
    const gross = (parseFloat(it.price) || 0) * qty;
    itemsSum += gross;
    const kind = it.kind === "voucher_redeem" ? "voucher"
      : it.kind === "voucher_sale" || it.id === "giftcard" ? "voucher_issue"
      : "product";
    out.push({ kind, name: String(it.name || ""), qty, gross });
  }
  // Producten aangeslagen op een behandeling: de behandeling staat niet in
  // `products` maar zit wel in service_price.
  const total = parseFloat(sale?.service_price);
  if (Number.isFinite(total)) {
    const rest = Math.round((total - itemsSum) * 100) / 100;
    if (Math.abs(rest) >= 0.01) {
      out.unshift({
        kind: "service",
        name: String(sale?.service_name || "").split(" + ")[0] || "Service",
        qty: 1,
        gross: rest,
      });
    }
  }
  return out;
}

/**
 * Bevriest de berekening zodat een latere tariefwijziging niet met terugwerkende
 * kracht elke al verstuurde factuur herschrijft. Landt in appointments.tax_snapshot.
 */
export function buildSnapshot(computed, cfg = {}, meta = {}) {
  return {
    v: 1,
    country: meta.country || null,
    region: meta.region || null,
    currency: meta.currency || null,
    label: computed.label,
    show_tax: !!computed.showTax,
    registered: !!cfg.registered,
    // qty mee, anders toont de bon "Nagelriemolie" i.p.v. "2 x Nagelriemolie".
    lines: computed.lines.map((l) => ({ kind: l.kind, name: l.name, qty: parseInt(l.qty) || 1, gross: l.gross, rate: l.rate, taxable: l.taxable })),
    by_rate: computed.byRate,
    tax_total: computed.taxTotal,
    net_total: computed.netTotal,
    paid_by_voucher: computed.paidByVoucher,
    grand_total: computed.grandTotal,
    at: meta.at || null,
  };
}

/**
 * Leespad voor bonnen en rapporten: gebruik de bevroren berekening als die er
 * is, en reken anders met de instellingen van vandaag (rijen van vóór deze
 * feature). Geeft altijd hetzelfde vormpje terug als computeTax.
 */
export function taxForSale(sale, cfg) {
  const snap = sale?.tax_snapshot;
  if (snap && snap.v === 1 && Array.isArray(snap.by_rate)) {
    // Snapshots van vóór 05-10-2026 hebben geen qty per regel: haal die dan uit
    // de products-array van de rij (zelfde volgorde als linesFromSale: een
    // eventuele behandelingsregel staat vóór de producten), anders op naam.
    const snapLines = Array.isArray(snap.lines) ? snap.lines : [];
    const items = Array.isArray(sale?.products) ? sale.products : [];
    const offset = snapLines.length - items.length;
    const qtyOf = (l, i) => {
      if (l.qty) return l.qty;
      const byIdx = offset >= 0 ? items[i - offset] : null;
      const it = byIdx && String(byIdx.name || "") === String(l.name || "") ? byIdx
        : items.find((x) => String(x.name || "") === String(l.name || ""));
      return (it && parseInt(it.qty)) || 1;
    };
    return {
      lines: snapLines.map((l, i) => ({ ...l, qty: qtyOf(l, i) })),
      byRate: snap.by_rate,
      taxableGross: snap.by_rate.reduce((s, r) => s + (Number(r.gross) || 0), 0),
      netTotal: Number(snap.net_total) || 0,
      taxTotal: Number(snap.tax_total) || 0,
      paidByVoucher: Number(snap.paid_by_voucher) || 0,
      grandTotal: Number(snap.grand_total) || 0,
      showTax: !!snap.show_tax,
      showTaxInternal: !!snap.registered && snap.by_rate.length > 0,
      label: snap.label || cfg?.label || "BTW",
      fromSnapshot: true,
    };
  }
  return { ...computeTax(linesFromSale(sale), cfg), fromSnapshot: false };
}

/**
 * Rapporten (omzet, productverkoop) rekenen per rij met de instellingen zoals
 * ze golden toen de rij bevroren werd (tax_snapshot), niet met die van
 * vandaag: wie op 1 september van de KOR af gaat, mag niet met terugwerkende
 * kracht BTW zien in januari t/m augustus. Per rij opnieuw rekenen in plaats
 * van de bevroren bedragen over te nemen, omdat een rapportrij kan afwijken van
 * de bevroren rij (het aandeel van één stylist, of een product dat er na het
 * afrekenen nog bij kwam); bij een ongewijzigde rij is de uitkomst gelijk aan
 * de snapshot. Tarieven van regelsoorten die niet in de snapshot staan komen
 * uit cfg. Zonder (geldige) snapshot: cfg zelf.
 */
export function cfgFromSnapshot(sale, cfg = {}) {
  const snap = sale?.tax_snapshot;
  if (!(snap && snap.v === 1 && Array.isArray(snap.by_rate))) return cfg || {};
  const lines = Array.isArray(snap.lines) ? snap.lines : [];
  const svc = lines.find((l) => SERVICE_KINDS.includes(l.kind));
  const prod = lines.find((l) => l.kind === "product");
  const registered = !!snap.registered;
  const serviceRate = svc ? Number(svc.rate) || 0 : Number(cfg?.serviceRate) || 0;
  const productRate = prod ? Number(prod.rate) || 0 : Number(cfg?.productRate) || 0;
  return {
    ...(cfg || {}),
    registered,
    serviceRate,
    productRate,
    showTaxInternal: registered && (serviceRate > 0 || productRate > 0),
  };
}
