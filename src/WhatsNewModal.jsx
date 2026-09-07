// "Wat is er nieuw" — één venster bij het openen van de app na een release,
// met de punten uit releaseNotes.js. Kruisje of knop sluit; de aanroeper
// markeert daarna de nieuwste release als gezien. Zie releaseNotes.js voor
// wanneer het venster wél/niet verschijnt.
import { useState } from "react";
import { createPortal } from "react-dom";
import { NavIcon, LangToggle } from "./shared.jsx";

const KIND = {
  new: { nl: "Nieuw", en: "New", es: "Nuevo" },
  improved: { nl: "Verbeterd", en: "Improved", es: "Mejorado" },
  fix: { nl: "Opgelost", en: "Fixed", es: "Corregido" },
};

export default function WhatsNewModal({ releases, lang: appLang, c, accent, onClose }) {
  // Eigen taalkeuze voor dit venster: de taalknoppen in de app-kop zitten
  // achter de overlay, en wie de app in het Nederlands heeft wil de notes
  // soms tóch even in het Engels lezen. Verandert de app-taal niet.
  const [lang, setLang] = useState(appLang || "nl");
  if (!releases || releases.length === 0) return null;
  const L = (o) => (o && (o[lang] || o.nl || o.en)) || "";
  const fmtDate = (iso) => {
    try { return new Date(`${iso}T12:00:00`).toLocaleDateString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "long", year: "numeric" }); }
    catch { return iso; }
  };
  const kindColor = (k) => k === "fix" ? c.success : k === "improved" ? c.textSub : accent;
  return createPortal((
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={lang === "nl" ? "Wat is er nieuw" : lang === "es" ? "Novedades" : "What's new"}
        style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 24, padding: "22px 22px 18px", maxWidth: 460, width: "100%", maxHeight: "min(82vh, 640px)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>
              {lang === "nl" ? "Wat is er nieuw" : lang === "es" ? "Novedades" : "What's new"}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, lineHeight: 1.15 }}>{L(releases[0].title)}</div>
            <div style={{ marginTop: 10, display: "inline-flex" }}><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <button aria-label={lang === "nl" ? "Sluiten" : lang === "es" ? "Cerrar" : "Close"} onClick={onClose}
            style={{ width: 36, height: 36, padding: 0, borderRadius: 10, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <NavIcon name="xmark" size={14} color="currentColor" />
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0, paddingRight: 2 }}>
          {releases.map((r, ri) => (
            <div key={r.id} style={{ marginTop: ri === 0 ? 0 : 18 }}>
              <div style={{ fontSize: 10, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                {fmtDate(r.date)}{ri > 0 ? ` · ${L(r.title)}` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {r.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 100, border: `1px solid ${kindColor(it.kind)}55`, color: kindColor(it.kind), background: `${kindColor(it.kind)}14`, flexShrink: 0, marginTop: 1, minWidth: 66, textAlign: "center" }}>
                      {L(KIND[it.kind] || KIND.new)}
                    </span>
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: c.text }}>{L(it.text)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="btn-primary" onClick={onClose} style={{ width: "100%", marginTop: 16 }}>
          {lang === "nl" ? "Begrepen" : lang === "es" ? "Entendido" : "Got it"}
        </button>
        {/* Feedbackkanaal: bugs en ideeën rechtstreeks naar Vellu (info@, niet
            een privéadres). */}
        <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
          {lang === "nl" ? "Iets gevonden dat niet werkt, of een idee voor Vellu? " : lang === "es" ? "¿Algo que no funciona o una idea para Vellu? " : "Found something that doesn't work, or have an idea for Vellu? "}
          <a href={`mailto:mirahventures@vellu.cc?subject=${encodeURIComponent(lang === "nl" ? "Vellu: idee of bug" : lang === "es" ? "Vellu: idea o error" : "Vellu: idea or bug")}`} style={{ color: accent, textDecoration: "underline", fontWeight: 500 }}>
            {lang === "nl" ? "Mail ons" : lang === "es" ? "Escríbenos" : "Email us"}
          </a>
          {" · mirahventures@vellu.cc"}
        </div>
      </div>
    </div>
  ), document.body);
}
