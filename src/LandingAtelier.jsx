// LandingAtelier — de "volledige herbouw"-richting naast de Signature-branch
// (2026-08-27). Zelfde inhoud, zelfde drie talen, zelfde werkende onderdelen
// (SalonFinder, rekentool, telefoon met echte screenshots, chat), maar een
// eigen kleurwereld: Faisals aardpalet van 27-08 — géén goud meer, espresso
// als inkt en earth brown als accent. Redactionele opbouw: genummerde secties,
// haarlijnen, monumentale serif, espresso-finale.
//
//   Deep Espresso Clay  #5B4C3A — inkt (koppen, knoppen, finale-vlak)
//   Rich Earth Brown    #8A7356 — accent (wenkbrauwen, markers, onderstrepen)
//   Soft Mushroom Beige #C4B39A — zachte accenten (grote nummers, outline)
//   Warm Putty          #DED1BA — haarlijnen, vlakken, tags
//   Gentle Bone White   #F4EFE6 — canvas
//
// Vast palet — deze richting kiest bewust één look, dus geen dark-mode-toggle;
// de app zelf behoudt gewoon zijn thema's. De telefoon-screenshots tonen de
// echte (goudkleurige) app — dat is het product en mag zo blijven.
//
// Deling met LandingScreen.jsx: de bewegingslaag (Reveal, KineticLine,
// Marquee, …) en de functionele blokken komen daarvandaan; ze nemen kleuren
// als props (`c` + `accent`), dus dit bestand geeft zijn eigen palet mee. De
// globale .btn-*/.input-field-stijlen volgen het app-thema en worden hier
// binnen .atelier overschreven, anders lekt een donker thema de bone-pagina in.
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SupportChat from "./SupportChat.jsx";
import { useSEO, T, Layout, NavIcon, AT, AT_COLORS } from "./shared.jsx";
import {
  SalonFinder, SavingsCalculator, HeroPhoneMockup, StickyStartPill,
  Reveal, KineticLine, HeroEnter, Marquee, TweenedNumber,
  ParallaxLayer, CursorRing, ScrollProgress, glowMove,
} from "./LandingScreen.jsx";

// Eén bron van waarheid: het palet leeft in shared.jsx (AT/AT_COLORS), zodat
// de login-, wachtwoord- en planschermen exact dezelfde huid dragen.
const { ESPRESSO, EARTH, MUSHROOM, PUTTY, BONE } = AT;
const INK = ESPRESSO;
const ESPRESSO_DEEP = AT.DEEP;
const P = AT_COLORS;

// Sectiekop: gecentreerde serif-titel met een korte lijn die zich uittekent
// (nummers en streepje verwijderd op Faisals verzoek, 27-08). `tone` volgt de
// band: bone (canvas), putty (lichte band), earth (rijke band, titel in bone)
// of mushroom (FAQ-band, verdiept espresso).
function AtHead({ title, sub, tone = "bone" }) {
  const onEarth = tone === "earth";
  const onMush = tone === "mushroom";
  const titleCol = onEarth ? BONE : onMush ? ESPRESSO_DEEP : INK;
  const subCol = onEarth ? `${BONE}e6` : onMush ? ESPRESSO_DEEP : tone === "putty" ? "#5f5240" : P.textLabel;
  const rule = onEarth ? `${BONE}66` : onMush ? `${ESPRESSO_DEEP}66` : EARTH;
  return (
    <div style={{ textAlign: "center", marginBottom: 42 }}>
      <Reveal from="translateY(14px)" duration={0.55}>
        <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(30px, 5.4vw, 46px)", fontWeight: 300, lineHeight: 1.1, color: titleCol, letterSpacing: "0.01em" }}>{title}</h2>
      </Reveal>
      <Reveal delay={140} from="scaleX(0)" duration={0.8}>
        <div style={{ width: 56, height: 1, background: `linear-gradient(90deg, transparent, ${rule}, transparent)`, margin: "16px auto 0", transformOrigin: "center" }} />
      </Reveal>
      {sub && (
        <Reveal delay={200}>
          <div style={{ fontSize: 13, color: subCol, lineHeight: 1.65, maxWidth: 480, margin: "14px auto 0" }}>{sub}</div>
        </Reveal>
      )}
    </div>
  );
}

function LandingScreen({ onSelectSalon, onOwnerEnter, lang, setLang, salons = {} }) {
  const navigate = useNavigate();
  const t = T[lang];
  useSEO({
    title: lang === "nl" ? "Vellu - Beauty Booking Platform | 0% Commissie" : lang === "es" ? "Vellu - Plataforma de reservas de belleza | 0% de comisión" : "Vellu - Beauty Booking Platform | 0% Commission",
    description: lang === "nl" ? "Je eigen boekingspagina met jouw naam, jouw kleuren en jouw diensten. Vast tarief, 0% commissie." : lang === "es" ? "Tu propia página de reservas con tu nombre, tus colores y tus servicios. Precio fijo, 0% de comisión." : "Your own booking page with your name, your colors and your services. Fixed price, 0% commission.",
    url: "https://vellu.cc/"
  });
  const [faqOpen, setFaqOpen] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [heroReady, setHeroReady] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  useEffect(() => {
    if (heroReady) return;
    let id2;
    const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setHeroReady(true)); });
    return () => { cancelAnimationFrame(id1); if (id2) cancelAnimationFrame(id2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goToSlug = (slug) => {
    let clean = slug.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^(www\.)?vellu\.cc\//, "");
    clean = clean.replace(/[^a-z0-9-]/g, "");
    if (!clean) return;
    navigate("/" + clean);
  };

  const marqueeWords = lang === "nl"
    ? ["Nagelstylistes", "Lash artists", "Brow studio's", "Kappers", "Barbers", "PMU-specialisten", "Huidtherapeuten", "Make-up artists"]
    : lang === "es"
      ? ["Manicuristas", "Artistas de pestañas", "Estudios de cejas", "Peluquerías", "Barberos", "Especialistas en PMU", "Esteticistas", "Maquilladoras"]
      : ["Nail artists", "Lash techs", "Brow studios", "Hairdressers", "Barbers", "PMU artists", "Skin therapists", "Makeup artists"];

  // Zelfde inhoud als de andere richting; alleen de vorm verschilt.
  const steps = [
    { n: "01", title: t.step1, desc: t.step1d },
    { n: "02", title: t.step2, desc: t.step2d },
    { n: "03", title: t.step3, desc: t.step3d },
  ];
  const feats = [
    { nl: ["Eigen boekingspagina", "Jouw merk, jouw kleuren, jouw link — vellu.cc/jouw-naam. Klanten boeken direct bij jou, zonder tussenpartij."], en: ["Your own booking page", "Your brand, your colors, your link — vellu.cc/your-name. Clients book directly with you, no middleman."], es: ["Tu propia página de reservas", "Tu marca, tus colores, tu enlace — vellu.cc/tu-nombre. Los clientes reservan directamente contigo, sin intermediarios."] },
    { nl: ["0% commissie", "Vast maandtarief. Elke cent van elke boeking blijft van jou."], en: ["0% commission", "Flat monthly fee. Every cent of every booking stays yours."], es: ["0% de comisión", "Tarifa mensual fija. Cada centavo de cada reserva es tuyo."] },
    { nl: ["Team accounts", "Elke medewerker een eigen login, agenda en diensten."], en: ["Team accounts", "Each staff member gets their own login, schedule and services."], es: ["Cuentas de equipo", "Cada miembro del equipo tiene su propio acceso, agenda y servicios."] },
    { nl: ["Automatische e-mails", "Bevestigingen, herinneringen, follow-ups — en de factuur gaat automatisch mee bij het afrekenen."], en: ["Automatic emails", "Confirmations, reminders, follow-ups — and the invoice is emailed automatically at checkout."], es: ["Correos automáticos", "Confirmaciones, recordatorios, seguimientos — y la factura se envía automáticamente al cobrar."] },
    { nl: ["Reviews", "Automatisch reviews verzamelen na elk bezoek."], en: ["Reviews", "Automatically collect reviews after every visit."], es: ["Reseñas", "Recoge reseñas automáticamente tras cada visita."] },
    { nl: ["Eigen branding", "Jouw logo, kleuren en stijl — tot op de bevestigingsmail."], en: ["Custom branding", "Your logo, colors and style — down to the confirmation email."], es: ["Tu propia marca", "Tu logo, colores y estilo — hasta en el correo de confirmación."] },
    { nl: ["Portfolio", "Foto's per behandeling tonen."], en: ["Portfolio", "Show photos per treatment."], es: ["Portafolio", "Muestra fotos por tratamiento."] },
    { nl: ["Kortingscodes", "Maak en deel korting met je klanten."], en: ["Discount codes", "Create and share discounts with clients."], es: ["Códigos de descuento", "Crea y comparte descuentos con tus clientes."] },
  ];
  const featOf = (f) => (lang === "nl" ? f.nl : lang === "es" ? f.es : f.en);

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

  const plans = [
    { name: "Starter", price: 19, popular: false, features: { nl: ["Online boekingen", "Email bevestigingen", "24u herinneringen", "Reviews systeem", "Eigen branding & logo", "Tot 3 medewerkers"], en: ["Online bookings", "Email confirmations", "24h reminders", "Reviews system", "Custom branding & logo", "Up to 3 staff members"] } },
    { name: "Professional", price: 35, popular: true, features: { nl: ["Alles van Starter +", "Onbeperkt medewerkers", "Team accounts (eigen login)", "Producten verkopen", "Analytics dashboard", "Kortingscodes", "Nieuwsbrief & klant-export", "Meerdere locaties", "Prioriteit support"], en: ["Everything in Starter +", "Unlimited staff members", "Team accounts (own login)", "Sell products", "Analytics dashboard", "Discount codes", "Newsletter & client export", "Multiple locations", "Priority support"] } },
  ];

  const maxW = 1080;
  const pad = "clamp(20px, 5vw, 44px)";

  return (
    <Layout>
      <div className="atelier" style={{ background: P.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: INK, position: "relative", overflow: "clip" }}>
        {/* Papier-ademing: twee zachte mushroom-vlekken in de marge. */}
        <div aria-hidden="true" style={{ position: "absolute", top: "-12%", right: "-8%", width: "48%", height: "42%", background: `radial-gradient(ellipse at center, ${MUSHROOM}30 0%, transparent 65%)`, pointerEvents: "none" }} />
        <div aria-hidden="true" style={{ position: "absolute", top: "38%", left: "-14%", width: "44%", height: "40%", background: `radial-gradient(ellipse at center, ${MUSHROOM}1e 0%, transparent 65%)`, pointerEvents: "none" }} />

        <ScrollProgress color={INK} />
        <CursorRing />

        {/* Scoped stijlen: knoppen/inputs los van het app-thema + de
            bewegingsklassen die anders in LandingScreen's stylesheet wonen. */}
        <style>{`
          .atelier .btn-primary { background: ${INK}; color: ${BONE}; border: 1px solid ${INK}; border-radius: 100px; font-family: 'Jost', sans-serif; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease; box-shadow: none; }
          .atelier .btn-primary:hover { transform: translateY(-1px); background: #4a3e2f; box-shadow: 0 14px 28px -16px ${INK}; }
          .atelier .btn-ghost { background: transparent; color: ${INK}; border: 1px solid ${MUSHROOM}; border-radius: 100px; font-family: 'Jost', sans-serif; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: border-color 0.2s ease, background 0.2s ease; }
          .atelier .btn-ghost:hover { border-color: ${EARTH}; background: ${PUTTY}55; }
          .atelier .input-field { background: ${P.inputBg}; border: 1px solid ${P.inputBorder}; color: ${INK}; font-family: 'Jost', sans-serif; outline: none; }
          .atelier .input-field::placeholder { color: ${EARTH}; }
          .atelier .input-field:focus { border-color: ${EARTH}; }
          .atelier ::selection { background: ${PUTTY}; }
          .vl-marquee-track { animation: vlMarquee 32s linear infinite; }
          .vl-marquee:hover .vl-marquee-track { animation-play-state: paused; }
          @keyframes vlMarquee { to { transform: translateX(-50%); } }
          .at-outline { color: transparent; -webkit-text-stroke: 1px ${MUSHROOM}; }
          .vl-cursor { position: fixed; top: 0; left: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px; border: 1px solid ${EARTH}; border-radius: 50%; pointer-events: none; z-index: 80; transition: width 0.25s ease, height 0.25s ease, margin 0.25s ease, border-color 0.25s ease; }
          .vl-cursor.grow { width: 46px; height: 46px; margin: -23px 0 0 -23px; border-color: ${INK}; }
          .vl-cursor-dot { position: fixed; top: 0; left: 0; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: ${INK}; pointer-events: none; z-index: 80; }
          .vl-glow { position: relative; }
          .vl-glow::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), ${MUSHROOM}40, transparent 65%); opacity: 0; transition: opacity 0.3s ease; pointer-events: none; }
          .vl-glow:hover::after { opacity: 1; }
          @media (hover: none) { .vl-glow::after { display: none; } }
          .at-hero-grid { display: grid; grid-template-columns: 1fr; gap: 44px; align-items: center; }
          .at-hero-copy { text-align: center; }
          .at-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; align-items: center; }
          .at-stats { display: grid; grid-template-columns: repeat(3, auto); justify-content: center; }
          @media (min-width: 900px) {
            .at-hero-grid { grid-template-columns: 1.15fr 0.85fr; gap: 30px; }
            .at-hero-copy { text-align: left; }
            .at-ctas { justify-content: flex-start; }
            .at-stats { justify-content: start; }
          }
          .at-feat-grid { display: grid; grid-template-columns: 1fr; gap: 0 44px; }
          @media (min-width: 760px) { .at-feat-grid { grid-template-columns: 1fr 1fr; } }
          .at-price-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
          @media (min-width: 760px) { .at-price-grid { grid-template-columns: 1fr 1fr; align-items: stretch; } }
          .at-step { transition: background 0.25s ease; }
          .at-step:hover { background: ${PUTTY}44; }
          @media (prefers-reduced-motion: reduce) { .vl-marquee-track { animation: none; } }
        `}</style>

        {/* ── NAV — haarlijn, espresso, rustig. ── */}
        <nav style={{ position: "sticky", top: 0, zIndex: 40, background: scrolled ? `${BONE}ee` : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", WebkitBackdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: `1px solid ${scrolled ? PUTTY : "transparent"}`, transition: "background 0.3s ease, border-color 0.3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `calc(14px + env(safe-area-inset-top, 0px)) ${pad} 14px`, maxWidth: maxW, margin: "0 auto" }}>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "clamp(20px, 5vw, 24px)", fontWeight: 400, letterSpacing: "0.22em", color: INK }}>vellu</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button onClick={() => document.getElementById("find-salon")?.scrollIntoView({ behavior: "smooth" })} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: EARTH, display: isMobile ? "none" : "inline" }}>
                {t.findSalonNav}
              </button>
              <div style={{ display: "flex", gap: 2, border: `1px solid ${PUTTY}`, borderRadius: 100, padding: 3, background: P.bgCard }}>
                {["nl", "en", "es"].map(l => (
                  <button key={l} onClick={() => setLang(l)} style={{ border: "none", cursor: "pointer", borderRadius: 100, padding: "5px 10px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Jost',sans-serif", background: lang === l ? INK : "transparent", color: lang === l ? BONE : EARTH }}>
                    {l}
                  </button>
                ))}
              </div>
              <button className="btn-ghost" style={{ fontSize: 10, padding: "9px 16px", whiteSpace: "nowrap" }} onClick={() => navigate("/owner")}>
                {t.signIn}
              </button>
            </div>
          </div>
        </nav>

        {/* ── HERO — redactioneel: klein wenkbrauw-label, monumentale serif,
              telefoon op een putty-paneel, licht gedraaid. ── */}
        <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(28px, 5vw, 52px) ${pad} 24px`, position: "relative", zIndex: 10 }}>
          <div className="at-hero-grid">
            <div className="at-hero-copy">
              <HeroEnter ready={heroReady} delay={0}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: EARTH, marginBottom: 20 }}>
                  {t.heroTag}
                </div>
              </HeroEnter>
              <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(44px, 8vw, 78px)", fontWeight: 300, letterSpacing: "0.01em", lineHeight: 1.02, marginBottom: 20, color: INK }}>
                <KineticLine ready={heroReady} delay={120}>{t.heroTitle}</KineticLine>
                <KineticLine ready={heroReady} delay={260}>{t.heroTitle2}</KineticLine>
                <KineticLine ready={heroReady} delay={400}><em style={{ fontStyle: "italic", color: EARTH, fontWeight: 400 }}>{t.heroBrand}</em></KineticLine>
              </h1>
              <HeroEnter ready={heroReady} delay={580}>
                <p style={{ fontSize: "clamp(14px, 2vw, 16px)", color: P.textSub, lineHeight: 1.75, maxWidth: 460, marginBottom: 26, marginLeft: isMobile ? "auto" : 0, marginRight: isMobile ? "auto" : 0 }}>
                  {t.heroSub}
                </p>
              </HeroEnter>
              <HeroEnter ready={heroReady} delay={700}>
                <div className="at-ctas">
                  <button className="btn-primary" style={{ padding: "17px 38px", fontSize: 11 }} onClick={() => navigate("/owner")}>
                    {t.startFree}
                  </button>
                  <button onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                    style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: INK, borderBottom: `1px solid ${EARTH}`, paddingBottom: 4 }}>
                    {t.howItWork} ↓
                  </button>
                </div>
              </HeroEnter>
              <HeroEnter ready={heroReady} delay={840}>
                <div className="at-stats" style={{ marginTop: 30 }}>
                  {[
                    { num: "0%", nl: "Commissie", en: "Commission", es: "Comisión" },
                    { num: "24/7", nl: "Online boekbaar", en: "Bookable online", es: "Reservas online" },
                    { num: "€19", nl: "Vast per maand", en: "Fixed per month", es: "Fijo al mes" },
                  ].map((s, i) => (
                    <div key={i} style={{ padding: "0 clamp(14px, 2.6vw, 30px)", borderLeft: i === 0 ? "none" : `1px solid ${PUTTY}`, opacity: heroReady ? 1 : 0, transform: heroReady ? "none" : "translateY(10px)", transition: `opacity 0.6s ease ${860 + i * 110}ms, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${860 + i * 110}ms` }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 3.4vw, 38px)", fontWeight: 300, color: INK, lineHeight: 1 }}>{s.num}</div>
                      <div style={{ fontSize: 9.5, color: EARTH, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 6 }}>{lang === "nl" ? s.nl : lang === "es" ? s.es : s.en}</div>
                    </div>
                  ))}
                </div>
              </HeroEnter>
              <HeroEnter ready={heroReady} delay={1080}>
                <div style={{ marginTop: 16, fontSize: 11, color: EARTH, letterSpacing: "0.05em" }}>
                  {lang === "nl" ? "Gebruikt door salons in Nederland en het Caribisch gebied"
                    : lang === "es" ? "Utilizado por salones en los Países Bajos y el Caribe"
                    : "Used by salons in the Netherlands and the Caribbean"}
                </div>
              </HeroEnter>
            </div>
            <HeroEnter ready={heroReady} delay={460}>
              <ParallaxLayer speed={-0.035}>
                {/* Telefoon vrijstaand en rechtop, zoals op de andere versies —
                    geen sokkelpaneel, geen rotatie (feedback 27-08). */}
                <HeroPhoneMockup lang={lang} c={P} accent={MUSHROOM} />
                <div style={{ textAlign: "center", marginTop: 2 }}>
                  <button onClick={() => navigate("/bloomstudio")}
                    style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: INK, borderBottom: `1px solid ${EARTH}`, padding: "6px 2px" }}>
                    {lang === "nl" ? "Bekijk een live voorbeeldpagina →" : lang === "es" ? "Ver una página de ejemplo en vivo →" : "See a live example page →"}
                  </button>
                </div>
              </ParallaxLayer>
            </HeroEnter>
          </div>
        </div>

        {/* ── MARQUEE — espresso-woorden op de putty-band, zelfde kleur als de
              trial-knop (feedback 27-08; outline-versie verworpen). ── */}
        <div style={{ position: "relative", zIndex: 10, margin: "14px 0 0", background: PUTTY }}>
          <Marquee items={marqueeWords} c={{ ...P, textSub: ESPRESSO, border: `${EARTH}3d` }} accent={EARTH} />
        </div>

        {/* ── 01 · SALON VINDEN — op bone. ── */}
        <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(50px, 8vw, 84px) ${pad} 8px`, position: "relative", zIndex: 10 }}>
          <AtHead title={t.findSalonTitle} sub={t.findSalonSub} />
        </div>
        <SalonFinder lang={lang} t={t} c={P} goToSlug={goToSlug} navigate={navigate} hideHeader accent={EARTH} />

        {/* ── 02 · DE REKENSOM — de rijke earth-band; de rekentool zelf staat
              in een bone-paneel zodat de kleine cijfers leesbaar blijven. ── */}
        <div style={{ background: EARTH, position: "relative", zIndex: 10, marginTop: "clamp(36px, 6vw, 60px)" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 90% at 85% 0%, ${MUSHROOM}33 0%, transparent 60%)`, pointerEvents: "none" }} />
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}`, position: "relative" }}>
            <AtHead title={t.calcTitle} tone="earth" />
            <Reveal>
              <div style={{ maxWidth: 700, margin: "0 auto", background: P.bgCard, border: `1px solid ${PUTTY}`, borderRadius: 24, padding: "26px clamp(20px, 4vw, 36px) 30px", boxShadow: "0 26px 60px -34px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize: 12.5, color: P.textLabel, lineHeight: 1.6, marginBottom: 20, maxWidth: 520 }}>{t.calcSub}</div>
                <SavingsCalculator lang={lang} t={t} c={P} accent={EARTH} />
              </div>
            </Reveal>
          </div>
        </div>

        {/* ── 03 · HOE HET WERKT — terug op bone, redactionele rijen. ── */}
        <div id="how-it-works" style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(50px, 8vw, 84px) ${pad} 0`, position: "relative", zIndex: 10 }}>
          <AtHead title={t.liveIn3} />
          <div>
            {steps.map((s, i) => (
              <Reveal key={i} delay={i * 110}>
                <div className="at-step" style={{ display: "grid", gridTemplateColumns: "clamp(64px, 10vw, 120px) 1fr", gap: "clamp(14px, 3vw, 34px)", alignItems: "start", padding: "clamp(20px, 3.4vw, 34px) 8px", borderBottom: `1px solid ${PUTTY}`, borderRadius: 10 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(40px, 6.4vw, 72px)", fontWeight: 300, color: MUSHROOM, lineHeight: 0.9 }}>{s.n}</div>
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(21px, 3vw, 28px)", fontWeight: 400, color: INK, marginBottom: 8 }}>{s.title}</div>
                    <div style={{ fontSize: 13.5, color: P.textLabel, lineHeight: 1.75, maxWidth: 560 }}>{s.desc}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ── 04 · ALLES WAT JE NODIG HEBT — putty-band, tweekoloms checklijst.
              Putty is licht genoeg voor espresso-tekst er direct op. ── */}
        <div style={{ background: PUTTY, position: "relative", zIndex: 10, marginTop: "clamp(44px, 7vw, 76px)" }}>
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}` }}>
            <AtHead title={t.everythingNeeded} tone="putty" />
            <div className="at-feat-grid">
              {feats.map((f, i) => {
                const [title, desc] = featOf(f);
                return (
                  <Reveal key={i} delay={(i % 2) * 70 + Math.floor(i / 2) * 60}>
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "20px 4px", borderBottom: `1px solid ${EARTH}3d` }}>
                      <span aria-hidden="true" style={{ color: EARTH, fontSize: 11, lineHeight: "22px" }}>◆</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4, letterSpacing: "0.01em" }}>{title}</div>
                        <div style={{ fontSize: 12.5, color: "#5f5240", lineHeight: 1.65 }}>{desc}</div>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 05 · PRIJZEN — Starter op bone, Professional in espresso. ── */}
        <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(50px, 8vw, 84px) ${pad} 0`, position: "relative", zIndex: 10 }}>
          <AtHead title={t.simplePricing} />
          <Reveal delay={90}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
              <div role="radiogroup" aria-label={t.simplePricing} style={{ display: "inline-flex", background: P.bgCard, border: `1px solid ${PUTTY}`, borderRadius: 100, padding: 4 }}>
                {[{ key: "monthly", label: t.billingMonthly }, { key: "yearly", label: t.billingYearly }].map(opt => {
                  const active = billingCycle === opt.key;
                  return (
                    <button key={opt.key} role="radio" aria-checked={active} onClick={() => setBillingCycle(opt.key)}
                      style={{ padding: "9px 20px", borderRadius: 100, border: "none", background: active ? INK : "transparent", color: active ? BONE : P.textSub, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Jost',sans-serif", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 8 }}>
                      {opt.label}
                      {opt.key === "yearly" && (
                        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 100, background: active ? PUTTY : `${EARTH}26`, color: active ? INK : EARTH }}>
                          {t.twoMonthsFree}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Reveal>
          <div className="at-price-grid">
            {plans.map((plan, i) => {
              const yearlyTotal = plan.price * 10;
              const displayPrice = billingCycle === "yearly" ? yearlyTotal : plan.price;
              const displaySuffix = billingCycle === "yearly" ? t.perYear : t.perMonth;
              const dark = plan.popular;
              return (
                <Reveal key={i} delay={i * 130}>
                  <div className="vl-glow" onMouseMove={glowMove} style={{ background: dark ? INK : P.bgCard, color: dark ? BONE : INK, border: `1px solid ${dark ? INK : PUTTY}`, borderRadius: 26, padding: "36px 30px", position: "relative", height: "100%", boxSizing: "border-box" }}>
                    {dark && (
                      <div style={{ position: "absolute", top: 22, right: 24, fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: INK, background: PUTTY, borderRadius: 100, padding: "5px 12px" }}>
                        {t.popular}
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 18, color: dark ? MUSHROOM : P.textLabel }}>{plan.name}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 56, fontWeight: 300, color: dark ? PUTTY : INK, lineHeight: 1 }}>
                      €<TweenedNumber value={displayPrice} format={(n) => Math.round(n)} /><span style={{ fontSize: 16, color: dark ? `${BONE}88` : EARTH, fontFamily: "'Jost',sans-serif" }}>{displaySuffix}</span>
                    </div>
                    {billingCycle === "yearly" && (
                      <div style={{ fontSize: 11, marginTop: 6, color: dark ? `${BONE}99` : P.textSub }}>
                        {t.yearlyEquivalent.replace("{m}", (yearlyTotal / 12).toFixed(2).replace(".", ","))} · <span style={{ color: dark ? MUSHROOM : EARTH }}>{t.twoMonthsFree}</span>
                      </div>
                    )}
                    <div style={{ height: 1, background: dark ? `${BONE}22` : PUTTY, margin: "22px 0" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
                      {(lang === "nl" ? plan.features.nl : plan.features.en).map((f, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: dark ? `${BONE}dd` : P.textSub }}>
                          <NavIcon name="check" size={13} color={dark ? MUSHROOM : EARTH} />{f}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => navigate("/owner")}
                      style={{ width: "100%", padding: "15px 20px", borderRadius: 100, border: `1px solid ${dark ? PUTTY : INK}`, background: dark ? PUTTY : "transparent", color: INK, fontFamily: "'Jost',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>
                      {t.getStarted}
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: P.textLabel, marginTop: 16, lineHeight: 1.6, maxWidth: 560, marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>
            {lang === "nl"
              ? "Alle prijzen in euro's, incl. btw. Betaal je van buiten de eurozone? Je kaart rekent automatisch om."
              : "All prices in euros, incl. VAT. Paying from outside the eurozone? Your card converts automatically."}
          </div>
        </div>

        {/* ── 06 · FAQ — mushroom-band; loopt direct door in de finale. Tekst
              hier in verdiept espresso (ESPRESSO_DEEP) voor AA-contrast. ── */}
        <div style={{ background: MUSHROOM, position: "relative", zIndex: 10, marginTop: "clamp(44px, 7vw, 76px)" }}>
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}` }}>
          <AtHead title={t.faqTitle} tone="mushroom" />
          <Reveal delay={80}>
            <div style={{ maxWidth: 760, margin: "0 auto" }}>
              {faqs.map(([q, a], i) => (
                <div key={i} style={{ borderBottom: `1px solid ${ESPRESSO_DEEP}30` }}>
                  <div role="button" tabIndex={0} aria-expanded={faqOpen === i} onClick={() => setFaqOpen(faqOpen === i ? null : i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFaqOpen(faqOpen === i ? null : i); } }} style={{ padding: "20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, cursor: "pointer" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(17px, 2.4vw, 21px)", fontWeight: 400, color: ESPRESSO_DEEP }}>{q}</div>
                    <div style={{ fontSize: 20, color: ESPRESSO_DEEP, transition: "transform 0.25s ease", transform: faqOpen === i ? "rotate(45deg)" : "none", flexShrink: 0 }}>+</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateRows: faqOpen === i ? "1fr" : "0fr", transition: "grid-template-rows 0.4s cubic-bezier(0.22, 1, 0.36, 1)" }}>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ paddingBottom: 20, fontSize: 13.5, color: ESPRESSO_DEEP, lineHeight: 1.75, maxWidth: 620 }}>{a}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, flexWrap: "wrap", padding: "26px 0 0", fontSize: 13, maxWidth: 760, margin: "0 auto", color: ESPRESSO_DEEP }}>
              <span>{lang === "nl" ? "Nog vragen? Stel ze in de chat linksonder, of mail ons —" : lang === "es" ? "¿Aún tienes preguntas? Pregunta en el chat abajo a la izquierda, o escríbenos —" : "Still have questions? Ask in the chat bottom-left, or email us —"}</span>
              <a href="mailto:mirahventures@vellu.cc" style={{ color: ESPRESSO_DEEP, borderBottom: `1px solid ${ESPRESSO_DEEP}`, textDecoration: "none" }}>mirahventures@vellu.cc</a>
              <button className="btn-ghost" style={{ fontSize: 10, padding: "9px 18px", borderColor: ESPRESSO_DEEP, color: ESPRESSO_DEEP }} onClick={() => navigate("/contact")}>
                {lang === "nl" ? "Neem contact op" : lang === "es" ? "Contáctanos" : "Contact us"}
              </button>
            </div>
          </Reveal>
          </div>
        </div>

        {/* ── FINALE — espresso-vlak, sluit direct aan op de putty-band. ── */}
        <div style={{ background: INK, position: "relative", zIndex: 10 }}>
          <div aria-hidden="true" style={{ position: "absolute", top: "-30%", right: "6%", width: "40%", height: "80%", background: `radial-gradient(ellipse at center, ${EARTH}55 0%, transparent 65%)`, pointerEvents: "none" }} />
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(64px, 10vw, 110px) ${pad}`, textAlign: "center", position: "relative" }}>
            <Reveal>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(32px, 6vw, 54px)", fontWeight: 300, color: BONE, lineHeight: 1.12, marginBottom: 16 }}>
                {t.ctaTitle}
              </div>
            </Reveal>
            <Reveal delay={110}>
              <p style={{ fontSize: 14, color: MUSHROOM, marginBottom: 34, lineHeight: 1.7 }}>{t.ctaSub}</p>
            </Reveal>
            <Reveal delay={200}>
              <button onClick={() => navigate("/owner")}
                style={{ padding: "18px 46px", borderRadius: 100, border: "none", background: BONE, color: INK, fontFamily: "'Jost',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", boxShadow: "0 18px 44px -18px rgba(0,0,0,0.55)" }}>
                {t.startFree}
              </button>
            </Reveal>
          </div>
          {/* Footer op het espresso-vlak — zelfde juridische regels als altijd. */}
          <footer style={{ borderTop: `1px solid ${BONE}22`, position: "relative" }}>
            <div style={{ maxWidth: maxW, margin: "0 auto", padding: `22px ${pad} 30px`, display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: MUSHROOM, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px", letterSpacing: "0.04em" }}>
                <a href="https://mirahventures.com" target="_blank" rel="noopener noreferrer" style={{ color: MUSHROOM, textDecoration: "none" }}>Mirah Ventures</a>
                <span>·</span>
                <span>KVK 42045867</span>
                <span>·</span>
                <span>BTW NL005453873B29</span>
              </div>
              <div style={{ fontSize: 11, color: MUSHROOM, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px" }}>
                <span>© {new Date().getFullYear()} vellu</span>
                <a href="/privacy" style={{ color: PUTTY, textDecoration: "none", borderBottom: `1px solid ${BONE}33` }}>Privacy</a>
                <a href="/terms" style={{ color: PUTTY, textDecoration: "none", borderBottom: `1px solid ${BONE}33` }}>{t.terms}</a>
                <a href="/dpa" style={{ color: PUTTY, textDecoration: "none", borderBottom: `1px solid ${BONE}33` }}>{t.dpa}</a>
                <a href="/contact" style={{ color: PUTTY, textDecoration: "none", borderBottom: `1px solid ${BONE}33` }}>Contact</a>
              </div>
            </div>
          </footer>
        </div>

        <StickyStartPill onClick={() => navigate("/owner")} label={t.startFree} bg={INK} fg={BONE} />
        <SupportChat
          lang={lang}
          c={P}
          accent={ESPRESSO}
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

export { LandingScreen };
export default LandingScreen;
