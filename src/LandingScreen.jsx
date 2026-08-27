import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import SupportChat from "./SupportChat.jsx";
import {
  useTheme, useSEO, ACCENT, T, COUNTRIES, currencyForCountry, taxForCountry, Layout, NavIcon, LangToggle, ThemeToggle, Header, PlanCompareTable
} from "./shared.jsx";

function LandingScreen({ onSelectSalon, onOwnerEnter, lang, setLang, salons = {} }) {
  const { colors: c, theme } = useTheme();
  const navigate = useNavigate();
  const t = T[lang];
  useSEO({
    title: lang === "nl" ? "Vellu - Beauty Booking Platform | 0% Commissie" : lang === "es" ? "Vellu - Plataforma de reservas de belleza | 0% de comisión" : "Vellu - Beauty Booking Platform | 0% Commission",
    description: lang === "nl" ? "Je eigen boekingspagina met jouw naam, jouw kleuren en jouw diensten. Vast tarief, 0% commissie." : lang === "es" ? "Tu propia página de reservas con tu nombre, tus colores y tus servicios. Precio fijo, 0% de comisión." : "Your own booking page with your name, your colors and your services. Fixed price, 0% commission.",
    url: "https://vellu.cc/"
  });
  const [faqOpen, setFaqOpen] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly"); // "monthly" | "yearly"
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Eén klok voor de hero-choreografie: kopregel-beats → badge/sub/cta's →
  // stats. Bij beperk-beweging staat alles al klaar vóór de eerste verf.
  // Dubbele rAF zodat de browser de verborgen begintoestand écht geverfd
  // heeft en de transition dus loopt in plaats van overslaat.
  const [heroReady, setHeroReady] = useState(prefersReducedMotion);
  useEffect(() => {
    if (heroReady) return;
    let id2;
    const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setHeroReady(true)); });
    return () => { cancelAnimationFrame(id1); if (id2) cancelAnimationFrame(id2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sticky nav krijgt pas een rug (blur + rand) zodra er gescrold is.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Voor wie Vellu is — de doorlopende band onder de hero, in de taal van de
  // bezoeker. Zelfde doelgroep als t.heroTag, uitgeschreven.
  const marqueeWords = lang === "nl"
    ? ["Nagelstylistes", "Lash artists", "Brow studio's", "Kappers", "Barbers", "PMU-specialisten", "Huidtherapeuten", "Make-up artists"]
    : lang === "es"
      ? ["Manicuristas", "Artistas de pestañas", "Estudios de cejas", "Peluquerías", "Barberos", "Especialistas en PMU", "Esteticistas", "Maquilladoras"]
      : ["Nail artists", "Lash techs", "Brow studios", "Hairdressers", "Barbers", "PMU artists", "Skin therapists", "Makeup artists"];

  // Sectie-wenkbrauwen (klein goud label boven elke titel).
  const eyebrow = {
    find: lang === "nl" ? "Voor klanten" : lang === "es" ? "Para clientes" : "For clients",
    calc: lang === "nl" ? "Reken het na" : lang === "es" ? "Haz las cuentas" : "Do the math",
    how: lang === "nl" ? "Hoe het werkt" : lang === "es" ? "Cómo funciona" : "How it works",
    feat: lang === "nl" ? "Alles wat je nodig hebt" : lang === "es" ? "Todo lo que necesitas" : "Everything you need",
    price: lang === "nl" ? "Prijzen" : lang === "es" ? "Precios" : "Pricing",
    faq: lang === "nl" ? "Vragen" : lang === "es" ? "Preguntas" : "Questions",
  };

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
    ["Hoeveel kost het?", "Starter is €19/maand, Professional €35/maand. Vast tarief, 0% commissie per boeking. Geen verborgen kosten."],
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
    ["How much does it cost?", "Starter is €19/month, Professional €35/month. Fixed price, 0% commission per booking. No hidden fees."],
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

        {/* Scrollvoortgang + cursor-ring — de stille signatuur-laag. */}
        <ScrollProgress />
        <CursorRing />

        {/* Navigation — sticky; krijgt een blur-rug zodra er gescrold is.
            Extra top padding for iOS Dynamic Island / notch. */}
        <nav style={{ position: "sticky", top: 0, zIndex: 40, background: scrolled ? `${c.bg}ec` : "transparent", backdropFilter: scrolled ? "blur(14px)" : "none", WebkitBackdropFilter: scrolled ? "blur(14px)" : "none", borderBottom: `1px solid ${scrolled ? c.border : "transparent"}`, transition: "background 0.3s ease, border-color 0.3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "calc(12px + env(safe-area-inset-top, 0px)) clamp(16px, 4vw, 32px) 12px", maxWidth: 1100, margin: "0 auto" }}>
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
          </div>
        </nav>
        <style>{`
          @media (min-width: 720px) { [data-show-on-desktop] { display: inline-flex !important; } }
          /* ── Signatuur-laag: marquee, cursor-ring, kaartgloed, ademlicht ── */
          .vl-marquee-track { animation: vlMarquee 30s linear infinite; }
          .vl-marquee:hover .vl-marquee-track { animation-play-state: paused; }
          @keyframes vlMarquee { to { transform: translateX(-50%); } }
          .vl-cursor { position: fixed; top: 0; left: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px; border: 1px solid ${ACCENT}99; border-radius: 50%; pointer-events: none; z-index: 80; transition: width 0.25s ease, height 0.25s ease, margin 0.25s ease, border-color 0.25s ease; }
          .vl-cursor.grow { width: 46px; height: 46px; margin: -23px 0 0 -23px; border-color: ${ACCENT}; }
          .vl-cursor-dot { position: fixed; top: 0; left: 0; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: ${ACCENT}; pointer-events: none; z-index: 80; }
          .vl-glow { position: relative; }
          .vl-glow::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), ${ACCENT}17, transparent 65%); opacity: 0; transition: opacity 0.3s ease; pointer-events: none; }
          .vl-glow:hover::after { opacity: 1; }
          @media (hover: none) { .vl-glow::after { display: none; } }
          .vl-breathe { position: relative; }
          .vl-breathe::after { content: ""; position: absolute; inset: 0; border-radius: 28px; box-shadow: 0 0 90px -26px ${ACCENT}66, inset 0 0 46px -34px ${ACCENT}44; animation: vlBreath 5.5s ease-in-out infinite; pointer-events: none; }
          @keyframes vlBreath { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
          @media (prefers-reduced-motion: reduce) {
            .vl-marquee-track { animation: none; }
            .vl-breathe::after { animation: none; }
          }
        `}</style>

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
          <div className="hero-copy">
            <HeroEnter ready={heroReady} delay={0}>
              <div style={{ display: "inline-block", background: `${ACCENT}15`, border: `1px solid ${ACCENT}33`, borderRadius: 100, padding: "6px 18px", fontSize: 11, fontWeight: 500, color: ACCENT, letterSpacing: "0.04em", marginBottom: 26 }}>
                <NavIcon name="sparkle" size={11} color={ACCENT} /> {t.heroTag}
              </div>
            </HeroEnter>
            {/* Three beats, three lines — elke beat schuift uit zijn eigen
                masker omhoog (KineticLine houdt ze nowrap, net als eerst, en
                spiegelt de og-image). */}
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(42px, 7.5vw, 64px)", fontWeight: 300, letterSpacing: "0.05em", lineHeight: 1.06, marginBottom: 22 }}>
              <KineticLine ready={heroReady} delay={120}>{t.heroTitle}</KineticLine>
              <KineticLine ready={heroReady} delay={250}>{t.heroTitle2}</KineticLine>
              <KineticLine ready={heroReady} delay={380}><span style={{ color: ACCENT }}>{t.heroBrand}</span></KineticLine>
            </h1>
            <HeroEnter ready={heroReady} delay={560}>
              <p className="hero-sub" style={{ fontSize: "clamp(14px, 2vw, 16px)", color: c.textSub, lineHeight: 1.7, maxWidth: 440, marginBottom: 34, letterSpacing: "0.01em" }}>
                {t.heroSub}
              </p>
            </HeroEnter>
            <HeroEnter ready={heroReady} delay={680}>
              <div className="hero-ctas">
                <button className="btn-primary" style={{ width: "auto", padding: "16px 36px", fontSize: 13 }} onClick={() => navigate("/owner")}>
                  {t.startFree}
                </button>
                <button className="btn-ghost" style={{ width: "auto", padding: "16px 28px", fontSize: 13, color: c.textSub }} onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                  {t.howItWork}
                </button>
              </div>
            </HeroEnter>
            {/* Stats — full strength, they carry the pitch */}
            <HeroEnter ready={heroReady} delay={800}>
              <div className="hero-stats" style={{ display: "flex", gap: "14px 36px", flexWrap: "wrap", marginTop: 40 }}>
                {[
                  { num: "0%", nl: "Commissie", en: "Commission" },
                  { num: "24/7", nl: "Online boekbaar", en: "Bookable online" },
                  { num: "€19", nl: "Vast per maand", en: "Fixed per month" },
                ].map((s, i) => (
                  <div key={i} style={{ opacity: heroReady ? 1 : 0, transform: heroReady ? "none" : "translateY(10px)", transition: `opacity 0.6s ease ${820 + i * 110}ms, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${820 + i * 110}ms` }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, fontWeight: 300, color: ACCENT, lineHeight: 1 }}>{s.num}</div>
                    <div style={{ fontSize: 10, color: c.textSub, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>{lang === "nl" ? s.nl : s.en}</div>
                  </div>
                ))}
              </div>
            </HeroEnter>
            {/* Quiet, truthful trust line — real salons in both markets use
                Vellu today. No inflated numbers, no fabricated quotes. */}
            <HeroEnter ready={heroReady} delay={1050}>
              <div className="hero-stats" style={{ display: "flex", marginTop: 22, fontSize: 11, color: c.textMuted, letterSpacing: "0.05em" }}>
                {lang === "nl" ? "Gebruikt door salons in Nederland en het Caribisch gebied"
                  : lang === "es" ? "Utilizado por salones en los Países Bajos y el Caribe"
                  : "Used by salons in the Netherlands and the Caribbean"}
              </div>
            </HeroEnter>
          </div>
          <HeroEnter ready={heroReady} delay={430}>
            {/* De telefoon drijft heel licht tegen de scroll in — diepte
                zonder circus (desktop only, zie ParallaxLayer). */}
            <ParallaxLayer speed={-0.04}>
              <HeroPhoneMockup lang={lang} c={c} />
              {/* "See it live" — screenshots convince, clicking sells. Links to
                  the seeded demo salon so a prospect can poke a REAL booking
                  page (clearly labelled as an example). */}
              <div style={{ textAlign: "center", marginTop: 2 }}>
                <button
                  onClick={() => navigate("/bloomstudio")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 12, color: ACCENT, letterSpacing: "0.04em", padding: "8px 12px", borderBottom: `1px solid ${ACCENT}44` }}
                >
                  {lang === "nl" ? "Bekijk een live voorbeeldpagina →" : lang === "es" ? "Ver una página de ejemplo en vivo →" : "See a live example page →"}
                </button>
              </div>
            </ParallaxLayer>
          </HeroEnter>
        </div>

        {/* ─── MARQUEE — voor wie Vellu is, als doorlopende band. ─── */}
        <div style={{ position: "relative", zIndex: 10, margin: "10px 0 44px" }}>
          <Marquee items={marqueeWords} c={c} />
        </div>

        {/* ─── FIND-A-SALON — Fresha/Treatwell have a marketplace search;
            Vellu deliberately doesn't. This is a *finder*: it helps a client
            reach their own salon's page. The Vellu twist: every card renders
            in the salon's OWN accent colour + cover — the "jouw merk, jouw
            kleuren" promise made visible on the landing page itself. No
            ratings, no ranking, no competitors side-by-side. */}
        <SalonFinder lang={lang} t={t} c={c} goToSlug={goToSlug} navigate={navigate} />

        {/* ─── SAVINGS CALCULATOR ───
            Concrete €€ saved vs a typical commission platform — sliders feel
            more interactive than a static comparison block and force the
            visitor to engage with the number, which is the real selling
            point of the 0% commission model. */}
        <div style={{ padding: "0 24px 60px", position: "relative", zIndex: 10 }}>
          <Reveal><div style={{ maxWidth: 700, margin: "0 auto", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 24, padding: "32px clamp(20px, 4vw, 36px)" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase", color: ACCENT, marginBottom: 10 }}>{eyebrow.calc}</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 300, marginBottom: 6 }}>{t.calcTitle}</h2>
              <div style={{ fontSize: 12, color: c.textLabel, lineHeight: 1.55, maxWidth: 460, margin: "0 auto" }}>{t.calcSub}</div>
            </div>
            <SavingsCalculator lang={lang} t={t} c={c} />
          </div></Reveal>
        </div>

        {/* ─── HOW IT WORKS — subtle tint band breaks the page rhythm ─── */}
        <div id="how-it-works" style={{ padding: "64px 24px", position: "relative", zIndex: 10, background: `linear-gradient(180deg, transparent, ${ACCENT}07 18%, ${ACCENT}07 82%, transparent)` }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <SectionHead eyebrow={eyebrow.how} title={t.liveIn3} c={c} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
              {[
                { num: "01", icon: "diamond", title: t.step1, desc: t.step1d },
                { num: "02", icon: "target", title: t.step2, desc: t.step2d },
                { num: "03", icon: "sparkle", title: t.step3, desc: t.step3d }
              ].map((item, i) => (
                <Reveal key={i} delay={i * 110}>
                  <div className="vl-glow" onMouseMove={glowMove} style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 24, padding: "32px 28px", position: "relative", overflow: "hidden", height: "100%", boxSizing: "border-box" }}>
                    <div style={{ position: "absolute", top: 16, right: 20, fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: `${ACCENT}12` }}>{item.num}</div>
                    <div style={{ marginBottom: 16 }}><NavIcon name={item.icon} size={28} color={ACCENT} /></div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 13, color: c.textLabel, lineHeight: 1.7 }}>
                      {item.desc}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        {/* ─── FEATURES ─── */}
        <div style={{ padding: "48px 24px 64px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <SectionHead eyebrow={eyebrow.feat} title={t.everythingNeeded} c={c} />
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
              <Reveal className="bento-wide">
              <div className="bento-card vl-glow" onMouseMove={glowMove} style={{ padding: "24px 22px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, height: "100%", boxSizing: "border-box" }}>
                <NavIcon name="calendar" size={24} color={ACCENT} />
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{lang === "nl" ? "Eigen boekingspagina" : lang === "es" ? "Tu propia página de reservas" : "Your own booking page"}</div>
                <div style={{ fontSize: 12, color: c.textLabel, lineHeight: 1.6, marginBottom: 16 }}>{lang === "nl" ? "Jouw merk, jouw kleuren, jouw link. Klanten boeken direct bij jou — zonder tussenpartij." : lang === "es" ? "Tu marca, tus colores, tu enlace. Los clientes reservan directamente contigo — sin intermediarios." : "Your brand, your colors, your link. Clients book directly with you — no middleman."}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", background: c.bg, border: `1px solid ${ACCENT}33`, borderRadius: 100, fontSize: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
                  <span style={{ color: c.textSub }}>vellu.cc/</span><span style={{ color: ACCENT, fontWeight: 600 }}>{lang === "nl" ? "jouw-naam" : "your-name"}</span>
                </div>
              </div>
              </Reveal>
              {/* Anchor 2 — 0% commission, oversized numeral */}
              <Reveal delay={90}>
              <div className="bento-card vl-glow" onMouseMove={glowMove} style={{ padding: "24px 22px", background: `linear-gradient(160deg, ${ACCENT}14, transparent 70%)`, border: `1px solid ${ACCENT}33`, borderRadius: 20, display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", boxSizing: "border-box" }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 64, fontWeight: 300, color: ACCENT, lineHeight: 1 }}>0%</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>{lang === "nl" ? "Commissie" : lang === "es" ? "Comisión" : "Commission"}</div>
                <div style={{ fontSize: 12, color: c.textLabel, lineHeight: 1.6 }}>{lang === "nl" ? "Vast maandtarief. Elke euro van elke boeking blijft van jou." : lang === "es" ? "Tarifa mensual fija. Cada euro de cada reserva es tuyo." : "Flat monthly fee. Every euro of every booking stays yours."}</div>
              </div>
              </Reveal>
              {/* Supporting tiles */}
              {[
                { icon: "team", nl: "Team accounts", en: "Team accounts", sub: { nl: "Elke medewerker een eigen login, agenda en diensten", en: "Each staff member gets their own login, schedule and services" } },
                { icon: "mail", nl: "Automatische emails", en: "Automatic emails", sub: { nl: "Bevestigingen, herinneringen en follow-ups", en: "Confirmations, reminders and follow-ups" } },
                { icon: "star2", nl: "Reviews", en: "Reviews", sub: { nl: "Automatisch reviews verzamelen na elk bezoek", en: "Automatically collect reviews after every visit" }, stars: true },
                { icon: "palette", nl: "Eigen branding", en: "Custom branding", sub: { nl: "Jouw logo, kleuren en stijl", en: "Your logo, colors and style" }, swatch: true },
                { icon: "camera", nl: "Portfolio", en: "Portfolio", sub: { nl: "Foto's per behandeling tonen", en: "Show photos per treatment" } },
                { icon: "tag", nl: "Kortingscodes", en: "Discount codes", sub: { nl: "Maak en deel korting met je klanten", en: "Create and share discounts with clients" }, code: true },
              ].map((f, i) => (
                <Reveal key={i} delay={150 + i * 70}>
                <div className="bento-card vl-glow" onMouseMove={glowMove} style={{ padding: "20px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, height: "100%", boxSizing: "border-box" }}>
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
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        {/* TESTIMONIALS section removed — the previous hardcoded names/quotes are
            fabricated marketing content, which under the AVG/Wet OHP (misleidende reclame)
            creates real legal exposure. Re-add this section only when you have real,
            opt-in reviews with written consent from the people named. */}

        {/* ─── PRICING — tinted band, mirrors the how-it-works section ─── */}
        <div style={{ padding: "64px 24px", position: "relative", zIndex: 10, background: `linear-gradient(180deg, transparent, ${ACCENT}07 18%, ${ACCENT}07 82%, transparent)` }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <SectionHead eyebrow={eyebrow.price} title={t.simplePricing} c={c} />
            {/* Billing cycle toggle */}
            <Reveal delay={120}><div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
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
            </div></Reveal>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {[
                { name: "Starter", price: 19, popular: false, features: { nl: ["Online boekingen", "Email bevestigingen", "24u herinneringen", "Reviews systeem", "Eigen branding & logo", "Tot 3 medewerkers"], en: ["Online bookings", "Email confirmations", "24h reminders", "Reviews system", "Custom branding & logo", "Up to 3 staff members"] } },
                { name: "Professional", price: 35, popular: true, features: { nl: ["Alles van Starter +", "Onbeperkt medewerkers", "Team accounts (eigen login)", "Producten verkopen", "Analytics dashboard", "Kortingscodes", "Nieuwsbrief & klant-export", "Meerdere locaties", "Prioriteit support"], en: ["Everything in Starter +", "Unlimited staff members", "Team accounts (own login)", "Sell products", "Analytics dashboard", "Discount codes", "Newsletter & client export", "Multiple locations", "Priority support"] } },
              ].map((plan, i) => {
                const yearlyTotal = plan.price * 10; // 2 months free
                const displayPrice = billingCycle === "yearly" ? yearlyTotal : plan.price;
                const displaySuffix = billingCycle === "yearly" ? t.perYear : t.perMonth;
                return (
                <Reveal key={i} delay={i * 130}>
                <div className="vl-glow" onMouseMove={glowMove} style={{
                  background: plan.popular ? `${ACCENT}08` : c.bgCard,
                  border: `1.5px solid ${plan.popular ? ACCENT : c.border}`,
                  borderRadius: 24, padding: "32px 28px", position: "relative", height: "100%", boxSizing: "border-box"
                }}>
                  {plan.popular && (
                    <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: ACCENT, color: c.btnOnDark, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 16px", borderRadius: 100 }}>
                      {t.popular}
                    </div>
                  )}
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{plan.name}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: ACCENT }}>
                      €<TweenedNumber value={displayPrice} format={(n) => Math.round(n)} /><span style={{ fontSize: 16, color: c.textMuted }}>{displaySuffix}</span>
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
                </Reveal>
                );
              })}
            </div>
            {/* Prices are in EUR (Vellu bills via Mollie in euros). A salon
                outside the eurozone is simply charged in EUR and their card
                converts — so we never show a $-price here that wouldn't match
                the actual charge. The salon's OWN prices to its clients are a
                separate thing and DO follow the salon's currency. */}
            <div style={{ textAlign: "center", fontSize: 12, color: c.textMuted, marginTop: 16, lineHeight: 1.5, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
              {lang === "nl"
                ? "Alle prijzen in euro's, incl. btw. Betaal je van buiten de eurozone? Je kaart rekent automatisch om."
                : "All prices in euros, incl. VAT. Paying from outside the eurozone? Your card converts automatically."}
            </div>
            {/* Full feature comparison — collapsed by default so the pricing
                section stays scannable; the table answers "what exactly do I
                miss on Starter?" without a support question. */}
            <div style={{ marginTop: 20 }}>
              <PlanCompareTable lang={lang} accent={ACCENT} />
            </div>
          </div>
        </div>

        {/* ─── FAQ ─── */}
        <div style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <SectionHead eyebrow={eyebrow.faq} title={t.faqTitle} c={c} />
            <Reveal delay={100}>
            <div>
            {faqs.map(([q, a], i) => (
              <div key={i} style={{ borderBottom: "1px solid " + c.border, marginBottom: 0 }}>
                <div role="button" tabIndex={0} aria-expanded={faqOpen === i} onClick={() => setFaqOpen(faqOpen === i ? null : i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFaqOpen(faqOpen === i ? null : i); } }} style={{ padding: "18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{q}</div>
                  <div style={{ fontSize: 18, color: c.textMuted, transition: "transform 0.25s ease", transform: faqOpen === i ? "rotate(45deg)" : "none" }}>+</div>
                </div>
                {/* Antwoord blijft gemount; hoogte animeert via de
                    grid-template-rows 0fr→1fr-truc (geen scrollHeight-meting
                    nodig, werkt met elke inhoudslengte). */}
                <div style={{ display: "grid", gridTemplateRows: faqOpen === i ? "1fr" : "0fr", transition: "grid-template-rows 0.4s cubic-bezier(0.22, 1, 0.36, 1)" }}>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ paddingBottom: 18, fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{a}</div>
                  </div>
                </div>
              </div>
            ))}
            </div>
            </Reveal>
          </div>
        </div>

        {/* ─── QUESTIONS / CONTACT ─── */}
        <div style={{ padding: "10px 24px 20px", position: "relative", zIndex: 10 }}>
          <Reveal><div style={{ maxWidth: 640, margin: "0 auto", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 24, padding: "36px 32px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(24px, 4.5vw, 32px)", fontWeight: 300, marginBottom: 10 }}>
              {lang === "nl" ? "Nog vragen?" : lang === "es" ? "¿Aún tienes preguntas?" : "Still have questions?"}
            </div>
            <p style={{ fontSize: 14, color: c.textLabel, lineHeight: 1.6, marginBottom: 24, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
              {lang === "nl"
                ? "Stel je vraag in de chat linksonder, of stuur ons een berichtje. We helpen je graag op weg."
                : "Ask in the chat at the bottom-left, or send us a message. We're happy to help you get started."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={() => navigate("/contact")} style={{ padding: "12px 26px" }}>
                {lang === "nl" ? "Neem contact op" : lang === "es" ? "Contáctanos" : "Contact us"}
              </button>
              <a href="mailto:mirahventures@vellu.cc" className="btn-ghost" style={{ padding: "12px 26px", textDecoration: "none", display: "inline-flex", alignItems: "center", borderColor: `${ACCENT}44`, color: ACCENT }}>
                mirahventures@vellu.cc
              </a>
            </div>
          </div></Reveal>
        </div>

        {/* ─── FINAL CTA ─── */}
        <div style={{ padding: "20px 24px 80px", textAlign: "center", position: "relative", zIndex: 10 }}>
          <Reveal><div className="vl-breathe" style={{ maxWidth: 600, margin: "0 auto", background: `linear-gradient(160deg, ${ACCENT}10, transparent 60%), ${c.bgCard}`, border: `1px solid ${ACCENT}33`, borderRadius: 28, padding: "52px 32px" }}>
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
            {/* Geen aparte "Ontwikkeld door"-link: de imprint-regel hierboven
                draagt de naam, de link naar mirahventures.com én de wettelijke
                nummers al — twee keer dezelfde vermelding was alleen maar druk. */}
          </div>
        </footer>

        {/* Sticky bottom-right CTA pill — appears after scrolling past hero so
            the conversion ask is one tap away regardless of how far down the
            page they've scrolled. */}
        <StickyStartPill onClick={() => navigate("/owner")} label={t.startFree} />

        {/* Help chat for prospects — anchored bottom-LEFT so it never collides
            with the bottom-right start-trial pill. Runs in public mode (no
            login), which the support-chat function detects automatically. */}
        <SupportChat
          lang={lang}
          c={c}
          accent={ACCENT}
          isMobile={isMobile}
          side="left"
          launcherBottom={20}
          greeting={lang === "nl"
            ? "Hoi! Vragen over Vellu? Ik help je graag — wat het kost, hoe het werkt, of het bij jouw salon past. Vraag maar raak."
            : "Hi! Questions about Vellu? Happy to help — pricing, how it works, or whether it fits your salon. Ask away."}
          subtitle={lang === "nl" ? "Vragen over Vellu?" : lang === "es" ? "¿Preguntas sobre Vellu?" : "Questions about Vellu?"}
        />
      </div>
    </Layout>
  );
}

// ─── SALON FINDER ───────────────────────────────────────────
// Country code → flag emoji ("NL" → 🇳🇱). Empty string when the code is
// missing/malformed so the row just renders without a flag.
const flagOf = (cc) => {
  if (!cc || cc.length !== 2) return "";
  try { return cc.toUpperCase().replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0))); } catch { return ""; }
};
// Category label in the visitor's language, falling back across languages.
const catLabel = (cat, lang) => (lang === "nl"
  ? (cat.name_nl || cat.name_en || cat.name_es)
  : lang === "es"
    ? (cat.name_es || cat.name_en || cat.name_nl)
    : (cat.name_en || cat.name_nl || cat.name_es)) || "";
// Diacritics-insensitive lowercase for search ("Curaçao" matches "curacao").
const normStr = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// The client-facing salon search. Loads every directory-visible salon once
// (the list is small; client-side filtering gives instant results — switch
// to a server ilike query only when the directory outgrows this) and
// filters as the visitor types. Each card is painted with the salon's own
// accent colour, cover and logo. A dashed "your salon here?" card at the
// end turns the section into an acquisition surface too.
function SalonFinder({ lang, t, c, goToSlug, navigate }) {
  const [q, setQ] = useState("");
  const [salons, setSalons] = useState(null); // null = loading
  const [slugFallback, setSlugFallback] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("public_salons")
        .select("id,slug,business_name,city,country_code,accent_color,logo_url,cover_image_url")
        .eq("directory_visible", true)
        .in("subscription_status", ["active", "trialing"])
        .order("created_at", { ascending: true })
        .limit(24);
      const rows = data || [];
      // Treatment search + category chips: pull services and categories of
      // every listed business in one go (both publicly readable), so
      // "biab", "knippen" or "pmu" finds the right place and each card can
      // show what the business actually does.
      const svcByOwner = {};
      const catsByOwner = {};
      if (rows.length) {
        const ids = rows.map(r => r.id);
        const [{ data: svcs }, { data: cats }] = await Promise.all([
          // visible=true: een verborgen dienst ("on hold") mag een salon niet in
          // de zoekresultaten trekken — de bezoeker klikt dan door en vindt hem
          // nergens op de boekingspagina terug.
          supabase.from("services").select("owner_id,name,name_nl,name_en,name_es").in("owner_id", ids).eq("visible", true),
          supabase.from("service_categories").select("owner_id,name_nl,name_en,name_es,position").in("owner_id", ids).order("position", { ascending: true }),
        ]);
        for (const s of (svcs || [])) {
          svcByOwner[s.owner_id] = (svcByOwner[s.owner_id] || "") + " " +
            [s.name, s.name_nl, s.name_en, s.name_es].filter(Boolean).join(" ");
        }
        for (const cat of (cats || [])) {
          (catsByOwner[cat.owner_id] = catsByOwner[cat.owner_id] || []).push(cat);
          svcByOwner[cat.owner_id] = (svcByOwner[cat.owner_id] || "") + " " +
            [cat.name_nl, cat.name_en, cat.name_es].filter(Boolean).join(" ");
        }
      }
      if (!cancelled) setSalons(rows.map(r => ({ ...r, svc: svcByOwner[r.id] || "", cats: (catsByOwner[r.id] || []).slice(0, 3) })));
    })();
    return () => { cancelled = true; };
  }, []);

  const list = (salons || []).filter(s => {
    if (!q.trim()) return true;
    const hay = normStr(`${s.business_name} ${s.city || ""} ${s.slug} ${s.svc || ""}`);
    return q.trim().split(/\s+/).every(w => hay.includes(normStr(w)));
  });
  // Some salons typed a full address into the city field; show just the
  // city part (text after the last comma) without touching their data.
  const cityOf = (s) => (s.city || "").split(",").pop().trim();

  return (
    <div id="find-salon" style={{ padding: "8px 24px 44px", position: "relative", zIndex: 10 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Reveal from="translateY(10px)" duration={0.5}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase", color: ACCENT, marginBottom: 10 }}>
              {lang === "nl" ? "Voor klanten" : lang === "es" ? "Para clientes" : "For clients"}
            </div>
          </Reveal>
          <Reveal delay={60}>
            <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(24px, 4.5vw, 34px)", fontWeight: 300, marginBottom: 6 }}>{t.findSalonTitle}</h2>
          </Reveal>
          <Reveal delay={130}>
            <div style={{ fontSize: 12, color: c.textLabel, maxWidth: 420, margin: "0 auto", lineHeight: 1.55 }}>{t.findSalonSub}</div>
          </Reveal>
        </div>

        {/* Search pill */}
        <div style={{ maxWidth: 460, margin: "0 auto 20px", position: "relative" }}>
          <div style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          </div>
          <input
            className="input-field"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t.findSalonPh}
            aria-label={t.findSalonTitle}
            style={{ width: "100%", borderRadius: 100, padding: "13px 20px 13px 44px", fontSize: 13 }}
          />
        </div>

        {/* Cards — horizontal snap strip on mobile, centered wrap on desktop,
            so the section stays compact and never pushes the B2B flow down. */}
        <style>{`
          .salon-strip { display: flex; gap: 14px; overflow-x: auto; padding: 4px 4px 12px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
          .salon-card { scroll-snap-align: start; flex: 0 0 206px; text-align: left; cursor: pointer; border-radius: 20px; overflow: hidden; transition: transform .22s ease; padding: 0; font-family: inherit; }
          .salon-card:hover { transform: translateY(-3px); }
          @media (min-width: 720px) { .salon-strip { justify-content: center; flex-wrap: wrap; overflow-x: visible; } }
          @media (prefers-reduced-motion: reduce) { .salon-card, .salon-card:hover { transition: none; transform: none; } }
        `}</style>
        {salons === null ? (
          <div style={{ textAlign: "center", fontSize: 12, color: c.textMuted, padding: "16px 0" }}>…</div>
        ) : (
          <div className="salon-strip">
            {list.map(s => {
              const acc = s.accent_color || ACCENT;
              return (
                <button key={s.slug} className="salon-card" onClick={() => navigate("/" + s.slug)} aria-label={s.business_name}
                  style={{ border: `1px solid ${c.border}`, background: c.bgCard }}>
                  {/* Cover / brand band — the salon's own colours, not ours */}
                  <div style={{ height: 66, background: s.cover_image_url ? `url(${s.cover_image_url}) center/cover` : `linear-gradient(120deg, ${acc}55, ${acc}18 60%, transparent), linear-gradient(160deg, ${acc}22, transparent)` }} />
                  <div style={{ padding: "0 14px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-end", marginTop: -17 }}>
                      {s.logo_url
                        ? <img src={s.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 13, objectFit: "cover", border: `2.5px solid ${c.bgCard}`, background: c.bgCard, flexShrink: 0 }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 13, background: `linear-gradient(135deg, ${acc}, ${acc}88)`, border: `2.5px solid ${c.bgCard}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: "#1a1713", flexShrink: 0 }}>{(s.business_name || "?").trim().slice(0, 1).toUpperCase()}</div>}
                    </div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginTop: 8, color: c.text, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.business_name}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 3, letterSpacing: "0.03em" }}>{flagOf(s.country_code)} {cityOf(s)}</div>
                    {/* What this business does — its own first categories,
                        in the visitor's language, truncated to one line. */}
                    {(s.cats || []).length > 0 && (
                      <div style={{ fontSize: 9.5, color: c.textLabel, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.cats.map(cat => catLabel(cat, lang)).filter(Boolean).join(" · ")}
                      </div>
                    )}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "5px 11px", borderRadius: 100, border: `1px solid ${acc}55`, fontSize: 10, color: acc, fontWeight: 600 }}>
                      {t.findSalonBook} →
                    </div>
                  </div>
                </button>
              );
            })}
            {/* "Your salon here?" — acquisition card, always last */}
            <button className="salon-card" onClick={() => navigate("/owner")} aria-label={t.findSalonCta}
              style={{ border: `1.5px dashed ${ACCENT}66`, background: `${ACCENT}08`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 168, padding: "18px 14px", textAlign: "center" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", border: `1.5px dashed ${ACCENT}88`, display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, fontSize: 18, marginBottom: 10 }}>+</div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: c.text }}>{t.findSalonCta}</div>
              <div style={{ fontSize: 10, color: c.textLabel, marginTop: 4, lineHeight: 1.5 }}>{t.findSalonCtaSub}</div>
              <div style={{ marginTop: 10, padding: "6px 14px", borderRadius: 100, background: ACCENT, color: "#fff", fontSize: 10, fontWeight: 600 }}>{t.startFree}</div>
            </button>
          </div>
        )}

        {/* No-result fallback: a client holding an exact vellu.cc link can
            still navigate straight to it. */}
        {salons !== null && q.trim() && list.length === 0 && (
          <div style={{ maxWidth: 460, margin: "6px auto 0", textAlign: "center" }}>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 10 }}>{t.findSalonNoRes} {t.findSalonNoResHint}</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              <div style={{ flex: 1, position: "relative", maxWidth: 260 }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: c.textMuted, pointerEvents: "none" }}>vellu.cc/</div>
                <input className="input-field" placeholder={lang === "nl" ? "salon-naam" : "salon-name"} value={slugFallback} onChange={e => setSlugFallback(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && goToSlug(slugFallback)} style={{ paddingLeft: 70, borderRadius: 10, fontSize: 12, padding: "9px 12px 9px 70px", width: "100%" }} />
              </div>
              <button className="btn-primary" style={{ width: "auto", padding: "9px 16px", flexShrink: 0, fontSize: 13 }} onClick={() => goToSlug(slugFallback)}>→</button>
            </div>
          </div>
        )}
      </div>
    </div>
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

// Is er überhaupt iets om te onthullen? Twee bezoekers slaan de animatie over:
// wie "beperk beweging" aan heeft staan, en wie een browser zonder
// IntersectionObserver gebruikt. Beide antwoorden liggen al vast vóór de eerste
// render — ze hangen niet van de DOM af — dus is dit een berekening, geen effect.
// Zonder window draait er geen browser om iets aan te meten; dan blijft het
// antwoord false en pakt de observer het in de echte browser alsnog op.
// Staat los van de component zodat useState hem als lazy initializer kan krijgen.
function revealsInstantly() {
  if (typeof window === "undefined") return false;
  if (typeof IntersectionObserver === "undefined") return true;
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

// Scroll-reveal wrapper: children fade/slide in the first time they enter
// the viewport. No-ops (instantly visible) when IntersectionObserver is
// unavailable or the user prefers reduced motion.
function Reveal({ children, delay = 0, from = "translateY(22px)", duration = 0.65, className, style }) {
  const ref = useRef(null);
  // Beginwaarde uit revealsInstantly() in plaats van uit een effect. Wat de
  // gebruiker hiervan merkte: wie "beperk beweging" aan had staan, kreeg de
  // blokken tóch zien vervagen. De oude code rende eerst op opacity 0 en zette
  // pas ná die render vis=true — en de transition van 0.65s staat er altijd op,
  // dus die sprong van 0 naar 1 wérd de animatie die de bezoeker juist had
  // uitgezet. Nu is de eerste verf al opacity 1: geen overgang, geen beweging.
  // Voor wie animatie wél wil verandert er niets: die begint nog steeds op
  // false en wordt pas door de observer onthuld. De extra render die dit
  // uitspaart trof dus alleen de reduced-motion-bezoeker — de gewone bezoeker
  // kreeg die nooit, want in de oude code stond die setVis in dezelfde tak.
  const [vis, setVis] = useState(revealsInstantly);
  useEffect(() => {
    const el = ref.current;
    // De deps blijven leeg, en dat is hier geen weggemoffelde melding: deze
    // effect leest alleen ref (stabiel) en een functie op module-niveau, dus
    // exhaustive-deps heeft niets te vragen. vis hoort er sowieso niet in — de
    // effect leest hem niet, en als dependency zou hij een nieuwe observer op
    // een al onthuld element zetten precies wanneer het werk klaar is.
    // De herhaalde revealsInstantly() hieronder spaart alleen werk: wie alles
    // al ziet, hoeft geen zeven observers aan de pagina te hebben hangen.
    if (!el || revealsInstantly()) return;
    // Deze setVis blijft staan en hoort hier: hij zit in de callback van een
    // extern systeem (de observer), niet synchroon in de effect-body. Dat is
    // precies waar effects voor bedoeld zijn — abonneren en reageren.
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); io.disconnect(); }
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : from, transition: `opacity ${duration}s ease ${delay}ms, transform ${duration}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

// ─── SIGNATURE-LAAG (landing-rebuild 2026-08-27) ─────────────────────────────
// De bewegingsgrammatica van de Mirah "Signature"-demo's, vertaald naar React
// en het Vellu-goud: kinetische kopregel, scrollvoortgang, marquee, parallax,
// muiscursor-ring en getallen-tweens. Alles valt óf stil bij "beperk beweging",
// óf bestaat alleen op desktop (fine pointer). JS weg = statische pagina.
const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const finePointer = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

// Dunne gouden voortgangslijn bovenaan — schrijft direct op de DOM-node in een
// rAF-tick, dus geen re-render per scroll-pixel.
function ScrollProgress() {
  const ref = useRef(null);
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);
  return <div ref={ref} aria-hidden="true" style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${ACCENT}cc, ${ACCENT})`, transformOrigin: "0 50%", transform: "scaleX(0)", zIndex: 60, pointerEvents: "none" }} />;
}

// Eén kopregel-"beat": masker + omhoogschuiven met vertraging. `ready` komt
// van de ouder zodat alle regels op één klok lopen; bij beperk-beweging staat
// ready al op true vóór de eerste verf en beweegt er niets.
function KineticLine({ children, delay = 0, ready }) {
  // paddingBottom/marginBottom-compensatie: de maskers knippen met overflow
  // hidden, en bij lineHeight 1.06 steekt een staartletter (y, g, j) anders
  // permanent buiten zijn regelvak.
  return (
    <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.14em", marginBottom: "-0.14em" }}>
      <span style={{ display: "block", whiteSpace: "nowrap", transform: ready ? "none" : "translateY(118%)", transition: `transform 0.95s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms` }}>
        {children}
      </span>
    </span>
  );
}

// Vertraagde binnenkomst voor hero-onderdelen onder de kopregel (badge, sub,
// cta's, stats). Zelfde klok als de kopregel.
function HeroEnter({ children, delay = 0, ready }) {
  return (
    <div style={{ opacity: ready ? 1 : 0, transform: ready ? "none" : "translateY(14px)", transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms` }}>
      {children}
    </div>
  );
}

// Doorlopende woordenband — twee identieke helften, -50% translate = naadloze
// lus. Puur CSS-animatie (goedkoop, ook mobiel); pauzeert bij hover en staat
// stil bij beperk-beweging (zie de klassen in LandingScreen).
function Marquee({ items, c }) {
  const half = (key) => (
    <div key={key} style={{ display: "flex", flexShrink: 0 }}>
      {items.map((w, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 26, padding: "0 13px", fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 300, letterSpacing: "0.06em", color: c.textSub, whiteSpace: "nowrap" }}>
          {w}
          <span aria-hidden="true" style={{ fontSize: 11, color: ACCENT, opacity: 0.75 }}>✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div aria-hidden="true" className="vl-marquee" style={{ overflow: "hidden", padding: "26px 0", borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)" }}>
      <div className="vl-marquee-track" style={{ display: "flex", width: "max-content" }}>
        {half(0)}{half(1)}
      </div>
    </div>
  );
}

// Vast koppatroon voor elke sectie: klein goud "wenkbrauw"-label, serif-titel,
// en een lijn die zich uittekent (scaleX via Reveal's from-prop).
function SectionHead({ eyebrow, title, sub, c }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 44 }}>
      {eyebrow && (
        <Reveal from="translateY(10px)" duration={0.5}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase", color: ACCENT, marginBottom: 12 }}>{eyebrow}</div>
        </Reveal>
      )}
      <Reveal delay={70}>
        <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 12, lineHeight: 1.15 }}>{title}</h2>
      </Reveal>
      <Reveal delay={190} from="scaleX(0)" duration={0.8}>
        <div style={{ width: 56, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto", transformOrigin: "center" }} />
      </Reveal>
      {sub && (
        <Reveal delay={240}>
          <div style={{ fontSize: 12.5, color: c.textLabel, lineHeight: 1.6, maxWidth: 460, margin: "14px auto 0" }}>{sub}</div>
        </Reveal>
      )}
    </div>
  );
}

// Getal dat naar zijn nieuwe waarde toe-eased (besparingsteller). Bij
// beperk-beweging springt hij direct.
function TweenedNumber({ value, format }) {
  const [disp, setDisp] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (from === value || prefersReducedMotion()) { setDisp(value); return; }
    let raf;
    const start = performance.now(), dur = 550;
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisp(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(disp)}</>;
}

// Laag die traag met de scroll meedrijft (deco-gloed, hero-telefoon). Alleen
// desktop + volledige beweging; anders gewoon een statische div.
function ParallaxLayer({ speed = 0.08, style, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (prefersReducedMotion() || !finePointer()) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      if (ref.current) ref.current.style.transform = `translate3d(0, ${(window.scrollY * speed).toFixed(1)}px, 0)`;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed]);
  return <div ref={ref} style={style}>{children}</div>;
}

// Gouden cursor-ring die de muis naijlt en groeit boven klikbare elementen.
// De systeemcursor blijft gewoon zichtbaar (geen verstoppertje met de UX);
// bestaat alleen op fine-pointer-apparaten zonder beperk-beweging.
function CursorRing() {
  const ringRef = useRef(null);
  const dotRef = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion() || !finePointer()) return;
    setOn(true);
    let tx = -100, ty = -100, rx = -100, ry = -100, raf, grow = false;
    const move = (e) => {
      tx = e.clientX; ty = e.clientY;
      if (dotRef.current) dotRef.current.style.transform = `translate(${tx}px, ${ty}px)`;
    };
    const over = (e) => {
      const g = !!e.target?.closest?.("a, button, input, select, textarea, [role=button], [role=radio], [role=tab]");
      if (g !== grow) { grow = g; ringRef.current?.classList.toggle("grow", g); }
    };
    const loop = () => {
      rx += (tx - rx) * 0.16; ry += (ty - ry) * 0.16;
      if (ringRef.current) ringRef.current.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", move, { passive: true });
    window.addEventListener("mouseover", over, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseover", over);
      cancelAnimationFrame(raf);
    };
  }, []);
  if (!on) return null;
  return (
    <>
      <div ref={ringRef} className="vl-cursor" aria-hidden="true" />
      <div ref={dotRef} className="vl-cursor-dot" aria-hidden="true" />
    </>
  );
}

// Zet per kaart de muispositie als CSS-variabelen; de .vl-glow::after-laag
// (zie de stylesheet in LandingScreen) tekent daar een zachte goudgloed.
function glowMove(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", (e.clientX - r.left) + "px");
  el.style.setProperty("--my", (e.clientY - r.top) + "px");
}

// Real product screenshots shown inside the hero phone frame, cross-faded on a
// timer so the device feels alive. Files live in /public. If they 404,
// HeroPhoneMockup falls back to the CSS mockup below.
const HERO_SHOTS = [
  "/hero-phone-1.jpg", // owner dashboard (revenue + today's appointments)
  "/hero-phone-2.jpg", // calendar — a full week
  "/hero-phone-3.jpg", // clients list
  "/hero-phone-4.jpg", // analytics — charts + rating
  "/hero-phone-5.jpg", // invoices — earnings + PDF report
  "/hero-phone-6.jpg", // public booking page — services
  "/hero-phone-7.jpg", // public booking page — contact/map
];

// Phone frame for the hero. Renders the real screenshots (HERO_SHOTS) when
// present; otherwise falls back to a CSS-only mockup of a fictional salon's
// booking page, built from plain divs so it always matches the product's
// design language. Stays inside the site's gold palette so the hero reads as
// one composition.
function HeroPhoneMockup({ lang, c }) {
  const services = [
    [lang === "nl" ? "Gel manicure" : lang === "es" ? "Manicura en gel" : "Gel manicure", "45 min", "€38"],
    [lang === "nl" ? "BIAB nieuwe set" : lang === "es" ? "BIAB set nuevo" : "BIAB new set", "60–75 min", lang === "nl" ? "Vanaf €52" : lang === "es" ? "Desde €52" : "From €52"],
    [lang === "nl" ? "Brow lift & verf" : lang === "es" ? "Lifting y tinte de cejas" : "Brow lift & tint", "30 min", "€29"],
  ];
  const cats = lang === "nl" ? ["Nagels", "Brows", "Lashes"] : ["Nails", "Brows", "Lashes"];
  const slots = ["10:00", "11:30", "13:00", "15:30"];
  const darkOnGold = "#1a1713";
  // Prefer the real product screenshots (HERO_SHOTS); they cross-fade on a
  // timer so the hero feels alive. Any shot that 404s drops itself out of the
  // rotation via onError; only when they're ALL gone do we fall back to the
  // CSS mockup below.
  const [shots, setShots] = useState(HERO_SHOTS);
  const [shotIdx, setShotIdx] = useState(0);
  useEffect(() => {
    if (shots.length <= 1) return;
    const id = setInterval(() => setShotIdx(i => (i + 1) % shots.length), 4000);
    return () => clearInterval(id);
  }, [shots.length]);
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

            {shots.length > 0 ? (
              /* Real product screenshots, full-bleed inside the frame, cross-
                 fading on a timer. Each screenshot carries its own phone status
                 bar, so we don't overlay anything. All layers are stacked; the
                 active one fades in over the others. */
              <div style={{ position: "relative", width: "100%", aspectRatio: "254 / 552", background: c.bgCard }}>
                {shots.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={lang === "nl" ? "Vellu salon-app" : lang === "es" ? "App de salón Vellu" : "Vellu salon app"}
                    onError={() => setShots(s => s.filter(x => x !== src))}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block", opacity: i === (shotIdx % shots.length) ? 1 : 0, transition: "opacity 0.9s ease" }}
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
              <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{lang === "nl" ? "Kies een tijd" : lang === "es" ? "Elige una hora" : "Choose a time"}</div>
              <div style={{ display: "flex", gap: 5 }}>
                {slots.map((tt, i) => (
                  <div key={tt} style={{ flex: 1, textAlign: "center", fontSize: 9, fontWeight: 600, padding: "7px 0", borderRadius: 9, background: i === 1 ? ACCENT : c.bgCard, color: i === 1 ? darkOnGold : c.textSub, border: `1px solid ${i === 1 ? ACCENT : c.border}` }}>{tt}</div>
                ))}
              </div>
            </div>

            {/* Confirm CTA — with the running total */}
            <div style={{ padding: "11px 14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderRadius: 100, background: ACCENT, boxShadow: `0 12px 26px -12px ${ACCENT}` }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: darkOnGold }}>{lang === "nl" ? "Bevestig · 11:30" : lang === "es" ? "Confirmar · 11:30" : "Confirm · 11:30"}</span>
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
  const fmt = (n) => "€" + Math.round(n).toLocaleString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-US");
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
        <Row label={t.calcTreatwellCost} value={`− ${fmt(treatwellMonthly)}${lang === "nl" ? "/mnd" : lang === "es" ? "/mes" : "/mo"}`} c={c} negative />
        <Row label={t.calcVelluCost} value={`− €${velluMonthly}${lang === "nl" ? "/mnd" : lang === "es" ? "/mes" : "/mo"}`} c={c} negative />
      </div>
      <div style={{ textAlign: "center", padding: "18px 18px", background: `${ACCENT}10`, border: `1px solid ${ACCENT}33`, borderRadius: 14 }}>
        <div style={{ fontSize: 11, color: c.textLabel, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{t.calcSavingsYear}</div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 42, fontWeight: 300, color: ACCENT, lineHeight: 1.1 }}>
          <TweenedNumber value={savingsYear} format={fmt} />
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
      const { data } = await supabase.from("public_salons").select("business_name").eq("referral_code", urlRef.toUpperCase()).maybeSingle();
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
      const { data: existing } = await supabase.from("public_salons").select("id").eq("slug", slug).maybeSingle();
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
        setError(lang === "nl" ? "Profiel aanmaken mislukt. Probeer het opnieuw." : lang === "es" ? "No se pudo crear el perfil. Inténtalo de nuevo." : "Could not create profile. Please try again.");
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
      onLogin({ name: profile?.business_name || "Mijn Studio", email: form.email, slug, city: profile?.city || "Nederland", id: data.user.id, accent: profile?.accent_color, plan: profile?.plan || null, plan_expires_at: profile?.plan_expires_at || null, subscription_status: profile?.subscription_status || null, mollie_subscription_id: profile?.mollie_subscription_id || null, account_type: profile?.account_type || "joint" });
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

        {/* Ruimte boven de kroon: op korte telefoonschermen schoof het logo
            anders onder de absoluut geplaatste thema/taal-knoppen. */}
        <div style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 10, paddingTop: "calc(72px + env(safe-area-inset-top, 0px))", paddingBottom: 24 }} className="fade-up">
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
                  <>Je bent uitgenodigd door <strong>{referrerName}</strong> — jullie krijgen allebei <strong>2 weken gratis</strong>.</>
                ) : (
                  <>Invited by <strong>{referrerName}</strong> — you both get <strong>2 weeks free</strong>.</>
                )}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {mode === "signup" && <>
                <input className="input-field" placeholder={t.businessNameField} value={form.businessName} onChange={e => setForm(f => ({...f, businessName: e.target.value}))} />
                <input className="input-field" placeholder={t.city} value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
                {/* Land / regio — explicitly labelled and with live feedback,
                    because this quietly sets the salon's currency AND tax. A
                    non-NL owner who leaves it on the default would otherwise get
                    euros + BTW by accident. */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Land / regio" : lang === "es" ? "País / región" : "Country / region"}</div>
                  <div style={{ position: "relative" }}>
                    <select
                      className="input-field"
                      value={form.countryCode}
                      onChange={e => setForm(f => ({...f, countryCode: e.target.value}))}
                      aria-label={lang === "nl" ? "Land / regio" : lang === "es" ? "País / región" : "Country / region"}
                      style={{ appearance: "none", cursor: "pointer", paddingRight: 40, width: "100%" }}
                    >
                      {/* Native dropdown menus ignore the select's dark styling, so
                          each option needs explicit theme colours — otherwise it's
                          unreadable grey-on-white. */}
                      {COUNTRIES.filter(c2 => c2.launched).map(c2 => (
                        <option key={c2.code} value={c2.code} style={{ background: c.selectBg, color: c.text }}>{c2.name}</option>
                      ))}
                    </select>
                    <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: c.textLabel, fontSize: 12 }}>▾</div>
                  </div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 6, lineHeight: 1.5 }}>
                    {lang === "nl"
                      ? <>Bepaalt je <strong style={{ color: c.text }}>valuta en belasting</strong>: {currencyForCountry(form.countryCode).symbol.trim()} · {taxForCountry(form.countryCode).label}. Later te wijzigen in Instellingen.</>
                      : <>Sets your <strong style={{ color: c.text }}>currency and tax</strong>: {currencyForCountry(form.countryCode).symbol.trim()} · {taxForCountry(form.countryCode).label}. Changeable later in Settings.</>}
                  </div>
                </div>
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
                  aria-label={showPassword ? (lang === "nl" ? "Wachtwoord verbergen" : lang === "es" ? "Ocultar contraseña" : "Hide password") : (lang === "nl" ? "Wachtwoord tonen" : lang === "es" ? "Mostrar contraseña" : "Show password")}
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
                  {lang === "nl" ? "Onthoud mijn gegevens" : lang === "es" ? "Recordarme" : "Remember me"}
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
