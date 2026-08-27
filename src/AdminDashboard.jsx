// Platform admin dashboard. Gated by the `is_admin()` SQL function — all
// five RPCs it calls (admin_overview, admin_salons_list, admin_recent_signups,
// admin_cron_summary, admin_revenue_timeline) raise 'forbidden' unless
// auth.uid() is in the app_admins table. So the frontend route check is
// just a UX fast-fail; security sits in the DB.
//
// Lazy-loaded from App.jsx so the ~10KB of admin-only code isn't in the
// bundle a regular owner or customer downloads.

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import { useTheme, ACCENT, Layout, NavIcon, ThemeToggle, LangToggle } from "./shared.jsx";

const fmtEur = (n) => `€${Math.round(Number(n) || 0).toLocaleString("nl-NL")}`;
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
function statusBadge(classification, churning, c, accent) {
  if (churning) return { label: "churning", color: c.danger };
  switch (classification) {
    case "paying": return { label: "paying", color: c.success };
    case "trialing": return { label: "trial", color: accent };
    case "comped": return { label: "comped", color: c.textSub };
    case "cancelled": return { label: "cancelled", color: c.danger };
    case "expired": return { label: "expired", color: c.danger };
    default: return { label: classification || "none", color: c.textMuted };
  }
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
  const accent = ACCENT;
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(null); // null = loading, false = denied, true = ok
  const [overview, setOverview] = useState(null);
  const [salons, setSalons] = useState([]);
  const [recent, setRecent] = useState([]);
  const [cron, setCron] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [billing, setBilling] = useState(null);
  const [subs, setSubs] = useState([]);
  const [tab, setTab] = useState("overview"); // overview | billing | salons | signups | cron
  const [search, setSearch] = useState("");
  // Het peilmoment waar de trial-window tegen afgerekend wordt. Staat bewust in
  // state en niet los in de JSX: met Date.now() midden in de render schoof de
  // 14-dagengrens mee met elke willekeurige re-render — heen en weer klikken
  // tussen de tabs volstond — zodat dezelfde onveranderde `subs` twee keer een
  // andere lijst kon opleveren.
  const [now, setNow] = useState(() => Date.now());

  // Gate on is_admin() + load everything in parallel on mount.
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
      const [ov, sl, rs, cr, tl, bo, sb] = await Promise.all([
        supabase.rpc("admin_overview"),
        supabase.rpc("admin_salons_list"),
        supabase.rpc("admin_recent_signups", { p_days: 30 }),
        supabase.rpc("admin_cron_summary"),
        supabase.rpc("admin_revenue_timeline", { p_days: 30 }),
        supabase.rpc("admin_billing_overview"),
        supabase.rpc("admin_subscriptions_list"),
      ]);
      if (cancelled) return;
      setOverview(ov.data?.[0] || null);
      setSalons(sl.data || []);
      setRecent(rs.data || []);
      setCron(cr.data || []);
      setTimeline(tl.data || []);
      setBilling(bo.data?.[0] || null);
      setSubs(sb.data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // Het peilmoment één keer vastzetten bij het laden zou een dashboard dat de
  // hele dag openstaat laten stilstaan: een trial die vanmiddag de
  // 14-dagengrens binnenkomt verschijnt dan pas na F5 — precies de
  // conversiekans die het blok hieronder moet opvangen. Vandaar een uurtik,
  // ruim fijn genoeg voor een venster van veertien dagen. Geen renderlus: de
  // dependency-array is leeg, dus setNow zet dit effect niet opnieuw op.
  //
  // Bewust géén her-fetch van de RPC's bij die tik. Gevolg: de lijst hieronder
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

  // Simple SVG sparkline for revenue timeline
  const sparkline = (() => {
    if (!timeline.length) return null;
    const W = 720, H = 80, pad = 4;
    const maxRev = Math.max(...timeline.map(d => Number(d.revenue) || 0), 1);
    const pts = timeline.map((d, i) => {
      const x = pad + (i / Math.max(timeline.length - 1, 1)) * (W - pad * 2);
      const y = H - pad - ((Number(d.revenue) || 0) / maxRev) * (H - pad * 2);
      return { x, y, rev: Number(d.revenue) || 0, date: d.day };
    });
    const path = pts.reduce((acc, p, i) => i === 0 ? `M${p.x},${p.y}` : `${acc} L${p.x},${p.y}`, "");
    const area = `${path} L${pts[pts.length - 1].x},${H - pad} L${pts[0].x},${H - pad} Z`;
    return { path, area, pts, W, H };
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
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <ThemeToggle />
            {onLogout && <button className="btn-ghost" onClick={onLogout}>Logout</button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${c.border}`, overflowX: "auto" }}>
          {[
            ["overview", "Overview"],
            ["billing", "Revenue"],
            ["salons", "Salons"],
            ["signups", "Signups (30d)"],
            ["cron", "Cron health"],
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
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              <StatCard label="Total salons" value={overview?.total_salons ?? "—"} sub={`${overview?.paid_salons ?? 0} on paid plans`} accent={accent} c={c} />
              <StatCard label="New (7 days)" value={overview?.salons_last_7d ?? "—"} sub="signups this week" accent={accent} c={c} />
              <StatCard label="Total appts" value={overview?.total_appointments ?? "—"} sub={`${overview?.appointments_last_30d ?? 0} in last 30d`} accent={accent} c={c} />
              <StatCard label="Total revenue" value={fmtEur(overview?.total_revenue_eur)} sub={`${fmtEur(overview?.revenue_last_30d_eur)} last 30d`} accent={accent} c={c} />
              <StatCard label="Staff accounts" value={overview?.total_staff ?? "—"} accent={accent} c={c} />
              <StatCard label="Unique clients" value={overview?.total_clients ?? "—"} accent={accent} c={c} />
              <StatCard label="Avg appts/salon" value={overview?.avg_appointments_per_salon ?? "—"} accent={accent} c={c} />
            </div>

            {/* Revenue timeline */}
            {sparkline && (
              <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 12 }}>
                  Revenue — last 30 days (all salons)
                </div>
                <svg viewBox={`0 0 ${sparkline.W} ${sparkline.H}`} style={{ width: "100%", height: 100, display: "block" }}>
                  <defs>
                    <linearGradient id="adminRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={accent} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={sparkline.area} fill="url(#adminRev)" />
                  <path d={sparkline.path} fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.textMuted, marginTop: 8 }}>
                  <span>{sparkline.pts[0]?.date}</span>
                  <span>{sparkline.pts[sparkline.pts.length - 1]?.date}</span>
                </div>
              </div>
            )}

            {/* Recent signups preview */}
            {recent.length > 0 && (
              <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>Most recent signups</div>
                  <button style={{ fontSize: 11, color: accent, background: "none", border: "none", cursor: "pointer" }} onClick={() => setTab("signups")}>See all →</button>
                </div>
                {recent.slice(0, 5).map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${c.border}`, fontSize: 13 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{s.business_name || <em style={{ color: c.textMuted }}>(no name)</em>}</div>
                      <div style={{ fontSize: 11, color: c.textMuted }}>{s.email} · {s.city || "—"}{s.referred_by_name ? ` · via ${s.referred_by_name}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 11, color: c.textSub, textAlign: "right" }}>
                      <div>{relTime(s.created_at)}</div>
                      <div style={{ color: s.plan ? accent : c.textMuted, fontWeight: s.plan ? 600 : 400 }}>{s.plan || "no plan"}</div>
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
              {(billing?.churning_count ?? 0) > 0 && <StatCard label="Churning" value={billing.churning_count} sub="cancel at period end" accent={c.danger} c={c} />}
              {(billing?.comped_count ?? 0) > 0 && <StatCard label="Comped / free" value={billing.comped_count} sub="active, not paying (demo/comped)" accent={c.textSub} c={c} />}
            </div>

            <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
              MRR counts salons with an active Mollie subscription, plus yearly customers with a paid invoice covering today (the yearly flow is a one-off payment, no Mollie subscription) — yearly counts at its monthly equivalent (price ÷ 12). Trials and comped/demo accounts contribute €0 until they convert. All amounts in euro — Vellu always bills in euro, whatever currency the salon itself uses.
            </div>

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
                      const badge = statusBadge(s.classification, s.churning, c, accent);
                      return (
                        <tr key={s.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: "12px 14px" }}>
                            <a href={`/${s.slug}`} target="_blank" rel="noreferrer" style={{ color: c.text, textDecoration: "none", fontWeight: 500 }}>{s.business_name || <em style={{ color: c.textMuted }}>(no name)</em>}</a>
                          </td>
                          <td style={{ padding: "12px 14px", color: c.textSub, textTransform: "capitalize" }}>{s.plan || "—"}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: badge.color, background: `${badge.color}1a`, borderRadius: 20, padding: "3px 10px" }}>{badge.label}</span>
                          </td>
                          <td style={{ padding: "12px 14px", color: c.textMuted, fontSize: 11 }}>{s.billing_interval || "—"}</td>
                          <td style={{ padding: "12px 14px", color: Number(s.mrr_eur) > 0 ? accent : c.textMuted, fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{fmtEur(s.mrr_eur)}</td>
                          <td style={{ padding: "12px 14px", color: c.textMuted, fontSize: 11 }}>
                            {s.classification === "paying"
                              ? (s.plan_expires_at ? `renews ${fmtDate(s.plan_expires_at)}` : "active")
                              : s.classification === "trialing"
                                ? (s.trial_ends_at ? `trial ends ${fmtDate(s.trial_ends_at)}` : "trial")
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
            <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
                      {["Salon", "Plan", "Staff", "Appts", "Revenue", "Last activity", "Signed up", "GCal"].map(h => (
                        <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSalons.map(s => (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ padding: "12px 14px" }}>
                          <a href={`/${s.slug}`} target="_blank" rel="noreferrer" style={{ color: c.text, textDecoration: "none", fontWeight: 500 }}>{s.business_name || <em style={{ color: c.textMuted }}>(no name)</em>}</a>
                          <div style={{ fontSize: 10, color: c.textMuted }}>{s.email} · {s.city || "—"}</div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontSize: 11, color: s.plan ? accent : c.textMuted, fontWeight: s.plan ? 600 : 400 }}>{s.plan || "—"}</span>
                        </td>
                        <td style={{ padding: "12px 14px", color: c.textSub }}>{s.staff_count}</td>
                        <td style={{ padding: "12px 14px", color: c.textSub }}>
                          {s.appt_count}
                          <div style={{ fontSize: 9, color: c.textMuted }}>{s.completed_count} done · {s.upcoming_count} upcoming</div>
                        </td>
                        <td style={{ padding: "12px 14px", color: accent, fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{fmtEur(s.total_revenue)}</td>
                        <td style={{ padding: "12px 14px", color: c.textMuted, fontSize: 11 }}>{relTime(s.last_activity)}</td>
                        <td style={{ padding: "12px 14px", color: c.textMuted, fontSize: 11 }}>{fmtDate(s.created_at)}</td>
                        <td style={{ padding: "12px 14px", color: s.google_connected ? c.success : c.textMuted, fontSize: 14 }}>{s.google_connected ? "✓" : "—"}</td>
                      </tr>
                    ))}
                    {visibleSalons.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: "24px", textAlign: "center", color: c.textMuted, fontSize: 12 }}>No salons match.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${c.border}` }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{s.business_name || <em style={{ color: c.textMuted }}>(no name)</em>}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                    {s.email} · {s.city || "—"} · /{s.slug}
                    {s.referred_by_name && <span style={{ color: accent }}> · referred by {s.referred_by_name}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 11 }}>
                  <div style={{ color: s.plan ? accent : c.textMuted, fontWeight: s.plan ? 600 : 400 }}>{s.plan || "no plan"}</div>
                  <div style={{ color: c.textMuted }}>{fmtDateTime(s.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CRON HEALTH TAB ── */}
        {tab === "cron" && (
          <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 12 }}>
              Cron jobs — runs in last 7 days
            </div>
            {cron.length === 0 && (
              <div style={{ color: c.textMuted, fontSize: 12, padding: 20, textAlign: "center" }}>No cron runs logged yet.</div>
            )}
            {cron.map(j => {
              const healthy = j.last_status === "success" && j.errors_last_7d === 0;
              return (
                <div key={j.job_name} style={{ padding: "14px 0", borderBottom: `1px solid ${c.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: healthy ? c.success : c.danger, display: "inline-block" }} />
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 500 }}>{j.job_name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: c.textMuted }}>last ran {relTime(j.last_ran_at)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: c.textSub, marginTop: 8, flexWrap: "wrap" }}>
                    <span>{j.runs_last_7d} runs</span>
                    <span style={{ color: j.errors_last_7d > 0 ? c.danger : c.textMuted }}>{j.errors_last_7d} errors</span>
                    <span>{j.total_items_processed_7d} items processed</span>
                    <span style={{ color: healthy ? c.success : c.danger }}>last: {j.last_status}</span>
                  </div>
                  {j.last_error && (
                    <div style={{ marginTop: 8, fontSize: 10, color: c.danger, background: `${c.danger}14`, border: `1px solid ${c.danger}33`, borderRadius: 8, padding: "8px 10px", fontFamily: "monospace" }}>
                      {j.last_error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
