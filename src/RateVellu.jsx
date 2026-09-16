// "Beoordeel Vellu" — korte enquête voor de saloneigenaar (Faisal 16-09-2026):
// een cijfer van 1 tot 5, wat werkt goed, wat mist, en een vinkje of de
// salonnaam met de tekst op vellu.cc mag staan. Eén rij per salon in
// app_ratings; later bij te werken via Instellingen → Abonnement & account.
// Het gemiddelde (zonder demo-salons) komt op vellu.cc; namen en teksten
// alleen met het vinkje én nadat Vellu ze in het beheer heeft gepubliceerd.
//
// De eigenaar mag de kolom `published` niet zetten (kolomrechten in de
// migratie beoordeel_vellu), dus hier bewust geen upsert: PostgREST zet bij
// een upsert élke meegestuurde kolom (ook owner_id) in de UPDATE, en daar
// heeft de eigenaar geen recht op. Insert of update, afhankelijk van
// `existing`.
import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";
import { NavIcon } from "./shared.jsx";

const TXT = {
  nl: {
    title: "Hoe bevalt Vellu?",
    sub: "Drie korte vragen, twee minuten. Je cijfer telt mee in het gemiddelde op vellu.cc; je salonnaam en je woorden alleen als je dat hieronder aanvinkt.",
    rating: "Welk cijfer geef je Vellu?",
    labels: ["Slecht", "Matig", "Oké", "Goed", "Uitstekend"],
    liked: "Wat werkt goed voor je?",
    missing: "Wat mis je, of wat zou je veranderen?",
    optional: "optioneel",
    allow: "Mijn cijfer en mijn woorden mogen met mijn salonnaam op vellu.cc staan",
    later: "Later",
    send: "Versturen",
    update: "Bijwerken",
    busy: "Bezig…",
    thanksTitle: "Dankjewel",
    thanks: "Je beoordeling is opgeslagen. Bijwerken kan altijd onder Instellingen → Abonnement & account.",
    close: "Sluiten",
    err: "Opslaan lukte niet. Probeer het zo nog eens.",
  },
  en: {
    title: "How is Vellu working for you?",
    sub: "Three short questions, two minutes. Your score counts towards the average on vellu.cc; your salon name and your words only if you tick the box below.",
    rating: "What score do you give Vellu?",
    labels: ["Poor", "Fair", "Okay", "Good", "Excellent"],
    liked: "What works well for you?",
    missing: "What do you miss, or what would you change?",
    optional: "optional",
    allow: "My score and my words may appear with my salon name on vellu.cc",
    later: "Later",
    send: "Send",
    update: "Update",
    busy: "Working…",
    thanksTitle: "Thank you",
    thanks: "Your rating has been saved. You can update it any time under Settings → Subscription & account.",
    close: "Close",
    err: "Saving failed. Please try again in a moment.",
  },
  es: {
    title: "¿Qué tal te va con Vellu?",
    sub: "Tres preguntas cortas, dos minutos. Tu nota cuenta para la media en vellu.cc; el nombre de tu salón y tus palabras solo si marcas la casilla de abajo.",
    rating: "¿Qué nota le das a Vellu?",
    labels: ["Mal", "Regular", "Bien", "Muy bien", "Excelente"],
    liked: "¿Qué te funciona bien?",
    missing: "¿Qué echas de menos o qué cambiarías?",
    optional: "opcional",
    allow: "Mi nota y mis palabras pueden aparecer con el nombre de mi salón en vellu.cc",
    later: "Más tarde",
    send: "Enviar",
    update: "Actualizar",
    busy: "Guardando…",
    thanksTitle: "Gracias",
    thanks: "Tu valoración se ha guardado. Puedes actualizarla cuando quieras en Ajustes → Suscripción y cuenta.",
    close: "Cerrar",
    err: "No se pudo guardar. Inténtalo de nuevo en un momento.",
  },
};

// Ster als eigen svg: de NavIcon-set tekent alleen omtrekken, en hier moet de
// gekozen ster vol zijn.
export function Star({ size = 22, filled, color, stroke }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={stroke || color} strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2.5 15 8.6 21.7 9.5 16.8 14.2 18 20.9 12 17.7 6 20.9 7.2 14.2 2.3 9.5 9 8.6 12 2.5" />
    </svg>
  );
}

export default function RateVelluModal({ lang: appLang, c, accent, ownerId, existing, onClose, onSaved }) {
  const lang = TXT[appLang] ? appLang : "nl";
  const T = TXT[lang];
  const [rating, setRating] = useState(existing?.rating || 0);
  const [hover, setHover] = useState(0);
  const [liked, setLiked] = useState(existing?.liked || "");
  const [missing, setMissing] = useState(existing?.missing || "");
  const [allowPublic, setAllowPublic] = useState(!!existing?.allow_public);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const shown = hover || rating;

  const save = async () => {
    if (!rating || busy) return;
    setBusy(true); setErr("");
    const row = { rating, liked: liked.trim().slice(0, 400) || null, missing: missing.trim().slice(0, 400) || null, allow_public: allowPublic };
    const q = existing
      ? supabase.from("app_ratings").update(row).eq("owner_id", ownerId)
      : supabase.from("app_ratings").insert({ owner_id: ownerId, ...row });
    const { data, error } = await q.select().single();
    setBusy(false);
    if (error) { setErr(T.err); return; }
    onSaved && onSaved(data);
    setDone(true);
  };

  const label = (txt, opt) => (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>
      {txt}{opt && <span style={{ fontWeight: 400, letterSpacing: "0.04em", textTransform: "none", color: c.textMuted }}> · {T.optional}</span>}
    </div>
  );
  const ta = (val, set, ph) => (
    <textarea className="input-field" value={val} onChange={(e) => set(e.target.value)} maxLength={400} rows={2} placeholder={ph}
      style={{ width: "100%", resize: "vertical", minHeight: 58, fontSize: 13, lineHeight: 1.5, padding: "10px 12px", boxSizing: "border-box", fontFamily: "'Jost', sans-serif" }} />
  );

  return createPortal((
    <div data-rate-overlay onClick={() => !busy && onClose(done)} style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 420, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }}>
      <div data-rate-panel onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={T.title}
        style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 16, padding: "22px 22px 18px", maxWidth: 440, width: "100%", maxHeight: "min(88vh, 720px)", overflowY: "auto", boxSizing: "border-box" }}>
        {done ? (
          <div data-rate-done style={{ textAlign: "center", padding: "10px 0 4px" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={22} filled={n <= rating} color={accent} stroke={n <= rating ? accent : c.inputBorder} />)}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 400, marginBottom: 8 }}>{T.thanksTitle}</div>
            <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.6, marginBottom: 18 }}>{T.thanks}</div>
            <button className="btn-primary" data-rate-close onClick={() => onClose(true)} style={{ width: "100%" }}>{T.close}</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 400, lineHeight: 1.15 }}>{T.title}</div>
              <button aria-label={T.later} data-rate-later onClick={() => onClose(false)} disabled={busy}
                style={{ width: 36, height: 36, padding: 0, borderRadius: 8, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <NavIcon name="xmark" size={14} color="currentColor" />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: c.textSub, lineHeight: 1.55, marginBottom: 18 }}>{T.sub}</div>

            {label(T.rating)}
            <div data-rate-stars role="radiogroup" aria-label={T.rating} style={{ display: "flex", gap: 6, marginBottom: 6 }} onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= shown;
                return (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}/5 ${T.labels[n - 1]}`} data-rate-star={n}
                    onClick={() => setRating(n)} onMouseEnter={() => setHover(n)}
                    style={{ width: 44, height: 44, padding: 0, borderRadius: 8, border: `1px solid ${on ? accent : c.inputBorder}`, background: on ? `${accent}14` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s ease, border-color 0.15s ease" }}>
                    <Star size={22} filled={on} color={accent} stroke={on ? accent : c.textMuted} />
                  </button>
                );
              })}
            </div>
            <div data-rate-label style={{ fontSize: 12, color: shown ? accent : c.textMuted, minHeight: 18, marginBottom: 16, fontWeight: shown ? 600 : 400 }}>
              {shown ? T.labels[shown - 1] : " "}
            </div>

            {label(T.liked, true)}
            <div style={{ marginBottom: 14 }}>{ta(liked, setLiked, "")}</div>
            {label(T.missing, true)}
            <div style={{ marginBottom: 14 }}>{ta(missing, setMissing, "")}</div>

            <label data-rate-allow style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, color: c.textSub, lineHeight: 1.5, cursor: "pointer", marginBottom: 18 }}>
              <input type="checkbox" checked={allowPublic} onChange={(e) => setAllowPublic(e.target.checked)} style={{ marginTop: 3, accentColor: accent, width: 16, height: 16, flexShrink: 0 }} />
              <span>{T.allow}</span>
            </label>

            {err && <div data-rate-error style={{ fontSize: 12, color: c.danger, marginBottom: 12 }}>{err}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" onClick={() => onClose(false)} disabled={busy} style={{ flex: 1 }}>{T.later}</button>
              <button className="btn-primary" data-rate-send onClick={save} disabled={!rating || busy} style={{ flex: 1.4, opacity: !rating ? 0.5 : 1 }}>
                {busy ? T.busy : existing ? T.update : T.send}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body);
}
