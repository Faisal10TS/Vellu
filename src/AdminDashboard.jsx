// Platform admin dashboard. Gated by the `is_admin()` SQL function — every
// admin_* RPC it calls (zie `calls` in loadAll) raises 'forbidden' unless
// auth.uid() is in the app_admins table. So the frontend route check is
// just a UX fast-fail; security sits in the DB.
//
// Lazy-loaded from App.jsx so the ~10KB of admin-only code isn't in the
// bundle a regular owner or customer downloads.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import { useTheme, ACCENT, Layout, NavIcon, ThemeToggle, LangToggle, useDashboardScrollbars, currencyForCountry } from "./shared.jsx";
import { Star } from "./RateVellu.jsx";

const fmtEur = (n) => `€${Math.round(Number(n) || 0).toLocaleString("nl-NL")}`;
// Omzet van salons staat in hun eigen munt (NL €, Bonaire $, Curaçao XCG …):
// nooit bij elkaar optellen, nooit als euro tonen (review 12-11-2026: de
// homepage-kaart telde €19.737 + $13.132 + XCG 50 op tot "€32.919").
const fmtCur = (countryCode, n) => `${currencyForCountry(countryCode).symbol}${Math.round(Number(n) || 0).toLocaleString("nl-NL")}`;
// Bedragen per munt: [{ code, symbol, total }], euro eerst, daarna de grootste.
function totalsByCurrency(rows, amountOf) {
  const m = new Map();
  for (const r of rows) {
    const cur = currencyForCountry(r.country_code);
    const t = m.get(cur.code) || { code: cur.code, symbol: cur.symbol, total: 0 };
    t.total += Number(amountOf(r)) || 0;
    m.set(cur.code, t);
  }
  return [...m.values()].sort((a, b) => (b.code === "EUR") - (a.code === "EUR") || b.total - a.total);
}
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Spiegel van NO_BOOKINGS_AFTER_DAYS in supabase/functions/send-activation-nudges.
const NO_BOOKINGS_AFTER_DAYS = 4;

// Cron health: na hoeveel uur zonder hartslag een job als "gestopt" telt.
// Spiegel van MONITORED in supabase/functions/cron-watchdog/index.ts (daar
// mailt de waakhond); cron-watchdog zelf wordt door api/cron-health-check.js
// bewaakt, ook op 25 uur. Een job die hier ontbreekt telt 25 uur. Nieuwe job
// in MONITORED? Zet hem hier ook neer, dan valt hij op als hij nooit draaide.
const CRON_MAX_AGE_H = {
  "send-reminders": 25, "send-reminders-digest": 25, "send-followups": 25, "send-rebook-nudge": 25,
  "db-backup": 25, "check-pending-payments": 3, "prepay-watch": 3, "send-renewal-reminder": 25,
  "vercel-cron-health-check": 25, "send-birthday-emails": 25, "send-activation-nudges": 25, "cron-watchdog": 25,
};
// Stand van één job: "down" (rood: laatste run faalde, te lang stil of nooit
// gedraaid), "recovered" (oranje: fout of gedeeltelijk mislukt in de laatste 7
// dagen, laatste run ok) of "ok".
function cronState(j, now) {
  const maxH = CRON_MAX_AGE_H[j.job_name] ?? 25;
  const ageH = j.last_ran_at ? (now - new Date(j.last_ran_at).getTime()) / 3_600_000 : Infinity;
  const stale = ageH > maxH;
  const failed = j.last_status === "error";
  const level = j.missing || stale || failed ? "down" : (j.last_status === "degraded" || j.errors_last_7d > 0) ? "recovered" : "ok";
  return { level, stale, failed, ageH, maxH };
}
// Op de cent, voor de boekhouding (factuurlijst, btw-kaart).
const fmtEur2 = (n) => `€${(Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Periodesleutel uit een factuurdatum "YYYY-MM-DD".
const periodKeyOf = (kind, iso) => {
  const s = String(iso || "");
  const yy = s.slice(0, 4), mm = Number(s.slice(5, 7)) || 1;
  return kind === "month" ? `${yy}-${String(mm).padStart(2, "0")}` : kind === "quarter" ? `${yy}-Q${Math.floor((mm - 1) / 3) + 1}` : yy;
};
const periodLabelOf = (kind, key) => {
  if (kind === "month") { const [yy, mm] = key.split("-"); return new Date(Number(yy), Number(mm) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" }); }
  if (kind === "quarter") { const [yy, q] = key.split("-"); return `${q} ${yy}`; }
  return key;
};
// Opzegredenen: dezelfde sleutels als CANCEL_REASON_OPTIONS (OwnerApp) en de
// check op subscription_cancellations.reason.
const CANCEL_REASON_LABEL = {
  too_expensive: "Too expensive",
  not_enough_bookings: "Not enough clients or bookings yet",
  missing_feature: "Missing a feature",
  other_app: "Switching to another app",
  closing_business: "Closing or pausing the business",
  other: "Something else",
};
const cancelReasonLabel = (r) => (r ? CANCEL_REASON_LABEL[r] || r : "No reason given");
const isNlVat = (inv) => inv.vat_treatment === "nl_vat";
const treatmentLabel = (inv) => isNlVat(inv) ? "NL btw 21% (rubriek 1a)" : "Buiten de EU (niet in de aangifte)";

// Excel (eigen schrijver src/xlsx.js) en CSV van de facturen van één periode.
async function downloadInvoicesXlsx(invoices, periodLabel, fileKey) {
  const { buildXlsx, saveXlsx } = await import("./xlsx.js");
  const head = ["Factuurdatum", "Factuurnummer", "Salon", "Land", "Btw-nummer salon", "KvK salon", "Plan", "Interval", "Periode van", "Periode tot", "Omzet excl. btw", "Btw-tarief", "Btw", "Totaal", "Btw-behandeling", "Mollie-betaling"].map((v) => ({ v, s: "header" }));
  const body = invoices.map((i) => [
    { d: i.issued_on }, i.invoice_number || "", i.business_name || "", i.country_code || "", i.salon_btw_id || "", i.salon_kvk || "",
    i.plan || "", i.billing_interval || "", i.period_start ? { d: i.period_start } : "", i.period_end ? { d: i.period_end } : "",
    { v: r2(i.amount_excl_vat), s: "money" }, isNlVat(i) ? `${Math.round((Number(i.vat_rate) || 0) * 100)}%` : "—",
    { v: r2(i.vat_amount), s: "money" }, { v: r2(i.total_eur), s: "money" }, treatmentLabel(i), i.mollie_payment_id || "",
  ]);
  const last = body.length + 1;
  const sum = (col, v) => (body.length ? { f: `SUM(${col}2:${col}${last})`, v: r2(v), s: "moneyTotal" } : { v: 0, s: "moneyTotal" });
  const tot = (k) => invoices.reduce((s, i) => s + (Number(i[k]) || 0), 0);
  const totalRow = [null, null, null, null, null, null, null, null, null, { v: "Totaal", s: "textTotal" }, sum("K", tot("amount_excl_vat")), null, sum("M", tot("vat_amount")), sum("N", tot("total_eur")), null, null];
  const nl = invoices.filter(isNlVat), out = invoices.filter((i) => !isNlVat(i));
  const nlEx = r2(nl.reduce((s, i) => s + (Number(i.amount_excl_vat) || 0), 0));
  const nlVat = r2(nl.reduce((s, i) => s + (Number(i.vat_amount) || 0), 0));
  const outTot = r2(out.reduce((s, i) => s + (Number(i.total_eur) || 0), 0));
  const summary = [
    [{ v: "Btw-aangifte — abonnementsomzet Vellu", s: "title" }],
    ["Periode", null, periodLabel],
    [],
    [{ v: "Rubriek", s: "header" }, { v: "", s: "header" }, { v: "Omzet", s: "header" }, { v: "Btw", s: "header" }, { v: "Facturen", s: "header" }],
    ["1a Leveringen/diensten belast met hoog tarief", null, { v: nlEx, s: "money" }, { v: nlVat, s: "money" }, { v: nl.length, s: "int" }],
    ["Afgerond in hele euro's (in je voordeel)", null, { v: Math.floor(nlEx), s: "int" }, { v: Math.floor(nlVat), s: "int" }],
    [],
    ["Buiten de EU — niet in de aangifte", null, { v: outTot, s: "money" }, null, { v: out.length, s: "int" }],
    [],
    [{ v: "Rubriek 4a/4b en 5b komen uit je inkoopfacturen (Vercel, Supabase, Resend, Anthropic e.d.), niet uit Vellu.", s: "muted" }],
    [{ v: "Facturen naar een salon buiten Nederland mét btw erop: die btw staat op de factuur en moet je afdragen (art. 37 Wet OB).", s: "muted" }],
    [{ v: "Vellu geeft geen fiscaal advies; laat de aangifte zo nodig controleren door een boekhouder.", s: "muted" }],
  ];
  const sheets = [
    { name: "Btw-aangifte", cols: [44, 4, 14, 12, 10], rows: summary, landscape: false },
    { name: "Facturen", cols: [12, 15, 24, 6, 18, 11, 12, 9, 12, 12, 14, 9, 11, 12, 30, 24], rows: [head, ...body, totalRow], freeze: true, filter: Math.max(1, last), printTitleRow: 1, header: `Facturen Vellu · ${periodLabel}`, footer: "Pagina &P / &N" },
  ];
  saveXlsx(`vellu-facturen-${fileKey}.xlsx`, buildXlsx({ sheets, currencySymbol: "€" }));
}
function downloadInvoicesCsv(invoices, fileKey) {
  const money = (n) => r2(n).toFixed(2).replace(".", ",");
  const esc = (v) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [
    ["Factuurdatum", "Factuurnummer", "Salon", "Land", "Btw-nummer salon", "KvK salon", "Plan", "Interval", "Periode van", "Periode tot", "Omzet excl. btw", "Btw-tarief", "Btw", "Totaal", "Btw-behandeling", "Mollie-betaling"],
    ...invoices.map((i) => [i.issued_on, i.invoice_number, i.business_name, i.country_code, i.salon_btw_id, i.salon_kvk, i.plan, i.billing_interval, i.period_start, i.period_end,
      money(i.amount_excl_vat), isNlVat(i) ? `${Math.round((Number(i.vat_rate) || 0) * 100)}%` : "", money(i.vat_amount), money(i.total_eur), treatmentLabel(i), i.mollie_payment_id]),
  ].map((row) => row.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `vellu-facturen-${fileKey}.csv`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const relTime = (iso) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d ago`;
  return fmtDate(iso);
};

// Coloured pill for a salon's subscription state. `churning` (cancel at period
// end) overrides — a still-paying-but-leaving customer is the one to chase.
// `everPaid`: de salon heeft ooit een factuur betaald. past_due zonder ooit te
// betalen = de proef is afgelopen zonder dat er een plan gekozen werd (de
// win-back-lijst); past_due na eerdere betalingen = een afschrijving mislukte.
function statusBadge(classification, churning, c, accent, everPaid = false) {
  if (churning) return { label: "churning", color: c.danger };
  switch (classification) {
    case "paying": return { label: "paying", color: c.success };
    case "trialing": return { label: "trial", color: accent };
    case "comped": return { label: "comped", color: c.textSub };
    case "cancelled": return { label: "cancelled", color: c.danger };
    case "expired": return { label: "expired", color: c.danger };
    case "past_due": return everPaid ? { label: "payment failed", color: c.danger } : { label: "trial ended", color: c.warning };
    case "none": return { label: "no trial", color: c.textMuted };
    default: return { label: classification || "none", color: c.textMuted };
  }
}
// Zelfde woorden als statusBadge, voor een kale subscription_status.
const statusText = (status, everPaid) => status === "past_due" ? (everPaid ? "payment failed" : "trial ended") : status === "trialing" ? "trial" : status || "no trial";
// Automatische mails over het account (admin_lifecycle_emails): soort → tekst.
const EMAIL_KIND_LABEL = {
  no_services: "Activation: add your services",
  no_bookings: "Activation: get your first bookings",
  trial_ending: "Trial ends in 3 days",
  trial_expired: "Trial has ended",
  trial_autopay_ending: "Auto-pay starts in 3 days",
  trial_autopay_today: "Auto-pay charged today",
  renewal: "Yearly plan: renew now",
};
const emailKindLabel = (k) => EMAIL_KIND_LABEL[k] || k;
// Salons-tab: eerste klik op een kolom sorteert tekst/status oplopend, getallen en datums aflopend.
const SORT_DEFAULT_DIR = { name: 1, status: 1, staff: -1, appts: -1, revenue: -1, seen: -1, booking: -1, created: -1 };
const EMAIL_KIND_SHORT = {
  no_services: "Add services", no_bookings: "First bookings", trial_ending: "Trial ends soon", trial_expired: "Trial ended",
  trial_autopay_ending: "Auto-pay soon", trial_autopay_today: "Auto-pay today", renewal: "Renew (yearly)",
};
// Mollie-gebeurtenis → { label, tone } in gewone woorden.
function paymentLabel(e) {
  const zero = Number(e.amount_eur) === 0;
  switch (e.event_type) {
    case "first_payment.created": return { label: "Checkout opened, no result yet", tone: "muted" };
    case "first.paid": return zero ? { label: "Auto-pay set up (card linked, €0)", tone: "ok" } : { label: "First payment", tone: "ok" };
    case "first.expired": return { label: "Checkout not finished", tone: "warn" };
    case "oneoff.paid": return { label: "Yearly payment", tone: "ok" };
    case "oneoff.expired": return { label: "Yearly checkout not finished", tone: "warn" };
    case "recurring.paid": return { label: "Monthly charge", tone: "ok" };
    case "recurring.failed": return { label: "Charge failed", tone: "bad" };
    case "subscription.changed": return { label: "Subscription changed", tone: "muted" };
    default: return { label: e.event_type, tone: e.status === "paid" ? "ok" : e.status === "failed" ? "bad" : e.status === "expired" ? "warn" : "muted" };
  }
}
// De "checkout geopend"-regel van een betaling die daarna betaald of
// verlopen is, zegt niets extra: weg. Wat overblijft staat echt nog open.
function collapsePayments(events) {
  const settled = new Set(events.filter(e => e.event_type !== "first_payment.created" && e.mollie_payment_id).map(e => e.mollie_payment_id));
  return events.filter(e => !(e.event_type === "first_payment.created" && e.mollie_payment_id && settled.has(e.mollie_payment_id)));
}
function StatusPill({ badge }) {
  return <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: badge.color, background: `${badge.color}1a`, borderRadius: 6, padding: "3px 10px", whiteSpace: "nowrap" }}>{badge.label}</span>;
}

function StatCard({ label, value, sub, accent, c }) {
  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16,
      padding: "18px 20px", flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboard({ onLogout }) {
  const { colors: c } = useTheme();
  useDashboardScrollbars();
  const accent = ACCENT;
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(null); // null = loading, false = denied, true = ok
  const [loadErrors, setLoadErrors] = useState([]); // [{ fn, message }] van RPC's die faalden
  const [loaded, setLoaded] = useState(false); // alle RPC's teruggekomen (goed of fout)
  const [loadedAt, setLoadedAt] = useState(null); // tijdstip van de laatste volledige lading
  const [refreshing, setRefreshing] = useState(false);
  const loadSeq = useRef(0);
  const [overview, setOverview] = useState(null);
  const [salons, setSalons] = useState([]);
  // Salon deactiveren / verwijderen (23-10-2026): { kind, salon } of null.
  const [salonAction, setSalonAction] = useState(null);
  const [salonActionBusy, setSalonActionBusy] = useState(false);
  const [salonActionMsg, setSalonActionMsg] = useState("");
  const [salonReason, setSalonReason] = useState("");
  const [salonConfirm, setSalonConfirm] = useState("");
  const [recent, setRecent] = useState([]);
  const [cron, setCron] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [billing, setBilling] = useState(null);
  const [subs, setSubs] = useState([]);
  // Abonnementsomzet per maand/kwartaal/jaar (admin_subscription_revenue,
  // 06-10-2026: "how much I make a month, a year and quarterly off Vellu
  // subscriptions") — echt geïnde facturen, demo's uitgesloten.
  // 12-10-2026: per factuur (admin_subscription_invoices) voor de boekhouding;
  // de periodesommen rekent het blok zelf, met de splitsing btw-omzet / buiten
  // de EU, een factuurlijst per periode, een btw-aangiftekaart en Excel/CSV.
  const [subInvoices, setSubInvoices] = useState([]);
  const [revView, setRevView] = useState("quarter"); // month | quarter | year
  const [revSel, setRevSel] = useState(null); // gekozen periode (sleutel), null = automatisch
  // Opzeggingen met de optionele reden uit het opzegvenster (14-10-2026,
  // admin_subscription_cancellations), nieuwste eerst.
  const [cancellations, setCancellations] = useState([]);
  // "Beoordeel Vellu" (16-09-2026): cijfers + toelichting van saloneigenaren,
  // met de knop om een citaat op vellu.cc te zetten (alleen als de salon dat
  // toestond). Zie RateVellu.jsx en migratie beoordeel_vellu.
  const [ratings, setRatings] = useState([]);
  // Uitnodigingen voor de beoordelingsmail: wie is gemaild, wie opende de
  // pagina, wie antwoordde (admin_rating_invites).
  const [invites, setInvites] = useState([]);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [me, setMe] = useState(null); // e-mail van de ingelogde beheerder (voor de testmail)
  // Schakelaar: staat het gemiddelde (+ gepubliceerde citaten) op vellu.cc?
  // Standaard uit — antwoorden zijn nooit publiek, alleen hier te lezen.
  const [siteOn, setSiteOn] = useState(false);
  const [siteBusy, setSiteBusy] = useState(false);
  const [tab, setTab] = useState("overview"); // overview | billing | salons | signups | onboarding | ratings | cron
  // Onboarding (24-10-2026): salons die vastlopen (geen diensten / geen
  // boekingen) en de geüploade prijslijsten (parse-price-list).
  const [onboarding, setOnboarding] = useState([]);
  const [priceImports, setPriceImports] = useState([]);
  // Ronde 3 (12-11-2026): Mollie-gebeurtenissen (admin_payment_events, 120
  // dagen) en de automatische mails over het account (admin_lifecycle_emails).
  const [payEvents, setPayEvents] = useState([]);
  const [lifeEmails, setLifeEmails] = useState([]);
  const [payFilter, setPayFilter] = useState("all"); // all | problems
  const [payShown, setPayShown] = useState(25);
  // Salons-tab sorteren en het detailpaneel (salon-id of null).
  const [salonSort, setSalonSort] = useState({ key: "created", dir: -1 });
  const [detailId, setDetailId] = useState(null);
  const [fileBusy, setFileBusy] = useState("");
  const [search, setSearch] = useState("");
  // Het peilmoment waar de trial-window tegen afgerekend wordt. Staat bewust in
  // state en niet los in de JSX: met Date.now() midden in de render schoof de
  // 14-dagengrens mee met elke willekeurige re-render — heen en weer klikken
  // tussen de tabs volstond — zodat dezelfde onveranderde `subs` twee keer een
  // andere lijst kon opleveren.
  const [now, setNow] = useState(() => Date.now());

  // Alle cijfers in één keer (parallel) ophalen. Bij het openen en via de knop
  // Refresh (12-11-2026: daarvoor laadde de pagina alleen bij openen, dus wie
  // hem de hele dag open had keek naar cijfers van vanochtend). Een RPC die
  // faalt laat zijn vorige gegevens staan en komt in de foutbalk; alleen bij
  // de eerste lading is dat deel dan leeg. loadSeq: een latere lading (of het
  // sluiten van de pagina) maakt het antwoord van een eerdere ongeldig.
  const loadAll = useCallback(async () => {
    const seq = ++loadSeq.current;
    setRefreshing(true);
    try {
      const calls = [
        ["admin_overview"],
        ["admin_salons_list"],
        ["admin_recent_signups", { p_days: 30 }],
        ["admin_cron_summary"],
        ["admin_revenue_timeline", { p_days: 30 }],
        ["admin_billing_overview"],
        ["admin_subscriptions_list"],
        ["admin_app_ratings"],
        ["admin_rating_invites"],
        ["admin_rating_site_visibility"],
        ["admin_subscription_invoices"],
        ["admin_subscription_cancellations"],
        ["admin_onboarding"],
        ["admin_price_list_imports"],
        ["admin_payment_events", { p_days: 120 }],
        ["admin_lifecycle_emails"],
      ];
      const results = await Promise.all(calls.map(([fn, args]) => supabase.rpc(fn, args).then(r => r, e => ({ data: null, error: { message: String(e?.message || e) } }))));
      if (seq !== loadSeq.current) return;
      const [ov, sl, rs, cr, tl, bo, sb, ar, ai, sv, sr, sc, ob, pi, pe, le] = results;
      // Een kapotte RPC gaf vroeger alleen een lege tab (augustus 2026: drie
      // tabs wekenlang leeg zonder melding). Nu staat bovenaan wat niet laadde.
      setLoadErrors(results.map((r, i) => r.error ? { fn: calls[i][0], message: r.error.message || String(r.error.code || "error") } : null).filter(Boolean));
      const put = (r, set, pick = (d) => d || []) => { if (!r.error) set(pick(r.data)); };
      put(ov, setOverview, d => d?.[0] || null);
      put(sl, setSalons);
      put(rs, setRecent);
      put(cr, setCron);
      put(tl, setTimeline);
      put(bo, setBilling, d => d?.[0] || null);
      put(sb, setSubs);
      put(sr, setSubInvoices);
      put(sc, setCancellations);
      put(ar, setRatings);
      put(ai, setInvites);
      put(sv, setSiteOn, d => !!d);
      put(ob, setOnboarding);
      put(pi, setPriceImports);
      put(pe, setPayEvents);
      put(le, setLifeEmails);
      setLoaded(true);
      setLoadedAt(Date.now());
      setNow(Date.now());
    } finally {
      if (seq === loadSeq.current) setRefreshing(false);
    }
  }, []);

  // Gate on is_admin(), dan alles laden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: adminCheck, error: adminErr } = await supabase.rpc("is_admin");
      if (cancelled) return;
      if (adminErr || !adminCheck) {
        setIsAdmin(false);
        return;
      }
      setIsAdmin(true);
      loadAll();
    })();
    return () => { cancelled = true; loadSeq.current++; };
  }, [loadAll]);

  // Het peilmoment één keer vastzetten bij het laden zou een dashboard dat de
  // hele dag openstaat laten stilstaan: een trial die vanmiddag de
  // 14-dagengrens binnenkomt verschijnt dan pas na F5 — precies de
  // conversiekans die het blok hieronder moet opvangen. Vandaar een uurtik,
  // ruim fijn genoeg voor een venster van veertien dagen. Geen renderlus: de
  // dependency-array is leeg, dus setNow zet dit effect niet opnieuw op.
  //
  // Bewust géén her-fetch van de RPC's bij die tik (daarvoor is er sinds
  // 12-11-2026 de knop Refresh, die ook `now` bijzet). Gevolg: de lijst hieronder
  // loopt na een paar uur openstaan vóór op de statkaart "N ending in 14 days",
  // die uit admin_billing_overview komt en bij het laden bevroor. Dat verschil
  // bestond al — de oude inline Date.now() dreef bij élke re-render weg — en is
  // nu alleen voorspelbaar; zeven RPC's per uur per open dashboard wegen niet
  // op tegen die ene eenheid. De relTime-labels elders op de pagina liften mee
  // op deze re-render, maar reken daar niet op: op uurbasis blijft "12m ago"
  // tot een uur staan.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3_600_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data?.user?.email || null)).catch(() => {});
  }, []);
  // Detailpaneel sluit met Escape.
  useEffect(() => {
    if (!detailId) return;
    const onKey = (e) => { if (e.key === "Escape") setDetailId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId]);

  // Beoordelingsmail versturen (edge function send-rating-request, met de
  // JWT van de beheerder). mode: "test" (naar mijn eigen adres), "send"
  // (alle salons die 'm nog niet kregen), of "send" met only = [owner_id]
  // (één salon, ook opnieuw). Daarna de uitnodigingslijst verversen.
  const toggleSite = async () => {
    if (siteBusy) return;
    const next = !siteOn;
    if (next && !window.confirm("Show the average rating (and any quotes you published) on vellu.cc? Individual answers stay private either way.")) return;
    setSiteBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_rating_site_visibility", { p_on: next });
      if (error) { window.alert(error.message); return; }
      setSiteOn(!!data);
    } finally { setSiteBusy(false); }
  };

  // Salon deactiveren / heractiveren / definitief verwijderen (23-10-2026,
  // edge function admin-salon). Eerst deactiveren (terug te draaien); verwijderen
  // kan pas daarna en vraagt de salonnaam of slug ter bevestiging.
  const runSalonAction = async () => {
    if (!salonAction || salonActionBusy) return;
    const { kind, salon } = salonAction;
    setSalonActionBusy(true); setSalonActionMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("admin-salon", {
        body: { action: kind, owner_id: salon.id, reason: kind === "deactivate" ? salonReason : undefined, confirm: kind === "delete" ? salonConfirm : undefined },
      });
      let res = data;
      if (error) { try { res = await error.context?.json?.(); } catch { res = null; } }
      if (error || res?.error) {
        const code = res?.error || error?.message || "unknown";
        const why = {
          mollie_failed: `Mollie could not be stopped (${(res?.detail || []).join(", ")}). Nothing was changed in Vellu (some Mollie items may already be stopped); try again or stop it in the Mollie dashboard.`,
          unban_failed: `Logins could not be unblocked (${(res?.detail || []).join(", ")}). The salon is still deactivated; try again.`,
          confirm_mismatch: "The name you typed does not match this salon. Nothing was deleted.",
          not_deactivated: "Deactivate the salon first.",
          demo: "The demo salon cannot be changed here.",
          unauthorized: "You are not signed in as admin (refresh the page).",
          delete_failed: `Deleting failed: ${res?.detail || ""}. The salon's data is still there.`,
          owner_is_staff_elsewhere: "This login is also a team member at another salon, so it cannot be deleted here. Nothing was deleted.",
        }[code] || `Failed: ${code}${res?.detail ? ` (${typeof res.detail === "string" ? res.detail : JSON.stringify(res.detail)})` : ""}`;
        // Venster dicht, anders staat de melding erachter.
        setSalonActionMsg(why); setSalonAction(null);
        return;
      }
      const name = salon.business_name || salon.slug;
      const warn = res?.warnings?.length ? ` Warnings: ${res.warnings.join("; ")}` : "";
      setSalonActionMsg(kind === "deactivate"
        ? `${name} is deactivated${res?.already ? " (already was)" : ""}. Billing stopped, booking page closed, ${res?.logins_blocked ?? 1} login(s) blocked.${warn}`
        : kind === "reactivate"
        ? `${name} is active again. If their paid period is over, they choose a plan in the app.${warn}`
        : `${name} is deleted: ${res?.removed?.appointments ?? 0} appointments, ${res?.removed?.services ?? 0} services, ${res?.removed?.files ?? 0} files, ${res?.removed?.staff_logins ?? 0} staff logins. Kept: ${res?.invoices_kept ?? 0} invoice(s) for your bookkeeping.${warn}`);
      setSalonAction(null); setSalonReason(""); setSalonConfirm("");
      // Alles opnieuw: de salon verdwijnt ook uit onboarding, aandacht e.d.
      await loadAll();
    } finally { setSalonActionBusy(false); }
  };

  const sendInvites = async (mode, only, testLang = "en") => {
    if (sendBusy) return;
    if (mode === "send") {
      const n = only ? only.length : invites.filter(i => !i.sent_at).length;
      if (n === 0) { setSendMsg("Nothing to send: every salon already received it. Use Resend per salon."); return; }
      const who = only ? (invites.find(i => i.owner_id === only[0])?.business_name || "this salon") : `${n} salon${n === 1 ? "" : "s"} that did not get it yet`;
      if (!window.confirm(`Send the rating email to ${who} now?`)) return;
    }
    setSendBusy(true); setSendMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("send-rating-request", { body: { mode, only_owners: only || null, test_to: mode === "test" ? me : null, test_lang: testLang } });
      if (error || data?.error) { setSendMsg(`Failed: ${error?.message || data?.error}`); return; }
      if (mode === "test") setSendMsg(`Test (${testLang.toUpperCase()}) sent to ${me}.`);
      else {
        const failed = (data?.results || []).filter(r => !r.ok);
        setSendMsg(`Sent ${data?.sent ?? 0}${failed.length ? `, failed ${failed.length}: ${failed.map(f => f.salon).join(", ")}` : ""}${data?.skipped?.length ? ` · skipped ${data.skipped.length} (already sent)` : ""}.`);
      }
      const { data: ai } = await supabase.rpc("admin_rating_invites");
      setInvites(ai || []);
    } finally { setSendBusy(false); }
  };

  // Trials die binnen 14 dagen aflopen. Stond twee keer letterlijk in de JSX
  // (één keer voor de `.length > 0`-check, één keer voor de rijen); met een
  // peilmoment dat per aanroep verschilde konden die twee het in theorie
  // oneens zijn — een kop zonder rijen eronder. Nu delen ze één berekening.
  // De voorwaarde spiegelt bewust die van trials_ending_14d in
  // admin_billing_overview (status trialing, trial_ends_at gezet en <= nu + 14
  // dagen — óók als die datum al verstreken is), zodat kaart en lijst bij het
  // laden hetzelfde zeggen. Verschuif je de grens hier, verschuif hem daar mee.
  const endingTrials = useMemo(
    () => subs.filter(s =>
      s.classification === "trialing" &&
      s.trial_ends_at &&
      new Date(s.trial_ends_at).getTime() <= now + 14 * 864e5
    ),
    [subs, now],
  );
  // Laatste opzegging per salon (de lijst komt nieuwste eerst binnen).
  const lastCancelByOwner = useMemo(() => {
    const m = new Map();
    for (const x of cancellations) if (!m.has(x.owner_id)) m.set(x.owner_id, x);
    return m;
  }, [cancellations]);

  if (isAdmin === null) {
    return (
      <Layout accent={accent}>
        <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", color: c.textLabel, fontSize: 13 }}>
          Loading admin…
        </div>
      </Layout>
    );
  }

  if (isAdmin === false) {
    return (
      <Layout accent={accent}>
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: c.text, gap: 16, padding: 24, textAlign: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>Not authorised</div>
          <div style={{ fontSize: 13, color: c.textSub, maxWidth: 360 }}>
            You don't have admin access.
          </div>
          <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => navigate("/")}>Back to home</button>
        </div>
      </Layout>
    );
  }

  // Filtered salons (client-side search so small dataset is fine)
  const q = search.trim().toLowerCase();
  const visibleSalons = q
    ? salons.filter(s => (s.business_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q) || (s.slug || "").toLowerCase().includes(q) || (s.city || "").toLowerCase().includes(q))
    : salons;

  // Onboarding: wie loopt vast? Geen zichtbare diensten (boekingspagina leeg),
  // of vier dagen na aanmelden hooguit één afspraak: dezelfde regel als de
  // activatiemail (send-activation-nudges, NO_BOOKINGS_AFTER_DAYS). Tot
  // 12-11-2026 stond hier "0 afspraken na drie dagen", zodat Aura Glow Nails
  // en Bee Bare de mail kregen maar hier niet als vastgelopen stonden.
  // Verschil dat blijft: de mail telt kassaverkopen niet mee, appts wel (op
  // 12-11 scheelde dat voor geen enkele salon onder de grens).
  const stuck = onboarding
    .map(o => ({ ...o, why: !o.visible_services ? "no_services" : ((o.appts || 0) <= 1 && now - new Date(o.created_at).getTime() >= NO_BOOKINGS_AFTER_DAYS * 864e5) ? "no_bookings" : null }))
    .filter(o => o.why);
  // Getekende link (10 min) naar een geüploade prijslijst in de privébucket.
  const openPriceFile = async (path) => {
    if (fileBusy) return;
    setFileBusy(path);
    // Tabblad meteen bij de klik openen (anders houdt de pop-upblokker hem
    // tegen na het wachten), daarna de link erin zetten.
    const w = window.open("about:blank", "_blank");
    try {
      const { data, error } = await supabase.storage.from("price-lists").createSignedUrl(path, 600);
      if (error || !data?.signedUrl) { w?.close(); window.alert(`Could not open the file: ${error?.message || "unknown"}`); return; }
      if (w) { w.opener = null; w.location.href = data.signedUrl; } else window.open(data.signedUrl, "_blank");
    } finally { setFileBusy(""); }
  };

  // Salons die ooit een factuur betaalden. past_due betekent bij hen een
  // mislukte afschrijving, bij de rest een proef die afliep zonder plan.
  const paidOwners = new Set(subInvoices.filter(i => Number(i.total_eur) > 0).map(i => i.salon_id).filter(Boolean));
  const liveSalons = salons.filter(s => !s.deactivated_at);
  const trialEnded = liveSalons.filter(s => s.subscription_status === "past_due" && !paidOwners.has(s.id));
  const paymentFailed = liveSalons.filter(s => s.subscription_status === "past_due" && paidOwners.has(s.id));
  // Stand van een salon in de aanmeldlijsten (12-11-2026): daar stond het
  // plan, en sinds de automatische proef heeft iedereen "professional".
  // Bron = admin_subscriptions_list (betalend vs. comped), anders de kale
  // subscription_status uit de salonlijst.
  const subById = new Map(subs.map(s => [s.id, s]));
  // Salonnaam die het detailpaneel opent (Salons, Signups, Onboarding, Revenue, aandacht).
  const salonBtn = (id, label, style = {}) => (
    <button type="button" data-salon-open={id} onClick={() => setDetailId(id)}
      style={{ background: "none", border: "none", padding: 0, font: "inherit", color: c.text, cursor: "pointer", textAlign: "left", textDecoration: "underline dotted", textUnderlineOffset: 3, ...style }}>{label}</button>
  );
  const salonById = new Map(salons.map(s => [s.id, s]));
  const signupStatus = (id) => {
    const everPaid = paidOwners.has(id);
    if (salonById.get(id)?.deactivated_at) return { badge: { label: "deactivated", color: c.textMuted }, note: null };
    const s = subById.get(id);
    if (s) {
      const note = s.churning ? (s.plan_expires_at ? `ends ${fmtDate(s.plan_expires_at)}` : null)
        : s.classification === "trialing" ? (s.trial_ends_at ? `until ${fmtDate(s.trial_ends_at)}` : null)
        : s.classification === "past_due" && !everPaid ? (s.trial_ends_at ? `ended ${fmtDate(s.trial_ends_at)}` : null)
        : null;
      return { badge: statusBadge(s.classification, s.churning, c, accent, everPaid), note };
    }
    return { badge: { label: statusText(salonById.get(id)?.subscription_status, everPaid), color: c.textMuted }, note: null };
  };
  // Omzet van salons (voltooide afspraken), per munt.
  const salonRevenue = totalsByCurrency(salons, s => s.total_revenue).filter(t => Math.round(t.total) !== 0);

  // Cron: elke job uit de lijst plus de bewaakte jobs die nog nooit een
  // hartslag schreven; rood bovenaan. Alleen als de RPC echt laadde, anders
  // zou een mislukte lading alles als "nooit gedraaid" tonen.
  const cronLoaded = loaded && !loadErrors.some(e => e.fn === "admin_cron_summary");
  const cronRank = { down: 0, recovered: 1, ok: 2 };
  const cronRows = [
    ...cron,
    ...(cronLoaded ? Object.keys(CRON_MAX_AGE_H).filter(n => !cron.some(j => j.job_name === n)).map(n => ({ job_name: n, missing: true, runs_last_7d: 0, errors_last_7d: 0, total_items_processed_7d: 0 })) : []),
  ].map(j => ({ ...j, st: cronState(j, now) }))
    .sort((a, b) => cronRank[a.st.level] - cronRank[b.st.level] || a.job_name.localeCompare(b.job_name));
  const cronDown = cronRows.filter(j => j.st.level === "down").length;

  // "Needs attention" (12-11-2026): alles waar een actie bij hoort op één
  // plek bovenaan Overview, ernstigste eerst. Elke regel verwijst naar de tab
  // met de details. Een salon met een afgelopen proef of mislukte betaling
  // staat niet nóg eens onder "stuck in onboarding".
  const nameOf = (s) => String(s.business_name || s.slug || "").trim() || "(no name)";
  const dayOf = (iso) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  const within = (iso, days) => !!iso && new Date(iso).getTime() <= now + days * 864e5;
  const subsLive = subs.filter(s => !salonById.get(s.id)?.deactivated_at);

  // Betalingen (ronde 3): feed zonder de overbodige "checkout geopend"-regels,
  // en per salon de laatste echte poging (feed = nieuwste eerst).
  const payFeed = collapsePayments(payEvents);
  // Afgebroken/mislukt maar daarna toch betaald ("paid later"). Gerekend vanaf
  // het openen van de checkout: Get Niq'd Up opende op 24-10 twee checkouts,
  // betaalde de tweede en de eerste verliep pas daarna.
  const openedAt = new Map(payEvents.filter(e => e.event_type === "first_payment.created" && e.mollie_payment_id).map(e => [e.mollie_payment_id, e.created_at]));
  const paidLaterOf = (e) => {
    if (e.status !== "expired" && e.status !== "failed") return false;
    const from = openedAt.get(e.mollie_payment_id) || e.created_at;
    return payFeed.some(x => x.owner_id === e.owner_id && x.status === "paid" && Number(x.amount_eur) > 0 && x.created_at > from);
  };
  const lastTry = new Map();
  for (const e of payFeed) {
    if (!e.owner_id || e.event_type === "subscription.changed" || e.event_type === "first_payment.created") continue;
    if (!lastTry.has(e.owner_id)) lastTry.set(e.owner_id, e);
  }
  // Wilde betalen maar het lukte niet (laatste 14 dagen): een afgebroken
  // checkout bij een salon die nu niet betaalt, of een mislukte afschrijving.
  const unfinished = [...lastTry.values()].filter(e =>
    now - new Date(e.created_at).getTime() <= 14 * 864e5 &&
    !salonById.get(e.owner_id)?.deactivated_at &&
    !paidLaterOf(e) &&
    (e.status === "failed" || (e.status === "expired" && subById.get(e.owner_id)?.classification !== "paying")));
  // Automatische mails per salon, nieuwste eerst (zo komen ze uit de RPC).
  const emailsByOwner = new Map();
  for (const m of lifeEmails) { const a = emailsByOwner.get(m.owner_id) || []; a.push(m); emailsByOwner.set(m.owner_id, a); }
  const lastNudge = (id) => (emailsByOwner.get(id) || []).find(m => m.kind === "no_services" || m.kind === "no_bookings");

  // Elke regel: items { id, name, extra }; met id opent de naam het detailpaneel.
  const unfinishedIds = new Set(unfinished.map(e => e.owner_id));
  const listedBilling = new Set([...trialEnded, ...paymentFailed].map(s => s.id));
  const it = (s, extra) => ({ id: s.id, name: nameOf(s), extra });
  const attention = [
    { key: "cron", tone: "danger", tab: "cron", tabLabel: "Cron health", title: "Cron job stopped or failing",
      items: cronRows.filter(j => j.st.level === "down").map(j => ({ name: j.job_name })) },
    { key: "payment_failed", tone: "danger", tab: "billing", tabLabel: "Revenue", title: "Payment failed",
      items: paymentFailed.map(s => it(s, s.plan_expires_at ? `unpaid since ${dayOf(s.plan_expires_at)}` : null)) },
    { key: "unfinished", tone: "warning", tab: "billing", tabLabel: "Revenue", title: "Tried to pay, did not finish",
      items: unfinished.map(e => it(salonById.get(e.owner_id) || { id: e.owner_id, business_name: e.business_name, slug: e.slug }, `${paymentLabel(e).label.toLowerCase()}, ${dayOf(e.created_at)}`)) },
    { key: "leaving", tone: "warning", tab: "billing", tabLabel: "Revenue", title: "Cancelled, access still running",
      items: subsLive.filter(s => s.churning).map(s => it(s, s.plan_expires_at ? `ends ${dayOf(s.plan_expires_at)}` : null)) },
    { key: "trial_ended", tone: "warning", tab: "billing", tabLabel: "Revenue", title: "Trial ended without a plan",
      items: trialEnded.filter(s => !unfinishedIds.has(s.id)).map(s => { const t = subById.get(s.id)?.trial_ends_at; return it(s, t ? dayOf(t) : null); }) },
    { key: "stuck", tone: "warning", tab: "onboarding", tabLabel: "Onboarding", title: "Stuck in onboarding",
      items: stuck.filter(o => !listedBilling.has(o.id) && !unfinishedIds.has(o.id)).map(o => {
        const n = lastNudge(o.id);
        return it(o, `${o.why === "no_services" ? "no services" : o.appts ? "1 booking" : "no bookings"}${n ? `, emailed ${dayOf(n.sent_at)}` : ""}`);
      }) },
    { key: "trial_ending", tone: "info", tab: "billing", tabLabel: "Revenue", title: "Trial ends within 7 days",
      items: subsLive.filter(s => s.classification === "trialing" && within(s.trial_ends_at, 7)).map(s => it(s, dayOf(s.trial_ends_at))) },
    { key: "renewing", tone: "quiet", tab: "billing", tabLabel: "Revenue", title: "Renews within 7 days",
      items: subsLive.filter(s => s.classification === "paying" && !s.churning && within(s.plan_expires_at, 7))
        .sort((a, b) => new Date(a.plan_expires_at) - new Date(b.plan_expires_at))
        .map(s => it(s, `${dayOf(s.plan_expires_at)}${s.billing_interval === "yearly" ? ", yearly: pays by link" : ""}`)) },
  ].filter(a => a.items.length);
  const toneColor = { danger: c.danger, warning: c.warning, info: accent, quiet: c.textSub };

  // Salons-tab sorteren (ronde 3). Status: problemen bovenaan.
  const STATUS_RANK = { "payment failed": 0, "trial ended": 1, churning: 2, trial: 3, "no trial": 4, comped: 5, paying: 6, deactivated: 7 };
  const ts = (iso) => (iso ? new Date(iso).getTime() : 0);
  const sortVal = {
    name: s => nameOf(s).toLowerCase(),
    status: s => STATUS_RANK[signupStatus(s.id).badge.label] ?? 8,
    staff: s => s.staff_count || 0,
    appts: s => s.appt_count || 0,
    revenue: s => Number(s.total_revenue) || 0,
    seen: s => ts(s.last_seen),
    booking: s => ts(s.last_activity),
    created: s => ts(s.created_at),
  };
  const sortedSalons = [...visibleSalons].sort((a, b) => {
    const f = sortVal[salonSort.key] || sortVal.created;
    const va = f(a), vb = f(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * salonSort.dir || ts(b.created_at) - ts(a.created_at);
  });

  // Omzet van salons per dag, één lijn per munt (bedragen niet omgerekend).
  // Vaste as van 30 dagen t/m vandaag; dagen zonder afspraken tellen als 0.
  // Toekomstige dagen vallen weg: de RPC gaf tot 12-11-2026 ook afspraken tot
  // maanden vooruit mee, waardoor de lijn na vandaag naar nul zakte.
  const sparkline = (() => {
    if (!timeline.length) return null;
    const days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(localIso(d)); }
    const idx = new Map(days.map((d, i) => [d, i]));
    const series = new Map();
    for (const r of timeline) {
      const i = idx.get(String(r.day).slice(0, 10));
      if (i == null) continue;
      const cur = currencyForCountry(r.country_code);
      const s = series.get(cur.code) || { code: cur.code, symbol: cur.symbol, vals: days.map(() => 0), total: 0 };
      s.vals[i] += Number(r.revenue) || 0;
      s.total += Number(r.revenue) || 0;
      series.set(cur.code, s);
    }
    const list = [...series.values()].filter(s => s.total > 0).sort((a, b) => (b.code === "EUR") - (a.code === "EUR") || b.total - a.total);
    if (!list.length) return null;
    const W = 720, H = 80, pad = 4;
    const max = Math.max(1, ...list.flatMap(s => s.vals));
    const X = (i) => pad + (i / (days.length - 1)) * (W - pad * 2);
    const Y = (v) => H - pad - (v / max) * (H - pad * 2);
    const colors = [accent, c.textSub, c.warning, c.textMuted];
    const dashes = [undefined, "6 4", "2 3", "8 3 2 3"];
    const lines = list.map((s, k) => {
      const path = s.vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
      return { ...s, path, area: `${path} L${X(days.length - 1).toFixed(1)},${H - pad} L${X(0).toFixed(1)},${H - pad} Z`, color: colors[k % colors.length], dash: dashes[k % dashes.length] };
    });
    const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
    return { lines, W, H, first: dayLabel(days[0]), last: dayLabel(days[days.length - 1]) };
  })();

  return (
    <Layout accent={accent} maxWidth="100%">
      <div style={{ minHeight: "100dvh", background: c.bg, color: c.text, fontFamily: "'Jost',sans-serif", padding: "24px 28px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: accent, marginBottom: 6 }}>Vellu Admin</div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>Platform overview</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span data-admin-updated style={{ fontSize: 11, color: c.textMuted, whiteSpace: "nowrap" }} title={loadedAt ? new Date(loadedAt).toLocaleString("nl-NL") : undefined}>
              {refreshing ? "Loading…" : loadedAt ? `Updated ${new Date(loadedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
            <button type="button" data-admin-refresh className="btn-ghost" onClick={() => loadAll()} disabled={refreshing} aria-label="Refresh all numbers" style={{ display: "inline-flex", alignItems: "center", gap: 7, opacity: refreshing ? 0.6 : 1 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={refreshing ? { animation: "vlAdminSpin 0.9s linear infinite" } : undefined}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
              Refresh
            </button>
            <style>{"@keyframes vlAdminSpin{to{transform:rotate(360deg)}}"}</style>
            <ThemeToggle />
            {onLogout && <button className="btn-ghost" onClick={onLogout}>Logout</button>}
          </div>
        </div>

        {loadErrors.length > 0 && (
          <div data-admin-load-errors role="alert" style={{ background: `${c.danger}14`, border: `1px solid ${c.danger}55`, borderRadius: 12, padding: "12px 14px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.danger }}>Some data did not load, so parts of this page may be empty or out of date.</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: c.textSub, marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{loadErrors.map(e => `${e.fn}: ${e.message}`).join("\n")}</div>
            </div>
            <button type="button" className="btn-ghost" onClick={() => loadAll()} disabled={refreshing} style={{ fontSize: 11, padding: "7px 12px" }}>{refreshing ? "Loading…" : "Try again"}</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${c.border}`, overflowX: "auto" }}>
          {[
            ["overview", "Overview"],
            ["billing", "Revenue"],
            ["salons", "Salons"],
            ["signups", "Signups (30d)"],
            ["onboarding", `Onboarding${stuck.length ? ` (${stuck.length})` : ""}`],
            ["ratings", `Ratings${ratings.length ? ` (${ratings.length})` : ""}`],
            ["cron", `Cron health${cronDown ? ` (${cronDown})` : ""}`],
          ].map(([k, label]) => (
            <button
              key={k} onClick={() => setTab(k)}
              style={{
                padding: "12px 18px", border: "none", background: "transparent",
                color: tab === k ? accent : c.textSub,
                fontFamily: "'Jost',sans-serif", fontSize: 12, fontWeight: 600,
                letterSpacing: "0.08em", textTransform: "uppercase",
                cursor: "pointer",
                borderBottom: `2px solid ${tab === k ? accent : "transparent"}`,
                marginBottom: -1, whiteSpace: "nowrap",
              }}
            >{label}</button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <>
            {/* Needs attention: pas na de eerste lading, anders flitst "niets" */}
            {loaded && (
              <div data-needs-attention style={{ background: c.bgCard, border: `1px solid ${attention.some(a => a.tone === "danger") ? `${c.danger}66` : c.border}`, borderRadius: 16, padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>Needs attention{attention.length ? ` — ${attention.length}` : ""}</div>
                {attention.length === 0 && <div style={{ fontSize: 12, color: c.textSub, marginTop: 8 }}>Nothing right now: no failed payments, stuck salons or stopped jobs.</div>}
                {attention.map((a, i) => (
                  <div key={a.key} data-attention={a.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0 10px", borderTop: i ? `1px solid ${c.border}` : "none", marginTop: i ? 0 : 4 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: toneColor[a.tone], marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>
                        {a.title} <span style={{ color: toneColor[a.tone], fontWeight: 600 }}>{a.items.length}</span>
                      </div>
                      <div style={{ fontSize: 12, color: c.textSub, marginTop: 3, lineHeight: 1.55, overflowWrap: "anywhere" }}>
                        {a.items.map((x, k) => (
                          <span key={x.id || x.name}>
                            {k > 0 && " · "}
                            {x.id ? salonBtn(x.id, x.name, { color: c.textSub }) : x.name}
                            {x.extra ? ` (${x.extra})` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button type="button" onClick={() => { if (a.key === "unfinished") setPayFilter("problems"); setTab(a.tab); }} style={{ fontSize: 11, color: accent, background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", padding: "3px 0", flexShrink: 0, fontFamily: "inherit" }}>
                      {a.tabLabel}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              {/* "on paid plans" telde iedereen met een plan (13), ook proef
                  en afgelopen proef; betalend komt nu uit admin_billing_overview. */}
              <StatCard label="Total salons" value={overview?.total_salons ?? "—"} sub={`${billing?.paying_count ?? 0} paying${trialEnded.length ? ` · ${trialEnded.length} trial ended` : ""}${paymentFailed.length ? ` · ${paymentFailed.length} payment failed` : ""}`} accent={accent} c={c} />
              <StatCard label="New (7 days)" value={overview?.salons_last_7d ?? "—"} sub="signups this week" accent={accent} c={c} />
              <StatCard label="Total appts" value={overview?.total_appointments ?? "—"} sub={`${overview?.appointments_last_30d ?? 0} in last 30d`} accent={accent} c={c} />
              <div data-salon-revenue style={{ display: "contents" }}>
                <StatCard label="Salon revenue" accent={accent} c={c}
                  value={salonRevenue.length ? (
                    <span style={{ display: "flex", flexWrap: "wrap", columnGap: 12, rowGap: 4, fontSize: salonRevenue.length > 1 ? 22 : undefined }}>
                      {salonRevenue.map(t => <span key={t.code} style={{ whiteSpace: "nowrap" }}>{t.symbol}{Math.round(t.total).toLocaleString("nl-NL")}</span>)}
                    </span>
                  ) : "—"}
                  sub={salonRevenue.length > 1 ? "completed appts, not converted" : "completed appointments"} />
              </div>
              <StatCard label="Staff accounts" value={overview?.total_staff ?? "—"} accent={accent} c={c} />
              <StatCard label="Unique clients" value={overview?.total_clients ?? "—"} accent={accent} c={c} />
              <StatCard label="Avg appts/salon" value={overview?.avg_appointments_per_salon ?? "—"} accent={accent} c={c} />
            </div>

            {/* Revenue timeline */}
            {sparkline && (
              <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>
                    Salon revenue — last 30 days (completed appointments)
                  </div>
                  <div data-rev-legend style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: c.textSub }}>
                    {sparkline.lines.map(l => (
                      <span key={l.code} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <svg width="18" height="6" aria-hidden="true"><line x1="1" y1="3" x2="17" y2="3" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} strokeLinecap="round" /></svg>
                        <strong style={{ color: c.text, fontWeight: 600 }}>{l.symbol}{Math.round(l.total).toLocaleString("nl-NL")}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <svg viewBox={`0 0 ${sparkline.W} ${sparkline.H}`} preserveAspectRatio="none" style={{ width: "100%", height: 100, display: "block" }}>
                  <defs>
                    <linearGradient id="adminRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={accent} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={sparkline.lines[0].area} fill="url(#adminRev)" />
                  {sparkline.lines.slice().reverse().map(l => (
                    <path key={l.code} d={l.path} fill="none" stroke={l.color} strokeWidth="1.8" strokeDasharray={l.dash} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.textMuted, marginTop: 8, gap: 12 }}>
                  <span>{sparkline.first}</span>
                  <span>{sparkline.last} (today)</span>
                </div>
                {sparkline.lines.length > 1 && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6, textAlign: "center" }}>Each currency is its own line; amounts are not converted.</div>}
              </div>
            )}

            {/* Recent signups preview */}
            {recent.length > 0 && (
              <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>Most recent signups</div>
                  <button style={{ fontSize: 11, color: accent, background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => setTab("signups")}>See all <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg></button>
                </div>
                {recent.slice(0, 5).map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.border}`, fontSize: 13 }}>
                    <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                      <div style={{ fontWeight: 500 }}>{salonBtn(s.id, s.business_name || "(no name)")}</div>
                      <div style={{ fontSize: 11, color: c.textMuted }}>{s.email} · {s.city || "—"}{s.referred_by_name ? ` · via ${s.referred_by_name}` : ""}</div>
                    </div>
                    <div data-signup-status style={{ fontSize: 11, color: c.textSub, textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                      <StatusPill badge={signupStatus(s.id).badge} />
                      <div>{relTime(s.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── REVENUE / BILLING TAB — Vellu's OWN subscription income ── */}
        {tab === "billing" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              <StatCard label="MRR" value={fmtEur(billing?.mrr_eur)} sub={`${billing?.paying_count ?? 0} paying · yearly at monthly equivalent`} accent={accent} c={c} />
              <StatCard label="ARR" value={fmtEur(billing?.arr_eur)} sub="annual run-rate" accent={accent} c={c} />
              <StatCard label="Collected to date" value={fmtEur(billing?.collected_total_eur)} sub={`${billing?.invoices_count ?? 0} invoices · ${fmtEur(billing?.collected_30d_eur)} last 30d`} accent={accent} c={c} />
              <StatCard label="Trials" value={billing?.trialing_count ?? 0} sub={`${billing?.trials_ending_14d ?? 0} ending in 14 days`} accent={accent} c={c} />
              {(billing?.churning_count ?? 0) > 0 && <StatCard label="Churning" value={billing.churning_count} sub="cancelled, access runs until the end of the paid period" accent={c.danger} c={c} />}
              {trialEnded.length > 0 && <StatCard label="Trial ended, no plan" value={trialEnded.length} sub={trialEnded.map(s => (s.business_name || s.slug || "").trim()).join(", ")} accent={c.warning} c={c} />}
              {paymentFailed.length > 0 && <StatCard label="Payment failed" value={paymentFailed.length} sub={paymentFailed.map(s => (s.business_name || s.slug || "").trim()).join(", ")} accent={c.danger} c={c} />}
              {(billing?.comped_count ?? 0) > 0 && <StatCard label="Comped / free" value={billing.comped_count} sub="active, not paying and not cancelled" accent={c.textSub} c={c} />}
            </div>

            <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
              MRR counts salons with an active Mollie subscription, plus yearly customers with a paid invoice covering today (the yearly flow is a one-off payment, no Mollie subscription) — yearly counts at its monthly equivalent (price ÷ 12). Trials and comped/demo accounts contribute €0 until they convert. All amounts in euro — Vellu always bills in euro, whatever currency the salon itself uses.
            </div>

            {/* ── Subscription income per month / quarter / year (06-10-2026),
                uitgebreid voor de boekhouding (12-10-2026): per periode de
                splitsing btw-omzet / buiten de EU, een factuurlijst, een
                btw-aangiftekaart (kwartaal) en Excel/CSV. Bron: echt geïnde
                facturen (admin_subscription_invoices), demo's uitgesloten. ── */}
            {(() => {
              const nowIso = (() => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
              const y = nowIso.slice(0, 4);
              const prevIso = (() => {
                const d = new Date(now); const yy = d.getFullYear(), mm = d.getMonth();
                const p = revView === "month" ? new Date(yy, mm - 1, 1) : revView === "quarter" ? new Date(yy, mm - 3, 1) : new Date(yy - 1, 0, 1);
                return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}-01`;
              })();
              // Periodesommen uit de facturen.
              const groups = new Map();
              for (const inv of subInvoices) {
                const key = periodKeyOf(revView, inv.issued_on);
                const g = groups.get(key) || { key, invoices: [], salons: new Set(), nlEx: 0, nlVat: 0, nlCount: 0, outTotal: 0, outCount: 0, total: 0 };
                g.invoices.push(inv);
                g.salons.add(inv.salon_id);
                g.total += Number(inv.total_eur) || 0;
                if (isNlVat(inv)) { g.nlEx += Number(inv.amount_excl_vat) || 0; g.nlVat += Number(inv.vat_amount) || 0; g.nlCount++; }
                else { g.outTotal += Number(inv.total_eur) || 0; g.outCount++; }
                groups.set(key, g);
              }
              const rows = [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
              const curKey = periodKeyOf(revView, nowIso);
              const prevKey = periodKeyOf(revView, prevIso);
              const cur = groups.get(curKey), prev = groups.get(prevKey);
              const ytdInv = subInvoices.filter((i) => String(i.issued_on || "").startsWith(y));
              const ytdTotal = ytdInv.reduce((s, i) => s + (Number(i.total_eur) || 0), 0);
              const ytdNlEx = ytdInv.filter(isNlVat).reduce((s, i) => s + (Number(i.amount_excl_vat) || 0), 0);
              const ytdNlVat = ytdInv.filter(isNlVat).reduce((s, i) => s + (Number(i.vat_amount) || 0), 0);
              const ytdOut = ytdInv.filter((i) => !isNlVat(i)).reduce((s, i) => s + (Number(i.total_eur) || 0), 0);
              // Gekozen periode: zelf aangeklikt, anders de huidige als die
              // facturen heeft, anders de meest recente met facturen.
              const selKey = (revSel && groups.has(revSel)) ? revSel : (cur ? curKey : rows[0]?.key || null);
              const sel = selKey ? groups.get(selKey) : null;
              const selInvoices = sel ? sel.invoices.slice().sort((a, b) => String(a.issued_on).localeCompare(String(b.issued_on)) || String(a.invoice_number).localeCompare(String(b.invoice_number))) : [];
              // Btw op een factuur aan een salon buiten Nederland: staat erop,
              // dus wel afdragen (art. 37 Wet OB) — apart melden.
              const vatAbroad = selInvoices.filter((i) => isNlVat(i) && i.country_code && i.country_code !== "NL");
              const unit = revView === "month" ? "month" : revView === "quarter" ? "quarter" : "year";
              const maxTot = Math.max(1, ...rows.map((r) => r.total));
              const pill = (on) => ({ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "6px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${on ? accent : c.border}`, background: on ? `${accent}1a` : "transparent", color: on ? accent : c.textSub, fontFamily: "inherit" });
              const th = (h, left) => <th key={h} style={{ padding: "10px 12px", textAlign: left ? "left" : "right", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, whiteSpace: "nowrap" }}>{h}</th>;
              const td = { padding: "10px 12px", textAlign: "right", color: c.textSub, whiteSpace: "nowrap" };
              const splitSub = (g) => g ? `${fmtEur(g.nlEx)} taxable + ${fmtEur(g.nlVat)} VAT · ${fmtEur(g.outTotal)} outside EU` : "no invoices";
              const selLabel = selKey ? periodLabelOf(revView, selKey) : "";
              const nlEx = sel ? r2(sel.nlEx) : 0, nlVat = sel ? r2(sel.nlVat) : 0;
              return (
                <div data-sub-revenue style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 18px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>Subscription income — collected by Vellu</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[["month", "Monthly"], ["quarter", "Quarterly"], ["year", "Yearly"]].map(([k, l]) => (
                        <button key={k} type="button" data-rev-view={k} onClick={() => { setRevView(k); setRevSel(null); }} style={pill(revView === k)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
                    <StatCard label={`This ${unit}`} value={fmtEur(cur?.total)} sub={`${periodLabelOf(revView, curKey)} · ${cur?.invoices.length ?? 0} invoices · ${splitSub(cur)}`} accent={accent} c={c} />
                    <StatCard label={`Previous ${unit}`} value={fmtEur(prev?.total)} sub={`${periodLabelOf(revView, prevKey)} · ${prev?.invoices.length ?? 0} invoices · ${splitSub(prev)}`} accent={c.textSub} c={c} />
                    <StatCard label="This year to date" value={fmtEur(ytdTotal)} sub={`${y} · ${fmtEur(ytdNlEx)} taxable + ${fmtEur(ytdNlVat)} VAT · ${fmtEur(ytdOut)} outside EU · ${ytdInv.length} invoices`} accent={accent} c={c} />
                  </div>
                  {rows.length === 0 ? (
                    <div style={{ fontSize: 12, color: c.textMuted }}>No paid invoices yet.</div>
                  ) : (<>
                    <div style={{ overflowX: "auto" }}>
                      <table data-rev-table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
                            {th("Period", true)}{th("Invoices")}{th("Salons")}{th("Taxable (excl. VAT)")}{th("VAT 21%")}{th("Outside EU (no VAT)")}{th("Total")}{th("", true)}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const on = r.key === selKey;
                            return (
                              <tr key={r.key} data-rev-row={r.key} onClick={() => setRevSel(r.key)} title="Show the invoices of this period"
                                style={{ borderBottom: `1px solid ${c.border}`, cursor: "pointer", background: on ? `${accent}12` : "transparent" }}>
                                <td style={{ padding: "10px 12px", fontWeight: on ? 700 : 500, color: on ? accent : c.text, whiteSpace: "nowrap" }}>{periodLabelOf(revView, r.key)}</td>
                                <td style={td}>{r.invoices.length}</td>
                                <td style={td}>{r.salons.size}</td>
                                <td style={td}>{fmtEur2(r.nlEx)}</td>
                                <td style={td}>{fmtEur2(r.nlVat)}</td>
                                <td style={td}>{fmtEur2(r.outTotal)}</td>
                                <td style={{ ...td, color: accent, fontFamily: "'Cormorant Garamond',serif", fontSize: 16 }}>{fmtEur2(r.total)}</td>
                                <td style={{ padding: "10px 12px", width: "22%" }}>
                                  <div style={{ height: 8, borderRadius: 4, background: c.bg, overflow: "hidden", display: "flex" }}>
                                    <div style={{ height: "100%", width: `${Math.round(((r.nlEx + r.nlVat) / maxTot) * 100)}%`, background: accent }} />
                                    <div style={{ height: "100%", width: `${Math.round((r.outTotal / maxTot) * 100)}%`, background: `${accent}66` }} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8 }}>Click a period to see its invoices. Bar: dark = Dutch VAT revenue, light = outside the EU.</div>

                    {sel && (
                      <div data-rev-period style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{selLabel} · {selInvoices.length} invoices · {fmtEur2(sel.total)}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button type="button" data-rev-xlsx className="btn-ghost" style={{ padding: "7px 12px", fontSize: 11 }} onClick={() => downloadInvoicesXlsx(selInvoices, selLabel, selKey)}>Download Excel</button>
                            <button type="button" data-rev-csv className="btn-ghost" style={{ padding: "7px 12px", fontSize: 11 }} onClick={() => downloadInvoicesCsv(selInvoices, selKey)}>Download CSV</button>
                          </div>
                        </div>

                        {/* Btw-aangifte (per kwartaal): rubriek 1a direct af te lezen. */}
                        {revView === "quarter" ? (
                          <div data-vat-return style={{ background: `${accent}0d`, border: `1px solid ${accent}33`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, marginBottom: 8 }}>Btw-aangifte {selLabel} — abonnementsomzet</div>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "6px 18px", fontSize: 12, alignItems: "baseline" }}>
                              <div style={{ color: c.textLabel, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rubriek</div>
                              <div style={{ color: c.textLabel, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>Omzet</div>
                              <div style={{ color: c.textLabel, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>Btw</div>
                              <div>1a Leveringen/diensten belast met hoog tarief</div>
                              <div data-vat-1a-omzet style={{ textAlign: "right", fontWeight: 700 }}>€ {Math.floor(nlEx).toLocaleString("nl-NL")}</div>
                              <div data-vat-1a-btw style={{ textAlign: "right", fontWeight: 700 }}>€ {Math.floor(nlVat).toLocaleString("nl-NL")}</div>
                              <div style={{ color: c.textMuted, fontSize: 11 }}>exact, {sel.nlCount} invoices</div>
                              <div style={{ textAlign: "right", color: c.textMuted, fontSize: 11 }}>{fmtEur2(nlEx)}</div>
                              <div style={{ textAlign: "right", color: c.textMuted, fontSize: 11 }}>{fmtEur2(nlVat)}</div>
                              <div>Buiten de EU — niet opgeven ({sel.outCount} invoices)</div>
                              <div style={{ textAlign: "right", color: c.textSub }}>{fmtEur2(sel.outTotal)}</div>
                              <div style={{ textAlign: "right", color: c.textMuted }}>—</div>
                            </div>
                            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 10, lineHeight: 1.5 }}>
                              Afgerond in hele euro's in je voordeel. De rest van rubriek 1 en rubriek 2 en 3 blijven leeg voor de abonnementen. Rubriek 4a/4b en 5b komen uit je inkoopfacturen (Vercel, Supabase, Resend, Anthropic, Mollie-kosten e.d.), niet uit Vellu. Vellu geeft geen fiscaal advies.
                            </div>
                            {vatAbroad.length > 0 && (
                              <div data-vat-abroad style={{ fontSize: 11, color: c.warning, marginTop: 8, lineHeight: 1.5 }}>
                                {vatAbroad.length === 1 ? "1 invoice" : `${vatAbroad.length} invoices`} to a salon outside the Netherlands carried 21% VAT ({vatAbroad.map((i) => `${i.invoice_number} ${i.business_name} ${i.country_code}`).join(", ")}). The VAT is on the invoice, so it is included in 1a and must be paid (art. 37 Wet OB).
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12 }}>The VAT return is quarterly — switch to Quarterly to see the rubriek 1a figures.</div>
                        )}

                        <div style={{ overflowX: "auto" }}>
                          <table data-rev-invoices style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
                                {th("Date", true)}{th("Invoice", true)}{th("Salon", true)}{th("Country", true)}{th("Plan", true)}{th("Excl. VAT")}{th("VAT")}{th("Total")}{th("VAT treatment", true)}{th("Mollie", true)}
                              </tr>
                            </thead>
                            <tbody>
                              {selInvoices.map((i) => (
                                <tr key={i.invoice_number} style={{ borderBottom: `1px solid ${c.border}` }}>
                                  <td style={{ ...td, textAlign: "left" }}>{new Date(`${i.issued_on}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</td>
                                  <td style={{ ...td, textAlign: "left", fontFamily: "monospace", color: c.text }}>{i.invoice_number}</td>
                                  <td style={{ ...td, textAlign: "left", color: c.text }}>{i.business_name || "—"}</td>
                                  <td style={{ ...td, textAlign: "left" }}>{i.country_code || "—"}</td>
                                  <td style={{ ...td, textAlign: "left", textTransform: "capitalize" }}>{[i.plan, i.billing_interval].filter(Boolean).join(" · ")}</td>
                                  <td style={td}>{fmtEur2(i.amount_excl_vat)}</td>
                                  <td style={td}>{isNlVat(i) ? fmtEur2(i.vat_amount) : "—"}</td>
                                  <td style={{ ...td, color: c.text, fontWeight: 600 }}>{fmtEur2(i.total_eur)}</td>
                                  <td style={{ ...td, textAlign: "left" }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 6, color: isNlVat(i) ? accent : c.textSub, background: isNlVat(i) ? `${accent}1a` : c.bg, border: `1px solid ${isNlVat(i) ? `${accent}44` : c.border}` }}>{isNlVat(i) ? "NL VAT 21%" : "Outside EU"}</span>
                                  </td>
                                  <td style={{ ...td, textAlign: "left", fontFamily: "monospace", fontSize: 10, color: c.textMuted }}>{i.mollie_payment_id || "—"}</td>
                                </tr>
                              ))}
                              <tr style={{ borderTop: `2px solid ${c.border}` }}>
                                <td colSpan={5} style={{ ...td, textAlign: "left", fontWeight: 700, color: c.text }}>Total {selLabel}</td>
                                <td style={{ ...td, fontWeight: 700, color: c.text }}>{fmtEur2(selInvoices.reduce((s, i) => s + (Number(i.amount_excl_vat) || 0), 0))}</td>
                                <td style={{ ...td, fontWeight: 700, color: c.text }}>{fmtEur2(selInvoices.reduce((s, i) => s + (Number(i.vat_amount) || 0), 0))}</td>
                                <td style={{ ...td, fontWeight: 700, color: accent }}>{fmtEur2(sel.total)}</td>
                                <td colSpan={2} />
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>)}
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 10, lineHeight: 1.5 }}>
                    Based on invoices actually paid via Mollie (invoice date, Dutch time), demo salons excluded. Taxable = invoices with 21% Dutch VAT; outside EU = invoices without VAT to salons in the Caribbean Netherlands, Aruba, Curaçao or Sint Maarten. A yearly subscription lands in full in the month it was paid; MRR above spreads it over twelve months. Mollie pays out net of its fees: those fees are a cost on Mollie's own invoices.
                  </div>
                </div>
              );
            })()}

            {/* Trials ending soon — the conversion window worth chasing */}
            {endingTrials.length > 0 && (
              <div style={{ background: `${accent}0d`, border: `1px solid ${accent}33`, borderRadius: 16, padding: "14px 18px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, marginBottom: 8 }}>Trials ending soon — conversion window</div>
                {endingTrials.map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{s.business_name} <span style={{ color: c.textMuted, fontSize: 11, textTransform: "capitalize" }}>· {s.plan}</span></span>
                    <span style={{ color: c.textSub, fontSize: 12 }}>trial ends {fmtDate(s.trial_ends_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Per-salon subscriptions */}
            <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
                      {["Salon", "Plan", "Status", "Interval", "MRR", "Renews / trial ends"].map(h => (
                        <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map(s => {
                      const everPaid = paidOwners.has(s.id);
                      const badge = statusBadge(s.classification, s.churning, c, accent, everPaid);
                      // Opgezegd (loopt af of al gestopt): de laatste opzegging
                      // met reden onder de naam. Opnieuw betalend = niet tonen.
                      const leaving = s.churning || s.classification === "cancelled";
                      const lc = leaving ? lastCancelByOwner.get(s.id) : null;
                      return (
                        <tr key={s.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: "12px 14px" }}>
                            {salonBtn(s.id, s.business_name || "(no name)", { fontWeight: 500 })}
                            {lc && (
                              <div data-sub-cancel-reason style={{ fontSize: 11, color: c.textMuted, marginTop: 3, lineHeight: 1.4, maxWidth: 360 }}>
                                Cancelled {fmtDate(lc.created_at)} · <span style={{ color: lc.reason ? c.textSub : c.textMuted }}>{cancelReasonLabel(lc.reason)}</span>
                                {lc.note && <span style={{ color: c.textSub }}> — “{lc.note}”</span>}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "12px 14px", color: c.textSub, textTransform: "capitalize" }}>{s.plan || "—"}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <StatusPill badge={badge} />
                          </td>
                          <td style={{ padding: "12px 14px", color: c.textMuted, fontSize: 11 }}>{s.billing_interval || "—"}</td>
                          <td style={{ padding: "12px 14px", color: Number(s.mrr_eur) > 0 ? accent : c.textMuted, fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{fmtEur(s.mrr_eur)}</td>
                          <td style={{ padding: "12px 14px", color: c.textMuted, fontSize: 11 }}>
                            {s.churning
                              ? (s.plan_expires_at ? `ends ${fmtDate(s.plan_expires_at)}` : "ends at period end")
                              : s.classification === "paying"
                                ? (s.plan_expires_at ? `renews ${fmtDate(s.plan_expires_at)}` : "active")
                                : s.classification === "trialing"
                                  ? (s.trial_ends_at ? `trial ends ${fmtDate(s.trial_ends_at)}` : "trial")
                                  : s.classification === "past_due"
                                    ? (everPaid
                                      ? (s.plan_expires_at ? `unpaid since ${fmtDate(s.plan_expires_at)}` : "unpaid")
                                      : (s.trial_ends_at ? `trial ended ${fmtDate(s.trial_ends_at)}` : "trial ended"))
                                    : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {subs.length === 0 && <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", color: c.textMuted, fontSize: 12 }}>No subscriptions yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Betalingen (ronde 3, 12-11-2026): alles wat Mollie meldde, ook
                checkouts die een salon opende maar niet afmaakte. Tot nu toe
                zag niemand dat Brilliant Beauty op 10-09 vijf keer begon. */}
            {(() => {
              const problems = payFeed.filter(e => e.status === "expired" || e.status === "failed");
              const list = payFilter === "problems" ? problems : payFeed;
              const toneCol = { ok: c.success, warn: c.warning, bad: c.danger, muted: c.textMuted };
              return (
                <div data-payments style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 18px", marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>Payments — last 120 days</div>
                    <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                      {[["all", `All (${payFeed.length})`], ["problems", `Not finished or failed (${problems.length})`]].map(([k, l]) => (
                        <button key={k} type="button" data-pay-filter={k} onClick={() => { setPayFilter(k); setPayShown(25); }}
                          style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, border: `1px solid ${payFilter === k ? accent : c.border}`, background: payFilter === k ? `${accent}1a` : "transparent", color: payFilter === k ? accent : c.textSub, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8 }}>Everything Mollie reported: payments, monthly charges, and checkouts a salon opened but did not finish. Amounts in euro.</div>
                  {list.length === 0 && <div style={{ color: c.textMuted, fontSize: 12, padding: 16, textAlign: "center" }}>Nothing here.</div>}
                  {list.slice(0, payShown).map(e => {
                    const p = paymentLabel(e);
                    // Afgebroken of mislukt, maar daarna toch betaald: geen probleem meer.
                    const paidLater = paidLaterOf(e);
                    return (
                      <div key={e.id} data-pay-row={p.tone} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", padding: "9px 0", borderTop: `1px solid ${c.border}`, fontSize: 12 }}>
                        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                          <span style={{ color: paidLater ? c.textSub : toneCol[p.tone], fontWeight: 600 }}>{p.label}</span>
                          <span style={{ color: c.textSub }}> · {salonById.has(e.owner_id) ? salonBtn(e.owner_id, nameOf(e), { color: c.textSub }) : (e.business_name || "(deleted salon)")}</span>
                          {paidLater && <span data-paid-later style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: c.success, background: `${c.success}1a`, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>paid later</span>}
                          {e.description && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{e.description}</div>}
                        </div>
                        <div style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: p.tone === "ok" ? c.text : c.textMuted }}>{fmtEur2(e.amount_eur)}</div>
                          <div style={{ fontSize: 10, color: c.textMuted }}>{fmtDateTime(e.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {list.length > payShown && (
                    <button type="button" className="btn-ghost" data-pay-more onClick={() => setPayShown(n => n + 50)} style={{ marginTop: 10, fontSize: 11, padding: "7px 12px" }}>Show more ({list.length - payShown})</button>
                  )}
                </div>
              );
            })()}

            {/* Opzeggingen met reden (14-10-2026): de salon kiest in het
                opzegvenster optioneel een reden en kan iets toelichten. Elke
                opzegging staat hier, ook zonder reden. */}
            {(() => {
              const tally = new Map();
              for (const x of cancellations) { const k = x.reason || ""; tally.set(k, (tally.get(k) || 0) + 1); }
              const tallyRows = [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0] ? 0 : 1) - (b[0] ? 0 : 1));
              return (
                <div data-cancellations style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 18px", marginTop: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 10 }}>
                    Cancellations — why salons leave{cancellations.length ? ` · ${cancellations.length}` : ""}
                  </div>
                  {cancellations.length === 0 ? (
                    <div style={{ fontSize: 12, color: c.textMuted }}>No cancellations yet.</div>
                  ) : (<>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                      {tallyRows.map(([k, n]) => (
                        <span key={k || "none"} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.bg, color: k ? c.text : c.textMuted }}>
                          {cancelReasonLabel(k || null)} <strong style={{ color: accent, marginLeft: 4 }}>{n}</strong>
                        </span>
                      ))}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table data-cancellations-table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
                            {["Date", "Salon", "Plan", "Reason", "Note", "Access"].map(h => (
                              <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cancellations.map(x => (
                            <tr key={x.id} style={{ borderBottom: `1px solid ${c.border}`, verticalAlign: "top" }}>
                              <td style={{ padding: "10px 12px", color: c.textSub, whiteSpace: "nowrap" }}>{fmtDate(x.created_at)}</td>
                              <td style={{ padding: "10px 12px", color: c.text, fontWeight: 500 }}>{x.business_name || "—"}</td>
                              <td style={{ padding: "10px 12px", color: c.textSub, textTransform: "capitalize", whiteSpace: "nowrap" }}>{[x.plan, x.billing_interval].filter(Boolean).join(" · ") || "—"}</td>
                              <td style={{ padding: "10px 12px", color: x.reason ? c.text : c.textMuted }}>{cancelReasonLabel(x.reason)}</td>
                              <td style={{ padding: "10px 12px", color: c.textSub, minWidth: 180, maxWidth: 420, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{x.note || <span style={{ color: c.textMuted }}>—</span>}</td>
                              <td style={{ padding: "10px 12px", color: c.textMuted, whiteSpace: "nowrap" }}>{x.mode === "immediate" ? "ended at once" : x.access_until ? `until ${fmtDate(x.access_until)}` : "until period end"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>)}
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 10, lineHeight: 1.5 }}>
                    The reason is optional in the cancel window; cancellations from before 14 Oct 2026 have none. Turning off automatic payment during a trial is not a cancellation and is not listed.
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── SALONS TAB ── */}
        {tab === "salons" && (
          <>
            <div style={{ marginBottom: 12 }}>
              <input
                className="input-field"
                placeholder="Search by name, email, slug, or city…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ fontSize: 13, padding: "10px 14px", width: "100%", maxWidth: 400 }}
              />
            </div>
            {salonActionMsg && (
              <div data-salon-action-msg style={{ fontSize: 12, lineHeight: 1.5, color: /^(Failed|Mollie|Deleting|The name|Deactivate the|The demo|You are|This login|Logins could)/.test(salonActionMsg) ? c.danger : c.success, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{salonActionMsg}</span>
                <button type="button" onClick={() => setSalonActionMsg("")} aria-label="Close" style={{ background: "none", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>&times;</button>
              </div>
            )}
            <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
                      {/* 14-10-2026: "Last activity" was de laatste nieuwe
                          afspraak; nu "Last booking", en "Last seen" = wanneer
                          de eigenaar de app laatst open had (admin_salons_list). */}
                      {[
                        ["Salon", null, "name"], ["Status", "Subscription status (same labels as the Revenue tab), with the plan below.", "status"], ["Staff", null, "staff"], ["Appts", null, "appts"],
                        ["Revenue", "Completed appointments, in the salon's own currency. Sorting compares the numbers as they are, without converting currencies.", "revenue"],
                        ["Last seen", "Last time the owner had Vellu open (login or session refresh, about hourly while the app is open). Staff accounts not counted.", "seen"],
                        ["Last booking", "Last time a new appointment was made, by a client online or by the salon.", "booking"],
                        ["Signed up", null, "created"], ["GCal"],
                        ["Actions", "Deactivate: reversible (billing stops, booking page closed, logins blocked, data kept). Delete: only after deactivating; removes everything except your invoices."],
                      ].map(([h, tip, key]) => {
                        const active = key && salonSort.key === key;
                        return (
                          <th key={h} title={tip || undefined} aria-sort={active ? (salonSort.dir > 0 ? "ascending" : "descending") : undefined} style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: active ? accent : c.textLabel, whiteSpace: "nowrap" }}>
                            {key ? (
                              <button type="button" data-salon-sort={key} onClick={() => setSalonSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: SORT_DEFAULT_DIR[key] })}
                                style={{ background: "none", border: "none", padding: 0, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                {h}
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: active ? 1 : 0.35 }}>
                                  {active && salonSort.dir > 0 ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
                                </svg>
                              </button>
                            ) : <span style={{ cursor: tip ? "help" : undefined }}>{h}</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSalons.map(s => (
                      <tr key={s.id} data-salon-row={s.slug} style={{ borderBottom: `1px solid ${c.border}`, opacity: s.deactivated_at ? 0.7 : 1 }}>
                        <td style={{ padding: "12px 14px" }}>
                          {salonBtn(s.id, s.business_name || "(no name)", { fontWeight: 500 })}
                          <div style={{ fontSize: 10, color: c.textMuted }}>{s.email} · {s.city || "—"}</div>
                          {s.deactivated_at && (
                            <div data-salon-deactivated style={{ fontSize: 10, color: c.danger, marginTop: 3 }}>
                              Deactivated {fmtDate(s.deactivated_at)}{s.deactivated_reason ? ` · ${s.deactivated_reason}` : ""}
                            </div>
                          )}
                        </td>
                        <td data-salon-status style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                          <StatusPill badge={signupStatus(s.id).badge} />
                          <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, textTransform: "capitalize" }}>{[s.plan, subById.get(s.id)?.billing_interval].filter(Boolean).join(" · ") || "—"}</div>
                        </td>
                        <td style={{ padding: "12px 14px", color: c.textSub }}>{s.staff_count}</td>
                        <td style={{ padding: "12px 14px", color: c.textSub }}>
                          {s.appt_count}
                          <div style={{ fontSize: 9, color: c.textMuted }}>{s.completed_count} done · {s.upcoming_count} upcoming</div>
                        </td>
                        <td data-salon-revenue-cell style={{ padding: "12px 14px", color: accent, fontFamily: "'Cormorant Garamond',serif", fontSize: 15, whiteSpace: "nowrap" }}>{fmtCur(s.country_code, s.total_revenue)}</td>
                        <td data-last-seen style={{ padding: "12px 14px", color: c.textSub, fontSize: 11, whiteSpace: "nowrap" }} title={s.last_seen ? fmtDateTime(s.last_seen) : undefined}>
                          {relTime(s.last_seen)}
                          {/* Nooit teruggekomen na het aanmelden: het signaal
                              om te bellen, en anders niet te zien. */}
                          {s.last_seen && s.created_at && new Date(s.last_seen).getTime() - new Date(s.created_at).getTime() < 3_600_000 && now - new Date(s.created_at).getTime() > 864e5 && (
                            <div style={{ fontSize: 9, color: c.warning }}>only at signup</div>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px", color: c.textMuted, fontSize: 11, whiteSpace: "nowrap" }} title={s.last_activity ? fmtDateTime(s.last_activity) : undefined}>{relTime(s.last_activity)}</td>
                        <td style={{ padding: "12px 14px", color: c.textMuted, fontSize: 11 }}>{fmtDate(s.created_at)}</td>
                        <td style={{ padding: "12px 14px", color: s.google_connected ? c.success : c.textMuted, fontSize: 14 }}>{s.google_connected ? <span role="img" aria-label="connected" style={{ display: "inline-flex" }}><NavIcon name="check" size={14} color="currentColor" /></span> : "—"}</td>
                        <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                          {!s.deactivated_at ? (
                            <button type="button" data-salon-deactivate className="btn-ghost" onClick={() => { setSalonReason(""); setSalonAction({ kind: "deactivate", salon: s }); }}
                              style={{ fontSize: 10, padding: "6px 10px", color: c.danger, borderColor: `${c.danger}55` }}>Deactivate</button>
                          ) : (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button type="button" data-salon-reactivate className="btn-ghost" onClick={() => setSalonAction({ kind: "reactivate", salon: s })}
                                style={{ fontSize: 10, padding: "6px 10px" }}>Reactivate</button>
                              <button type="button" data-salon-delete className="btn-ghost" onClick={() => { setSalonConfirm(""); setSalonAction({ kind: "delete", salon: s }); }}
                                style={{ fontSize: 10, padding: "6px 10px", color: "#fff", background: c.danger, borderColor: c.danger }}>Delete</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {visibleSalons.length === 0 && (
                      <tr><td colSpan={10} style={{ padding: "24px", textAlign: "center", color: c.textMuted, fontSize: 12 }}>No salons match.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bevestigen: deactiveren (reden optioneel), heractiveren, of
                definitief verwijderen (salonnaam of slug overtikken). */}
            {salonAction && (() => {
              const { kind, salon } = salonAction;
              const name = salon.business_name || salon.slug;
              const norm = (v) => String(v || "").trim().toLowerCase();
              const typedOk = kind !== "delete" || [norm(salon.slug), norm(salon.business_name)].includes(norm(salonConfirm));
              return (
                <div onClick={() => !salonActionBusy && setSalonAction(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 400 }}>
                  <div onClick={e => e.stopPropagation()} data-salon-action-modal={kind} role="dialog" aria-modal="true"
                    style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: 24, maxWidth: 480, width: "100%", color: c.text, maxHeight: "calc(100vh - 48px)", overflowY: "auto" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 300, marginBottom: 10 }}>
                      {kind === "deactivate" ? `Deactivate ${name}?` : kind === "reactivate" ? `Reactivate ${name}?` : `Delete ${name} permanently?`}
                    </div>
                    <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6, marginBottom: 14 }}>
                      {kind === "deactivate" && <>
                        <div>This can be undone. What happens:</div>
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                          <li>Billing stops: every Mollie subscription and mandate of this salon is cancelled.</li>
                          <li>The booking page shows "no longer taking online bookings" and the salon disappears from vellu.cc.</li>
                          <li>The owner and staff can no longer sign in; they see that the account is deactivated.</li>
                          <li>No more automatic emails to their clients (reminders, reviews, birthdays …).</li>
                          <li>All data stays: appointments, clients, services, photos, invoices.</li>
                        </ul>
                      </>}
                      {kind === "reactivate" && <>
                        Logins work again, the booking page opens and the salon shows on vellu.cc again. Billing does not restart by itself: if their paid period is over, they choose a plan in the app.
                      </>}
                      {kind === "delete" && <>
                        <div style={{ color: c.danger, fontWeight: 600 }}>This cannot be undone.</div>
                        <div style={{ marginTop: 6 }}>Removed: the account and staff logins, all appointments, clients, services, photos, reviews and settings, and the Mollie customer.</div>
                        <div style={{ marginTop: 6 }}>Kept: your invoices to this salon, with their name and details, for the 7-year tax retention. Nightly backups keep a copy for up to 30 days.</div>
                      </>}
                    </div>
                    {kind === "deactivate" && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: "block", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>Reason (optional, only for you)</label>
                        <input className="input-field" data-salon-reason value={salonReason} maxLength={300} onChange={e => setSalonReason(e.target.value)} placeholder="e.g. requested by the owner" style={{ width: "100%", fontSize: 13, padding: "10px 12px" }} />
                      </div>
                    )}
                    {kind === "delete" && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: "block", fontSize: 11, color: c.textSub, marginBottom: 6 }}>Type <strong style={{ color: c.text }}>{salon.slug}</strong> to confirm</label>
                        <input className="input-field" data-salon-confirm value={salonConfirm} onChange={e => setSalonConfirm(e.target.value)} autoComplete="off" style={{ width: "100%", fontSize: 13, padding: "10px 12px", fontFamily: "monospace" }} />
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn-ghost" disabled={salonActionBusy} onClick={() => setSalonAction(null)} style={{ flex: 1 }}>Cancel</button>
                      <button type="button" className="btn-primary" data-salon-action-go disabled={salonActionBusy || !typedOk} onClick={runSalonAction}
                        style={{ flex: 1, opacity: salonActionBusy || !typedOk ? 0.5 : 1, ...(kind === "reactivate" ? {} : { background: c.danger, color: "#fff" }) }}>
                        {salonActionBusy ? "Working…" : kind === "deactivate" ? "Deactivate" : kind === "reactivate" ? "Reactivate" : "Delete permanently"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── SIGNUPS TAB ── */}
        {tab === "signups" && (
          <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 12 }}>
              Signups in the last 30 days — {recent.length} total
            </div>
            {recent.length === 0 && (
              <div style={{ color: c.textMuted, fontSize: 12, padding: 20, textAlign: "center" }}>No signups yet.</div>
            )}
            {recent.map(s => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${c.border}` }}>
                <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{salonBtn(s.id, s.business_name || "(no name)")}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                    {s.email} · {s.city || "—"} · /{s.slug}
                    {s.referred_by_name && <span style={{ color: accent }}> · referred by {s.referred_by_name}</span>}
                  </div>
                </div>
                {(() => {
                  const st = signupStatus(s.id);
                  return (
                    <div data-signup-status style={{ textAlign: "right", fontSize: 11, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                      <StatusPill badge={st.badge} />
                      {st.note && <div style={{ color: c.textSub, fontSize: 10 }}>{st.note}</div>}
                      <div style={{ color: c.textMuted }}>{fmtDateTime(s.created_at)}</div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        {/* ── ONBOARDING TAB (24-10-2026): wie loopt vast + geüploade prijslijsten ── */}
        {tab === "onboarding" && (
          <>
            <div data-onboarding-stuck style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>Needs a nudge — {stuck.length}</div>
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12 }}>Salons with an empty booking page, or at most one booking four days after signing up (the same rule as the activation email). Deactivated salons and the demo are left out.</div>
              {stuck.length === 0 && <div style={{ color: c.textMuted, fontSize: 12, padding: 16, textAlign: "center" }}>Everyone is up and running.</div>}
              {stuck.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                        {["Salon", "Missing", "Signed up", "Last seen", "Status", "Services", "Bookings", "Emails sent", "Price list"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stuck.map(o => (
                        <tr key={o.id} data-onboarding-row={o.slug} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: "10px" }}>
                            {salonBtn(o.id, o.business_name || "(no name)", { fontWeight: 500 })}
                            <div style={{ fontSize: 10, color: c.textMuted }}><a href={`mailto:${o.email}`} style={{ color: "inherit" }}>{o.email}</a> · {o.country_code || "—"}</div>
                          </td>
                          <td style={{ padding: "10px", color: c.warning, whiteSpace: "nowrap" }}>{o.why === "no_services" ? "No services" : o.appts ? "Only 1 booking" : "No bookings yet"}</td>
                          <td style={{ padding: "10px", color: c.textMuted, whiteSpace: "nowrap" }}>{fmtDate(o.created_at)}</td>
                          <td style={{ padding: "10px", color: c.textMuted, whiteSpace: "nowrap" }} title={o.last_seen ? fmtDateTime(o.last_seen) : undefined}>{relTime(o.last_seen)}</td>
                          <td style={{ padding: "10px", whiteSpace: "nowrap", fontSize: 11 }}>
                            {(() => { const st = signupStatus(o.id); return <><StatusPill badge={st.badge} />{st.note && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{st.note}</div>}</>; })()}
                          </td>
                          <td style={{ padding: "10px", color: c.textSub }}>{o.visible_services}{o.services !== o.visible_services ? ` (${o.services})` : ""}</td>
                          <td style={{ padding: "10px", color: c.textSub }}>{o.appts}</td>
                          <td data-onboarding-emails style={{ padding: "10px", fontSize: 10, color: c.textSub, whiteSpace: "nowrap", lineHeight: 1.6 }}>
                            {(emailsByOwner.get(o.id) || []).length === 0 ? <span style={{ color: c.textMuted }}>—</span> : (emailsByOwner.get(o.id) || []).map((m, k) => (
                              <div key={k} title={emailKindLabel(m.kind)} style={{ color: m.kind === "no_services" || m.kind === "no_bookings" ? c.text : c.textSub }}>
                                {EMAIL_KIND_SHORT[m.kind] || m.kind} <span style={{ color: c.textMuted }}>· {dayOf(m.sent_at)}</span>
                              </div>
                            ))}
                          </td>
                          <td style={{ padding: "10px", fontSize: 11, whiteSpace: "nowrap", color: o.last_import_status === "failed" || o.last_import_status === "empty" ? c.danger : c.textSub }}>
                            {o.last_import_at ? `${o.last_import_status}${o.last_import_found != null ? ` · ${o.last_import_found} found` : ""}${o.last_import_added != null ? ` · ${o.last_import_added} added` : ""}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div data-price-imports style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>Uploaded price lists — {priceImports.length}</div>
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12 }}>Every "read my price list" attempt. When reading failed (or found nothing), open the photo and help the salon; the files stay private.</div>
              {priceImports.length === 0 && <div style={{ color: c.textMuted, fontSize: 12, padding: 16, textAlign: "center" }}>No price lists uploaded yet.</div>}
              {priceImports.map(p => {
                const bad = p.status === "failed" || p.status === "empty";
                return (
                  <div key={p.id} data-price-import-admin={p.status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{p.business_name || "(no name)"} <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 400 }}>· {fmtDateTime(p.created_at)}</span></div>
                      <div style={{ fontSize: 11, color: bad ? c.danger : c.textSub, marginTop: 2 }}>
                        {p.status === "ok" ? `${p.services_found} found${p.applied_at ? ` · ${p.services_added} added` : " · not added (yet)"}` : p.status === "empty" ? "Nothing recognised" : p.status === "processing" ? "Still reading (or stopped halfway)" : `Failed${p.error ? `: ${String(p.error).slice(0, 120)}` : ""}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(Array.isArray(p.files) ? p.files : []).map((f, i) => (
                        <button key={f.path} type="button" className="btn-ghost" disabled={!!fileBusy} onClick={() => openPriceFile(f.path)} style={{ fontSize: 10, padding: "6px 10px" }}>
                          {fileBusy === f.path ? "…" : `${f.type === "application/pdf" ? "PDF" : "Photo"} ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── RATINGS TAB — "Beoordeel Vellu": what salon owners think ── */}
        {tab === "ratings" && (() => {
          const real = ratings.filter(r => !r.is_demo);
          const avg = real.length ? real.reduce((s, r) => s + Number(r.rating), 0) / real.length : 0;
          const togglePublished = async (r) => {
            const { data, error } = await supabase.rpc("admin_set_app_rating_published", { p_owner_id: r.owner_id, p_published: !r.published });
            if (error) { window.alert(error.message); return; }
            setRatings(list => list.map(x => x.owner_id === r.owner_id ? { ...x, published: !!data } : x));
          };
          const stars = (n) => (
            <span style={{ display: "inline-flex", gap: 2, verticalAlign: "middle" }} aria-label={`${n} of 5`}>
              {[1, 2, 3, 4, 5].map(i => <Star key={i} size={14} filled={i <= n} color={accent} stroke={i <= n ? accent : c.textMuted} />)}
            </span>
          );
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
                <StatCard label="Average" value={real.length ? avg.toFixed(1) : "—"} sub={`${real.length} rating${real.length === 1 ? "" : "s"} · demo excluded · on vellu.cc from 3`} accent={accent} c={c} />
                <StatCard label="5 stars" value={real.filter(r => Number(r.rating) === 5).length} sub={`${real.filter(r => Number(r.rating) <= 3).length} at 3 or lower`} accent={accent} c={c} />
                <StatCard label="Allowed public" value={real.filter(r => r.allow_public).length} sub="salon ticked the box" accent={accent} c={c} />
                <StatCard label="Published" value={real.filter(r => r.published).length} sub="quotes live on vellu.cc" accent={accent} c={c} />
              </div>
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
                Salons rate Vellu on the page behind the personal link in the rating email (vellu.cc/beoordeel/…, the same link also lets them change their answer later). Their answers are private: only you see them, here. Nothing appears on vellu.cc unless you switch it on below, and even then only the average (from 3 ratings) plus quotes a salon allowed AND you published.
              </div>
              {/* Schakelaar voor de website: standaard uit. */}
              <div data-admin-site-toggle style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", background: c.bgCard, border: `1px solid ${siteOn ? `${accent}55` : c.border}`, borderRadius: 16, padding: "12px 18px", marginBottom: 16 }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>vellu.cc: </span>
                  <span style={{ color: siteOn ? accent : c.textSub }}>{siteOn ? "average rating is shown on the homepage (from 3 ratings)" : "nothing is shown on the homepage"}</span>
                </div>
                <button className="btn-ghost" disabled={siteBusy} onClick={toggleSite} style={{ fontSize: 10, padding: "8px 12px", color: siteOn ? c.danger : accent }}>
                  {siteBusy ? "Working…" : siteOn ? "Hide from vellu.cc" : "Show on vellu.cc"}
                </button>
              </div>
              {/* De mail: eerst een test naar jezelf, dan naar de salons die
                  'm nog niet kregen; per salon opnieuw sturen kan altijd
                  (zelfde link). */}
              <div data-admin-invites style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>
                    Rating email — {invites.filter(i => i.sent_at).length} of {invites.length} sent · {invites.filter(i => i.opened_at).length} opened the link · {invites.filter(i => i.answered_at).length} answered
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-ghost" data-admin-send-test disabled={sendBusy || !me} onClick={() => sendInvites("test", null, "en")} style={{ fontSize: 10, padding: "8px 12px" }}>
                      {sendBusy ? "Working…" : `Send me a test${me ? ` (${me})` : ""}`}
                    </button>
                    <button className="btn-ghost" data-admin-send-test-nl disabled={sendBusy || !me} onClick={() => sendInvites("test", null, "nl")} style={{ fontSize: 10, padding: "8px 12px" }}>
                      Dutch test
                    </button>
                    <button className="btn-primary" data-admin-send-all disabled={sendBusy || invites.every(i => i.sent_at)} onClick={() => sendInvites("send")} style={{ width: "auto", fontSize: 10, padding: "8px 14px", opacity: invites.every(i => i.sent_at) ? 0.5 : 1 }}>
                      {`Send to salons not yet invited (${invites.filter(i => !i.sent_at).length})`}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.5, marginBottom: 10 }}>
                  Every salon gets the English mail, subject "How is Vellu working for you? Rate it in one minute", sent as "Vellu" and signed Team Vellu (no personal name), replies go to mirahventures@vellu.cc. The page behind the link opens in English with a Dutch switch. A test is one mail. Each salon gets its own link vellu.cc/beoordeel/… that also lets them change their answer later. Resend sends the same link again.
                  {" "}<strong style={{ color: c.textSub, fontWeight: 600 }}>"Opened link" means they clicked the link in the mail and saw the page; whether they opened the mail itself is not tracked.</strong>
                </div>
                {sendMsg && <div data-admin-send-msg style={{ fontSize: 12, color: /^Failed/.test(sendMsg) ? c.danger : c.success, marginBottom: 10 }}>{sendMsg}</div>}
                {invites.length === 0 && <div style={{ color: c.textMuted, fontSize: 12, padding: "8px 0" }}>No active salons.</div>}
                {invites.map(i => (
                  <div key={i.owner_id} data-admin-invite style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "7px 0", fontSize: 12, borderBottom: `1px solid ${c.border}` }}>
                    <span style={{ fontWeight: 500, minWidth: 0 }}>{i.business_name || <em style={{ color: c.textMuted }}>(no name)</em>} <span style={{ color: c.textMuted, fontWeight: 400 }}>· {i.email}</span></span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, color: c.textSub, whiteSpace: "nowrap" }}>
                      <span>{i.sent_at ? `sent ${relTime(i.sent_at)}${i.sent_count > 1 ? ` (${i.sent_count}x)` : ""}` : "not sent"}</span>
                      {/* 16-10-2026 ("i cant see if they opened the link"): "opened"
                          las als de mail; het is de link (app_rating_invite zet
                          opened_at bij het openen van de pagina). Met tijd erbij,
                          en bij beantwoord staat het openen in de tooltip. */}
                      <span data-invite-status
                        title={i.opened_at ? `Link opened ${fmtDateTime(i.opened_at)}${i.answered_at ? ` · answered ${fmtDateTime(i.answered_at)}` : ""}` : undefined}
                        style={{ color: i.answered_at ? c.success : i.opened_at ? accent : c.textMuted }}>
                        {i.answered_at ? `answered ${relTime(i.answered_at)}`
                          : i.opened_at ? `opened link ${relTime(i.opened_at)}`
                          : i.sent_at ? "link not opened" : "—"}
                      </span>
                      <button className="btn-ghost" disabled={sendBusy} onClick={() => sendInvites("send", [i.owner_id])} style={{ fontSize: 10, padding: "6px 10px" }}>
                        {i.sent_at ? "Resend" : "Send"}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
                {ratings.length === 0 && <div style={{ color: c.textMuted, fontSize: 12, padding: 24, textAlign: "center" }}>No ratings yet.</div>}
                {ratings.map(r => (
                  <div key={r.owner_id} data-admin-rating style={{ padding: "16px 18px", borderBottom: `1px solid ${c.border}`, display: "grid", gridTemplateColumns: "minmax(160px, 1fr) 2fr auto", gap: 16, alignItems: "start" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        <a href={`/${r.slug}`} target="_blank" rel="noreferrer" style={{ color: c.text, textDecoration: "none" }}>{r.business_name || <em style={{ color: c.textMuted }}>(no name)</em>}</a>
                        {r.is_demo && <span style={{ marginLeft: 6, fontSize: 9, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>demo</span>}
                      </div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{(r.city || "—").trim()} · {r.country_code || "—"} · {relTime(r.updated_at)}</div>
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>{stars(Number(r.rating))}<span style={{ fontSize: 11, color: c.textSub }}>{r.rating}/5</span></div>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                      <div style={{ color: c.textLabel, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>What they think of Vellu</div>
                      <div style={{ color: r.liked ? c.text : c.textMuted }}>{r.liked || "—"}</div>
                      <div style={{ color: c.textLabel, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>Missing / would change</div>
                      <div style={{ color: r.missing ? c.text : c.textMuted }}>{r.missing || "—"}</div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11 }}>
                      <div style={{ color: r.allow_public ? c.success : c.textMuted, marginBottom: 8 }}>{r.allow_public ? "may be public" : "private"}</div>
                      <button className="btn-ghost" data-admin-publish disabled={!r.allow_public} onClick={() => togglePublished(r)}
                        style={{ fontSize: 10, padding: "8px 12px", opacity: r.allow_public ? 1 : 0.4, color: r.published ? c.danger : accent, whiteSpace: "nowrap" }}>
                        {r.published ? "Unpublish" : "Publish on vellu.cc"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {/* ── CRON HEALTH TAB ── */}
        {tab === "cron" && (
          <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>
              Cron jobs — runs in last 7 days
            </div>
            <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Red: the last run failed, or the job stopped (no run within its interval: 3 hours for the hourly payment checks, 25 hours for the rest, the same limits as the watchdog email). Orange: an error in the last 7 days, but the latest run succeeded.
            </div>
            {cronRows.length === 0 && (
              <div style={{ color: c.textMuted, fontSize: 12, padding: 20, textAlign: "center" }}>{loaded ? "No cron runs logged yet." : "Loading…"}</div>
            )}
            {cronRows.map(j => {
              // Drie standen: rood = nu stuk (laatste run faalde, of de job is
              // stil: geen hartslag binnen zijn interval, of nog nooit), oranje
              // = hersteld (fout in het 7-dagenvenster, laatste run ok), groen
              // = schoon. Tot 12-11-2026 keek de stip alleen naar fouten: een
              // job die gewoon stopte bleef groen.
              const { level, stale, failed, ageH, maxH } = j.st;
              const lastOk = j.last_status === "success";
              const dotColor = level === "down" ? c.danger : level === "recovered" ? c.warning : c.success;
              const age = ageH < 48 ? `${Math.round(ageH)} hours` : `${Math.round(ageH / 24)} days`;
              return (
                <div key={j.job_name} data-cron-row={j.job_name} data-cron-level={level} style={{ padding: "14px 0", borderBottom: `1px solid ${c.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 500 }}>{j.job_name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: stale ? c.danger : c.textMuted }}>{j.missing ? "never ran" : `last ran ${relTime(j.last_ran_at)}`}</span>
                  </div>
                  {!j.missing && (
                    <div style={{ display: "flex", gap: 16, fontSize: 11, color: c.textSub, marginTop: 8, flexWrap: "wrap" }}>
                      <span>{j.runs_last_7d} runs</span>
                      <span style={{ color: j.errors_last_7d > 0 ? (lastOk ? c.warning : c.danger) : c.textMuted }}>{j.errors_last_7d} errors</span>
                      <span>{j.total_items_processed_7d} items processed</span>
                      <span style={{ color: lastOk ? c.success : j.last_status === "degraded" ? c.warning : c.danger }}>last: {j.last_status}</span>
                    </div>
                  )}
                  {(j.missing || stale) && (
                    <div data-cron-stale style={{ marginTop: 8, fontSize: 11, color: c.danger, background: `${c.danger}14`, border: `1px solid ${c.danger}33`, borderRadius: 8, padding: "8px 10px" }}>
                      {j.missing
                        ? `No run recorded. It should run at least every ${maxH} hours.`
                        : `Stopped: no run for ${age}. It should run at least every ${maxH} hours.`}
                    </div>
                  )}
                  {failed && j.last_error && (
                    <div style={{ marginTop: 8, fontSize: 10, color: c.danger, background: `${c.danger}14`, border: `1px solid ${c.danger}33`, borderRadius: 8, padding: "8px 10px", fontFamily: "monospace" }}>
                      {j.last_error}
                    </div>
                  )}
                  {/* Hersteld: toon wél wat er mis was (en wanneer), zodat een
                      oranje stip zichzelf verklaart zonder database-duik. */}
                  {lastOk && j.errors_last_7d > 0 && j.last_error_7d && (
                    <div style={{ marginTop: 8, fontSize: 10, color: c.warning, background: `${c.warning}14`, border: `1px solid ${c.warning}33`, borderRadius: 8, padding: "8px 10px", fontFamily: "monospace" }}>
                      recovered — latest run succeeded · last error {relTime(j.last_error_at_7d)}: {j.last_error_7d}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SALON DETAIL (ronde 3, 12-11-2026): alles over één salon op één
          plek. Opent vanuit elke salonnaam; sluit met Escape, X of ernaast
          klikken. Alleen lezen, uit data die de pagina al heeft. ── */}
      {detailId && (() => {
        const s = salonById.get(detailId);
        if (!s) return null;
        const sub = subById.get(detailId);
        const ob = onboarding.find(o => o.id === detailId);
        const st = signupStatus(detailId);
        const everPaid = paidOwners.has(detailId);
        const invs = subInvoices.filter(i => i.salon_id === detailId);
        const pays = payFeed.filter(e => e.owner_id === detailId);
        const mails = emailsByOwner.get(detailId) || [];
        const cancel = lastCancelByOwner.get(detailId);
        const imports = priceImports.filter(p => p.owner_id === detailId);
        const referrer = s.referred_by ? salonById.get(s.referred_by) : null;
        const referred = salons.filter(x => x.referred_by === detailId);
        const subLine = !sub ? null
          : sub.churning ? (sub.plan_expires_at ? `Cancelled, access ends ${fmtDate(sub.plan_expires_at)}` : "Cancelled")
          : sub.classification === "paying" ? (sub.plan_expires_at ? `Renews ${fmtDate(sub.plan_expires_at)}` : "Active")
          : sub.classification === "trialing" ? (sub.trial_ends_at ? `Trial ends ${fmtDate(sub.trial_ends_at)}` : "Trial")
          : sub.classification === "past_due" ? (everPaid ? (sub.plan_expires_at ? `Unpaid since ${fmtDate(sub.plan_expires_at)}` : "Unpaid") : (sub.trial_ends_at ? `Trial ended ${fmtDate(sub.trial_ends_at)}` : "Trial ended"))
          : null;
        const label = { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel };
        const Section = ({ title, n, children }) => (
          <div style={{ marginTop: 22 }}>
            <div style={{ ...label, marginBottom: 8 }}>{title}{n != null ? ` — ${n}` : ""}</div>
            {children}
          </div>
        );
        const row = (key, left, right, sub2) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "7px 0", borderTop: `1px solid ${c.border}`, fontSize: 12 }}>
            <div style={{ minWidth: 0 }}>{left}{sub2 && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{sub2}</div>}</div>
            <div style={{ whiteSpace: "nowrap", color: c.textMuted, fontSize: 11, textAlign: "right" }}>{right}</div>
          </div>
        );
        const facts = [
          ["Signed up", fmtDate(s.created_at)],
          ["Last seen", s.last_seen ? relTime(s.last_seen) : "—"],
          ["Last booking", s.last_activity ? relTime(s.last_activity) : "—"],
          ["Country", s.country_code || "—"],
          ["Plan", [s.plan, sub?.billing_interval].filter(Boolean).join(" · ") || "—"],
          ["MRR", fmtEur(sub?.mrr_eur)],
          ["Appointments", `${s.appt_count} · ${s.completed_count} done · ${s.upcoming_count} upcoming`],
          ["Revenue", fmtCur(s.country_code, s.total_revenue)],
          ["Services on booking page", ob ? `${ob.visible_services}${ob.services !== ob.visible_services ? ` (of ${ob.services})` : ""}` : "—"],
          ["Staff accounts", s.staff_count],
          ["Google Calendar", s.google_connected ? "connected" : "—"],
          ["Referral code", s.referral_code || "—"],
        ];
        const toneCol = { ok: c.success, warn: c.warning, bad: c.danger, muted: c.textMuted };
        return (
          <div onClick={() => setDetailId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 400, display: "flex", justifyContent: "flex-end" }}>
            <aside data-salon-detail={s.slug} role="dialog" aria-modal="true" aria-label={`${nameOf(s)} details`} onClick={e => e.stopPropagation()}
              style={{ width: "min(560px, 100%)", height: "100%", overflowY: "auto", overscrollBehavior: "contain", background: c.bg, borderLeft: `1px solid ${c.border}`, color: c.text, padding: "22px 24px 48px", boxSizing: "border-box", fontFamily: "'Jost',sans-serif" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...label, color: accent, marginBottom: 6 }}>Salon</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300, lineHeight: 1.1, overflowWrap: "anywhere" }}>{nameOf(s)}</div>
                </div>
                <button type="button" data-salon-detail-close aria-label="Close" onClick={() => setDetailId(null)}
                  style={{ width: 36, height: 36, borderRadius: "50%", border: `1px solid ${c.border}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <StatusPill badge={st.badge} />
                {subLine && <span style={{ fontSize: 12, color: c.textSub }}>{subLine}</span>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ fontSize: 11, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                  Booking page
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </a>
                {s.email && (
                  <a href={`mailto:${s.email}`} className="btn-ghost" style={{ fontSize: 11, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", textTransform: "none", letterSpacing: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></svg>
                    {s.email}
                  </a>
                )}
              </div>
              {s.deactivated_at && (
                <div style={{ marginTop: 14, fontSize: 12, color: c.danger, background: `${c.danger}14`, border: `1px solid ${c.danger}44`, borderRadius: 8, padding: "9px 12px" }}>
                  Deactivated {fmtDate(s.deactivated_at)}{s.deactivated_reason ? ` · ${s.deactivated_reason}` : ""}
                </div>
              )}

              <div data-salon-facts style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px 18px", marginTop: 20 }}>
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <div style={label}>{k}</div>
                    <div style={{ fontSize: 13, marginTop: 3, overflowWrap: "anywhere", textTransform: k === "Plan" ? "capitalize" : undefined }}>{v}</div>
                  </div>
                ))}
              </div>
              {(referrer || referred.length > 0) && (
                <div style={{ fontSize: 12, color: c.textSub, marginTop: 14, lineHeight: 1.6 }}>
                  {referrer && <div>Came via {salonBtn(referrer.id, nameOf(referrer), { color: c.textSub })}</div>}
                  {referred.length > 0 && <div>Brought in {referred.map((x, k) => <span key={x.id}>{k > 0 && ", "}{salonBtn(x.id, nameOf(x), { color: c.textSub })}</span>)}</div>}
                </div>
              )}

              {cancel && (
                <Section title="Cancellation">
                  <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6 }}>
                    Cancelled {fmtDate(cancel.created_at)}{cancel.access_until ? `, access until ${fmtDate(cancel.access_until)}` : ""} · {cancelReasonLabel(cancel.reason)}
                    {cancel.note && <div style={{ color: c.text }}>“{cancel.note}”</div>}
                  </div>
                </Section>
              )}

              <Section title="Emails Vellu sent" n={mails.length}>
                {mails.length === 0
                  ? <div style={{ fontSize: 12, color: c.textMuted }}>No account emails (activation or trial) yet.</div>
                  : mails.map((m, k) => row(k, emailKindLabel(m.kind), fmtDateTime(m.sent_at)))}
              </Section>

              <Section title="Payments, last 120 days" n={pays.length}>
                {pays.length === 0
                  ? <div style={{ fontSize: 12, color: c.textMuted }}>Nothing from Mollie.</div>
                  : pays.map(e => {
                    const p = paymentLabel(e);
                    const paidLater = paidLaterOf(e);
                    return row(e.id, <><span style={{ color: paidLater ? c.textSub : toneCol[p.tone], fontWeight: 600 }}>{p.label}</span>{paidLater && <span style={{ marginLeft: 8, fontSize: 10, color: c.success }}>paid later</span>}</>, <>{fmtEur2(e.amount_eur)}<div style={{ fontSize: 10 }}>{fmtDateTime(e.created_at)}</div></>, e.description);
                  })}
              </Section>

              <Section title="Invoices" n={invs.length}>
                {invs.length === 0
                  ? <div style={{ fontSize: 12, color: c.textMuted }}>No invoices.</div>
                  : invs.map(i => row(i.invoice_number, <span style={{ fontFamily: "monospace", fontSize: 11 }}>{i.invoice_number}</span>, <>{fmtEur2(i.total_eur)}<div style={{ fontSize: 10 }}>{fmtDate(i.issued_on)}</div></>, [i.plan, i.billing_interval].filter(Boolean).join(" · ")))}
              </Section>

              {imports.length > 0 && (
                <Section title="Price lists uploaded" n={imports.length}>
                  {imports.map(p => row(p.id, p.status === "ok" ? `${p.services_found} found${p.applied_at ? `, ${p.services_added} added` : ", not added"}` : p.status, fmtDateTime(p.created_at)))}
                </Section>
              )}
            </aside>
          </div>
        );
      })()}
    </Layout>
  );
}
