import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";

// ─── VELLU SUPPORT ASSISTANT ─────────────────────────────────
// A floating help chat for salon owners. Sends the conversation to the
// support-chat edge function (which calls Claude with a Vellu knowledge base)
// and renders the reply. Knowledge-only: it can explain how Vellu works but
// can't read or change the salon's data.

export default function SupportChat({ lang = "nl", c, accent, isMobile, greeting: greetingOverride, subtitle: subtitleOverride, side = "right", launcherBottom }) {
  const [open, setOpen] = useState(false);
  const greeting = greetingOverride || (lang === "nl"
    ? "Hoi! Ik ben de Vellu-assistent. Vraag me hoe iets werkt — bijvoorbeeld je openingstijden instellen, een medewerker toevoegen, of waarom een klant geen mail kreeg."
    : "Hi! I'm the Vellu assistant. Ask me how something works — like setting your hours, adding a staff member, or why a client didn't get an email.");
  const [messages, setMessages] = useState([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      // Only the actual dialogue turns go to the model, not the local greeting.
      const forModel = next.filter((m, i) => !(i === 0 && m.role === "assistant"));
      const { data, error } = await supabase.functions.invoke("support-chat", {
        body: { messages: forModel, lang },
      });
      if (error) throw error;
      if (data?.error === "not_configured") {
        setNotConfigured(true);
        setMessages(m => [...m, { role: "assistant", content: lang === "nl"
          ? "De assistent is nog niet ingesteld. Neem contact op via mirahventures@vellu.cc."
          : "The assistant isn't set up yet. Contact us at mirahventures@vellu.cc." }]);
        return;
      }
      if (data?.error === "rate_limited") {
        setMessages(m => [...m, { role: "assistant", content: lang === "nl"
          ? "Even rustig aan — probeer het over een minuutje opnieuw."
          : "Slow down a moment — try again in a minute." }]);
        return;
      }
      if (data?.error === "busy") {
        setMessages(m => [...m, { role: "assistant", content: lang === "nl"
          ? "Het is nu erg druk met vragen. Probeer het later opnieuw, of mail mirahventures@vellu.cc."
          : "It's very busy right now. Please try again later, or email mirahventures@vellu.cc." }]);
        return;
      }
      const reply = data?.reply || (lang === "nl"
        ? "Sorry, dat lukte niet. Probeer het opnieuw of mail mirahventures@vellu.cc."
        : "Sorry, that didn't work. Try again or email mirahventures@vellu.cc.");
      setMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: lang === "nl"
        ? "Er ging iets mis. Probeer het opnieuw of mail mirahventures@vellu.cc."
        : "Something went wrong. Try again or email mirahventures@vellu.cc." }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Launcher offset. On the dashboard (mobile) it sits above the bottom nav bar;
  // callers without a bottom nav (e.g. the landing page) pass launcherBottom to
  // override. `side` anchors the launcher/panel left or right so it can avoid
  // other fixed elements (the landing's bottom-right "start trial" pill).
  const bottomOffset = launcherBottom != null ? launcherBottom : (isMobile ? "calc(84px + env(safe-area-inset-bottom, 0px))" : 24);
  const anchorX = side === "left" ? { left: 20 } : { right: 20 };
  const panelAnchorX = isMobile
    ? { left: 12, right: 12 }
    : (side === "left" ? { left: 20, right: "auto" } : { right: 20, left: "auto" });

  return createPortal((
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
          aria-label={lang === "nl" ? "Hulp" : "Help"}
          style={{
            position: "fixed", bottom: bottomOffset, zIndex: 480, ...anchorX,
            width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
            background: accent, color: c.btnOnDark || "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.28)", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Jost', sans-serif",
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", ...panelAnchorX,
          bottom: isMobile ? "calc(12px + env(safe-area-inset-bottom, 0px))" : 24, zIndex: 490,
          width: isMobile ? "auto" : 380, maxWidth: "calc(100vw - 24px)",
          height: isMobile ? "70vh" : 520, maxHeight: "calc(100vh - 48px)",
          background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column",
          overflow: "hidden", fontFamily: "'Jost', sans-serif", color: c.text,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${accent}1a`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 400, lineHeight: 1 }}>{lang === "nl" ? "Vellu-assistent" : "Vellu assistant"}</div>
              <div style={{ fontSize: 9.5, color: c.textMuted, marginTop: 3, letterSpacing: "0.04em" }}>{subtitleOverride || (lang === "nl" ? "Hulp bij het gebruik van Vellu" : "Help using Vellu")}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label={lang === "nl" ? "Sluiten" : "Close"}
              style={{ background: "transparent", border: `1px solid ${c.border}`, borderRadius: 9, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: c.textSub, padding: 0, flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 14px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "86%", padding: "9px 12px", borderRadius: 14, fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  background: m.role === "user" ? accent : c.bgCard,
                  color: m.role === "user" ? (c.btnOnDark || "#fff") : c.text,
                  border: m.role === "user" ? "none" : `1px solid ${c.border}`,
                  borderBottomRightRadius: m.role === "user" ? 4 : 14,
                  borderBottomLeftRadius: m.role === "user" ? 14 : 4,
                }}>{m.content}</div>
              </div>
            ))}
            {busy && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 14px", borderRadius: 14, background: c.bgCard, border: `1px solid ${c.border}`, display: "flex", gap: 4 }}>
                  {[0, 1, 2].map(n => (
                    <span key={n} style={{ width: 6, height: 6, borderRadius: "50%", background: c.textMuted, opacity: 0.5, animation: `sc-bounce 1s ${n * 0.15}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: `1px solid ${c.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={notConfigured ? (lang === "nl" ? "Assistent niet beschikbaar" : "Assistant unavailable") : (lang === "nl" ? "Stel je vraag…" : "Ask a question…")}
                disabled={notConfigured}
                rows={1}
                style={{
                  flex: 1, resize: "none", maxHeight: 96, minHeight: 20, padding: "9px 12px", borderRadius: 12,
                  border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text,
                  fontSize: 12.5, fontFamily: "'Jost', sans-serif", lineHeight: 1.4, outline: "none",
                }} />
              <button onClick={send} disabled={busy || !input.trim() || notConfigured}
                aria-label={lang === "nl" ? "Verstuur" : "Send"}
                style={{
                  width: 38, height: 38, borderRadius: 11, border: "none", flexShrink: 0,
                  background: (busy || !input.trim() || notConfigured) ? c.inputBorder : accent,
                  color: c.btnOnDark || "#fff", cursor: (busy || !input.trim() || notConfigured) ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </div>
            <div style={{ fontSize: 9, color: c.textMuted, marginTop: 6, textAlign: "center" }}>
              {lang === "nl" ? "AI-assistent · kan af en toe iets missen" : "AI assistant · may occasionally be wrong"}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes sc-bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-4px);opacity:.9} }`}</style>
    </>
  ), document.body);
}

export { SupportChat };
