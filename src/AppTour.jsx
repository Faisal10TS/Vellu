import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

// ─── GUIDED APP TOUR ────────────────────────────────────────
// A spotlight walkthrough that actually drives the app: every step may switch
// the active view before highlighting its target, so the owner sees the real
// screen behind the cut-out instead of a mock.
//
// Deliberately forgiving: if a step's target can't be found (element not
// rendered on this breakpoint, layout changed, feature gated by plan) the card
// simply centres itself and the tour continues. A tour that hard-crashes on a
// missing selector is worse than no tour.

// Both the desktop sidebar and the mobile bottom bar carry the same data-tour
// attributes, so one selector can match twice — return whichever is actually
// laid out on screen.
function visibleTarget(sel) {
  if (!sel) return null;
  let nodes = [];
  try { nodes = Array.from(document.querySelectorAll(sel)); } catch { return null; }
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return n;
  }
  return null;
}

const PAD = 6;          // spotlight breathing room around the target
const GAP = 14;         // distance between spotlight and card
const EDGE = 16;        // minimum distance to the viewport edge

export default function AppTour({ steps, lang = "nl", c, accent, onFinish }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [cardH, setCardH] = useState(190);
  const cardRef = useRef(null);
  const step = steps[i] || steps[0];
  const last = i === steps.length - 1;

  const finish = (completed) => { if (onFinish) onFinish(completed); };

  // Run the step's side effect (view switch), then wait for its target to
  // appear before measuring. Re-rendering a whole tab isn't instant, hence the
  // poll rather than a single rAF.
  useEffect(() => {
    let cancelled = false, tries = 0, raf = 0, to = 0;
    setRect(null);
    try { step.before && step.before(); } catch { /* navigation is best-effort */ }

    const measure = (el) => {
      if (cancelled) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const find = () => {
      if (cancelled) return;
      const el = visibleTarget(step.target);
      if (!el) {
        if (tries++ < 40) to = setTimeout(find, 25);
        return; // rect stays null → centred card, no spotlight
      }
      measure(el); // show the spotlight straight away
      const r0 = el.getBoundingClientRect();
      if (r0.top < 90 || r0.bottom > window.innerHeight - 120) {
        try { el.scrollIntoView({ block: "center", behavior: "auto" }); } catch { /* older browsers */ }
        // Re-measure once the scroll has landed. rAF is the accurate signal,
        // but it never fires in a tab that isn't compositing — so never make
        // the spotlight depend on it alone.
        raf = requestAnimationFrame(() => measure(el));
        to = setTimeout(() => measure(el), 90);
      }
    };
    find();
    return () => { cancelled = true; clearTimeout(to); cancelAnimationFrame(raf); };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the spotlight glued to its target while the page moves underneath.
  useEffect(() => {
    const h = () => {
      const el = visibleTarget(step.target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("resize", h);
    window.addEventListener("scroll", h, true);
    return () => { window.removeEventListener("resize", h); window.removeEventListener("scroll", h, true); };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight || 190);
  }, [i, rect, lang]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); last ? finish(true) : setI(v => v + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI(v => Math.max(0, v - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, last]); // eslint-disable-line react-hooks/exhaustive-deps

  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(370, vw - EDGE * 2);

  // Below the target when it fits, above when it doesn't, centred when there's
  // no target at all.
  let cardStyle;
  if (!rect) {
    cardStyle = { left: Math.round((vw - cardW) / 2), top: Math.round(Math.max(EDGE, (vh - cardH) / 2)) };
  } else {
    const below = rect.top + rect.height + PAD + GAP;
    const above = rect.top - PAD - GAP - cardH;
    let top;
    if (below + cardH <= vh - EDGE) top = below;
    else if (above >= EDGE) top = above;
    else top = Math.max(EDGE, (vh - cardH) / 2);
    const wanted = rect.left + rect.width / 2 - cardW / 2;
    const left = Math.min(Math.max(wanted, EDGE), vw - cardW - EDGE);
    cardStyle = { left: Math.round(left), top: Math.round(top) };
  }

  const btn = {
    padding: "9px 18px", borderRadius: 100, fontSize: 12, fontWeight: 600,
    letterSpacing: "0.04em", cursor: "pointer", border: "1px solid transparent",
    fontFamily: "'Jost', sans-serif"
  };

  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 500, fontFamily: "'Jost', sans-serif" }}>
      {/* Dimmer. With a target we use a huge spread shadow so the cut-out is a
          single element (no four-rectangle maths, and it animates cleanly). */}
      {rect ? (
        <div style={{
          position: "fixed",
          top: rect.top - PAD, left: rect.left - PAD,
          width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: 14,
          boxShadow: `0 0 0 9999px rgba(0,0,0,0.68), 0 0 0 2px ${accent}, 0 0 22px ${accent}66`,
          transition: "top .3s cubic-bezier(.4,0,.2,1), left .3s cubic-bezier(.4,0,.2,1), width .3s cubic-bezier(.4,0,.2,1), height .3s cubic-bezier(.4,0,.2,1)",
          pointerEvents: "none"
        }} />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.68)" }} />
      )}

      {/* Swallow clicks on the page behind — the tour drives navigation itself,
          so letting the owner click through would desync the steps. */}
      <div style={{ position: "fixed", inset: 0 }} onClick={(e) => e.stopPropagation()} />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        style={{
          position: "fixed", width: cardW, ...cardStyle,
          background: c.bg, border: "1px solid " + c.border, borderRadius: 20,
          padding: "20px 20px 16px", color: c.text,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          transition: "top .3s cubic-bezier(.4,0,.2,1), left .3s cubic-bezier(.4,0,.2,1)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            color: accent, background: `${accent}14`, border: `1px solid ${accent}2a`,
            borderRadius: 100, padding: "4px 10px"
          }}>
            {lang === "nl" ? "Rondleiding" : "Tour"} · {i + 1}/{steps.length}
          </div>
          <div onClick={() => finish(false)} style={{ fontSize: 11, color: c.textMuted, cursor: "pointer" }}>
            {lang === "nl" ? "Overslaan" : "Skip"}
          </div>
        </div>

        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 23, fontWeight: 300, marginBottom: 6, lineHeight: 1.25 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 12.5, color: c.textSub, lineHeight: 1.65, marginBottom: 18 }}>
          {step.body}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 5, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
            {steps.map((s, n) => (
              <div key={s.key || n} style={{
                width: n === i ? 16 : 6, height: 6, borderRadius: 100,
                background: n === i ? accent : (n < i ? `${accent}66` : c.border),
                transition: "all .25s"
              }} />
            ))}
          </div>
          {i > 0 && (
            <div onClick={() => setI(v => Math.max(0, v - 1))}
                 style={{ ...btn, background: "transparent", borderColor: c.inputBorder, color: c.textSub }}>
              {lang === "nl" ? "Terug" : "Back"}
            </div>
          )}
          <div onClick={() => (last ? finish(true) : setI(v => v + 1))}
               style={{ ...btn, background: accent, color: c.btnOnDark }}>
            {last ? (lang === "nl" ? "Klaar" : "Done") : (lang === "nl" ? "Volgende" : "Next")}
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

export { AppTour };
