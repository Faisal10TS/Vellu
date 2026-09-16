// "Beoordeel Vellu" — de pagina achter de link in Faisals mail aan de salons
// (16-09-2026): vellu.cc/beoordeel/<token>. Een cijfer van 1 tot 5, wat werkt
// goed, wat mist, en een vinkje of de salonnaam met de tekst op vellu.cc mag
// staan. Dezelfde link werkt later opnieuw om het antwoord te wijzigen. Staat
// bewust NIET in de app (Faisal: "i want to send it to them so they can
// answer"); de mail komt uit de edge function send-rating-request.
//
// Data: RPC app_rating_invite(token) geeft salonnaam, land (voor de taal) en
// een eerder antwoord; submit_app_rating(...) slaat op in app_ratings
// (migraties beoordeel_vellu + beoordeel_vellu_per_mail). Het gemiddelde
// (zonder demo) en gepubliceerde citaten komen op de homepage; publiceren
// gebeurt in vellu.cc/admin → Ratings.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "./supabase.js";
import { useSEO, AT, AT_COLORS, AT_RADIUS, AtelierSkin } from "./shared.jsx";

const DUTCH = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const TXT = {
  nl: {
    title: "Hoe bevalt Vellu?",
    hi: (s) => `Hoi ${s},`,
    sub: "Eén minuut: een cijfer en twee korte vragen. Je cijfer telt mee in het gemiddelde op vellu.cc; je salonnaam en je woorden alleen als je dat hieronder aanvinkt.",
    again: (n, d) => `Je gaf eerder ${n} van 5 (${d}). Je kunt je antwoord hier aanpassen.`,
    rating: "Welk cijfer geef je Vellu?",
    labels: ["Slecht", "Matig", "Oké", "Goed", "Uitstekend"],
    liked: "Wat vind je van Vellu?",
    missing: "Wat mis je, of wat zou je veranderen?",
    optional: "optioneel",
    allow: "Mijn cijfer en mijn woorden mogen met mijn salonnaam op vellu.cc staan",
    send: "Versturen",
    update: "Bijwerken",
    busy: "Bezig…",
    thanksTitle: (s) => `Dankjewel, ${s}.`,
    thanks: "Je beoordeling is opgeslagen. Wil je later iets veranderen? Deze link blijft werken.",
    site: "Naar vellu.cc",
    err: "Opslaan lukte niet. Probeer het zo nog eens, of mail mirahventures@vellu.cc.",
    invalidTitle: "Deze link is niet geldig",
    invalid: "Mail mirahventures@vellu.cc, dan sturen we je een nieuwe.",
    loading: "Even geduld…",
    footer: "Vellu is een product van Mirah Ventures · mirahventures@vellu.cc",
  },
  en: {
    title: "How is Vellu working for you?",
    hi: (s) => `Hi ${s},`,
    sub: "One minute: a score and two short questions. Your score counts towards the average on vellu.cc; your salon name and your words only if you tick the box below.",
    again: (n, d) => `You gave ${n} out of 5 before (${d}). You can change your answer here.`,
    rating: "What score do you give Vellu?",
    labels: ["Poor", "Fair", "Okay", "Good", "Excellent"],
    liked: "What do you think of Vellu?",
    missing: "What do you miss, or what would you change?",
    optional: "optional",
    allow: "My score and my words may appear with my salon name on vellu.cc",
    send: "Send",
    update: "Update",
    busy: "Working…",
    thanksTitle: (s) => `Thank you, ${s}.`,
    thanks: "Your rating has been saved. Want to change something later? This link keeps working.",
    site: "Go to vellu.cc",
    err: "Saving failed. Please try again in a moment, or email mirahventures@vellu.cc.",
    invalidTitle: "This link is not valid",
    invalid: "Email mirahventures@vellu.cc and we will send you a new one.",
    loading: "One moment…",
    footer: "Vellu is a product of Mirah Ventures · mirahventures@vellu.cc",
  },
};

// Ster als eigen svg: de NavIcon-set tekent alleen omtrekken, en hier moet de
// gekozen ster vol zijn. Ook gebruikt door AdminDashboard (tab Ratings).
export function Star({ size = 22, filled, color, stroke }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={stroke || color} strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2.5 15 8.6 21.7 9.5 16.8 14.2 18 20.9 12 17.7 6 20.9 7.2 14.2 2.3 9.5 9 8.6 12 2.5" />
    </svg>
  );
}

export default function RateVelluPage() {
  const { token } = useParams();
  const c = AT_COLORS;
  const accent = AT.EARTH;
  const R = AT_RADIUS;
  const [lang, setLang] = useState(null); // null tot de uitnodiging binnen is (taal volgt het land van de salon)
  const [invite, setInvite] = useState(undefined); // undefined = laden, null = ongeldige link
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [liked, setLiked] = useState("");
  const [missing, setMissing] = useState("");
  const [allowPublic, setAllowPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const T = TXT[lang || "nl"];
  useSEO({ title: lang === "en" ? "Rate Vellu" : "Beoordeel Vellu", description: T.sub, url: "https://vellu.cc/beoordeel" });

  useEffect(() => {
    let off = false;
    (async () => {
      const { data } = await supabase.rpc("app_rating_invite", { p_token: token || "" });
      if (off) return;
      if (!data) { setInvite(null); setLang((l) => l || "nl"); return; }
      setInvite(data);
      setLang((l) => l || (DUTCH.has(String(data.country_code || "NL").toUpperCase()) ? "nl" : "en"));
      const ex = data.existing;
      if (ex) { setRating(ex.rating || 0); setLiked(ex.liked || ""); setMissing(ex.missing || ""); setAllowPublic(!!ex.allow_public); }
    })();
    return () => { off = true; };
  }, [token]);

  const save = async () => {
    if (!rating || busy) return;
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("submit_app_rating", { p_token: token, p_rating: rating, p_liked: liked.trim().slice(0, 400), p_missing: missing.trim().slice(0, 400), p_allow_public: allowPublic });
    setBusy(false);
    if (error || !data) { setErr(T.err); return; }
    setInvite((inv) => ({ ...inv, existing: data }));
    setDone(true);
  };

  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } };
  const shown = hover || rating;
  const salon = invite?.business_name ? String(invite.business_name).trim() : "";
  const label = (txt, opt) => (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>
      {txt}{opt && <span style={{ fontWeight: 400, letterSpacing: "0.04em", textTransform: "none", color: c.textMuted }}> · {T.optional}</span>}
    </div>
  );
  const ta = (val, set) => (
    <textarea className="input-field" value={val} onChange={(e) => set(e.target.value)} maxLength={400} rows={3}
      style={{ width: "100%", resize: "vertical", minHeight: 74, fontSize: 14, lineHeight: 1.5, padding: "11px 13px", boxSizing: "border-box", borderRadius: R, fontFamily: "'Jost', sans-serif" }} />
  );

  return (
    <div className="atelier" data-rate-page style={{ minHeight: "100dvh", background: c.bg, color: c.text, fontFamily: "'Jost', sans-serif", padding: "clamp(20px, 5vw, 48px) 16px calc(32px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}>
      <AtelierSkin />
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <a href="/" style={{ fontFamily: "'Jost', sans-serif", fontSize: 22, fontWeight: 400, letterSpacing: "0.22em", color: AT.ESPRESSO, textDecoration: "none" }}>vellu</a>
          <div data-rate-lang style={{ display: "flex", gap: 2, border: `1px solid ${AT.PUTTY}`, borderRadius: R, padding: 3, background: c.bgCard }}>
            {["nl", "en"].map((l) => (
              <button key={l} onClick={() => setLang(l)} style={{ border: "none", cursor: "pointer", borderRadius: R - 2, padding: "5px 10px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Jost', sans-serif", background: (lang || "nl") === l ? AT.ESPRESSO : "transparent", color: (lang || "nl") === l ? AT.BONE : AT.EARTH }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div data-rate-panel style={{ background: c.bgCard, border: `1px solid ${AT.PUTTY}`, borderRadius: 16, padding: "clamp(22px, 4vw, 32px)", boxShadow: "0 26px 46px -28px rgba(69,58,43,0.55), 0 2px 4px rgba(69,58,43,0.05)" }}>
          {invite === undefined ? (
            <div style={{ textAlign: "center", color: c.textMuted, fontSize: 13, padding: "24px 0" }}>{T.loading}</div>
          ) : invite === null ? (
            <div data-rate-invalid style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 400, marginBottom: 10 }}>{T.invalidTitle}</div>
              <div style={{ fontSize: 14, color: c.textSub, lineHeight: 1.6 }}>{T.invalid}</div>
            </div>
          ) : done ? (
            <div data-rate-done style={{ textAlign: "center", padding: "8px 0 4px" }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={24} filled={n <= rating} color={accent} stroke={n <= rating ? accent : AT.MUSHROOM} />)}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 400, marginBottom: 10, lineHeight: 1.15 }}>{T.thanksTitle(salon)}</div>
              <div style={{ fontSize: 14, color: c.textSub, lineHeight: 1.65, marginBottom: 22 }}>{T.thanks}</div>
              <a href="/" className="btn-ghost" style={{ display: "inline-block", padding: "12px 22px", fontSize: 11, textDecoration: "none" }}>{T.site}</a>
            </div>
          ) : (
            <>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 34px)", fontWeight: 400, lineHeight: 1.12, marginBottom: 10 }}>{T.title}</div>
              <div style={{ fontSize: 15, marginBottom: 6 }}>{T.hi(salon)}</div>
              <div style={{ fontSize: 13.5, color: c.textSub, lineHeight: 1.6, marginBottom: invite.existing ? 8 : 22 }}>{T.sub}</div>
              {invite.existing && <div data-rate-again style={{ fontSize: 12.5, color: accent, lineHeight: 1.5, marginBottom: 20 }}>{T.again(invite.existing.rating, fmtDate(invite.existing.updated_at))}</div>}

              {label(T.rating)}
              <div data-rate-stars role="radiogroup" aria-label={T.rating} style={{ display: "flex", gap: 8, marginBottom: 6 }} onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = n <= shown;
                  return (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}/5 ${T.labels[n - 1]}`} data-rate-star={n}
                      onClick={() => setRating(n)} onMouseEnter={() => setHover(n)}
                      style={{ width: 48, height: 48, padding: 0, borderRadius: R, border: `1px solid ${on ? accent : AT.MUSHROOM}`, background: on ? `${accent}18` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s ease, border-color 0.15s ease" }}>
                      <Star size={24} filled={on} color={accent} stroke={on ? accent : AT.MUSHROOM} />
                    </button>
                  );
                })}
              </div>
              <div data-rate-label style={{ fontSize: 12.5, color: shown ? accent : c.textMuted, minHeight: 18, marginBottom: 18, fontWeight: shown ? 600 : 400 }}>
                {shown ? T.labels[shown - 1] : " "}
              </div>

              {label(T.liked, true)}
              <div style={{ marginBottom: 16 }}>{ta(liked, setLiked)}</div>
              {label(T.missing, true)}
              <div style={{ marginBottom: 16 }}>{ta(missing, setMissing)}</div>

              <label data-rate-allow style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: c.textSub, lineHeight: 1.5, cursor: "pointer", marginBottom: 20 }}>
                <input type="checkbox" checked={allowPublic} onChange={(e) => setAllowPublic(e.target.checked)} style={{ marginTop: 3, accentColor: AT.ESPRESSO, width: 16, height: 16, flexShrink: 0 }} />
                <span>{T.allow}</span>
              </label>

              {err && <div data-rate-error style={{ fontSize: 12.5, color: "#a33", marginBottom: 12 }}>{err}</div>}

              <button className="btn-primary" data-rate-send onClick={save} disabled={!rating || busy} style={{ width: "100%", padding: "15px 20px", fontSize: 12, opacity: !rating ? 0.5 : 1 }}>
                {busy ? T.busy : invite.existing ? T.update : T.send}
              </button>
            </>
          )}
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: c.textMuted, marginTop: 18, lineHeight: 1.6 }}>{T.footer}</div>
      </div>
    </div>
  );
}
