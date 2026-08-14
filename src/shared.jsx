import { useState, useEffect, useMemo, createContext, useContext, useRef } from "react";
import { supabase } from "./supabase.js";

// ─── THEME SYSTEM ─────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#0d0b0a",
    bgCard: "rgba(237,232,224,0.03)",
    bgCardHover: "rgba(237,232,224,0.06)",
    border: "rgba(237,232,224,0.08)",
    borderHover: "rgba(237,232,224,0.15)",
    text: "#ede8e0",
    textSub: "rgba(237,232,224,0.6)",
    textMuted: "rgba(237,232,224,0.55)",
    textLabel: "rgba(237,232,224,0.58)",
    inputBg: "rgba(237,232,224,0.04)",
    inputBorder: "rgba(237,232,224,0.1)",
    overlay: "rgba(0,0,0,0.95)",
    navBg: "rgba(13,11,10,1)",
    selectBg: "#1a1a1a",
    toggleInactive: "rgba(237,232,224,0.15)",
    btnOnDark: "#0d0b0a",
    success: "#86efac",
    danger: "#f87171",
    warning: "#f59e0b",
  },
  light: {
    bg: "#faf9f7",
    bgCard: "rgba(13,11,10,0.03)",
    bgCardHover: "rgba(13,11,10,0.06)",
    border: "rgba(13,11,10,0.12)",
    borderHover: "rgba(13,11,10,0.22)",
    text: "#1a1714",
    textSub: "rgba(13,11,10,0.7)",
    textMuted: "rgba(13,11,10,0.6)",
    textLabel: "rgba(13,11,10,0.65)",
    inputBg: "rgba(13,11,10,0.04)",
    inputBorder: "rgba(13,11,10,0.15)",
    overlay: "rgba(255,255,255,0.95)",
    navBg: "rgba(250,249,247,1)",
    selectBg: "#f0efed",
    toggleInactive: "rgba(13,11,10,0.2)",
    btnOnDark: "#1a1714",
    success: "#16a34a",
    danger: "#dc2626",
    warning: "#d97706",
  }
};

const ThemeContext = createContext({ theme: "dark", colors: THEMES.dark, toggle: () => {} });

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("vellu-theme") || "dark"; } catch { return "dark"; }
  });
  const toggle = () => {
    // Functional setState avoids a stale-closure on `theme` if toggle is called
    // rapidly (multi-click on slow renders).
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem("vellu-theme", next); } catch {}
      return next;
    });
  };
  useEffect(() => {
    const bg = THEMES[theme].bg;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    const root = document.getElementById("root");
    if (root) root.style.background = bg;
    // Keep Safari's URL-bar tint in sync with the current theme so the URL bar area
    // blends with the page instead of showing as a dark bar on top of a light page.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", bg);
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, colors: THEMES[theme], toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() { return useContext(ThemeContext); }

// ─── LOADING SKELETON ────────────────────────────────────────
function Skeleton({ width = "100%", height = 16, radius = 8, style = {} }) {
  const { colors: c } = useTheme();
  return (
    <div style={{ width, height, borderRadius: radius, background: c.bgCardHover, animation: "pulse 1.5s ease-in-out infinite", ...style }} />
  );
}

function DashboardSkeleton() {
  const { colors: c } = useTheme();
  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 22 }}>
        {[0,1,2,3].map(i => (
          <div key={i} className="stat-card">
            <Skeleton width={80} height={10} style={{ marginBottom: 12 }} />
            <Skeleton width={60} height={28} style={{ marginBottom: 6 }} />
            <Skeleton width={50} height={10} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 22 }}>
        {[0,1,2,3].map(i => <Skeleton key={i} height={42} radius={100} />)}
      </div>
      <Skeleton width={120} height={10} style={{ marginBottom: 14 }} />
      {[0,1,2].map(i => <Skeleton key={i} height={90} radius={20} style={{ marginBottom: 10 }} />)}
    </div>
  );
}

// ─── TOAST SYSTEM ────────────────────────────────────────────
let _toastId = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = (message, type = "success") => {
    // Monotonic counter — Date.now() collides when two toasts fire in the same
    // millisecond (filter-by-id then wipes the wrong one).
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };
  return { toasts, show };
}

function ToastContainer({ toasts }) {
  const { colors: c } = useTheme();
  if (toasts.length === 0) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: "12px 20px", borderRadius: 14, fontSize: 13, fontWeight: 500,
          fontFamily: "var(--body-font, 'Jost', sans-serif)", animation: "fadeUp 0.3s ease",
          background: t.type === "success" ? "rgba(134,239,172,0.15)" : t.type === "error" ? "rgba(248,113,113,0.15)" : c.bgCard,
          color: t.type === "success" ? "#86efac" : t.type === "error" ? "#f87171" : c.text,
          border: `1px solid ${t.type === "success" ? "rgba(134,239,172,0.3)" : t.type === "error" ? "rgba(248,113,113,0.3)" : c.border}`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
        }}>
          {t.type === "success" ? "✓ " : t.type === "error" ? "✕ " : ""}{t.message}
        </div>
      ))}
    </div>
  );
}

// ─── CONFIRM MODAL ───────────────────────────────────────────
function useConfirm() {
  const [state, setState] = useState(null); // { message, resolve, tone?, confirmText? }
  // Tweede argument is optioneel en backward-compatibel: zonder opts blijft het
  // gedrag exact zoals vroeger (rode knop met t.delete). tone "primary" is voor
  // niet-destructieve vragen (regiowissel e.d.) zodat er geen "Verwijderen" staat.
  const confirm = (message, opts = {}) => new Promise((resolve) => setState({ message, resolve, tone: opts.tone || "danger", confirmText: opts.confirmText }));
  const handleYes = () => { state?.resolve(true); setState(null); };
  const handleNo = () => { state?.resolve(false); setState(null); };
  return { confirmState: state, confirm, handleYes, handleNo };
}

function ConfirmModal({ state, onYes, onNo, lang }) {
  const { colors: c } = useTheme();
  const trapRef = useRef(null);
  const t = T[lang];
  useFocusTrap(trapRef, !!state);
  if (!state) return null;
  // Standaard (en bij oude aanroepen zonder opts) blijft dit de rode verwijder-knop;
  // "primary" krijgt een neutrale themaknop omdat "Verwijderen" daar misleidend is.
  const isDanger = (state.tone || "danger") === "danger";
  const confirmLabel = state.confirmText || (isDanger
    ? t.delete
    : (lang === "nl" ? "Doorgaan" : lang === "es" ? "Continuar" : "Continue"));
  return (
    <div role="dialog" aria-modal="true" aria-label={t.confirmation} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onNo} onKeyDown={e => e.key === "Escape" && onNo()}>
      <div ref={trapRef} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: "28px 24px", maxWidth: 340, width: "100%", textAlign: "center", animation: "scaleIn 0.2s ease" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 20, lineHeight: 1.5, fontFamily: "var(--body-font, 'Jost', sans-serif)" }}>{state.message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNo} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid " + c.border, background: "transparent", color: c.textSub, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--body-font, 'Jost', sans-serif)" }}>
            {t.cancel}
          </button>
          <button onClick={onYes} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: isDanger ? "#f87171" : c.text, color: isDanger ? "#fff" : c.bg, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body-font, 'Jost', sans-serif)" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FOCUS TRAP HOOK ────────────────────────────────────────
function useFocusTrap(ref, isActive) {
  useEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const prevFocus = document.activeElement;
    if (first) first.focus();
    const handler = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    el.addEventListener("keydown", handler);
    return () => { el.removeEventListener("keydown", handler); prevFocus?.focus(); };
  }, [isActive, ref]);
}

// ─── SEO HELPER ─────────────────────────────────────────────
function useSEO({ title, description, ogImage, url }) {
  useEffect(() => {
    if (title) document.title = title;
    const setMeta = (property, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
      if (el) { el.setAttribute("content", content); }
      else { el = document.createElement("meta"); el.setAttribute(property.startsWith("og:") || property.startsWith("twitter:") ? "property" : "name", property); el.setAttribute("content", content); document.head.appendChild(el); }
    };
    if (description) { setMeta("description", description); setMeta("og:description", description); setMeta("twitter:description", description); }
    if (title) { setMeta("og:title", title); setMeta("twitter:title", title); }
    if (ogImage) { setMeta("og:image", ogImage); setMeta("twitter:image", ogImage); }
    if (url) { setMeta("og:url", url); }
    return () => { document.title = "Vellu - Beauty Booking Platform | 0% Commissie"; };
  }, [title, description, ogImage, url]);
}

// ─── SHARED IMAGE COMPRESSION ────────────────────────────────
async function compressImage(file, maxDim = 1600) {
  if (file.size <= 1024 * 1024) return file;
  try {
    const img = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } catch (e) {
    return file; // fallback to original
  }
}

// ─── EMAIL HELPER ─────────────────────────────────────────────
async function sendEmails(type, booking) {
  try {
    const { data, error } = await supabase.functions.invoke("send-emails", {
      body: { type, booking }
    });
    if (error) {
      console.error("Email error:", error);
      return { success: false, error };
    }
    return { success: true, data };
  } catch (e) {
    console.error("Email error:", e);
    return { success: false, error: e };
  }
}

// Create a cancellation token for a manually-booked appointment so the
// client's confirmation email carries the same cancel button a self-booked
// client gets (book-appointment creates these server-side; dashboard bookings
// insert directly, allowed by the owner/staff RLS policy on the table).
// Same shape as the edge function: 64-char hex token, valid until 24h before
// the appointment. Returns the cancel URL, or null when the appointment is
// already within 24h (a cancel link that lands on "too late" is worse than
// none) or when the insert fails — callers just omit the button then.
async function createCancellationToken(appointmentId, date, time) {
  try {
    const expiresAt = new Date(new Date(`${date}T${time}:00`).getTime() - 24 * 60 * 60 * 1000);
    if (expiresAt <= new Date()) return null;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("cancellation_tokens").insert({
      appointment_id: appointmentId,
      token,
      expires_at: expiresAt.toISOString(),
    });
    if (error) { console.error("cancellation token insert failed:", error); return null; }
    return `https://vellu.cc/cancel/${token}`;
  } catch (e) {
    console.error("cancellation token error:", e);
    return null;
  }
}

// SMS counterpart to sendEmails. The edge function silently no-ops when the
// salon is not on the Professional plan or the client has no phone number,
// so callers can safely fire this alongside sendEmails without duplicating
// the gate logic here. Errors are logged and swallowed — a failed SMS never
// blocks the flow, because the email path is already covering the essential
// notification.
async function sendSMS(type, booking) {
  try {
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: { type, booking }
    });
    if (error) {
      console.error("SMS error:", error);
      return { success: false, error };
    }
    return { success: true, data };
  } catch (e) {
    console.error("SMS error:", e);
    return { success: false, error: e };
  }
}

const ACCENT = "#c9a96e";

// ─── GOOGLE CALENDAR HELPER ──────────────────────────────────
function getGoogleCalUrl({ title, date, time, duration, description, location }) {
  const start = new Date(date + "T" + time + ":00");
  const end = new Date(start.getTime() + (duration || 60) * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  const fmtCal = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmtCal(start)}/${fmtCal(end)}&details=${encodeURIComponent(description || "")}&location=${encodeURIComponent(location || "")}`;
}

// ─── WHATSAPP HELPER ─────────────────────────────────────────
function getWhatsAppUrl(phone, message) {
  const clean = (phone || "").replace(/[^0-9+]/g, "").replace(/^0/, "31");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

function getWhatsAppBookingMsg(lang, { clientName, salonName, date, time, serviceName, price, countryCode }) {
  if (lang === "nl") {
    return `Hoi ${clientName}! ✨\n\nJe afspraak bij ${salonName} is bevestigd:\n📅 ${date}\n🕐 ${time}\n💅 ${serviceName}\n💰 ${fmtMoney(price, countryCode)}\n\nTot dan! 🙏`;
  }
  return `Hi ${clientName}! ✨\n\nYour appointment at ${salonName} is confirmed:\n📅 ${date}\n🕐 ${time}\n💅 ${serviceName}\n💰 ${fmtMoney(price, countryCode)}\n\nSee you then! 🙏`;
}

// bunq.me and PayPal.Me accept the amount as a path segment
// (bunq.me/name/48.50, paypal.me/name/48.50), so a salon's static link can
// still request the EXACT amount of each invoice. Unknown providers get the
// link untouched — the client types the amount, which the email/WhatsApp text
// states right next to it.
function getPaymentLinkWithAmount(link, price) {
  const clean = String(link || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  const amount = parseFloat(price || 0);
  if (!(amount > 0)) return clean;
  try {
    const u = new URL(clean);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    // Only append when the link is the bare profile (no amount segment yet).
    const segs = u.pathname.split("/").filter(Boolean);
    if ((host === "bunq.me" || host === "paypal.me") && segs.length === 1) {
      return `${clean}/${amount.toFixed(2)}`;
    }
    return clean;
  } catch {
    return clean;
  }
}

// Payment request after the visit — sent manually by the owner/staff from a
// completed appointment. Includes the pay link when the salon has one,
// otherwise the IBAN transfer details.
function getWhatsAppPaymentMsg(lang, { clientName, salonName, price, paymentLink, iban, ibanHolder, countryCode }) {
  const firstName = (clientName || "").split(" ")[0] || clientName || "";
  const amount = fmtMoney(price, countryCode);
  const linkWithAmount = getPaymentLinkWithAmount(paymentLink, price);
  const payVia = linkWithAmount
    ? (lang === "nl" ? `Je kunt betalen via: ${linkWithAmount}` : `You can pay via: ${linkWithAmount}`)
    : (lang === "nl"
      ? `Je kunt het overmaken naar ${iban}${ibanHolder ? ` t.n.v. ${ibanHolder}` : ""}.`
      : `You can transfer it to ${iban}${ibanHolder ? ` (${ibanHolder})` : ""}.`);
  if (lang === "nl") {
    return `Hoi ${firstName}! 💛\n\nBedankt voor je bezoek bij ${salonName}. Het totaalbedrag is ${amount}.\n\n${payVia}\n\nTot de volgende keer! ✨`;
  }
  return `Hi ${firstName}! 💛\n\nThank you for visiting ${salonName}. The total is ${amount}.\n\n${payVia}\n\nSee you next time! ✨`;
}

function getWhatsAppReminderMsg(lang, { clientName, salonName, date, time, serviceName }) {
  if (lang === "nl") {
    return `Hoi ${clientName}! 👋\n\nHerinnering: je hebt morgen een afspraak bij ${salonName}.\n📅 ${date}\n🕐 ${time}\n💅 ${serviceName}\n\nTot morgen! ✨`;
  }
  return `Hi ${clientName}! 👋\n\nReminder: you have an appointment at ${salonName} tomorrow.\n📅 ${date}\n🕐 ${time}\n💅 ${serviceName}\n\nSee you tomorrow! ✨`;
}

const getToday = () => new Date();
// IMPORTANT: use LOCAL date components. `d.toISOString()` converts to UTC which can
// shift the date by a day for users east of UTC in the early hours and west of UTC
// in the late hours — causing bookings to save on the wrong day.
const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
// Inverse of fmt: parse "YYYY-MM-DD" as LOCAL midnight. `new Date("YYYY-MM-DD")`
// parses as UTC midnight, so formatting it back with toLocaleDateString shows
// the PREVIOUS day for every user in a timezone behind UTC (e.g. Caribbean
// Netherlands, UTC-4). Always use this before displaying a date-only string.
const parseDate = (ds) => {
  const [y, m, d] = (ds || "").split("-").map(Number);
  return (y && m && d) ? new Date(y, m - 1, d) : new Date(ds);
};
const getDays = (n = 14) => { const t = getToday(); return Array.from({ length: n }, (_, i) => { const d = new Date(t); d.setDate(t.getDate() + i); return d; }); };
const TIMES = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00"];
// Candidate appointment START times on the salon's own slot grid
// (profiles.slot_interval_minutes, default 30). Wider range than TIMES —
// the salon's open/close bounds filter it down, so early birds (06:00)
// and late-night salons (until 22:00) both work.
const genTimes = (intervalMin = 30, startHour = 6, endHour = 22) => {
  const step = Math.max(5, parseInt(intervalMin) || 30);
  const out = [];
  for (let m = startHour * 60; m <= endHour * 60; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
};
const SLOT_INTERVALS = [10, 15, 20, 30, 60];
const DAY_NL = ["zo","ma","di","wo","do","vr","za"];
const DAY_EN = ["su","mo","tu","we","th","fr","sa"];
const DAY_FULL_NL = ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"];
const DAY_FULL_EN = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MON_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const MON_EN = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const DAY_ES = ["do","lu","ma","mi","ju","vi","sa"];
const DAY_FULL_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MON_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

// Default business hours - all days 09:00-17:30, Sunday closed
const DEFAULT_HOURS = {
  0: { open: "09:00", close: "17:30", closed: true },  // Sunday
  1: { open: "09:00", close: "17:30", closed: false }, // Monday
  2: { open: "09:00", close: "17:30", closed: false }, // Tuesday
  3: { open: "09:00", close: "17:30", closed: false }, // Wednesday
  4: { open: "09:00", close: "17:30", closed: false }, // Thursday
  5: { open: "09:00", close: "17:30", closed: false }, // Friday
  6: { open: "09:00", close: "17:30", closed: true },  // Saturday
};

// ─── LANGUAGE REGISTRY ───────────────────────────────────────
// Add a new language in 2 steps:
//   1. Append a row here (e.g. { code: "de", label: "DE", name: "Deutsch" })
//   2. Add a matching `T.de = { ... }` object below
// The Proxy wrapper on T falls back to English if a language is selected
// but its translation table hasn't shipped yet — so you can roll out a UI
// language before 100% of strings are translated without crashing the app.
const LANGUAGES = [
  { code: "nl", label: "NL", name: "Nederlands" },
  { code: "en", label: "EN", name: "English" },
  { code: "es", label: "ES", name: "Español" },
];

// ─── COUNTRY REGISTRY ────────────────────────────────────────
// `defaultLang` is a suggestion used when the salon picks a country at
// signup — they can still flip the language toggle. "launched" controls
// whether a country shows up in the signup dropdown — flip to true as you
// formally go live there. Tax lives in TAX_RULES below, never here: a rate
// in two places is a rate that will disagree with itself.
const COUNTRIES = [
  { code: "NL", name: "Nederland / Netherlands", defaultLang: "nl", currency: "EUR", launched: true },
  { code: "BE", name: "België / Belgium",        defaultLang: "nl", currency: "EUR", launched: true },
  // Dutch Caribbean. `currency` IS read (see currencyForCountry / fmtMoney
  // below) so prices show in the local currency.
  { code: "AW", name: "Aruba",                   defaultLang: "nl", currency: "AWG", launched: true },
  { code: "CW", name: "Curaçao",                 defaultLang: "nl", currency: "XCG", launched: true },
  { code: "BQ", name: "Bonaire, Saba, Sint Eustatius", defaultLang: "nl", currency: "USD", launched: true },
  { code: "DE", name: "Deutschland / Germany",   defaultLang: "en", currency: "EUR", launched: false },
  { code: "FR", name: "France",                  defaultLang: "en", currency: "EUR", launched: false },
  { code: "GB", name: "United Kingdom",          defaultLang: "en", currency: "GBP", launched: false },
  { code: "ES", name: "España / Spain",          defaultLang: "en", currency: "EUR", launched: false },
  { code: "IT", name: "Italia / Italy",          defaultLang: "en", currency: "EUR", launched: false },
];

// ─── CURRENCY & TAX (per country) ────────────────────────────
// One place that maps a salon's profiles.country_code to how money and tax are
// shown. Existing NL/BE salons are unaffected (EUR + BTW); Bonaire salons get
// USD + ABB, etc. All amounts on the booking page, dashboard, invoices and PDF
// reports flow through these helpers instead of a hardcoded "€".
const CURRENCIES = {
  EUR: { code: "EUR", symbol: "€",     locale: "nl-NL" },
  USD: { code: "USD", symbol: "$",     locale: "en-US" },
  GBP: { code: "GBP", symbol: "£",     locale: "en-GB" },
  AWG: { code: "AWG", symbol: "Afl. ", locale: "en-US" }, // Aruban florin
  // Caribische gulden — verving op 31 maart 2025 de Antilliaanse gulden (ANG)
  // op Curaçao en Sint Maarten, 1:1. Officiële schrijfwijze is "Cg", zonder punt.
  XCG: { code: "XCG", symbol: "Cg ",   locale: "en-US" },
};

// The language the SALON OWNER receives system emails in, derived from the
// salon's country (mirrors DUTCH_COUNTRIES/langFor in the edge functions):
// NL/BE/AW/CW/BQ → nl, everything else → en. Distinct from the CLIENT's
// browsing language — a Dutch owner shouldn't get an English "new booking"
// email just because their client booked in English.
function ownerLangFor(countryCode) {
  const country = COUNTRIES.find((c) => c.code === (countryCode || "NL"));
  return (country && country.defaultLang) || "nl";
}
// Resolve a salon's currency from its country_code (fallback EUR for anything
// unknown/missing, so existing behaviour is preserved).
function currencyForCountry(countryCode) {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  return (country && CURRENCIES[country.currency]) || CURRENCIES.EUR;
}
// Just the currency symbol — the minimal swap for display spots that keep their
// own number formatting (e.g. `${curSym(cc)}${price}` replacing `€${price}`).
function curSym(countryCode) {
  return currencyForCountry(countryCode).symbol;
}
// Full money format: symbol + locale-grouped number ($1,234.50 vs €1.234,50).
// `decimals` defaults to 2; pass null to keep the number as-is (with grouping).
function fmtMoney(amount, countryCode, decimals = 2) {
  const cur = currencyForCountry(countryCode);
  const n = Number(amount) || 0;
  const opts = decimals == null ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return cur.symbol + n.toLocaleString(cur.locale, opts);
}

// ─── TAX RULES (per jurisdictie) ─────────────────────────────
// De ENIGE plek waar een belastingtarief mag ontstaan. Gekeyed op country_code,
// of op profiles.tax_region wanneer één landcode meerdere stelsels bevat: BQ
// dekt Bonaire, Saba én Sint Eustatius, met verschillende ABB-tarieven.
//
// Wat je moet weten om dit te lezen: alleen NL/BE hebben een echte BTW met
// aftrek van voorbelasting. ABB (BES), BBO/BAVP/BAZV (Aruba) en OB (Curaçao)
// zijn CUMULATIEVE omzetbelastingen — elke schakel betaalt over de eigen omzet,
// er is geen aftrekketen. Twee gevolgen die je hieronder terugziet:
//
//   • BES-eilanden: goederen worden belast bij INVOER of bij de lokale
//     producent. Een salon die ingekochte shampoo doorverkoopt is geen
//     producent en brengt daar dus GEEN ABB over in rekening
//     (productsTaxable: false). Behandelingen zijn wél belast.
//
//   • Aruba: het BEDRAG aan BBO/BAVP/BAZV mag sinds 1-1-2019 niet apart op de
//     factuur staan (showTaxLine: false). Het omzetrapport toont het wél —
//     dat is een intern document voor de eigenaar en de boekhouder.
//
// Prijzen zijn overal belasting-INCLUSIEF. Op de eilanden is dat niet alleen
// gewoonte maar voorschrift: er mag nooit een percentage bovenop de prijs die
// de klant in de zaak ziet staan. Tel hier dus nooit iets bij op — reken terug.
const TAX_RULES = {
  NL:        { label: "BTW",           idLabel: "BTW-id",      serviceRate: 21,   productsTaxable: true,  showTaxLine: true },
  BE:        { label: "BTW",           idLabel: "BTW-nr.",     serviceRate: 21,   productsTaxable: true,  showTaxLine: true },
  "BQ-BON":  { label: "ABB",           idLabel: "CRIB",        serviceRate: 6,    productsTaxable: false, showTaxLine: true,  island: "Bonaire" },
  "BQ-SAB":  { label: "ABB",           idLabel: "CRIB",        serviceRate: 4,    productsTaxable: false, showTaxLine: true,  island: "Saba" },
  "BQ-EUX":  { label: "ABB",           idLabel: "CRIB",        serviceRate: 4,    productsTaxable: false, showTaxLine: true,  island: "Sint Eustatius" },
  // 7% = BBO 2,5% + BAVP 1,5% + BAZV 3%, samengevoegd sinds 1 januari 2023.
  AW:        { label: "BBO/BAVP/BAZV", idLabel: "Fiscaal nr.", serviceRate: 7,    productsTaxable: true,  showTaxLine: false },
  // Het algemene OB-tarief is 6%, maar er bestaan ook 0/7/9% en het is niet
  // vastgesteld waar salondiensten onder vallen. Vellu vult daarom niets in en
  // vraagt de eigenaar het bij zijn boekhouder op te halen.
  CW:        { label: "OB",            idLabel: "Fiscaal nr.", serviceRate: null, productsTaxable: true,  showTaxLine: true,  rateUnknown: true, suggestedRate: 6 },
};
// Eilandkeuzes die de instellingen aanbieden zodra het land BQ is.
const TAX_REGIONS_BY_COUNTRY = {
  BQ: [
    { value: "BQ-BON", label: "Bonaire" },
    { value: "BQ-SAB", label: "Saba" },
    { value: "BQ-EUX", label: "Sint Eustatius" },
  ],
};
const DEFAULT_TAX_RULE = TAX_RULES.NL;
// tax_region wint van country_code, zodat een salon op Saba niet stilletjes het
// Bonaire-tarief krijgt. Zonder regio valt BQ terug op Bonaire (verreweg het
// grootste eiland, en wat bestaande rijen zijn).
function taxRuleFor(countryCode, taxRegion) {
  if (taxRegion && TAX_RULES[taxRegion]) return TAX_RULES[taxRegion];
  if (countryCode === "BQ") return TAX_RULES["BQ-BON"];
  return TAX_RULES[countryCode] || DEFAULT_TAX_RULE;
}
// Backwards-compatible: geeft alleen het label/idLabel terug (signup-scherm,
// StaffApp). Voor alles wat rekent: gebruik resolveTax.
function taxForCountry(countryCode, taxRegion) {
  const r = taxRuleFor(countryCode, taxRegion);
  return { label: r.label, idLabel: r.idLabel, defaultRate: r.serviceRate ?? 0 };
}

// Alles wat een bon, factuur of rapport nodig heeft om belasting te tonen,
// afgeleid uit één profielrij. Consumenten lezen NOOIT btw_rate rechtstreeks.
// Tarieven komen er als PERCENTAGE uit (21, niet 0.21).
function resolveTax(profile) {
  const p = profile || {};
  const rule = taxRuleFor(p.country_code, p.tax_region);
  // Het instellingenveld zet "" bij wissen; parseFloat("") is NaN, en zonder
  // deze guard wordt dat stilletjes 0% op een bon.
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };
  const serviceRate = num(p.btw_rate) ?? rule.serviceRate ?? 0;
  const productsTaxable = p.products_taxable === undefined || p.products_taxable === null
    ? rule.productsTaxable
    : !!p.products_taxable;
  const productRate = productsTaxable ? (num(p.product_tax_rate) ?? serviceRate) : 0;
  // Belastingplichtig? De expliciete kolom wint; een rij van vóór de migratie
  // valt terug op "heeft een fiscaal nummer", precies het oude gedrag.
  const registered = (p.tax_registered === undefined || p.tax_registered === null)
    ? !!String(p.btw_id || "").trim()
    : !!p.tax_registered;
  const anyRate = serviceRate > 0 || productRate > 0;
  return {
    label: rule.label,
    idLabel: rule.idLabel,
    island: rule.island || null,
    registered,
    serviceRate,
    productRate,
    productsTaxable,
    defaultServiceRate: rule.serviceRate,
    suggestedRate: rule.suggestedRate ?? rule.serviceRate ?? null,
    rateUnknown: !!rule.rateUnknown,
    // Mag het BEDRAG op een document voor de KLANT staan? Op Aruba niet.
    mayShowOnCustomerDoc: rule.showTaxLine !== false,
    // Bon en factuur.
    showTax: registered && anyRate && rule.showTaxLine !== false,
    // Omzet-/productrapport: interne stukken, daar mag het altijd.
    showTaxInternal: registered && anyRate,
  };
}

// ─── PUBLIC-PAGE FONT STYLES ─────────────────────────────────
// The salon picks one of these for their booking page; it swaps the DISPLAY
// font (salon name, section titles, prices — everything currently in Cormorant
// Garamond). Body text stays Jost everywhere. `google` is the Google Fonts
// css2 `family=` value: the client page injects a stylesheet link for the
// chosen font on load (classic is already in index.html, so it's skipped).
// `preview` is the sample glyphs shown in the owner's picker.
// Keep the keys in sync with profiles.page_font (see the add_page_font migration).
const PAGE_FONTS = {
  classic:     { label_nl: "Klassiek",    label_en: "Classic",     label_es: "Clásico",   family: "'Cormorant Garamond', serif",  google: "Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300", preview: "Aa" },
  modern:      { label_nl: "Modern",      label_en: "Modern",      label_es: "Moderno",        family: "'Poppins', sans-serif",        google: "Poppins:wght@400;500;600",                            preview: "Aa" },
  elegant:     { label_nl: "Elegant",     label_en: "Elegant",     label_es: "Elegante",       family: "'Playfair Display', serif",    google: "Playfair+Display:wght@400;500;600",                   preview: "Aa" },
  bold:        { label_nl: "Bold",        label_en: "Bold",        label_es: "Bold",           family: "'Archivo Black', sans-serif",  google: "Archivo+Black",                                       preview: "Aa" },
  playful:     { label_nl: "Speels",      label_en: "Playful",     label_es: "Juguetón",  family: "'Fredoka', sans-serif",        google: "Fredoka:wght@400;500;600",                            preview: "Aa" },
  handwriting: { label_nl: "Handschrift", label_en: "Handwriting", label_es: "Manuscrito",     family: "'Dancing Script', cursive",    google: "Dancing+Script:wght@500;600;700",                     preview: "Aa" },
};
// Resolve a stored key to a font config, always falling back to classic so a
// bad/empty value can never leave the page with no display font.
const getPageFont = (key) => {
  // "custom:<Name>" — a Professional salon's own Google Fonts pick. Sanitised
  // here (quotes/braces stripped) so the name is safe both as a CSS family
  // and inside the fonts.googleapis.com URL.
  if (typeof key === "string" && key.startsWith("custom:")) {
    const name = key.slice(7).trim().replace(/["'<>;{}()\\]/g, "").slice(0, 60);
    if (name) return {
      label_nl: name, label_en: name, label_es: name,
      family: `'${name}', sans-serif`,
      google: encodeURIComponent(name).replace(/%20/g, "+"),
      preview: "Aa", custom: true,
    };
  }
  return PAGE_FONTS[key] || PAGE_FONTS.classic;
};
// Injects (once) the Google Fonts stylesheet for a chosen font. No-op for
// classic (already loaded in index.html) and if the link is already present.
function ensurePageFontLoaded(key) {
  try {
    const f = getPageFont(key);
    if (key === "classic" || !f.google) return;
    const id = `page-font-${String(key).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
    document.head.appendChild(link);
  } catch { /* SSR / no document */ }
}

// Raw translation tables. Access via the `T` export (Proxy-wrapped below)
// so missing languages fall back to English instead of returning undefined.
const _T_RAW = {
  nl: {
    book:"Boeken", myAppts:"Afspraken", dashboard:"Dashboard", agenda:"Agenda", from:"Vanaf",
    invoices:"Facturen", settings:"Instellingen", selectService:"Kies een Behandeling",
    selectServiceSub:"Kies de behandeling die je wilt", selectDate:"Kies een Datum",
    selectDateSub:"Kies een datum en tijd", selectTime:"Kies een Tijd",
    yourDetails:"Jouw Gegevens", yourDetailsSub:"Vul je gegevens in",
    confirmBooking:"Bevestig je afspraak", confirmSub:"Controleer je gegevens",
    firstName:"Voornaam", lastName:"Achternaam", email:"E-mailadres",
    phone:"Telefoonnummer", optional:"optioneel",
    payMethod:"Betaalmethode", payOnline:"Betaalverzoek na afloop", payArrival:"Betalen bij Afspraak",
    next:"Volgende →", confirm:"Bevestigen", newBooking:"Nieuwe Afspraak",
    treatment:"Behandeling", date:"Datum", time:"Tijd", name:"Naam", payment:"Betaling",
    total:"Totaal", confirmedSub:"We zien je op", at:"om",
    confirmationSent:"Bevestiging verstuurd naar", noAppts:"Nog geen afspraken",
    welcomeBack:"Welkom terug", todayAppts:"Afspraken vandaag",
    noTodayAppts:"Geen afspraken vandaag", markComplete:"Markeer Voltooid",
    sendInvoice:"Factuur Sturen", invoiceSent:"Factuur verstuurd",
    completedTreatments:"Voltooide behandelingen", totalEarnings:"Totale inkomsten",
    noCompleted:"Nog geen voltooide afspraken", manageSalon:"Beheer je bedrijf",
    profile:"Profiel", brandColor:"Merkkleur", services:"Diensten", save:"Opslaan",
    saved:"Opgeslagen", logout:"Uitloggen", businessName:"Bedrijfsnaam", city:"Stad",
    deleteService:"Verwijder",
    ownerLogin:"Eigenaar Login", ownerSub:"Inloggen als ondernemer",
    emailField:"E-mailadres", passwordField:"Wachtwoord", login:"Inloggen",
    signUp:"Registreren", signUpTitle:"Account Aanmaken",
    businessNameField:"Bedrijfsnaam (bijv. Studio Rosa)",
    slugField:"Jouw link (bijv. studio-rosa)",
    createAccount:"Account Aanmaken", signIn:"Inloggen",
    manageAppts:"Beheer je afspraken", earnings:"Inkomsten",
    appts:"afspraken", treatments:"behandelingen", sent:"Verstuurd", send:"Sturen",
    min:"min", photos:"Foto's", addPhoto:"Foto toevoegen", noPhotos:"Nog geen foto's",
    deletePhoto:"Verwijder", salonLink:"Jouw link", copyLink:"Kopieer",
    copied:"Gekopieerd!", serviceName:"Dienst naam (NL)", serviceNameEn:"Dienst naam (EN)",
    price:"Prijs (€)", duration:"Duur (min)", fillRequired:"Vul naam en prijs in",
    bookAt:"Boek bij", enterSalon:"Voer link in", goToSalon:"Naar pagina",
    salonNotFound:"Niet gevonden. Probeer een andere naam.",
    orEnterSlug:"Of voer een link in:",
    availableSalons:"Beschikbare studios (demo)",
    variants:"Varianten", extras:"Extra's", addVariant:"+ Variant toevoegen", addExtra:"+ Extra toevoegen",
    variantName:"Variant naam (NL)", variantNameEn:"Variant naam (EN)", variantDesc:"Omschrijving (NL)", variantDescEn:"Omschrijving (EN)",
    extraName:"Extra naam (NL)", extraNameEn:"Extra naam (EN)",
    selectVariant:"Kies een variant", selectExtras:"Extra's toevoegen",
    noVariants:"Geen varianten", noExtras:"Geen extra's",
    addToCalendar:"Toevoegen aan agenda", googleCalendar:"Google Agenda", appleCalendar:"Apple / Outlook",
    invoiceDetails:"Factuurgegevens", address:"Adres", kvkNumber:"KVK-nummer", btwId:"BTW-id", ibanNumber:"IBAN",
    invoicePrefix:"Factuur prefix", invoiceSettings:"Vul je factuurgegevens in om wettelijk correcte facturen te sturen",
    reviews:"Reviews", writeReview:"Review schrijven", rating:"Beoordeling", reviewComment:"Hoe was je ervaring?",
    submitReview:"Verstuur review", reviewSubmitted:"Bedankt voor je review!", noReviews:"Nog geen reviews",
    analytics:"Analytics", weeklyRevenue:"Omzet deze week", monthlyRevenue:"Omzet deze maand",
    totalRevenue:"Omzet (90 dagen)", totalAppts:"Afspraken (90 dagen)", avgRating:"Gem. beoordeling",
    popularServices:"Populairste behandelingen", busiestDays:"Drukste dagen",
    revenueOverTime:"Omzet verloop", bookings:"boekingen",
    staff:"Team", addStaff:"+ Medewerker toevoegen", staffName:"Naam medewerker", staffBio:"Korte bio (zichtbaar voor klanten)",
    staffRole:"Functie (bijv. Nagelstyliste)", selectStaff:"Kies een medewerker",
    anyStaff:"Geen voorkeur", noStaff:"Nog geen medewerkers",
    businessHours:"Openingstijden", openTime:"Open", closeTime:"Sluit",
    businessHoursDesc:"Stel je werkdagen en -uren in", closedOnDay:"Gesloten op deze dag",
    // New customization translations
    bookingPolicy:"Boekingsvoorwaarden", bookingPolicyDesc:"Voorwaarden waar klanten mee akkoord moeten gaan",
    salonContact:"Contactgegevens salon", salonContactDesc:"Zichtbaar op je salonpagina voor klanten",
    salonPhone:"Telefoonnummer salon", salonInstagram:"Instagram (bijv. @jouwnaam)", salonEmail:"E-mail salon (zichtbaar voor klanten)",
    bookingPolicyPlaceholder:"Bijv. Annuleren kan tot 24 uur van tevoren...",
    agreeToPolicy:"Ik ga akkoord met de voorwaarden",
    phoneRequired:"Telefoonnummer verplicht", phoneRequiredDesc:"Maak telefoonnummer verplicht voor klanten",
    appearance:"Uiterlijk", logo:"Logo", coverImage:"Cover afbeelding",
    uploadCover:"Cover uploaden", removeLogo:"Verwijder logo", removeCover:"Verwijder cover",
    logoDesc:"Wordt getoond in de header (aanbevolen: vierkant, max 500x500px)",
    coverDesc:"Wordt getoond bovenaan je pagina (aanbevolen: 1200x400px)",
    discountCodes:"Kortingscodes", addDiscountCode:"+ Kortingscode toevoegen",
    discountCode:"Code", discountAmount:"Korting", discountType:"Type",
    discountPercent:"Percentage (%)", discountFixed:"Vast bedrag (€)",
    discountActive:"Actief", deleteCode:"Verwijder", applyCode:"Toepassen",
    invalidCode:"Ongeldige kortingscode", codeApplied:"Kortingscode toegepast!",
    discount:"Korting", enterDiscountCode:"Kortingscode invoeren",
    required:"verplicht",
    // Categories
    categories:"Categorieën", addCategory:"+ Categorie toevoegen", categoryName:"Categorienaam (NL)",
    categoryNameEn:"Categorienaam (EN)", noCategory:"Geen categorie", allCategories:"Alle behandelingen",
    manageCategories:"Categorieën beheren",
    // Client accounts
    welcomeBackClient:"Welkom terug", foundYourDetails:"We hebben je gegevens gevonden!",
    // Waitlist
    joinWaitlist:"Zet me op wachtlijst", waitlistTitle:"Op de wachtlijst",
    waitlistSub:"Laat je gegevens achter. We nemen contact op als er een plek vrijkomt.",
    waitlistNotes:"Voorkeur / opmerking", waitlistNotesPh:"Bijv. liefst 's ochtends",
    waitlistJoined:"Je staat op de wachtlijst!",
    waitlistJoinedSub:"We laten je weten zodra er een plek vrijkomt.",
    waitlistNoDate:"Kies eerst een datum", waitlistSubmitError:"Er ging iets mis, probeer opnieuw",
    // Cancellation
    cancelBooking:"Afspraak annuleren", cancelBookingDesc:"Weet je zeker dat je wilt annuleren?",
    cancellationReason:"Reden voor annulering (optioneel)", confirmCancel:"Ja, annuleren",
    bookingCancelled:"Je afspraak is geannuleerd", cannotCancel:"Annuleren niet meer mogelijk",
    cancelBeforeTime:"Annuleren kan tot 24 uur van tevoren",
    // Pagination & Timeline
    showMore:"Meer laden", showLess:"Minder tonen", showing:"Getoond", of:"van",
    todaySchedule:"Schema vandaag", nextUp:"Volgende", inProgress:"Nu bezig", upcoming:"Straks",
    noMoreToday:"Geen afspraken meer vandaag", freeDay:"Vrije dag!",
    startsIn:"Start over", minutesShort:"min", hoursShort:"u",
    // Subscriptions
    choosePlan:"Kies een abonnement", choosePlanSub:"Selecteer het plan dat bij jou past",
    planStarter:"Starter", planProfessional:"Professional",
    planStarterPrice:"19", planProfessionalPrice:"35",
    planStarterDesc:"Perfect om te beginnen", planProfessionalDesc:"Voor de groeiende salon",
    planFeatureBookings:"Online boekingen", planFeatureStaff:"Team beheer", planFeatureAnalytics:"Analytics dashboard",
    planFeatureReviews:"Reviews systeem", planFeatureEmail:"Email bevestigingen", planFeatureReminders:"24u herinneringen",
    planFeatureCustomBranding:"Eigen branding", planFeatureDiscounts:"Kortingscodes", planFeaturePriority:"Prioriteit support",
    planFeatureUnlimited:"Onbeperkt medewerkers", planFeatureCategories:"Categorieën",
    planFeatureAllStarter:"Alles van Starter +", planFeatureTeamLogins:"Team accounts (eigen login)",
    planFeatureNewsletter:"Nieuwsbrief & klant-export", planFeatureLocations:"Meerdere locaties",
    selectPlan:"Plan kiezen", currentPlan:"Huidig plan", activePlan:"Actief", planExpires:"Verloopt op",
    billing:"Abonnement", billingDesc:"Beheer je abonnement", noPlan:"Geen actief abonnement",
    contactSupport:"Neem contact op om je plan te wijzigen", paymentComingSoon:"Betaling via iDEAL komt binnenkort beschikbaar",
    planActive:"Je abonnement is actief", upgradePlan:"Upgraden",
    // Break times & no-show & allergies
    breakMinutes:"Pauzetijd tussen afspraken", breakMinutesDesc:"Buffer na elke afspraak",
    breakNone:"Geen pauze", breakMin:"min pauze",
    noShow:"Niet verschenen", markNoShow:"No-show", noShowWarning:"Let op: deze klant is eerder niet verschenen",
    noShowCount:"keer niet verschenen",
    slotInterval:"Tijdslot interval", slotIntervalDesc:"Om de hoeveel minuten kunnen klanten (en jijzelf) een starttijd kiezen?", slotIntervalMin:"min",
    allergies:"Allergieën / bijzonderheden", allergiesPlaceholder:"Bijv. latex allergie, gevoelige huid...",
    allergiesOptional:"optioneel", clientAllergies:"Allergie-info",
    // Multi-service booking
    addService:"+ Behandeling toevoegen", removeService:"Verwijder", selectedServices:"Geselecteerde behandelingen",
    servicesSelected:"behandelingen geselecteerd", serviceSelected:"behandeling geselecteerd",
    yourServices:"Jouw behandelingen", noServicesSelected:"Kies minimaal 1 behandeling",
    totalDuration:"Totale duur",
    // Theme
    darkMode:"Donker", lightMode:"Licht",
    // Calendar month view
    monthView:"Maand", weekView:"Week", prevWeek:"Vorige", nextWeek:"Volgende", prevMonth:"Vorige maand", nextMonth:"Volgende maand", backToToday:"Vandaag", yearView:"Jaar",
    // Client selector
    selectClient:"Kies een bestaande klant", searchClients:"Zoek klant op naam of e-mail...", newClient:"Nieuwe klant", orNewClient:"Of vul nieuwe gegevens in:",
    // Time blocking
    blockTime:"Tijd blokkeren", blockWholeDay:"Hele dag", blockTimeSlot:"Tijdslot", blockFrom:"Van", blockTo:"Tot",
    // Custom color
    customColor:"Eigen kleur",
    // Follow-up
    followupRate:"Follow-up response rate",
    // Reminder timing
    reminderTiming:"Herinnering timing", reminderTimingDesc:"Wanneer krijgen klanten een herinnering voor hun afspraak?",
    rebookNudge:"Herboek herinnering", rebookNudgeDesc:"Na hoeveel weken krijgen klanten een 'we missen je' e-mail?", rebookNudgeOff:"Uit", rebookNudgeWeeks:"weken",
    reminderBefore:"voor de afspraak", reminderNone:"Geen herinnering",
    // Onboarding
    onboardingWelcome:"Welkom bij Vellu!", onboardingWelcomeSub:"Laten we je salon instellen. Dit duurt maar 2 minuten.",
    onboardingStep1:"Salon gegevens", onboardingStep1Sub:"Hoe heet je salon?",
    onboardingStep2:"Eerste behandeling", onboardingStep2Sub:"Voeg je eerste behandeling toe",
    onboardingStep3:"Openingstijden", onboardingStep3Sub:"Wanneer ben je open?",
    onboardingDone:"Je salon is klaar!", onboardingDoneSub:"Je kunt nu je link delen en boekingen ontvangen.",
    onboardingNext:"Volgende stap →", onboardingSkip:"Later instellen", onboardingFinish:"Naar je dashboard →",
    onboardingServiceName:"Behandeling naam", onboardingServicePrice:"Prijs (€)", onboardingServiceDuration:"Duur (min)",
    // Google Calendar
    googleCalendarDesc:"Synchroniseer afspraken automatisch met je Google Agenda",
    googleCalendarConnect:"Google Agenda koppelen", googleCalendarConnected:"Google Agenda gekoppeld",
    googleCalendarDisconnect:"Ontkoppelen", googleCalendarConnecting:"Verbinden...",
    addToGoogleCal:"Google Agenda", exportDayToCal:"Dag exporteren naar Google Agenda",
    // WhatsApp
    whatsappNumber:"WhatsApp nummer salon", whatsappEnabled:"WhatsApp notificaties",
    whatsappEnabledDesc:"Toon WhatsApp knoppen voor klanten en in het dashboard",
    sendWhatsApp:"WhatsApp sturen", whatsappBookingConfirm:"Bevestig via WhatsApp",
    whatsappReminder:"Herinnering sturen via WhatsApp",
    // Auto-translate
    autoTranslateBtn:"Vertalen", translating:"Vertalen...", translateFailed:"Vertaling mislukt",
    // Locations
    locations:"Locaties", addLocation:"+ Locatie toevoegen", locationName:"Locatienaam",
    locationAddress:"Adres", locationCity:"Stad", locationPhone:"Telefoon",
    selectLocation:"Kies een locatie", selectLocationSub:"Bij welke vestiging wil je boeken?",
    mainLocation:"Hoofdvestiging", noLocations:"Nog geen locaties",
    allLocations:"Alle locaties", filterByLocation:"Filter op locatie",
    // Edit & manual appointments
    edit:"Bewerken", editService:"Dienst bewerken", editStaff:"Medewerker bewerken", editLocation:"Locatie bewerken",
    saveChanges:"Wijzigingen opslaan", cancelEdit:"Annuleren",
    addAppointment:"+ Afspraak toevoegen", addAppointmentDesc:"Voeg handmatig een afspraak toe",
    selectServiceFor:"Kies een dienst", selectDateFor:"Kies datum en tijd", clientDetails:"Klantgegevens",
    appointmentAdded:"Afspraak toegevoegd! Bevestiging verstuurd.",
    // Exception days & vacation
    exceptionDays:"Uitzonderingsdagen", addException:"+ Uitzonderingsdag",
    exceptionDesc:"Eenmalig open op een dag die normaal dicht is",
    blockedDays:"Blokkeer dagen of tijden", addBlocked:"+ Blokkeren",
    blockedDesc:"Blokkeer een hele dag (bv. vakantie) of alleen een tijdvak (bv. lunch of privé-afspraak van 15:00–16:00) zonder je vaste openingstijden te wijzigen.",
    blockedReason:"Reden (optioneel)", vacation:"Vakantie", blocked:"Geblokkeerd",
    dateFrom:"Van", dateTo:"Tot",
    // Staff availability
    staffAvailability:"Beschikbaarheid", staffDays:"Werkdagen",
    staffAvailabilityDesc:"Stel per medewerker in op welke dagen ze werken",
    // Team accounts
    accountType:"Account type", jointAccount:"Gedeeld account", teamAccount:"Team account",
    jointDesc:"Eén login voor de hele salon", teamDesc:"Elke medewerker heeft een eigen login",
    jointInfo:"Kies dit als jij (of jullie samen) alles beheert vanaf één account. Iedereen ziet dezelfde agenda en dezelfde inloggegevens. Ideaal voor een solo-onderneming of een klein team dat samen werkt.",
    teamInfo:"Kies dit als elke medewerker een eigen login krijgt. Zij zien hun eigen agenda, klanten en verdiensten. Handig voor grotere teams waar iedereen zelfstandig zijn planning bijhoudt. Alleen op het Professional-plan.",
    inviteStaff:"Uitnodigen", inviteStaffDesc:"Maak een login aan voor deze medewerker",
    staffEmail:"E-mail medewerker", staffPassword:"Wachtwoord", inviteSent:"Login aangemaakt!",
    emailTaken:"Dit e-mailadres is al in gebruik", staffLoginInfo:"Logt in op vellu.cc/owner",
    myAgenda:"Mijn agenda", mySettings:"Mijn instellingen", myWorkingHours:"Mijn werktijden",
    myServices:"Mijn diensten", staffWelcome:"Welkom", noAccessPage:"Je hebt geen toegang tot deze pagina",
    bookingWindow:"Boekingsvenster", bookingWindowDesc:"Hoe ver van tevoren klanten kunnen boeken",
    minAdvance:"Minimaal van tevoren", maxAdvance:"Maximaal van tevoren",
    hours:"uur", days:"dagen",
    // Profile page
    profileServices:"Diensten", profileTeam:"Team", profileGallery:"Galerij",
    profileReviews:"Reviews", profileContact:"Contact",
    bookAppointment:"Boek een afspraak", bookNow:"Boek nu",
    openNow:"Open", closedNow:"Gesloten", closedToday:"Gesloten vandaag",
    closesAt:"Sluit om", opensAt:"Opent om",
    viewOnMap:"Bekijk op kaart", contactUs:"Contact opnemen",
    poweredBy:"Aangedreven door", noCommission:"0% commissie boekingsplatform",
    writeAReview:"Schrijf een review", sortBy:"Sorteer op", highestRated:"Hoogst beoordeeld",
    mostRecent:"Meest recent", openingHours:"Openingstijden",
    backToProfile:"← Terug naar profiel",
    nDaysAgo:"dagen geleden", nWeeksAgo:"weken geleden", nMonthsAgo:"maanden geleden",
    gallery:"Galerij", noGallery:"Nog geen foto's in de galerij",
    // Landing page
    heroTag:"Voor nail techs, lash artists, kappers & meer",
    heroTitle:"Jouw salon.", heroTitle2:"Jouw regels.", heroBrand:"Jouw omzet.",
    heroSub:"Je eigen boekingspagina met jouw naam, jouw kleuren en jouw diensten. Vast tarief, 0% commissie. Klaar in 2 minuten.",
    startFree:"Start 14-daagse trial →", howItWork:"Hoe werkt het?",
    findSalonNav:"Klant? Vind een salon →",
    findSalonTitle:"Vind een salon of studio",
    findSalonSub:"Van nagelstudio tot kapper — zoek op naam, plaats of behandeling en boek direct online.",
    findSalonPh:"Zoek op naam, plaats of behandeling…",
    findSalonNoRes:"Niets gevonden.",
    findSalonNoResHint:"Heb je een vellu.cc-link? Vul de naam in:",
    findSalonCta:"Jouw zaak hier?",
    findSalonCtaSub:"Je eigen boekingspagina, live binnen 10 minuten.",
    findSalonBook:"Bekijk & boek",
    searchLabel:"Al een afspraak? Ga naar je salon",
    calcTitle:"Bereken je besparing",
    calcSub:"Vellu is een vast tarief. De meeste booking platformen rekenen commissie per boeking. Schuif hieronder hoeveel jij gemiddeld doet.",
    calcBookings:"Boekingen per maand",
    calcAvgPrice:"Gemiddelde behandelprijs",
    calcRevenue:"Maandomzet",
    calcTreatwellCost:"Andere platformen (~8% commissie)",
    calcVelluCost:"Vellu (vast tarief)",
    calcSavingsYear:"Je houdt extra per jaar",
    calcFootnote:"Commissie-tarief is een marktindicatie (5–10%) van vergelijkbare booking platformen. Vellu = €19/maand of €15,80/maand bij jaarlijks. Geen verborgen kosten.",
    yearlyEquivalent:"= €{m}/maand",
    trustOrigin:"Gemaakt in Den Haag",
    backToTop:"Naar boven",
    liveIn3:"In 3 stappen live",
    step1:"Maak je pagina", step1d:"Voeg je behandelingen toe, stel je team in, kies je kleuren. Je eigen link: vellu.cc/jouw-naam.",
    step2:"Deel je link", step2d:"Zet je link in je Instagram bio, WhatsApp status of visitekaartje. Klanten boeken direct, zonder tussenpartij.",
    step3:"Ontvang boekingen", step3d:"Automatische bevestigingen, 24u herinneringen en follow-up emails. Jij focust op je vak, Vellu regelt de rest.",
    everythingNeeded:"Alles wat je salon nodig heeft",
    whatUsersSay:"Wat onze gebruikers zeggen",
    simplePricing:"Simpele, eerlijke prijzen", perMonth:"/maand", perYear:"/jaar", getStarted:"Beginnen",
    billingMonthly:"Maandelijks", billingYearly:"Jaarlijks", twoMonthsFree:"2 maanden gratis", billedYearly:"jaarlijks gefactureerd",
    popular:"Populair", faqTitle:"Veelgestelde vragen",
    ctaTitle:"Begin vandaag met je eigen boekingspagina",
    ctaSub:"Klaar in 2 minuten. Geen commissie. Geen gedoe.",
    closed:"gesloten",
    back:"Terug", close:"Sluiten", cancel:"Annuleren", delete:"Verwijderen",
    terms:"Algemene voorwaarden", dpa:"Verwerkingsovereenkomst", privacy:"Privacy",
    noTreatments:"Geen behandelingen beschikbaar", noTreatmentsCat:"Geen behandelingen in deze categorie",
    noTimesAvailable:"Geen beschikbare tijden op deze dag",
    forgotPassword:"Wachtwoord vergeten?", resetSent:"Reset link verstuurd! Check je inbox.",
    fillAllFields:"Vul alle velden in", fillEmail:"Vul je e-mailadres in", fillBusinessName:"Vul je bedrijfsnaam in",
    wrongCredentials:"Verkeerd e-mail of wachtwoord",
    bookingError:"Er ging iets mis bij het boeken. Probeer het opnieuw.",
    galleryPhoto:"Galerij foto", goodToKnow:"Goed om te weten",
    yourBooking:"Jouw boeking", chooseVariant:"Kies een variant voor: ",
    howWasAppt:"Hoe was je afspraak?", today:"vandaag",
    welcomeVellu:"Welkom bij Vellu", followSteps:"Volg deze stappen om je eerste boeking te ontvangen:",
    addServices:"Voeg je behandelingen toe", setHours:"Stel je openingstijden in",
    uploadLogo:"Upload je logo", shareLink:"Deel je link: ",
    contactOwnerServices:"Neem contact op met de saloneigenaar om diensten toe te voegen of te verwijderen.",
    add:"Toevoegen", preview:"Preview", owner:"eigenaar", ownerDashboard:"EIGENAAR DASHBOARD",
    salonInsight:"Inzicht in je salon", vsLastWeek:"vs vorige week", previewPage:"Bekijk pagina",
    exportCalendar:"Exporteer agenda", viewMore:"Bekijk meer →", everyone:"Iedereen",
    confirmed:"Bevestigd", cancelled:"Geannuleerd", completed:"Voltooid",
    apptCompleted:"Afspraak voltooid", errorCompleting:"Fout bij voltooien",
    client:"Klant",
    searchPlaceholder:"Zoek op naam of dienst...",
    reviewSaveFailed:"Kon review niet opslaan. Probeer het opnieuw.",
    somethingWrong:"Er ging iets mis.", confirmation:"Bevestiging",
    allergyDisclaimer:"Door allergie-informatie in te vullen geef je toestemming voor het verwerken van deze gezondheidsgegevens, uitsluitend om een veilige behandeling te waarborgen (Art. 9 AVG). Je kunt dit veld leeg laten.",
    bookingLegalNotice:"Door te bevestigen bevestig je dat je 16 jaar of ouder bent (of toestemming hebt van een ouder), ga je akkoord met ons",
    bookingLegalNoticeAnd:"en",
    bookingLegalNoticeRefund:"Voltooide behandelingen kunnen niet worden terugbetaald; annuleren kan tot je afspraak via de link in je bevestigingsmail.",
    noTreatmentsCatYet:"Nog geen behandelingen beschikbaar",
  },
  en: {
    book:"Book", myAppts:"Appointments", dashboard:"Dashboard", agenda:"Calendar", from:"From",
    invoices:"Invoices", settings:"Settings", selectService:"Select a Service",
    selectServiceSub:"Choose the treatment you'd like", selectDate:"Select a Date",
    selectDateSub:"Pick a date and time", selectTime:"Select a Time",
    yourDetails:"Your Details", yourDetailsSub:"Fill in your information",
    confirmBooking:"Confirm Booking", confirmSub:"Review your details",
    firstName:"First Name", lastName:"Last Name", email:"Email address",
    phone:"Phone number", optional:"optional",
    payMethod:"Payment Method", payOnline:"Payment request afterwards", payArrival:"Pay at Appointment",
    next:"Next →", confirm:"Confirm", newBooking:"New Booking",
    treatment:"Treatment", date:"Date", time:"Time", name:"Name", payment:"Payment",
    total:"Total", confirmedSub:"We'll see you on", at:"at",
    confirmationSent:"Confirmation sent to", noAppts:"No appointments yet",
    welcomeBack:"Welcome back", todayAppts:"Today's appointments",
    noTodayAppts:"No appointments today", markComplete:"Mark Complete",
    sendInvoice:"Send Invoice", invoiceSent:"Invoice sent",
    completedTreatments:"Completed treatments", totalEarnings:"Total earnings",
    noCompleted:"No completed appointments yet", manageSalon:"Manage your business",
    profile:"Profile", brandColor:"Brand color", services:"Services", save:"Save",
    saved:"Saved", logout:"Log out", businessName:"Business name", city:"City",
    deleteService:"Delete",
    ownerLogin:"Owner Login", ownerSub:"Sign in as business owner",
    emailField:"Email address", passwordField:"Password", login:"Sign In",
    signUp:"Sign Up", signUpTitle:"Create Account",
    businessNameField:"Business name (e.g. Studio Rosa)",
    slugField:"Your link (e.g. studio-rosa)",
    createAccount:"Create Account", signIn:"Sign In",
    manageAppts:"Manage your appointments", earnings:"Earnings",
    appts:"appointments", treatments:"treatments", sent:"Sent", send:"Send",
    min:"min", photos:"Photos", addPhoto:"Add photo", noPhotos:"No photos yet",
    deletePhoto:"Delete", salonLink:"Your link", copyLink:"Copy",
    copied:"Copied!", serviceName:"Service name (NL)", serviceNameEn:"Service name (EN)",
    price:"Price (€)", duration:"Duration (min)", fillRequired:"Fill in name and price",
    bookAt:"Book at", enterSalon:"Enter link", goToSalon:"Go to page",
    salonNotFound:"Not found. Try a different name.",
    orEnterSlug:"Or enter a link:",
    availableSalons:"Available studios (demo)",
    variants:"Variants", extras:"Extras", addVariant:"+ Add variant", addExtra:"+ Add extra",
    variantName:"Variant name (NL)", variantNameEn:"Variant name (EN)", variantDesc:"Description (NL)", variantDescEn:"Description (EN)",
    extraName:"Extra name (NL)", extraNameEn:"Extra name (EN)",
    selectVariant:"Choose a variant", selectExtras:"Add extras",
    noVariants:"No variants", noExtras:"No extras",
    addToCalendar:"Add to calendar", googleCalendar:"Google Calendar", appleCalendar:"Apple / Outlook",
    invoiceDetails:"Invoice details", address:"Address", kvkNumber:"Chamber of Commerce", btwId:"VAT ID", ibanNumber:"IBAN",
    invoicePrefix:"Invoice prefix", invoiceSettings:"Fill in your invoice details to send legally compliant invoices",
    reviews:"Reviews", writeReview:"Write a review", rating:"Rating", reviewComment:"How was your experience?",
    submitReview:"Submit review", reviewSubmitted:"Thank you for your review!", noReviews:"No reviews yet",
    analytics:"Analytics", weeklyRevenue:"Revenue this week", monthlyRevenue:"Revenue this month",
    totalRevenue:"Revenue (90 days)", totalAppts:"Appointments (90 days)", avgRating:"Avg. rating",
    popularServices:"Most popular services", busiestDays:"Busiest days",
    revenueOverTime:"Revenue over time", bookings:"bookings",
    staff:"Team", addStaff:"+ Add staff member", staffName:"Staff name", staffBio:"Short bio (visible to clients)",
    staffRole:"Role (e.g. Nail technician)", selectStaff:"Choose a staff member",
    anyStaff:"No preference", noStaff:"No staff members yet",
    businessHours:"Business Hours", openTime:"Open", closeTime:"Close",
    businessHoursDesc:"Set your working days and hours", closedOnDay:"Closed on this day",
    // New customization translations
    bookingPolicy:"Booking Policy", bookingPolicyDesc:"Terms clients must agree to before booking",
    salonContact:"Salon contact details", salonContactDesc:"Visible on your salon page for clients",
    salonPhone:"Salon phone number", salonInstagram:"Instagram (e.g. @yourname)", salonEmail:"Salon email (visible to clients)",
    bookingPolicyPlaceholder:"E.g. Cancellations must be made 24 hours in advance...",
    agreeToPolicy:"I agree to the booking policy",
    phoneRequired:"Phone number required", phoneRequiredDesc:"Make phone number mandatory for clients",
    appearance:"Appearance", logo:"Logo", coverImage:"Cover image",
    uploadCover:"Upload cover", removeLogo:"Remove logo", removeCover:"Remove cover",
    logoDesc:"Shown in the header (recommended: square, max 500x500px)",
    coverDesc:"Shown at the top of your page (recommended: 1200x400px)",
    discountCodes:"Discount Codes", addDiscountCode:"+ Add discount code",
    discountCode:"Code", discountAmount:"Discount", discountType:"Type",
    discountPercent:"Percentage (%)", discountFixed:"Fixed amount (€)",
    discountActive:"Active", deleteCode:"Delete", applyCode:"Apply",
    invalidCode:"Invalid discount code", codeApplied:"Discount code applied!",
    discount:"Discount", enterDiscountCode:"Enter discount code",
    required:"required",
    // Categories
    categories:"Categories", addCategory:"+ Add category", categoryName:"Category name (NL)",
    categoryNameEn:"Category name (EN)", noCategory:"No category", allCategories:"All treatments",
    manageCategories:"Manage categories",
    // Client accounts
    welcomeBackClient:"Welcome back", foundYourDetails:"We found your details!",
    // Waitlist
    joinWaitlist:"Add me to the waitlist", waitlistTitle:"Join the waitlist",
    waitlistSub:"Leave your details. We'll reach out as soon as a spot opens up.",
    waitlistNotes:"Preference / note", waitlistNotesPh:"e.g. mornings preferred",
    waitlistJoined:"You're on the waitlist!",
    waitlistJoinedSub:"We'll let you know as soon as a spot opens up.",
    waitlistNoDate:"Pick a date first", waitlistSubmitError:"Something went wrong, please try again",
    // Cancellation
    cancelBooking:"Cancel booking", cancelBookingDesc:"Are you sure you want to cancel?",
    cancellationReason:"Reason for cancellation (optional)", confirmCancel:"Yes, cancel",
    bookingCancelled:"Your booking has been cancelled", cannotCancel:"Cancellation no longer possible",
    cancelBeforeTime:"Cancellations must be made 24 hours in advance",
    // Pagination & Timeline
    showMore:"Load more", showLess:"Show less", showing:"Showing", of:"of",
    todaySchedule:"Today's schedule", nextUp:"Next up", inProgress:"In progress", upcoming:"Upcoming",
    noMoreToday:"No more appointments today", freeDay:"Day off!",
    startsIn:"Starts in", minutesShort:"min", hoursShort:"h",
    // Subscriptions
    choosePlan:"Choose a plan", choosePlanSub:"Select the plan that fits you",
    planStarter:"Starter", planProfessional:"Professional",
    planStarterPrice:"19", planProfessionalPrice:"35",
    planStarterDesc:"Perfect to get started", planProfessionalDesc:"For the growing salon",
    planFeatureBookings:"Online bookings", planFeatureStaff:"Team management", planFeatureAnalytics:"Analytics dashboard",
    planFeatureReviews:"Reviews system", planFeatureEmail:"Email confirmations", planFeatureReminders:"24h reminders",
    planFeatureCustomBranding:"Custom branding", planFeatureDiscounts:"Discount codes", planFeaturePriority:"Priority support",
    planFeatureUnlimited:"Unlimited staff", planFeatureCategories:"Categories",
    planFeatureAllStarter:"Everything in Starter +", planFeatureTeamLogins:"Team accounts (own login)",
    planFeatureNewsletter:"Newsletter & client export", planFeatureLocations:"Multiple locations",
    selectPlan:"Choose plan", currentPlan:"Current plan", activePlan:"Active", planExpires:"Expires on",
    billing:"Subscription", billingDesc:"Manage your subscription", noPlan:"No active subscription",
    contactSupport:"Contact us to change your plan", paymentComingSoon:"iDEAL payment coming soon",
    planActive:"Your subscription is active", upgradePlan:"Upgrade",
    // Break times & no-show & allergies
    breakMinutes:"Break time between appointments", breakMinutesDesc:"Buffer after each appointment",
    breakNone:"No break", breakMin:"min break",
    noShow:"No-show", markNoShow:"No-show", noShowWarning:"Note: this client has missed appointments before",
    noShowCount:"times no-show",
    slotInterval:"Time slot interval", slotIntervalDesc:"How many minutes apart can clients (and you) pick a start time?", slotIntervalMin:"min",
    allergies:"Allergies / notes", allergiesPlaceholder:"E.g. latex allergy, sensitive skin...",
    allergiesOptional:"optional", clientAllergies:"Allergy info",
    // Multi-service booking
    addService:"+ Add treatment", removeService:"Remove", selectedServices:"Selected treatments",
    servicesSelected:"treatments selected", serviceSelected:"treatment selected",
    yourServices:"Your treatments", noServicesSelected:"Select at least 1 treatment",
    totalDuration:"Total duration",
    // Theme
    darkMode:"Dark", lightMode:"Light",
    // Calendar month view
    monthView:"Month", weekView:"Week", prevWeek:"Previous", nextWeek:"Next", prevMonth:"Previous month", nextMonth:"Next month", backToToday:"Today", yearView:"Year",
    // Client selector
    selectClient:"Select existing client", searchClients:"Search client by name or email...", newClient:"New client", orNewClient:"Or enter new details:",
    // Time blocking
    blockTime:"Block time", blockWholeDay:"Whole day", blockTimeSlot:"Time slot", blockFrom:"From", blockTo:"To",
    // Custom color
    customColor:"Custom color",
    // Follow-up
    followupRate:"Follow-up response rate",
    // Reminder timing
    reminderTiming:"Reminder timing", reminderTimingDesc:"When should clients receive a reminder for their appointment?",
    rebookNudge:"Rebook reminder", rebookNudgeDesc:"After how many weeks should clients get a 'we miss you' email?", rebookNudgeOff:"Off", rebookNudgeWeeks:"weeks",
    reminderBefore:"before the appointment", reminderNone:"No reminder",
    // Onboarding
    onboardingWelcome:"Welcome to Vellu!", onboardingWelcomeSub:"Let's set up your salon. This only takes 2 minutes.",
    onboardingStep1:"Salon details", onboardingStep1Sub:"What's your salon called?",
    onboardingStep2:"First treatment", onboardingStep2Sub:"Add your first treatment",
    onboardingStep3:"Opening hours", onboardingStep3Sub:"When are you open?",
    onboardingDone:"Your salon is ready!", onboardingDoneSub:"You can now share your link and receive bookings.",
    onboardingNext:"Next step →", onboardingSkip:"Set up later", onboardingFinish:"Go to dashboard →",
    onboardingServiceName:"Treatment name", onboardingServicePrice:"Price (€)", onboardingServiceDuration:"Duration (min)",
    // Google Calendar
    googleCalendarDesc:"Automatically sync appointments to your Google Calendar",
    googleCalendarConnect:"Connect Google Calendar", googleCalendarConnected:"Google Calendar connected",
    googleCalendarDisconnect:"Disconnect", googleCalendarConnecting:"Connecting...",
    addToGoogleCal:"Google Calendar", exportDayToCal:"Export day to Google Calendar",
    // WhatsApp
    whatsappNumber:"Salon WhatsApp number", whatsappEnabled:"WhatsApp notifications",
    whatsappEnabledDesc:"Show WhatsApp buttons for clients and in the dashboard",
    sendWhatsApp:"Send WhatsApp", whatsappBookingConfirm:"Confirm via WhatsApp",
    whatsappReminder:"Send reminder via WhatsApp",
    // Auto-translate
    autoTranslateBtn:"Translate", translating:"Translating...", translateFailed:"Translation failed",
    // Locations
    locations:"Locations", addLocation:"+ Add location", locationName:"Location name",
    locationAddress:"Address", locationCity:"City", locationPhone:"Phone",
    selectLocation:"Choose a location", selectLocationSub:"Which location would you like to visit?",
    mainLocation:"Main location", noLocations:"No locations yet",
    allLocations:"All locations", filterByLocation:"Filter by location",
    // Edit & manual appointments
    edit:"Edit", editService:"Edit service", editStaff:"Edit staff member", editLocation:"Edit location",
    saveChanges:"Save changes", cancelEdit:"Cancel",
    addAppointment:"+ Add appointment", addAppointmentDesc:"Manually add an appointment",
    selectServiceFor:"Choose a service", selectDateFor:"Choose date and time", clientDetails:"Client details",
    appointmentAdded:"Appointment added! Confirmation sent.",
    // Exception days & vacation
    exceptionDays:"Exception days", addException:"+ Exception day",
    exceptionDesc:"One-time open on a day that is normally closed",
    blockedDays:"Block days or times", addBlocked:"+ Block",
    blockedDesc:"Block a whole day (e.g. vacation) or just a time window (e.g. lunch or private appointment 15:00–16:00) without changing your regular hours.",
    blockedReason:"Reason (optional)", vacation:"Vacation", blocked:"Blocked",
    dateFrom:"From", dateTo:"To",
    // Staff availability
    staffAvailability:"Availability", staffDays:"Working days",
    staffAvailabilityDesc:"Set working days per staff member",
    // Team accounts
    accountType:"Account type", jointAccount:"Joint account", teamAccount:"Team account",
    jointDesc:"One login for the entire salon", teamDesc:"Each staff member has their own login",
    jointInfo:"Pick this if you (or you together) run everything from a single account. Everyone sees the same schedule and shares one login. Ideal for a solo business or a small team working side by side.",
    teamInfo:"Pick this if every staff member should have their own login. They see their own schedule, clients and earnings. Great for larger teams where each person manages their own bookings. Professional plan only.",
    inviteStaff:"Invite", inviteStaffDesc:"Create a login for this staff member",
    staffEmail:"Staff email", staffPassword:"Password", inviteSent:"Login created!",
    emailTaken:"This email is already in use", staffLoginInfo:"Logs in at vellu.cc/owner",
    myAgenda:"My agenda", mySettings:"My settings", myWorkingHours:"My working hours",
    myServices:"My services", staffWelcome:"Welcome", noAccessPage:"You don't have access to this page",
    bookingWindow:"Booking Window", bookingWindowDesc:"How far in advance clients can book",
    minAdvance:"Minimum in advance", maxAdvance:"Maximum in advance",
    hours:"hours", days:"days",
    // Profile page
    profileServices:"Services", profileTeam:"Team", profileGallery:"Gallery",
    profileReviews:"Reviews", profileContact:"Contact",
    bookAppointment:"Book an appointment", bookNow:"Book now",
    openNow:"Open", closedNow:"Closed", closedToday:"Closed today",
    closesAt:"Closes at", opensAt:"Opens at",
    viewOnMap:"View on map", contactUs:"Contact us",
    poweredBy:"Powered by", noCommission:"0% commission booking platform",
    writeAReview:"Write a review", sortBy:"Sort by", highestRated:"Highest rated",
    mostRecent:"Most recent", openingHours:"Opening hours",
    backToProfile:"← Back to profile",
    nDaysAgo:"days ago", nWeeksAgo:"weeks ago", nMonthsAgo:"months ago",
    gallery:"Gallery", noGallery:"No photos in gallery yet",
    // Landing page
    heroTag:"For nail techs, lash artists, hairdressers & more",
    heroTitle:"Your salon.", heroTitle2:"Your rules.", heroBrand:"Your revenue.",
    heroSub:"Your own booking page with your name, your colors and your services. Fixed price, 0% commission. Ready in 2 minutes.",
    startFree:"Start 14-day free trial →", howItWork:"How does it work?",
    findSalonNav:"Customer? Find a salon →",
    findSalonTitle:"Find a salon or studio",
    findSalonSub:"From nail studio to hairdresser — search by name, city or treatment and book online.",
    findSalonPh:"Search by name, city or treatment…",
    findSalonNoRes:"Nothing found.",
    findSalonNoResHint:"Got a vellu.cc link? Enter the name:",
    findSalonCta:"Your business here?",
    findSalonCtaSub:"Your own booking page, live within 10 minutes.",
    findSalonBook:"View & book",
    searchLabel:"Have an appointment? Go to your salon",
    calcTitle:"Calculate your savings",
    calcSub:"Vellu is a flat fee. Most booking platforms take commission per booking. Slide below to match your volume.",
    calcBookings:"Bookings per month",
    calcAvgPrice:"Average treatment price",
    calcRevenue:"Monthly revenue",
    calcTreatwellCost:"Other platforms (~8% commission)",
    calcVelluCost:"Vellu (flat fee)",
    calcSavingsYear:"You keep extra per year",
    calcFootnote:"Commission rate is a market indication (5–10%) of comparable booking platforms. Vellu = €19/month or €15.80/month billed yearly. No hidden fees.",
    yearlyEquivalent:"= €{m}/month",
    trustOrigin:"Made in The Hague",
    backToTop:"Back to top",
    liveIn3:"Live in 3 steps",
    step1:"Create your page", step1d:"Add your treatments, set up your team, choose your colors. Your own link: vellu.cc/your-name.",
    step2:"Share your link", step2d:"Put your link in your Instagram bio, WhatsApp status or business card. Clients book directly, no middleman.",
    step3:"Receive bookings", step3d:"Automatic confirmations, 24h reminders and follow-up emails. You focus on your craft, Vellu handles the rest.",
    everythingNeeded:"Everything your salon needs",
    whatUsersSay:"What our users say",
    simplePricing:"Simple, honest pricing", perMonth:"/month", perYear:"/year", getStarted:"Get started",
    billingMonthly:"Monthly", billingYearly:"Yearly", twoMonthsFree:"2 months free", billedYearly:"billed yearly",
    popular:"Popular", faqTitle:"FAQ",
    ctaTitle:"Start your own booking page today",
    ctaSub:"Ready in 2 minutes. No commission. No hassle.",
    closed:"closed",
    back:"Back", close:"Close", cancel:"Cancel", delete:"Delete",
    terms:"Terms & Conditions", dpa:"Data Processing Agreement", privacy:"Privacy",
    noTreatments:"No treatments available", noTreatmentsCat:"No treatments in this category",
    noTimesAvailable:"No available times on this day",
    forgotPassword:"Forgot password?", resetSent:"Reset link sent! Check your inbox.",
    fillAllFields:"Fill in all fields", fillEmail:"Enter your email", fillBusinessName:"Enter your business name",
    wrongCredentials:"Incorrect email or password",
    bookingError:"Something went wrong while booking. Please try again.",
    galleryPhoto:"Gallery photo", goodToKnow:"Good to know",
    yourBooking:"Your booking", chooseVariant:"Choose a variant for: ",
    howWasAppt:"How was your appointment?", today:"today",
    welcomeVellu:"Welcome to Vellu", followSteps:"Follow these steps to get your first booking:",
    addServices:"Add your services", setHours:"Set your business hours",
    uploadLogo:"Upload your logo", shareLink:"Share your link: ",
    contactOwnerServices:"Contact the salon owner to add or remove services.",
    add:"Add", preview:"Preview", owner:"owner", ownerDashboard:"OWNER DASHBOARD",
    salonInsight:"Insight into your salon", vsLastWeek:"vs last week", previewPage:"Preview page",
    exportCalendar:"Export calendar", viewMore:"View more →", everyone:"Everyone",
    confirmed:"Confirmed", cancelled:"Cancelled", completed:"Completed",
    apptCompleted:"Appointment completed", errorCompleting:"Error completing",
    client:"Client",
    searchPlaceholder:"Search by name or service...",
    reviewSaveFailed:"Could not save review. Please try again.",
    somethingWrong:"Something went wrong.", confirmation:"Confirmation",
    allergyDisclaimer:"By entering allergy information you consent to processing this health data solely to ensure a safe treatment (GDPR Art. 9). You may leave this field blank.",
    bookingLegalNotice:"By confirming you confirm you are 16 or older (or have parental consent), and you agree to our",
    bookingLegalNoticeAnd:"and",
    bookingLegalNoticeRefund:"Completed treatments are non-refundable; you may cancel up until your appointment via the link in your confirmation email.",
    noTreatmentsCatYet:"No treatments available yet",
  },
  es: {
    book:"Reservar", myAppts:"Citas", dashboard:"Panel", agenda:"Calendario", from:"Desde",
    invoices:"Facturas", settings:"Ajustes", selectService:"Elige un servicio",
    selectServiceSub:"Elige el tratamiento que deseas", selectDate:"Elige una fecha",
    selectDateSub:"Elige fecha y hora", selectTime:"Elige una hora",
    yourDetails:"Tus datos", yourDetailsSub:"Completa tu información",
    confirmBooking:"Confirmar reserva", confirmSub:"Revisa tus datos",
    firstName:"Nombre", lastName:"Apellido", email:"Correo electrónico",
    phone:"Número de teléfono", optional:"opcional",
    payMethod:"Método de pago", payOnline:"Solicitud de pago después", payArrival:"Pagar en la cita",
    next:"Siguiente →", confirm:"Confirmar", newBooking:"Nueva reserva",
    treatment:"Tratamiento", date:"Fecha", time:"Hora", name:"Nombre", payment:"Pago",
    total:"Total", confirmedSub:"Te esperamos el", at:"a las",
    confirmationSent:"Confirmación enviada a", noAppts:"Aún no hay citas",
    welcomeBack:"Bienvenida de nuevo", todayAppts:"Citas de hoy",
    noTodayAppts:"No hay citas hoy", markComplete:"Marcar como completada",
    sendInvoice:"Enviar factura", invoiceSent:"Factura enviada",
    completedTreatments:"Tratamientos completados", totalEarnings:"Ingresos totales",
    noCompleted:"Aún no hay citas completadas", manageSalon:"Gestiona tu negocio",
    profile:"Perfil", brandColor:"Color de marca", services:"Servicios", save:"Guardar",
    saved:"Guardado", logout:"Cerrar sesión", businessName:"Nombre del negocio", city:"Ciudad",
    deleteService:"Eliminar",
    ownerLogin:"Acceso para dueños", ownerSub:"Inicia sesión como dueño del negocio",
    emailField:"Correo electrónico", passwordField:"Contraseña", login:"Iniciar sesión",
    signUp:"Registrarse", signUpTitle:"Crear cuenta",
    businessNameField:"Nombre del negocio (p. ej. Studio Rosa)",
    slugField:"Tu enlace (p. ej. studio-rosa)",
    createAccount:"Crear cuenta", signIn:"Iniciar sesión",
    manageAppts:"Gestiona tus citas", earnings:"Ingresos",
    appts:"citas", treatments:"tratamientos", sent:"Enviado", send:"Enviar",
    min:"min", photos:"Fotos", addPhoto:"Agregar foto", noPhotos:"Aún no hay fotos",
    deletePhoto:"Eliminar", salonLink:"Tu enlace", copyLink:"Copiar",
    copied:"¡Copiado!", serviceName:"Nombre del servicio (NL)", serviceNameEn:"Nombre del servicio (EN)",
    price:"Precio (€)", duration:"Duración (min)", fillRequired:"Completa el nombre y el precio",
    bookAt:"Reserva en", enterSalon:"Ingresa el enlace", goToSalon:"Ir a la página",
    salonNotFound:"No encontrado. Prueba con otro nombre.",
    orEnterSlug:"O ingresa un enlace:",
    availableSalons:"Estudios disponibles (demo)",
    variants:"Variantes", extras:"Extras", addVariant:"+ Agregar variante", addExtra:"+ Agregar extra",
    variantName:"Nombre de la variante (NL)", variantNameEn:"Nombre de la variante (EN)", variantDesc:"Descripción (NL)", variantDescEn:"Descripción (EN)",
    extraName:"Nombre del extra (NL)", extraNameEn:"Nombre del extra (EN)",
    selectVariant:"Elige una variante", selectExtras:"Agregar extras",
    noVariants:"Sin variantes", noExtras:"Sin extras",
    addToCalendar:"Agregar al calendario", googleCalendar:"Google Calendar", appleCalendar:"Apple / Outlook",
    invoiceDetails:"Datos de facturación", address:"Dirección", kvkNumber:"Cámara de Comercio", btwId:"Núm. de IVA", ibanNumber:"IBAN",
    invoicePrefix:"Prefijo de factura", invoiceSettings:"Completa tus datos de facturación para enviar facturas legalmente válidas",
    reviews:"Reseñas", writeReview:"Escribir una reseña", rating:"Calificación", reviewComment:"¿Cómo fue tu experiencia?",
    submitReview:"Enviar reseña", reviewSubmitted:"¡Gracias por tu reseña!", noReviews:"Aún no hay reseñas",
    analytics:"Estadísticas", weeklyRevenue:"Ingresos de esta semana", monthlyRevenue:"Ingresos de este mes",
    totalRevenue:"Ingresos (90 días)", totalAppts:"Citas (90 días)", avgRating:"Calificación media",
    popularServices:"Servicios más populares", busiestDays:"Días de más movimiento",
    revenueOverTime:"Ingresos en el tiempo", bookings:"reservas",
    staff:"Equipo", addStaff:"+ Agregar miembro del equipo", staffName:"Nombre del miembro", staffBio:"Biografía breve (visible para clientes)",
    staffRole:"Puesto (p. ej. Manicurista)", selectStaff:"Elige un miembro del equipo",
    anyStaff:"Sin preferencia", noStaff:"Aún no hay miembros del equipo",
    businessHours:"Horario de atención", openTime:"Apertura", closeTime:"Cierre",
    businessHoursDesc:"Define tus días y horas de trabajo", closedOnDay:"Cerrado este día",
    // New customization translations
    bookingPolicy:"Política de reservas", bookingPolicyDesc:"Condiciones que los clientes deben aceptar antes de reservar",
    salonContact:"Datos de contacto del salón", salonContactDesc:"Visibles en tu página para los clientes",
    salonPhone:"Teléfono del salón", salonInstagram:"Instagram (p. ej. @tunombre)", salonEmail:"Correo del salón (visible para clientes)",
    bookingPolicyPlaceholder:"P. ej. Las cancelaciones deben hacerse con 24 horas de anticipación...",
    agreeToPolicy:"Acepto la política de reservas",
    phoneRequired:"Teléfono obligatorio", phoneRequiredDesc:"Hacer el teléfono obligatorio para los clientes",
    appearance:"Apariencia", logo:"Logo", coverImage:"Imagen de portada",
    uploadCover:"Subir portada", removeLogo:"Quitar logo", removeCover:"Quitar portada",
    logoDesc:"Se muestra en el encabezado (recomendado: cuadrado, máx. 500x500px)",
    coverDesc:"Se muestra en la parte superior de tu página (recomendado: 1200x400px)",
    discountCodes:"Códigos de descuento", addDiscountCode:"+ Agregar código de descuento",
    discountCode:"Código", discountAmount:"Descuento", discountType:"Tipo",
    discountPercent:"Porcentaje (%)", discountFixed:"Monto fijo (€)",
    discountActive:"Activo", deleteCode:"Eliminar", applyCode:"Aplicar",
    invalidCode:"Código de descuento no válido", codeApplied:"¡Código de descuento aplicado!",
    discount:"Descuento", enterDiscountCode:"Ingresa el código de descuento",
    required:"obligatorio",
    // Categories
    categories:"Categorías", addCategory:"+ Agregar categoría", categoryName:"Nombre de la categoría (NL)",
    categoryNameEn:"Nombre de la categoría (EN)", noCategory:"Sin categoría", allCategories:"Todos los tratamientos",
    manageCategories:"Gestionar categorías",
    // Client accounts
    welcomeBackClient:"Bienvenida de nuevo", foundYourDetails:"¡Encontramos tus datos!",
    // Waitlist
    joinWaitlist:"Agregarme a la lista de espera", waitlistTitle:"Únete a la lista de espera",
    waitlistSub:"Déjanos tus datos. Te avisaremos en cuanto se libere un lugar.",
    waitlistNotes:"Preferencia / nota", waitlistNotesPh:"p. ej. preferible por las mañanas",
    waitlistJoined:"¡Estás en la lista de espera!",
    waitlistJoinedSub:"Te avisaremos en cuanto se libere un lugar.",
    waitlistNoDate:"Primero elige una fecha", waitlistSubmitError:"Algo salió mal, inténtalo de nuevo",
    // Cancellation
    cancelBooking:"Cancelar reserva", cancelBookingDesc:"¿Seguro que quieres cancelar?",
    cancellationReason:"Motivo de la cancelación (opcional)", confirmCancel:"Sí, cancelar",
    bookingCancelled:"Tu reserva ha sido cancelada", cannotCancel:"Ya no es posible cancelar",
    cancelBeforeTime:"Las cancelaciones deben hacerse con 24 horas de anticipación",
    // Pagination & Timeline
    showMore:"Cargar más", showLess:"Mostrar menos", showing:"Mostrando", of:"de",
    todaySchedule:"Agenda de hoy", nextUp:"A continuación", inProgress:"En curso", upcoming:"Próximas",
    noMoreToday:"No hay más citas hoy", freeDay:"¡Día libre!",
    startsIn:"Empieza en", minutesShort:"min", hoursShort:"h",
    // Subscriptions
    choosePlan:"Elige un plan", choosePlanSub:"Selecciona el plan que mejor te queda",
    planStarter:"Starter", planProfessional:"Professional",
    planStarterPrice:"19", planProfessionalPrice:"35",
    planStarterDesc:"Perfecto para empezar", planProfessionalDesc:"Para el salón en crecimiento",
    planFeatureBookings:"Reservas en línea", planFeatureStaff:"Gestión del equipo", planFeatureAnalytics:"Panel de estadísticas",
    planFeatureReviews:"Sistema de reseñas", planFeatureEmail:"Confirmaciones por correo", planFeatureReminders:"Recordatorios 24h",
    planFeatureCustomBranding:"Marca personalizada", planFeatureDiscounts:"Códigos de descuento", planFeaturePriority:"Soporte prioritario",
    planFeatureUnlimited:"Personal ilimitado", planFeatureCategories:"Categorías",
    planFeatureAllStarter:"Todo lo de Starter +", planFeatureTeamLogins:"Cuentas de equipo (acceso propio)",
    planFeatureNewsletter:"Boletín y exportación de clientes", planFeatureLocations:"Varias ubicaciones",
    selectPlan:"Elegir plan", currentPlan:"Plan actual", activePlan:"Activo", planExpires:"Vence el",
    billing:"Suscripción", billingDesc:"Gestiona tu suscripción", noPlan:"Sin suscripción activa",
    contactSupport:"Contáctanos para cambiar tu plan", paymentComingSoon:"Pago con iDEAL próximamente",
    planActive:"Tu suscripción está activa", upgradePlan:"Mejorar plan",
    // Break times & no-show & allergies
    breakMinutes:"Descanso entre citas", breakMinutesDesc:"Tiempo de margen después de cada cita",
    breakNone:"Sin descanso", breakMin:"min de descanso",
    noShow:"Ausencia", markNoShow:"Ausencia", noShowWarning:"Nota: este cliente ha faltado a citas anteriormente",
    noShowCount:"veces sin presentarse",
    slotInterval:"Intervalo entre horarios", slotIntervalDesc:"¿Cada cuántos minutos pueden los clientes (y tú) elegir una hora de inicio?", slotIntervalMin:"min",
    allergies:"Alergias / notas", allergiesPlaceholder:"P. ej. alergia al látex, piel sensible...",
    allergiesOptional:"opcional", clientAllergies:"Información de alergias",
    // Multi-service booking
    addService:"+ Agregar tratamiento", removeService:"Quitar", selectedServices:"Tratamientos seleccionados",
    servicesSelected:"tratamientos seleccionados", serviceSelected:"tratamiento seleccionado",
    yourServices:"Tus tratamientos", noServicesSelected:"Selecciona al menos 1 tratamiento",
    totalDuration:"Duración total",
    // Theme
    darkMode:"Oscuro", lightMode:"Claro",
    // Calendar month view
    monthView:"Mes", weekView:"Semana", prevWeek:"Anterior", nextWeek:"Siguiente", prevMonth:"Mes anterior", nextMonth:"Mes siguiente", backToToday:"Hoy", yearView:"Año",
    // Client selector
    selectClient:"Seleccionar cliente existente", searchClients:"Buscar cliente por nombre o correo...", newClient:"Cliente nuevo", orNewClient:"O ingresa nuevos datos:",
    // Time blocking
    blockTime:"Bloquear horario", blockWholeDay:"Día completo", blockTimeSlot:"Franja horaria", blockFrom:"Desde", blockTo:"Hasta",
    // Custom color
    customColor:"Color personalizado",
    // Follow-up
    followupRate:"Tasa de respuesta de seguimiento",
    // Reminder timing
    reminderTiming:"Momento del recordatorio", reminderTimingDesc:"¿Cuándo deben recibir los clientes un recordatorio de su cita?",
    rebookNudge:"Recordatorio para volver a reservar", rebookNudgeDesc:"¿Después de cuántas semanas deben recibir los clientes un correo de '¡te extrañamos!'?", rebookNudgeOff:"Desactivado", rebookNudgeWeeks:"semanas",
    reminderBefore:"antes de la cita", reminderNone:"Sin recordatorio",
    // Onboarding
    onboardingWelcome:"¡Bienvenida a Vellu!", onboardingWelcomeSub:"Configuremos tu salón. Solo toma 2 minutos.",
    onboardingStep1:"Datos del salón", onboardingStep1Sub:"¿Cómo se llama tu salón?",
    onboardingStep2:"Primer tratamiento", onboardingStep2Sub:"Agrega tu primer tratamiento",
    onboardingStep3:"Horario de apertura", onboardingStep3Sub:"¿Cuándo abres?",
    onboardingDone:"¡Tu salón está listo!", onboardingDoneSub:"Ya puedes compartir tu enlace y recibir reservas.",
    onboardingNext:"Siguiente paso →", onboardingSkip:"Configurar más tarde", onboardingFinish:"Ir al panel →",
    onboardingServiceName:"Nombre del tratamiento", onboardingServicePrice:"Precio (€)", onboardingServiceDuration:"Duración (min)",
    // Google Calendar
    googleCalendarDesc:"Sincroniza automáticamente las citas con tu Google Calendar",
    googleCalendarConnect:"Conectar Google Calendar", googleCalendarConnected:"Google Calendar conectado",
    googleCalendarDisconnect:"Desconectar", googleCalendarConnecting:"Conectando...",
    addToGoogleCal:"Google Calendar", exportDayToCal:"Exportar el día a Google Calendar",
    // WhatsApp
    whatsappNumber:"Número de WhatsApp del salón", whatsappEnabled:"Notificaciones por WhatsApp",
    whatsappEnabledDesc:"Mostrar botones de WhatsApp para clientes y en el panel",
    sendWhatsApp:"Enviar WhatsApp", whatsappBookingConfirm:"Confirmar por WhatsApp",
    whatsappReminder:"Enviar recordatorio por WhatsApp",
    // Auto-translate
    autoTranslateBtn:"Traducir", translating:"Traduciendo...", translateFailed:"Error de traducción",
    // Locations
    locations:"Ubicaciones", addLocation:"+ Agregar ubicación", locationName:"Nombre de la ubicación",
    locationAddress:"Dirección", locationCity:"Ciudad", locationPhone:"Teléfono",
    selectLocation:"Elige una ubicación", selectLocationSub:"¿Qué ubicación te gustaría visitar?",
    mainLocation:"Ubicación principal", noLocations:"Aún no hay ubicaciones",
    allLocations:"Todas las ubicaciones", filterByLocation:"Filtrar por ubicación",
    // Edit & manual appointments
    edit:"Editar", editService:"Editar servicio", editStaff:"Editar miembro del equipo", editLocation:"Editar ubicación",
    saveChanges:"Guardar cambios", cancelEdit:"Cancelar",
    addAppointment:"+ Agregar cita", addAppointmentDesc:"Agregar una cita manualmente",
    selectServiceFor:"Elige un servicio", selectDateFor:"Elige fecha y hora", clientDetails:"Datos del cliente",
    appointmentAdded:"¡Cita agregada! Confirmación enviada.",
    // Exception days & vacation
    exceptionDays:"Días de excepción", addException:"+ Día de excepción",
    exceptionDesc:"Abrir por única vez en un día que normalmente está cerrado",
    blockedDays:"Bloquear días u horarios", addBlocked:"+ Bloquear",
    blockedDesc:"Bloquea un día completo (p. ej. vacaciones) o solo una franja horaria (p. ej. almuerzo o cita privada 15:00–16:00) sin cambiar tu horario habitual.",
    blockedReason:"Motivo (opcional)", vacation:"Vacaciones", blocked:"Bloqueado",
    dateFrom:"Desde", dateTo:"Hasta",
    // Staff availability
    staffAvailability:"Disponibilidad", staffDays:"Días laborables",
    staffAvailabilityDesc:"Define los días laborables de cada miembro del equipo",
    // Team accounts
    accountType:"Tipo de cuenta", jointAccount:"Cuenta compartida", teamAccount:"Cuenta de equipo",
    jointDesc:"Un solo acceso para todo el salón", teamDesc:"Cada miembro del equipo tiene su propio acceso",
    jointInfo:"Elige esta opción si tú (o ustedes juntos) manejan todo desde una sola cuenta. Todos ven la misma agenda y comparten un acceso. Ideal para un negocio individual o un equipo pequeño que trabaja en conjunto.",
    teamInfo:"Elige esta opción si cada miembro del equipo debe tener su propio acceso. Cada quien ve su propia agenda, clientes e ingresos. Ideal para equipos grandes donde cada persona gestiona sus reservas. Solo en el plan Professional.",
    inviteStaff:"Invitar", inviteStaffDesc:"Crea un acceso para este miembro del equipo",
    staffEmail:"Correo del miembro", staffPassword:"Contraseña", inviteSent:"¡Acceso creado!",
    emailTaken:"Este correo ya está en uso", staffLoginInfo:"Inicia sesión en vellu.cc/owner",
    myAgenda:"Mi agenda", mySettings:"Mis ajustes", myWorkingHours:"Mi horario de trabajo",
    myServices:"Mis servicios", staffWelcome:"Bienvenido", noAccessPage:"No tienes acceso a esta página",
    bookingWindow:"Ventana de reservas", bookingWindowDesc:"Con cuánta anticipación pueden reservar los clientes",
    minAdvance:"Mínimo de anticipación", maxAdvance:"Máximo de anticipación",
    hours:"horas", days:"días",
    // Profile page
    profileServices:"Servicios", profileTeam:"Equipo", profileGallery:"Galería",
    profileReviews:"Reseñas", profileContact:"Contacto",
    bookAppointment:"Reservar una cita", bookNow:"Reservar ahora",
    openNow:"Abierto", closedNow:"Cerrado", closedToday:"Cerrado hoy",
    closesAt:"Cierra a las", opensAt:"Abre a las",
    viewOnMap:"Ver en el mapa", contactUs:"Contáctanos",
    poweredBy:"Con tecnología de", noCommission:"Plataforma de reservas con 0% de comisión",
    writeAReview:"Escribir una reseña", sortBy:"Ordenar por", highestRated:"Mejor calificadas",
    mostRecent:"Más recientes", openingHours:"Horario de apertura",
    backToProfile:"← Volver al perfil",
    nDaysAgo:"días atrás", nWeeksAgo:"semanas atrás", nMonthsAgo:"meses atrás",
    gallery:"Galería", noGallery:"Aún no hay fotos en la galería",
    // Landing page
    heroTag:"Para manicuristas, lashistas, peluqueros y más",
    heroTitle:"Tu salón.", heroTitle2:"Tus reglas.", heroBrand:"Tus ingresos.",
    heroSub:"Tu propia página de reservas con tu nombre, tus colores y tus servicios. Precio fijo, 0% de comisión. Lista en 2 minutos.",
    startFree:"Comienza tu prueba gratis de 14 días →", howItWork:"¿Cómo funciona?",
    findSalonNav:"¿Eres cliente? Encuentra un salón →",
    findSalonTitle:"Encuentra un salón o estudio",
    findSalonSub:"De estudio de uñas a peluquería — busca por nombre, ciudad o tratamiento y reserva online.",
    findSalonPh:"Busca por nombre, ciudad o tratamiento…",
    findSalonNoRes:"No se encontró nada.",
    findSalonNoResHint:"¿Tienes un enlace de vellu.cc? Escribe el nombre:",
    findSalonCta:"¿Tu negocio aquí?",
    findSalonCtaSub:"Tu propia página de reservas, en línea en 10 minutos.",
    findSalonBook:"Ver y reservar",
    searchLabel:"¿Tienes una cita? Ve a tu salón",
    calcTitle:"Calcula tu ahorro",
    calcSub:"Vellu es una tarifa fija. La mayoría de las plataformas de reservas cobran comisión por reserva. Desliza abajo para ajustar a tu volumen.",
    calcBookings:"Reservas por mes",
    calcAvgPrice:"Precio promedio del tratamiento",
    calcRevenue:"Ingresos mensuales",
    calcTreatwellCost:"Otras plataformas (~8% de comisión)",
    calcVelluCost:"Vellu (tarifa fija)",
    calcSavingsYear:"Ahorras de más al año",
    calcFootnote:"La tasa de comisión es una referencia de mercado (5–10%) de plataformas de reservas comparables. Vellu = €19/mes o €15.80/mes con facturación anual. Sin costos ocultos.",
    yearlyEquivalent:"= €{m}/mes",
    trustOrigin:"Hecho en La Haya",
    backToTop:"Volver arriba",
    liveIn3:"En línea en 3 pasos",
    step1:"Crea tu página", step1d:"Agrega tus tratamientos, configura tu equipo, elige tus colores. Tu propio enlace: vellu.cc/tu-nombre.",
    step2:"Comparte tu enlace", step2d:"Pon tu enlace en tu bio de Instagram, estado de WhatsApp o tarjeta de presentación. Los clientes reservan directamente, sin intermediarios.",
    step3:"Recibe reservas", step3d:"Confirmaciones automáticas, recordatorios 24h y correos de seguimiento. Tú te enfocas en tu arte, Vellu se encarga del resto.",
    everythingNeeded:"Todo lo que tu salón necesita",
    whatUsersSay:"Lo que dicen nuestros usuarios",
    simplePricing:"Precios simples y honestos", perMonth:"/mes", perYear:"/año", getStarted:"Comenzar",
    billingMonthly:"Mensual", billingYearly:"Anual", twoMonthsFree:"2 meses gratis", billedYearly:"facturado anualmente",
    popular:"Popular", faqTitle:"Preguntas frecuentes",
    ctaTitle:"Crea tu propia página de reservas hoy",
    ctaSub:"Lista en 2 minutos. Sin comisiones. Sin complicaciones.",
    closed:"cerrado",
    back:"Atrás", close:"Cerrar", cancel:"Cancelar", delete:"Eliminar",
    terms:"Términos y condiciones", dpa:"Acuerdo de tratamiento de datos", privacy:"Privacidad",
    noTreatments:"No hay tratamientos disponibles", noTreatmentsCat:"No hay tratamientos en esta categoría",
    noTimesAvailable:"No hay horarios disponibles este día",
    forgotPassword:"¿Olvidaste tu contraseña?", resetSent:"¡Enlace de restablecimiento enviado! Revisa tu bandeja de entrada.",
    fillAllFields:"Completa todos los campos", fillEmail:"Ingresa tu correo", fillBusinessName:"Ingresa el nombre de tu negocio",
    wrongCredentials:"Correo o contraseña incorrectos",
    bookingError:"Algo salió mal al reservar. Inténtalo de nuevo.",
    galleryPhoto:"Foto de la galería", goodToKnow:"Bueno saber",
    yourBooking:"Tu reserva", chooseVariant:"Elige una variante para: ",
    howWasAppt:"¿Cómo estuvo tu cita?", today:"hoy",
    welcomeVellu:"Bienvenida a Vellu", followSteps:"Sigue estos pasos para conseguir tu primera reserva:",
    addServices:"Agrega tus servicios", setHours:"Configura tu horario de atención",
    uploadLogo:"Sube tu logo", shareLink:"Comparte tu enlace: ",
    contactOwnerServices:"Contacta al dueño del salón para agregar o quitar servicios.",
    add:"Agregar", preview:"Vista previa", owner:"dueño", ownerDashboard:"PANEL DEL DUEÑO",
    salonInsight:"Información sobre tu salón", vsLastWeek:"vs semana pasada", previewPage:"Vista previa de la página",
    exportCalendar:"Exportar calendario", viewMore:"Ver más →", everyone:"Todos",
    confirmed:"Confirmada", cancelled:"Cancelada", completed:"Completada",
    apptCompleted:"Cita completada", errorCompleting:"Error al completar",
    client:"Cliente",
    searchPlaceholder:"Buscar por nombre o servicio...",
    reviewSaveFailed:"No se pudo guardar la reseña. Inténtalo de nuevo.",
    somethingWrong:"Algo salió mal.", confirmation:"Confirmación",
    allergyDisclaimer:"Al ingresar información sobre alergias, aceptas el tratamiento de estos datos de salud únicamente para garantizar un tratamiento seguro (RGPD Art. 9). Puedes dejar este campo en blanco.",
    bookingLegalNotice:"Al confirmar, declaras que tienes 16 años o más (o cuentas con consentimiento parental) y aceptas nuestros",
    bookingLegalNoticeAnd:"y",
    bookingLegalNoticeRefund:"Los tratamientos completados no son reembolsables; puedes cancelar hasta el momento de tu cita mediante el enlace en tu correo de confirmación.",
    noTreatmentsCatYet:"Aún no hay tratamientos disponibles",
  },
};

// Proxy wrapper: `T[lang]` returns the requested language if it exists, else
// falls back to English. This lets LangToggle list new languages before every
// key has been translated, and lets downstream code stay cheap (`T[lang].foo`)
// without defensive `?.` chains at every call site.
const T = new Proxy(_T_RAW, {
  get(target, prop) {
    return target[prop] || target.en;
  }
});


// ─── CSS ─────────────────────────────────────────────────────
// Security: accent is interpolated directly into a CSS template literal. A malicious
// value like `#fff;}body{display:none` would break out of declarations and inject
// arbitrary rules. Strictly validate as a hex color (3/4/6/8 digits) before use, and
// fall back to the default accent if anything else is passed.
const _sanitizeAccent = (a) => (typeof a === "string" && /^#[0-9a-fA-F]{3,8}$/.test(a.trim())) ? a.trim() : ACCENT;
const makeCSS = (rawAccent, c = THEMES.dark) => { const accent = _sanitizeAccent(rawAccent); return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; overflow-x: clip; }
  body { overscroll-behavior: none; overflow-x: clip; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  input, textarea, select { outline: none; font-family: var(--body-font, 'Jost', sans-serif); }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
  @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
  .fade-up { animation: fadeUp 0.38s cubic-bezier(0.16,1,0.3,1) both; }
  .scale-in { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both; }

  .btn-primary {
    background: ${accent}; color: ${c.btnOnDark}; border: none; border-radius: 100px;
    padding: 15px 28px; font-family: var(--body-font, 'Jost', sans-serif); font-size: 13px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; width: 100%;
    transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
  }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 32px ${accent}55; }
  .btn-primary:disabled { opacity: 0.28; cursor: not-allowed; transform: none; box-shadow: none; }
  .btn-primary:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }

  .btn-ghost {
    background: transparent; color: ${c.textSub};
    border: 1px solid ${c.borderHover}; border-radius: 100px;
    padding: 11px 20px; font-family: var(--body-font, 'Jost', sans-serif); font-size: 11px; font-weight: 500;
    letter-spacing: 0.07em; text-transform: uppercase; cursor: pointer; transition: all 0.2s;
  }
  .btn-ghost:hover { background: ${c.bgCardHover}; color: ${c.text}; border-color: ${c.borderHover}; }
  .btn-ghost:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }

  .input-field {
    background: ${c.inputBg}; border: 1px solid ${c.inputBorder};
    border-radius: 14px; padding: 14px 17px; color: ${c.text};
    font-family: var(--body-font, 'Jost', sans-serif); font-size: 13px; width: 100%; transition: all 0.2s;
  }
  .input-field:focus { border-color: ${accent}88; background: ${c.bgCardHover}; box-shadow: 0 0 0 3px ${accent}18; }
  .input-field::placeholder { color: ${c.textMuted}; }

  .service-card {
    background: ${c.bgCard}; border: 1px solid ${c.border};
    border-radius: 20px; padding: 17px 19px; cursor: pointer; margin-bottom: 10px;
    transition: all 0.22s cubic-bezier(0.16,1,0.3,1);
  }
  .service-card:hover { border-color: ${accent}44; background: ${accent}08; transform: translateY(-1px); }
  .service-card.sel { border-color: ${accent}99; background: ${accent}14; box-shadow: 0 0 0 1px ${accent}33, 0 4px 20px ${accent}12; }

  .time-chip {
    background: ${c.bgCard}; border: 1px solid ${c.inputBorder};
    border-radius: 11px; padding: 10px 4px; font-size: 11px; font-weight: 500;
    cursor: pointer; transition: all 0.18s; text-align: center; color: ${c.textSub};
  }
  .time-chip:hover { border-color: ${accent}55; color: ${accent}; background: ${accent}09; }
  .time-chip.sel { background: ${accent}; border-color: ${accent}; color: ${c.btnOnDark}; font-weight: 600; }

  .day-chip {
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 12px; border-radius: 15px; cursor: pointer; min-width: 44px;
    border: 1px solid transparent; flex-shrink: 0; transition: all 0.2s;
  }
  .day-scroll { -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); mask-image: linear-gradient(to right, black 85%, transparent 100%); }
  .day-scroll::-webkit-scrollbar { display: none; }
  .day-chip:hover { background: ${accent}18; border-color: ${accent}44; }
  .day-chip.sel { background: ${accent}; border-color: ${accent}; }
  .day-chip.sel span { color: ${c.btnOnDark} !important; }

  .appt-card {
    background: ${c.bgCard}; border: 1px solid ${c.border};
    border-radius: 20px; padding: 17px 19px; margin-bottom: 10px; transition: all 0.2s;
  }
  .appt-card:hover { border-color: ${c.borderHover}; }

  .nav-item {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    cursor: pointer; padding: 7px 8px; border-radius: 14px; flex: 1; transition: all 0.2s;
  }
  .nav-item:hover { background: ${c.inputBg}; }

  .pay-opt {
    border: 1px solid ${c.inputBorder}; border-radius: 15px; padding: 13px 16px;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 12px;
  }
  .pay-opt:hover { border-color: ${accent}44; background: ${accent}06; }
  .pay-opt.sel { border-color: ${accent}88; background: ${accent}12; }

  .radio { width: 17px; height: 17px; border-radius: 50%; border: 1.5px solid ${c.textMuted}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s; }
  .radio.on { border-color: ${accent}; box-shadow: 0 0 0 3px ${accent}22; }
  .radio.on::after { content:''; width:7px; height:7px; border-radius:50%; background:${accent}; display:block; }

  /* Focus-visible outlines for keyboard navigation */
  .time-chip:focus-visible, .day-chip:focus-visible, .pay-opt:focus-visible,
  .service-card:focus-visible, .nav-item:focus-visible, .salon-pill:focus-visible,
  .photo-thumb:focus-visible, .profile-tab:focus-visible {
    outline: 2px solid ${accent}; outline-offset: 2px;
  }

  .badge { font-size: 10px; font-weight: 600; padding: 3px 10px; border-radius: 100px; letter-spacing: 0.08em; text-transform: uppercase; }
  .badge-confirmed { background: rgba(59,130,246,${c === THEMES.dark ? "0.1" : "0.08"}); color: ${c === THEMES.dark ? "#93c5fd" : "#2563eb"}; border: 1px solid rgba(59,130,246,${c === THEMES.dark ? "0.2" : "0.15"}); }
  .badge-completed { background: rgba(34,197,94,${c === THEMES.dark ? "0.1" : "0.08"}); color: ${c === THEMES.dark ? "#86efac" : "#16a34a"}; border: 1px solid rgba(34,197,94,${c === THEMES.dark ? "0.2" : "0.15"}); }
  .badge-cancelled { background: rgba(239,68,68,${c === THEMES.dark ? "0.1" : "0.08"}); color: ${c === THEMES.dark ? "#f87171" : "#dc2626"}; border: 1px solid rgba(239,68,68,${c === THEMES.dark ? "0.2" : "0.15"}); }
  .badge-no_show { background: rgba(249,115,22,${c === THEMES.dark ? "0.1" : "0.08"}); color: ${c === THEMES.dark ? "#fb923c" : "#ea580c"}; border: 1px solid rgba(249,115,22,${c === THEMES.dark ? "0.2" : "0.15"}); }

  .confirm-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid ${c.bgCardHover}; }
  .confirm-row:last-child { border-bottom: none; }
  .stat-card { background: ${c.bgCard}; border: 1px solid ${c.border}; border-radius: 20px; padding: 18px 20px; flex: 1; }

  .lang-toggle { background: ${c.bgCardHover}; border: 1px solid ${c.inputBorder}; border-radius: 100px; padding: 4px; display: flex; gap: 2px; }
  .lang-btn { padding: 7px 12px; border-radius: 100px; font-family: var(--body-font, 'Jost', sans-serif); font-size: 11px; font-weight: 600; letter-spacing: 0.08em; cursor: pointer; border: none; transition: all 0.2s; text-transform: uppercase; }
  .lang-btn.active { background: ${accent}; color: ${c.btnOnDark}; }
  .lang-btn.inactive { background: transparent; color: ${c.textLabel}; }

  .photo-grid { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-top: 12px; }
  .photo-thumb { width: 68px; height: 68px; border-radius: 12px; object-fit: cover; cursor: pointer; border: 1px solid ${c.border}; flex-shrink: 0; transition: all 0.2s; position: relative; }
  .photo-thumb:hover { transform: scale(1.04); border-color: ${accent}55; }
  .photo-add { width: 68px; height: 68px; border-radius: 12px; border: 1.5px dashed ${accent}44; background: ${accent}06; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all 0.2s; gap: 4px; }
  .photo-add:hover { background: ${accent}12; border-color: ${accent}88; }

  .slug-box { background: ${c.inputBg}; border: 1px solid ${c.inputBorder}; border-radius: 14px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .salon-pill { background: ${accent}12; border: 1px solid ${accent}33; border-radius: 14px; padding: 14px 18px; cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .salon-pill:hover { background: ${accent}20; border-color: ${accent}66; transform: translateY(-1px); }

  .gallery-overlay { position: fixed; inset: 0; background: ${c.overlay}; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 200; padding: 24px; }

  @media (max-width: 520px) {
    .service-card { border-radius: 16px; padding: 15px 16px; }
    .appt-card { padding: 14px 14px; border-radius: 16px; }
    .btn-primary { padding: 14px 20px; font-size: 13px; }
    .btn-ghost { font-size: 11px; }
    /* !important here is intentional — numerous .input-field instances have
       inline fontSize (11/12) for tight dashboard layouts. On iOS Safari any
       input with font-size < 16px auto-zooms on focus, which is jarring and
       often leaves the page stuck zoomed-in. Force 16px on mobile regardless
       of inline overrides. */
    .input-field { padding: 14px 14px; font-size: 16px !important; }
    /* Safety net: catch any raw inputs / textareas / selects that aren't
       using the .input-field class (e.g. future code). Covers the input
       types where iOS actually auto-zooms. */
    input[type="text"],
    input[type="email"],
    input[type="tel"],
    input[type="number"],
    input[type="password"],
    input[type="search"],
    input[type="url"],
    input[type="date"],
    input[type="datetime-local"],
    input[type="time"],
    textarea,
    select { font-size: 16px !important; }
    .nav-item { padding: 8px 4px; }
  }

  /* ── SALON PROFILE PAGE ── */
  /* Override #root padding for full-bleed profile */
  .profile-root { margin: -32px -16px; width: calc(100% + 32px); }
  @media (max-width: 520px) { .profile-root { margin: 0; width: 100%; } }

  .profile-header {
    position: sticky; top: 0; z-index: 50; background: ${c.bg};
    border-bottom: 1px solid ${c.border};
    display: flex; align-items: center; padding: 0 28px; padding-top: env(safe-area-inset-top, 0px); height: calc(52px + env(safe-area-inset-top, 0px));
    gap: 24px;
  }
  .profile-header-logo {
    width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
    border: 1px solid ${c.border}; flex-shrink: 0;
  }
  .profile-header-logo-placeholder {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    background: ${c.bgCard}; border: 1px solid ${c.border};
    display: flex; align-items: center; justify-content: center;
    font-family: var(--display-font, 'Cormorant Garamond', serif); font-size: 16px; font-weight: 400; color: ${c.text};
  }
  .profile-tabs {
    display: flex; gap: 0; flex: 1; overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .profile-tabs::-webkit-scrollbar { display: none; }
  .profile-tab {
    position: relative; padding: 16px 14px; font-size: 13px; font-weight: 400;
    color: ${c.textLabel}; cursor: pointer; transition: color 0.2s;
    background: none; border: none; font-family: var(--body-font, 'Jost', sans-serif);
    white-space: nowrap;
  }
  .profile-tab:hover { color: ${c.text}; }
  .profile-tab.active { color: ${c.text}; font-weight: 500; }
  .profile-tab.active::after {
    content: ''; position: absolute; bottom: 0; left: 14px; right: 14px;
    height: 2px; background: ${c.text};
  }
  .profile-header-contact {
    margin-left: auto; display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: ${c.textSub}; white-space: nowrap; flex-shrink: 0;
  }

  .profile-hero {
    position: relative; overflow: hidden; width: 100%;
    background: ${c === THEMES.dark
      ? "linear-gradient(135deg, #1a1814 0%, " + c.bg + " 40%, #18161a 100%)"
      : "linear-gradient(135deg, #e8e4df 0%, " + c.bg + " 40%, #ddd8d2 100%)"};
  }
  .profile-hero-cover {
    width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0;
  }
  .profile-hero-gradient {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.7) 100%);
  }
  .profile-hero-content {
    position: relative; z-index: 2; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    height: 100%; padding: 40px 20px;
  }
  .profile-hero-name {
    font-family: var(--display-font, 'Cormorant Garamond', serif); font-weight: 300; color: #fff;
    letter-spacing: 0.03em; text-shadow: 0 2px 16px rgba(0,0,0,0.5);
  }
  .profile-hero-meta {
    display: flex; align-items: center; justify-content: center; gap: 14px;
    margin-top: 12px; font-size: 13px; color: rgba(255,255,255,0.88);
    text-shadow: 0 1px 8px rgba(0,0,0,0.5); flex-wrap: wrap;
  }
  .profile-hero-meta-item {
    display: inline-flex; align-items: center; gap: 6px;
  }
  .profile-hero-meta-sep {
    width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,0.5);
  }

  /* Category pill scroll container. Arrows now indicate scrollability,
     so the previous right-edge fade gradient is no longer needed —
     leaving it on caused the right arrow button to look faded. */
  .profile-cat-scroll {
    position: relative;
  }


  .profile-body {
    max-width: 1440px; margin: 0 auto; display: flex; gap: 0;
    padding: 0 24px;
  }
  .profile-main {
    flex: 1; min-width: 0;
    border-right: 1px solid ${c.border};
    padding: 0 40px 0 8px;
  }
  .profile-sidebar {
    width: 340px; flex-shrink: 0; padding: 0 28px;
    position: relative;
  }
  .profile-sidebar-inner {
    position: sticky; top: 72px; padding-top: 28px;
  }

  .profile-section {
    padding: 28px 0; border-bottom: 1px solid ${c.border};
    scroll-margin-top: 60px;
  }
  .profile-section:last-child { border-bottom: none; }
  .profile-section-title {
    font-size: 18px; font-weight: 600; color: ${c.text};
    margin-bottom: 18px; font-family: var(--body-font, 'Jost', sans-serif);
  }

  /* Service rows — Setmore style */
  .profile-services-grid {
    display: grid; grid-template-columns: 1fr; gap: 0;
  }
  /* Two-column card layout only kicks in when the viewport is wide enough
     that each card can still fit the row nicely. Below this threshold we
     stay single-column so the name never gets squeezed to zero and
     overlapped by the price/booking button. */
  @media (min-width: 1200px) {
    .profile-services-grid {
      grid-template-columns: 1fr 1fr; column-gap: 24px; row-gap: 8px;
    }
    .profile-services-grid .profile-service-row {
      border-bottom: none; background: ${c.bgCard}; border: 1px solid ${c.border};
      border-radius: 14px; padding: 16px;
    }
    .profile-services-grid .profile-service-row:hover {
      margin: 0; padding: 16px; border-color: ${accent}44;
      box-shadow: 0 4px 20px ${accent}12;
    }
  }
  .profile-service-row {
    display: grid;
    /* minmax(0, 1fr) instead of plain 1fr so the info column can actually
       shrink below its intrinsic content width; otherwise a long service
       name blows the layout up. */
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center; gap: 16px;
    padding: 18px 0; border-bottom: 1px solid ${c.border};
    cursor: pointer; transition: background 0.2s;
  }
  /* When the row itself is narrow (roughly tablet + 2-col-card mode)
     collapse to a 2-row layout: thumb + name on top, price + book below.
     This uses grid area assignments so the same JSX works everywhere. */
  @media (max-width: 640px), (min-width: 1200px) and (max-width: 1400px) {
    .profile-service-row {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas:
        "thumb info"
        "price price"
        "book book";
      row-gap: 10px;
    }
    .profile-service-row > .profile-service-thumb { grid-area: thumb; }
    .profile-service-row > .profile-service-info { grid-area: info; }
    .profile-service-row > .profile-service-price {
      grid-area: price; text-align: left;
      font-size: 20px;
    }
    .profile-service-row > .profile-service-book-btn {
      grid-area: book; justify-self: stretch; text-align: center;
    }
  }
  .profile-service-row:last-child { border-bottom: none; }
  @media (hover: hover) {
    .profile-service-row:hover { background: ${c.bgCard}; margin: 0 -12px; padding: 18px 12px; border-radius: 12px; }
  }
  .profile-service-thumb {
    width: 54px; height: 54px; border-radius: 10px; object-fit: cover;
    flex-shrink: 0; background: ${c.bgCard}; border: 1px solid ${c.border};
  }
  .profile-service-info { min-width: 0; overflow: hidden; }
  .profile-service-name {
    font-size: 15px; font-weight: 500; color: ${c.text}; margin-bottom: 6px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  }
  .profile-service-meta {
    font-size: 12px; color: ${c.textLabel};
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .profile-service-duration-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 9px; border-radius: 100px;
    background: ${c.inputBg}; border: 1px solid ${c.inputBorder};
    font-size: 11px; color: ${c.textSub}; white-space: nowrap;
  }
  .profile-service-details-link { color: ${accent}; cursor: pointer; font-size: 11px; }
  .profile-service-details-link:hover { text-decoration: underline; }
  .profile-service-price {
    font-family: var(--display-font, 'Cormorant Garamond', serif); font-size: 24px; font-weight: 400;
    color: ${c.text}; text-align: right; white-space: nowrap; line-height: 1;
  }
  .profile-service-book-btn {
    padding: 8px 18px; border-radius: 100px; font-size: 11px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
    background: ${accent}; color: ${c.btnOnDark}; border: none;
    transition: all 0.2s; flex-shrink: 0; white-space: nowrap;
    font-family: var(--body-font, 'Jost', sans-serif);
  }
  .profile-service-book-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px ${accent}44; }
  .profile-service-chevron { color: ${c.textMuted}; flex-shrink: 0; }
  @media (max-width: 420px) {
    .profile-service-row { gap: 12px; }
    .profile-service-price { font-size: 20px; }
    .profile-service-thumb { width: 48px; height: 48px; }
  }

  /* Team card — Setmore style */
  .profile-team-row {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 18px; border-radius: 12px;
    background: ${c.bgCard}; border: 1px solid ${c.border};
    cursor: pointer; transition: all 0.2s; margin-bottom: 8px;
  }
  .profile-team-row:hover { border-color: ${c.borderHover}; }
  .profile-team-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: ${c.inputBg}; border: 1px solid ${c.border};
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 500; color: ${c.text}; flex-shrink: 0;
    overflow: hidden;
  }
  .profile-team-avatar img { width: 100%; height: 100%; object-fit: cover; }

  /* Reviews — Setmore style */
  .profile-reviews-summary {
    display: flex; gap: 24px; align-items: flex-start;
    margin-bottom: 20px;
  }
  .profile-rating-bars { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .profile-rating-bar-row {
    display: flex; align-items: center; gap: 8px; font-size: 12px; color: ${c.textLabel};
  }
  .profile-rating-bar-track { flex: 1; height: 6px; background: ${c.inputBg}; border-radius: 3px; overflow: hidden; }
  .profile-rating-bar-fill { height: 100%; background: ${c.text}; border-radius: 3px; transition: width 0.8s ease; }
  .profile-rating-big {
    display: flex; flex-direction: column; align-items: center;
    padding: 20px 28px; border: 1px solid ${c.border}; border-radius: 14px;
    text-align: center; min-width: 180px;
  }
  .profile-rating-score { font-size: 36px; font-weight: 700; color: ${c.text}; }
  .profile-review-card {
    padding: 16px 0; border-bottom: 1px solid ${c.border};
  }
  .profile-review-card:last-child { border-bottom: none; }
  .profile-write-review-btn {
    display: inline-block; padding: 10px 24px; border: 1px solid ${c.border};
    border-radius: 100px; font-size: 13px; font-weight: 500; color: ${c.text};
    cursor: pointer; transition: all 0.2s; background: transparent;
    font-family: var(--body-font, 'Jost', sans-serif); margin-top: 8px;
  }
  .profile-write-review-btn:hover { background: ${c.bgCard}; border-color: ${c.borderHover}; }

  /* Gallery grid */
  .profile-gallery-item {
    aspect-ratio: 1; border-radius: 8px; overflow: hidden;
    border: 1px solid ${c.border}; cursor: pointer; transition: all 0.2s;
  }
  .profile-gallery-item:hover { opacity: 0.85; }
  .profile-gallery-item img { width: 100%; height: 100%; object-fit: cover; }

  /* Sidebar */
  .profile-sidebar-logo {
    width: 90px; height: 90px; border-radius: 50%; object-fit: cover;
    border: 1px solid ${c.border}; margin: 0 auto 14px; display: block;
  }
  .profile-sidebar-logo-placeholder {
    width: 90px; height: 90px; border-radius: 50%; margin: 0 auto 14px;
    background: ${c.bgCard}; border: 1px solid ${c.border};
    display: flex; align-items: center; justify-content: center;
    font-family: var(--display-font, 'Cormorant Garamond', serif); font-size: 32px; font-weight: 300; color: ${c.text};
  }
  .profile-sidebar-name {
    font-size: 18px; font-weight: 500; color: ${c.text}; text-align: center;
    font-family: var(--body-font, 'Jost', sans-serif);
  }
  .profile-sidebar-rating {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    margin-top: 6px; font-size: 13px; color: ${c.textSub};
  }
  .profile-book-btn {
    width: 100%; padding: 13px; border-radius: 100px; border: none;
    background: ${accent}; color: ${c.btnOnDark}; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; font-family: var(--body-font, 'Jost', sans-serif);
    margin-top: 16px;
  }
  .profile-book-btn:hover {
    opacity: 0.9; box-shadow: 0 4px 16px ${accent}44;
  }
  .profile-sidebar-status {
    display: flex; align-items: center; gap: 6px; justify-content: center;
    margin-top: 16px; font-size: 13px; color: ${c.textSub};
  }
  .profile-sidebar-address {
    text-align: center; margin-top: 14px; padding-top: 14px;
    border-top: 1px solid ${c.border}; font-size: 13px; color: ${c.textSub}; line-height: 1.5;
  }
  .profile-sidebar-contact-toggle {
    text-align: center; margin-top: 12px; padding-top: 12px;
    border-top: 1px solid ${c.border}; font-size: 13px; color: ${c.textSub};
    cursor: pointer;
  }

  .profile-hours-row {
    display: flex; justify-content: space-between; padding: 6px 0;
    font-size: 12px;
  }

  /* Contact section */
  .profile-contact-row {
    display: flex; align-items: center; gap: 10px; padding: 8px 0;
    font-size: 13px; color: ${c.textSub};
  }
  .profile-contact-row a { color: ${c.textSub}; text-decoration: underline; }

  /* Mobile floating Boeken pill — same pattern as settings save pill */
  .profile-mobile-pill-wrap {
    position: fixed; left: 0; right: 0;
    bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    display: none; justify-content: center; z-index: 100;
    pointer-events: none;
  }
  .profile-mobile-pill {
    background: ${accent}; color: ${c.btnOnDark}; border: none; border-radius: 100px;
    padding: 14px 40px; font-family: var(--body-font, 'Jost', sans-serif); font-size: 13px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 4px 20px ${accent}55, 0 10px 32px rgba(0,0,0,0.55);
  }
  .profile-mobile-pill:active { transform: scale(0.97); }

  /* Category pills */
  .profile-cat-pill {
    padding: 7px 16px; border-radius: 100px; font-size: 12px; font-weight: 500;
    border: 1px solid ${c.inputBorder}; background: transparent;
    color: ${c.textSub}; cursor: pointer; transition: all 0.2s;
    font-family: var(--body-font, 'Jost', sans-serif); white-space: nowrap; flex-shrink: 0;
  }
  .profile-cat-pill:hover { border-color: ${c.textLabel}; color: ${c.text}; }
  .profile-cat-pill.active {
    background: ${accent}; color: ${c.btnOnDark}; border-color: ${accent}; font-weight: 600;
  }

  /* Powered by footer */
  .profile-footer {
    text-align: center; padding: 28px 0; font-size: 12px; color: ${c.textMuted};
    border-top: 1px solid ${c.border}; margin-top: 12px;
  }

  @keyframes profileFadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }

  /* Mobile responsive */
  @media (max-width: 900px) {
    /* Keep the safe-area-inset-top padding/height from the desktop rule —
       without it the iOS notch + Android status bar overlap the logo/tabs. */
    .profile-header { padding: 0 16px; padding-top: env(safe-area-inset-top, 0px); height: calc(48px + env(safe-area-inset-top, 0px)); gap: 12px; }
    .profile-header-contact { display: none; }
    .profile-root { display: block; height: auto; overflow: visible; }
    .profile-scroll-area { padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .profile-main { border-right: none; padding: 0 18px; }
    .profile-sidebar { display: none; }
    .profile-body { flex-direction: column; }
    .profile-mobile-pill-wrap { display: flex; }
    .profile-section { scroll-margin-top: 52px; }
    .profile-reviews-summary { flex-direction: column-reverse; gap: 16px; }
    .profile-rating-big { min-width: 0; width: 100%; flex-direction: row; padding: 14px 18px; gap: 14px; justify-content: center; }
    .profile-rating-score { font-size: 28px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
`; };

// ─── SHARED ───────────────────────────────────────────────────
// Layout wrapper - full-screen responsive (replaces old Phone component)
function Layout({ children, accent = ACCENT, maxWidth = "100%" }) {
  const { colors: c } = useTheme();
  const css = useMemo(() => makeCSS(accent, c), [accent, c]);
  return (
    <div style={{ width: "100%", maxWidth, margin: "0 auto", background: c.bg, minHeight: "100dvh" }}>
      <style>{css}</style>
      {children}
    </div>
  );
}

// Kassa-verkoop of echte afspraak? Verkopen worden als 0-minuten "afspraak"
// opgeslagen zodat ze automatisch in omzet/facturen/analytics meetellen, maar
// ze horen NIET in de agenda. Naast de is_sale-vlag (nieuwe rijen) herkennen
// we oude rijen structureel: geen dienst + 0 minuten + productregels. Dat is
// robuuster dan het service_name-label, dat per taal verschilt.
export const isSaleRow = (a) => !!a && (
  a.is_sale === true ||
  (!a.service_id && (parseInt(a.service_duration) || 0) === 0 && Array.isArray(a.products) && a.products.length > 0)
);

function NavIcon({ name, size = 18, color = "currentColor" }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false" };
  const icons = {
    dashboard: <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
    agenda: <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    analytics: <svg {...props}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    facturen: <svg {...props}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>,
    instellingen: <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    plus: <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
    download: <svg {...props}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    upload: <svg {...props}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
    // Bonprinter aan de balie: papier erin boven, bonnetje eruit onder.
    printer: <svg {...props}><polyline points="6 9 6 2.5 18 2.5 18 9"/><path d="M6 17.5H4.5A2.5 2.5 0 012 15v-3.5A2.5 2.5 0 014.5 9h15A2.5 2.5 0 0122 11.5V15a2.5 2.5 0 01-2.5 2.5H18"/><rect x="6" y="14" width="12" height="7.5" rx="1"/></svg>,
    share: <svg {...props}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
    copy: <svg {...props}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
    eye: <svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    link: <svg {...props}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
    logout: <svg {...props}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    salon: <svg {...props}><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>,
    diensten: <svg {...props}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    team: <svg {...props}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    planning: <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>,
    overig: <svg {...props}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
    phone: <svg {...props}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
    mail: <svg {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    camera: <svg {...props}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
    mappin: <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    clipboard: <svg {...props}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
    scissors: <svg {...props}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
    tag: <svg {...props}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
    crown: <svg {...props}><path d="M2 20h20L19 8l-4 5-3-7-3 7-4-5z"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
    cookie: <svg {...props}><circle cx="12" cy="12" r="10"/><circle cx="8" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="8" r="1" fill="currentColor"/><circle cx="10" cy="14" r="1" fill="currentColor"/><circle cx="16" cy="13" r="1" fill="currentColor"/><circle cx="13" cy="18" r="1" fill="currentColor"/></svg>,
    key: <svg {...props}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
    image: <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    alerttri: <svg {...props}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    check: <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>,
    xmark: <svg {...props}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    edit: <svg {...props}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    user: <svg {...props}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    money: <svg {...props}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    creditcard: <svg {...props}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    sparkle: <svg {...props}><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 5.2L8 14 2 9.2h7.6z" fill="none"/></svg>,
    sun: <svg {...props}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon: <svg {...props}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
    wave: <svg {...props}><path d="M18 8c0-2.2-1.8-4-4-4-1.5 0-2.8.8-3.5 2"/><path d="M14 4c-1.5 0-2.8.8-3.5 2"/><path d="M4 12c0 4.4 3.6 8 8 8s8-3.6 8-8"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/></svg>,
    beauty: <svg {...props}><path d="M12 22c-4 0-8-2-8-8 0-3 1.5-5.5 4-7l1 2c-1.5 1-2.5 2.7-2.5 5 0 4 2.5 6 5.5 6s5.5-2 5.5-6c0-2.3-1-4-2.5-5l1-2c2.5 1.5 4 4 4 7 0 6-4 8-8 8z"/><circle cx="12" cy="7" r="3"/></svg>,
    send: <svg {...props}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    clock: <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    calendar: <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    home: <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    chat: <svg {...props}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    chart: <svg {...props}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    palette: <svg {...props}><circle cx="13.5" cy="6.5" r="2"/><circle cx="17.5" cy="10.5" r="2"/><circle cx="8.5" cy="7.5" r="2"/><circle cx="6.5" cy="12.5" r="2"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>,
    star2: <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    gift: <svg {...props}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>,
    diamond: <svg {...props}><path d="M12 2L2 12l10 10 10-10z" fill="none"/></svg>,
    target: <svg {...props}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    // Kassa: geldlade onder, toetsenblok + display erboven — herkenbaar als
    // kassa i.p.v. de factuur-icoon die de Facturen-tab al gebruikt.
    kassa: <svg {...props}><rect x="2.5" y="13" width="19" height="8" rx="1.8"/><rect x="6" y="5.5" width="12" height="7.5" rx="1.5"/><line x1="8.5" y1="8.5" x2="15.5" y2="8.5"/><line x1="9.5" y1="17" x2="14.5" y2="17"/></svg>,
    // Winkeltas — retailproducten in de kassa en op de boekingspagina.
    bag: <svg {...props}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
    // Streepjescode in een scan-kader — de scanknoppen.
    barcode: <svg {...props}><path d="M3 8V5.5A2.5 2.5 0 015.5 3H8"/><path d="M16 3h2.5A2.5 2.5 0 0121 5.5V8"/><path d="M21 16v2.5a2.5 2.5 0 01-2.5 2.5H16"/><path d="M8 21H5.5A2.5 2.5 0 013 18.5V16"/><line x1="7.5" y1="8" x2="7.5" y2="16"/><line x1="11" y1="8" x2="11" y2="16"/><line x1="14" y1="8" x2="14" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/></svg>,
    note: <svg {...props}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8.5" x2="16" y2="8.5"/><line x1="8" y1="12.5" x2="16" y2="12.5"/><line x1="8" y1="16.5" x2="13" y2="16.5"/></svg>,
    ban: <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>,
  };
  return icons[name] || null;
}

function PTitle({ children, sub }) {
  const { colors: c } = useTheme();
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: 26, color: c.text }}>{children}</div>
      {sub && <div style={{ fontSize: 11, color: c.textLabel, letterSpacing: "0.04em", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function SL({ children }) {
  const { colors: c } = useTheme();
  return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: c.textMuted, marginBottom: 12 }}>{children}</div>;
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <div className="lang-toggle">
      {[["light","sun"], ["dark","moon"]].map(([m, icon]) => (
        <button key={m} aria-label={m === "light" ? "Light mode" : "Dark mode"} aria-pressed={theme === m} className={`lang-btn ${theme === m ? "active" : "inactive"}`} onClick={toggle} style={{ padding: "7px 10px", display: "flex", alignItems: "center" }}><NavIcon name={icon} size={14} color="currentColor" /></button>
      ))}
    </div>
  );
}

// ─── PLAN COMPARISON TABLE ───────────────────────────────────
// Single source of truth for "what does each plan actually include".
// Rendered on the landing page (under pricing) and in the in-app plan
// picker. Keep in sync with the real gating in OwnerApp (isStarter).
// Cell values: true = included, false = not included, string = shown as-is.
const planMatrix = (lang) => {
  const nl = lang === "nl";
  return [
    { group: nl ? "Boekingen & agenda" : "Bookings & calendar", rows: [
      [nl ? "Eigen boekingspagina (vellu.cc/jouw-naam)" : "Your own booking page (vellu.cc/your-name)", true, true],
      [nl ? "Onbeperkte boekingen, 0% commissie" : "Unlimited bookings, 0% commission", true, true],
      [nl ? "Agenda (dag / week / maand)" : "Calendar (day / week / month)", true, true],
      [nl ? "Wachtlijst" : "Waitlist", true, true],
      [nl ? "Instelbaar tijdslot-interval" : "Custom time slot interval", true, true],
      [nl ? "Blokkeer- & uitzonderingsdagen" : "Blocked & exception days", true, true],
    ]},
    { group: nl ? "Communicatie" : "Communication", rows: [
      [nl ? "Bevestigings- & herinneringsmails" : "Confirmation & reminder emails", true, true],
      [nl ? "Review-verzoek na bezoek" : "Post-visit review request", true, true],
      [nl ? "Verjaardagsmail met kortingscode" : "Birthday email with discount code", true, true],
      [nl ? "Nieuwsbrief naar al je klanten" : "Newsletter to all your clients", false, true],
      [nl ? "Klantenlijst exporteren (CSV)" : "Client export (CSV)", false, true],
    ]},
    { group: "Team", rows: [
      [nl ? "Medewerkers" : "Staff members", nl ? "Max 3" : "Up to 3", nl ? "Onbeperkt" : "Unlimited"],
      [nl ? "Werktijden & diensten per medewerker" : "Per-staff schedules & services", true, true],
      [nl ? "Eigen login per medewerker" : "Own login per staff member", false, true],
    ]},
    { group: nl ? "Salon & branding" : "Salon & branding", rows: [
      [nl ? "Eigen logo & kleuren" : "Your logo & colors", true, true],
      [nl ? "Categorieën, varianten & extra's" : "Categories, variants & extras", true, true],
      [nl ? "Portfolio foto's per behandeling" : "Portfolio photos per treatment", true, true],
      [nl ? "Producten verkopen (online + afrekenen)" : "Sell products (online + checkout)", false, true],
      [nl ? "Meerdere locaties" : "Multiple locations", false, true],
    ]},
    { group: nl ? "Klanten & inzicht" : "Clients & insights", rows: [
      [nl ? "Klantenbeheer met historie" : "Client management with history", true, true],
      [nl ? "Facturen met BTW" : "VAT invoices", true, true],
      [nl ? "Kortingscodes" : "Discount codes", false, true],
      ["Analytics dashboard", false, true],
    ]},
    { group: "Support", rows: [
      [nl ? "Email support" : "Email support", true, true],
      [nl ? "Prioriteit support" : "Priority support", false, true],
    ]},
  ];
};

function PlanCompareTable({ lang, accent = ACCENT, defaultOpen = false }) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const nl = lang === "nl";
  const cell = (v) => {
    if (v === true) return <NavIcon name="check" size={14} color={accent} />;
    if (v === false) return <span style={{ color: c.textMuted, opacity: 0.6 }}>—</span>;
    return <span style={{ fontSize: 11, color: c.textSub, fontWeight: 500 }}>{v}</span>;
  };
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", width: "100%" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="btn-ghost"
        style={{ width: "100%", padding: "12px 18px", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        {nl ? "Vergelijk alle features" : "Compare all features"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div style={{ marginTop: 14, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 20, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 76px 96px", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${c.border}`, position: "sticky", top: 0, background: c.bgCard, zIndex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{nl ? "Feature" : "Feature"}</div>
            <div style={{ fontSize: 11, fontWeight: 600, textAlign: "center", color: c.text }}>Starter<div style={{ fontSize: 9, fontWeight: 400, color: c.textMuted }}>€19{nl ? "/mnd" : "/mo"}</div></div>
            <div style={{ fontSize: 11, fontWeight: 600, textAlign: "center", color: accent }}>Professional<div style={{ fontSize: 9, fontWeight: 400, color: c.textMuted }}>€35{nl ? "/mnd" : "/mo"}</div></div>
          </div>
          {planMatrix(lang).map((g, gi) => (
            <div key={gi}>
              <div style={{ padding: "12px 16px 6px", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: accent }}>{g.group}</div>
              {g.rows.map(([label, starter, pro], ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 76px 96px", alignItems: "center", padding: "8px 16px", borderBottom: (gi === planMatrix(lang).length - 1 && ri === g.rows.length - 1) ? "none" : `1px solid ${c.border}55` }}>
                  <div style={{ fontSize: 12, color: c.textSub, paddingRight: 8 }}>{label}</div>
                  <div style={{ textAlign: "center" }}>{cell(starter)}</div>
                  <div style={{ textAlign: "center" }}>{cell(pro)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LangToggle({ lang, setLang }) {
  // Reads from the LANGUAGES registry so adding a new UI language is just an
  // entry in that array + a matching T.xx object — no edits here needed.
  return (
    <div className="lang-toggle">
      {LANGUAGES.map(({ code, label }) => (
        <button key={code} className={`lang-btn ${lang === code ? "active" : "inactive"}`} onClick={() => setLang(code)}>{label}</button>
      ))}
    </div>
  );
}

function Header({ title, subtitle, right, onBack, accent }) {
  const { colors: c } = useTheme();
  return (
    <div style={{ padding: "20px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && <button className="btn-ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={onBack}>←</button>}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 400, letterSpacing: "0.06em" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 3, letterSpacing: "0.08em" }}>{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}


// ─── LINKIFY ─────────────────────────────────────────────────
// Omschrijvingen van diensten, varianten en producten zijn platte tekst die de
// salon zelf typt — en daar plakken ze regelmatig een URL in: een nazorgpagina,
// een prijslijst, hun voorwaarden. Zonder deze helper staat die URL er als dode
// tekst en moet de klant hem overtypen (gevonden bij My Whims and More, die een
// nazorg-link in haar dienstomschrijving wilde).
//
// Bewust GEEN dangerouslySetInnerHTML: we splitsen de tekst op de match en maken
// alleen dat stukje een <a>, de rest blijft gewone tekst. Salon-invoer kan dus
// nooit HTML injecteren.
const LINK_RE = new RegExp(
  // 1. expliciete links: https://… of www.…
  "(?:https?:\\/\\/|www\\.)[^\\s<>]+" +
  "|" +
  // 2. kale domeinen met bekende TLD: mijnsalon.com/nazorg
  "\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:com|net|org|info|biz|eu|nl|be|es|cc|app|io|co|shop|store|site|online|beauty|salon|de|fr|pt|us|ca|aw|cw|sr)(?:\\/[^\\s<>]*)?",
  "gi"
);

// Sluitpunt van een zin ("… lees hier: vellu.cc/nazorg.") hoort niet bij de URL.
// Een haakje sluiten we alleen af als het ook geopend werd binnen de match.
function trimUrlTail(raw) {
  while (raw.length > 0) {
    const last = raw[raw.length - 1];
    if (".,;:!?".includes(last)) { raw = raw.slice(0, -1); continue; }
    if (last === ")" && (raw.match(/\(/g) || []).length < (raw.match(/\)/g) || []).length) {
      raw = raw.slice(0, -1); continue;
    }
    break;
  }
  return raw;
}

function Linkify({ text, color }) {
  if (!text) return null;
  const str = String(text);
  const re = new RegExp(LINK_RE.source, "gi");
  const out = [];
  let cursor = 0, m, i = 0;
  while ((m = re.exec(str)) !== null) {
    const url = trimUrlTail(m[0]);
    if (!url) { re.lastIndex = m.index + m[0].length; continue; }
    if (m.index > cursor) out.push(str.slice(cursor, m.index));
    out.push(
      <a key={`l${i++}`} href={/^https?:\/\//i.test(url) ? url : `https://${url}`}
        target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: color || "inherit", textDecoration: "underline", textUnderlineOffset: 2, wordBreak: "break-word" }}>
        {url}
      </a>
    );
    cursor = m.index + url.length;
    re.lastIndex = cursor;
  }
  if (cursor < str.length) out.push(str.slice(cursor));
  return <>{out}</>;
}

// ─── EXPORTS ─────────────────────────────────────────────────
export {
  THEMES, ThemeContext, ThemeProvider, useTheme,
  Skeleton, DashboardSkeleton,
  useToast, ToastContainer,
  useConfirm, ConfirmModal,
  useFocusTrap, useSEO,
  compressImage, sendEmails, sendSMS, createCancellationToken,
  ACCENT,
  getGoogleCalUrl, getWhatsAppUrl, getWhatsAppBookingMsg, getWhatsAppReminderMsg, getWhatsAppPaymentMsg,
  getPaymentLinkWithAmount,
  getToday, fmt, parseDate, getDays,
  TIMES, genTimes, SLOT_INTERVALS, DAY_NL, DAY_EN, DAY_ES, DAY_FULL_NL, DAY_FULL_EN, DAY_FULL_ES, MON_NL, MON_EN, MON_ES,
  DEFAULT_HOURS,
  T,
  LANGUAGES, COUNTRIES,
  CURRENCIES, currencyForCountry, curSym, fmtMoney, taxForCountry, ownerLangFor,
  TAX_RULES, TAX_REGIONS_BY_COUNTRY, taxRuleFor, resolveTax,
  PAGE_FONTS, getPageFont, ensurePageFontLoaded,
  makeCSS,
  Layout, NavIcon, PTitle, SL, ThemeToggle, LangToggle, Header, PlanCompareTable,
  Linkify,
  supabase,
};
