// Shared PWA install prompt — used by both the public salon profile page
// (ClientApp) and the owner dashboard (OwnerApp). Dismissible banner +
// platform-specific install flow:
//
//   * Android / Chromium mobile: capture `beforeinstallprompt` and trigger
//     the native install dialog via .prompt() on click.
//   * iOS Safari: no programmatic install API, so show a bottom-sheet modal
//     with step-by-step "Share -> Add to Home Screen" instructions.
//
// Callers pass scope-specific props (dismissKey, title, subtitle) so the
// same component can nudge customers on a salon profile ("Install Vellu —
// faster access to TTNB") or owners on the dashboard ("Install Vellu —
// quick access to your dashboard").

import { useState, useEffect } from "react";

export default function InstallAppPrompt({
  // Unique localStorage key for this context's dismiss state. For salon
  // pages we scope per-salon (so dismissing at Salon A doesn't hide it
  // at Salon B); for the owner dashboard we use a single global key.
  dismissKey = "vellu_install_dismissed",
  // Banner copy. Caller supplies — component stays i18n-agnostic.
  title,
  subtitle,
  // iOS guide copy. Caller supplies translated strings; sensible NL defaults.
  iosCopy = null,
  // Visual
  lang = "nl",
  accent = "#c9a96e",
  c,
}) {
  // Global install-success key — shared across all contexts so a successful
  // install anywhere stops nagging everywhere.
  const globalKey = "vellu_install_dismissed";

  // Compute everything derivable from environment synchronously during render.
  // Keeps setup out of useEffect (React 19's react-hooks/set-state-in-effect).
  const env = (() => {
    if (typeof window === "undefined") return { eligible: false, platform: null };
    if (localStorage.getItem(globalKey) === "true") return { eligible: false, platform: null };
    if (localStorage.getItem(dismissKey) === "true") return { eligible: false, platform: null };
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return { eligible: false, platform: null };
    if (window.navigator.standalone === true) return { eligible: false, platform: null };
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);
    if (isIos) return { eligible: true, platform: "ios" };
    if (isAndroid) return { eligible: true, platform: "android" };
    return { eligible: false, platform: null };
  })();

  const [visible, setVisible] = useState(false);
  const [platform] = useState(env.platform);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (!env.eligible) return;

    if (env.platform === "ios") {
      const tid = setTimeout(() => setVisible(true), 2500);
      return () => clearTimeout(tid);
    }

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      localStorage.setItem(globalKey, "true");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [env.eligible, env.platform]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(dismissKey, "true");
  };

  const install = async () => {
    if (platform === "ios") { setShowIosGuide(true); return; }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
      localStorage.setItem(globalKey, "true");
    }
    setDeferredPrompt(null);
  };

  // Default iOS guide copy if caller didn't supply — covers the common case.
  const ios = iosCopy || (lang === "nl" ? {
    iosTitle: "App installeren",
    iosIntro: "Installeer Vellu met 2 simpele stappen — geen App Store nodig.",
    iosStep1: "Tik op de Delen-knop",
    iosStep1Sub: "Onderaan je Safari scherm",
    iosStep2: "Kies 'Zet op beginscherm'",
    iosStep2Sub: "Scroll omlaag in het Delen-menu",
    iosStep3: "Tik op 'Voeg toe'",
    iosStep3Sub: "Rechtsboven om te bevestigen",
    iosDone: "Klaar",
  } : {
    iosTitle: "Install the app",
    iosIntro: "Install Vellu in 2 simple steps — no App Store needed.",
    iosStep1: "Tap the Share button",
    iosStep1Sub: "At the bottom of your Safari screen",
    iosStep2: "Choose 'Add to Home Screen'",
    iosStep2Sub: "Scroll down in the Share menu",
    iosStep3: "Tap 'Add'",
    iosStep3Sub: "Top-right to confirm",
    iosDone: "Got it",
  });

  const installLabel = lang === "nl" ? "Installeer" : "Install";
  const dismissLabel = lang === "nl" ? "Sluiten" : "Close";

  if (!visible) return null;

  return (
    <>
      <div style={{
        background: c.bgCard, borderBottom: `1px solid ${c.border}`,
        padding: "10px 14px",
        paddingTop: `calc(10px + env(safe-area-inset-top, 0px))`,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <img
          src="/icon-192.png" alt=""
          style={{ width: 40, height: 40, borderRadius: 9, flexShrink: 0, border: `1px solid ${c.border}` }}
          onError={e => { e.target.style.display = "none"; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ fontSize: 11, color: c.textLabel, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
        </div>
        <button
          onClick={install}
          style={{
            background: accent, color: "#0d0b0a", border: "none",
            borderRadius: 100, padding: "8px 16px",
            fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", cursor: "pointer",
            fontFamily: "'Jost',sans-serif", flexShrink: 0,
          }}
        >{installLabel}</button>
        <button
          onClick={dismiss} aria-label={dismissLabel}
          style={{
            background: "transparent", border: "none", color: c.textMuted,
            cursor: "pointer", padding: 6, display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {showIosGuide && (
        <div
          onClick={() => setShowIosGuide(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            zIndex: 1000, animation: "fadeUp 0.3s ease",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: "28px 24px",
              paddingBottom: `calc(28px + env(safe-area-inset-bottom, 0px))`,
              width: "100%", maxWidth: 480,
              borderTop: `1px solid ${c.border}`,
              borderLeft: `1px solid ${c.border}`,
              borderRight: `1px solid ${c.border}`,
              animation: "fadeUp 0.35s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: c.border, margin: "0 auto 20px" }} />
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <img
                src="/icon-192.png" alt=""
                style={{ width: 56, height: 56, borderRadius: 13, border: `1px solid ${c.border}`, marginBottom: 12 }}
                onError={e => { e.target.style.display = "none"; }}
              />
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 300, color: c.text, marginBottom: 4 }}>{ios.iosTitle}</div>
              <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>{ios.iosIntro}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24, marginBottom: 20 }}>
              {[
                { num: "1", title: ios.iosStep1, sub: ios.iosStep1Sub, icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                )},
                { num: "2", title: ios.iosStep2, sub: ios.iosStep2Sub, icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                )},
                { num: "3", title: ios.iosStep3, sub: ios.iosStep3Sub, icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )},
              ].map(s => (
                <div key={s.num} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px",
                  background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14,
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: `${accent}18`, color: accent,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>{s.num}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{s.sub}</div>
                  </div>
                  <div style={{ color: c.textMuted, flexShrink: 0 }}>{s.icon}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setShowIosGuide(false); dismiss(); }}
              style={{
                width: "100%", background: accent, color: "#0d0b0a", border: "none",
                borderRadius: 100, padding: "14px", fontSize: 13, fontWeight: 600,
                letterSpacing: "0.08em", textTransform: "uppercase",
                cursor: "pointer", fontFamily: "'Jost',sans-serif",
              }}
            >{ios.iosDone}</button>
          </div>
        </div>
      )}
    </>
  );
}
