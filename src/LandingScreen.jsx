import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import {
  useTheme, useSEO, ACCENT, T, COUNTRIES, Layout, NavIcon, LangToggle, ThemeToggle, Header, PlanCompareTable
} from "./shared.jsx";

function LandingScreen({ onSelectSalon, onOwnerEnter, lang, setLang, salons = {} }) {
  const { colors: c, theme } = useTheme();
  const navigate = useNavigate();
  const t = T[lang];
  useSEO({
    title: lang === "nl" ? "Vellu - Beauty Booking Platform | 0% Commissie" : "Vellu - Beauty Booking Platform | 0% Commission",
    description: lang === "nl" ? "Je eigen boekingspagina met jouw naam, jouw kleuren en jouw diensten. Vast tarief, 0% commissie." : "Your own booking page with your name, your colors and your services. Fixed price, 0% commission.",
    url: "https://vellu.cc/"
  });
  const [slugInput, setSlugInput] = useState("");
  const [error, setError] = useState("");
  const [faqOpen, setFaqOpen] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly"); // "monthly" | "yearly"

  const goToSlug = (slug) => {
    let clean = slug.toLowerCase().trim()
      .replace(/^https?:\/\//, "")
      .replace(/^(www\.)?vellu\.cc\//, "");
    // Only allow slug charset — a-z 0-9 dash. Strip everything else so a pasted
    // `https://evil.com/foo` can't build a weird path that hits another salon.
    clean = clean.replace(/[^a-z0-9-]/g, "");
    if (!clean) return;
    navigate("/" + clean);
  };

  const faqs = lang === "nl" ? [
    ["Wat is Vellu precies?", "Vellu geeft jou je eigen boekingspagina op vellu.cc/jouw-naam. Klanten boeken direct bij jou, zonder tussenpartij. Jij beheert alles vanuit je dashboard."],
    ["Voor wie is Vellu?", "Voor onafhankelijke beauty professionals: nail techs, lash artists, brow specialists, kappers, en beautysalons. Of je nu solo werkt of een team hebt."],
    ["Hoeveel kost het?", "Starter is €19/maand, Professional €39/maand. Vast tarief, 0% commissie per boeking. Geen verborgen kosten."],
    ["Waarom geen commissie?", "Wij geloven dat jouw omzet van jou is. Je betaalt een vast bedrag per maand en houdt 100% van elke boeking."],
    ["Kan ik het eerst uitproberen?", "Ja, je kan je pagina gratis opzetten en alles instellen. Je betaalt pas als je live wilt gaan."],
    ["Kunnen mijn medewerkers hun eigen agenda beheren?", "Ja! Met het Professional plan krijgt elke medewerker een eigen login. Ze zien alleen hun eigen afspraken en beheren hun eigen diensten en werktijden."],
    ["Krijgen klanten herinneringen?", "Ja, automatisch. Bevestiging bij het boeken, herinnering 24 uur van tevoren, en een follow-up na het bezoek voor een review."],
    ["Hoe annuleren klanten?", "Via de annuleringslink in hun bevestigingsmail. Jij bepaalt tot wanneer ze kunnen annuleren."],
    ["Hoe verschilt Vellu van andere booking platformen?", "De meeste booking platformen rekenen 5–10% commissie per boeking — bij 50 boekingen á €45 betaal je al snel €100–€225 per maand. Vellu is een vast tarief vanaf €19/maand, 0% commissie. Daarnaast krijg je je eigen merk-pagina (vellu.cc/jouw-naam) in plaats van een profiel in een zoekplatform; jouw klanten blijven jouw klanten."],
    ["Kan ik mijn klanten meenemen van een ander systeem?", "Ja. Heb je een export (CSV) van je huidige booking platform? Importeer 'm direct in je dashboard onder Klanten → Importeer. Vellu herkent de gangbare kolomnamen (naam, e-mail, telefoon, notities) automatisch. Lukt het niet? Stuur 'm naar Contact en wij helpen je gratis."],
  ] : [
    ["What is Vellu exactly?", "Vellu gives you your own booking page at vellu.cc/your-name. Clients book directly with you, no middleman. You manage everything from your dashboard."],
    ["Who is Vellu for?", "For independent beauty professionals: nail techs, lash artists, brow specialists, hairdressers, and beauty salons. Whether you work solo or have a team."],
    ["How much does it cost?", "Starter is €19/month, Professional €39/month. Fixed price, 0% commission per booking. No hidden fees."],
    ["Why no commission?", "We believe your revenue is yours. You pay a fixed monthly fee and keep 100% of every booking."],
    ["Can I try it first?", "Yes, you can set up your page for free and configure everything. You only pay when you want to go live."],
    ["Can my staff manage their own agenda?", "Yes! With the Professional plan, each staff member gets their own login. They only see their own appointments and manage their own services and hours."],
    ["Do clients receive reminders?", "Yes, automatically. Confirmation when booking, reminder 24 hours before, and a follow-up after the visit for a review."],
    ["How do clients cancel?", "Via the cancellation link in their confirmation email. You decide the cancellation deadline."],
    ["How is Vellu different from other booking platforms?", "Most booking platforms charge 5–10% commission per booking — at 50 bookings of €45 that quickly adds up to €100–€225/month. Vellu is a flat fee from €19/month, 0% commission. You also get your own branded page (vellu.cc/your-name) instead of a profile in a marketplace; your clients stay your clients."],
    ["Can I bring my clients from another system?", "Yes. Got a CSV export from your current booking platform? Import it directly in your dashboard under Customers → Import. Vellu auto-detects common column names (name, email, phone, notes). Stuck? Send it to Contact and we'll help you for free."],
  ];

  return (
    <Layout>
      <div style={{
        background: c.bg,
        minHeight: "100dvh",
        fontFamily: "'Jost',sans-serif",
        color: c.text,
        position: "relative",
        overflow: "clip"
      }}>
        {/* Ambient glow */}
        <div style={{ position: "absolute", top: "-20%", left: "20%", width: "60%", height: "60%", background: `radial-gradient(ellipse at center, ${ACCENT}0a 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "-10%", width: "40%", height: "40%", background: `radial-gradient(ellipse at center, ${ACCENT}06 0%, transparent 60%)`, pointerEvents: "none" }} />

        {/* Navigation — extra top padding for iOS Dynamic Island / notch. */}
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "calc(16px + env(safe-area-inset-top, 0px)) clamp(16px, 4vw, 32px) 16px", position: "relative", zIndex: 10, maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 300, letterSpacing: "0.18em" }}>vellu</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="btn-ghost"
              onClick={() => document.getElementById("find-salon")?.scrollIntoView({ behavior: "smooth" })}
              style={{ fontSize: 10, padding: "8px 10px", whiteSpace: "nowrap", color: c.textMuted, borderColor: "transparent", display: "none" }}
              data-show-on-desktop
            >
              {t.findSalonNav}
            </button>
            <ThemeToggle />
            <LangToggle lang={lang} setLang={setLang} />
            <button className="btn-ghost" style={{ fontSize: 11, padding: "8px 12px", whiteSpace: "nowrap" }} onClick={() => navigate("/owner")}>
              <NavIcon name="crown" size={12} color={ACCENT} /> {t.signIn}
            </button>
          </div>
        </nav>
        <style>{`@media (min-width: 720px) { [data-show-on-desktop] { display: inline-flex !important; } }`}</style>

        {/* ─── HERO — copy left, live product mockup right (stacks on mobile) ─── */}
        <style>{`
          .hero-grid { display: grid; grid-template-columns: 1fr; gap: 48px; align-items: center; max-width: 1040px; margin: 0 auto; padding: clamp(28px, 6vw, 64px) 24px 48px; position: relative; z-index: 10; }
          .hero-copy { text-align: center; }
          .hero-copy .hero-sub { margin-left: auto; margin-right: auto; }
          .hero-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
          .hero-stats { justify-content: center; }
          @media (min-width: 880px) {
            .hero-grid { grid-template-columns: 1.08fr 0.92fr; gap: 28px; }
            .hero-copy { text-align: left; }
            .hero-copy .hero-sub { margin-left: 0; margin-right: 0; }
            .hero-ctas { justify-content: flex-start; }
            .hero-stats { justify-content: flex-start; }
          }
          @keyframes heroFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
          .hero-phone-float { animation: heroFloat 7s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) { .hero-phone-float { animation: none; } }
        `}</style>
        <div className="hero-grid">
          <div className="hero-copy fade-up">
            <div style={{ display: "inline-block", background: `${ACCENT}15`, border: `1px solid ${ACCENT}33`, borderRadius: 100, padding: "6px 18px", fontSize: 11, fontWeight: 500, color: ACCENT, letterSpacing: "0.04em", marginBottom: 26 }}>
              <NavIcon name="sparkle" size={11} color={ACCENT} /> {t.heroTag}
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(42px, 7.5vw, 64px)", fontWeight: 300, letterSpacing: "0.05em", lineHeight: 1.06, marginBottom: 22 }}>
              {t.heroTitle}
              <br />
              <span style={{ color: ACCENT }}>{t.heroBrand}</span>
            </h1>
            <p className="hero-sub" style={{ fontSize: "clamp(14px, 2vw, 16px)", color: c.textSub, lineHeight: 1.7, maxWidth: 440, marginBottom: 34, letterSpacing: "0.01em" }}>
              {t.heroSub}
            </p>
            <div className="hero-ctas">
              <button className="btn-primary" style={{ width: "auto", padding: "16px 36px", fontSize: 13 }} onClick={() => navigate("/owner")}>
                {t.startFree}
              </button>
              <button className="btn-ghost" style={{ width: "auto", padding: "16px 28px", fontSize: 13, color: c.textSub }} onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                {t.howItWork}
              </button>
            </div>
            {/* Stats — full strength, they carry the pitch */}
            <div className="hero-stats" style={{ display: "flex", gap: "14px 36px", flexWrap: "wrap", marginTop: 40 }}>
              {[
                { num: "0%", nl: "Commissie", en: "Commission" },
                { num: "24/7", nl: "Online boekbaar", en: "Bookable online" },
                { num: "€19", nl: "Vast per maand", en: "Fixed per month" },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, fontWeight: 300, color: ACCENT, lineHeight: 1 }}>{s.num}</div>
                  <div style={{ fontSize: 10, color: c.textSub, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>{lang === "nl" ? s.nl : s.en}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="fade-up">
            <HeroPhoneMockup lang={lang} c={c} />
          </div>
        </div>

        {/* ─── FIND-A-SALON — sits just above the calculator so the
            owner-acquisition flow above stays uninterrupted while still
            keeping the client search easy to spot. */}
        <div id="find-salon" style={{ padding: "0 24px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 700, margin: "0 auto", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{t.findSalonTitle}</div>
              <div style={{ fontSize: 10, color: c.textMuted, lineHeight: 1.5 }}>{t.findSalonSub}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flex: "1 1 240px" }}>
              <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: c.textMuted, pointerEvents: "none" }}>vellu.cc/</div>
                <input className="input-field" placeholder={lang === "nl" ? "salon-naam" : "salon-name"} value={slugInput} onChange={e => setSlugInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && goToSlug(slugInput)} style={{ paddingLeft: 70, borderRadius: 10, fontSize: 12, padding: "9px 12px 9px 70px" }} />
              </div>
              <button className="btn-primary" style={{ width: "auto", padding: "9px 16px", flexShrink: 0, fontSize: 13 }} onClick={() => goToSlug(slugInput)}>→</button>
            </div>
          </div>
        </div>

        {/* ─── SAVINGS CALCULATOR ───
            Concrete €€ saved vs a typical commission platform — sliders feel
            more interactive than a static comparison block and force the
            visitor to engage with the number, which is the real selling
            point of the 0% commission model. */}
        <div style={{ padding: "0 24px 60px", position: "relative", zIndex: 10 }}>
          <Reveal><div style={{ maxWidth: 700, margin: "0 auto", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 24, padding: "32px clamp(20px, 4vw, 36px)" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 300, marginBottom: 6 }}>{t.calcTitle}</h2>
              <div style={{ fontSize: 12, color: c.textLabel, lineHeight: 1.55, maxWidth: 460, margin: "0 auto" }}>{t.calcSub}</div>
            </div>
            <SavingsCalculator lang={lang} t={t} c={c} />
          </div></Reveal>
        </div>

        {/* ─── HOW IT WORKS — subtle tint band breaks the page rhythm ─── */}
        <div id="how-it-works" style={{ padding: "64px 24px", position: "relative", zIndex: 10, background: `linear-gradient(180deg, transparent, ${ACCENT}07 18%, ${ACCENT}07 82%, transparent)` }}>
          <Reveal><div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {t.liveIn3}
              </h2>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
              {[
                { num: "01", icon: "diamond", title: t.step1, desc: t.step1d },
                { num: "02", icon: "target", title: t.step2, desc: t.step2d },
                { num: "03", icon: "sparkle", title: t.step3, desc: t.step3d }
              ].map((item, i) => (
                <div key={i} style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 24, padding: "32px 28px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 16, right: 20, fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: `${ACCENT}12` }}>{item.num}</div>
                  <div style={{ marginBottom: 16 }}><NavIcon name={item.icon} size={28} color={ACCENT} /></div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 13, color: c.textLabel, lineHeight: 1.7 }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
          </div></Reveal>
        </div>

        {/* ─── FEATURES ─── */}
        <div style={{ padding: "48px 24px 64px", position: "relative", zIndex: 10 }}>
          <Reveal><div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {t.everythingNeeded}
              </h2>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            {/* Bento grid — two anchor cards with real visual weight, then
                supporting tiles. Breaks the uniform-tile monotony and gives
                the eye a hierarchy to follow. */}
            <style>{`
              .bento { display: grid; gap: 14px; grid-template-columns: 1fr; }
              .bento-card { transition: transform 0.25s ease, border-color 0.25s ease; }
              .bento-card:hover { transform: translateY(-3px); }
              @media (min-width: 720px) {
                .bento { grid-template-columns: repeat(3, 1fr); }
                .bento-wide { grid-column: span 2; }
              }
            `}</style>
            <div className="bento">
              {/* Anchor 1 — your own branded page, with a mini URL + row mock */}
              <div className="bento-card bento-wide" style={{ padding: "24px 22px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20 }}>
                <NavIcon name="calendar" size={24} color={ACCENT} />
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{lang === "nl" ? "Eigen boekingspagina" : "Your own booking page"}</div>
                <div style={{ fontSize: 12, color: c.textLabel, lineHeight: 1.6, marginBottom: 16 }}>{lang === "nl" ? "Jouw merk, jouw kleuren, jouw link. Klanten boeken direct bij jou — zonder tussenpartij." : "Your brand, your colors, your link. Clients book directly with you — no middleman."}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", background: c.bg, border: `1px solid ${ACCENT}33`, borderRadius: 100, fontSize: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
                  <span style={{ color: c.textSub }}>vellu.cc/</span><span style={{ color: ACCENT, fontWeight: 600 }}>{lang === "nl" ? "jouw-naam" : "your-name"}</span>
                </div>
              </div>
              {/* Anchor 2 — 0% commission, oversized numeral */}
              <div className="bento-card" style={{ padding: "24px 22px", background: `linear-gradient(160deg, ${ACCENT}14, transparent 70%)`, border: `1px solid ${ACCENT}33`, borderRadius: 20, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 64, fontWeight: 300, color: ACCENT, lineHeight: 1 }}>0%</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>{lang === "nl" ? "Commissie" : "Commission"}</div>
                <div style={{ fontSize: 12, color: c.textLabel, lineHeight: 1.6 }}>{lang === "nl" ? "Vast maandtarief. Elke euro van elke boeking blijft van jou." : "Flat monthly fee. Every euro of every booking stays yours."}</div>
              </div>
              {/* Supporting tiles */}
              {[
                { icon: "team", nl: "Team accounts", en: "Team accounts", sub: { nl: "Elke medewerker een eigen login, agenda en diensten", en: "Each staff member gets their own login, schedule and services" } },
                { icon: "mail", nl: "Automatische emails", en: "Automatic emails", sub: { nl: "Bevestigingen, herinneringen en follow-ups", en: "Confirmations, reminders and follow-ups" } },
                { icon: "star2", nl: "Reviews", en: "Reviews", sub: { nl: "Automatisch reviews verzamelen na elk bezoek", en: "Automatically collect reviews after every visit" }, stars: true },
                { icon: "palette", nl: "Eigen branding", en: "Custom branding", sub: { nl: "Jouw logo, kleuren en stijl", en: "Your logo, colors and style" }, swatch: true },
                { icon: "camera", nl: "Portfolio", en: "Portfolio", sub: { nl: "Foto's per behandeling tonen", en: "Show photos per treatment" } },
                { icon: "tag", nl: "Kortingscodes", en: "Discount codes", sub: { nl: "Maak en deel korting met je klanten", en: "Create and share discounts with clients" }, code: true },
              ].map((f, i) => (
                <div key={i} className="bento-card" style={{ padding: "20px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20 }}>
                  <NavIcon name={f.icon} size={22} color={ACCENT} />
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{lang === "nl" ? f.nl : f.en}</div>
                  <div style={{ fontSize: 11, color: c.textLabel, lineHeight: 1.55 }}>{lang === "nl" ? f.sub.nl : f.sub.en}</div>
                  {f.stars && <div style={{ marginTop: 10, fontSize: 12, color: ACCENT, letterSpacing: "0.2em" }}>★★★★★</div>}
                  {f.swatch && (
                    <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                      {["#c9a96e", "#b7a29a", "#8fa596", "#a49ab8"].map(col => (
                        <span key={col} style={{ width: 16, height: 16, borderRadius: "50%", background: col, border: `2px solid ${c.bg}`, boxShadow: `0 0 0 1px ${c.border}` }} />
                      ))}
                    </div>
                  )}
                  {f.code && (
                    <div style={{ marginTop: 12, display: "inline-block", padding: "4px 10px", border: `1px dashed ${ACCENT}66`, borderRadius: 8, fontSize: 10, fontFamily: "monospace", letterSpacing: "0.1em", color: ACCENT }}>WELKOM10</div>
                  )}
                </div>
              ))}
            </div>
          </div></Reveal>
        </div>

        {/* TESTIMONIALS section removed — the previous hardcoded names/quotes are
            fabricated marketing content, which under the AVG/Wet OHP (misleidende reclame)
            creates real legal exposure. Re-add this section only when you have real,
            opt-in reviews with written consent from the people named. */}

        {/* ─── PRICING — tinted band, mirrors the how-it-works section ─── */}
        <div style={{ padding: "64px 24px", position: "relative", zIndex: 10, background: `linear-gradient(180deg, transparent, ${ACCENT}07 18%, ${ACCENT}07 82%, transparent)` }}>
          <Reveal><div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {t.simplePricing}
              </h2>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            {/* Billing cycle toggle */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
              <div role="radiogroup" aria-label={t.simplePricing} style={{ display: "inline-flex", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 100, padding: 4, position: "relative" }}>
                {[
                  { key: "monthly", label: t.billingMonthly },
                  { key: "yearly", label: t.billingYearly }
                ].map(opt => {
                  const active = billingCycle === opt.key;
                  return (
                    <button
                      key={opt.key}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setBillingCycle(opt.key)}
                      style={{
                        padding: "9px 22px",
                        borderRadius: 100,
                        border: "none",
                        background: active ? ACCENT : "transparent",
                        color: active ? c.btnOnDark : c.textSub,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        cursor: "pointer",
                        fontFamily: "'Jost',sans-serif",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      {opt.label}
                      {opt.key === "yearly" && (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          padding: "3px 8px",
                          borderRadius: 100,
                          background: active ? c.btnOnDark : `${ACCENT}22`,
                          color: active ? ACCENT : ACCENT,
                        }}>
                          {t.twoMonthsFree}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {[
                { name: "Starter", price: 19, popular: false, features: { nl: ["Online boekingen", "Email bevestigingen", "24u herinneringen", "Reviews systeem", "Eigen branding & logo", "Tot 3 medewerkers"], en: ["Online bookings", "Email confirmations", "24h reminders", "Reviews system", "Custom branding & logo", "Up to 3 staff members"] } },
                { name: "Professional", price: 39, popular: true, features: { nl: ["Alles van Starter +", "Onbeperkt medewerkers", "Team accounts (eigen login)", "Analytics dashboard", "Kortingscodes", "Nieuwsbrief & klant-export", "Meerdere locaties", "Prioriteit support"], en: ["Everything in Starter +", "Unlimited staff members", "Team accounts (own login)", "Analytics dashboard", "Discount codes", "Newsletter & client export", "Multiple locations", "Priority support"] } },
              ].map((plan, i) => {
                const yearlyTotal = plan.price * 10; // 2 months free
                const displayPrice = billingCycle === "yearly" ? yearlyTotal : plan.price;
                const displaySuffix = billingCycle === "yearly" ? t.perYear : t.perMonth;
                return (
                <div key={i} style={{
                  background: plan.popular ? `${ACCENT}08` : c.bgCard,
                  border: `1.5px solid ${plan.popular ? ACCENT : c.border}`,
                  borderRadius: 24, padding: "32px 28px", position: "relative"
                }}>
                  {plan.popular && (
                    <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: ACCENT, color: c.btnOnDark, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 16px", borderRadius: 100 }}>
                      {t.popular}
                    </div>
                  )}
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{plan.name}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: ACCENT }}>
                      €{displayPrice}<span style={{ fontSize: 16, color: c.textMuted }}>{displaySuffix}</span>
                    </div>
                    {billingCycle === "yearly" && (
                      <div style={{ fontSize: 11, color: c.textSub, marginTop: 4, fontWeight: 500 }}>
                        {t.yearlyEquivalent.replace("{m}", (yearlyTotal / 12).toFixed(2).replace(".", ","))} · <span style={{ color: ACCENT }}>{t.twoMonthsFree}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {(lang === "nl" ? plan.features.nl : plan.features.en).map((f, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: c.textSub }}>
                        <NavIcon name="check" size={14} color={ACCENT} />{f}
                      </div>
                    ))}
                  </div>
                  <button className={plan.popular ? "btn-primary" : "btn-ghost"} style={{ width: "100%", ...(plan.popular ? {} : { borderColor: `${ACCENT}44`, color: ACCENT }) }}
                    onClick={() => navigate("/owner")}>
                    {t.getStarted}
                  </button>
                </div>
                );
              })}
            </div>
            {/* Full feature comparison — collapsed by default so the pricing
                section stays scannable; the table answers "what exactly do I
                miss on Starter?" without a support question. */}
            <div style={{ marginTop: 20 }}>
              <PlanCompareTable lang={lang} accent={ACCENT} />
            </div>
          </div></Reveal>
        </div>

        {/* ─── FAQ ─── */}
        <div style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <Reveal><div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {t.faqTitle}
              </h2>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            {faqs.map(([q, a], i) => (
              <div key={i} style={{ borderBottom: "1px solid " + c.border, marginBottom: 0 }}>
                <div role="button" tabIndex={0} aria-expanded={faqOpen === i} onClick={() => setFaqOpen(faqOpen === i ? null : i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFaqOpen(faqOpen === i ? null : i); } }} style={{ padding: "18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{q}</div>
                  <div style={{ fontSize: 18, color: c.textMuted, transition: "transform 0.2s", transform: faqOpen === i ? "rotate(45deg)" : "none" }}>+</div>
                </div>
                {faqOpen === i && (
                  <div style={{ paddingBottom: 18, fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{a}</div>
                )}
              </div>
            ))}
          </div></Reveal>
        </div>

        {/* ─── FINAL CTA ─── */}
        <div style={{ padding: "20px 24px 80px", textAlign: "center", position: "relative", zIndex: 10 }}>
          <Reveal><div style={{ maxWidth: 600, margin: "0 auto", background: `linear-gradient(160deg, ${ACCENT}10, transparent 60%), ${c.bgCard}`, border: `1px solid ${ACCENT}33`, borderRadius: 28, padding: "52px 32px" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(26px, 5vw, 36px)", fontWeight: 300, marginBottom: 12 }}>
              {t.ctaTitle}
            </div>
            <p style={{ fontSize: 14, color: c.textLabel, marginBottom: 28, lineHeight: 1.6 }}>
              {t.ctaSub}
            </p>
            <button className="btn-primary" style={{ width: "auto", padding: "16px 44px", fontSize: 14 }} onClick={() => navigate("/owner")}>
              {t.startFree}
            </button>
          </div></Reveal>
        </div>

        {/* Footer */}
        <footer style={{ padding: "24px 32px 32px", textAlign: "center", borderTop: "1px solid " + c.border, position: "relative", zIndex: 10 }}>
          <div style={{ fontSize: 10, color: c.textMuted, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px", marginBottom: 12, letterSpacing: "0.04em" }}>
            <a href="https://mirahventures.com" target="_blank" rel="noopener noreferrer" style={{ color: c.textMuted, textDecoration: "none" }}>Mirah Ventures</a>
            <span>·</span>
            <span>KVK 42045867</span>
            <span>·</span>
            <span>BTW NL005453873B29</span>
          </div>
          <div style={{ fontSize: 11, color: c.textMuted, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px" }}>
            <span>© {new Date().getFullYear()} vellu</span>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>Privacy</a>
            <a href="/terms" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{t.terms}</a>
            <a href="/dpa" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{t.dpa}</a>
            <a href="/contact" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>Contact</a>
            <a href="https://mirahventures.com" target="_blank" rel="noopener noreferrer" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Ontwikkeld door Mirah Ventures" : "Developed by Mirah Ventures"}</a>
          </div>
        </footer>

        {/* Sticky bottom-right CTA pill — appears after scrolling past hero so
            the conversion ask is one tap away regardless of how far down the
            page they've scrolled. */}
        <StickyStartPill onClick={() => navigate("/owner")} label={t.startFree} />
      </div>
    </Layout>
  );
}

// Renders a floating "Start trial" pill bottom-right once the visitor has
// scrolled past the hero. Hidden while in the hero so it doesn't compete
// with the primary CTA there.
function StickyStartPill({ onClick, label }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        position: "fixed", right: 20, bottom: 20, zIndex: 50,
        padding: "12px 22px", borderRadius: 100, border: "none",
        background: ACCENT, color: "#fff",
        fontFamily: "'Jost',sans-serif", fontSize: 13, fontWeight: 600,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.25s, transform 0.25s",
      }}
    >
      {label}
    </button>
  );
}

// Scroll-reveal wrapper: children fade/slide in the first time they enter
// the viewport. No-ops (instantly visible) when IntersectionObserver is
// unavailable or the user prefers reduced motion.
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced || typeof IntersectionObserver === "undefined") { setVis(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); io.disconnect(); }
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(22px)", transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms` }}>
      {children}
    </div>
  );
}

// Real product screenshots shown inside the hero phone frame, cross-faded on a
// timer so the device feels alive. Files live in /public. If they 404,
// HeroPhoneMockup falls back to the CSS mockup below.
const HERO_SHOTS = ["/hero-phone-1.jpg", "/hero-phone-2.jpg"];

// Phone frame for the hero. Renders the real screenshots (HERO_SHOTS) when
// present; otherwise falls back to a CSS-only mockup of a fictional salon's
// booking page, built from plain divs so it always matches the product's
// design language. Stays inside the site's gold palette so the hero reads as
// one composition.
function HeroPhoneMockup({ lang, c }) {
  const services = [
    [lang === "nl" ? "Gel manicure" : "Gel manicure", "45 min", "€38"],
    [lang === "nl" ? "BIAB nieuwe set" : "BIAB new set", "60–75 min", lang === "nl" ? "Vanaf €52" : "From €52"],
    [lang === "nl" ? "Brow lift & verf" : "Brow lift & tint", "30 min", "€29"],
  ];
  const cats = lang === "nl" ? ["Nagels", "Brows", "Lashes"] : ["Nails", "Brows", "Lashes"];
  const slots = ["10:00", "11:30", "13:00", "15:30"];
  const darkOnGold = "#1a1713";
  // Prefer the real product screenshots (HERO_SHOTS); if they're missing,
  // onError flips this false and we render the CSS mockup instead. The two
  // shots cross-fade on a timer so the hero feels alive.
  const [useShot, setUseShot] = useState(true);
  const [shotIdx, setShotIdx] = useState(0);
  useEffect(() => {
    if (!useShot) return;
    const id = setInterval(() => setShotIdx(i => (i + 1) % HERO_SHOTS.length), 3800);
    return () => clearInterval(id);
  }, [useShot]);
  const check = (sz, col) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
  return (
    <div className="hero-phone-wrap" style={{ position: "relative", display: "flex", justifyContent: "center", padding: "14px 0 18px" }}>
      {/* Ambient gold glow behind the device */}
      <div style={{ position: "absolute", inset: "-16%", background: `radial-gradient(58% 52% at 50% 42%, ${ACCENT}26 0%, transparent 62%)`, pointerEvents: "none" }} />

      <div className="hero-phone-float" style={{ position: "relative" }}>
        {/* Device — brushed-metal frame with a soft edge highlight */}
        <div style={{
          position: "relative", width: 276, borderRadius: 50, padding: 11,
          background: "linear-gradient(140deg, #6a6a72 0%, #23232a 22%, #0e0e11 58%, #4a4a53 100%)",
          boxShadow: `0 52px 92px -30px rgba(0,0,0,0.78), 0 0 84px -20px ${ACCENT}5c, inset 0 1.6px 0 rgba(255,255,255,0.22), inset 0 -1.4px 2px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.10)`,
        }}>
          {/* Physical side buttons */}
          <div style={{ position: "absolute", left: -2, top: 116, width: 3, height: 24, borderRadius: 3, background: "linear-gradient(#2b2b30, #111)" }} />
          <div style={{ position: "absolute", left: -2, top: 152, width: 3, height: 42, borderRadius: 3, background: "linear-gradient(#2b2b30, #111)" }} />
          <div style={{ position: "absolute", left: -2, top: 204, width: 3, height: 42, borderRadius: 3, background: "linear-gradient(#2b2b30, #111)" }} />
          <div style={{ position: "absolute", right: -2, top: 176, width: 3, height: 62, borderRadius: 3, background: "linear-gradient(#2b2b30, #111)" }} />

          {/* Screen */}
          <div style={{ position: "relative", borderRadius: 39, overflow: "hidden", background: c.bg, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)" }}>
            {/* Glass sheen — a faint diagonal reflection across the top of the display */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(153deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.02) 20%, transparent 40%)", pointerEvents: "none", zIndex: 6 }} />

            {useShot ? (
              /* Real product screenshots, full-bleed inside the frame, cross-
                 fading on a timer. Each screenshot carries its own phone status
                 bar, so we don't overlay anything. Both layers are stacked; the
                 active one fades in over the other. */
              <div style={{ position: "relative", width: "100%", aspectRatio: "254 / 552", background: c.bgCard }}>
                {HERO_SHOTS.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={lang === "nl" ? "Vellu boekingspagina" : "Vellu booking page"}
                    onError={() => setUseShot(false)}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block", opacity: i === shotIdx ? 1 : 0, transition: "opacity 0.9s ease" }}
                  />
                ))}
              </div>
            ) : (
              <>
            {/* Status bar with Dynamic Island + real icons */}
            <div style={{ position: "relative", height: 36, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.text, letterSpacing: "0.02em" }}>9:41</span>
              <div style={{ position: "absolute", top: 9, left: "50%", transform: "translateX(-50%)", width: 84, height: 23, borderRadius: 100, background: "#000", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 9 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#101012", boxShadow: "inset 0 0 0 1.5px #29292c" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5 }}>{[3, 5, 7, 9].map(h => <span key={h} style={{ width: 2.5, height: h, borderRadius: 1, background: c.text }} />)}</div>
                <svg width="12" height="9" viewBox="0 0 16 12" fill="none"><path d="M8 11.4a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6Z" fill={c.text} /><path d="M3.3 6.5a6.8 6.8 0 019.4 0M1.2 4.3a10 10 0 0113.6 0M5.5 8.6a3.7 3.7 0 015 0" stroke={c.text} strokeWidth="1.2" strokeLinecap="round" /></svg>
                <div style={{ width: 18, height: 9, borderRadius: 3, border: `1px solid ${c.textMuted}`, position: "relative", padding: 1.5, boxSizing: "border-box" }}>
                  <div style={{ width: "70%", height: "100%", borderRadius: 1.5, background: c.text }} />
                  <div style={{ position: "absolute", right: -2.5, top: 3, width: 1.5, height: 3, borderRadius: 1, background: c.textMuted }} />
                </div>
              </div>
            </div>

            {/* Cover band + overlapping avatar (reads like a salon profile) */}
            <div style={{ height: 50, background: `linear-gradient(120deg, ${ACCENT}33, ${ACCENT}12 55%, transparent), radial-gradient(130% 200% at 82% -50%, ${ACCENT}38, transparent 55%)` }} />
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, padding: "0 16px", marginTop: -19 }}>
              <div style={{ width: 46, height: 46, borderRadius: 15, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}88)`, border: `2.5px solid ${c.bg}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: darkOnGold, flexShrink: 0, boxShadow: "0 8px 18px -8px rgba(0,0,0,0.6)" }}>SN</div>
              <div style={{ minWidth: 0, paddingBottom: 2 }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 19, lineHeight: 1, color: c.text }}>Studio Nova</div>
                <div style={{ fontSize: 8.5, color: c.textMuted, marginTop: 3, letterSpacing: "0.03em" }}>Amsterdam · <span style={{ color: ACCENT }}>★ 4.9</span> · 127 reviews</div>
              </div>
            </div>

            {/* Category pills */}
            <div style={{ display: "flex", gap: 5, padding: "12px 16px 2px" }}>
              {cats.map((cat, i) => (
                <div key={cat} style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: "0.03em", padding: "5px 12px", borderRadius: 100, background: i === 0 ? ACCENT : "transparent", color: i === 0 ? darkOnGold : c.textSub, border: `1px solid ${i === 0 ? ACCENT : c.border}` }}>{cat}</div>
              ))}
            </div>

            {/* Services — first one selected */}
            <div style={{ padding: "8px 14px 2px", display: "flex", flexDirection: "column", gap: 6 }}>
              {services.map(([name, dur, price], i) => (
                <div key={name} style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: i === 0 ? `${ACCENT}12` : c.bgCard, border: `1px solid ${i === 0 ? `${ACCENT}66` : c.border}`, borderRadius: 13 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: i === 0 ? 16 : 0 }}>{name}</div>
                    <div style={{ fontSize: 8.5, color: c.textMuted, marginTop: 2 }}>{dur}</div>
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: ACCENT, flexShrink: 0 }}>{price}</div>
                  {i === 0 && <div style={{ position: "absolute", top: 8, right: 8, width: 15, height: 15, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>{check(8, darkOnGold)}</div>}
                </div>
              ))}
            </div>

            {/* Choose a time */}
            <div style={{ padding: "9px 14px 0" }}>
              <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{lang === "nl" ? "Kies een tijd" : "Choose a time"}</div>
              <div style={{ display: "flex", gap: 5 }}>
                {slots.map((tt, i) => (
                  <div key={tt} style={{ flex: 1, textAlign: "center", fontSize: 9, fontWeight: 600, padding: "7px 0", borderRadius: 9, background: i === 1 ? ACCENT : c.bgCard, color: i === 1 ? darkOnGold : c.textSub, border: `1px solid ${i === 1 ? ACCENT : c.border}` }}>{tt}</div>
                ))}
              </div>
            </div>

            {/* Confirm CTA — with the running total */}
            <div style={{ padding: "11px 14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderRadius: 100, background: ACCENT, boxShadow: `0 12px 26px -12px ${ACCENT}` }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: darkOnGold }}>{lang === "nl" ? "Bevestig · 11:30" : "Confirm · 11:30"}</span>
                <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: darkOnGold }}>€38</span>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Interactive bookings × avg-price calculator that contrasts a fixed Vellu
// fee against an approximate Treatwell commission. Kept intentionally simple
// (two sliders, three result lines) so the takeaway lands at a glance.
function SavingsCalculator({ lang, t, c }) {
  const [bookings, setBookings] = useState(50);
  const [avgPrice, setAvgPrice] = useState(45);
  const revenue = bookings * avgPrice;
  const treatwellMonthly = revenue * 0.08;
  const velluMonthly = 19;
  const savingsYear = Math.max(0, (treatwellMonthly - velluMonthly) * 12);
  const fmt = (n) => "€" + Math.round(n).toLocaleString(lang === "nl" ? "nl-NL" : "en-US");
  const slider = {
    width: "100%", appearance: "none", WebkitAppearance: "none",
    height: 4, borderRadius: 100, background: c.border, outline: "none", cursor: "pointer",
  };
  return (
    <div>
      <style>{`
        input[type=range]::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: ${ACCENT}; cursor: pointer; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
        input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: ${ACCENT}; cursor: pointer; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 22 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: c.textLabel, marginBottom: 8, letterSpacing: "0.04em" }}>
            <span>{t.calcBookings}</span><span style={{ color: ACCENT, fontWeight: 600 }}>{bookings}</span>
          </div>
          <input type="range" min={5} max={300} step={5} value={bookings} onChange={e => setBookings(parseInt(e.target.value))} style={slider} />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: c.textLabel, marginBottom: 8, letterSpacing: "0.04em" }}>
            <span>{t.calcAvgPrice}</span><span style={{ color: ACCENT, fontWeight: 600 }}>€{avgPrice}</span>
          </div>
          <input type="range" min={10} max={200} step={5} value={avgPrice} onChange={e => setAvgPrice(parseInt(e.target.value))} style={slider} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "16px 18px", background: c.bg, borderRadius: 14, marginBottom: 16 }}>
        <Row label={t.calcRevenue} value={fmt(revenue)} c={c} />
        <Row label={t.calcTreatwellCost} value={`− ${fmt(treatwellMonthly)}${lang === "nl" ? "/mnd" : "/mo"}`} c={c} negative />
        <Row label={t.calcVelluCost} value={`− €${velluMonthly}${lang === "nl" ? "/mnd" : "/mo"}`} c={c} negative />
      </div>
      <div style={{ textAlign: "center", padding: "18px 18px", background: `${ACCENT}10`, border: `1px solid ${ACCENT}33`, borderRadius: 14 }}>
        <div style={{ fontSize: 11, color: c.textLabel, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{t.calcSavingsYear}</div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 42, fontWeight: 300, color: ACCENT, lineHeight: 1.1 }}>
          {fmt(savingsYear)}
        </div>
      </div>
      <div style={{ fontSize: 10, color: c.textMuted, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>{t.calcFootnote}</div>
    </div>
  );
}

function Row({ label, value, c, negative }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12 }}>
      <span style={{ color: c.textSub }}>{label}</span>
      <span style={{ color: negative ? c.textSub : c.text, fontWeight: 600, fontFamily: "'Cormorant Garamond',serif", fontSize: 16 }}>{value}</span>
    </div>
  );
}

// ─── OWNER AUTH ───────────────────────────────────────────────
function OwnerAuth({ onLogin, onBack, lang, setLang }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  // Derive referral code from URL synchronously at mount. If present, initial
  // mode is "signup" directly — avoids the React warning about setState in an
  // effect causing a cascading render.
  const urlRef = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("ref") || "") : "";
  const [mode, setMode] = useState(urlRef ? "signup" : "signin");
  // If the user checked "Onthoud mij" on a previous sign-in, we pre-fill the
  // email field so they only type their password. Supabase itself already
  // persists the session (localStorage) — this flag only controls whether we
  // reuse the email locally on the next visit.
  const rememberedEmail = typeof window !== "undefined" ? (localStorage.getItem("vellu_remember_email") || "") : "";
  const [form, setForm] = useState({ email: rememberedEmail, password: "", businessName: "", slug: "", city: "", countryCode: "NL", accountType: "joint", referralCode: urlRef.toUpperCase() });
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [referrerName, setReferrerName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Resolve the referrer's salon name for the invited-by banner. Only the
  // network lookup stays in the effect — the mode flip is already handled by
  // the initial state above.
  useEffect(() => {
    if (!urlRef) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("business_name").eq("referral_code", urlRef.toUpperCase()).maybeSingle();
      if (!cancelled && data?.business_name) setReferrerName(data.business_name);
    })();
    return () => { cancelled = true; };
  }, [urlRef]);

  const handleReset = async () => {
    if (!form.email) { setError(t.fillEmail); return; }
    setLoading(true); setError("");
    // Use the current origin so password-reset links work from localhost/staging too,
    // not only from production.
    const redirectTo = `${window.location.origin}/owner`;
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo });
    if (error) { setError(error.message); } else { setResetSent(true); }
    setLoading(false);
  };

  const handle = async () => {
    if (!form.email || !form.password) { setError(t.fillAllFields); return; }
    if (mode === "signup" && !form.businessName) { setError(t.fillBusinessName); return; }
    setLoading(true);
    setError("");

    if (mode === "signup") {
      let slug = form.slug || form.businessName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "mijn-studio";
      // Check slug uniqueness
      const { data: existing } = await supabase.from("profiles").select("id").eq("slug", slug).maybeSingle();
      if (existing) {
        const originalSlug = slug;
        slug = slug + "-" + Math.random().toString(36).slice(2, 6);
        setError(lang === "nl"
          ? `vellu.cc/${originalSlug} is al bezet. Je krijgt: vellu.cc/${slug}`
          : `vellu.cc/${originalSlug} is taken. You'll get: vellu.cc/${slug}`);
        setLoading(false);
        setForm(f => ({...f, slug}));
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            business_name: form.businessName,
            slug: slug,
            city: form.city || "Nederland"
          }
        }
      });
      if (error) { setError(error.message); setLoading(false); return; }
      // If this email was invited as staff somewhere, claim that staff row instead of
      // creating an owner profile. resolveUserRole will route them to the staff dashboard.
      const inviteEmail = form.email.toLowerCase().trim();
      const { data: staffInvite } = await supabase.from("staff_members").select("id").eq("email", inviteEmail).is("user_id", null).maybeSingle();
      if (staffInvite) {
        await supabase.from("staff_members").update({ user_id: data.user.id }).eq("id", staffInvite.id).is("user_id", null);
        onLogin({ email: form.email, id: data.user.id });
        setLoading(false);
        return;
      }
      // Otherwise upsert an owner profile.
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        email: form.email,
        business_name: form.businessName,
        slug: slug,
        city: form.city || "Nederland",
        country_code: form.countryCode || "NL",
        accent_color: "#c9a96e",
        account_type: form.accountType || "joint"
      });
      if (profileError) {
        // Profile insert failed — sign the half-registered auth user out so they aren't
        // stranded in a state where OwnerEntryPage can never find their profile.
        await supabase.auth.signOut();
        setError(lang === "nl" ? "Profiel aanmaken mislukt. Probeer het opnieuw." : "Could not create profile. Please try again.");
        setLoading(false);
        return;
      }

      // If a referral code was provided (via ?ref= or the signup form), try to
      // redeem it. Both the new signup and the referrer get 1 month credited.
      // A typo'd code doesn't block signup — we just log it so the user can
      // check for a "referral applied" indicator on their dashboard afterwards.
      const refCode = (new URLSearchParams(window.location.search).get("ref") || form.referralCode || "").trim();
      if (refCode) {
        const { data: redeemResult, error: redeemErr } = await supabase.rpc("redeem_referral_code", {
          p_new_profile_id: data.user.id,
          p_code: refCode,
        });
        const row = Array.isArray(redeemResult) ? redeemResult[0] : redeemResult;
        if (redeemErr || !row?.success) {
          console.warn("Referral code not applied:", refCode, redeemErr);
        }
      }

      onLogin({ name: form.businessName, email: form.email, slug, city: form.city || "Nederland", id: data.user.id, plan: null, plan_expires_at: null, account_type: form.accountType });
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) { setError(t.wrongCredentials); setLoading(false); return; }
      // Honour the "Onthoud mij" checkbox — save just the email locally so the
      // next visit pre-fills it. The password is never stored.
      try {
        if (rememberMe) localStorage.setItem("vellu_remember_email", form.email);
        else localStorage.removeItem("vellu_remember_email");
      } catch { /* private mode / no storage — silent fallback */ }
      // Load profile — maybeSingle because staff logins legitimately have no
      // profiles row (they live in staff_members instead). OwnerEntryPage
      // then routes them to StaffApp via resolveUserRole.
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      const slug = profile?.slug || data.user.email.split("@")[0];
      onLogin({ name: profile?.business_name || "Mijn Studio", email: form.email, slug, city: profile?.city || "Nederland", id: data.user.id, accent: profile?.accent_color, plan: profile?.plan || null, plan_expires_at: profile?.plan_expires_at || null, account_type: profile?.account_type || "joint" });
    }
    setLoading(false);
  };

  return (
    <Layout>
      <div style={{ 
        background: c.bg, 
        minHeight: "100dvh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        padding: "40px 24px", 
        fontFamily: "'Jost',sans-serif", 
        color: c.text, 
        position: "relative" 
      }}>
        {/* Background decoration */}
        <div style={{ 
          position: "absolute", 
          top: "10%", 
          left: "50%", 
          transform: "translateX(-50%)",
          width: "80%", 
          maxWidth: 600,
          height: "50%", 
          background: `radial-gradient(ellipse at center, ${ACCENT}08 0%, transparent 70%)`,
          pointerEvents: "none"
        }} />

        {/* Back button — top offset accounts for iOS Dynamic Island / notch. */}
        <div style={{ position: "absolute", top: "calc(32px + env(safe-area-inset-top, 0px))", left: 32 }}>
          <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }} onClick={onBack}>← {t.back}</button>
        </div>

        {/* Lang toggle — same safe-area offset. */}
        <div style={{ position: "absolute", top: "calc(32px + env(safe-area-inset-top, 0px))", right: 32, display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle />
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        <div style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 10 }} className="fade-up">
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ marginBottom: 12 }}><NavIcon name="crown" size={36} color={ACCENT} /></div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>{t.ownerLogin}</div>
            <div style={{ fontSize: 13, color: c.textLabel, marginTop: 8, letterSpacing: "0.02em" }}>{t.ownerSub}</div>
          </div>

          <div style={{ 
            background: c.bgCard, 
            border: "1px solid " + c.border,
            borderRadius: 24,
            padding: 28
          }}>
            <div style={{ display: "flex", marginBottom: 24, borderBottom: "1px solid " + c.border }}>
              {[["signin", t.signIn], ["signup", t.signUp]].map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                  flex: 1, padding: "12px", border: "none", background: "transparent",
                  fontFamily: "'Jost',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: mode === m ? ACCENT : c.textMuted,
                  borderBottom: `2px solid ${mode === m ? ACCENT : "transparent"}`,
                  marginBottom: -1, transition: "all 0.2s"
                }}>{label}</button>
              ))}
            </div>

            {mode === "signup" && referrerName && (
              <div style={{
                background: `${ACCENT}12`, border: `1px solid ${ACCENT}33`, borderRadius: 12,
                padding: "10px 14px", marginBottom: 14, fontSize: 12, color: c.text, textAlign: "center",
              }}>
                {lang === "nl" ? (
                  <>Je bent uitgenodigd door <strong>{referrerName}</strong> — jullie krijgen allebei <strong>3 weken gratis</strong>.</>
                ) : (
                  <>Invited by <strong>{referrerName}</strong> — you both get <strong>3 weeks free</strong>.</>
                )}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {mode === "signup" && <>
                <input className="input-field" placeholder={t.businessNameField} value={form.businessName} onChange={e => setForm(f => ({...f, businessName: e.target.value}))} />
                <input className="input-field" placeholder={t.city} value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
                <select
                  className="input-field"
                  value={form.countryCode}
                  onChange={e => setForm(f => ({...f, countryCode: e.target.value}))}
                  aria-label={lang === "nl" ? "Land" : "Country"}
                  style={{ appearance: "none", cursor: "pointer", paddingRight: 40 }}
                >
                  {/* Native dropdown menus ignore the select's dark styling, so
                      each option needs explicit theme colours — otherwise it's
                      unreadable grey-on-white. */}
                  {COUNTRIES.filter(c2 => c2.launched).map(c2 => (
                    <option key={c2.code} value={c2.code} style={{ background: c.selectBg, color: c.text }}>{c2.name}</option>
                  ))}
                </select>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 17, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: c.textLabel, fontFamily: "'Jost',sans-serif", pointerEvents: "none" }}>vellu.cc/</div>
                  <input className="input-field" placeholder={lang === "nl" ? "jouw-salon-naam" : "your-salon-name"} value={form.slug} onChange={e => setForm(f => ({...f, slug: e.target.value.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")}))} style={{ paddingLeft: 85 }} />
                </div>
                {/* Account type */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.accountType}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["joint", "user", t.jointAccount, t.jointDesc, t.jointInfo], ["team", "team", t.teamAccount, t.teamDesc, t.teamInfo]].map(([type, icon, label, desc, info]) => (
                      <div key={type} onClick={() => setForm(f => ({...f, accountType: type}))} style={{
                        flex: 1, padding: "14px 12px", borderRadius: 14, cursor: "pointer", textAlign: "center", transition: "all 0.2s",
                        background: form.accountType === type ? `${ACCENT}12` : c.inputBg,
                        border: `1.5px solid ${form.accountType === type ? ACCENT : c.inputBorder}`,
                        position: "relative"
                      }}>
                        {/* Info icon — click stops propagation so tapping the ⓘ
                            doesn't also flip the selection. Native title tooltip
                            works on desktop; on touch we surface it via alert() */}
                        <button type="button" aria-label={label + " info"}
                          onClick={(e) => { e.stopPropagation(); if (window.matchMedia("(hover: none)").matches) alert(info); }}
                          title={info}
                          style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: "50%", border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textLabel, fontSize: 10, fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontWeight: 700, lineHeight: 1, cursor: "help", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                          i
                        </button>
                        <div style={{ marginBottom: 4 }}><NavIcon name={icon} size={20} color={form.accountType === type ? ACCENT : c.textSub} /></div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: form.accountType === type ? ACCENT : c.text }}>{label}</div>
                        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 3, lineHeight: 1.3 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>}
              <input className="input-field" placeholder={t.emailField} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              <div style={{ position: "relative", display: "flex" }}>
                <input className="input-field" placeholder={t.passwordField} type={showPassword ? "text" : "password"} value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} style={{ paddingRight: 46 }} />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? (lang === "nl" ? "Wachtwoord verbergen" : "Hide password") : (lang === "nl" ? "Wachtwoord tonen" : "Show password")}
                  style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 10, display: "flex", alignItems: "center", justifyContent: "center", color: c.textMuted }}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>
            {mode === "signin" && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: ACCENT, cursor: "pointer" }} />
                <span style={{ fontSize: 12, color: c.textSub }}>
                  {lang === "nl" ? "Onthoud mijn gegevens" : "Remember me"}
                </span>
              </label>
            )}
            {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 16, textAlign: "center" }}>{error}</div>}
            {resetSent && <div style={{ fontSize: 12, color: "#86efac", marginBottom: 16, textAlign: "center" }}>{t.resetSent}</div>}
            <button className="btn-primary" onClick={handle} disabled={loading}>{loading ? "..." : (mode === "signin" ? t.login : t.createAccount)}</button>
            {mode === "signin" && (
              <button style={{ display: "block", width: "100%", marginTop: 12, background: "none", border: "none", color: c.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}
                onClick={handleReset}>
                {t.forgotPassword}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── REVIEW FORM ────────────────────────────────────────────

export { LandingScreen, OwnerAuth };
export default LandingScreen;
