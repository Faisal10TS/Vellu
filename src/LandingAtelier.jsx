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
import { supabase } from "./supabase.js";
import { useSEO, T, Layout, NavIcon, AT, AT_COLORS, AT_RADIUS, rememberRef, useReferralPromo, rewardLabel, promoEndLabel, planMatrix } from "./shared.jsx";
import {
  SalonFinder, StickyStartPill, ArrowIcon,
  Reveal, KineticLine, HeroEnter, Marquee, TweenedNumber,
  ParallaxLayer, CursorRing, ScrollProgress, glowMove,
} from "./LandingScreen.jsx";

// Eén bron van waarheid: het palet leeft in shared.jsx (AT/AT_COLORS), zodat
// de login-, wachtwoord- en planschermen exact dezelfde huid dragen.
const { ESPRESSO, EARTH, MUSHROOM, PUTTY, BONE } = AT;
const INK = ESPRESSO;
const ESPRESSO_DEEP = AT.DEEP;
const P = AT_COLORS;

// Nieuwe hero-telefoon (11-11-2026, homepage-review: "de hero toont de
// backoffice, niet het resultaat"). In de telefoon staat nu de boekingspagina
// die de klant van de salon ziet (de demosalon Bloom Studio, zelfde diensten
// en prijzen als vellu.cc/bloomstudio, waar de link eronder heen gaat), met
// eromheen drie kaartjes van wat Vellu vanzelf doet: een nieuwe boeking, de
// herinnering, de factuur. Alles is HTML in plaats van screenshots: scherp op
// elk scherm, geen afbeeldingen om te laden (de oude telefoon draaide zeven
// JPG's rond, met een chatknop die in de screenshot zelf zat), en per taal.
// De pagina wordt op echte maat (390 px breed) opgebouwd en daarna verkleind,
// zodat de verhoudingen kloppen met de echte boekingspagina. Geen sterren of
// reviewcijfers: dat zouden verzonnen cijfers zijn.
const HERO_SCREEN_W = 390, HERO_SCREEN_H = 848, HERO_PHONE_INNER = 254;
function AtHeroPhone({ lang, ready }) {
  const L = (nl, en, es) => (lang === "nl" ? nl : lang === "es" ? es : en);
  const services = [
    { icon: "sparkle", name: L("Gel manicure", "Gel manicure", "Manicura en gel"), min: 45, price: "€38,00" },
    { icon: "diamond", name: L("BIAB nieuwe set", "BIAB new set", "BIAB set nuevo"), min: 75, price: "€52,00" },
    { icon: "eye", name: "Lash lift", min: 60, price: "€49,00" },
    { icon: "star2", name: L("Brow shaping", "Brow shaping", "Diseño de cejas"), min: 20, price: "€18,00" },
  ];
  const book = L("Boek", "Book", "Reservar");
  const scale = HERO_PHONE_INNER / HERO_SCREEN_W;
  const notes = [
    { cls: "n1", icon: "calendar", title: L("Nieuwe boeking", "New booking", "Nueva reserva"), sub: L("Naomi · BIAB nieuwe set", "Naomi · BIAB new set", "Naomi · BIAB set nuevo"), meta: L("do 14:30", "Thu 14:30", "jue 14:30"), delay: 900 },
    { cls: "n2", icon: "send", title: L("Herinnering verstuurd", "Reminder sent", "Recordatorio enviado"), sub: L("Sophie · morgen 10:00", "Sophie · tomorrow 10:00", "Sophie · mañana 10:00"), meta: L("automatisch", "automatic", "automático"), delay: 1150 },
    { cls: "n3", icon: "facturen", title: L("Factuur verstuurd", "Invoice sent", "Factura enviada"), sub: L("Naomi · €52,00", "Naomi · €52,00", "Naomi · €52,00"), meta: L("na afrekenen", "at checkout", "al cobrar"), delay: 1400 },
  ];
  return (
    <div className="at-hero-phone" style={{ position: "relative", display: "flex", justifyContent: "center", padding: "14px 0 18px" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: "-12% -8%", background: `radial-gradient(56% 50% at 50% 44%, ${MUSHROOM}40 0%, transparent 64%)`, pointerEvents: "none" }} />
      {/* Toestel */}
      <div style={{ position: "relative", width: HERO_PHONE_INNER + 22, borderRadius: 50, padding: 11, background: "linear-gradient(140deg, #6a6a72 0%, #23232a 22%, #0e0e11 58%, #4a4a53 100%)", boxShadow: `0 52px 92px -30px rgba(40,30,20,0.7), 0 0 84px -20px ${MUSHROOM}66, inset 0 1.6px 0 rgba(255,255,255,0.22), inset 0 -1.4px 2px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.10)` }}>
        <div aria-hidden="true" style={{ position: "absolute", left: -2, top: 116, width: 3, height: 24, borderRadius: 3, background: "linear-gradient(#2b2b30, #111)" }} />
        <div aria-hidden="true" style={{ position: "absolute", left: -2, top: 152, width: 3, height: 42, borderRadius: 3, background: "linear-gradient(#2b2b30, #111)" }} />
        <div aria-hidden="true" style={{ position: "absolute", right: -2, top: 176, width: 3, height: 62, borderRadius: 3, background: "linear-gradient(#2b2b30, #111)" }} />
        <div role="img" aria-label={L("Voorbeeld van een Vellu-boekingspagina", "Example of a Vellu booking page", "Ejemplo de una página de reservas de Vellu")}
          style={{ position: "relative", width: HERO_PHONE_INNER, height: HERO_SCREEN_H * scale, borderRadius: 39, overflow: "hidden", background: "#F7F4EF" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(153deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 20%, transparent 40%)", pointerEvents: "none", zIndex: 6 }} />
          {/* Boekingspagina op ware grootte, verkleind */}
          <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: HERO_SCREEN_W, height: HERO_SCREEN_H, transform: `scale(${scale})`, transformOrigin: "0 0", fontFamily: "'Jost',sans-serif", color: "#2B2420" }}>
            {/* Statusbalk */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 48, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 30px", zIndex: 3, color: BONE }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>9:41</span>
              <div style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 118, height: 34, borderRadius: 100, background: "#000" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>{[5, 8, 11, 14].map((h) => <span key={h} style={{ width: 3.5, height: h, borderRadius: 1, background: BONE }} />)}</div>
                <div style={{ width: 27, height: 13, borderRadius: 4, border: `1.5px solid ${BONE}aa`, padding: 2, boxSizing: "border-box" }}><div style={{ width: "72%", height: "100%", borderRadius: 2, background: BONE }} /></div>
              </div>
            </div>
            {/* Omslag */}
            <div style={{ position: "relative", height: 330, background: `radial-gradient(70% 60% at 78% 18%, ${MUSHROOM}88 0%, transparent 60%), radial-gradient(60% 70% at 10% 90%, #3E3226 0%, transparent 70%), linear-gradient(165deg, #B39C7C 0%, ${EARTH} 46%, ${ESPRESSO} 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 34, textAlign: "center", color: BONE }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 40, fontWeight: 400, letterSpacing: "0.01em" }}>Bloom Studio</div>
              <div style={{ fontSize: 13, letterSpacing: "0.26em", textTransform: "uppercase", opacity: 0.82, marginTop: 4 }}>Amsterdam</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, marginTop: 16, opacity: 0.95 }}>
                <NavIcon name="clock" size={14} color={BONE} />
                <span>{L("Eerstvolgend", "Next available", "Próxima disponibilidad")} <b style={{ fontWeight: 600 }}>{L("Vandaag 15:00", "Today 15:00", "Hoy 15:00")}</b></span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <span style={{ padding: "13px 22px", borderRadius: 9, background: BONE, color: ESPRESSO, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{book}</span>
                <span style={{ padding: "13px 18px", borderRadius: 9, border: `1px solid ${BONE}88`, color: BONE, fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 7 }}><NavIcon name="share" size={14} color={BONE} />{L("Delen", "Share", "Compartir")}</span>
              </div>
            </div>
            {/* Logo over de rand */}
            <div style={{ position: "absolute", top: 330 - 34, left: "50%", transform: "translateX(-50%)", width: 68, height: 68, borderRadius: "50%", background: "#FBF9F5", border: "3px solid #F7F4EF", boxShadow: "0 8px 18px -8px rgba(40,30,20,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond',serif", fontSize: 30, color: EARTH }}>B</div>
            {/* Behandelingen */}
            <div style={{ padding: "52px 22px 0" }}>
              <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 14 }}>{L("Behandelingen", "Services", "Servicios")}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14, whiteSpace: "nowrap" }}>
                {[L("Alle behandelingen", "All treatments", "Todos"), L("Nagels", "Nails", "Uñas"), "Brows & Lashes"].map((ch, i) => (
                  <span key={i} style={{ padding: "9px 14px", borderRadius: 9, fontSize: 13, fontWeight: i === 0 ? 600 : 500, background: i === 0 ? EARTH : "#FBF9F5", color: i === 0 ? BONE : "#4A3F33", border: i === 0 ? "none" : "1px solid #E3DCD0" }}>{ch}</span>
                ))}
              </div>
              {services.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 14px", marginBottom: 10, borderRadius: 13, background: "#F1ECE4", border: "1px solid #E3DCD0", boxShadow: "0 10px 18px -14px rgba(40,30,20,0.35)" }}>
                  <span style={{ width: 46, height: 46, borderRadius: 9, border: "1px solid #DCD3C5", background: "#F7F3EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><NavIcon name={s.icon} size={19} color={EARTH} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{s.name}</div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#6B5E4E", border: "1px solid #DCD3C5", borderRadius: 6, padding: "3px 8px" }}><NavIcon name="clock" size={11} color="#6B5E4E" />{s.min} min</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 19, marginBottom: 6 }}>{s.price}</div>
                    <span style={{ display: "inline-block", padding: "7px 12px", borderRadius: 7, background: EARTH, color: BONE, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{book}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Vaste boekknop onderaan */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 18px 26px", background: "linear-gradient(to top, #F7F4EF 70%, rgba(247,244,239,0))" }}>
              <div style={{ height: 52, borderRadius: 12, background: EARTH, color: BONE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{book}</div>
            </div>
          </div>
        </div>
      </div>
      {/* Wat Vellu vanzelf doet */}
      {notes.map((n) => (
        <div key={n.cls} className={`at-hero-note ${n.cls}`} data-hero-note
          style={{ opacity: ready ? 1 : 0, transform: ready ? "none" : "translateY(12px)", transition: `opacity 0.7s ease ${n.delay}ms, transform 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${n.delay}ms` }}>
          <div className="at-hero-note-card">
            <span className="at-hero-note-ico"><NavIcon name={n.icon} size={15} color={EARTH} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="at-hero-note-head">
                <span className="at-hero-note-title">{n.title}</span>
                <span className="at-hero-note-meta">{n.meta}</span>
              </span>
              <span className="at-hero-note-sub">{n.sub}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Plannen vergelijken (11-11-2026, Faisal: "can u also add a feature where u
// can compare the both of them"). Knop onder de prijskaarten; open = tabel per
// groep met Starter en Professional naast elkaar. De inhoud komt uit
// planMatrix (shared.jsx), dezelfde bron als de planvergelijking in de app,
// zodat landingspagina en app nooit iets anders beloven. De kopregel blijft
// onder de navigatiebalk hangen tijdens het scrollen (geen overflow:hidden op
// de kaart, anders werkt sticky niet).
function AtPlanCompare({ lang, yearly }) {
  const [open, setOpen] = useState(false);
  const L = (nl, en, es) => (lang === "nl" ? nl : lang === "es" ? es : en);
  const groups = planMatrix(lang);
  // Bedrag groot, "/maand" klein eronder-ernaast: op de telefoon paste
  // "€19/maand" in serif niet in een kolom van 70 px.
  const price = (m) => (
    <span className="at-cmp-price" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: EARTH }}>
      €{yearly ? m * 10 : m}<span style={{ fontFamily: "'Jost',sans-serif", fontSize: 10.5, color: P.textLabel }}>{yearly ? L("/jaar", "/year", "/año") : L("/maand", "/month", "/mes")}</span>
    </span>
  );
  const cell = (v, dark) => {
    if (v === true) return <NavIcon name="check" size={15} color={dark ? INK : EARTH} />;
    if (v === false) return <span aria-label={L("niet inbegrepen", "not included", "no incluido")} style={{ display: "inline-block", width: 12, height: 1.5, background: `${EARTH}66`, verticalAlign: "middle" }} />;
    return <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{v}</span>;
  };
  return (
    <div style={{ maxWidth: 820, margin: "30px auto 0" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" data-plan-compare-toggle aria-expanded={open} onClick={() => setOpen((o) => !o)}
          style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 26px", borderRadius: AT_RADIUS, border: `1px solid ${INK}`, background: open ? INK : "transparent", color: open ? BONE : INK, fontFamily: "'Jost',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", transition: "background 0.2s, color 0.2s" }}>
          {open ? L("Vergelijking sluiten", "Close comparison", "Cerrar comparación") : L("Vergelijk Starter en Professional", "Compare Starter and Professional", "Compara Starter y Professional")}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transition: "transform 0.25s", transform: open ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      </div>
      {open && (
        <div data-plan-compare role="table" aria-label={L("Starter en Professional vergeleken", "Starter and Professional compared", "Starter y Professional comparados")}
          style={{ marginTop: 18, background: P.bgCard, border: `1px solid ${PUTTY}`, borderRadius: 20, boxShadow: "0 26px 46px -28px rgba(69,58,43,0.55), 0 2px 4px rgba(69,58,43,0.05)" }}>
          <div role="row" className="at-cmp-row at-cmp-head" style={{ position: "sticky", top: 63, zIndex: 2, background: P.bgCard, borderRadius: "20px 20px 0 0", borderBottom: `1px solid ${PUTTY}`, padding: "16px clamp(14px, 3vw, 26px)" }}>
            <div role="columnheader" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: P.textLabel }}>{L("Functie", "Feature", "Función")}</div>
            <div role="columnheader" style={{ textAlign: "center" }}>
              <div className="at-cmp-plan" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: INK }}>Starter</div>
              <div>{price(19)}</div>
            </div>
            <div role="columnheader" className="at-cmp-pro" style={{ textAlign: "center" }}>
              <div className="at-cmp-plan" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: INK }}>Professional</div>
              <div>{price(35)}</div>
            </div>
          </div>
          {groups.map((g, gi) => (
            <div key={gi} role="rowgroup">
              <div style={{ padding: "18px clamp(14px, 3vw, 26px) 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: EARTH }}>{g.group}</div>
              {g.rows.map(([label, starter, pro], ri) => {
                const last = gi === groups.length - 1 && ri === g.rows.length - 1;
                return (
                  <div key={ri} role="row" data-cmp-row className="at-cmp-row" style={{ padding: "10px clamp(14px, 3vw, 26px)", borderBottom: last ? "none" : `1px solid ${PUTTY}99` }}>
                    <div role="cell" style={{ fontSize: 13, color: P.textSub, lineHeight: 1.45, paddingRight: 10 }}>{label}</div>
                    <div role="cell" style={{ textAlign: "center" }}>{cell(starter)}</div>
                    <div role="cell" className="at-cmp-pro" style={{ textAlign: "center" }}>{cell(pro, true)}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

// Beoordeling door salons (Faisal 16-09-2026): gemiddelde en aantal uit
// app_rating_summary (de demo-salon telt niet mee), citaten uit
// public_app_ratings (alleen met toestemming van de salon én gepubliceerd
// door Vellu in het beheer). De regel in de hero verschijnt pas vanaf drie
// beoordelingen: met één of twee cijfers is een "gemiddelde" geen eerlijk
// beeld. Citaten verschijnen zodra er één gepubliceerd is.
// Het aantal zelf staat NIET in de regel (Faisals regel van 23-09: nooit
// tonen hoeveel salons Vellu gebruiken); alleen het gemiddelde.
const MIN_RATINGS = 3;
function StarRow({ value, size = 16, on = EARTH, off = MUSHROOM }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / 5) * 100));
  const stars = (col, fill) => [0, 1, 2, 3, 4].map((i) => (
    <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={fill ? col : "none"} stroke={col} strokeWidth="1.5" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
      <polygon points="12 2.5 15 8.6 21.7 9.5 16.8 14.2 18 20.9 12 17.7 6 20.9 7.2 14.2 2.3 9.5 9 8.6 12 2.5" />
    </svg>
  ));
  // Onder: vijf omtrekken; erover: vijf volle sterren, afgeknipt op het
  // percentage — zo klopt 4,6 ook optisch (geen afronding naar vijf).
  return (
    <span style={{ position: "relative", display: "inline-flex", gap: 2, lineHeight: 0 }} aria-hidden="true">
      <span style={{ display: "inline-flex", gap: 2 }}>{stars(off, false)}</span>
      <span style={{ position: "absolute", left: 0, top: 0, display: "inline-flex", gap: 2, overflow: "hidden", width: `${pct}%`, whiteSpace: "nowrap" }}>{stars(on, true)}</span>
    </span>
  );
}
function SalonRatingLine({ lang, sum }) {
  const n = Number(sum?.rating_count || 0);
  const avg = Number(sum?.avg_rating || 0);
  if (n < MIN_RATINGS || !avg) return null;
  const avgStr = lang === "en" ? avg.toFixed(1) : avg.toFixed(1).replace(".", ",");
  const rest = lang === "nl" ? " van 5 · beoordeeld door salons die Vellu gebruiken"
    : lang === "es" ? " de 5 · valorado por salones que usan Vellu"
    : " out of 5 · rated by salons using Vellu";
  return (
    // flex-wrap: op de telefoon springen de sterren op een eigen regel boven
    // de tekst, allebei gecentreerd, i.p.v. sterren links naast twee regels.
    <div data-hero-rating style={{ marginTop: 12, display: "inline-flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "6px 10px", fontSize: 12, color: INK, letterSpacing: "0.03em" }}>
      <StarRow value={avg} />
      <span><strong style={{ fontWeight: 600 }}>{avgStr}</strong>{rest}</span>
    </div>
  );
}
function SalonRatingQuotes({ lang, quotes }) {
  if (!quotes || quotes.length === 0) return null;
  const title = lang === "nl" ? "Wat salons zeggen" : lang === "es" ? "Lo que dicen los salones" : "What salons say";
  return (
    <div data-rating-quotes style={{ marginTop: "clamp(40px, 6vw, 64px)" }}>
      <Reveal>
        <div style={{ textAlign: "center", fontSize: 10, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: EARTH, marginBottom: 18 }}>{title}</div>
      </Reveal>
      <div className="at-quote-grid">
        {quotes.map((q, i) => (
          <Reveal key={q.owner_id} delay={i * 90}>
            <div className="at-quote-card vl-glow" data-quote-card onMouseMove={glowMove}>
              <StarRow value={q.rating} size={14} />
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 19, lineHeight: 1.35, color: INK, margin: "12px 0 14px" }}>“{q.liked}”</div>
              <div style={{ fontSize: 11, color: EARTH, letterSpacing: "0.08em", textTransform: "uppercase" }}>{q.business_name}{q.city ? ` · ${String(q.city).trim()}` : ""}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function LandingScreen({ onSelectSalon, onOwnerEnter, lang, setLang, salons = {} }) {
  const navigate = useNavigate();
  const t = T[lang];
  // Beoordelingen voor de regel in de hero en de citaten onder de stappen.
  // Eén keer laden; mislukt het, dan blijft de pagina gewoon zonder.
  const [ratings, setRatings] = useState({ sum: null, quotes: [] });
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const [s, q] = await Promise.all([
          supabase.rpc("app_rating_summary"),
          supabase.from("public_app_ratings").select("owner_id, rating, liked, business_name, city").order("updated_at", { ascending: false }).limit(3),
        ]);
        if (off) return;
        setRatings({ sum: s.data?.[0] || null, quotes: (q.data || []).filter((x) => x.liked && String(x.liked).trim()) });
      } catch { /* geen beoordelingen: pagina blijft zoals hij was */ }
    })();
    return () => { off = true; };
  }, []);
  // Uitnodiging (21-09-2026): wie via "Powered by Vellu" op een boekingspagina
  // of via een gedeelde link binnenkomt heeft ?ref=CODE. De balk bovenaan en
  // de code op de startknoppen horen ALLEEN bij zo'n bezoek (Faisal 21-09:
  // "i just typed the vellu link and now that is on top, thats not supposed to
  // be there"): wie later gewoon vellu.cc intypt ziet de normale homepage. De
  // code wordt wel stil onthouden (30 dagen, rememberRef), zodat hij op het
  // aanmeldformulier klaarstaat en de uitnodigende salon haar beloning krijgt.
  const [invite, setInvite] = useState(null); // { code, name }
  useEffect(() => {
    let code = "";
    try { code = rememberRef(new URLSearchParams(window.location.search).get("ref")); } catch { code = ""; }
    if (!code) return;
    setInvite({ code, name: "" });
    let off = false;
    (async () => {
      try {
        const { data } = await supabase.from("public_salons").select("business_name").eq("referral_code", code).maybeSingle();
        if (!off && data?.business_name) setInvite({ code, name: String(data.business_name).trim() });
      } catch { /* zonder naam werkt de code nog steeds */ }
    })();
    return () => { off = true; };
  }, []);
  // Elke start-knop (trial, prijzen, finale, zwevende knop, "Maak je pagina")
  // opent het REGISTRATIE-tabblad; alleen "Inloggen" in de balk gaat naar het
  // inlogtabblad (L3-03: alle trialknoppen kwamen op Inloggen uit).
  const ownerStart = () => navigate(invite?.code ? `/owner?ref=${encodeURIComponent(invite.code)}` : "/owner?signup=1");
  // Loopt er een referral-actie (bijv. 1 maand i.p.v. 2 weken), dan zegt de
  // balk dat, met de einddatum erbij.
  const refPromo = useReferralPromo();
  const refReward = rewardLabel(refPromo.days, lang);
  const refUntil = refPromo.promo ? promoEndLabel(refPromo.endsAt, lang) : "";
  useSEO({
    title: lang === "nl" ? "Vellu - Beauty Booking Platform | 0% Commissie" : lang === "es" ? "Vellu - Plataforma de reservas de belleza | 0% de comisión" : "Vellu - Beauty Booking Platform | 0% Commission",
    description: lang === "nl" ? "Je eigen boekingspagina met jouw naam, jouw kleuren en jouw diensten. Vast tarief, 0% commissie." : lang === "es" ? "Tu propia página de reservas con tu nombre, tus colores y tus servicios. Precio fijo, 0% de comisión." : "Your own booking page with your name, your colors and your services. Fixed price, 0% commission.",
    url: "https://vellu.cc/"
  });
  const [faqOpen, setFaqOpen] = useState(null);
  // Alle salons zoeken: klapt open onder de uitgelichte salons (11-11-2026);
  // de zoeker laadt pas dan (scheelt de omslagfoto's van alle salons).
  const [finderOpen, setFinderOpen] = useState(false);
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

  // Naar een sectie scrollen mét de plakkende balk verrekend. scrollIntoView
  // zette de sectietop onder de balk, en bij "Vind een salon" belandde je
  // zelfs voorbij de kop en het zoekveld, midden in de kaarten (Faisal 15-09).
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const navH = el.closest(".atelier")?.querySelector("nav")?.offsetHeight || 0;
    const top = el.getBoundingClientRect().top + window.scrollY - navH;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  // Alleen voor de salonzoeker (getypte salonlink): nieuw tabblad, net als de
  // salonkaarten (Faisal 11-11-2026).
  const goToSlug = (slug) => {
    let clean = slug.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^(www\.)?vellu\.cc\//, "");
    clean = clean.replace(/[^a-z0-9-]/g, "");
    if (!clean) return;
    window.open("/" + clean, "_blank", "noopener");
  };

  const marqueeWords = lang === "nl"
    ? ["Nagelstylistes", "Lash artists", "Brow studio's", "Kappers", "Barbers", "PMU-specialisten", "Huidtherapeuten", "Make-up artists"]
    : lang === "es"
      ? ["Manicuristas", "Artistas de pestañas", "Estudios de cejas", "Peluquerías", "Barberos", "Especialistas en PMU", "Esteticistas", "Maquilladoras"]
      : ["Nail artists", "Lash techs", "Brow studios", "Hairdressers", "Barbers", "PMU artists", "Skin therapists", "Makeup artists"];

  // Zelfde inhoud als de andere richting; alleen de vorm verschilt.
  const steps = [
    { n: "1", title: t.step1, desc: t.step1d },
    { n: "2", title: t.step2, desc: t.step2d },
    { n: "3", title: t.step3, desc: t.step3d },
  ];
  const feats = [
    { icon: "link", nl: ["Eigen boekingspagina","Jouw merk, jouw kleuren, jouw link — vellu.cc/jouw-naam. Klanten boeken direct bij jou, zonder tussenpartij."], en: ["Your own booking page", "Your brand, your colors, your link — vellu.cc/your-name. Clients book directly with you, no middleman."], es: ["Tu propia página de reservas", "Tu marca, tus colores, tu enlace — vellu.cc/tu-nombre. Los clientes reservan directamente contigo, sin intermediarios."] },
    { icon: "money", nl: ["0% commissie","Vast maandtarief. Elke cent van elke boeking blijft van jou."], en: ["0% commission", "Flat monthly fee. Every cent of every booking stays yours."], es: ["0% de comisión", "Tarifa mensual fija. Cada centavo de cada reserva es tuyo."] },
    { icon: "team", nl: ["Team accounts","Elke medewerker een eigen login, agenda en diensten."], en: ["Team accounts", "Each staff member gets their own login, schedule and services."], es: ["Cuentas de equipo", "Cada miembro del equipo tiene su propio acceso, agenda y servicios."] },
    { icon: "mail", nl: ["Automatische e-mails","Bevestigingen, herinneringen, follow-ups — en de factuur gaat automatisch mee bij het afrekenen."], en: ["Automatic emails", "Confirmations, reminders, follow-ups — and the invoice is emailed automatically at checkout."], es: ["Correos automáticos", "Confirmaciones, recordatorios, seguimientos — y la factura se envía automáticamente al cobrar."] },
    { icon: "star2", nl: ["Reviews","Automatisch reviews verzamelen na elk bezoek."], en: ["Reviews", "Automatically collect reviews after every visit."], es: ["Reseñas", "Recoge reseñas automáticamente tras cada visita."] },
    { icon: "palette", nl: ["Eigen branding","Jouw logo, kleuren en stijl — tot op de bevestigingsmail."], en: ["Custom branding", "Your logo, colors and style — down to the confirmation email."], es: ["Tu propia marca", "Tu logo, colores y estilo — hasta en el correo de confirmación."] },
    { icon: "image", nl: ["Portfolio","Foto's per behandeling tonen."], en: ["Portfolio", "Show photos per treatment."], es: ["Portafolio", "Muestra fotos por tratamiento."] },
    { icon: "tag", nl: ["Kortingscodes","Maak en deel korting met je klanten."], en: ["Discount codes", "Create and share discounts with clients."], es: ["Códigos de descuento", "Crea y comparte descuentos con tus clientes."] },
  ];
  const featOf = (f) => (lang === "nl" ? f.nl : lang === "es" ? f.es : f.en);

  // Zes vragen i.p.v. tien (Faisal 15-09: "te veel vragen, voeg samen"):
  // wat+voor wie, kosten+commissie+verschil met platformen, proberen, team,
  // herinneringen+annuleren, klanten meenemen. In drie talen (Spaans viel
  // eerst terug op Engels, L3-09).
  const faqs = lang === "es" ? [
    ["¿Qué es Vellu y para quién es?", "Vellu te da tu propia página de reservas en vellu.cc/tu-nombre. Los clientes reservan directamente contigo, sin intermediarios, y tú gestionas todo desde tu panel. Hecho para profesionales independientes de la belleza: manicuristas, artistas de pestañas, especialistas en cejas, peluquerías y salones, solos o con equipo."],
    ["¿Cuánto cuesta y por qué sin comisión?", "Starter cuesta €19 al mes y Professional €35 al mes. Precio fijo, 0% de comisión, sin costes ocultos: nunca pagas por reserva ni por cliente nuevo, y con Professional todo tu equipo está incluido. Además tienes tu propia página con tu marca en lugar de un perfil en un buscador: tus clientes siguen siendo tus clientes."],
    ["¿Puedo probarlo primero?", "Sí. Cada salón nuevo empieza con 14 días de prueba gratis. Configura tu página, recibe reservas y después decide si sigues con Starter o Professional."],
    ["¿Puede mi equipo gestionar su propia agenda?", "Sí. Con el plan Professional cada miembro del equipo tiene su propio acceso. Solo ve sus propias citas y gestiona sus propios servicios y horarios."],
    ["¿Reciben recordatorios los clientes y cómo cancelan?", "Sí, automáticamente: una confirmación al reservar, un recordatorio 24 horas antes y, después de la visita, un seguimiento que pide una reseña. Cancelan con el enlace de su correo de confirmación; tú decides hasta cuándo se puede."],
    ["¿Puedo traer mis clientes y citas de otro sistema?", "Sí. Exporta tu lista de clientes y tus próximas citas desde tu plataforma actual. Los clientes se importan en Clientes > Importar y las citas con Importar citas en tu panel, ambos como Excel o CSV. Vellu reconoce las columnas habituales y te lo muestra todo antes de guardar; tus clientes no reciben una confirmación doble. ¿No lo consigues? Envíalo por Contacto y te ayudamos gratis."],
  ] : lang === "nl" ? [
    ["Wat is Vellu, en voor wie is het?", "Vellu geeft jou je eigen boekingspagina op vellu.cc/jouw-naam. Klanten boeken direct bij jou, zonder tussenpartij, en jij beheert alles vanuit je dashboard. Gemaakt voor onafhankelijke beauty professionals: nail techs, lash artists, brow specialists, kappers en salons — solo of met een team."],
    ["Wat kost het, en waarom geen commissie?", "Starter is €19 per maand, Professional €35 per maand. Vast tarief, 0% commissie, geen verborgen kosten: je betaalt nooit per boeking of per nieuwe klant, en bij Professional is je hele team inbegrepen. Bovendien krijg je je eigen merkpagina in plaats van een profiel in een zoekplatform: jouw klanten blijven jouw klanten."],
    ["Kan ik het eerst uitproberen?", "Ja. Elke nieuwe salon start met 14 dagen gratis proberen. Zet je pagina op, ontvang boekingen en kies daarna of je doorgaat met Starter of Professional."],
    ["Kunnen mijn medewerkers hun eigen agenda beheren?", "Ja. Met het Professional-plan krijgt elke medewerker een eigen login. Ze zien alleen hun eigen afspraken en beheren hun eigen diensten en werktijden."],
    ["Krijgen klanten herinneringen, en hoe annuleren ze?", "Ja, automatisch: een bevestiging bij het boeken, een herinnering 24 uur van tevoren en na het bezoek een follow-up voor een review. Annuleren gaat via de link in hun bevestigingsmail; jij bepaalt tot wanneer dat kan."],
    ["Kan ik mijn klanten en afspraken meenemen van een ander systeem?", "Ja. Exporteer je klantenlijst en je komende afspraken uit je huidige platform. Klanten importeer je onder Klanten > Importeer, afspraken via Afspraken importeren op je dashboard, allebei als Excel of CSV. Vellu herkent de gangbare kolommen en laat alles eerst zien voordat er iets wordt opgeslagen; je klanten krijgen geen dubbele bevestiging. Lukt het niet? Stuur 'm naar Contact en wij helpen je gratis."],
  ] : [
    ["What is Vellu, and who is it for?", "Vellu gives you your own booking page at vellu.cc/your-name. Clients book directly with you, no middleman, and you manage everything from your dashboard. Built for independent beauty professionals: nail techs, lash artists, brow specialists, hairdressers and salons — solo or with a team."],
    ["What does it cost, and why no commission?", "Starter is €19 a month, Professional €35 a month. Fixed price, 0% commission, no hidden fees: you never pay per booking or per new client, and on Professional your whole team is included. And you get your own branded page instead of a profile in a marketplace: your clients stay your clients."],
    ["Can I try it first?", "Yes. Every new salon starts with a 14-day free trial. Set up your page, take bookings and then decide whether to continue with Starter or Professional."],
    ["Can my staff manage their own agenda?", "Yes. With the Professional plan, each staff member gets their own login. They only see their own appointments and manage their own services and hours."],
    ["Do clients get reminders, and how do they cancel?", "Yes, automatically: a confirmation when they book, a reminder 24 hours before, and a follow-up after the visit asking for a review. Cancelling goes through the link in their confirmation email; you set the cancellation deadline."],
    ["Can I bring my clients and appointments from another system?", "Yes. Export your client list and your upcoming appointments from your current platform. Clients go in under Customers > Import, appointments via Import appointments on your dashboard, both as Excel or CSV. Vellu recognises the usual columns and shows you everything before saving; your clients don't get a double confirmation. Stuck? Send it to Contact and we'll help you for free."],
  ];

  const plans = [
    // Volledige lijsten (11-11-2026): Starter noemde maar zes dingen terwijl
    // stempelkaart, verjaardagscodes, aanbetaling, no-show-vergoeding,
    // wachtlijst, facturen en importeren ook in Starter zitten. Pro-only volgens
    // de code (isStarter/UpgradeCard): kassa en producten, analytics,
    // kortingscodes, nieuwsbrief, klant-export, locaties, eigen login per
    // medewerker, meer dan 3 medewerkers, eigen lettertype. Wijzigt de
    // afscherming in OwnerApp, dan deze lijsten mee.
    { name: "Starter", price: 19, popular: false, features: {
      nl: ["Eigen boekingspagina in NL, EN en ES", "Bevestigingen en herinneringen per mail", "Reviews na elk bezoek", "Facturen automatisch verstuurd", "Stempelkaart en verjaardagscodes", "Aanbetaling en no-show-vergoeding", "Wachtlijst", "Eigen branding & logo", "Tot 3 medewerkers", "Klanten en afspraken importeren"],
      en: ["Your own booking page in EN, NL and ES", "Email confirmations and reminders", "Reviews after every visit", "Invoices sent automatically", "Stamp card and birthday codes", "Deposits and no-show fees", "Waitlist", "Custom branding & logo", "Up to 3 staff members", "Import clients and appointments"],
      es: ["Tu página de reservas en ES, NL y EN", "Confirmaciones y recordatorios por correo", "Reseñas después de cada visita", "Facturas enviadas automáticamente", "Tarjeta de sellos y códigos de cumpleaños", "Depósitos y tarifa por no presentarse", "Lista de espera", "Tu propia marca y logo", "Hasta 3 miembros del equipo", "Importa clientes y citas"] } },
    { name: "Professional", price: 35, popular: true, features: {
      nl: ["Alles van Starter +", "Onbeperkt medewerkers", "Eigen login per medewerker", "Kassa, productverkoop en voorraad", "Analytics-dashboard", "Kortingscodes", "Nieuwsbrief & klant-export", "Meerdere locaties", "Eigen lettertype op je pagina", "Prioriteit support"],
      en: ["Everything in Starter +", "Unlimited staff members", "Own login for each staff member", "Till, product sales and stock", "Analytics dashboard", "Discount codes", "Newsletter & client export", "Multiple locations", "Your own font on your page", "Priority support"],
      es: ["Todo lo de Starter +", "Miembros del equipo ilimitados", "Acceso propio para cada miembro", "Caja, venta de productos e inventario", "Panel de analíticas", "Códigos de descuento", "Boletín y exportación de clientes", "Varias ubicaciones", "Tu propia tipografía en tu página", "Soporte prioritario"] } },
  ];

  const maxW = 1080;
  const pad = "clamp(20px, 5vw, 44px)";
  // Hoekradius (Faisal 15-09): vierkante knoppen zoals vev.co, geen pillen.
  const R = AT_RADIUS;

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
          /* Vaste lichte huid: ook native onderdelen licht, en geen
             verdonkering door de "donkere modus voor websites" van Android. */
          .atelier { color-scheme: only light; }
          .atelier .btn-primary { background: ${INK}; color: ${BONE}; border: 1px solid ${INK}; border-radius: ${R}px; font-family: 'Jost', sans-serif; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease; box-shadow: none; }
          .atelier .btn-primary:hover { transform: translateY(-1px); background: #4a3e2f; box-shadow: 0 14px 28px -16px ${INK}; }
          .atelier .btn-ghost { background: transparent; color: ${INK}; border: 1px solid ${MUSHROOM}; border-radius: ${R}px; font-family: 'Jost', sans-serif; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: border-color 0.2s ease, background 0.2s ease; }
          .atelier .btn-ghost:hover { border-color: ${EARTH}; background: ${PUTTY}55; }
          .atelier .input-field { background: ${P.inputBg}; border: 1px solid ${P.inputBorder}; color: ${INK}; font-family: 'Jost', sans-serif; outline: none; }
          .atelier .input-field::placeholder { color: ${EARTH}; }
          .atelier .input-field:focus { border-color: ${EARTH}; }
          .atelier ::selection { background: ${PUTTY}; }
          .vl-marquee-track { animation: vlMarquee calc(var(--vl-marquee-copies, 1) * 32s) linear infinite; }
          .vl-marquee:hover .vl-marquee-track { animation-play-state: paused; }
          @keyframes vlMarquee { to { transform: translateX(-50%); } }
          .at-outline { color: transparent; -webkit-text-stroke: 1px ${MUSHROOM}; }
          .vl-cursor { position: fixed; top: 0; left: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px; border: 1px solid ${EARTH}; border-radius: 50%; pointer-events: none; z-index: 80; transition: width 0.25s ease, height 0.25s ease, margin 0.25s ease, border-color 0.25s ease; }
          .vl-cursor.grow { width: 46px; height: 46px; margin: -23px 0 0 -23px; border-color: ${INK}; }
          .vl-cursor-dot { position: fixed; top: 0; left: 0; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: ${INK}; pointer-events: none; z-index: 80; }
          /* Ring volgt de band onder de muis (CursorRing zet on-mid/on-dark):
             mushroom → espresso, earth/espresso → bone. Altijd zichtbaar. */
          .vl-cursor.on-mid { border-color: ${INK}; }
          .vl-cursor.on-dark, .vl-cursor.on-dark.grow { border-color: ${BONE}; }
          .vl-cursor-dot.on-dark { background: ${BONE}; }
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
            /* De hele tekstkolom gecentreerd, ook op desktop (Faisal 15-09):
               eerst de knop-cluster, daarna ook kop, wenkbrauw en intro. */
          }
          /* Functiekaarten (Faisal 15-09: "de tekst zweeft los, geef ze boxen
             met een zwevend effect"): bone-kaarten op de putty-band met een
             zachte, brede slagschaduw en een lift bij hover. */
          .at-feat-grid { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: stretch; }
          @media (min-width: 600px) { .at-feat-grid { grid-template-columns: 1fr 1fr; gap: 16px; } }
          @media (min-width: 1000px) { .at-feat-grid { grid-template-columns: repeat(4, 1fr); gap: 18px; } }
          .at-feat-card { height: 100%; box-sizing: border-box; background: ${P.bgCard}; border: 1px solid ${EARTH}26; border-radius: 16px; padding: 22px 20px 24px; box-shadow: 0 22px 40px -26px rgba(69,58,43,0.55), 0 2px 4px rgba(69,58,43,0.05); transition: transform 0.28s ease, box-shadow 0.28s ease; }
          .at-feat-card:hover { transform: translateY(-5px); box-shadow: 0 34px 54px -26px rgba(69,58,43,0.6), 0 2px 4px rgba(69,58,43,0.05); }
          .at-feat-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; background: ${EARTH}1f; color: ${EARTH}; font-size: 12px; margin-bottom: 16px; }
          .at-feat-title { font-size: 14px; font-weight: 600; color: ${INK}; margin-bottom: 6px; letter-spacing: 0.01em; }
          .at-feat-desc { font-size: 12.5px; color: #5f5240; line-height: 1.65; }
          @media (prefers-reduced-motion: reduce) { .at-feat-card, .at-feat-card:hover { transform: none; } }
          /* Citaten van salons (Beoordeel Vellu, 16-09): dezelfde zwevende
             bone-kaarten, gecentreerd, één tot drie naast elkaar. */
          .at-quote-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; max-width: 900px; margin: 0 auto; }
          .at-quote-card { height: 100%; box-sizing: border-box; background: ${P.bgCard}; border: 1px solid ${PUTTY}; border-radius: 16px; padding: 22px 22px 20px; box-shadow: 0 22px 40px -26px rgba(69,58,43,0.5), 0 2px 4px rgba(69,58,43,0.05); transition: transform 0.28s ease, box-shadow 0.28s ease; }
          .at-quote-card:hover { transform: translateY(-5px); box-shadow: 0 34px 54px -26px rgba(69,58,43,0.55), 0 2px 4px rgba(69,58,43,0.05); }
          @media (prefers-reduced-motion: reduce) { .at-quote-card, .at-quote-card:hover { transform: none; } }
          /* Hero-kaartjes rond de telefoon (AtHeroPhone). Telefoon = 276 px breed
             en gecentreerd; de kaartjes steken er half overheen. max()/min()
             houden ze binnen de kolom op een smal scherm. */
          .at-hero-note { position: absolute; width: 222px; z-index: 4; }
          .at-hero-note.n1 { top: 8px; left: max(0px, calc(50% - 138px - 84px)); }
          .at-hero-note.n2 { top: 252px; left: min(calc(100% - 222px), calc(50% + 138px - 124px)); }
          .at-hero-note.n3 { top: 512px; left: max(0px, calc(50% - 138px - 66px)); }
          .at-hero-note-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: #FBF8F3; border: 1px solid ${PUTTY}; box-shadow: 0 20px 36px -18px rgba(69,58,43,0.5), 0 2px 5px rgba(69,58,43,0.07); text-align: left; animation: atNoteFloat 6s ease-in-out infinite; }
          .at-hero-note.n2 .at-hero-note-card { animation-delay: -2s; }
          .at-hero-note.n3 .at-hero-note-card { animation-delay: -4s; }
          .at-hero-note-ico { width: 32px; height: 32px; border-radius: 9px; background: ${EARTH}1a; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .at-hero-note-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
          .at-hero-note-title { font-size: 12px; font-weight: 600; color: ${INK}; line-height: 1.25; white-space: nowrap; }
          .at-hero-note-sub { display: block; font-size: 11px; color: ${P.textSub}; line-height: 1.3; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .at-hero-note-meta { font-size: 9.5px; color: ${EARTH}; letter-spacing: 0.04em; white-space: nowrap; }
          @keyframes atNoteFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
          @media (max-width: 420px) {
            .at-hero-note { width: 188px; }
            .at-hero-note.n2 { left: min(calc(100% - 188px), calc(50% + 138px - 124px)); }
            .at-hero-note-card { padding: 8px 10px; gap: 8px; }
            .at-hero-note-meta { display: none; }
          }
          @media (prefers-reduced-motion: reduce) { .at-hero-note-card { animation: none; } }
          .at-show-row { display: flex; justify-content: center; align-items: flex-start; gap: clamp(22px, 4vw, 56px); margin-top: 8px; }
          .at-show-item.mid { margin-top: -26px; }
          .at-show-phone { width: 214px; border-radius: 40px; padding: 9px; background: linear-gradient(140deg, #6a6a72 0%, #23232a 22%, #0e0e11 58%, #4a4a53 100%); box-shadow: 0 40px 70px -30px rgba(40,30,20,0.65), inset 0 1.4px 0 rgba(255,255,255,0.2), inset 0 0 0 1px rgba(255,255,255,0.08); transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
          .at-show-item a:hover .at-show-phone { transform: translateY(-6px); }
          .at-show-screen { border-radius: 31px; overflow: hidden; aspect-ratio: 390 / 790; background: #F7F4EF; display: flex; flex-direction: column; }
          .at-show-bar { flex: 0 0 30px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px 0 24px; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 600; position: relative; }
          .at-show-island { position: absolute; left: 50%; top: 7px; transform: translateX(-50%); width: 62px; height: 17px; border-radius: 20px; background: #000; }
          .at-show-screen img { width: 100%; flex: 1; min-height: 0; object-fit: cover; object-position: top center; display: block; }
          @media (max-width: 760px) {
            .at-show-row { justify-content: flex-start; overflow-x: auto; scroll-snap-type: x mandatory; padding: 30px 20px 10px; margin: 0 -20px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
            .at-show-row::-webkit-scrollbar { display: none; }
            .at-show-row > * { scroll-snap-align: center; flex: 0 0 auto; }
            .at-show-item.mid { margin-top: 0; }
            .at-show-phone { width: 200px; }
          }
          .at-cmp-row { display: grid; grid-template-columns: minmax(0, 1fr) 104px 120px; align-items: center; }
          @media (max-width: 560px) { .at-cmp-row { grid-template-columns: minmax(0, 1fr) 70px 92px; } .at-cmp-plan { font-size: 9.5px !important; letter-spacing: 0.04em !important; } .at-cmp-price { font-size: 16px !important; } }
          .at-price-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
          @media (min-width: 760px) { .at-price-grid { grid-template-columns: 1fr 1fr; align-items: stretch; } }
          /* Stappen als zwevende kaarten (Faisal 15-09), zelfde rij-indeling
             als eerst: groot cijfer links, titel + tekst rechts. */
          .at-step { display: grid; grid-template-columns: clamp(64px, 11vw, 128px) 1fr; gap: clamp(14px, 3vw, 30px); align-items: center; padding: clamp(20px, 3vw, 30px) clamp(18px, 3vw, 30px); background: ${P.bgCard}; border: 1px solid ${PUTTY}; border-radius: 16px; box-shadow: 0 22px 40px -26px rgba(69,58,43,0.5), 0 2px 4px rgba(69,58,43,0.05); transition: transform 0.28s ease, box-shadow 0.28s ease; }
          .at-step:hover { transform: translateY(-5px); box-shadow: 0 34px 54px -26px rgba(69,58,43,0.55), 0 2px 4px rgba(69,58,43,0.05); }
          @media (prefers-reduced-motion: reduce) { .at-step, .at-step:hover { transform: none; } }
          /* Prijskaarten: zelfde zwevende effect als stappen en functies (Faisal 15-09). */
          .at-price-card { box-shadow: 0 26px 46px -28px rgba(69,58,43,0.55), 0 2px 4px rgba(69,58,43,0.05); transition: transform 0.28s ease, box-shadow 0.28s ease; }
          .at-price-card:hover { transform: translateY(-6px); box-shadow: 0 40px 60px -28px rgba(69,58,43,0.6), 0 2px 4px rgba(69,58,43,0.05); }
          @media (prefers-reduced-motion: reduce) { .at-price-card, .at-price-card:hover { transform: none; } }
          /* FAQ-kaarten: bone op earth, plusje in een earth-tegel; open kaart
             blijft iets opgetild met diepere schaduw. */
          .at-faq-card { background: ${P.bgCard}; border: 1px solid ${PUTTY}; border-radius: 16px; box-shadow: 0 22px 40px -26px rgba(69,58,43,0.55), 0 2px 4px rgba(69,58,43,0.05); transition: transform 0.28s ease, box-shadow 0.28s ease; }
          .at-faq-card:hover, .at-faq-card.open { transform: translateY(-4px); box-shadow: 0 32px 52px -26px rgba(69,58,43,0.62), 0 2px 4px rgba(69,58,43,0.05); }
          .at-faq-plus { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; background: ${EARTH}1f; color: ${EARTH}; font-size: 20px; line-height: 1; flex-shrink: 0; transition: background 0.2s ease, color 0.2s ease; }
          .at-faq-card.open .at-faq-plus { background: ${INK}; color: ${BONE}; }
          @media (prefers-reduced-motion: reduce) { .at-faq-card, .at-faq-card:hover, .at-faq-card.open { transform: none; } }
          /* Rekensom: schuiven links, uitkomst rechts vanaf 720px. */
          .at-calc-grid { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: stretch; }
          @media (min-width: 720px) { .at-calc-grid { grid-template-columns: 1fr 1fr; gap: 18px; } }
          .at-nav-find { display: none; }
          @media (min-width: 768px) { .at-nav-find { display: inline; } }
          .at-nav-signin-icon { display: none; }
          @media (max-width: 359px) {
            .at-nav-signin { padding: 8px 10px !important; }
            .at-nav-signin-text { display: none; }
            .at-nav-signin-icon { display: inline-flex; align-items: center; }
          }
          .at-footer-inner { padding-bottom: calc(30px + env(safe-area-inset-bottom, 0px)); }
          @media (max-width: 768px) {
            .at-finale { min-height: calc(100dvh - 64px); display: flex; flex-direction: column; }
            .at-footer { margin-top: auto; }
            .at-footer-inner { padding-bottom: calc(92px + env(safe-area-inset-bottom, 0px)); }
          }
          @media (prefers-reduced-motion: reduce) { .vl-marquee-track { animation: none; } }
        `}</style>

        {/* Uitnodigingsbalk: alleen voor wie met een code van een salon
            binnenkwam. Zelfde belofte als het aanmeldscherm. */}
        {invite?.name && (
          <div data-invite-bar style={{ position: "relative", zIndex: 41, background: INK, color: BONE, textAlign: "center", padding: `calc(9px + env(safe-area-inset-top, 0px)) ${pad} 9px`, fontSize: 12.5, lineHeight: 1.5 }}>
            {lang === "nl" ? <>Uitgenodigd door <strong style={{ fontWeight: 600 }}>{invite.name}</strong>: jullie krijgen allebei {refReward} gratis{refUntil ? ` (actie t/m ${refUntil})` : ""}.</>
              : lang === "es" ? <>Invitación de <strong style={{ fontWeight: 600 }}>{invite.name}</strong>: ambos recibís {refReward} gratis{refUntil ? ` (promoción hasta el ${refUntil})` : ""}.</>
              : <>Invited by <strong style={{ fontWeight: 600 }}>{invite.name}</strong>: you both get {refReward} free{refUntil ? ` (offer until ${refUntil})` : ""}.</>}
            {" "}
            <button onClick={() => ownerStart()} data-invite-start style={{ background: "none", border: "none", cursor: "pointer", color: BONE, fontFamily: "'Jost',sans-serif", fontSize: 12.5, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, padding: "0 2px" }}>
              {lang === "nl" ? "Maak je pagina" : lang === "es" ? "Crea tu página" : "Create your page"} <ArrowIcon size={12} />
            </button>
          </div>
        )}

        {/* ── NAV — haarlijn, espresso, rustig. ── */}
        <nav style={{ position: "sticky", top: 0, zIndex: 40, background: scrolled ? `${BONE}ee` : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", WebkitBackdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: `1px solid ${scrolled ? PUTTY : "transparent"}`, transition: "background 0.3s ease, border-color 0.3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `calc(14px + env(safe-area-inset-top, 0px)) ${pad} 14px`, maxWidth: maxW, margin: "0 auto" }}>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "clamp(20px, 5vw, 24px)", fontWeight: 400, letterSpacing: "0.22em", color: INK }}>vellu</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button className="at-nav-find" onClick={() => { setFinderOpen(true); setTimeout(() => scrollToSection("all-salons"), 60); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: EARTH, whiteSpace: "nowrap" }}>
                {t.findSalonNav}
              </button>
              <div style={{ display: "flex", gap: 2, border: `1px solid ${PUTTY}`, borderRadius: R, padding: 3, background: P.bgCard }}>
                {["nl", "en", "es"].map(l => (
                  <button key={l} onClick={() => setLang(l)} style={{ border: "none", cursor: "pointer", borderRadius: R - 2, padding: "5px 10px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Jost',sans-serif", background: lang === l ? INK : "transparent", color: lang === l ? BONE : EARTH }}>
                    {l}
                  </button>
                ))}
              </div>
              {/* Inloggen in dezelfde espresso-vulling als de trialknop
                  (Faisal 15-09); width:auto omdat .btn-primary 100% breed is.
                  Onder 360px alleen een persoon-icoon: in het Spaans
                  ("INICIAR SESIÓN") liep de balk anders over de rand (L3-20). */}
              <button className="btn-primary at-nav-signin" data-nav-signin aria-label={t.signIn} style={{ width: "auto", fontSize: 10, padding: "9px 18px", whiteSpace: "nowrap" }} onClick={() => navigate("/owner")}>
                <span className="at-nav-signin-text">{t.signIn}</span>
                <span className="at-nav-signin-icon" aria-hidden="true"><NavIcon name="user" size={14} color="currentColor" /></span>
              </button>
              {/* Géén "Maak je pagina"-knop in de balk: Faisal (15-09) wil die
                  onder "In 3 stappen live", zie sectie 03. */}
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
                <p data-hero-intro style={{ fontSize: "clamp(14px, 2vw, 16px)", color: P.textSub, lineHeight: 1.75, maxWidth: 460, marginBottom: 26, marginLeft: "auto", marginRight: "auto" }}>
                  {t.heroSub}
                </p>
              </HeroEnter>
              <HeroEnter ready={heroReady} delay={700}>
                <div className="at-ctas">
                  <button className="btn-primary" style={{ padding: "17px 38px", fontSize: 11 }} onClick={() => ownerStart()}>
                    {t.startFree}
                  </button>
                  <button onClick={() => scrollToSection("how-it-works")} data-hero-how
                    style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: INK, borderBottom: `1px solid ${EARTH}`, paddingBottom: 4 }}>
                    {t.howItWork} <ArrowIcon dir="down" size={11} />
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
                <div data-hero-usedby style={{ marginTop: 16, fontSize: 11, color: EARTH, letterSpacing: "0.05em", textAlign: "center" }}>
                  {lang === "nl" ? "Gebruikt door salons in Nederland en het Caribisch gebied"
                    : lang === "es" ? "Utilizado por salones en los Países Bajos y el Caribe"
                    : "Used by salons in the Netherlands and the Caribbean"}
                </div>
              </HeroEnter>
              <HeroEnter ready={heroReady} delay={1160}>
                <SalonRatingLine lang={lang} sum={ratings.sum} />
              </HeroEnter>
            </div>
            <HeroEnter ready={heroReady} delay={460}>
              <ParallaxLayer speed={-0.035}>
                {/* Telefoon vrijstaand en rechtop (feedback 27-08), sinds
                    11-11-2026 met de boekingspagina erin i.p.v. het dashboard. */}
                <AtHeroPhone lang={lang} ready={heroReady} />
                <div style={{ textAlign: "center", marginTop: 2 }}>
                  <button onClick={() => navigate("/bloomstudio")}
                    style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: INK, borderBottom: `1px solid ${EARTH}`, padding: "6px 2px" }}>
                    {lang === "nl" ? "Bekijk een live voorbeeldpagina" : lang === "es" ? "Ver una página de ejemplo en vivo" : "See a live example page"} <ArrowIcon size={11} />
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

        {/* ── 01 · SALON VINDEN — op de putty-band, in één stuk met de marquee.
              Kleurenladder (Faisal 15-09): hero bone → putty → earth, en daarna
              nog eens bone → putty → mushroom → earth → espresso. ── */}
        {/* Salons in de spotlight (11-11-2026, Faisal: "worded more as a promo
            for the salons then showing off we have people using our app").
            Drie salons met hun echte boekingspagina (screenshots in
            public/showcase/, af en toe verversen) en wat ze doen, met een knop
            om direct te boeken. Daaronder klapt de volledige salonzoeker open.
            Wie er staat is een redactionele keuze; de specialiteiten komen uit
            hun eigen categorieën. */}
        <div id="find-salon-section" style={{ background: PUTTY, position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(40px, 6vw, 64px) ${pad} clamp(40px, 6vw, 64px)` }}>
            <AtHead title={lang === "nl" ? "Salons in de spotlight" : lang === "es" ? "Salones destacados" : "Salons in the spotlight"}
              sub={lang === "nl" ? "Getalenteerde salons waar je meteen kunt boeken, elk op hun eigen pagina. Neem een kijkje en boek je volgende afspraak." : lang === "es" ? "Salones con talento donde puedes reservar al momento, cada uno en su propia página. Échales un vistazo y reserva tu próxima cita." : "Talented salons you can book with right away, each on their own page. Take a look and book your next appointment."} tone="putty" />
            <div className="at-show-row">
              {[
                // bar = kleur van de bovenrand van de screenshot (de statusbalk
                // loopt daarin door; gemeten 11-11-2026, bij een nieuwe
                // screenshot opnieuw meten).
                // Beauty By Eydy i.p.v. Brilliant Beauty (Faisal 11-11).
                { slug: "beautybyeydy", bar: "#faf9f7", name: "Beauty By Eydy", place: "Kralendijk · Bonaire", what: { nl: "Polygel · BIAB · Manicure & pedicure", en: "Polygel · BIAB · Manicure & pedicure", es: "Polygel · BIAB · Manicura y pedicura" } },
                { slug: "ttnbdenhaag", bar: "#faf9f7", name: "TTNB Den Haag", place: lang === "en" ? "The Hague · Netherlands" : lang === "es" ? "La Haya · Países Bajos" : "Den Haag · Nederland", what: { nl: "Acryl & polygel · BIAB · Pedicures", en: "Acrylic & polygel · BIAB · Pedicures", es: "Acrílico y polygel · BIAB · Pedicuras" } },
                { slug: "mywhimsandmorebv", bar: "#faf9f7", name: "My Whims and More", place: "Kralendijk · Bonaire", what: { nl: "Gezichtsbehandelingen · Massage · Nagels", en: "Facials · Massage · Nails", es: "Faciales · Masaje · Uñas" } },
              ].map((s, i) => (
                <Reveal key={s.slug} delay={i * 120}>
                  <div className={`at-show-item${i === 1 ? " mid" : ""}`}>
                    {/* Nieuw tabblad (Faisal 11-11): de bezoeker blijft op vellu.cc. */}
                    <a href={`/${s.slug}`} target="_blank" rel="noopener" aria-label={s.name} style={{ display: "block", textDecoration: "none" }}>
                      <div className="at-show-phone">
                        <div className="at-show-screen" style={{ background: s.bar }}>
                          {/* Statusbalk: de schermhoeken sneden het logo en de
                              taalknoppen van de salonpagina af (Faisal 11-11). */}
                          {(() => { const ink = s.bar === "#0c0b09" ? "#F4EFE6" : "#1f1a15"; return (
                            <div aria-hidden="true" className="at-show-bar" style={{ color: ink }}>
                              <span>9:41</span>
                              <span className="at-show-island" />
                              <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 1.5 }}>{[3, 5, 7, 9].map((h) => <span key={h} style={{ width: 2.2, height: h, borderRadius: 1, background: ink }} />)}<span style={{ width: 15, height: 8, borderRadius: 2.5, border: `1px solid ${ink}`, marginLeft: 4, padding: 1, boxSizing: "border-box", display: "inline-block" }}><span style={{ display: "block", width: "70%", height: "100%", borderRadius: 1, background: ink }} /></span></span>
                            </div>
                          ); })()}
                          <img src={`/showcase/${s.slug}.jpg`} alt={lang === "nl" ? `Boekingspagina van ${s.name}` : lang === "es" ? `Página de reservas de ${s.name}` : `${s.name} booking page`} loading="lazy" decoding="async" width="546" height="1181" />
                        </div>
                      </div>
                    </a>
                    <div style={{ textAlign: "center", marginTop: 16, maxWidth: 230, marginLeft: "auto", marginRight: "auto" }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 23, color: INK }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: EARTH, letterSpacing: "0.08em", marginTop: 2 }}>{s.place}</div>
                      <div data-show-what style={{ fontSize: 12.5, color: P.textSub, marginTop: 8, lineHeight: 1.45 }}>{lang === "nl" ? s.what.nl : lang === "es" ? s.what.es : s.what.en}</div>
                      <a href={`/${s.slug}`} target="_blank" rel="noopener" data-show-book style={{ marginTop: 14, padding: "11px 20px", borderRadius: R, border: `1px solid ${INK}`, background: "transparent", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: INK, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none" }}>
                        {lang === "nl" ? "Bekijk & boek" : lang === "es" ? "Ver y reservar" : "View & book"} <ArrowIcon size={10} />
                      </a>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: "clamp(30px, 4vw, 44px)", fontSize: 13, color: P.textSub }}>
              {!finderOpen && (lang === "nl" ? "Op zoek naar een andere salon? " : lang === "es" ? "¿Buscas otro salón? " : "Looking for another salon? ")}
              <button type="button" data-all-salons-toggle aria-expanded={finderOpen} onClick={() => { const open = !finderOpen; setFinderOpen(open); if (open) setTimeout(() => scrollToSection("all-salons"), 60); }}
                style={{ background: "none", border: "none", borderBottom: `1px solid ${INK}`, cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 13, color: INK, padding: "2px 0", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {finderOpen
                  ? (lang === "nl" ? "Zoeken sluiten" : lang === "es" ? "Cerrar búsqueda" : "Close search")
                  : (lang === "nl" ? "Zoek andere salons" : lang === "es" ? "Buscar otros salones" : "Search for other salons")}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transition: "transform 0.25s", transform: finderOpen ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            </div>
          </div>
          {finderOpen && (
            <div id="all-salons" style={{ paddingBottom: "clamp(40px, 6vw, 64px)" }}>
              <SalonFinder lang={lang} t={t} c={{ ...P, border: `${EARTH}3d` }} goToSlug={goToSlug} navigate={navigate} hideHeader accent={EARTH} radius={R} atelier newTab oneRow />
            </div>
          )}
        </div>

        {/* De besparingsrekensom (earth-band) is weg sinds 11-11-2026: hij ging
            uit van "de meeste platforms rekenen 5–10% per boeking", en dat klopt
            niet voor Fresha, Setmore of Salonized (abonnement, plus bij Fresha
            en Treatwell een eenmalige vergoeding op nieuwe marketplace-klanten).
            Wat je voor €19/€35 krijgt staat nu volledig bij de prijzen. */}

        {/* ── 03 · HOE HET WERKT — terug op bone, redactionele rijen. ── */}
        <div id="how-it-works" style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(50px, 8vw, 84px) ${pad} 0`, position: "relative", zIndex: 10 }}>
          <AtHead title={t.liveIn3} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {steps.map((s, i) => (
              <Reveal key={i} delay={i * 110}>
                <div className="at-step vl-glow" data-step-card onMouseMove={glowMove}>
                  {/* Cijfer in het midden van zijn kolom, tekst in het midden van
                      de hare (Faisal 15-09: "niet naar links gedrukt"). */}
                  <div data-step-num style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(40px, 6.4vw, 72px)", fontWeight: 300, color: MUSHROOM, lineHeight: 0.9, textAlign: "center" }}>{s.n}</div>
                  <div data-step-text style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(21px, 3vw, 28px)", fontWeight: 400, color: INK, marginBottom: 8 }}>{s.title}</div>
                    <div style={{ fontSize: 13.5, color: P.textLabel, lineHeight: 1.75, maxWidth: 560, margin: "0 auto" }}>{s.desc}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          {/* "Maak je pagina" onder de drie stappen (Faisal 15-09: niet in de
              balk). Opent /owner direct op het registratie-tabblad. width:auto,
              want .btn-primary is standaard 100% breed. */}
          <Reveal delay={steps.length * 110}>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "clamp(28px, 4vw, 40px)" }}>
              <button className="btn-primary" data-create-page style={{ width: "auto", padding: "17px 40px", fontSize: 11 }} onClick={() => ownerStart()}>
                {t.createPageNav} <ArrowIcon size={12} />
              </button>
            </div>
          </Reveal>
          <SalonRatingQuotes lang={lang} quotes={ratings.quotes} />
        </div>

        {/* ── 04 · ALLES WAT JE NODIG HEBT — putty-band, tweekoloms checklijst.
              Putty is licht genoeg voor espresso-tekst er direct op. Hierna
              lopen de banden door: mushroom (prijzen) → earth (FAQ) → espresso. ── */}
        <div style={{ background: PUTTY, position: "relative", zIndex: 10, marginTop: "clamp(44px, 7vw, 76px)" }}>
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}` }}>
            <AtHead title={t.everythingNeeded} tone="putty" />
            <div className="at-feat-grid">
              {feats.map((f, i) => {
                const [title, desc] = featOf(f);
                return (
                  <Reveal key={i} delay={(i % 4) * 70 + Math.floor(i / 4) * 90}>
                    <div className="at-feat-card vl-glow" data-feat-card onMouseMove={glowMove}>
                      {/* Passend icoon per functie (Faisal 15-09) uit de NavIcon-set. */}
                      <span aria-hidden="true" className="at-feat-icon"><NavIcon name={f.icon} size={16} color={EARTH} /></span>
                      <div className="at-feat-title">{title}</div>
                      <div className="at-feat-desc">{desc}</div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 05 · PRIJZEN — mushroom-band direct onder putty (de tweede ladder
              loopt door naar earth en espresso). Starter-kaart bone,
              Professional espresso. ── */}
        <div style={{ background: MUSHROOM, position: "relative", zIndex: 10 }}>
        <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}`, position: "relative" }}>
          <AtHead title={t.simplePricing} tone="mushroom" />
          <Reveal delay={90}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
              <div role="radiogroup" aria-label={t.simplePricing} style={{ display: "inline-flex", background: P.bgCard, border: `1px solid ${PUTTY}`, borderRadius: R, padding: 4 }}>
                {[{ key: "monthly", label: t.billingMonthly }, { key: "yearly", label: t.billingYearly }].map(opt => {
                  const active = billingCycle === opt.key;
                  return (
                    <button key={opt.key} role="radio" aria-checked={active} onClick={() => setBillingCycle(opt.key)}
                      style={{ padding: "9px 20px", borderRadius: R - 2, border: "none", background: active ? INK : "transparent", color: active ? BONE : P.textSub, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Jost',sans-serif", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 8 }}>
                      {opt.label}
                      {opt.key === "yearly" && (
                        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 4, background: active ? PUTTY : `${EARTH}26`, color: active ? INK : EARTH }}>
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
                  <div className="at-price-card vl-glow" data-price-card onMouseMove={glowMove} style={{ background: dark ? INK : P.bgCard, color: dark ? BONE : INK, border: `1px solid ${dark ? INK : PUTTY}`, borderRadius: 20, padding: "36px 30px", position: "relative", height: "100%", boxSizing: "border-box" }}>
                    {dark && (
                      <div style={{ position: "absolute", top: 22, right: 24, fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: INK, background: PUTTY, borderRadius: 4, padding: "5px 12px" }}>
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
                      {(lang === "nl" ? plan.features.nl : lang === "es" ? plan.features.es : plan.features.en).map((f, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: dark ? `${BONE}dd` : P.textSub }}>
                          <NavIcon name="check" size={13} color={dark ? MUSHROOM : EARTH} />{f}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => ownerStart()}
                      style={{ width: "100%", padding: "15px 20px", borderRadius: R, border: `1px solid ${dark ? PUTTY : INK}`, background: dark ? PUTTY : "transparent", color: INK, fontFamily: "'Jost',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>
                      {t.getStarted}
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </div>
          {/* De eerlijke vergelijking i.p.v. de oude rekensom: geen bedragen van
              andere platforms (die veranderen en verschillen per platform). */}
          <div data-pricing-honest style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(18px, 2.4vw, 22px)", color: INK, marginTop: 26, lineHeight: 1.4, maxWidth: 640, marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>
            {lang === "nl"
              ? "Je betaalt nooit per boeking of per nieuwe klant. Bij Professional is je hele team inbegrepen, voor één prijs."
              : lang === "es"
              ? "Nunca pagas por reserva ni por cliente nuevo. Con Professional todo tu equipo está incluido por un solo precio."
              : "You never pay per booking or per new client. On Professional your whole team is included for one price."}
          </div>
          <div style={{ fontSize: 11.5, color: ESPRESSO_DEEP, marginTop: 12, lineHeight: 1.6, maxWidth: 560, marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>
            {lang === "nl"
              ? "Alle prijzen in euro's, incl. btw. Betaal je van buiten de eurozone? Je kaart rekent automatisch om."
              : lang === "es"
              ? "Todos los precios en euros, IVA incluido. ¿Pagas desde fuera de la zona euro? Tu tarjeta hace la conversión automáticamente."
              : "All prices in euros, incl. VAT. Paying from outside the eurozone? Your card converts automatically."}
          </div>
          <AtPlanCompare lang={lang} yearly={billingCycle === "yearly"} />
        </div>
        </div>

        {/* ── 06 · FAQ — earth-band tussen mushroom en de espresso-finale; tekst
              in bone. ── */}
        <div style={{ background: EARTH, position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}` }}>
          <AtHead title={t.faqTitle} tone="earth" />
          {/* Elke vraag een zwevende bone-kaart op de earth-band (Faisal 15-09):
              past bij stappen/functies/prijzen én lost het contrast op — bone
              op earth haalde voor kleine tekst geen AA, espresso op bone wel. */}
          <Reveal delay={80}>
            <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {faqs.map(([q, a], i) => {
                const open = faqOpen === i;
                const toggle = () => setFaqOpen(open ? null : i);
                return (
                  <div key={i} className={`at-faq-card vl-glow${open ? " open" : ""}`} data-faq-card onMouseMove={glowMove}>
                    <div role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }} style={{ padding: "16px 16px 16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, cursor: "pointer" }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(17px, 2.4vw, 21px)", fontWeight: 400, color: INK }}>{q}</div>
                      {/* Alleen het plusje draait naar een kruisje; de tegel blijft recht.
                          SVG i.p.v. een "+"-teken: het midden van een letterteken ligt
                          niet op het midden van de tegel, dus draaide het kruisje scheef. */}
                      <span aria-hidden="true" className="at-faq-plus"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ display: "block", transition: "transform 0.25s ease", transform: open ? "rotate(45deg)" : "none" }}><path d="M7 1.5v11M1.5 7h11" /></svg></span>
                    </div>
                    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.4s cubic-bezier(0.22, 1, 0.36, 1)" }}>
                      <div style={{ overflow: "hidden" }}>
                        <div className="at-faq-answer" style={{ padding: "0 24px 20px", fontSize: 13.5, color: "#5f5240", lineHeight: 1.75, maxWidth: 640 }}>{a}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, flexWrap: "wrap", padding: "26px 0 0", fontSize: 13, maxWidth: 760, margin: "0 auto", color: `${BONE}e6` }}>
              <span>{lang === "nl" ? "Nog vragen? Stel ze in de chat linksonder, of mail ons —" : lang === "es" ? "¿Aún tienes preguntas? Pregunta en el chat abajo a la izquierda, o escríbenos —" : "Still have questions? Ask in the chat bottom-left, or email us —"}</span>
              <a href="mailto:mirahventures@vellu.cc" style={{ color: BONE, borderBottom: `1px solid ${BONE}`, textDecoration: "none" }}>mirahventures@vellu.cc</a>
              <button className="btn-ghost" style={{ fontSize: 10, padding: "9px 18px", borderColor: BONE, color: BONE }} onClick={() => navigate("/contact")}>
                {lang === "nl" ? "Neem contact op" : lang === "es" ? "Contáctanos" : "Contact us"}
              </button>
            </div>
          </Reveal>
          </div>
        </div>

        {/* ── FINALE — espresso-vlak, sluit direct aan op de putty-band. ── */}
        {/* Op de telefoon vult finale + woordmerk + voetregels precies het scherm
            onder de balk (.at-finale: min-height 100dvh - balk, voetregels
            onderaan) — helemaal onderaan staat de kop dan net onder de balk
            i.p.v. erachter (Faisal 16-09, "ik wil dat het eindigt zoals ss2"). */}
        <div className="at-finale" style={{ background: INK, position: "relative", zIndex: 10 }}>
          <div aria-hidden="true" style={{ position: "absolute", top: "-30%", right: "6%", width: "40%", height: "80%", background: `radial-gradient(ellipse at center, ${EARTH}55 0%, transparent 65%)`, pointerEvents: "none" }} />
          <div style={{ maxWidth: maxW, margin: "0 auto", paddingTop: "clamp(44px, 10vw, 110px)", paddingBottom: "clamp(36px, 8vw, 110px)", paddingLeft: pad, paddingRight: pad, textAlign: "center", position: "relative" }}>
            <Reveal>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(32px, 6vw, 54px)", fontWeight: 300, color: BONE, lineHeight: 1.12, marginBottom: 16 }}>
                {t.ctaTitle}
              </div>
            </Reveal>
            <Reveal delay={110}>
              <p style={{ fontSize: 14, color: MUSHROOM, marginBottom: 34, lineHeight: 1.7 }}>{t.ctaSub}</p>
            </Reveal>
            {/* Twee uitgangen (Faisal 15-09): de bone trialknop én de stille
                link naar de voorbeeldpagina voor wie nog niet wil aanmelden;
                daaronder één regel geruststelling met claims die al op de
                pagina staan. */}
            <Reveal delay={200}>
              <div className="at-ctas" style={{ justifyContent: "center", gap: 22 }} data-finale-ctas>
                <button onClick={() => ownerStart()}
                  style={{ padding: "18px 46px", borderRadius: R, border: "none", background: BONE, color: INK, fontFamily: "'Jost',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", boxShadow: "0 18px 44px -18px rgba(0,0,0,0.55)" }}>
                  {t.startFree}
                </button>
                <button onClick={() => navigate("/bloomstudio")} data-finale-example
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: PUTTY, borderBottom: `1px solid ${MUSHROOM}88`, padding: "6px 2px" }}>
                  {lang === "nl" ? "Bekijk een live voorbeeldpagina" : lang === "es" ? "Ver una página de ejemplo en vivo" : "See a live example page"} <ArrowIcon size={11} />
                </button>
              </div>
            </Reveal>
            <Reveal delay={280}>
              <div data-finale-reassure style={{ marginTop: 26, fontSize: 12, color: MUSHROOM, letterSpacing: "0.04em", lineHeight: 1.8 }}>
                {(lang === "nl"
                  ? ["14 dagen gratis", "0% commissie", "jouw klanten blijven jouw klanten"]
                  : lang === "es"
                    ? ["14 días gratis", "0% de comisión", "tus clientes siguen siendo tuyos"]
                    : ["14 days free", "0% commission", "your clients stay yours"]
                ).join("  ·  ")}
              </div>
            </Reveal>
          </div>
          {/* Signatuur: een groot omlijnd "vellu"-woordmerk in mushroom, in de
              lege espresso-ruimte boven de voetregels. Zit in een eigen strook
              met overflow hidden, dus het overlapt nooit knoppen of tekst. */}
          {/* Strookhoogte 0.867em en bottom -0.087em (gemeten: Jost-baseline
              ligt 0.153em boven de lijnvak-onderkant, de "l" reikt 0.78em boven
              de baseline, de inkt tot 0.047em eronder): het hele woord staat
              in beeld, baseline 0.067em boven de voetlijn — eerst werden de
              l's bovenaan afgesneden. */}
          <div aria-hidden="true" data-finale-mark style={{ position: "relative", height: "clamp(84px, 19.1vw, 260px)", overflow: "hidden", pointerEvents: "none" }}>
            {/* Omlijning zonder binnenlijnen: Jost heeft overlappende contouren
                (de dwarsbalk van de "e" loopt door de buik), en text-stroke
                tekent élke contour. Daarom: vulling in de achtergrondkleur
                bovenop een dubbel zo dikke lijn (paint-order: stroke fill) —
                de vulling dekt de binnenste helft én de overlappingen af, zodat
                alleen de buitenrand van 1,5px overblijft (Faisal 15-09). */}
            <div style={{ position: "absolute", left: "50%", bottom: "-0.087em", transform: "translateX(-50%)", fontFamily: "'Jost',sans-serif", fontWeight: 400, fontSize: "clamp(96px, 22vw, 300px)", lineHeight: 1, letterSpacing: "0.18em", whiteSpace: "nowrap", color: INK, WebkitTextStroke: `3px ${MUSHROOM}`, paintOrder: "stroke fill", opacity: 0.32, userSelect: "none" }}>
              vellu
            </div>
          </div>
          {/* Footer op het espresso-vlak — zelfde juridische regels als altijd. */}
          <footer className="at-footer" style={{ borderTop: `1px solid ${BONE}22`, position: "relative" }}>
            {/* Onderrand via .at-footer-inner: op de telefoon extra ruimte zodat
                de voetregels boven de chat-bubbel uit kunnen scrollen. */}
            <div className="at-footer-inner" style={{ maxWidth: maxW, margin: "0 auto", paddingTop: 22, paddingLeft: pad, paddingRight: pad, display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" }}>
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

        {/* Verdwijnt zodra de finale-CTA in beeld is: die heeft dezelfde knop,
            en anders hangt hij over de voetregels (Faisal 16-09). */}
        <StickyStartPill onClick={() => ownerStart()} label={t.startFree} bg={INK} fg={BONE} radius={R} hideWhenInView="[data-finale-ctas]" />
        <SupportChat
          lang={lang}
          c={P}
          accent={ESPRESSO}
          isMobile={isMobile}
          side="left"
          launcherBottom={20}
          greeting={lang === "nl"
            ? "Hoi! Vragen over Vellu? Ik help je graag — wat het kost, hoe het werkt, of het bij jouw salon past. Vraag maar raak. Kom je er met mij niet uit? Mail Mirah Ventures via mirahventures@vellu.cc."
            : lang === "es"
            ? "¡Hola! ¿Preguntas sobre Vellu? Te ayudo con gusto: cuánto cuesta, cómo funciona o si encaja con tu salón. Pregunta lo que quieras. ¿No encuentras la respuesta conmigo? Escribe a Mirah Ventures en mirahventures@vellu.cc."
            : "Hi! Questions about Vellu? Happy to help — pricing, how it works, or whether it fits your salon. Ask away. Can't get the answer from me? Email Mirah Ventures at mirahventures@vellu.cc."}
          subtitle={lang === "nl" ? "Vragen over Vellu?" : lang === "es" ? "¿Preguntas sobre Vellu?" : "Questions about Vellu?"}
        />
      </div>
    </Layout>
  );
}

export { LandingScreen };
export default LandingScreen;
