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
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
// Telefoon: één balk onderaan met chat + proefknop (11-11-2026). Eerst zweefden
// er twee losse dingen: links een ronde chatbol, rechts de proefpil — ze lagen
// over de inhoud en naast elkaar oogde het rommelig. De balk komt pas na de
// hero (die blijft schoon), wijkt bij de finale (daar staat dezelfde knop al)
// en zakt weg zolang de chat open is. Desktop houdt de pil + chatknop.
function AtMobileBar({ lang, onStart }) {
  const L = (nl, en, es) => (lang === "nl" ? nl : lang === "es" ? es : en);
  const [pastHero, setPastHero] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const fin = document.querySelector("[data-finale-ctas]");
      const finIn = fin ? fin.getBoundingClientRect().top < window.innerHeight - 24 : false;
      setPastHero(window.scrollY > 600 && !finIn);
    };
    const onChat = (e) => setChatOpen(!!(e.detail && e.detail.open));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("vellu-chat-state", onChat);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("vellu-chat-state", onChat);
    };
  }, []);
  const show = pastHero && !chatOpen;
  return (
    <div data-mobile-bar={show ? "visible" : "hidden"} aria-hidden={!show}
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
        display: "flex", gap: 10, padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
        background: "rgba(244,239,230,0.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        borderTop: `1px solid ${PUTTY}`, boxShadow: "0 -12px 28px -20px rgba(40,30,20,0.45)",
        transform: show ? "translateY(0)" : "translateY(110%)", pointerEvents: show ? "auto" : "none",
        transition: "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
      }}>
      <button type="button" tabIndex={show ? 0 : -1} onClick={() => window.dispatchEvent(new Event("vellu-open-chat"))}
        aria-label={L("Stel een vraag", "Ask a question", "Haz una pregunta")}
        style={{ width: 48, height: 48, flexShrink: 0, padding: 0, borderRadius: AT_RADIUS, border: `1px solid ${MUSHROOM}`, background: "transparent", color: ESPRESSO, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
      <button type="button" tabIndex={show ? 0 : -1} onClick={onStart}
        style={{ flex: 1, minWidth: 0, height: 48, borderRadius: AT_RADIUS, border: "none", background: ESPRESSO, color: BONE, fontFamily: "'Jost',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}>
        {L("Probeer 14 dagen gratis", "Try 14 days free", "Prueba 14 días gratis")}
      </button>
    </div>
  );
}

// "Alles wat je salon nodig heeft" als vier thema's met elk een eigen
// app-beeld (11-11-2026, homepage-review: acht kaartjes met één regel
// verkochten Vellu te klein en waren op de telefoon drie schermen lang).
// Desktop: thema's links, beeld rechts. Telefoon: vier knoppen (2x2) boven het
// beeld, punten eronder. De beelden zijn HTML, net als de hero-telefoon:
// scherp, per taal, niets te laden. Ze bootsen echte schermen van de
// demosalon Bloom Studio na (zelfde namen, diensten en prijzen). Geen
// sterren of reviewcijfers: dat zouden verzonnen cijfers zijn. Elke belofte
// hieronder bestaat echt in de app; Google Agenda-koppeling staat uit, dus
// "agenda in je telefoon" (de agenda-feed) en niet "Google Agenda".
const TH_W = 520, TH_H = 390;

function useFitScale(designW, max = 1.1) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // ResizeObserver meldt zich direct na observe() één keer: geen setState in het effect zelf.
    const ro = new ResizeObserver(() => setScale(Math.min(max, el.clientWidth / designW)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [designW, max]);
  return [ref, scale];
}

function AtThemeVisual({ id, lang }) {
  const L = (nl, en, es) => (lang === "nl" ? nl : lang === "es" ? es : en);
  const sub = "#7A6A55";
  const card = { position: "absolute", inset: 0, boxSizing: "border-box", background: "#FBF8F3", border: `1px solid ${PUTTY}`, borderRadius: 16, boxShadow: "0 34px 60px -34px rgba(69,58,43,0.55), 0 2px 5px rgba(69,58,43,0.06)", fontFamily: "'Jost',sans-serif", color: INK, overflow: "hidden" };
  const label = { fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: EARTH };
  const avatar = (txt, size = 34) => <span style={{ width: size, height: size, borderRadius: "50%", background: `${EARTH}1f`, color: EARTH, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond',serif", fontSize: size * 0.48, flexShrink: 0 }}>{txt}</span>;

  if (id === "book") {
    const days = L(["ma", "di", "wo", "do", "vr", "za"], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ["lun", "mar", "mié", "jue", "vie", "sáb"]);
    const slots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "15:00", "15:30", "16:30"];
    const taken = new Set(["09:30", "11:00", "13:30"]);
    return (
      <div style={{ ...card, padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {avatar("B")}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Bloom Studio</div>
            <div style={{ fontSize: 11, color: sub, marginTop: 1 }}>{L("BIAB nieuwe set", "BIAB new set", "BIAB set nuevo")} · 75 min · €52,00</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: EARTH, border: `1px solid ${PUTTY}`, borderRadius: 8, padding: "6px 9px", background: BONE }}><NavIcon name="link" size={12} color={EARTH} />vellu.cc/bloomstudio</span>
        </div>
        <div style={{ height: 1, background: PUTTY, margin: "16px 0 14px" }} />
        <div style={label}>{L("Kies een datum", "Pick a date", "Elige una fecha")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 9 }}>
          {days.map((d, i) => {
            const on = i === 1;
            return (
              <div key={d} style={{ textAlign: "center", padding: "7px 0 6px", borderRadius: 8, background: on ? EARTH : BONE, color: on ? BONE : INK, border: `1px solid ${on ? EARTH : PUTTY}` }}>
                <div style={{ fontSize: 10, letterSpacing: "0.06em", opacity: 0.8 }}>{d}</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, lineHeight: 1.05 }}>{16 + i}</div>
              </div>
            );
          })}
        </div>
        <div style={{ ...label, marginTop: 16 }}>{L("Kies een tijd", "Pick a time", "Elige una hora")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7, marginTop: 9 }}>
          {slots.map((s) => {
            const on = s === "10:00", off = taken.has(s);
            return (
              <div key={s} style={{ textAlign: "center", fontSize: 12, padding: "8px 0", borderRadius: 8, fontWeight: on ? 600 : 400, background: on ? INK : off ? "transparent" : BONE, color: on ? BONE : off ? "#BFB29E" : INK, border: `1px ${off ? "dashed" : "solid"} ${on ? INK : PUTTY}` }}>{s}</div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 22, right: 22, bottom: 20, height: 46, borderRadius: 8, background: EARTH, color: BONE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {L("Boek di 17 nov · 10:00", "Book Tue 17 Nov · 10:00", "Reservar mar 17 nov · 10:00")}
        </div>
      </div>
    );
  }

  if (id === "paid") {
    const methods = [L("Pin", "Card", "Tarjeta"), L("Contant", "Cash", "Efectivo"), L("Overschrijving", "Transfer", "Transferencia"), L("Op rekening", "On account", "A cuenta")];
    const row = (name, who, price) => (
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "9px 0", borderBottom: `1px solid ${PUTTY}` }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{name}</span>
        {who && <span style={{ fontSize: 11, color: sub }}>{who}</span>}
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, minWidth: 66, textAlign: "right" }}>{price}</span>
      </div>
    );
    return (
      <div style={{ ...card, padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 400 }}>{L("Afrekenen", "Checkout", "Cobrar")}</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500 }}>{avatar("NS", 28)}Naomi Smit</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {row(L("BIAB nieuwe set", "BIAB new set", "BIAB set nuevo"), "Noor", "€52,00")}
          {row("Brow shaping", "", "€18,00")}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>{L("Totaal", "Total", "Total")}</span>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, lineHeight: 1 }}>€70,00</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, color: EARTH }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><NavIcon name="check" size={13} color={EARTH} />{L("Commissie aan Vellu", "Commission to Vellu", "Comisión para Vellu")}</span>
          <span style={{ fontWeight: 600 }}>€0,00</span>
        </div>
        <div style={{ ...label, marginTop: 16 }}>{L("Betaalwijze", "Payment method", "Forma de pago")}</div>
        <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
          {methods.map((m, i) => (
            <span key={m} style={{ flex: 1, textAlign: "center", fontSize: 11.5, padding: "9px 4px", borderRadius: 8, whiteSpace: "nowrap", background: i === 0 ? INK : BONE, color: i === 0 ? BONE : INK, border: `1px solid ${i === 0 ? INK : PUTTY}`, fontWeight: i === 0 ? 600 : 400 }}>{m}</span>
          ))}
        </div>
        <div style={{ position: "absolute", left: 24, right: 24, bottom: 20 }}>
          <div style={{ height: 46, borderRadius: 8, background: EARTH, color: BONE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>{L("Afrekenen · €70,00", "Check out · €70,00", "Cobrar · €70,00")}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: sub, marginTop: 9 }}><NavIcon name="mail" size={12} color={sub} />{L("De factuur gaat per mail naar Naomi", "The invoice is emailed to Naomi", "La factura se envía a Naomi por correo")}</div>
        </div>
      </div>
    );
  }

  if (id === "keep") {
    const acts = [
      { icon: "send", t: L("Herinnering verstuurd", "Reminder sent", "Recordatorio enviado"), m: L("1 dag van tevoren", "1 day before", "1 día antes") },
      { icon: "mail", t: L("Reviewverzoek verstuurd", "Review request sent", "Solicitud de reseña enviada"), m: L("na het bezoek", "after the visit", "después de la visita") },
      { icon: "gift", t: L("Verjaardagscode verstuurd", "Birthday code sent", "Código de cumpleaños enviado"), m: L("in de verjaardagsmaand", "in the birthday month", "en el mes del cumpleaños") },
    ];
    return (
      <div style={{ ...card, padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {avatar("SJ", 42)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Sophie Jansen</div>
            <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>{L("9 bezoeken", "9 visits", "9 visitas")} · Signature facial</div>
          </div>
          <span style={{ fontSize: 10.5, color: EARTH, border: `1px solid ${PUTTY}`, borderRadius: 8, padding: "6px 9px", background: BONE, whiteSpace: "nowrap" }}>{L("Volgende: di 17 nov · 14:30", "Next: Tue 17 Nov · 14:30", "Próxima: mar 17 nov · 14:30")}</span>
        </div>
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: BONE, border: `1px solid ${PUTTY}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={label}>{L("Stempelkaart", "Loyalty card", "Tarjeta de fidelidad")}</span>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 19 }}>7 / 10</span>
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} style={{ width: 26, height: 26, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: i < 7 ? EARTH : "transparent", border: i < 7 ? "none" : `1.5px dashed ${MUSHROOM}` }}>
                {i < 7 && <NavIcon name="check" size={12} color={BONE} />}
              </span>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "10px 14px", borderLeft: `3px solid ${MUSHROOM}`, background: `${PUTTY}55`, borderRadius: "0 8px 8px 0" }}>
          <div style={{ fontSize: 10.5, color: sub }}>{L("Notitie · laatste bezoek", "Note · last visit", "Nota · última visita")}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>{L("Gevoelige huid: milde peeling. Advies: dagelijks SPF.", "Sensitive skin: gentle peel. Advice: daily SPF.", "Piel sensible: peeling suave. Consejo: SPF a diario.")}</div>
        </div>
        <div style={{ marginTop: 10 }}>
          {acts.map((a) => (
            <div key={a.t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: `${EARTH}14`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><NavIcon name={a.icon} size={13} color={EARTH} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{a.t}</span>
              <span style={{ fontSize: 10.5, color: sub }}>{a.m}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // "run": dagagenda met twee kolommen (jij en Noor), 09:00-14:00.
  const ROW = 50, START = 9 * 60;
  const you = L("Jij", "You", "Tú");
  const appts = [
    { col: 0, s: "09:00", e: "09:45", t: L("Gel manicure", "Gel manicure", "Manicura en gel"), c: "Naomi" },
    { col: 0, s: "10:30", e: "11:45", t: L("BIAB nieuwe set", "BIAB new set", "BIAB set nuevo"), c: "Sophie" },
    { col: 0, s: "13:00", e: "13:45", t: L("Gel manicure", "Gel manicure", "Manicura en gel"), c: "Isabella" },
    { col: 1, s: "09:30", e: "10:30", t: "Lash lift", c: "Emma" },
    { col: 1, s: "11:00", e: "11:30", t: "Brow shaping", c: "Julia" },
    { col: 1, s: "12:00", e: "13:15", t: L("BIAB nieuwe set", "BIAB new set", "BIAB set nuevo"), c: "Femke" },
  ];
  const mins = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const top = (hm) => ((mins(hm) - START) / 60) * ROW;
  return (
    <div style={{ ...card, padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26 }}>{L("Vandaag", "Today", "Hoy")}</span>
        <span style={{ fontSize: 11.5, color: sub }}>{L("di 17 nov", "Tue 17 Nov", "mar 17 nov")}</span>
        <span style={{ flex: 1 }} />
        {[[you, EARTH], ["Noor", MUSHROOM]].map(([n, col]) => (
          <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, marginLeft: 12 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: col }} />{n}</span>
        ))}
      </div>
      <div style={{ position: "relative", marginTop: 14, height: ROW * 6, display: "grid", gridTemplateColumns: "44px 1fr 1fr", columnGap: 8 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * ROW, borderTop: `1px solid ${PUTTY}`, fontSize: 10, color: sub, paddingTop: 3 }}>{String(9 + i).padStart(2, "0")}:00</div>
        ))}
        {appts.map((a) => {
          const h = Math.max(22, top(a.e) - top(a.s) - 3);
          const col = a.col === 0 ? EARTH : MUSHROOM;
          return (
            <div key={a.s + a.col} style={{ position: "absolute", zIndex: 1, top: top(a.s) + 2, height: h, left: a.col === 0 ? 52 : "calc(52px + (100% - 52px) / 2 + 4px)", width: "calc((100% - 52px) / 2 - 4px)", boxSizing: "border-box", borderRadius: 8, background: a.col === 0 ? "#ECE5DA" : "#F3EBDD", borderLeft: `3px solid ${col}`, padding: "4px 8px", overflow: "hidden" }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.t}</div>
              {h > 34 && <div style={{ fontSize: 10.5, color: sub, whiteSpace: "nowrap" }}>{a.s} · {a.c}</div>}
            </div>
          );
        })}
        <div style={{ position: "absolute", zIndex: 2, left: 44, right: 0, top: top("11:50"), height: 0, borderTop: `1.5px solid ${INK}` }}>
          <span style={{ position: "absolute", left: -5, top: -5, width: 8, height: 8, borderRadius: "50%", background: INK }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 22, right: 22, bottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: sub }}>
        <NavIcon name="calendar" size={12} color={sub} />{L("Ook in de agenda van je telefoon", "Also in your phone's calendar", "También en el calendario de tu móvil")}
      </div>
    </div>
  );
}

// Klein beeld per stap van "In 3 stappen live" (11-11-2026, optie 3): de
// prijslijst die Vellu inleest, het overzetten uit je oude systeem, en je
// link in een bio. Vloeibaar (max. 300 px), dus ook op een smalle telefoon.
function AtStepVisual({ n, lang }) {
  const L = (nl, en, es) => (lang === "nl" ? nl : lang === "es" ? es : en);
  const sub = "#7A6A55";
  const box = { width: "100%", boxSizing: "border-box", background: `${PUTTY}47`, border: `1px solid ${PUTTY}`, borderRadius: 12, padding: 12, fontFamily: "'Jost',sans-serif", color: INK, textAlign: "left" };
  const chip = { display: "flex", alignItems: "center", gap: 7, background: "#FBF8F3", border: `1px solid ${PUTTY}`, borderRadius: 8, padding: "6px 9px" };
  if (n === "1") {
    const items = [[L("Gel manicure", "Gel manicure", "Manicura en gel"), "38"], ["BIAB", "52"], ["Lash lift", "49"]];
    return (
      <div style={{ ...box, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 98, flexShrink: 0, background: "#FFFDF8", border: `1px solid ${PUTTY}`, borderRadius: 6, padding: "8px 8px 9px", transform: "rotate(-4deg)", boxShadow: "0 8px 14px -10px rgba(69,58,43,0.5)" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontSize: 13, marginBottom: 4 }}>{L("Prijslijst", "Price list", "Precios")}</div>
          {items.map(([nm, p]) => (
            <div key={nm} style={{ display: "flex", alignItems: "baseline", gap: 3, fontSize: 8.5, color: sub, lineHeight: 1.7 }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nm}</span>
              <span style={{ flex: 1, borderBottom: `1px dotted ${MUSHROOM}`, minWidth: 6 }} />
              <span>{p}</span>
            </div>
          ))}
        </div>
        <span style={{ color: EARTH, flexShrink: 0 }}><ArrowIcon size={14} /></span>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 5 }}>
          {items.map(([nm, p]) => (
            <div key={nm} style={{ ...chip, padding: "5px 8px" }}>
              <NavIcon name="check" size={11} color={EARTH} />
              <span style={{ fontSize: 10.5, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nm}</span>
              <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 13 }}>€{p},00</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (n === "2") {
    const rows = [[L("Klanten", "Clients", "Clientes"), L("met telefoon en e-mail", "with phone and email", "con teléfono y correo")], [L("Komende afspraken", "Upcoming appointments", "Próximas citas"), L("in je agenda", "in your calendar", "en tu agenda")]];
    return (
      <div style={box}>
        <div style={chip}>
          <NavIcon name="facturen" size={13} color={EARTH} />
          <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>export.xlsx</span>
          <span style={{ fontSize: 10, color: EARTH, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>{L("Klaar", "Done", "Listo")}</span>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: PUTTY, margin: "9px 2px 10px", overflow: "hidden" }}><div style={{ width: "100%", height: "100%", background: EARTH }} /></div>
        {rows.map(([a, b]) => (
          <div key={a} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px" }}>
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: EARTH, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><NavIcon name="check" size={10} color={BONE} /></span>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>{a}</span>
            <span style={{ fontSize: 10.5, color: sub }}>{b}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, padding: 2, background: `linear-gradient(140deg, ${MUSHROOM}, ${EARTH})` }}>
          <span style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#FBF8F3", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: EARTH }}>B</span>
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>bloomstudio</div>
          <div style={{ fontSize: 10.5, color: sub }}>Nails · Brows · Lashes · Amsterdam</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 11, color: EARTH, fontWeight: 600 }}>
        <NavIcon name="link" size={12} color={EARTH} /><span style={{ borderBottom: `1px solid ${EARTH}66` }}>vellu.cc/bloomstudio</span>
      </div>
      <div style={{ marginTop: 9, height: 30, borderRadius: 8, background: EARTH, color: BONE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {L("Boek een afspraak", "Book an appointment", "Reserva una cita")}
      </div>
    </div>
  );
}

function AtFeatureThemes({ lang }) {
  const L = (nl, en, es) => (lang === "nl" ? nl : lang === "es" ? es : en);
  const themes = [
    { id: "book", title: L("Geboekt worden", "Get booked", "Recibe reservas"),
      lead: L("Je eigen boekingspagina, dag en nacht open.", "Your own booking page, open day and night.", "Tu propia página de reservas, abierta día y noche."),
      points: [
        L("Jouw naam, logo, kleuren en foto's van je werk op vellu.cc/jouw-naam", "Your name, logo, colours and photos of your work at vellu.cc/your-name", "Tu nombre, logo, colores y fotos de tu trabajo en vellu.cc/tu-nombre"),
        L("Klanten kiezen zelf behandeling, medewerker en tijd, in het Nederlands, Engels of Spaans", "Clients pick the treatment, staff member and time themselves, in English, Dutch or Spanish", "Tus clientes eligen tratamiento, profesional y hora, en español, inglés o neerlandés"),
        L("Een wachtlijst voor als je vol zit", "A waiting list for when you're fully booked", "Lista de espera para cuando no quede sitio"),
        L("Vooruitbetalen of een no-show-vergoeding, als je dat wilt", "Prepayment or a no-show fee, if you want one", "Pago por adelantado o cargo por no presentarse, si lo quieres"),
      ] },
    { id: "paid", title: L("Betaald worden", "Get paid", "Cobra"),
      lead: L("0% commissie: wat je klant betaalt, is van jou.", "0% commission: what your client pays is yours.", "0% de comisión: lo que paga tu cliente es tuyo."),
      points: [
        L("Een vast bedrag per maand, geen percentage per boeking", "One fixed monthly price, no cut per booking", "Una cuota fija al mes, sin porcentaje por reserva"),
        L("Afrekenen met pin, contant, overschrijving of op rekening", "Check out by card, cash, bank transfer or on account", "Cobra con tarjeta, efectivo, transferencia o a cuenta"),
        L("De factuur gaat automatisch per mail naar je klant", "The invoice is emailed to your client automatically", "La factura se envía automáticamente por correo a tu cliente"),
        L("Omzet en rapporten, ook als Excel voor je boekhouder", "Revenue and reports, also as Excel for your accountant", "Ingresos e informes, también en Excel para tu gestor"),
      ] },
    { id: "keep", title: L("Klanten terug laten komen", "Keep clients coming back", "Haz que vuelvan"),
      lead: L("Vellu onthoudt alles en verstuurt de berichten.", "Vellu remembers everything and sends the messages.", "Vellu lo recuerda todo y envía los mensajes."),
      points: [
        L("Bevestiging, herinnering en follow-up gaan vanzelf per mail", "Confirmation, reminder and follow-up go out by email on their own", "Confirmación, recordatorio y seguimiento se envían solos por correo"),
        L("Na elk bezoek een verzoek om een review", "A review request after every visit", "Una solicitud de reseña después de cada visita"),
        L("Stempelkaart en verjaardagscodes", "Loyalty card and birthday codes", "Tarjeta de fidelidad y códigos de cumpleaños"),
        L("Per klant notities en advies van elk bezoek", "Notes and advice from every visit, per client", "Notas y consejos de cada visita, por cliente"),
      ] },
    { id: "run", title: L("Je salon runnen", "Run your salon", "Gestiona tu salón"),
      lead: L("Agenda, team en cijfers op één plek.", "Calendar, team and numbers in one place.", "Agenda, equipo y cifras en un solo lugar."),
      points: [
        L("Elke medewerker een eigen login, agenda en diensten", "Each staff member gets their own login, calendar and services", "Cada profesional con su propio acceso, agenda y servicios"),
        L("Werkt als app op je telefoon, en je afspraken staan ook in je eigen agenda", "Works as an app on your phone, and your appointments show up in your own calendar too", "Funciona como app en tu móvil, y tus citas aparecen también en tu propio calendario"),
        L("Klanten en afspraken overzetten uit je oude systeem", "Bring your clients and appointments over from your old system", "Pasa tus clientes y citas desde tu sistema anterior"),
        L("Kassa, voorraad en kortingscodes", "Till, stock and discount codes", "Caja, inventario y códigos de descuento"),
      ] },
  ];
  const [active, setActive] = useState(0);
  const [stageRef, scale] = useFitScale(TH_W);
  const tabRefs = useRef([]);
  const onKey = (e, i) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + themes.length) % themes.length;
    setActive(n);
    tabRefs.current[n]?.focus();
  };
  return (
    <div className="at-th" data-feature-themes>
      <div className="at-th-tabs" role="tablist" aria-label={L("Wat Vellu doet", "What Vellu does", "Qué hace Vellu")}>
        {themes.map((th, i) => (
          <button key={th.id} type="button" role="tab" id={`at-th-tab-${th.id}`} aria-selected={i === active} aria-controls={`at-th-panel-${th.id}`}
            tabIndex={i === active ? 0 : -1} ref={(el) => { tabRefs.current[i] = el; }}
            className={`at-th-tab${i === active ? " on" : ""}`} onClick={() => setActive(i)} onKeyDown={(e) => onKey(e, i)}>
            <span className="at-th-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="at-th-tabtext">
              <span className="at-th-title">{th.title}</span>
              <span className="at-th-lead">{th.lead}</span>
            </span>
            <span className="at-th-go" aria-hidden="true"><ArrowIcon size={13} /></span>
          </button>
        ))}
      </div>
      <div className="at-th-stage" ref={stageRef}>
        <div style={{ width: TH_W * scale, height: TH_H * scale, margin: "0 auto", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: TH_W, height: TH_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
            {themes.map((th, i) => (
              <div key={th.id} className={`at-th-visual${i === active ? " on" : ""}`} aria-hidden="true">
                <AtThemeVisual id={th.id} lang={lang} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="at-th-detail">
        {themes.map((th, i) => (
          <div key={th.id} role="tabpanel" id={`at-th-panel-${th.id}`} aria-labelledby={`at-th-tab-${th.id}`} hidden={i !== active} className="at-th-panel">
            <div className="at-th-panel-lead">{th.lead}</div>
            <ul className="at-th-points">
              {th.points.map((p) => (
                <li key={p}><span className="at-th-check" aria-hidden="true"><NavIcon name="check" size={12} color={EARTH} /></span>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

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
// Sinds 11-11-2026 (Faisal: "instead of opening at the bottom can it open as a
// pop up that u can close with a x at the top") een venster boven de pagina:
// kruisje rechtsboven, Esc of klik ernaast sluit; de tabel scrolt binnen het
// venster, de kolomkop blijft bovenaan staan. Zacht in- en uitfaden.
function AtPlanCompare({ lang, yearly, onStart, startLabel }) {
  const [open, setOpen] = useState(false);      // in de DOM
  const [shown, setShown] = useState(false);    // zichtbaar (voor de animatie)
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const L = (nl, en, es) => (lang === "nl" ? nl : lang === "es" ? es : en);
  const openModal = () => { setOpen(true); requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); };
  const closeModal = () => { setShown(false); setTimeout(() => { setOpen(false); triggerRef.current?.focus(); }, 280); };
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => closeRef.current?.focus(), 60);
    return () => { document.documentElement.style.overflow = prev; window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open]);
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
        <button type="button" ref={triggerRef} data-plan-compare-toggle aria-haspopup="dialog" aria-expanded={open} onClick={openModal}
          style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 26px", borderRadius: AT_RADIUS, border: `1px solid ${INK}`, background: "transparent", color: INK, fontFamily: "'Jost',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", transition: "background 0.2s, color 0.2s" }}>
          {L("Vergelijk Starter en Professional", "Compare Starter and Professional", "Compara Starter y Professional")}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
        </button>
      </div>
      {open && createPortal(
        <div data-plan-compare-overlay onClick={closeModal}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(40,32,24,0.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(10px, 3vw, 28px)", opacity: shown ? 1 : 0, transition: "opacity 0.28s ease" }}>
          <div role="dialog" aria-modal="true" aria-labelledby="at-cmp-title" data-plan-compare-dialog onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 820, maxHeight: "100%", display: "flex", flexDirection: "column", background: P.bgCard, border: `1px solid ${PUTTY}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 80px -30px rgba(40,30,20,0.6)", transform: shown ? "none" : "translateY(18px) scale(0.98)", transition: "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)", fontFamily: "'Jost',sans-serif" }}>
            {/* Kop met kruisje */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px clamp(14px, 3vw, 26px) 14px", borderBottom: `1px solid ${PUTTY}` }}>
              <div>
                <div id="at-cmp-title" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(22px, 3vw, 28px)", color: INK, lineHeight: 1.1 }}>Starter <span style={{ color: EARTH, fontStyle: "italic" }}>vs</span> Professional</div>
                <div style={{ fontSize: 12, color: P.textLabel, marginTop: 4 }}>{L("Alles wat elk plan bevat, naast elkaar.", "Everything each plan includes, side by side.", "Todo lo que incluye cada plan, lado a lado.")}</div>
              </div>
              <button type="button" ref={closeRef} data-plan-compare-close onClick={closeModal} aria-label={L("Sluiten", "Close", "Cerrar")}
                style={{ width: 40, height: 40, borderRadius: "50%", border: `1px solid ${PUTTY}`, background: "transparent", color: INK, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M2.5 2.5l9 9M11.5 2.5l-9 9" /></svg>
              </button>
            </div>
            {/* Tabel: scrolt binnen het venster */}
            <div data-plan-compare role="table" aria-label={L("Starter en Professional vergeleken", "Starter and Professional compared", "Starter y Professional comparados")}
              style={{ overflowY: "auto", overscrollBehavior: "contain", flex: 1, minHeight: 0 }}>
          <div role="row" className="at-cmp-row at-cmp-head" style={{ position: "sticky", top: 0, zIndex: 2, background: P.bgCard, borderBottom: `1px solid ${PUTTY}`, padding: "14px clamp(14px, 3vw, 26px)" }}>
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
              {onStart && (
                <div style={{ padding: "20px clamp(14px, 3vw, 26px) 24px", borderTop: `1px solid ${PUTTY}`, display: "flex", justifyContent: "center" }}>
                  {/* Eigen stijl i.p.v. .btn-primary: het venster hangt via een
                      portal buiten de Atelier-huid en werd dan app-goud
                      (Faisal 11-11); nu espresso zoals de andere knoppen. */}
                  <button type="button" data-plan-compare-start onClick={() => { closeModal(); onStart(); }}
                    style={{ padding: "16px 36px", borderRadius: AT_RADIUS, border: "none", background: INK, color: BONE, cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", boxShadow: "0 16px 30px -16px rgba(40,30,20,0.6)" }}>
                    {startLabel}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Sectiekop: gecentreerde serif-titel (nummers en streepje verwijderd op
// Faisals verzoek, 27-08). Sinds 11-11-2026 ook geen lijntje meer onder de
// titel ("ziet er AI-achtig uit"): in plaats daarvan staat één woord of stukje
// cursief in een accenttint (`accent`), net als "Jouw omzet." in de hero.
// `tone` volgt de band: bone (canvas), putty (lichte band), earth (rijke
// band, titel in bone) of mushroom (prijzenband, verdiept espresso); de
// accenttint is per band gekozen zodat hij leesbaar blijft.
function AtHead({ title, accent, sub, tone = "bone" }) {
  const onEarth = tone === "earth";
  const onMush = tone === "mushroom";
  const titleCol = onEarth ? BONE : onMush ? ESPRESSO_DEEP : INK;
  const accentCol = onEarth ? PUTTY : onMush ? ESPRESSO : EARTH;
  const subCol = onEarth ? `${BONE}e6` : onMush ? ESPRESSO_DEEP : tone === "putty" ? "#5f5240" : P.textLabel;
  const at = accent ? String(title).indexOf(accent) : -1;
  const body = at < 0 ? title : (
    <>
      {title.slice(0, at)}
      <em style={{ fontStyle: "italic", color: accentCol }}>{accent}</em>
      {title.slice(at + accent.length)}
    </>
  );
  return (
    <div style={{ textAlign: "center", marginBottom: 42 }}>
      <Reveal from="translateY(14px)" duration={0.55}>
        <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(30px, 5.4vw, 46px)", fontWeight: 300, lineHeight: 1.1, color: titleCol, letterSpacing: "0.01em" }}>{body}</h2>
      </Reveal>
      {sub && (
        <Reveal delay={160}>
          <div style={{ fontSize: 13, color: subCol, lineHeight: 1.65, maxWidth: 480, margin: "16px auto 0" }}>{sub}</div>
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
    url: "https://www.vellu.cc/"
  });
  const [faqOpen, setFaqOpen] = useState(null);
  // Alle salons zoeken: klapt open onder de uitgelichte salons (11-11-2026);
  // de zoeker laadt pas dan (scheelt de omslagfoto's van alle salons).
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderMounted, setFinderMounted] = useState(false);
  // Openen: eerst mounten (dicht), een frame later open zetten, anders start
  // de animatie niet; daarna meescrollen terwijl hij uitklapt.
  const openFinder = () => {
    setFinderMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setFinderOpen(true)));
    setTimeout(() => scrollToSection("all-salons"), 120);
  };
  const toggleFinder = () => { if (finderOpen) setFinderOpen(false); else openFinder(); };
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

  // Gestructureerde gegevens voor zoekmachines (11-11-2026): wie Vellu is,
  // het product met de twee prijzen, en de veelgestelde vragen zoals ze op de
  // pagina staan (in de taal van de bezoeker). Alleen op de homepage — de
  // salonpagina's delen index.html, dus dit hoort niet statisch daarin. Geen
  // beoordelingen of aantallen: die zouden we niet kunnen onderbouwen.
  useEffect(() => {
    const data = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": "https://www.vellu.cc/#org", name: "Vellu", url: "https://www.vellu.cc/", logo: "https://www.vellu.cc/icon-512.png", email: "mirahventures@vellu.cc",
          parentOrganization: { "@type": "Organization", name: "Mirah Ventures" } },
        { "@type": "WebSite", "@id": "https://www.vellu.cc/#site", url: "https://www.vellu.cc/", name: "Vellu", inLanguage: lang, publisher: { "@id": "https://www.vellu.cc/#org" } },
        { "@type": "SoftwareApplication", name: "Vellu", applicationCategory: "BusinessApplication", operatingSystem: "Web, iOS, Android",
          description: lang === "nl" ? "Boekingssysteem voor salons: eigen boekingspagina, herinneringen, kassa en facturen. Vast tarief, 0% commissie." : lang === "es" ? "Sistema de reservas para salones: página de reservas propia, recordatorios, caja y facturas. Precio fijo, 0% de comisión." : "Booking system for salons: your own booking page, reminders, till and invoices. Fixed price, 0% commission.",
          publisher: { "@id": "https://www.vellu.cc/#org" },
          offers: plans.map((p) => ({ "@type": "Offer", name: p.name, price: String(p.price), priceCurrency: "EUR", category: "subscription",
            priceSpecification: { "@type": "UnitPriceSpecification", price: String(p.price), priceCurrency: "EUR", unitText: "MONTH" } })) },
        { "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      ],
    };
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = "vellu-ld";
    el.textContent = JSON.stringify(data);
    document.getElementById("vellu-ld")?.remove();
    document.head.appendChild(el);
    return () => el.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

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
          /* Vier thema's (AtFeatureThemes). Desktop: knoppen linksboven, punten
             linksonder, beeld rechts over beide rijen. Telefoon: knoppen 2x2,
             dan beeld, dan punten. */
          .at-th { display: grid; gap: 22px; grid-template-areas: "tabs" "stage" "detail"; }
          @media (min-width: 900px) { .at-th { grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr); grid-template-areas: "tabs stage" "detail stage"; column-gap: clamp(36px, 5vw, 72px); row-gap: 18px; align-items: start; } }
          .at-th-tabs { grid-area: tabs; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          @media (min-width: 900px) { .at-th-tabs { grid-template-columns: 1fr; gap: 6px; } }
          /* Elk thema is zichtbaar een knop (Faisal 11-11: "niet echt knoppen,
             gewoon tekst"): lichte bone-vlak + rand + pijltje; de gekozen is
             massief bone met een aarde-streep links. */
          .at-th-tab { display: flex; align-items: baseline; gap: 10px; text-align: left; padding: 12px 12px; border-radius: 8px; border: 1px solid ${EARTH}38; background: ${BONE}73; cursor: pointer; font-family: 'Jost', sans-serif; color: ${INK}; box-shadow: 0 6px 14px -12px rgba(69,58,43,0.45); transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease; }
          .at-th-tab:hover { background: ${BONE}c7; border-color: ${EARTH}66; transform: translateY(-1px); }
          .at-th-tab.on { background: ${BONE}; border-color: ${EARTH}80; box-shadow: inset 3px 0 0 ${EARTH}, 0 18px 32px -24px rgba(69,58,43,0.55); transform: none; }
          .at-th-go { display: none; margin-left: auto; align-self: center; color: ${MUSHROOM}; flex-shrink: 0; transition: color 0.25s ease, transform 0.25s ease; }
          .at-th-tab:hover .at-th-go { color: ${EARTH}; transform: translateX(3px); }
          .at-th-tab.on .at-th-go { color: ${EARTH}; }
          .at-th-tab:focus-visible { outline: 2px solid ${EARTH}; outline-offset: 2px; }
          .at-th-num { font-family: 'Cormorant Garamond', serif; font-size: 17px; color: ${MUSHROOM}; flex-shrink: 0; transition: color 0.25s ease; }
          .at-th-tab.on .at-th-num { color: ${EARTH}; }
          .at-th-tabtext { display: flex; flex-direction: column; min-width: 0; }
          .at-th-title { font-family: 'Cormorant Garamond', serif; font-size: 18px; line-height: 1.15; color: ${INK}; }
          .at-th-lead { display: none; }
          @media (min-width: 900px) {
            .at-th-tabs { gap: 10px; }
            .at-th-tab { padding: 16px 18px; gap: 16px; }
            .at-th-go { display: inline-flex; }
            .at-th-num { font-size: 22px; }
            .at-th-title { font-size: 25px; }
            .at-th-lead { display: block; font-size: 13px; color: #6b5d4a; margin-top: 4px; line-height: 1.5; }
          }
          .at-th-stage { grid-area: stage; min-width: 0; }
          @media (min-width: 900px) { .at-th-stage { align-self: center; } }
          .at-th-visual { position: absolute; inset: 0; opacity: 0; transform: translateY(10px); visibility: hidden; transition: opacity 0.45s ease, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear 0.45s; }
          .at-th-visual.on { opacity: 1; transform: none; visibility: visible; transition: opacity 0.45s ease, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), visibility 0s; }
          .at-th-detail { grid-area: detail; }
          .at-th-panel-lead { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 21px; color: ${EARTH}; margin-bottom: 10px; }
          @media (min-width: 900px) { .at-th-panel-lead { display: none; } .at-th-detail { padding-left: 18px; } }
          .at-th-points { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
          .at-th-points li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.55; color: #4f4333; }
          .at-th-check { width: 20px; height: 20px; border-radius: 50%; background: ${EARTH}1f; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
          @media (prefers-reduced-motion: reduce) { .at-th-visual, .at-th-visual.on, .at-th-tab, .at-th-tab:hover, .at-th-tab:hover .at-th-go { transition: none; transform: none; } }
          /* Citaten van salons (Beoordeel Vellu, 16-09): dezelfde zwevende
             bone-kaarten, gecentreerd, één tot drie naast elkaar. */
          .at-quote-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; max-width: 900px; margin: 0 auto; }
          .at-quote-card { height: 100%; box-sizing: border-box; background: ${P.bgCard}; border: 1px solid ${PUTTY}; border-radius: 16px; padding: 22px 22px 20px; box-shadow: 0 22px 40px -26px rgba(69,58,43,0.5), 0 2px 4px rgba(69,58,43,0.05); transition: transform 0.28s ease, box-shadow 0.28s ease; }
          .at-quote-card:hover { transform: translateY(-5px); box-shadow: 0 34px 54px -26px rgba(69,58,43,0.55), 0 2px 4px rgba(69,58,43,0.05); }
          @media (prefers-reduced-motion: reduce) { .at-quote-card, .at-quote-card:hover { transform: none; } }
          /* Hero-kaartjes rond de telefoon (AtHeroPhone). Telefoon = 276 px breed
             en gecentreerd; de kaartjes steken er half overheen. max()/min()
             houden ze binnen de kolom op een smal scherm. Breedte groeit mee
             met de tekst ("Herinnering verstuurd · automatisch" paste niet in
             222 px); n2 hangt aan de rechterkant en groeit dus over de telefoon. */
          .at-hero-note { position: absolute; width: max-content; min-width: 222px; max-width: 280px; z-index: 4; }
          .at-hero-note.n1 { top: 8px; left: max(0px, calc(50% - 138px - 84px)); }
          .at-hero-note.n2 { top: 252px; right: max(0px, calc(50% - 236px)); }
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
            .at-hero-note { width: 188px; min-width: 0; max-width: none; }
            .at-hero-note.n2 { right: max(0px, calc(50% - 202px)); }
            .at-hero-note-card { padding: 8px 10px; gap: 8px; }
            .at-hero-note-meta { display: none; }
          }
          @media (prefers-reduced-motion: reduce) { .at-hero-note-card { animation: none; } }
          .at-finder { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.55s cubic-bezier(0.55, 0, 0.3, 1); }
          .at-finder.open { grid-template-rows: 1fr; transition: grid-template-rows 0.75s cubic-bezier(0.45, 0, 0.2, 1); }
          .at-finder-clip { overflow: hidden; min-height: 0; }
          .at-finder-inner { opacity: 0; transform: translateY(-18px) scale(0.985); transform-origin: top center; transition: opacity 0.3s ease, transform 0.55s cubic-bezier(0.55, 0, 0.3, 1); }
          .at-finder.open .at-finder-inner { opacity: 1; transform: none; transition: opacity 0.55s ease 0.15s, transform 0.75s cubic-bezier(0.45, 0, 0.2, 1); }
          .at-finder:not(.open) .at-finder-inner { visibility: hidden; transition: opacity 0.3s ease, transform 0.55s cubic-bezier(0.55, 0, 0.3, 1), visibility 0s linear 0.55s; }
          @media (prefers-reduced-motion: reduce) { .at-finder, .at-finder-inner, .at-finder.open .at-finder-inner { transition: none; } }
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
          /* Beeld per stap: telefoon onder de tekst over de hele breedte,
             desktop als derde kolom rechts. */
          .at-step-vis { grid-column: 1 / -1; justify-self: center; width: 100%; max-width: 300px; }
          @media (min-width: 900px) { .at-step { grid-template-columns: clamp(64px, 11vw, 128px) 1fr 300px; } .at-step-vis { grid-column: auto; } }
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
              <button className="at-nav-find" onClick={() => { if (finderOpen) scrollToSection("all-salons"); else openFinder(); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: EARTH, whiteSpace: "nowrap" }}>
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
                  {lang === "nl" ? "Gebruikt door verschillende soorten beautyprofessionals"
                    : lang === "es" ? "Usado por distintos tipos de profesionales de la belleza"
                    : "Used by different types of beauty professionals"}
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
            <AtHead title={lang === "nl" ? "Salons in de spotlight" : lang === "es" ? "Salones destacados" : "Salons in the spotlight"} accent={lang === "es" ? "destacados" : "spotlight"}
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
              <button type="button" data-all-salons-toggle aria-expanded={finderOpen} onClick={toggleFinder}
                style={{ background: "none", border: "none", borderBottom: `1px solid ${INK}`, cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 13, color: INK, padding: "2px 0", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {finderOpen
                  ? (lang === "nl" ? "Zoeken sluiten" : lang === "es" ? "Cerrar búsqueda" : "Close search")
                  : (lang === "nl" ? "Zoek andere salons" : lang === "es" ? "Buscar otros salones" : "Search for other salons")}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transition: "transform 0.25s", transform: finderOpen ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            </div>
          </div>
          {/* Open- en dichtklappen met een animatie (Faisal 11-11: "now it just
              teleports"): de hoogte groeit via grid-template-rows 0fr → 1fr,
              de inhoud glijdt en vervaagt mee. De zoeker wordt pas bij de
              eerste keer openen geladen en blijft daarna staan, zodat ook het
              dichtklappen zichtbaar is. */}
          <div className={`at-finder${finderOpen ? " open" : ""}`} data-finder-wrap aria-hidden={!finderOpen}>
            <div className="at-finder-clip">
              <div id="all-salons" className="at-finder-inner" style={{ paddingBottom: "clamp(40px, 6vw, 64px)" }}>
                {finderMounted && <SalonFinder lang={lang} t={t} c={{ ...P, border: `${EARTH}3d` }} goToSlug={goToSlug} navigate={navigate} hideHeader accent={EARTH} radius={R} atelier newTab oneRow />}
              </div>
            </div>
          </div>
        </div>

        {/* De besparingsrekensom (earth-band) is weg sinds 11-11-2026: hij ging
            uit van "de meeste platforms rekenen 5–10% per boeking", en dat klopt
            niet voor Fresha, Setmore of Salonized (abonnement, plus bij Fresha
            en Treatwell een eenmalige vergoeding op nieuwe marketplace-klanten).
            Wat je voor €19/€35 krijgt staat nu volledig bij de prijzen. */}

        {/* ── 03 · HOE HET WERKT — terug op bone, redactionele rijen. ── */}
        <div id="how-it-works" style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(50px, 8vw, 84px) ${pad} 0`, position: "relative", zIndex: 10 }}>
          <AtHead title={t.liveIn3} accent={lang === "nl" ? "live" : lang === "es" ? "En línea" : "Live"} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {steps.map((s, i) => (
              <Reveal key={i} delay={i * 110}>
                <div className="at-step vl-glow" data-step-card onMouseMove={glowMove}>
                  {/* Cijfer in het midden van zijn kolom, tekst in het midden van
                      de hare (Faisal 15-09: "niet naar links gedrukt"). */}
                  {/* lining-nums: Cormorant tekent standaard "oude" cijfers, en
                      dan leek de 1 op een Romeinse I (Faisal 11-11). */}
                  <div data-step-num style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(40px, 6.4vw, 72px)", fontWeight: 300, color: MUSHROOM, lineHeight: 0.9, textAlign: "center", fontVariantNumeric: "lining-nums", fontFeatureSettings: '"lnum" 1' }}>{s.n}</div>
                  <div data-step-text style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(21px, 3vw, 28px)", fontWeight: 400, color: INK, marginBottom: 8 }}>{s.title}</div>
                    <div style={{ fontSize: 13.5, color: P.textLabel, lineHeight: 1.75, maxWidth: 560, margin: "0 auto" }}>{s.desc}</div>
                  </div>
                  <div className="at-step-vis" aria-hidden="true"><AtStepVisual n={s.n} lang={lang} /></div>
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

        {/* ── 04 · ALLES WAT JE NODIG HEBT — putty-band, vier thema's met app-beeld (AtFeatureThemes).
              Putty is licht genoeg voor espresso-tekst er direct op. Hierna
              lopen de banden door: mushroom (prijzen) → earth (FAQ) → espresso. ── */}
        <div style={{ background: PUTTY, position: "relative", zIndex: 10, marginTop: "clamp(44px, 7vw, 76px)" }}>
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}` }}>
            <AtHead title={t.everythingNeeded} accent={lang === "nl" ? "nodig heeft" : lang === "es" ? "necesita" : "needs"} tone="putty" />
            <Reveal delay={80}>
              <AtFeatureThemes lang={lang} />
            </Reveal>
          </div>
        </div>

        {/* ── 05 · PRIJZEN — mushroom-band direct onder putty (de tweede ladder
              loopt door naar earth en espresso). Starter-kaart bone,
              Professional espresso. ── */}
        <div style={{ background: MUSHROOM, position: "relative", zIndex: 10 }}>
        <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}`, position: "relative" }}>
          <AtHead title={t.simplePricing} accent={lang === "nl" ? "eerlijke prijzen" : lang === "es" ? "honestos" : "honest pricing"} tone="mushroom" />
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
          <AtPlanCompare lang={lang} yearly={billingCycle === "yearly"} onStart={() => ownerStart()} startLabel={t.startFree} />
        </div>
        </div>

        {/* ── 06 · FAQ — earth-band tussen mushroom en de espresso-finale; tekst
              in bone. ── */}
        <div style={{ background: EARTH, position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: `clamp(46px, 7vw, 76px) ${pad}` }}>
          <AtHead title={t.faqTitle} accent={lang === "nl" ? "vragen" : lang === "es" ? "frecuentes" : "FAQ"} tone="earth" />
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
        {isMobile
          ? <AtMobileBar lang={lang} onStart={() => ownerStart()} />
          : <StickyStartPill onClick={() => ownerStart()} label={t.startFree} bg={INK} fg={BONE} radius={R} hideWhenInView="[data-finale-ctas]" />}
        <SupportChat
          lang={lang}
          c={P}
          accent={ESPRESSO}
          isMobile={isMobile}
          side="left"
          launcherBottom={20}
          hideLauncher={isMobile}
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
