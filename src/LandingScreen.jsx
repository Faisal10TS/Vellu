import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import {
  useTheme, useSEO, ACCENT, T, Layout, NavIcon, LangToggle, ThemeToggle, Header
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
  ] : [
    ["What is Vellu exactly?", "Vellu gives you your own booking page at vellu.cc/your-name. Clients book directly with you, no middleman. You manage everything from your dashboard."],
    ["Who is Vellu for?", "For independent beauty professionals: nail techs, lash artists, brow specialists, hairdressers, and beauty salons. Whether you work solo or have a team."],
    ["How much does it cost?", "Starter is €19/month, Professional €39/month. Fixed price, 0% commission per booking. No hidden fees."],
    ["Why no commission?", "We believe your revenue is yours. You pay a fixed monthly fee and keep 100% of every booking."],
    ["Can I try it first?", "Yes, you can set up your page for free and configure everything. You only pay when you want to go live."],
    ["Can my staff manage their own agenda?", "Yes! With the Professional plan, each staff member gets their own login. They only see their own appointments and manage their own services and hours."],
    ["Do clients receive reminders?", "Yes, automatically. Confirmation when booking, reminder 24 hours before, and a follow-up after the visit for a review."],
    ["How do clients cancel?", "Via the cancellation link in their confirmation email. You decide the cancellation deadline."],
  ];

  return (
    <Layout>
      <div style={{ 
        background: c.bg, 
        minHeight: "100dvh", 
        fontFamily: "'Jost',sans-serif", 
        color: c.text,
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Ambient glow */}
        <div style={{ position: "absolute", top: "-20%", left: "20%", width: "60%", height: "60%", background: `radial-gradient(ellipse at center, ${ACCENT}0a 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "-10%", width: "40%", height: "40%", background: `radial-gradient(ellipse at center, ${ACCENT}06 0%, transparent 60%)`, pointerEvents: "none" }} />

        {/* Navigation */}
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 32px", position: "relative", zIndex: 10, maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 26, fontWeight: 300, letterSpacing: "0.18em" }}>vellu</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ThemeToggle />
            <LangToggle lang={lang} setLang={setLang} />
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => navigate("/owner")}>
              <NavIcon name="crown" size={12} color={ACCENT} /> {t.signIn}
            </button>
          </div>
        </nav>

        {/* ─── HERO ─── */}
        <div style={{ padding: "80px 24px 60px", textAlign: "center", position: "relative", zIndex: 10, maxWidth: 700, margin: "0 auto" }}>
          <div className="fade-up">
            <div style={{ display: "inline-block", background: `${ACCENT}15`, border: `1px solid ${ACCENT}33`, borderRadius: 100, padding: "6px 18px", fontSize: 11, fontWeight: 500, color: ACCENT, letterSpacing: "0.04em", marginBottom: 28 }}>
              <NavIcon name="sparkle" size={11} color={ACCENT} /> {t.heroTag}
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(44px, 9vw, 72px)", fontWeight: 300, letterSpacing: "0.06em", lineHeight: 1.05, marginBottom: 24 }}>
              {t.heroTitle}
              <br />
              <span style={{ color: ACCENT }}>{t.heroBrand}</span>
            </h1>
            <p style={{ fontSize: "clamp(14px, 2vw, 17px)", color: c.textSub, lineHeight: 1.7, maxWidth: 480, margin: "0 auto 40px", letterSpacing: "0.01em" }}>
              {t.heroSub}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" style={{ width: "auto", padding: "16px 36px", fontSize: 13 }} onClick={() => navigate("/owner")}>
                {t.startFree}
              </button>
              <button className="btn-ghost" style={{ width: "auto", padding: "16px 28px", fontSize: 13, color: c.textSub }} onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                {t.howItWork}
              </button>
            </div>
          </div>
        </div>

        {/* ─── SOCIAL PROOF ─── */}
        <div style={{ padding: "20px 24px 60px", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap", opacity: 0.6 }}>
            {[
              { num: "0%", nl: "Commissie", en: "Commission" },
              { num: "24/7", nl: "Online beschikbaar", en: "Available online" },
              { num: "€19", nl: "Vast per maand", en: "Fixed per month" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: ACCENT }}>{s.num}</div>
                <div style={{ fontSize: 10, color: c.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{lang === "nl" ? s.nl : s.en}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── SEARCH BOX ─── */}
        <div style={{ padding: "0 24px 60px", position: "relative", zIndex: 10 }}>
          <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 24, padding: "28px 28px", maxWidth: 440, margin: "0 auto" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textMuted, marginBottom: 10 }}>
              {t.searchLabel}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: c.textMuted, pointerEvents: "none" }}>vellu.cc/</div>
                <input className="input-field" placeholder={lang === "nl" ? "salon-naam" : "salon-name"} value={slugInput} onChange={e => setSlugInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && goToSlug(slugInput)} style={{ paddingLeft: 85, borderRadius: 12 }} />
              </div>
              <button className="btn-primary" style={{ width: "auto", padding: "14px 24px", flexShrink: 0 }} onClick={() => goToSlug(slugInput)}>→</button>
            </div>
          </div>
        </div>

        {/* ─── HOW IT WORKS ─── */}
        <div id="how-it-works" style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
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
          </div>
        </div>

        {/* ─── FEATURES ─── */}
        <div style={{ padding: "40px 24px 60px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {t.everythingNeeded}
              </h2>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              {[
                { icon: "calendar", nl: "Eigen boekingspagina", en: "Your own booking page", sub: { nl: "vellu.cc/jouw-naam — jouw merk, jouw link", en: "vellu.cc/your-name — your brand, your link" } },
                { icon: "team", nl: "Team accounts", en: "Team accounts", sub: { nl: "Elke medewerker een eigen login, agenda en diensten", en: "Each staff member gets their own login, schedule and services" } },
                { icon: "mail", nl: "Automatische emails", en: "Automatic emails", sub: { nl: "Bevestigingen, herinneringen en follow-ups", en: "Confirmations, reminders and follow-ups" } },
                { icon: "chart", nl: "0% commissie", en: "0% commission", sub: { nl: "Vast maandtarief. Geen verborgen kosten, geen commissie per boeking", en: "Fixed monthly price. No hidden fees, no commission per booking" } },
                { icon: "star2", nl: "Reviews", en: "Reviews", sub: { nl: "Automatisch reviews verzamelen na bezoek", en: "Automatically collect reviews after visits" } },
                { icon: "palette", nl: "Eigen branding", en: "Custom branding", sub: { nl: "Jouw logo, kleuren en stijl", en: "Your logo, colors and style" } },
                { icon: "camera", nl: "Portfolio", en: "Portfolio", sub: { nl: "Foto's per behandeling tonen", en: "Show photos per treatment" } },
                { icon: "tag", nl: "Kortingscodes", en: "Discount codes", sub: { nl: "Maak en deel korting met je klanten", en: "Create and share discounts with clients" } },
              ].map((f, i) => (
                <div key={i} style={{ padding: "20px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 18 }}>
                  <NavIcon name={f.icon} size={24} color={ACCENT} />
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{lang === "nl" ? f.nl : f.en}</div>
                  <div style={{ fontSize: 11, color: c.textLabel, lineHeight: 1.5 }}>{lang === "nl" ? f.sub.nl : f.sub.en}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── TESTIMONIALS ─── */}
        <div style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {t.whatUsersSay}
              </h2>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {(lang === "nl" ? [
                { name: "Yasmin El Amrani", role: "Nail Tech · Amsterdam", text: "Eindelijk een boekingssysteem zonder commissie. Mijn klanten boeken nu 24/7 en ik heb alles op één plek. Super blij mee!", rating: 5 },
                { name: "Sophie de Vries", role: "Lash Artist · Utrecht", text: "De automatische herinneringen hebben mijn no-shows met 80% verminderd. En het ziet er zo professioneel uit — klanten zijn onder de indruk.", rating: 5 },
                { name: "Fatima Benali", role: "Kapsalon · Rotterdam", text: "We zijn overgestapt van Treatwell en besparen nu honderden euro's per maand. Het team account werkt perfect voor ons salon met 4 medewerkers.", rating: 5 },
              ] : [
                { name: "Yasmin El Amrani", role: "Nail Tech · Amsterdam", text: "Finally a booking system without commission. My clients book 24/7 and I have everything in one place. Super happy with it!", rating: 5 },
                { name: "Sophie de Vries", role: "Lash Artist · Utrecht", text: "The automatic reminders reduced my no-shows by 80%. And it looks so professional — clients are impressed.", rating: 5 },
                { name: "Fatima Benali", role: "Hair Salon · Rotterdam", text: "We switched from Treatwell and now save hundreds of euros per month. The team account works perfectly for our salon with 4 staff members.", rating: 5 },
              ]).map((review, i) => (
                <div key={i} style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "24px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[1,2,3,4,5].map(s => (
                      <svg key={s} width={14} height={14} viewBox="0 0 20 20" fill={s <= review.rating ? "#f5c518" : c.inputBg}>
                        <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 13.28l-4.77 2.43.91-5.32L2.27 6.62l5.34-.78L10 1z" />
                      </svg>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, flex: 1 }}>"{review.text}"</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{review.name}</div>
                    <div style={{ fontSize: 11, color: c.textLabel }}>{review.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── PRICING ─── */}
        <div style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
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
                { name: "Starter", price: 19, popular: false, features: { nl: ["Online boekingen", "Email bevestigingen", "24u herinneringen", "Reviews systeem", "Tot 3 medewerkers"], en: ["Online bookings", "Email confirmations", "24h reminders", "Reviews system", "Up to 3 staff members"] } },
                { name: "Professional", price: 39, popular: true, features: { nl: ["Alles van Starter +", "Onbeperkt medewerkers", "Team accounts (eigen login)", "Analytics dashboard", "Eigen branding & logo", "Kortingscodes", "Prioriteit support"], en: ["Everything in Starter +", "Unlimited staff members", "Team accounts (own login)", "Analytics dashboard", "Custom branding & logo", "Discount codes", "Priority support"] } },
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
                      <div style={{ fontSize: 11, color: ACCENT, marginTop: 4, fontWeight: 500 }}>
                        {t.twoMonthsFree}
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
          </div>
        </div>

        {/* ─── FAQ ─── */}
        <div style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
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
          </div>
        </div>

        {/* ─── FINAL CTA ─── */}
        <div style={{ padding: "60px 24px 80px", textAlign: "center", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 600, margin: "0 auto", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 28, padding: "48px 32px" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(26px, 5vw, 36px)", fontWeight: 300, marginBottom: 12 }}>
              {t.ctaTitle}
            </div>
            <p style={{ fontSize: 14, color: c.textLabel, marginBottom: 28, lineHeight: 1.6 }}>
              {t.ctaSub}
            </p>
            <button className="btn-primary" style={{ width: "auto", padding: "16px 44px", fontSize: 14 }} onClick={() => navigate("/owner")}>
              {t.startFree}
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ padding: "24px 32px", textAlign: "center", borderTop: "1px solid " + c.border, position: "relative", zIndex: 10 }}>
          <div style={{ fontSize: 11, color: c.textMuted, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px" }}>
            <span>© {new Date().getFullYear()} vellu</span>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>Privacy</a>
            <a href="/terms" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{t.terms}</a>
            <a href="/dpa" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{t.dpa}</a>
            <a href="/contact" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>Contact</a>
          </div>
        </footer>
      </div>
    </Layout>
  );
}

// ─── OWNER AUTH ───────────────────────────────────────────────
function OwnerAuth({ onLogin, onBack, lang, setLang }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ email: "", password: "", businessName: "", slug: "", city: "", accountType: "joint" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleReset = async () => {
    if (!form.email) { setError(t.fillEmail); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: "https://vellu.cc/owner" });
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
      // Also upsert directly in case trigger doesn't fire
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: form.email,
        business_name: form.businessName,
        slug: slug,
        city: form.city || "Nederland",
        accent_color: "#c9a96e",
        account_type: form.accountType || "joint"
      });
      onLogin({ name: form.businessName, email: form.email, slug, city: form.city || "Nederland", id: data.user.id, plan: null, plan_expires_at: null, account_type: form.accountType });
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) { setError(t.wrongCredentials); setLoading(false); return; }
      // Load profile
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
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

        {/* Back button */}
        <div style={{ position: "absolute", top: 32, left: 32 }}>
          <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }} onClick={onBack}>← {t.back}</button>
        </div>
        
        {/* Lang toggle */}
        <div style={{ position: "absolute", top: 32, right: 32, display: "flex", alignItems: "center", gap: 8 }}>
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

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {mode === "signup" && <>
                <input className="input-field" placeholder={t.businessNameField} value={form.businessName} onChange={e => setForm(f => ({...f, businessName: e.target.value}))} />
                <input className="input-field" placeholder={t.city} value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 17, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: c.textLabel, fontFamily: "'Jost',sans-serif", pointerEvents: "none" }}>vellu.cc/</div>
                  <input className="input-field" placeholder={lang === "nl" ? "jouw-salon-naam" : "your-salon-name"} value={form.slug} onChange={e => setForm(f => ({...f, slug: e.target.value.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")}))} style={{ paddingLeft: 85 }} />
                </div>
                {/* Account type */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.accountType}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["joint", "user", t.jointAccount, t.jointDesc], ["team", "team", t.teamAccount, t.teamDesc]].map(([type, icon, label, desc]) => (
                      <div key={type} onClick={() => setForm(f => ({...f, accountType: type}))} style={{
                        flex: 1, padding: "14px 12px", borderRadius: 14, cursor: "pointer", textAlign: "center", transition: "all 0.2s",
                        background: form.accountType === type ? `${ACCENT}12` : c.inputBg,
                        border: `1.5px solid ${form.accountType === type ? ACCENT : c.inputBorder}`
                      }}>
                        <div style={{ marginBottom: 4 }}><NavIcon name={icon} size={20} color={form.accountType === type ? ACCENT : c.textSub} /></div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: form.accountType === type ? ACCENT : c.text }}>{label}</div>
                        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 3, lineHeight: 1.3 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>}
              <input className="input-field" placeholder={t.emailField} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              <input className="input-field" placeholder={t.passwordField} type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
            </div>
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
