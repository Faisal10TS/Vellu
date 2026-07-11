import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";
import InstallAppPrompt from "./InstallAppPrompt.jsx";
// Drag-and-drop for service reordering. dnd-kit is modular + keyboard-accessible;
// ~15KB gzipped for the three packages combined.
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useTheme, useSEO, useToast, ToastContainer, useConfirm, ConfirmModal, useFocusTrap,
  Skeleton, DashboardSkeleton,
  compressImage, sendEmails, sendSMS, ACCENT,
  getGoogleCalUrl, getWhatsAppUrl, getWhatsAppBookingMsg, getWhatsAppReminderMsg,
  getToday, fmt, parseDate, getDays,
  TIMES, DAY_NL, DAY_EN, DAY_FULL_NL, DAY_FULL_EN, MON_NL, MON_EN,
  DEFAULT_HOURS, T, Layout, NavIcon, PTitle, SL, ThemeToggle, LangToggle, Header
} from "./shared.jsx";

// PDF generator is lazy-loaded on first use — see RevenueReportBlock.download().
// This keeps jsPDF (~400KB) out of the initial owner dashboard bundle.
// Small helper for period presets lives in a separate file so it can be
// imported eagerly without pulling in the heavy deps:
import { periodPreset } from "./revenueReport.helpers.js";

// Sortable wrapper for a service card. Uses a render-prop so the caller can
// place the drag handle wherever it wants inside the existing complex card
// JSX without having to rewrite the whole thing.
function SortableService({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };
  return children({ setNodeRef, style, attributes, listeners, isDragging });
}

// Drag handle button — 6 dots icon. Must receive the sortable listeners to
// be the hot zone. tabIndex + aria-label for keyboard/screen-reader users.
function DragHandle({ listeners, attributes, color }) {
  return (
    <button
      type="button"
      aria-label="Reorder service"
      {...attributes}
      {...listeners}
      style={{
        background: "transparent", border: "none", padding: "6px 4px",
        cursor: "grab", color, display: "flex", alignItems: "center",
        touchAction: "none", // required by dnd-kit on touch devices
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <svg width="12" height="18" viewBox="0 0 12 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="3" cy="4" r="0.6" fill="currentColor" />
        <circle cx="9" cy="4" r="0.6" fill="currentColor" />
        <circle cx="3" cy="9" r="0.6" fill="currentColor" />
        <circle cx="9" cy="9" r="0.6" fill="currentColor" />
        <circle cx="3" cy="14" r="0.6" fill="currentColor" />
        <circle cx="9" cy="14" r="0.6" fill="currentColor" />
      </svg>
    </button>
  );
}

// QR code modal — owner opens this to show/print/download a QR pointing
// to their public booking page. qrcode library is lazy-imported on first
// open so the ~15KB of wasm/canvas code isn't in the main bundle.
function QRCodeModal({ url, salonName, lang, c, accent, onClose }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [svgMarkup, setSvgMarkup] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("./qrGenerator.js");
        const [png, svg] = await Promise.all([
          mod.renderQrDataUrl(url, 720),
          mod.renderQrSvg(url),
        ]);
        if (cancelled) return;
        setDataUrl(png);
        setSvgMarkup(svg);
      } catch (e) {
        console.error("QR render failed:", e);
        if (!cancelled) setErr(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  const downloadPng = async () => {
    if (!dataUrl) return;
    const mod = await import("./qrGenerator.js");
    const blob = mod.dataUrlToBlob(dataUrl);
    const fn = (salonName || "vellu").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 40) + "-qr.png";
    mod.triggerDownload(fn, blob);
  };
  const downloadSvg = async () => {
    if (!svgMarkup) return;
    const mod = await import("./qrGenerator.js");
    const fn = (salonName || "vellu").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 40) + "-qr.svg";
    mod.triggerDownload(fn, svgMarkup, "image/svg+xml");
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20,
          padding: 24, maxWidth: 420, width: "100%", maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 12 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300 }}>
            {lang === "nl" ? "QR-code" : "QR code"}
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ fontSize: 12, color: c.textSub, marginBottom: 18, lineHeight: 1.5 }}>
          {lang === "nl"
            ? "Klanten scannen deze code met hun telefoon om direct bij jouw boekingspagina te komen. Print op een flyer, raamsticker of visitekaartje."
            : "Customers scan this code with their phone to jump straight to your booking page. Print it on flyers, a window sticker, or business cards."}
        </div>

        {/* QR preview */}
        <div style={{
          background: "#fff", border: `1px solid ${c.border}`, borderRadius: 14,
          padding: 20, display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 280, marginBottom: 14,
        }}>
          {err ? (
            <div style={{ color: c.danger, fontSize: 12, textAlign: "center" }}>
              {lang === "nl" ? "Kon QR niet genereren" : "Could not render QR"}
            </div>
          ) : dataUrl ? (
            <img src={dataUrl} alt="QR code" style={{ width: 240, height: 240, display: "block" }} />
          ) : (
            <div style={{ color: c.textMuted, fontSize: 12 }}>{lang === "nl" ? "Genereren…" : "Generating…"}</div>
          )}
        </div>

        {/* URL display */}
        <div style={{
          background: c.bgCard, border: `1px solid ${c.inputBorder}`, borderRadius: 10,
          padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: c.textSub,
          marginBottom: 14, textAlign: "center", wordBreak: "break-all",
        }}>{url}</div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-primary"
            onClick={downloadPng}
            disabled={!dataUrl}
            style={{ flex: 1, fontSize: 12, padding: "11px 16px", opacity: dataUrl ? 1 : 0.5 }}
          >{lang === "nl" ? "Download PNG" : "Download PNG"}</button>
          <button
            className="btn-ghost"
            onClick={downloadSvg}
            disabled={!svgMarkup}
            style={{ flex: 1, fontSize: 12, padding: "11px 16px", opacity: svgMarkup ? 1 : 0.5 }}
            title={lang === "nl" ? "Vector (scherp op elk formaat)" : "Vector (sharp at any size)"}
          >{lang === "nl" ? "Download SVG" : "Download SVG"}</button>
        </div>

        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 14, textAlign: "center" }}>
          {lang === "nl"
            ? "Tip: gebruik SVG voor de drukker, PNG voor social media of Instagram stories."
            : "Tip: use SVG for print shops, PNG for social or Instagram stories."}
        </div>
      </div>
    </div>
  );
}

// Reschedule modal — owner picks new date/time (and optionally new staff)
// for an existing confirmed appointment. All server-side work (conflict
// check, business-hours validation, google-calendar update, client email)
// is done by the reschedule-appointment edge function.
function RescheduleModal({ appt, onClose, onSuccess, lang, c, accent, toast, staffList }) {
  const [newDate, setNewDate] = useState(appt.date);
  const [newTime, setNewTime] = useState(appt.time);
  const [newStaffId, setNewStaffId] = useState(appt.staff_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!newDate || !newTime) {
      setError(lang === "nl" ? "Vul datum en tijd in" : "Fill in date and time");
      return;
    }
    // Early exit if nothing changed
    const staffChanged = (newStaffId || null) !== (appt.staff_id || null);
    if (newDate === appt.date && newTime === appt.time && !staffChanged) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const tok = session?.access_token;
      if (!tok) {
        setError(lang === "nl" ? "Sessie verlopen — log opnieuw in" : "Session expired — please sign in again");
        return;
      }
      // Use supabase.functions.invoke rather than a hardcoded URL so we
      // inherit whatever project_ref the client is configured with. Errors
      // from non-2xx responses come back on fnErr.context — extract the
      // error code from there so the UI can show a specific message.
      const { data, error: fnErr } = await supabase.functions.invoke("reschedule-appointment", {
        body: {
          appointment_id: appt.id,
          new_date: newDate,
          new_time: newTime,
          ...(staffChanged ? { new_staff_id: newStaffId || null } : {}),
        },
      });
      let errorCode = null;
      let appointment = null;
      if (fnErr) {
        try { const parsed = await fnErr.context.json(); errorCode = parsed.error; }
        catch { errorCode = "unknown"; }
      } else {
        appointment = data?.appointment;
        if (data?.error) errorCode = data.error;
      }
      if (errorCode) {
        const msg = {
          slot_conflict: lang === "nl" ? "Dit tijdstip overlapt met een andere afspraak" : "This slot conflicts with another appointment",
          outside_hours: lang === "nl" ? "Buiten openingstijden" : "Outside business hours",
          closed: lang === "nl" ? "Op deze dag is de salon gesloten" : "Salon is closed on this day",
          day_blocked: lang === "nl" ? "Deze dag is geblokkeerd" : "This day is blocked",
          slot_blocked: lang === "nl" ? "Dit tijdstip is geblokkeerd" : "This slot is blocked",
          forbidden: lang === "nl" ? "Je hebt geen toegang tot deze afspraak" : "Not authorized for this appointment",
          unauthorized: lang === "nl" ? "Sessie verlopen — log opnieuw in" : "Session expired — please sign in again",
        }[errorCode] || (lang === "nl" ? "Verplaatsen mislukt" : "Reschedule failed");
        setError(msg);
        return;
      }
      onSuccess(appointment);
    } catch (e) {
      console.error("Reschedule error:", e);
      setError(lang === "nl" ? "Verplaatsen mislukt" : "Reschedule failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20,
          padding: 24, maxWidth: 420, width: "100%", maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 4 }}>
          {lang === "nl" ? "Afspraak verplaatsen" : "Reschedule appointment"}
        </div>
        <div style={{ fontSize: 12, color: c.textSub, marginBottom: 18 }}>
          {appt.client_name} · {appt.service_name}
        </div>
        <div style={{ fontSize: 10, color: c.textMuted, background: c.bgCard, padding: "8px 12px", borderRadius: 10, marginBottom: 16 }}>
          {lang === "nl" ? "Nu: " : "Currently: "}{appt.date} {lang === "nl" ? "om" : "at"} {appt.time}
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: c.textLabel, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {lang === "nl" ? "Nieuwe datum" : "New date"}
            </div>
            <input
              type="date"
              className="input-field"
              value={newDate}
              min={fmt(new Date())}
              onChange={e => setNewDate(e.target.value)}
              style={{ fontSize: 13, padding: "10px 12px", width: "100%" }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: c.textLabel, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {lang === "nl" ? "Nieuwe tijd" : "New time"}
            </div>
            <input
              type="time"
              className="input-field"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
              style={{ fontSize: 13, padding: "10px 12px", width: "100%" }}
            />
          </div>
          {staffList && staffList.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: c.textLabel, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {lang === "nl" ? "Medewerker" : "Staff"}
              </div>
              <select
                value={newStaffId || ""}
                onChange={e => setNewStaffId(e.target.value || null)}
                style={{
                  background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 14,
                  padding: "10px 12px", color: c.text, fontSize: 13,
                  fontFamily: "'Jost',sans-serif", width: "100%", cursor: "pointer",
                }}
              >
                <option value="">{lang === "nl" ? "Geen voorkeur" : "No preference"}</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: c.danger, background: `${c.danger}14`, border: `1px solid ${c.danger}33`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
          {lang === "nl"
            ? "De klant ontvangt automatisch een e-mail met de nieuwe datum. Als Google Agenda gekoppeld is, wordt het event ook verplaatst."
            : "The client will receive an automatic email with the new date. If Google Calendar is connected, the event will be moved too."}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={onClose} disabled={saving}>
            {lang === "nl" ? "Annuleren" : "Cancel"}
          </button>
          <button className="btn-primary" style={{ flex: 2, fontSize: 12, opacity: saving ? 0.6 : 1 }} onClick={submit} disabled={saving}>
            {saving ? (lang === "nl" ? "Verplaatsen..." : "Moving...") : (lang === "nl" ? "Verplaatsen" : "Reschedule")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Referral program block — displays the owner's unique invite code + shareable
// link, shows how many salons have signed up with it, and how many months of
// free credit they've earned. Billing credit is redeemed when iDEAL/Stripe
// integration reads profiles.referral_credit_months.
function ReferralBlock({ salonData, lang, c, accent, toast }) {
  const [copied, setCopied] = useState(false);
  const code = salonData.referral_code || "";
  const referralUrl = code ? `https://vellu.cc/owner?ref=${code}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show(lang === "nl" ? "Kopiëren mislukt" : "Copy failed", "error");
    }
  };

  const share = async () => {
    const text = lang === "nl"
      ? `Hey! Ik gebruik Vellu voor mijn online boekingen — geen commissie, alleen een vast maandbedrag. Meld je aan via mijn link en we krijgen allebei een maand gratis: ${referralUrl}`
      : `Hey! I'm using Vellu for my online bookings — no commission, just a flat monthly fee. Sign up via my link and we both get a free month: ${referralUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Vellu", text, url: referralUrl });
      } catch {}
    } else {
      await copy();
    }
  };

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>
        {lang === "nl" ? "Nodig een salon uit" : "Refer a salon"}
      </div>
      <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.55, marginBottom: 14 }}>
        {lang === "nl"
          ? "Deel je link met een andere salon. Als zij zich aanmelden krijgen jullie allebei 1 maand gratis."
          : "Share your link with another salon. If they sign up, you both get 1 free month."}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={{ padding: "12px 14px", background: `${accent}0a`, border: `1px solid ${accent}22`, borderRadius: 12 }}>
          <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            {lang === "nl" ? "Aanmeldingen" : "Sign-ups"}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 300, color: accent, lineHeight: 1 }}>
            {salonData.referral_count || 0}
          </div>
        </div>
        <div style={{ padding: "12px 14px", background: `${accent}0a`, border: `1px solid ${accent}22`, borderRadius: 12 }}>
          <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            {lang === "nl" ? "Maanden gratis" : "Free months"}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 300, color: accent, lineHeight: 1 }}>
            {salonData.referral_credit_months || 0}
          </div>
        </div>
      </div>

      {/* Code + link */}
      <div style={{ fontSize: 10, color: c.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
        {lang === "nl" ? "Jouw code" : "Your code"}
      </div>
      <div style={{ background: c.bg, border: `1px solid ${c.inputBorder}`, borderRadius: 10, padding: "10px 14px", fontFamily: "monospace", fontSize: 15, fontWeight: 600, letterSpacing: "0.08em", color: c.text, marginBottom: 10 }}>
        {code || "—"}
      </div>
      <div style={{ fontSize: 10, color: c.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
        {lang === "nl" ? "Jouw link" : "Your link"}
      </div>
      <div style={{ background: c.bg, border: `1px solid ${c.inputBorder}`, borderRadius: 10, padding: "10px 14px", fontSize: 11, color: c.textSub, marginBottom: 10, overflowX: "auto", whiteSpace: "nowrap" }}>
        {referralUrl || "—"}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={copy} disabled={!code}>
          {copied ? (lang === "nl" ? "✓ Gekopieerd" : "✓ Copied") : (lang === "nl" ? "Kopieer link" : "Copy link")}
        </button>
        <button className="btn-primary" style={{ flex: 1, fontSize: 11 }} onClick={share} disabled={!code}>
          {lang === "nl" ? "Delen" : "Share"}
        </button>
      </div>

      {salonData.referral_credit_months > 0 && (
        <div style={{ marginTop: 12, fontSize: 10, color: c.success, textAlign: "center" }}>
          {lang === "nl"
            ? `Je hebt ${salonData.referral_credit_months} maand${salonData.referral_credit_months === 1 ? "" : "en"} gratis verdiend. Deze worden verrekend bij de volgende facturatie.`
            : `You've earned ${salonData.referral_credit_months} free month${salonData.referral_credit_months === 1 ? "" : "s"}. These will be applied at your next billing cycle.`}
        </div>
      )}
    </div>
  );
}

// Newsletter block — sits in Instellingen → Overig. Lets the owner compose
// and send a one-off newsletter to every client who has booked at this salon.
// Recipients are derived server-side by the send-newsletter edge function;
// here we just show the count and collect subject + message. Sending is a
// real, irreversible side-effect (emails go out), so it requires an explicit
// in-component confirmation step before firing.
function NewsletterBlock({ ownerId, lang, c, accent, toast }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState("all"); // "all" | "loyal" | "new" | "dormant"
  const [count, setCount] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  // Segment definitions surfaced to the owner so they know exactly what
  // filter each option applies. Copy stays generic so it works across
  // salon types.
  const SEGMENTS = [
    { key: "all", nl: "Alle klanten", en: "All clients", desc_nl: "iedereen die ooit een afspraak had", desc_en: "everyone who ever booked" },
    { key: "loyal", nl: "Trouwe klanten", en: "Loyal clients", desc_nl: "5+ voltooide afspraken", desc_en: "5+ completed visits" },
    { key: "new", nl: "Nieuwe klanten", en: "New clients", desc_nl: "eerste bezoek in de laatste 30 dagen", desc_en: "first visit in the last 30 days" },
    { key: "dormant", nl: "Sluipende klanten", en: "Dormant clients", desc_nl: "meer dan 60 dagen niet meer geweest", desc_en: "haven't visited in 60+ days" },
  ];

  // Recipient count now depends on the selected segment, computed server-side
  // so the same filter logic is used for preview and actual send. Debounced
  // so rapid segment-flip clicks don't hammer the edge function.
  useEffect(() => {
    let cancelled = false;
    setCount(null);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("send-newsletter", {
          body: { segment, preview_only: true },
        });
        if (!cancelled) setCount(data?.total ?? 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ownerId, segment]);

  const canSend = subject.trim() && message.trim() && (count || 0) > 0 && !sending;

  const send = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-newsletter", {
        body: { subject: subject.trim(), message: message.trim(), segment },
      });
      if (error || !data) throw new Error(error?.message || "send_failed");
      toast.show(lang === "nl" ? `Nieuwsbrief verstuurd naar ${data.sent} klant${data.sent === 1 ? "" : "en"}` : `Newsletter sent to ${data.sent} client${data.sent === 1 ? "" : "s"}`);
      setSubject(""); setMessage(""); setConfirming(false);
    } catch (e) {
      console.error("Newsletter send failed:", e);
      toast.show(lang === "nl" ? "Versturen mislukt — probeer opnieuw" : "Send failed — try again", "error");
    } finally {
      setSending(false);
    }
  };

  const lbl = { fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4, display: "block" };

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>
        {lang === "nl" ? "Nieuwsbrief" : "Newsletter"}
      </div>
      <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.55, marginBottom: 14 }}>
        {lang === "nl"
          ? "Stuur een e-mail naar al je klanten — bijvoorbeeld voor een vakantiesluiting, aanbieding of nieuwtje. Klanten krijgen elk een aparte e-mail met jouw salonnaam."
          : "Send an email to all your clients — for a holiday closure, promo, or update. Each client gets their own email with your salon name."}
      </div>

      <label style={lbl}>{lang === "nl" ? "Doelgroep" : "Segment"}</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        {SEGMENTS.map(s => {
          const active = segment === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              style={{
                padding: "7px 12px", borderRadius: 100, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.04em", cursor: "pointer",
                background: active ? accent : "transparent",
                color: active ? c.btnOnDark : c.textSub,
                border: `1px solid ${active ? accent : c.inputBorder}`,
                fontFamily: "'Jost', sans-serif",
              }}
            >
              {lang === "nl" ? s.nl : s.en}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 12 }}>
        {(() => {
          const active = SEGMENTS.find(s => s.key === segment);
          return active ? (lang === "nl" ? active.desc_nl : active.desc_en) : "";
        })()}
      </div>

      <label style={lbl}>{lang === "nl" ? "Onderwerp" : "Subject"}</label>
      <input className="input-field" value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
        placeholder={lang === "nl" ? "bijv. Tijdelijk gesloten in augustus" : "e.g. Closed during August"}
        style={{ width: "100%", fontSize: 13, padding: "10px 12px", marginBottom: 12 }} />

      <label style={lbl}>{lang === "nl" ? "Bericht" : "Message"}</label>
      <textarea className="input-field" value={message} onChange={e => setMessage(e.target.value)} maxLength={5000} rows={6}
        placeholder={lang === "nl" ? "Beste klant,\n\nWe willen je laten weten dat..." : "Dear client,\n\nWe wanted to let you know that..."}
        style={{ width: "100%", fontSize: 13, padding: "10px 12px", marginBottom: 10, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />

      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 14 }}>
        {count === null
          ? (lang === "nl" ? "Ontvangers laden…" : "Loading recipients…")
          : (lang === "nl" ? `${count} ontvanger${count === 1 ? "" : "s"}` : `${count} recipient${count === 1 ? "" : "s"}`)}
      </div>

      {!confirming ? (
        <button className="btn-primary" disabled={!canSend} onClick={() => setConfirming(true)}
          style={{ width: "100%", padding: "11px 14px", fontSize: 12 }}>
          {lang === "nl" ? "Nieuwsbrief versturen" : "Send newsletter"}
        </button>
      ) : (
        <div style={{ background: c.bg, border: `1px solid ${accent}44`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, color: c.text, marginBottom: 10, lineHeight: 1.5 }}>
            {lang === "nl"
              ? `Versturen naar ${count} klant${count === 1 ? "" : "en"}? Dit kan niet ongedaan gemaakt worden.`
              : `Send to ${count} client${count === 1 ? "" : "s"}? This cannot be undone.`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" disabled={sending} onClick={send} style={{ flex: 1, padding: "10px 14px", fontSize: 12 }}>
              {sending ? (lang === "nl" ? "Versturen…" : "Sending…") : (lang === "nl" ? "Ja, verstuur" : "Yes, send")}
            </button>
            <button className="btn-ghost" disabled={sending} onClick={() => setConfirming(false)} style={{ padding: "10px 16px", fontSize: 12 }}>
              {lang === "nl" ? "Annuleer" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Client CSV export block — sits in Instellingen → Overig. One button,
// no options: generates a CSV of every unique client who has booked at
// this salon, aggregated with visit/spend stats. Useful for marketing
// imports, GDPR data-portability responses, accountant client ledgers,
// and migration backups.
function ClientExportBlock({ ownerId, salonName, lang, c, accent, toast }) {
  const [exporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const mod = await import("./clientExport.js");
      const result = await mod.exportClientsCSV({ ownerId, salonName, lang });
      if (result.count === 0) {
        toast.show(lang === "nl" ? "Nog geen klanten om te exporteren" : "No clients to export yet", "error");
      } else {
        toast.show(lang === "nl" ? `${result.count} klanten geëxporteerd` : `Exported ${result.count} clients`);
      }
    } catch (e) {
      console.error("CSV export failed:", e);
      toast.show(lang === "nl" ? "Export mislukt" : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>
        {lang === "nl" ? "Klantenlijst exporteren" : "Export clients"}
      </div>
      <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.55, marginBottom: 14 }}>
        {lang === "nl"
          ? "Download een CSV met al je klanten: contactgegevens, bezoekstatistieken, favoriete behandeling en medewerker. Handig voor nieuwsbrieven, boekhouding of GDPR-verzoeken."
          : "Download a CSV of every client: contact info, visit stats, favorite service and staff. Useful for newsletters, bookkeeping, or GDPR requests."}
      </div>
      <button
        onClick={download}
        disabled={exporting}
        className="btn-ghost"
        style={{ width: "100%", padding: "10px 14px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", opacity: exporting ? 0.6 : 1 }}
      >
        {exporting ? (
          <>{lang === "nl" ? "Exporteren..." : "Exporting..."}</>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {lang === "nl" ? "Download CSV" : "Download CSV"}
          </>
        )}
      </button>
    </div>
  );
}

// Revenue report block — renders inside the Facturen view. Owner picks a
// period (this/last month, this/last year, or custom range) and clicks
// download; jsPDF generates and triggers a browser download instantly.
function RevenueReportBlock({ salonData, completedAppts, lang, c, accent, toast }) {
  const [period, setPeriod] = useState("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const presets = [
    { key: "this_month", label: lang === "nl" ? "Deze maand" : "This month" },
    { key: "last_month", label: lang === "nl" ? "Vorige maand" : "Last month" },
    { key: "this_year", label: lang === "nl" ? "Dit jaar" : "This year" },
    { key: "last_year", label: lang === "nl" ? "Vorig jaar" : "Last year" },
    { key: "custom", label: lang === "nl" ? "Aangepast" : "Custom" },
  ];

  const getRange = () => {
    if (period === "custom") {
      if (!customFrom || !customTo) return null;
      const fromDate = new Date(customFrom);
      const toDate = new Date(customTo);
      const label = lang === "nl"
        ? `${fromDate.toLocaleDateString("nl-NL")} — ${toDate.toLocaleDateString("nl-NL")}`
        : `${fromDate.toLocaleDateString("en-US")} — ${toDate.toLocaleDateString("en-US")}`;
      return { from: customFrom, to: customTo, label };
    }
    return periodPreset(period, lang);
  };

  const [generating, setGenerating] = useState(false);

  const download = async () => {
    const range = getRange();
    if (!range) {
      toast.show(lang === "nl" ? "Kies een datumbereik" : "Pick a date range", "error");
      return;
    }
    const inRange = completedAppts.filter(a => a.date >= range.from && a.date <= range.to);
    if (inRange.length === 0) {
      toast.show(lang === "nl" ? "Geen afgeronde afspraken in deze periode" : "No completed appointments in this period", "error");
      return;
    }
    setGenerating(true);
    try {
      // Lazy-load jsPDF on demand. First click may take ~1s while the ~400KB
      // chunk downloads; subsequent clicks are instant (browser-cached).
      const mod = await import("./revenueReport.js");
      const result = mod.generateRevenueReportPDF({ salon: salonData, appointments: inRange, range, lang });
      toast.show(lang === "nl" ? `PDF gedownload (${result.count} afspraken)` : `PDF downloaded (${result.count} appointments)`);
    } catch (e) {
      console.error("PDF error:", e);
      toast.show(lang === "nl" ? "PDF genereren mislukt" : "Failed to generate PDF", "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: c.text, marginBottom: 3 }}>
            {lang === "nl" ? "Omzetrapport (PDF)" : "Revenue report (PDF)"}
          </div>
          <div style={{ fontSize: 11, color: c.textLabel }}>
            {lang === "nl"
              ? "Download een professioneel rapport voor je boekhouder of belastingaangifte."
              : "Download a professional report for your accountant or tax filing."}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            style={{
              padding: "8px 14px",
              borderRadius: 100,
              fontSize: 11,
              fontWeight: period === p.key ? 600 : 400,
              background: period === p.key ? `${accent}18` : c.inputBg,
              border: `1px solid ${period === p.key ? accent : c.inputBorder}`,
              color: period === p.key ? accent : c.textSub,
              cursor: "pointer",
              fontFamily: "'Jost',sans-serif",
              transition: "all 0.2s",
            }}
          >{p.label}</button>
        ))}
      </div>
      {period === "custom" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="input-field"
            style={{ fontSize: 12, padding: "10px 12px", flex: 1, minWidth: 140 }}
          />
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="input-field"
            style={{ fontSize: 12, padding: "10px 12px", flex: 1, minWidth: 140 }}
          />
        </div>
      )}
      <button
        onClick={download}
        disabled={generating}
        className="btn-primary"
        style={{ marginTop: 14, width: "100%", padding: "12px 20px", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: generating ? 0.6 : 1 }}
      >
        {generating ? (
          <>{lang === "nl" ? "PDF maken..." : "Building PDF..."}</>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {lang === "nl" ? "Download PDF" : "Download PDF"}
          </>
        )}
      </button>
    </div>
  );
}

// Small DeepL-backed translate helper. Sits in a label row next to a text
// input; clicking pulls the string from the OTHER language and fills THIS
// field. Disabled while the source is empty or a request is in flight.
function TranslateBtn({ sourceText, sourceLang, targetLang, onResult, accent }) {
  const [loading, setLoading] = useState(false);
  const src = (sourceText || "").trim();
  const disabled = loading || !src;
  const doTranslate = async () => {
    if (disabled) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("translate-text", {
        body: { texts: [src], source_lang: sourceLang, target_lang: targetLang },
      });
      if (!error && data?.translations?.[0]) onResult(data.translations[0]);
    } catch { /* swallowed — silent no-op if DeepL is unreachable */ }
    setLoading(false);
  };
  return (
    <button type="button" onClick={doTranslate} disabled={disabled}
      title={sourceLang === "NL" ? "Vertaal vanuit Nederlands (DeepL)" : "Translate from English (DeepL)"}
      style={{ background: "transparent", border: "none", color: disabled ? "#999" : accent, cursor: disabled ? "not-allowed" : "pointer", padding: 0, fontSize: 9, letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
      {loading ? "..." : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
            <path d="M22 22l-5-10-5 10" /><path d="M14 18h6" />
          </svg>
          {sourceLang === "NL" ? "NL→EN" : "EN→NL"}
        </>
      )}
    </button>
  );
}

// Single-input bilingual field. Owner only edits ONE language (the current
// UI lang). The other language is auto-filled on save via autoFillTranslations
// unless the owner clicks "andere taal" to open a manual editor.
function AutoTranslateField({ nlValue, enValue, setNl, setEn, lang, accent, placeholder, textarea, rows, label, hintSuffix }) {
  const { colors: c } = useTheme();
  const [showOther, setShowOther] = useState(false);
  const isNl = lang === "nl";
  const current = isNl ? { val: nlValue, set: setNl } : { val: enValue, set: setEn };
  const other = isNl
    ? { val: enValue, set: setEn, sourceLang: "NL", targetLang: "EN-US", label: "EN", labelLong: "Engels" }
    : { val: nlValue, set: setNl, sourceLang: "EN", targetLang: "NL", label: "NL", labelLong: "Dutch" };
  const El = textarea ? "textarea" : "input";
  const inputStyle = textarea
    ? { fontSize: 13, padding: "10px 12px", width: "100%", fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" }
    : { fontSize: 13, padding: "10px 12px", width: "100%" };
  const done = !!(other.val || "").trim();
  return (
    <div>
      {label && <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>}
      <El className="input-field" value={current.val || ""} onChange={e => current.set(e.target.value)}
        placeholder={placeholder} style={inputStyle} {...(textarea ? { rows: rows || 4 } : {})} />
      {!showOther ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, fontSize: 10, color: c.textMuted, gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            {isNl ? `Wordt automatisch vertaald naar Engels` : `Auto-translated to Dutch`}
            {done && <span style={{ color: c.success || accent, marginLeft: 4 }}>· {isNl ? "EN klaar" : "NL done"}</span>}
            {hintSuffix}
          </span>
          <button type="button" onClick={() => setShowOther(true)}
            style={{ background: "transparent", border: "none", color: accent, cursor: "pointer", fontSize: 10, textDecoration: "underline", padding: 0 }}>
            {isNl ? `${other.label}-versie bewerken` : `Edit ${other.label} version`}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 8, background: c.bg, border: `1px dashed ${c.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 9, color: c.textLabel, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
              {isNl ? `Naam (${other.label})` : `Name (${other.label})`}
            </span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <TranslateBtn sourceText={current.val} sourceLang={other.sourceLang} targetLang={other.targetLang} accent={accent} onResult={other.set} />
              <button type="button" onClick={() => setShowOther(false)}
                style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
            </div>
          </div>
          <El className="input-field" value={other.val || ""} onChange={e => other.set(e.target.value)}
            style={inputStyle} {...(textarea ? { rows: rows || 4 } : {})} />
        </div>
      )}
    </div>
  );
}

// Given a form snapshot and a list of {nl, en} field pairs, translate any
// pair where one side is filled but the other is empty. Runs one batched
// DeepL call per source/target route. Silent on failure — we still return
// the untranslated pair.
async function autoFillTranslations(form, pairs, currentLang) {
  const updated = { ...form };
  const isNl = currentLang === "nl";
  const jobs = [];
  for (const p of pairs) {
    const nlVal = String(updated[p.nl] || "").trim();
    const enVal = String(updated[p.en] || "").trim();
    if (isNl && nlVal && !enVal) jobs.push({ text: nlVal, sourceLang: "NL", targetLang: "EN-US", targetField: p.en });
    else if (!isNl && enVal && !nlVal) jobs.push({ text: enVal, sourceLang: "EN", targetLang: "NL", targetField: p.nl });
  }
  if (jobs.length === 0) return updated;
  const byRoute = new Map();
  for (const j of jobs) {
    const key = `${j.sourceLang}->${j.targetLang}`;
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key).push(j);
  }
  for (const [key, list] of byRoute) {
    const [srcLang, targetLang] = key.split("->");
    try {
      const { data, error } = await supabase.functions.invoke("translate-text", {
        body: { texts: list.map(j => j.text), source_lang: srcLang, target_lang: targetLang },
      });
      if (!error && data?.translations) {
        for (let i = 0; i < list.length; i++) {
          if (data.translations[i]) updated[list[i].targetField] = data.translations[i];
        }
      }
    } catch { /* ignore — save what the owner typed */ }
  }
  return updated;
}

function VariantAdder({ serviceId, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name_nl: "", name_en: "", description_nl: "", description_en: "", price: "", duration: "60" });

  const add = async () => {
    const primaryName = lang === "nl" ? form.name_nl : (form.name_en || form.name_nl);
    if (!primaryName || !form.price) return;
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) { toast.show(lang === "nl" ? "Ongeldige prijs" : "Invalid price", "error"); return; }
    const filled = await autoFillTranslations(form, [{ nl: "name_nl", en: "name_en" }, { nl: "description_nl", en: "description_en" }], lang);
    const { data, error } = await supabase.from("service_variants").insert({
      service_id: serviceId, name_nl: filled.name_nl || filled.name_en, name_en: filled.name_en || null,
      description_nl: filled.description_nl || null, description_en: filled.description_en || null,
      price, duration: parseInt(filled.duration) || 60
    }).select().single();
    if (error || !data) {
      toast.show(lang === "nl" ? "Toevoegen mislukt" : "Failed to add", "error");
      return;
    }
    onAdd(data);
    setForm({ name_nl: "", name_en: "", description_nl: "", description_en: "", price: "", duration: "60" });
    setOpen(false);
  };

  if (!open) return (
    <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px", borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
      onClick={() => setOpen(true)}>{t.addVariant}</button>
  );

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 12, padding: 10, marginTop: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
        <AutoTranslateField
          nlValue={form.name_nl}
          enValue={form.name_en}
          setNl={v => setForm(f => ({...f, name_nl: v}))}
          setEn={v => setForm(f => ({...f, name_en: v}))}
          lang={lang} accent={accent}
          placeholder={lang === "nl" ? "Naam *" : "Name *"}
        />
        <AutoTranslateField
          nlValue={form.description_nl}
          enValue={form.description_en}
          setNl={v => setForm(f => ({...f, description_nl: v}))}
          setEn={v => setForm(f => ({...f, description_en: v}))}
          lang={lang} accent={accent}
          placeholder={lang === "nl" ? "Omschrijving" : "Description"}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <input className="input-field" placeholder="€ Prijs *" type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
          <input className="input-field" placeholder="Duur (min)" type="number" value={form.duration} onChange={e => setForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        </div>
      </div>
      {((lang === "nl" ? !form.name_nl : !form.name_en) || !form.price) && <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 4 }}>* {lang === "nl" ? "Vul naam en prijs in" : "Fill in name and price"}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{t.add}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}><NavIcon name="xmark" size={12} /></button>
      </div>
    </div>
  );
}

function ExtraAdder({ serviceId, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name_nl: "", name_en: "", price: "" });

  const add = async () => {
    const primaryName = lang === "nl" ? form.name_nl : (form.name_en || form.name_nl);
    if (!primaryName || !form.price) return;
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) { toast.show(lang === "nl" ? "Ongeldige prijs" : "Invalid price", "error"); return; }
    const filled = await autoFillTranslations(form, [{ nl: "name_nl", en: "name_en" }], lang);
    const { data, error } = await supabase.from("service_extras").insert({
      service_id: serviceId, name_nl: filled.name_nl || filled.name_en, name_en: filled.name_en || null,
      price
    }).select().single();
    if (error || !data) {
      toast.show(lang === "nl" ? "Toevoegen mislukt" : "Failed to add", "error");
      return;
    }
    onAdd(data);
    setForm({ name_nl: "", name_en: "", price: "" });
    setOpen(false);
  };

  if (!open) return (
    <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px", borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
      onClick={() => setOpen(true)}>{t.addExtra}</button>
  );

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 12, padding: 10, marginTop: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
        <AutoTranslateField
          nlValue={form.name_nl}
          enValue={form.name_en}
          setNl={v => setForm(f => ({...f, name_nl: v}))}
          setEn={v => setForm(f => ({...f, name_en: v}))}
          lang={lang} accent={accent}
          placeholder={lang === "nl" ? "Naam *" : "Name *"}
        />
        <input className="input-field" placeholder={lang === "nl" ? "€ Prijs *" : "€ Price *"} type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px", width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{t.add}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}><NavIcon name="xmark" size={12} /></button>
      </div>
    </div>
  );
}

// ─── STAFF ADDER ────────────────────────────────────────────
function StaffAdder({ ownerId, services, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", email: "" });
  const [selServices, setSelServices] = useState([]);

  const add = async () => {
    if (!form.name.trim()) return;
    const email = form.email.trim().toLowerCase();
    // Basic email check if provided. Email is what lets the staff member log in — when
    // they sign up or log in with this address, our auth flow will link their user_id
    // to this staff_members row automatically.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.show(lang === "nl" ? "Ongeldig e-mailadres" : "Invalid email address", "error");
      return;
    }
    const { data, error } = await supabase.from("staff_members").insert({
      owner_id: ownerId, name: form.name.trim(), role: form.role.trim() || null, email: email || null
    }).select().single();
    if (error || !data) {
      toast.show(lang === "nl" ? "Medewerker toevoegen mislukt" : "Failed to add staff", "error");
      return;
    }
    // Link selected services
    if (selServices.length > 0) {
      await supabase.from("staff_services").insert(
        selServices.map(sid => ({ staff_id: data.id, service_id: sid }))
      );
    }
    onAdd({ ...data, service_ids: selServices });
    setForm({ name: "", role: "", email: "" });
    setSelServices([]);
    setOpen(false);
  };

  if (!open) return (
    <button className="btn-ghost" style={{ width: "100%", fontSize: 10, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
      onClick={() => setOpen(true)}>{t.addStaff}</button>
  );

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 12, padding: 12, marginTop: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        <input className="input-field" placeholder={t.staffName + " *"} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
        <input className="input-field" placeholder={t.staffRole} value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
        <input className="input-field" type="email" placeholder={`${lang === "nl" ? "E-mail voor login" : "Login email"} (${t.optional || "optional"})`} value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
        <div style={{ fontSize: 10, color: c.textMuted, lineHeight: 1.4 }}>{lang === "nl" ? "Voeg een e-mailadres toe als de medewerker in moet kunnen loggen op hun eigen dashboard." : "Add an email if this staff member should be able to log into their own dashboard."}</div>
      </div>
      {services.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.services}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {services.map(s => {
              const isOn = selServices.includes(s.id);
              return (
                <div key={s.id} onClick={() => setSelServices(prev => isOn ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                  style={{ fontSize: 10, padding: "5px 10px", borderRadius: 100, cursor: "pointer", border: `1px solid ${isOn ? accent : c.inputBorder}`, background: isOn ? `${accent}18` : "transparent", color: isOn ? accent : c.textSub, transition: "all 0.2s" }}>
                  {s.name_nl || s.name}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{t.add}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}><NavIcon name="xmark" size={12} /></button>
      </div>
    </div>
  );
}

// ─── LOCATION ADDER ────────────────────────────────────────
function LocationAdder({ ownerId, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", city: "", phone: "" });

  const add = async () => {
    if (!form.name.trim()) return;
    const { data, error } = await supabase.from("locations").insert({
      owner_id: ownerId, name: form.name.trim(), address: form.address || null,
      city: form.city || null, phone: form.phone || null,
      business_hours: DEFAULT_HOURS, break_minutes: 0
    }).select().single();
    if (error || !data) {
      toast.show(lang === "nl" ? "Locatie toevoegen mislukt" : "Failed to add location", "error");
      return;
    }
    onAdd(data);
    setForm({ name: "", address: "", city: "", phone: "" });
    setOpen(false);
  };

  if (!open) return (
    <button className="btn-ghost" style={{ width: "100%", fontSize: 10, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
      onClick={() => setOpen(true)}>{t.addLocation}</button>
  );

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 12, padding: 12, marginTop: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        <input className="input-field" placeholder={t.locationName + " *"} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
        <input className="input-field" placeholder={t.locationAddress} value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input className="input-field" placeholder={t.locationCity} value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
          <input className="input-field" placeholder={t.locationPhone} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{t.add}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}><NavIcon name="xmark" size={12} /></button>
      </div>
    </div>
  );
}

// ─── PLAN SELECTION (PAYWALL) ────────────────────────────────
// PlanSelection screens 3 user states:
//   • brand-new owner (no plan, trial_used=false)  → "Start 14-day free trial"
//   • trial used or past_due (trial expired)        → "Subscribe" (Mollie checkout)
//   • returning from successful Mollie checkout     → success splash + reload
//
// `start-trial` and `create-subscription` are both server-side: pricing,
// trial_used flip, and Mollie customer creation are all enforced there. This
// component is purely UI + thin error handling.
function PlanSelection({ user, lang, setLang, onLogout }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const accent = ACCENT;
  const toast = useToast();

  const [billingInterval, setBillingInterval] = useState("monthly");
  // The plan id currently being processed (or null). Per-plan so only the
  // clicked button shows a loading state, never both at once.
  const [busyPlan, setBusyPlan] = useState(null);
  const busy = busyPlan !== null;
  const [profileBilling, setProfileBilling] = useState(null); // { trial_used, subscription_status }
  const [postCheckout, setPostCheckout] = useState(false);

  // On mount: detect Mollie redirect, then load profile.trial_used / status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") === "success") {
      setPostCheckout(true);
      // Strip the query string so a refresh doesn't re-trigger the splash
      window.history.replaceState({}, "", "/owner");
      // Webhook should have flipped subscription_status=active by now (Mollie
      // typically pings within seconds). Reload after a short pause so the
      // user lands in OwnerApp instead of bouncing back here.
      setTimeout(() => window.location.reload(), 4000);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("trial_used, subscription_status")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled && data) setProfileBilling(data);
    })();
    return () => { cancelled = true; };
  }, [user.id]);

  // Server-of-truth prices live in create-subscription. Numbers here are
  // display-only — if they ever drift, the server still bills the correct
  // amount and refuses anything else. Yearly = 10× monthly = 2 months free.
  const PRICES = { starter: 19, professional: 39 };
  const priceFor = (planId) => {
    const m = PRICES[planId];
    if (billingInterval === "monthly") return { display: m, suffix: t.perMonth, sub: null };
    const y = m * 10;
    return {
      display: (y / 12).toFixed(2),
      suffix: t.perMonth,
      sub: `€${y} ${t.billedYearly}`,
    };
  };

  const canTrial = profileBilling && !profileBilling.trial_used;

  const handleStartTrial = async (planId) => {
    if (busy) return;
    setBusyPlan(planId);
    let redirecting = false;
    try {
      const { data, error } = await supabase.functions.invoke("start-trial", {
        body: { plan: planId, billing_interval: billingInterval },
      });
      if (error || !data?.success) {
        const code = data?.error || error?.message || "unknown";
        if (code === "trial_already_used") {
          // Race: profile says no trial, server says yes. Refresh state.
          toast.show(lang === "nl" ? "Proefperiode al gebruikt" : "Trial already used", "error");
          setProfileBilling((p) => ({ ...(p || {}), trial_used: true }));
        } else {
          toast.show(lang === "nl" ? `Probleem: ${code}` : `Error: ${code}`, "error");
        }
        return;
      }
      // Trial activated. Force a hard reload so OwnerEntryPage's role
      // resolution re-runs and sees the new plan_expires_at.
      redirecting = true;
      window.location.href = "/owner";
    } catch (e) {
      console.error("start-trial error:", e);
      toast.show(t.somethingWrong, "error");
    } finally {
      // Always clear the loading state unless we're navigating away.
      if (!redirecting) setBusyPlan(null);
    }
  };

  const handleSubscribe = async (planId) => {
    if (busy) return;
    setBusyPlan(planId);
    let redirecting = false;
    try {
      const { data, error } = await supabase.functions.invoke("create-subscription", {
        body: { plan: planId, billing_interval: billingInterval },
      });
      if (error || !data?.checkout_url) {
        const code = data?.error || error?.message || "unknown";
        toast.show(
          lang === "nl"
            ? `Betaling kon niet starten: ${code}`
            : `Could not start payment: ${code}`,
          "error"
        );
        return;
      }
      // Hand off to Mollie's hosted checkout. They'll redirect back to
      // /owner?subscription=success on completion (handled above).
      redirecting = true;
      window.location.href = data.checkout_url;
    } catch (e) {
      console.error("create-subscription error:", e);
      toast.show(t.somethingWrong, "error");
    } finally {
      // Always clear the loading state unless we're navigating away — this
      // guarantees the button never stays stuck on "Bezig…".
      if (!redirecting) setBusyPlan(null);
    }
  };

  const plans = [
    {
      id: "starter",
      name: t.planStarter,
      desc: t.planStarterDesc,
      features: [t.planFeatureBookings, t.planFeatureEmail, t.planFeatureReminders, t.planFeatureReviews, t.planFeatureStaff + " (max 3)"],
      popular: false,
    },
    {
      id: "professional",
      name: t.planProfessional,
      desc: t.planProfessionalDesc,
      features: [t.planFeatureBookings, t.planFeatureEmail, t.planFeatureReminders, t.planFeatureReviews, t.planFeatureUnlimited, t.planFeatureAnalytics, t.planFeatureCustomBranding, t.planFeatureDiscounts, t.planFeatureCategories, t.planFeaturePriority],
      popular: true,
    },
  ];

  // Post-Mollie-checkout success splash (auto-reloads after a few seconds)
  if (postCheckout) {
    return (
      <Layout>
        <div style={{ background: c.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "'Jost',sans-serif", color: c.text, textAlign: "center" }}>
          <div style={{ marginBottom: 24 }}><NavIcon name="check" size={48} color={c.success} /></div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 12 }}>
            {lang === "nl" ? "Welkom bij Vellu!" : "Welcome to Vellu!"}
          </div>
          <div style={{ fontSize: 14, color: c.textSub, maxWidth: 420 }}>
            {lang === "nl"
              ? "Je abonnement wordt geactiveerd. Een momentje…"
              : "Your subscription is being activated. One moment…"}
          </div>
          <div style={{ marginTop: 28, width: 32, height: 32, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      </Layout>
    );
  }

  // The CTA copy depends on whether they can still trial. Loading text only
  // shows on the specific plan being processed, never both buttons at once.
  const ctaLabel = (planId) =>
    busyPlan === planId
      ? (lang === "nl" ? "Bezig…" : "Loading…")
      : (canTrial
          ? (lang === "nl" ? "Start gratis 14 dagen" : "Start 14-day free trial")
          : t.selectPlan);

  return (
    <Layout>
      <ToastContainer toasts={toast.toasts} />
      <div style={{
        background: c.bg, minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", padding: "0 24px 40px",
        fontFamily: "'Jost',sans-serif", color: c.text, position: "relative"
      }}>

        <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: "80%", maxWidth: 600, height: "50%", background: `radial-gradient(ellipse at center, ${accent}08 0%, transparent 70%)`, pointerEvents: "none" }} />

        {/* Header */}
        <div style={{ width: "100%", maxWidth: 720, padding: "24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.18em" }}>vellu</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ThemeToggle />
            <LangToggle lang={lang} setLang={setLang} />
            <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={onLogout}>{t.logout}</button>
          </div>
        </div>

        <div style={{ maxWidth: 720, width: "100%", position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }} className="fade-up">
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ marginBottom: 16 }}><NavIcon name="crown" size={36} color={ACCENT} /></div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{t.choosePlan}</div>
            <div style={{ fontSize: 13, color: c.textLabel }}>
              {canTrial
                ? (lang === "nl" ? "Probeer Vellu 14 dagen gratis. Geen creditcard nodig." : "Try Vellu free for 14 days. No credit card required.")
                : t.choosePlanSub}
            </div>
          </div>

          {/* Monthly/Yearly toggle */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <div className="lang-toggle">
              <button
                className={`lang-btn ${billingInterval === "monthly" ? "active" : "inactive"}`}
                onClick={() => setBillingInterval("monthly")}
                aria-pressed={billingInterval === "monthly"}
              >
                {t.billingMonthly}
              </button>
              <button
                className={`lang-btn ${billingInterval === "yearly" ? "active" : "inactive"}`}
                onClick={() => setBillingInterval("yearly")}
                aria-pressed={billingInterval === "yearly"}
              >
                {t.billingYearly}
                <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.85 }}>· {t.twoMonthsFree}</span>
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
            {plans.map(plan => {
              const p = priceFor(plan.id);
              return (
                <div key={plan.id} style={{
                  background: plan.popular ? `${accent}08` : c.bgCard,
                  border: `1px solid ${plan.popular ? `${accent}44` : c.border}`,
                  borderRadius: 24, padding: "28px 24px", position: "relative", transition: "all 0.3s"
                }}>
                  {plan.popular && (
                    <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: accent, color: c.btnOnDark, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 14px", borderRadius: 100 }}>
                      {lang === "nl" ? "POPULAIR" : "POPULAR"}
                    </div>
                  )}
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 4 }}>{plan.name}</div>
                    <div style={{ fontSize: 12, color: c.textLabel, marginBottom: 12, minHeight: 16 }}>{plan.desc}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: accent, lineHeight: 1 }}>
                      €{p.display}<span style={{ fontSize: 16, color: c.textLabel }}>{p.suffix}</span>
                    </div>
                    {p.sub && (
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 6 }}>{p.sub}</div>
                    )}
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    {plan.features.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 12, color: c.textSub }}>
                        <NavIcon name="check" size={14} color={accent} />
                        {f}
                      </div>
                    ))}
                  </div>
                  <button
                    className={plan.popular ? "btn-primary" : "btn-ghost"}
                    style={{ width: "100%", ...(plan.popular ? {} : { borderColor: `${accent}44`, color: accent }) }}
                    disabled={busy || !profileBilling}
                    onClick={() => (canTrial ? handleStartTrial(plan.id) : handleSubscribe(plan.id))}
                  >
                    {ctaLabel(plan.id)}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ textAlign: "center", color: c.textMuted, fontSize: 11 }}>
            {canTrial
              ? (lang === "nl"
                  ? "Geen verplichtingen. Annuleer wanneer je wilt tijdens of na de proefperiode."
                  : "No commitment. Cancel anytime during or after the trial.")
              : (lang === "nl"
                  ? "Veilig betalen via iDEAL, creditcard, Apple Pay, Google Pay of SEPA — powered by Mollie."
                  : "Secure payment via iDEAL, card, Apple Pay, Google Pay or SEPA — powered by Mollie.")}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── ONBOARDING WIZARD ──────────────────────────────────────
function OnboardingWizard({ salonData, update, lang, setLang, onFinish, accent = ACCENT }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const toast = useToast();
  const DAY_FULL = lang === "nl" ? DAY_FULL_NL : DAY_FULL_EN;
  const [step, setStep] = useState(0);
  // Salon name + city are already collected at signup, so onboarding doesn't
  // re-ask them. Step 1 only collects the public-facing contact email (the one
  // thing not gathered yet) — empty by default, optional.
  const [salonEmail, setSalonEmail] = useState("");
  const [svcName, setSvcName] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const [svcDuration, setSvcDuration] = useState("60");
  const [saving, setSaving] = useState(false);

  const steps = [
    { title: t.onboardingStep1, sub: t.onboardingStep1Sub },
    { title: t.onboardingStep2, sub: t.onboardingStep2Sub },
    { title: t.onboardingStep3, sub: t.onboardingStep3Sub },
  ];

  const saveStep1 = async () => {
    // salon_email is the public-facing contact address shown on the booking
    // page. Fully optional — owners can also set it later in Settings — so an
    // empty value just advances without writing anything.
    if (salonEmail.trim()) {
      setSaving(true);
      const { error } = await supabase.from("profiles").update({ salon_email: salonEmail.trim() }).eq("id", salonData.owner_id);
      setSaving(false);
      if (error) { toast.show(lang === "nl" ? "Opslaan mislukt — probeer opnieuw" : "Save failed — try again", "error"); return; }
      update(d => { d.salon_email = salonEmail.trim(); return d; });
    }
    setStep(1);
  };

  const saveStep2 = async () => {
    if (!svcName.trim() || !svcPrice) return;
    setSaving(true);
    // services.name is NOT NULL — keep it in sync with the localized names so
    // legacy queries still work for newly-created services.
    const { data: newSvc, error } = await supabase.from("services").insert({
      owner_id: salonData.owner_id,
      name: svcName.trim(),
      name_nl: svcName.trim(),
      name_en: svcName.trim(),
      price: parseFloat(svcPrice),
      duration: parseInt(svcDuration) || 60,
      position: 0
    }).select().single();
    setSaving(false);
    if (error || !newSvc) { toast.show(lang === "nl" ? "Dienst toevoegen mislukt — probeer opnieuw" : "Failed to add service — try again", "error"); return; }
    update(d => { d.services = [...d.services, { ...newSvc, photos: [], variants: [], extras: [] }]; return d; });
    setStep(2);
  };

  const saveStep3 = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ business_hours: salonData.business_hours || DEFAULT_HOURS }).eq("id", salonData.owner_id);
    setSaving(false);
    if (error) { toast.show(lang === "nl" ? "Opslaan mislukt — probeer opnieuw" : "Save failed — try again", "error"); return; }
    setStep(3);
  };

  return (
    <Layout>
      <ToastContainer toasts={toast.toasts} />

      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8, zIndex: 5 }}>
          <ThemeToggle />
          {setLang && <LangToggle lang={lang} setLang={setLang} />}
        </div>
        <div style={{ width: "100%", maxWidth: 440 }}>

          {/* Progress */}
          <div style={{ display: "flex", gap: 6, marginBottom: 40 }}>
            {steps.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? accent : c.border, transition: "background 0.3s" }} />
            ))}
          </div>

          {/* Step 0: Salon details */}
          {step === 0 && (
            <div>
              <div style={{ fontSize: 26, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingWelcome}</div>
              <div style={{ fontSize: 13, color: c.textSub, marginBottom: 32, lineHeight: 1.6 }}>{t.onboardingWelcomeSub}</div>

              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>{t.salonEmail}</div>
              <input className="input-field" type="email" placeholder={lang === "nl" ? "Bijv. info@jouwsalon.nl" : "e.g. info@yoursalon.com"} value={salonEmail} onChange={e => setSalonEmail(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 24, lineHeight: 1.5 }}>{lang === "nl" ? "Dit e-mailadres is zichtbaar voor klanten op je boekingspagina. Je inlog-e-mail blijft privé. Optioneel — je kunt dit later wijzigen bij Instellingen." : "This email is visible to clients on your booking page. Your login email stays private. Optional — you can change this later in Settings."}</div>

              <button className="btn-primary" style={{ width: "100%" }} onClick={saveStep1} disabled={saving}>
                {saving ? "..." : (salonEmail.trim() ? t.onboardingNext : t.onboardingSkip)}
              </button>
            </div>
          )}

          {/* Step 1: First service */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 26, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingStep2}</div>
              <div style={{ fontSize: 13, color: c.textSub, marginBottom: 32, lineHeight: 1.6 }}>{t.onboardingStep2Sub}</div>

              <input className="input-field" placeholder={t.onboardingServiceName} value={svcName} onChange={e => setSvcName(e.target.value)} style={{ marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                <input className="input-field" type="number" placeholder={t.onboardingServicePrice} value={svcPrice} onChange={e => setSvcPrice(e.target.value)} style={{ flex: 1 }} />
                <select className="input-field" value={svcDuration} onChange={e => setSvcDuration(e.target.value)} style={{ flex: 1 }}>
                  {[15,30,45,60,75,90,120].map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>

              <button className="btn-primary" style={{ width: "100%", marginBottom: 10 }} onClick={saveStep2} disabled={saving || !svcName.trim() || !svcPrice}>
                {saving ? "..." : t.onboardingNext}
              </button>
              <button className="btn-ghost" style={{ width: "100%", fontSize: 11, color: c.textLabel }} onClick={() => setStep(2)}>
                {t.onboardingSkip}
              </button>
            </div>
          )}

          {/* Step 2: Business hours */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 26, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingStep3}</div>
              <div style={{ fontSize: 13, color: c.textSub, marginBottom: 24, lineHeight: 1.6 }}>{t.onboardingStep3Sub}</div>

              {[0,1,2,3,4,5,6].map(day => {
                const hours = salonData.business_hours?.[day] || DEFAULT_HOURS[day];
                const isClosed = hours.closed;
                return (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "10px 12px", background: isClosed ? c.bgCard : `${accent}08`, border: `1px solid ${isClosed ? c.border : `${accent}22`}`, borderRadius: 12, opacity: isClosed ? 0.6 : 1, transition: "all 0.2s" }}>
                    <div style={{ width: 80, fontSize: 12, fontWeight: 500 }}>{DAY_FULL[day]}</div>
                    <div onClick={() => update(d => { if (!d.business_hours) d.business_hours = {...DEFAULT_HOURS}; d.business_hours[day] = { ...d.business_hours[day], closed: !isClosed }; return d; })}
                      style={{ width: 36, height: 20, borderRadius: 10, background: isClosed ? c.inputBorder : accent, cursor: "pointer", position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
                      <div style={{ position: "absolute", top: 2, left: isClosed ? 2 : 18, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                    </div>
                    {!isClosed ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                        <select value={hours.open} onChange={e => update(d => { if (!d.business_hours) d.business_hours = {...DEFAULT_HOURS}; d.business_hours[day] = { ...d.business_hours[day], open: e.target.value }; return d; })}
                          style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, padding: "6px 8px", color: c.text, fontSize: 11, fontFamily: "'Jost',sans-serif", cursor: "pointer" }}>
                          {TIMES.map(t => <option key={t} value={t} style={{ background: c.selectBg }}>{t}</option>)}
                        </select>
                        <span style={{ fontSize: 11, color: c.textLabel }}>—</span>
                        <select value={hours.close} onChange={e => update(d => { if (!d.business_hours) d.business_hours = {...DEFAULT_HOURS}; d.business_hours[day] = { ...d.business_hours[day], close: e.target.value }; return d; })}
                          style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, padding: "6px 8px", color: c.text, fontSize: 11, fontFamily: "'Jost',sans-serif", cursor: "pointer" }}>
                          {TIMES.map(t => <option key={t} value={t} style={{ background: c.selectBg }}>{t}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: c.textMuted }}>{t.closed}</div>
                    )}
                  </div>
                );
              })}

              <button className="btn-primary" style={{ width: "100%", marginTop: 20, marginBottom: 10 }} onClick={saveStep3} disabled={saving}>
                {saving ? "..." : t.onboardingNext}
              </button>
              <button className="btn-ghost" style={{ width: "100%", fontSize: 11, color: c.textLabel }} onClick={onFinish}>
                {t.onboardingSkip}
              </button>
            </div>
          )}

          {/* Done state — shown briefly before redirecting */}
          {step === 3 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ marginBottom: 16 }}><NavIcon name="diamond" size={48} color={accent} /></div>
              <div style={{ fontSize: 28, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, marginBottom: 8 }}>{t.onboardingDone}</div>
              <div style={{ fontSize: 13, color: c.textSub, marginBottom: 8 }}>{t.onboardingDoneSub}</div>
              <div style={{ fontSize: 13, color: accent, marginBottom: 32, fontWeight: 500 }}>vellu.cc/{salonData.id}</div>
              <button className="btn-primary" style={{ width: "100%" }} onClick={onFinish}>{t.onboardingFinish}</button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ─── CUSTOMERS VIEW ──────────────────────────────────────────
// Searchable client directory for the owner: contact details, visit stats,
// next appointment, and full service history per client. "Clients of this
// salon" = everyone who has booked here at least once (derived from
// appointments, same definition the CSV export uses), so the list always
// reflects real bookings.
// Minimal CSV parser — handles quoted fields, escaped quotes, both \n and
// \r\n, and auto-detects comma vs semicolon (NL/EU Excel exports default to
// `;`). Kept inline rather than adding papaparse for one feature.
function parseCSV(text) {
  if (!text) return [];
  // Strip UTF-8 BOM that Excel loves to add.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  // Sniff delimiter from the first line: whichever of , or ; appears more.
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delim = semiCount > commaCount ? ";" : ",";

  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delim) { cur.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cur.push(field); field = "";
        if (cur.length > 1 || cur[0] !== "") rows.push(cur);
        cur = [];
      } else {
        field += ch;
      }
    }
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

// Map a parsed CSV (rows[0] = header) onto { name, email, phone, notes } records,
// recognising both NL and EN column names. Skips rows with no usable name.
function csvRowsToClients(rows) {
  if (rows.length < 2) return { records: [], skipped: 0 };
  const header = rows[0].map(h => h.trim().toLowerCase());
  const findCol = (...names) => {
    for (const n of names) { const i = header.indexOf(n); if (i !== -1) return i; }
    return -1;
  };
  const iName = findCol("name", "naam", "klant", "client", "customer", "full name", "volledige naam");
  const iFirst = findCol("first_name", "first name", "voornaam", "given name");
  const iLast = findCol("last_name", "last name", "achternaam", "surname", "family name");
  const iEmail = findCol("email", "e-mail", "e_mail", "mail", "emailadres", "e-mailadres");
  const iPhone = findCol("phone", "telefoon", "tel", "mobile", "mobiel", "phone number", "telefoonnummer");
  const iNotes = findCol("notes", "notities", "opmerkingen", "comment", "comments", "memo");
  const iBirthday = findCol("birthday", "verjaardag", "geboortedatum", "date of birth", "dob", "birth date");

  // Accepts yyyy-mm-dd, dd-mm-yyyy, dd/mm/yyyy — normalises to yyyy-mm-dd
  // and returns null when the input doesn't look like a real date.
  const parseBirthday = (raw) => {
    if (!raw) return null;
    const t = String(raw).trim();
    if (!t) return null;
    // ISO yyyy-mm-dd
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    // dd-mm-yyyy or dd/mm/yyyy
    const eu = /^(\d{2})[-\/](\d{2})[-\/](\d{4})$/.exec(t);
    if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
    return null;
  };

  const records = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (i) => (i >= 0 && i < row.length) ? String(row[i] || "").trim() : "";
    let name = get(iName);
    if (!name) {
      const f = get(iFirst), l = get(iLast);
      name = `${f} ${l}`.trim();
    }
    const email = get(iEmail);
    if (!name) {
      // Last resort: derive a display name from the email local-part so we
      // don't drop contacts that only carried an email + phone.
      if (email) name = email.split("@")[0];
    }
    if (!name && !email) { skipped++; continue; }
    records.push({
      name: name || "—",
      email: email || null,
      phone: get(iPhone) || null,
      notes: get(iNotes) || null,
      birthday: parseBirthday(get(iBirthday)),
    });
  }
  return { records, skipped };
}

function CustomersView({ ownerId, lang, c, accent, isMobile, toast }) {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  // CSV import flow: pick file → parse → preview → bulk insert. Kept in a
  // separate state slice so it doesn't conflict with the manual-add modal.
  const fileInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null); // { rows, skipped, fileName } | null
  const [importing, setImporting] = useState(false);
  // Edit/delete flow on an individual client.
  const [editing, setEditing] = useState(null); // the client currently being edited
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", notes: "", birthday: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Merge flow — pick a source client, then pick a target survivor.
  const [mergeSource, setMergeSource] = useState(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);
  const [showDupes, setShowDupes] = useState(false);
  // Waitlist — clients who left a request when there were no available slots.
  const [waitlist, setWaitlist] = useState([]);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Appointment-derived clients + owner's manually-added contacts + waitlist + waitlist setting, in parallel.
      const [{ data: appts }, { data: manual }, { data: wl }, { data: prof }] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, date, time, service_name, service_price, status, invoice_sent, payment_method, client_email, client_name, client_phone, clients(first_name, last_name, email, phone)")
          .eq("owner_id", ownerId)
          .order("date", { ascending: false }),
        supabase
          .from("manual_clients")
          .select("id, name, email, phone, notes, hidden, birthday")
          .eq("owner_id", ownerId),
        supabase
          .from("waitlist")
          .select("id, staff_id, date, client_name, client_email, client_phone, service_ids, notes, status, created_at, notified_at")
          .eq("owner_id", ownerId)
          .in("status", ["waiting", "notified"])
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("waitlist_enabled")
          .eq("id", ownerId)
          .maybeSingle(),
      ]);
      if (!cancelled) {
        setWaitlist(wl || []);
        setWaitlistEnabled(prof?.waitlist_enabled !== false);
      }
      if (cancelled) return;
      const nowMs = Date.now();
      const byEmail = new Map();
      for (const a of appts || []) {
        const email = String(a.clients?.email || a.client_email || "").toLowerCase();
        if (!email) continue;
        let agg = byEmail.get(email);
        if (!agg) {
          const fullName = (a.client_name || `${a.clients?.first_name || ""} ${a.clients?.last_name || ""}`.trim() || email);
          agg = { key: email, email, name: fullName, phone: a.clients?.phone || a.client_phone || "", notes: "", manualId: null, appts: [], totalSpent: 0, visitCount: 0, lastVisit: null, next: null };
          byEmail.set(email, agg);
        }
        if (!agg.phone && (a.clients?.phone || a.client_phone)) agg.phone = a.clients?.phone || a.client_phone;
        agg.appts.push(a);
        if (a.status === "completed") { agg.totalSpent += parseFloat(a.service_price || 0); agg.visitCount++; if (!agg.lastVisit || a.date > agg.lastVisit) agg.lastVisit = a.date; }
      }
      // Merge manual clients: enrich an existing entry by email, otherwise add
      // a contact-only entry. Manual values WIN over appointment-derived data
      // for non-empty fields — the owner explicitly edited them, so they
      // represent the latest intent. The `hidden` flag is carried through so
      // the display can soft-hide clients whose appointments we can't remove.
      const extra = [];
      for (const m of manual || []) {
        const email = String(m.email || "").toLowerCase();
        const existing = email ? byEmail.get(email) : null;
        if (existing) {
          if (m.name && m.name.trim()) existing.name = m.name;
          if (m.phone) existing.phone = m.phone;
          if (m.notes) existing.notes = m.notes;
          if (m.birthday) existing.birthday = m.birthday;
          existing.manualId = m.id;
          existing.hidden = !!m.hidden;
        } else {
          extra.push({ key: `manual:${m.id}`, email, name: m.name || email || "—", phone: m.phone || "", notes: m.notes || "", birthday: m.birthday || null, manualId: m.id, hidden: !!m.hidden, appts: [], totalSpent: 0, visitCount: 0, lastVisit: null, next: null });
        }
      }
      const list = [...Array.from(byEmail.values()), ...extra]
        .filter((cl) => !cl.hidden)
        .map((cl) => {
          const upcoming = cl.appts
            .filter((a) => a.status !== "cancelled" && a.status !== "no_show" && new Date(`${a.date}T${a.time || "00:00"}:00`).getTime() >= nowMs)
            .sort((a, b) => `${a.date}T${a.time || ""}`.localeCompare(`${b.date}T${b.time || ""}`));
          cl.next = upcoming[0] || null;
          return cl;
        });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setClients(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ownerId, refreshKey]);

  const addCustomer = async () => {
    const name = addForm.name.trim();
    if (!name) return;
    setSaving(true);
    const { error } = await supabase.from("manual_clients").insert({
      owner_id: ownerId,
      name,
      email: addForm.email.trim() || null,
      phone: addForm.phone.trim() || null,
      notes: addForm.notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.show(lang === "nl" ? "Toevoegen mislukt — probeer opnieuw" : "Failed to add — try again", "error"); return; }
    toast.show(lang === "nl" ? "Klant toegevoegd" : "Customer added");
    setAddForm({ name: "", email: "", phone: "", notes: "" });
    setAddOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const openEdit = (cl) => {
    setEditing(cl);
    setEditForm({
      name: cl.name === cl.email ? "" : (cl.name || ""),
      email: cl.email || "",
      phone: cl.phone || "",
      notes: cl.notes || "",
      birthday: cl.birthday || "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const name = editForm.name.trim();
    if (!name) {
      toast.show(lang === "nl" ? "Naam is verplicht" : "Name is required", "error");
      return;
    }
    setEditSaving(true);
    const payload = {
      name,
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      notes: editForm.notes.trim() || null,
      // Empty string → null so the DB doesn't try to parse "" as a date.
      birthday: editForm.birthday && /^\d{4}-\d{2}-\d{2}$/.test(editForm.birthday) ? editForm.birthday : null,
    };
    // Update existing manual_clients row if one already backs this client;
    // otherwise create one so future loads pick the override up.
    let error;
    if (editing.manualId) {
      ({ error } = await supabase.from("manual_clients").update(payload).eq("id", editing.manualId).eq("owner_id", ownerId));
    } else {
      ({ error } = await supabase.from("manual_clients").insert({ owner_id: ownerId, ...payload }));
    }
    setEditSaving(false);
    if (error) {
      toast.show(lang === "nl" ? "Opslaan mislukt" : "Failed to save", "error");
      return;
    }
    toast.show(lang === "nl" ? "Wijzigingen opgeslagen" : "Changes saved");
    setEditing(null);
    setSelected(null);
    setRefreshKey((k) => k + 1);
  };

  const deleteClient = async () => {
    if (!editing) return;
    const hasHistory = (editing.appts || []).length > 0;
    const confirmMsg = hasHistory
      ? (lang === "nl"
          ? `Klant verwijderen? ${editing.appts.length} afspra(a)k(en) blijven in je agenda en klanthistorie staan; de klant verdwijnt alleen uit deze lijst.`
          : `Delete client? ${editing.appts.length} appointment(s) stay in your agenda and history; the client is only hidden from this list.`)
      : (lang === "nl" ? "Klant definitief verwijderen?" : "Permanently delete this client?");
    if (!window.confirm(confirmMsg)) return;
    setDeleting(true);
    let error;
    if (hasHistory) {
      // Soft-hide via manual_clients. Insert a shadow row if one doesn't
      // exist yet — the merge logic checks the hidden flag on load.
      if (editing.manualId) {
        ({ error } = await supabase.from("manual_clients").update({ hidden: true }).eq("id", editing.manualId).eq("owner_id", ownerId));
      } else {
        ({ error } = await supabase.from("manual_clients").insert({
          owner_id: ownerId,
          name: editing.name || editing.email || "—",
          email: editing.email || null,
          phone: editing.phone || null,
          notes: editing.notes || null,
          hidden: true,
        }));
      }
    } else if (editing.manualId) {
      ({ error } = await supabase.from("manual_clients").delete().eq("id", editing.manualId).eq("owner_id", ownerId));
    }
    setDeleting(false);
    if (error) {
      toast.show(lang === "nl" ? "Verwijderen mislukt" : "Delete failed", "error");
      return;
    }
    toast.show(lang === "nl" ? "Klant verwijderd" : "Customer deleted");
    setEditing(null);
    setSelected(null);
    setRefreshKey((k) => k + 1);
  };

  // Merge source client INTO target: rewrite all of source's appointments
  // to point at target's email/client_id, carry over notes/phone/birthday
  // from source's manual_clients row when target lacks them, then drop the
  // source manual_clients row so it disappears from the aggregation.
  const mergeClientInto = async (source, target) => {
    if (!source || !target) return;
    // Reject only same-row merges. Same-email duplicates ARE valid: they
    // typically come from two manual_clients rows entered separately for
    // the same person, and the whole point of Samenvoegen is to collapse
    // them into one.
    if (source.manualId && source.manualId === target.manualId) return;
    if (!source.manualId && !target.manualId && source.email && source.email === target.email && source.key === target.key) return;
    setMerging(true);
    try {
      // 1. Rewrite appointments belonging to source → target's email.
      //    Only touch this salon (owner_id) so a shared-email case at
      //    another Vellu salon is untouched. Skip when both share the
      //    same email — nothing to rewrite and the update is a no-op that
      //    would also match target's rows.
      if (source.email && target.email && source.email !== target.email) {
        const { error: apptErr } = await supabase
          .from("appointments")
          .update({ client_email: target.email })
          .eq("owner_id", ownerId)
          .eq("client_email", source.email);
        if (apptErr) throw apptErr;
      }

      // 2. Merge manual_clients rows. If source has notes/phone/birthday
      //    that target doesn't, move them over so nothing is lost.
      if (source.manualId) {
        const patch = {};
        if (source.notes && !target.notes) patch.notes = source.notes;
        if (source.phone && !target.phone) patch.phone = source.phone;
        if (source.birthday && !target.birthday) patch.birthday = source.birthday;
        if (Object.keys(patch).length > 0) {
          if (target.manualId) {
            await supabase.from("manual_clients").update(patch).eq("id", target.manualId).eq("owner_id", ownerId);
          } else if (target.email) {
            await supabase.from("manual_clients").insert({ owner_id: ownerId, email: target.email, name: target.name, ...patch });
          }
        }
        // Remove source's manual row so it stops showing up in the list.
        await supabase.from("manual_clients").delete().eq("id", source.manualId).eq("owner_id", ownerId);
      }
      toast.show(lang === "nl" ? `Samengevoegd met ${target.name}` : `Merged into ${target.name}`);
      setMergeSource(null);
      setMergeSearch("");
      setSelected(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("merge error:", err);
      toast.show(lang === "nl" ? "Samenvoegen mislukt" : "Merge failed", "error");
    } finally {
      setMerging(false);
    }
  };

  // Auto duplicate hint — group clients that share a normalized phone
  // number (digits only). Same email is already dedupe'd at load time, so
  // phone is the most reliable "same person, different email" signal.
  const dupePairs = useMemo(() => {
    const byPhone = new Map();
    for (const cl of clients) {
      const digits = (cl.phone || "").replace(/\D/g, "");
      if (digits.length < 6) continue;
      if (!byPhone.has(digits)) byPhone.set(digits, []);
      byPhone.get(digits).push(cl);
    }
    const pairs = [];
    for (const group of byPhone.values()) {
      if (group.length < 2) continue;
      // Emit pairs — sort by visits DESC so the record with more history
      // becomes the suggested survivor.
      const sorted = group.slice().sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));
      for (let i = 1; i < sorted.length; i++) {
        pairs.push({ survivor: sorted[0], source: sorted[i] });
      }
    }
    return pairs;
  }, [clients]);

  const markWaitlistNotified = async (id) => {
    const { error } = await supabase.from("waitlist").update({ status: "notified", notified_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.show(lang === "nl" ? "Bijwerken mislukt" : "Update failed", "error"); return; }
    setWaitlist(list => list.map(w => w.id === id ? { ...w, status: "notified", notified_at: new Date().toISOString() } : w));
  };
  const deleteWaitlistEntry = async (id) => {
    const { error } = await supabase.from("waitlist").delete().eq("id", id);
    if (error) { toast.show(lang === "nl" ? "Verwijderen mislukt" : "Delete failed", "error"); return; }
    setWaitlist(list => list.filter(w => w.id !== id));
  };

  const onCSVPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking same file
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.show(lang === "nl" ? "Bestand te groot (max 5MB)" : "File too large (max 5MB)", "error");
      return;
    }
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const { records, skipped } = csvRowsToClients(rows);
      if (records.length === 0) {
        toast.show(lang === "nl" ? "Geen klanten in dit bestand. Check de kolomnamen (naam/email/telefoon)." : "No clients found in this file. Check column names (name/email/phone).", "error");
        return;
      }
      setImportPreview({ rows: records, skipped, fileName: file.name });
    } catch (err) {
      console.error("CSV parse error:", err);
      toast.show(lang === "nl" ? "Bestand kon niet gelezen worden" : "Could not read file", "error");
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    // Dedupe against existing manual_clients on email to avoid duplicate
    // entries when an owner imports the same export twice.
    const emails = importPreview.rows.map(r => r.email).filter(Boolean).map(e => e.toLowerCase());
    let existingEmails = new Set();
    if (emails.length > 0) {
      const { data: existing } = await supabase.from("manual_clients").select("email").eq("owner_id", ownerId).not("email", "is", null);
      existingEmails = new Set((existing || []).map(r => (r.email || "").toLowerCase()).filter(Boolean));
    }
    const toInsert = importPreview.rows
      .filter(r => !r.email || !existingEmails.has(r.email.toLowerCase()))
      .map(r => ({ owner_id: ownerId, name: r.name, email: r.email, phone: r.phone, notes: r.notes, birthday: r.birthday || null }));
    const duplicates = importPreview.rows.length - toInsert.length;
    if (toInsert.length === 0) {
      setImporting(false);
      setImportPreview(null);
      toast.show(lang === "nl" ? "Alle klanten staan al in je lijst" : "All clients are already in your list");
      return;
    }
    // Insert in chunks of 200 so we don't hit any single-request limits on
    // very large imports.
    const CHUNK = 200;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const slice = toInsert.slice(i, i + CHUNK);
      const { error } = await supabase.from("manual_clients").insert(slice);
      if (error) {
        setImporting(false);
        toast.show(lang === "nl" ? `Import mislukt na ${inserted} klanten` : `Import failed after ${inserted} clients`, "error");
        setRefreshKey(k => k + 1);
        setImportPreview(null);
        return;
      }
      inserted += slice.length;
    }
    setImporting(false);
    setImportPreview(null);
    const parts = [
      lang === "nl" ? `${inserted} klanten geïmporteerd` : `${inserted} clients imported`,
    ];
    if (duplicates > 0) parts.push(lang === "nl" ? `${duplicates} al aanwezig` : `${duplicates} already there`);
    if (importPreview.skipped > 0) parts.push(lang === "nl" ? `${importPreview.skipped} overgeslagen` : `${importPreview.skipped} skipped`);
    toast.show(parts.join(" · "));
    setRefreshKey(k => k + 1);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? clients.filter((cl) => cl.name.toLowerCase().includes(q) || (cl.email || "").toLowerCase().includes(q) || (cl.phone || "").toLowerCase().includes(q))
    : clients;

  const initials = (name) => (name || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const fmtDate = (ds) => { try { return new Date(ds + "T12:00:00").toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return ds; } };
  const fmtNext = (a) => { try { const d = new Date(a.date + "T12:00:00"); const wd = d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", { weekday: "long" }); const ds = d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short" }); return `${wd} ${ds}${a.time ? ` · ${a.time}` : ""}`; } catch { return a.date; } };

  const statusBadge = (a) => {
    if (a.status === "cancelled") return { label: lang === "nl" ? "Geannuleerd" : "Cancelled", bg: `${c.danger}1a`, color: c.danger };
    if (a.status === "no_show") return { label: "No-show", bg: `${c.danger}1a`, color: c.danger };
    if (a.status === "completed") return { label: lang === "nl" ? "Voltooid" : "Completed", bg: `${accent}1a`, color: accent };
    if (new Date(`${a.date}T${a.time || "00:00"}:00`).getTime() >= Date.now()) return { label: lang === "nl" ? "Aankomend" : "Upcoming", bg: `${accent}1a`, color: accent };
    return { label: lang === "nl" ? "Bevestigd" : "Confirmed", bg: c.inputBg, color: c.textSub };
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
        <div style={{ width: 32, height: 32, border: `2px solid ${c.border}`, borderTopColor: accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ maxWidth: 720, margin: "0 auto" }}>
      {isMobile && <PTitle sub={lang === "nl" ? "Bekijk en beheer je klanten." : "View and manage your clients."}>{lang === "nl" ? "Klanten" : "Customers"}</PTitle>}

      {/* Search + add + import */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="input-field"
          placeholder={lang === "nl" ? "Zoek klant op naam, e-mail of telefoon" : "Find customer by name, email or phone"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 0 }}
        />
        <button
          className="btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          style={{ width: "auto", padding: "0 14px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, color: accent, borderColor: `${accent}55` }}
          title={lang === "nl" ? "Importeer CSV/Excel" : "Import CSV/Excel"}
        >
          <NavIcon name="upload" size={14} color="currentColor" /> {lang === "nl" ? "Importeer" : "Import"}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv,.txt" onChange={onCSVPicked} style={{ display: "none" }} />
        <button className="btn-primary" onClick={() => setAddOpen(true)} style={{ width: "auto", padding: "0 16px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <NavIcon name="plus" size={14} color="currentColor" /> {lang === "nl" ? "Klant" : "Add"}
        </button>
      </div>

      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12 }}>
        {filtered.length} {filtered.length === 1 ? (lang === "nl" ? "klant" : "client") : (lang === "nl" ? "klanten" : "clients")}
      </div>

      {/* Waitlist banner — only shown when the feature is enabled AND there
          are waiting entries. Disabling the feature in Settings hides the
          banner immediately (existing rows are preserved but ignored). */}
      {waitlistEnabled && waitlist.filter(w => w.status === "waiting").length > 0 && (
        <div onClick={() => setShowWaitlist(true)} role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowWaitlist(true); } }}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: `${accent}12`, border: `1px solid ${accent}44`, borderRadius: 12, marginBottom: 12, cursor: "pointer" }}>
          <NavIcon name="clock" size={14} color={accent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: accent }}>
              {(() => {
                const n = waitlist.filter(w => w.status === "waiting").length;
                return lang === "nl" ? `${n} klant${n === 1 ? "" : "en"} op de wachtlijst` : `${n} client${n === 1 ? "" : "s"} on the waitlist`;
              })()}
            </div>
            <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>
              {lang === "nl" ? "Klik om te bekijken en contact op te nemen." : "Click to review and reach out."}
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </div>
      )}

      {/* Duplicate hint — only shown when phone-based matches surface. */}
      {dupePairs.length > 0 && (
        <div onClick={() => setShowDupes(true)} role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowDupes(true); } }}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: `${c.warning}12`, border: `1px solid ${c.warning}44`, borderRadius: 12, marginBottom: 12, cursor: "pointer" }}>
          <NavIcon name="alerttri" size={14} color={c.warning} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: c.warning }}>
              {lang === "nl" ? `${dupePairs.length} mogelijke duplicate${dupePairs.length === 1 ? "" : "s"} gevonden` : `${dupePairs.length} possible duplicate${dupePairs.length === 1 ? "" : "s"} found`}
            </div>
            <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>
              {lang === "nl" ? "Klanten met hetzelfde telefoonnummer — klik om samen te voegen." : "Clients sharing a phone number — click to merge."}
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.warning} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: c.textMuted, fontSize: 13 }}>
          {clients.length === 0
            ? (lang === "nl" ? "Nog geen klanten — ze verschijnen hier zodra iemand een afspraak boekt." : "No clients yet — they appear here once someone books an appointment.")
            : (lang === "nl" ? "Geen klant gevonden." : "No customer found.")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((cl) => (
            <div key={cl.key} onClick={() => setSelected(cl)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, cursor: "pointer" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${accent}1a`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{initials(cl.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cl.name}</div>
                <div style={{ fontSize: 11, color: cl.next ? accent : c.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {cl.next ? `${lang === "nl" ? "Volgende afspraak" : "Next appointment"}: ${fmtNext(cl.next)}` : (lang === "nl" ? "Geen aankomende afspraak" : "No upcoming appointment")}
                </div>
              </div>
              {cl.phone && (
                <a href={`tel:${cl.phone}`} onClick={(e) => e.stopPropagation()} aria-label={lang === "nl" ? "Bellen" : "Call"} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: accent }}>
                  <NavIcon name="phone" size={18} color="currentColor" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail modal — portal'd to document.body so an ancestor with a
          transform (the .fade-up container) doesn't scope our
          position:fixed and push the modal off-center. */}
      {selected && createPortal((
        <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }} onClick={() => setSelected(null)}>
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 24, padding: 24, maxWidth: 460, width: "100%", maxHeight: "88vh", overflowY: "auto", color: c.text }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${accent}1a`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 16, flexShrink: 0 }}>{initials(selected.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400 }}>{selected.name}</div>
              </div>
              <button
                onClick={() => { setMergeSource(selected); setMergeSearch(""); }}
                aria-label={lang === "nl" ? "Samenvoegen met andere klant" : "Merge into another client"}
                title={lang === "nl" ? "Samenvoegen" : "Merge"}
                style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /><line x1="9" y1="12" x2="15" y2="12" /><polyline points="12 9 15 12 12 15" /></svg>
              </button>
              <button
                onClick={() => openEdit(selected)}
                aria-label={lang === "nl" ? "Bewerk klant" : "Edit customer"}
                title={lang === "nl" ? "Bewerk" : "Edit"}
                style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <NavIcon name="edit" size={14} color="currentColor" />
              </button>
              <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 16, lineHeight: 1 }} onClick={() => setSelected(null)}>×</button>
            </div>

            {/* Contact */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {selected.email && (
                <a href={`mailto:${selected.email}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: c.text, textDecoration: "none" }}>
                  <NavIcon name="mail" size={15} color={accent} /> {selected.email}
                </a>
              )}
              {selected.phone && (
                <a href={`tel:${selected.phone}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: c.text, textDecoration: "none" }}>
                  <NavIcon name="phone" size={15} color={accent} /> {selected.phone}
                </a>
              )}
              {!selected.email && !selected.phone && (
                <div style={{ fontSize: 12, color: c.textMuted }}>{lang === "nl" ? "Geen contactgegevens" : "No contact details"}</div>
              )}
              {selected.notes && (
                <div style={{ fontSize: 12, color: c.textSub, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10, padding: "8px 12px", marginTop: 2 }}>{selected.notes}</div>
              )}
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
              <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: accent }}>{selected.visitCount}</div>
                <div style={{ fontSize: 9, color: c.textLabel, letterSpacing: "0.04em", textTransform: "uppercase" }}>{lang === "nl" ? "Bezoeken" : "Visits"}</div>
              </div>
              <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: accent }}>€{selected.totalSpent.toFixed(0)}</div>
                <div style={{ fontSize: 9, color: c.textLabel, letterSpacing: "0.04em", textTransform: "uppercase" }}>{lang === "nl" ? "Besteed" : "Spent"}</div>
              </div>
              <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.text, marginTop: 3 }}>{selected.lastVisit ? fmtDate(selected.lastVisit).replace(/ \d{4}$/, "") : "—"}</div>
                <div style={{ fontSize: 9, color: c.textLabel, letterSpacing: "0.04em", textTransform: "uppercase" }}>{lang === "nl" ? "Laatst" : "Last"}</div>
              </div>
            </div>

            {/* History */}
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, fontWeight: 600, marginBottom: 10 }}>{lang === "nl" ? "Geschiedenis" : "History"}</div>
            {selected.appts.length === 0 ? (
              <div style={{ fontSize: 12, color: c.textMuted, fontStyle: "italic", padding: "8px 0" }}>{lang === "nl" ? "Nog geen afspraken." : "No appointments yet."}</div>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {selected.appts.map((a, i) => {
                const b = statusBadge(a);
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${c.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: c.text, width: 52, flexShrink: 0 }}>{fmtDate(a.date).replace(/ \d{4}$/, "")}</div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.textSub }}>{a.service_name}</div>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: b.bg, color: b.color, whiteSpace: "nowrap", flexShrink: 0 }}>{b.label}</span>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>
      ), document.body)}

      {/* Add customer modal */}
      {addOpen && createPortal((
        <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }} onClick={() => !saving && setAddOpen(false)}>
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 24, padding: 24, maxWidth: 420, width: "100%", color: c.text }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, marginBottom: 4 }}>{lang === "nl" ? "Klant toevoegen" : "Add customer"}</div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 18 }}>{lang === "nl" ? "Voeg handmatig een klant toe aan je lijst." : "Manually add a client to your list."}</div>
            {(() => { const lbl = { fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4, display: "block" }; return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              <div><label style={lbl}>{lang === "nl" ? "Naam" : "Name"}</label><input className="input-field" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder={lang === "nl" ? "Voor- en achternaam" : "Full name"} style={{ width: "100%" }} /></div>
              <div><label style={lbl}>{lang === "nl" ? "Telefoon" : "Phone"}</label><input className="input-field" type="tel" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+31 6 ..." style={{ width: "100%" }} /></div>
              <div><label style={lbl}>{lang === "nl" ? "E-mail" : "Email"}</label><input className="input-field" type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} placeholder={lang === "nl" ? "klant@email.nl" : "client@email.com"} style={{ width: "100%" }} /></div>
              <div><label style={lbl}>{lang === "nl" ? "Notitie (optioneel)" : "Note (optional)"}</label><input className="input-field" value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} placeholder={lang === "nl" ? "bijv. allergie, voorkeur" : "e.g. allergy, preference"} style={{ width: "100%" }} /></div>
            </div>
            ); })()}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" disabled={saving || !addForm.name.trim()} onClick={addCustomer} style={{ flex: 1 }}>{saving ? (lang === "nl" ? "Bezig…" : "Saving…") : (lang === "nl" ? "Toevoegen" : "Add")}</button>
              <button className="btn-ghost" disabled={saving} onClick={() => setAddOpen(false)} style={{ padding: "0 18px" }}>{lang === "nl" ? "Annuleer" : "Cancel"}</button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* CSV import preview — shows what we parsed before committing, so a
          wrong column mapping or unrelated file doesn't silently inflate the
          customer list. */}
      {importPreview && createPortal((
        <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }} onClick={() => !importing && setImportPreview(null)}>
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 24, padding: 24, maxWidth: 560, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", color: c.text }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, marginBottom: 4 }}>{lang === "nl" ? "Import controleren" : "Review import"}</div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 14 }}>
              {lang === "nl"
                ? `${importPreview.rows.length} klanten gevonden in ${importPreview.fileName}`
                : `${importPreview.rows.length} clients found in ${importPreview.fileName}`}
              {importPreview.skipped > 0 && (lang === "nl" ? ` · ${importPreview.skipped} regels overgeslagen (geen naam/email)` : ` · ${importPreview.skipped} rows skipped (no name/email)`)}
            </div>
            <div style={{ flex: 1, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead style={{ position: "sticky", top: 0, background: c.bgCard, zIndex: 1 }}>
                  <tr style={{ textAlign: "left", color: c.textLabel, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 9 }}>
                    <th style={{ padding: "8px 10px" }}>{lang === "nl" ? "Naam" : "Name"}</th>
                    <th style={{ padding: "8px 10px" }}>{lang === "nl" ? "E-mail" : "Email"}</th>
                    <th style={{ padding: "8px 10px" }}>{lang === "nl" ? "Telefoon" : "Phone"}</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${c.border}` }}>
                      <td style={{ padding: "6px 10px", color: c.text }}>{r.name}</td>
                      <td style={{ padding: "6px 10px", color: c.textSub }}>{r.email || "—"}</td>
                      <td style={{ padding: "6px 10px", color: c.textSub }}>{r.phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.rows.length > 50 && (
                <div style={{ padding: "8px 10px", fontSize: 11, color: c.textMuted, textAlign: "center", borderTop: `1px solid ${c.border}` }}>
                  {lang === "nl" ? `…en nog ${importPreview.rows.length - 50} meer` : `…and ${importPreview.rows.length - 50} more`}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              {lang === "nl"
                ? "Klanten met een e-mail die al in je lijst staat worden overgeslagen (geen dubbele entries)."
                : "Clients with an email already in your list are skipped (no duplicates)."}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" disabled={importing} onClick={confirmImport} style={{ flex: 1 }}>
                {importing ? (lang === "nl" ? "Bezig…" : "Importing…") : (lang === "nl" ? `Importeer ${importPreview.rows.length} klanten` : `Import ${importPreview.rows.length} clients`)}
              </button>
              <button className="btn-ghost" disabled={importing} onClick={() => setImportPreview(null)} style={{ padding: "0 18px" }}>{lang === "nl" ? "Annuleer" : "Cancel"}</button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Merge picker — pick another client to become the survivor. All
          appointments of the source are rewritten to the survivor's email
          and the source's manual_clients row is removed. */}
      {mergeSource && createPortal((
        <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }} onClick={() => !merging && setMergeSource(null)}>
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 24, padding: 20, maxWidth: 460, width: "100%", maxHeight: "80vh", overflowY: "auto", color: c.text }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400, marginBottom: 4 }}>
              {lang === "nl" ? "Samenvoegen met…" : "Merge into…"}
            </div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 14, lineHeight: 1.5 }}>
              {lang === "nl"
                ? <>Alle afspraken van <strong>{mergeSource.name}</strong> worden verplaatst naar de gekozen klant. Notities en telefoonnummer worden overgenomen als de andere klant die nog niet heeft.</>
                : <>All appointments of <strong>{mergeSource.name}</strong> will move to the picked client. Notes and phone are carried over if the target lacks them.</>}
            </div>
            <input className="input-field" placeholder={lang === "nl" ? "Zoek klant…" : "Search client…"} value={mergeSearch} onChange={e => setMergeSearch(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {(() => {
                const q = mergeSearch.trim().toLowerCase();
                const candidates = clients
                  .filter(cl => cl.email !== mergeSource.email)
                  .filter(cl => !q || cl.name.toLowerCase().includes(q) || (cl.email || "").toLowerCase().includes(q) || (cl.phone || "").toLowerCase().includes(q))
                  .slice(0, 25);
                if (candidates.length === 0) return (
                  <div style={{ fontSize: 12, color: c.textMuted, textAlign: "center", padding: "16px 0" }}>
                    {lang === "nl" ? "Geen andere klanten gevonden" : "No other clients"}
                  </div>
                );
                return candidates.map(cl => (
                  <button key={cl.key} type="button" disabled={merging}
                    onClick={() => {
                      if (!window.confirm(lang === "nl"
                        ? `${mergeSource.name} samenvoegen met ${cl.name}? Dit kan niet worden teruggedraaid.`
                        : `Merge ${mergeSource.name} into ${cl.name}? This can't be undone.`)) return;
                      mergeClientInto(mergeSource, cl);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, cursor: merging ? "wait" : "pointer", textAlign: "left", color: c.text, opacity: merging ? 0.5 : 1 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${accent}1a`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{initials(cl.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{cl.name}</div>
                      <div style={{ fontSize: 10, color: c.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cl.email}{cl.phone ? ` · ${cl.phone}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 10, color: c.textLabel, flexShrink: 0 }}>{cl.visitCount || 0}×</div>
                  </button>
                ));
              })()}
            </div>
            <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} disabled={merging} onClick={() => setMergeSource(null)}>
              {lang === "nl" ? "Annuleer" : "Cancel"}
            </button>
          </div>
        </div>
      ), document.body)}

      {/* Duplicate list — clients grouped by matching phone. Owner picks
          which of each pair should survive; the other is merged into it. */}
      {showDupes && createPortal((
        <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }} onClick={() => setShowDupes(false)}>
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 24, padding: 20, maxWidth: 520, width: "100%", maxHeight: "82vh", overflowY: "auto", color: c.text }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400, marginBottom: 4 }}>
              {lang === "nl" ? "Mogelijke duplicates" : "Possible duplicates"}
            </div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 14, lineHeight: 1.5 }}>
              {lang === "nl"
                ? "Klanten die hetzelfde telefoonnummer delen. Kies welke record je wilt behouden — de ander wordt daarin samengevoegd."
                : "Clients sharing the same phone number. Pick which record to keep — the other gets merged in."}
            </div>
            {dupePairs.length === 0 ? (
              <div style={{ fontSize: 12, color: c.textMuted, textAlign: "center", padding: "24px 0" }}>
                {lang === "nl" ? "Geen duplicates gevonden." : "No duplicates found."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {dupePairs.map((p, i) => (
                  <div key={i} style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14, padding: 12 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, marginBottom: 8 }}>
                      {lang === "nl" ? "Telefoon: " : "Phone: "}{p.survivor.phone}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[p.survivor, p.source].map((cl, j) => (
                        <div key={j} style={{ padding: "8px 10px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{cl.name}</div>
                          <div style={{ fontSize: 10, color: c.textMuted, wordBreak: "break-word" }}>{cl.email}</div>
                          <div style={{ fontSize: 10, color: c.textLabel, marginTop: 2 }}>{cl.visitCount || 0} {lang === "nl" ? "bezoeken" : "visits"}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "8px", color: accent, borderColor: `${accent}55` }} disabled={merging}
                        onClick={() => {
                          if (!window.confirm(lang === "nl"
                            ? `${p.source.name} samenvoegen met ${p.survivor.name}?`
                            : `Merge ${p.source.name} into ${p.survivor.name}?`)) return;
                          mergeClientInto(p.source, p.survivor);
                          setShowDupes(false);
                        }}>
                        {lang === "nl" ? `Behoud ${p.survivor.name}` : `Keep ${p.survivor.name}`}
                      </button>
                      <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "8px", color: accent, borderColor: `${accent}55` }} disabled={merging}
                        onClick={() => {
                          if (!window.confirm(lang === "nl"
                            ? `${p.survivor.name} samenvoegen met ${p.source.name}?`
                            : `Merge ${p.survivor.name} into ${p.source.name}?`)) return;
                          mergeClientInto(p.survivor, p.source);
                          setShowDupes(false);
                        }}>
                        {lang === "nl" ? `Behoud ${p.source.name}` : `Keep ${p.source.name}`}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={() => setShowDupes(false)}>
              {lang === "nl" ? "Sluiten" : "Close"}
            </button>
          </div>
        </div>
      ), document.body)}

      {/* Waitlist modal — review incoming waitlist requests and reach out. */}
      {showWaitlist && createPortal((
        <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }} onClick={() => setShowWaitlist(false)}>
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 24, padding: 20, maxWidth: 560, width: "100%", maxHeight: "82vh", overflowY: "auto", color: c.text }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400, marginBottom: 4 }}>
              {lang === "nl" ? "Wachtlijst" : "Waitlist"}
            </div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 14, lineHeight: 1.5 }}>
              {lang === "nl"
                ? "Klanten die zich hebben aangemeld toen er geen tijd vrij was. Neem contact op en markeer als 'benaderd'."
                : "Clients who signed up when no slots were free. Reach out and mark them as 'contacted'."}
            </div>
            {waitlist.length === 0 ? (
              <div style={{ fontSize: 12, color: c.textMuted, textAlign: "center", padding: "24px 0" }}>
                {lang === "nl" ? "Geen wachtlijst-aanmeldingen." : "No waitlist entries."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {waitlist.map(w => (
                  <div key={w.id} style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, wordBreak: "break-word" }}>{w.client_name}</div>
                      {w.status === "notified" && (
                        <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 999, background: `${c.success || accent}22`, color: c.success || accent, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
                          {lang === "nl" ? "Benaderd" : "Contacted"}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4, wordBreak: "break-word" }}>{w.client_email}{w.client_phone ? ` • ${w.client_phone}` : ""}</div>
                    <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 4 }}>
                      {lang === "nl" ? "Voorkeursdatum: " : "Preferred date: "}<b>{w.date}</b>
                    </div>
                    {w.notes && <div style={{ fontSize: 11, color: c.textSub, marginBottom: 4, fontStyle: "italic" }}>&ldquo;{w.notes}&rdquo;</div>}
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      <a href={`mailto:${w.client_email}?subject=${encodeURIComponent(lang === "nl" ? "Er is een plek vrij bij ons" : "A spot has opened up")}`} className="btn-ghost" style={{ flex: "1 1 auto", fontSize: 10, padding: "8px", color: accent, borderColor: `${accent}55`, textAlign: "center", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <NavIcon name="mail" size={12} color="currentColor" /> {lang === "nl" ? "E-mail" : "Email"}
                      </a>
                      {w.client_phone && (
                        <a href={`https://wa.me/${w.client_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="btn-ghost" style={{ flex: "1 1 auto", fontSize: 10, padding: "8px", color: accent, borderColor: `${accent}55`, textAlign: "center", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          WhatsApp
                        </a>
                      )}
                      {w.status === "waiting" && (
                        <button className="btn-ghost" style={{ flex: "1 1 auto", fontSize: 10, padding: "8px", color: accent, borderColor: `${accent}55` }} onClick={() => markWaitlistNotified(w.id)}>
                          {lang === "nl" ? "Markeer benaderd" : "Mark contacted"}
                        </button>
                      )}
                      <button className="btn-ghost" style={{ flex: "1 1 auto", fontSize: 10, padding: "8px", color: c.danger, borderColor: `${c.danger}55` }}
                        onClick={() => {
                          if (!window.confirm(lang === "nl" ? "Verwijder deze aanmelding?" : "Delete this entry?")) return;
                          deleteWaitlistEntry(w.id);
                        }}>
                        {lang === "nl" ? "Verwijder" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={() => setShowWaitlist(false)}>
              {lang === "nl" ? "Sluiten" : "Close"}
            </button>
          </div>
        </div>
      ), document.body)}

      {/* Edit client modal — owner can correct a name, email or phone, or
          delete the client entirely. Pure-manual clients are hard-deleted;
          clients with appointment history are soft-hidden via the manual_clients
          `hidden` flag so their appointment history is preserved. */}
      {editing && createPortal((
        <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }} onClick={() => !editSaving && !deleting && setEditing(null)}>
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 24, padding: 24, maxWidth: 420, width: "100%", color: c.text }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, marginBottom: 4 }}>{lang === "nl" ? "Klant bewerken" : "Edit customer"}</div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 18 }}>
              {(editing.appts || []).length > 0
                ? (lang === "nl" ? "Wijzigingen overschrijven de gegevens uit de afspraakhistorie." : "Changes override the data from appointment history.")
                : (lang === "nl" ? "Pas de gegevens van deze klant aan." : "Update this customer's details.")}
            </div>
            {(() => { const lbl = { fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4, display: "block" }; return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              <div><label style={lbl}>{lang === "nl" ? "Naam" : "Name"}</label><input className="input-field" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder={lang === "nl" ? "Voor- en achternaam" : "Full name"} style={{ width: "100%" }} autoFocus /></div>
              <div><label style={lbl}>{lang === "nl" ? "Telefoon" : "Phone"}</label><input className="input-field" type="tel" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+31 6 ..." style={{ width: "100%" }} /></div>
              <div><label style={lbl}>{lang === "nl" ? "E-mail" : "Email"}</label><input className="input-field" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder={lang === "nl" ? "klant@email.nl" : "client@email.com"} style={{ width: "100%" }} /></div>
              <div><label style={lbl}>{lang === "nl" ? "Notitie" : "Note"}</label><input className="input-field" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} placeholder={lang === "nl" ? "bijv. allergie, voorkeur" : "e.g. allergy, preference"} style={{ width: "100%" }} /></div>
              <div><label style={lbl}>{lang === "nl" ? "Verjaardag (optioneel)" : "Birthday (optional)"}</label><input className="input-field" type="date" value={editForm.birthday || ""} onChange={(e) => setEditForm((f) => ({ ...f, birthday: e.target.value }))} style={{ width: "100%" }} /></div>
            </div>
            ); })()}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" disabled={editSaving || deleting || !editForm.name.trim()} onClick={saveEdit} style={{ flex: 1 }}>{editSaving ? (lang === "nl" ? "Bezig…" : "Saving…") : (lang === "nl" ? "Opslaan" : "Save")}</button>
              <button className="btn-ghost" disabled={editSaving || deleting} onClick={() => setEditing(null)} style={{ padding: "0 18px" }}>{lang === "nl" ? "Annuleer" : "Cancel"}</button>
            </div>
            <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 18, paddingTop: 14 }}>
              <button
                disabled={editSaving || deleting}
                onClick={deleteClient}
                style={{ width: "100%", padding: "10px 16px", borderRadius: 12, border: `1px solid ${c.danger}33`, background: `${c.danger}10`, color: c.danger, cursor: editSaving || deleting ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, opacity: editSaving || deleting ? 0.6 : 1 }}
              >
                {deleting ? (lang === "nl" ? "Verwijderen…" : "Deleting…") : (lang === "nl" ? "Klant verwijderen" : "Delete customer")}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

// ─── OWNER DASHBOARD ─────────────────────────────────────────
function OwnerApp({ user, onLogout, lang, setLang, salons = {}, onSalonUpdate }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const DAY = lang === "nl" ? DAY_NL : DAY_EN;

  const [view, setView] = useState("dashboard");
  const [calDate, setCalDate] = useState(fmt(getToday()));
  const [agendaStaff, setAgendaStaff] = useState(null); // null = all, or staff member id
  const [calViewMode, setCalViewMode] = useState("week"); // "week" or "month"
  const [calWeekOffset, setCalWeekOffset] = useState(0); // offset in weeks from current
  const [salonData, setSalonData] = useState(() => {
    return { 
      id: user.slug, name: user.name, city: user.city || "Nederland", accent: ACCENT, 
      services: [], appointments: [], business_hours: DEFAULT_HOURS,
      booking_policy: "", booking_policy_en: "", salon_phone: "", salon_instagram: "", salon_email: "", phone_required: false, logo_url: "", cover_image_url: "", discount_codes: [],
      btw_rate: 21,
      locations: [], day_overrides: {}, account_type: user.account_type || "joint",
      min_advance_hours: 0, max_advance_days: 60,
      reminder_hours: 24,
      rebook_nudge_days: 28,
      google_calendar_connected: false,
      google_place_id: "",
      auto_block_no_show_threshold: 0,
      client_no_shows: {},
      referral_code: "",
      referral_credit_months: 0,
      referral_count: 0
    };
  });
  const [saved, setSaved] = useState(false);

  // iOS Safari: URL bar overlaps content on initial load but collapses once user interacts.
  // We can't force collapse from JS, but we can DETECT whether the URL bar is expanded by
  // comparing visualViewport.height to the device screen height. Large gap = expanded =
  // apply a buffer so the header sits below the URL bar. When the user taps/scrolls and
  // the URL bar collapses, visualViewport.resize fires and we re-measure → buffer goes to 0.
  const toast = useToast();
  const { confirmState, confirm: showConfirm, handleYes: confirmYes, handleNo: confirmNo } = useConfirm();
  const [newSvc, setNewSvc] = useState({ name_nl: "", name_en: "", price: "", duration: "60", category_id: "" });
  const [svcError, setSvcError] = useState("");
  const [gallery, setGallery] = useState(null);
  const [copied, setCopied] = useState(false);
  const [hasSharedLink, setHasSharedLink] = useState(() => {
    try { return !!localStorage.getItem(`vellu_shared_${salonData.id}`); } catch { return false; }
  });
  const [newDiscount, setNewDiscount] = useState({ code: "", amount: "", type: "percent", active: true });
  // Edit states
  const [editingService, setEditingService] = useState(null);
  const [expandedServiceId, setExpandedServiceId] = useState(null);
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  // Services filter + group collapse. A Set of category ids (the string
  // "__uncat" for services without a category) that are currently hidden.
  const [serviceSearch, setServiceSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [editingLocation, setEditingLocation] = useState(null);
  const [editLocForm, setEditLocForm] = useState({ name: "", address: "", city: "", phone: "" });
  const [editSvcForm, setEditSvcForm] = useState({ name_nl: "", name_en: "", price: "", duration: "", category_id: "" });
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editCategoryForm, setEditCategoryForm] = useState({ name_nl: "", name_en: "" });
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategoryForm, setNewCategoryForm] = useState({ name_nl: "", name_en: "" });
  const [editingStaff, setEditingStaff] = useState(null);
  const [editStaffForm, setEditStaffForm] = useState({ name: "", role: "", bio: "", working_hours: {}, service_ids: [] });
  // Manual appointment
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("all"); // "all" | "sent" | "unsent" | "hidden"
  const [invoicesExpanded, setInvoicesExpanded] = useState(false);
  const [analyticsReviewsExpanded, setAnalyticsReviewsExpanded] = useState(false);
  // Multi-service structure: services is an array of {id, service_id,
  // variant_id, staff_id}. The owner can add or remove rows to build a
  // combined booking (nails with X + toes with Y, one client, one row).
  const [addApptForm, setAddApptForm] = useState({ services: [{ id: `s_${Date.now()}`, service_id: "", variant_id: "", extra_ids: [], staff_id: "" }], date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "", client_allergies: "" });
  const [addApptLoading, setAddApptLoading] = useState(false);
  const [addApptDone, setAddApptDone] = useState(false);
  const [clientList, setClientList] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [clientMode, setClientMode] = useState("existing"); // "existing" or "new"
  // Exception/blocked days
  const [newException, setNewException] = useState({ date: "", open: "09:00", close: "17:30", staff_id: "" });
  const [newBlocked, setNewBlocked] = useState({ from: "", to: "", reason: "", mode: "day", time_start: "09:00", time_end: "17:30" });
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [showBlockedForm, setShowBlockedForm] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);
  const [editVariantForm, setEditVariantForm] = useState({ name_nl: "", name_en: "", price: "", duration: "", description_nl: "", description_en: "" });
  const [editingExtra, setEditingExtra] = useState(null);
  const [editExtraForm, setEditExtraForm] = useState({ name_nl: "", name_en: "", price: "" });
  const [settingsTab, setSettingsTab] = useState("salon");
  const [accountTypeInfo, setAccountTypeInfo] = useState(null); // null | "joint" | "team"
  // Account section state (Overig tab). Keep everything local so a dirty
  // change-email/change-password form never taints salonData or the main
  // "Opslaan" flow at the bottom of settings.
  const [accountForm, setAccountForm] = useState({ newEmail: "", currentPasswordForEmail: "", currentPasswordForPw: "", newPassword: "", newPasswordConfirm: "" });
  const [accountShowPw, setAccountShowPw] = useState({ currentEmail: false, currentPw: false, newPw: false, confirmPw: false });
  const [accountSaving, setAccountSaving] = useState("");
  // Billing tab state — invoices loaded lazily when the tab is opened. We
  // also keep the latest profile billing snapshot here so the tab reflects
  // mid-session changes (e.g. webhook fires while owner is on the page).
  const [billingInvoices, setBillingInvoices] = useState([]);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [billingProfile, setBillingProfile] = useState(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [upgradeConfirm, setUpgradeConfirm] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);
  const [staffInvite, setStaffInvite] = useState({}); // { [staffId]: { email, password } }
  const [tempColor, setTempColor] = useState(null); // local color for smooth picker
  const colorDebounceRef = useRef(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load salon data from Supabase
  useEffect(() => {
    const load = async () => {
      try {
      const { data, error: profileError } = await supabase.from("profiles").select("*, services(*, service_variants(*), service_extras(*), service_photos(*))").eq("slug", user.slug).single();
      if (profileError) { console.error("Profile load error:", profileError); setDataLoaded(true); return; }
      if (data) {
        // Load all related data in parallel for faster dashboard load
        const [
          { data: appts },
          { data: reviews },
          { data: staffData },
          { data: catData },
          { data: locData },
          { data: noShowRows },
          { count: referralCount },
          { data: manualClients },
          { data: staffBlocksData }
        ] = await Promise.all([
          supabase.from("appointments").select("*").eq("owner_id", data.id).gte("date", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]).order("date", { ascending: false }),
          supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false }),
          supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).order("position"),
          supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position"),
          supabase.from("locations").select("*").eq("owner_id", data.id).order("position"),
          supabase.from("client_no_shows").select("client_email, no_show_count, blocked").eq("owner_id", data.id),
          // How many other salons signed up using this owner's referral code.
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("referred_by", data.id),
          // Manual client notes — used by the agenda card to surface a
          // client-specific note (e.g. "prefers less pressure", "always late")
          // right at the point of service, so staff don't have to open a
          // separate client detail page mid-appointment.
          supabase.from("manual_clients").select("email, notes").eq("owner_id", data.id).not("notes", "is", null),
          // Staff-authored blocks (staff_day_overrides). Owner sees them in
          // the agenda so they know why a stylist isn't bookable, and can
          // remove one on their behalf if it was a mistake.
          supabase.from("staff_day_overrides").select("*").eq("owner_id", data.id).gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
        ]);
        // Shape client_no_shows as a lookup by email so renderApptCard is O(1).
        const clientNoShowsMap = {};
        for (const r of noShowRows || []) {
          clientNoShowsMap[r.client_email] = { no_show_count: r.no_show_count, blocked: r.blocked };
        }
        // Same idea for client notes — email-keyed lookup, lowercased so the
        // match is case-insensitive with appointment.client_email.
        const clientNotesMap = {};
        for (const m of manualClients || []) {
          if (m.email && m.notes) clientNotesMap[m.email.toLowerCase()] = m.notes;
        }
        setSalonData(prev => ({
          ...prev,
          owner_id: data.id,
          name: data.business_name || prev.name,
          city: data.city || prev.city,
          country_code: data.country_code || "NL",
          accent: data.accent_color || prev.accent,
          address: data.address || "",
          kvk_number: data.kvk_number || "",
          btw_id: data.btw_id || "",
          btw_rate: data.btw_rate ?? 21,
          iban: data.iban || "",
          invoice_prefix: data.invoice_prefix || "INV",
          next_invoice_number: data.next_invoice_number || 1,
          invoice_profiles: Array.isArray(data.invoice_profiles) ? data.invoice_profiles : [],
          business_hours: data.business_hours || DEFAULT_HOURS,
          booking_policy: data.booking_policy || "",
          booking_policy_en: data.booking_policy_en || "",
          salon_phone: data.salon_phone || "",
          salon_instagram: data.salon_instagram || "",
          salon_email: data.salon_email || "",
          whatsapp_number: data.whatsapp_number || "",
          phone_required: data.phone_required || false,
          waitlist_enabled: data.waitlist_enabled !== false,
          birthday_email_enabled: data.birthday_email_enabled || false,
          birthday_email_discount_pct: data.birthday_email_discount_pct ?? null,
          birthday_email_code_prefix: data.birthday_email_code_prefix || "",
          break_minutes: data.break_minutes || 0,
          logo_url: data.logo_url || "",
          cover_image_url: data.cover_image_url || "",
          cover_focal_y: data.cover_focal_y ?? 50,
          discount_codes: data.discount_codes || [],
          day_overrides: data.day_overrides || {},
          staff_blocks: staffBlocksData || [],
          account_type: data.account_type || "joint",
          show_owner_on_booking: data.show_owner_on_booking || false,
          min_advance_hours: data.min_advance_hours || 0,
          max_advance_days: data.max_advance_days || 60,
          reminder_hours: data.reminder_hours ?? 24,
          rebook_nudge_days: data.rebook_nudge_days ?? 28,
          google_calendar_connected: data.google_calendar_connected || false,
          google_place_id: data.google_place_id || "",
          auto_block_no_show_threshold: data.auto_block_no_show_threshold ?? 0,
          client_no_shows: clientNoShowsMap,
          client_notes: clientNotesMap,
          referral_code: data.referral_code || "",
          referral_credit_months: data.referral_credit_months || 0,
          referral_count: referralCount || 0,
          plan: data.plan || null,
          plan_expires_at: data.plan_expires_at || null,
          services: (data.services || [])
            .slice()
            // Sort by position first (drag-drop order); fall back to created_at
            // for salons that predate the position column (rows with position=null).
            .sort((a, b) => {
              const pa = a.position ?? 9999;
              const pb = b.position ?? 9999;
              if (pa !== pb) return pa - pb;
              return (a.created_at || "") < (b.created_at || "") ? -1 : 1;
            })
            .map(s => ({
              ...s,
              name_nl: s.name_nl || s.name || "",
              name_en: s.name_en || s.name || "",
              photos: (s.service_photos || []).map(p => ({ id: p.id, url: p.storage_path, focal_x: p.focal_x ?? 50, focal_y: p.focal_y ?? 50 })),
              variants: (s.service_variants || []).sort((a,b) => (a.position||0) - (b.position||0)),
              extras: s.service_extras || []
            })),
          appointments: appts || [],
          reviews: reviews || [],
          staff: (staffData || []).map(s => ({ ...s, service_ids: (s.staff_services || []).map(ss => ss.service_id), working_hours: s.working_hours || null })),
          categories: catData || [],
          locations: locData || []
        }));
        // Show onboarding if no services exist yet
        if ((data.services || []).length === 0) setShowOnboarding(true);
      }
      setDataLoaded(true);
      } catch (e) {
        console.error("Dashboard load error:", e);
        setDataLoaded(true);
      }
    };
    load();
  }, [user.slug]);

  // Keep a ref to lang so the real-time callback always has the current value
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  // Real-time subscription for new/updated appointments
  useEffect(() => {
    if (!salonData.owner_id) return;
    const channel = supabase
      .channel("owner-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `owner_id=eq.${salonData.owner_id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          update(d => { d.appointments = [payload.new, ...d.appointments]; return d; });
          toast.show(langRef.current === "nl" ? `Nieuwe boeking: ${payload.new.client_name}` : `New booking: ${payload.new.client_name}`);
        } else if (payload.eventType === "UPDATE") {
          // Merge the incoming row into the existing local copy instead of replacing
          // wholesale — this preserves any local-only optimistic fields and avoids a
          // flicker back to "confirmed" when the server echoes our mark-complete/no-show.
          update(d => { d.appointments = d.appointments.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a); return d; });
        } else if (payload.eventType === "DELETE") {
          update(d => { d.appointments = d.appointments.filter(a => a.id !== payload.old.id); return d; });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [salonData.owner_id]);

  const accent = salonData.accent;
  const appts = salonData.appointments;
  const activeAppts = appts.filter(a => a.status !== "cancelled" && a.status !== "no_show");
  const allVisibleAppts = appts.filter(a => a.status !== "cancelled");
  const completedAppts = appts.filter(a => a.status === "completed");
  const todayAppts = activeAppts.filter(a => a.date === fmt(getToday()));
  // A multi-service booking may have different staff per service. staff_id
  // only holds the "primary" (first service's) staff, so filtering on that
  // alone drops any appointment where the selected staff only handled a
  // non-primary service. staff_assignments captures the full map.
  //
  // When a staff filter is active we also SPLIT each matched appointment into
  // per-service sub-slots so the agenda shows this staff's own start-time and
  // duration (e.g. nails 10:00–11:00 with Esther, toes 11:00–12:20 with Lady).
  // Sub-slots share the parent id — key with `${id}::${offset}` when rendering.
  const filteredAgendaAppts = agendaStaff
    ? allVisibleAppts.flatMap(a => {
        const breakdown = Array.isArray(a.service_breakdown) ? a.service_breakdown : [];
        const myParts = breakdown.filter(p => p.staff_id === agendaStaff);
        // No breakdown or no match by staff_id → fall back to legacy behaviour:
        // include the whole appointment if the primary staff or any entry in
        // staff_assignments matches.
        if (myParts.length === 0) {
          if (a.staff_id === agendaStaff || Object.values(a.staff_assignments || {}).includes(agendaStaff)) return [a];
          return [];
        }
        // Add offset_min to the parent time so each sub-slot starts when the
        // stylist actually begins their service.
        const [h, m] = (a.time || "0:0").split(":").map(Number);
        const baseMin = h * 60 + (m || 0);
        return myParts.map(p => {
          const startMin = baseMin + (p.offset_min || 0);
          const pad = n => String(n).padStart(2, "0");
          return {
            ...a,
            time: `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`,
            service_duration: p.duration || a.service_duration,
            service_name: p.label || a.service_name,
            _slotKey: `${a.id}::${p.offset_min || 0}`,
          };
        });
      })
    : allVisibleAppts;
  const calAppts = filteredAgendaAppts.filter(a => a.date === calDate);
  const totalEarnings = completedAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);

  const update = (fn) => setSalonData(d => {
    const updated = fn({...d});
    if (onSalonUpdate) onSalonUpdate(updated);
    return updated;
  });

  // Handle Google Calendar OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      update(d => { d.google_calendar_connected = true; return d; });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [dataLoaded]);

  // Load client list when add appointment modal opens
  useEffect(() => {
    if (showAddAppt && salonData.owner_id) {
      (async () => {
        // Only load clients who have had appointments at THIS salon
        const uniqueClients = {};
        (salonData.appointments || []).forEach(a => {
          if (a.client_email && !uniqueClients[a.client_email]) {
            uniqueClients[a.client_email] = {
              id: a.client_id,
              first_name: (a.client_name || "").split(" ")[0],
              last_name: (a.client_name || "").split(" ").slice(1).join(" "),
              email: a.client_email,
              phone: a.client_phone || "",
              allergies: a.client_allergies || ""
            };
          }
        });
        // Pull full client records for these emails. NOTE: clients.email is currently a
        // globally-unique column — the data model shares a single client row across
        // salons. A proper fix requires a (owner_id, email) unique constraint + a
        // migration to split shared rows. Until then, RLS is the only barrier here.
        const emails = Object.keys(uniqueClients);
        if (emails.length > 0) {
          const { data: fullClients } = await supabase.from("clients").select("id, first_name, last_name, email, phone, allergies").in("email", emails);
          if (fullClients) {
            fullClients.forEach(cl => {
              uniqueClients[cl.email] = { ...uniqueClients[cl.email], ...cl };
            });
          }
        }
        setClientList(Object.values(uniqueClients).sort((a, b) => (a.first_name || "").localeCompare(b.first_name || "")));
      })();
    }
  }, [showAddAppt, salonData.owner_id]);
  const [processingApptId, setProcessingApptId] = useState(null);
  const [invoicePickerFor, setInvoicePickerFor] = useState(null); // appointment id when the extra-profile picker is open
  // Reschedule modal state — holds the appointment being moved, or null.
  const [rescheduling, setRescheduling] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  // Inline edit-appt modal: owner override for date, time, price, duration —
  // skips the smart-slot validation that Verplaats uses, since the owner is
  // intentionally writing values that may not fit normal availability.
  const [editingAppt, setEditingAppt] = useState(null);
  // Quick-block modal opened from the agenda toolbar. Same shape as the
  // Planning tab's blocker, but writes to profile.day_overrides straight
  // away so the owner doesn't have to remember to hit "Opslaan".
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({ mode: "time", from: "", to: "", time_start: "09:00", time_end: "17:30", reason: "", staff_id: "", staff_name: "" });
  const [blockSaving, setBlockSaving] = useState(false);
  const [editApptForm, setEditApptForm] = useState({ date: "", time: "", price: "", duration: "" });
  const [editApptSaving, setEditApptSaving] = useState(false);

  // Slug editor state. The pending slug is edited locally; availability
  // check runs debounced; save is a single atomic UPDATE that also handles
  // the conflict case. Kept separate from the main `update()` flow because
  // slug changes need special care (uniqueness, reserved words, URL side
  // effects).
  const [slugDraft, setSlugDraft] = useState("");
  const [slugStatus, setSlugStatus] = useState({ state: "idle", message: "" }); // idle | checking | available | taken | invalid | reserved
  const [slugSaving, setSlugSaving] = useState(false);
  const slugCheckRef = useRef(null);

  // Paths that must never become a salon slug — they'd shadow real app
  // routes. Keep in sync with App.jsx <Routes>.
  const RESERVED_SLUGS = new Set([
    "owner", "staff", "admin", "cancel", "privacy", "terms", "dpa",
    "voorwaarden", "contact", "api", "assets", "public", "static",
    "auth", "login", "signup", "signin", "logout", "reset", "review",
    "_", "app", "www",
  ]);

  // dnd-kit sensors — pointer (mouse + touch) with a small activation distance
  // so accidental clicks don't start a drag, plus keyboard support for
  // accessibility. Shared across all sortable lists in the owner dashboard.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Seed the slug draft from the current slug once data has loaded.
  useEffect(() => {
    if (salonData.id && !slugDraft) setSlugDraft(salonData.id);
  }, [salonData.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Billing tab: load invoice history + freshest profile snapshot when the
  // tab is opened. Cheap to re-run when the user clicks back to it. Skipped
  // entirely until they ever open the tab so we don't fetch invoices on
  // every dashboard visit.
  useEffect(() => {
    if (settingsTab !== "billing") return;
    let cancelled = false;
    (async () => {
      const [{ data: invs }, { data: prof }] = await Promise.all([
        supabase
          .from("payment_invoices")
          .select("id, invoice_number, issued_at, period_start, period_end, plan, billing_interval, total_eur, vat_amount, amount_excl_vat, pdf_url")
          .eq("owner_id", user.id)
          .order("issued_at", { ascending: false })
          .limit(50),
        supabase
          .from("profiles")
          .select("plan, billing_interval, subscription_status, trial_ends_at, plan_expires_at, current_period_start, cancel_at_period_end, mollie_subscription_id")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setBillingInvoices(invs || []);
      setBillingProfile(prof || null);
      setBillingLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [settingsTab, user.id]);

  // Live availability check — debounced 450ms after last keystroke.
  useEffect(() => {
    if (!slugDraft) { setSlugStatus({ state: "idle", message: "" }); return; }
    if (slugDraft === salonData.id) { setSlugStatus({ state: "idle", message: "" }); return; }

    // Client-side validation first (fast fail)
    const errMsg = (() => {
      if (!/^[a-z0-9-]+$/.test(slugDraft)) return lang === "nl"
        ? "Alleen kleine letters, cijfers en streepjes"
        : "Lowercase letters, numbers, and hyphens only";
      if (slugDraft.length < 3) return lang === "nl" ? "Minimaal 3 tekens" : "At least 3 characters";
      if (slugDraft.length > 40) return lang === "nl" ? "Maximaal 40 tekens" : "At most 40 characters";
      if (slugDraft.startsWith("-") || slugDraft.endsWith("-")) return lang === "nl"
        ? "Kan niet beginnen of eindigen met streepje"
        : "Cannot start or end with a hyphen";
      if (slugDraft.includes("--")) return lang === "nl" ? "Geen dubbele streepjes" : "No double hyphens";
      if (RESERVED_SLUGS.has(slugDraft)) return lang === "nl"
        ? "Deze naam is gereserveerd door Vellu"
        : "This name is reserved by Vellu";
      return null;
    })();
    if (errMsg) { setSlugStatus({ state: "invalid", message: errMsg }); return; }

    setSlugStatus({ state: "checking", message: lang === "nl" ? "Beschikbaarheid controleren…" : "Checking availability…" });
    if (slugCheckRef.current) clearTimeout(slugCheckRef.current);
    slugCheckRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles").select("id").eq("slug", slugDraft).maybeSingle();
      if (error) {
        setSlugStatus({ state: "invalid", message: lang === "nl" ? "Kon niet controleren, probeer opnieuw" : "Couldn't check, try again" });
        return;
      }
      if (data) {
        setSlugStatus({ state: "taken", message: lang === "nl" ? "Al in gebruik" : "Already taken" });
      } else {
        setSlugStatus({ state: "available", message: lang === "nl" ? "Beschikbaar" : "Available" });
      }
    }, 450);

    return () => { if (slugCheckRef.current) clearTimeout(slugCheckRef.current); };
  }, [slugDraft, salonData.id, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSlug = async () => {
    if (slugStatus.state !== "available") return;
    setSlugSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ slug: slugDraft })
        .eq("id", salonData.owner_id);
      if (error) {
        // Unique constraint: someone else grabbed it between check and save.
        if (error.code === "23505") {
          setSlugStatus({ state: "taken", message: lang === "nl" ? "Iemand anders was net sneller" : "Just taken by someone else" });
        } else {
          toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
        }
        return;
      }
      // Update React state so the UI, copy-link, and data-reload key flip to the new slug.
      update(d => { d.id = slugDraft; return d; });
      // Rewrite the URL + reload so data loads under the new slug. Full reload
      // is cleanest — avoids chasing cached query keys that reference the old slug.
      setTimeout(() => { window.location.href = `/owner`; }, 500);
      toast.show(lang === "nl" ? "Salon-link bijgewerkt" : "Salon link updated");
    } finally { setSlugSaving(false); }
  };

  // Switch the owner from Starter to Professional (or vice versa) without
  // bouncing through Mollie's hosted checkout. The change-plan edge function
  // cancels the current Mollie subscription and creates a new one with the
  // new amount, scheduled to start on the existing plan_expires_at — so the
  // owner isn't double-charged and the new tier unlocks immediately.
  const handleChangePlan = async (newPlan) => {
    if (changingPlan) return;
    setChangingPlan(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-plan", {
        body: { plan: newPlan, billing_interval: salonData.billing_interval || "monthly" },
      });
      if (error || !data?.success) {
        const code = data?.error || error?.message || "unknown";
        toast.show(
          lang === "nl"
            ? `Wisselen mislukt: ${code}`
            : `Plan change failed: ${code}`,
          "error",
        );
        return;
      }
      update(d => { d.plan = newPlan; return d; });
      setUpgradeConfirm(false);
      toast.show(
        lang === "nl"
          ? "Abonnement gewijzigd. Nieuwe prijs gaat in op de volgende renewal."
          : "Plan changed. New price applies from the next renewal.",
      );
    } catch (e) {
      console.error("change-plan error:", e);
      toast.show(t.somethingWrong, "error");
    } finally {
      setChangingPlan(false);
    }
  };

  // Drop handler for service reordering. Moves the item locally, then writes
  // the new `position` values to all affected rows in the DB. We write ALL
  // positions (not just the moved row) because a single move can cascade —
  // e.g. moving item 5 to position 2 bumps old 2/3/4 down by one.
  const handleServiceDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = salonData.services.findIndex(s => s.id === active.id);
    const newIdx = salonData.services.findIndex(s => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(salonData.services, oldIdx, newIdx);
    // Optimistic local update
    update(d => { d.services = reordered; return d; });

    // Persist. Parallel updates — one PATCH per service. Fine for under ~100
    // services; if a salon ever has more we can batch into a single RPC.
    try {
      await Promise.all(reordered.map((s, idx) =>
        supabase.from("services")
          .update({ position: idx })
          .eq("id", s.id)
          .eq("owner_id", salonData.owner_id)
      ));
    } catch (e) {
      console.error("Reorder save failed:", e);
      toast.show(lang === "nl" ? "Volgorde opslaan mislukt" : "Could not save order", "error");
    }
  };
  const markComplete = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      const { error } = await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
      if (error) { toast.show(t.errorCompleting, "error"); return; }
      update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, status:"completed"} : a); return d; });
      toast.show(t.apptCompleted);
    } finally { setProcessingApptId(null); }
  };
  const markNoShow = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      const { error } = await supabase.from("appointments").update({ status: "no_show" }).eq("id", id);
      if (error) return;
      const appt = salonData.appointments.find(a => a.id === id);

      // Per-salon no-show tracking: record_no_show upserts a client_no_shows row
      // scoped to this owner (separate from clients.no_show_count which is global
      // across all salons). If the count hits the owner's threshold, the RPC also
      // sets blocked=true, which book-appointment checks on future bookings.
      if (appt?.client_email) {
        const { data: result } = await supabase.rpc("record_no_show", {
          p_owner_id: salonData.owner_id,
          p_client_email: appt.client_email,
        });
        const row = Array.isArray(result) ? result[0] : result;
        // Refresh local client_no_shows map so the UI immediately shows the new
        // count and the "GEBLOKKEERD" badge if the threshold just tripped.
        if (row) {
          update(d => {
            if (!d.client_no_shows) d.client_no_shows = {};
            d.client_no_shows[appt.client_email.toLowerCase()] = {
              no_show_count: row.no_show_count,
              blocked: row.blocked,
            };
            return d;
          });
          if (row.blocked) {
            toast.show(lang === "nl"
              ? `${appt.client_name} is geblokkeerd (${row.no_show_count} no-shows)`
              : `${appt.client_name} is blocked (${row.no_show_count} no-shows)`, "error");
          }
        }
      }

      // Legacy global counter — kept for backward compatibility with the analytics
      // stat card. Not used for blocking decisions anymore.
      if (appt?.client_id) {
        const { error: rpcErr } = await supabase.rpc("increment_no_show_count", { client_id_param: appt.client_id });
        if (rpcErr) {
          const { data: client } = await supabase.from("clients").select("no_show_count").eq("id", appt.client_id).single();
          if (client) await supabase.from("clients").update({ no_show_count: (client.no_show_count || 0) + 1 }).eq("id", appt.client_id);
        }
      }

      update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, status:"no_show"} : a); return d; });
    } finally { setProcessingApptId(null); }
  };

  // Hard-delete an appointment. Used by the trash button on the appt card.
  // Warning copy adapts to the appointment's state so the owner isn't
  // surprised when removing a completed/invoiced one (those carry an invoice
  // number that gets a gap in the sequence — usually fine, accountants accept
  // it, but worth flagging).
  const deleteAppt = async (a) => {
    if (processingApptId) return;
    const isCompleted = a.status === "completed";
    const baseMsg = lang === "nl"
      ? "Afspraak definitief verwijderen?"
      : "Permanently delete this appointment?";
    const extra = isCompleted
      ? (lang === "nl"
          ? " De afspraak telt dan niet meer mee voor je omzet of klanthistorie."
          : " It will no longer count toward your revenue or client history.")
      : "";
    if (!(await showConfirm(baseMsg + extra))) return;
    setProcessingApptId(a.id);
    try {
      // Best-effort: drop the cancellation token first (FK guard would otherwise
      // block the appointment delete). 404 from the token row is fine.
      await supabase.from("cancellation_tokens").delete().eq("appointment_id", a.id);
      const { error } = await supabase.from("appointments").delete().eq("id", a.id);
      if (error) {
        toast.show(lang === "nl" ? "Verwijderen mislukt" : "Delete failed", "error");
        return;
      }
      update(d => { d.appointments = d.appointments.filter(x => x.id !== a.id); return d; });
      toast.show(lang === "nl" ? "Afspraak verwijderd" : "Appointment deleted");
    } finally { setProcessingApptId(null); }
  };

  // Open the inline edit modal for an existing appointment. Pre-fills with
  // the current row's date/time/price/duration so the owner can override any
  // subset without re-typing the rest.
  const openEditAppt = (a) => {
    setEditingAppt(a);
    setEditApptForm({
      date: a.date || "",
      time: (a.time || "").slice(0, 5),
      price: a.service_price != null ? String(a.service_price) : "",
      duration: a.service_duration != null ? String(a.service_duration) : "",
    });
  };

  // Open the quick-block modal from the agenda. Prefills the "from" date to
  // whichever day is currently in focus in the calendar so a single tap on
  // a day + this button gets the owner most of the way there.
  const openBlockModal = () => {
    const seed = calDate || fmt(getToday());
    setBlockForm({ mode: "time", from: seed, to: "", time_start: "09:00", time_end: "17:30", reason: "", staff_id: "", staff_name: "" });
    setBlockModalOpen(true);
  };

  const saveBlock = async () => {
    if (blockSaving) return;
    const from = blockForm.from;
    if (!from) { toast.show(lang === "nl" ? "Datum is verplicht" : "Date is required", "error"); return; }
    // Time-slot validation: end must be after start.
    if (blockForm.mode === "time" && !(blockForm.time_end > blockForm.time_start)) {
      toast.show(lang === "nl" ? "Eindtijd moet ná starttijd zijn" : "End time must be after start time", "error");
      return;
    }
    setBlockSaving(true);
    // Denormalise staff name so the block card can show it without a
    // separate lookup, and future-proof against a rename (we snapshot).
    const staffId = blockForm.staff_id || null;
    const staffName = staffId
      ? ((salonData.staff || []).find(s => s.id === staffId)?.name || "")
      : "";
    // Time-mode blocks go into staff_day_overrides (row-per-block) so you can
    // stack multiple time windows on the same date (e.g. 10-11 AND 14-15).
    // Full-day blocks stay in profiles.day_overrides (one per date) because
    // the concept of "multiple full-day blocks" doesn't add anything.
    if (blockForm.mode === "time") {
      const { data: inserted, error } = await supabase
        .from("staff_day_overrides")
        .insert({
          owner_id: salonData.owner_id,
          staff_id: staffId,
          date: from,
          block_time_start: blockForm.time_start,
          block_time_end: blockForm.time_end,
          reason: blockForm.reason || (lang === "nl" ? "Geblokkeerd" : "Blocked"),
        })
        .select("*")
        .single();
      setBlockSaving(false);
      if (error) {
        toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
        return;
      }
      update(d => { d.staff_blocks = [...(d.staff_blocks || []), inserted]; return d; });
      setBlockModalOpen(false);
      toast.show(lang === "nl" ? "Tijdvak geblokkeerd" : "Time window blocked");
      return;
    }
    // Full-day / date-range block path — untouched.
    const nextOverrides = { ...(salonData.day_overrides || {}) };
    const endDate = blockForm.to || from;
    let cur = new Date(from);
    const end = new Date(endDate);
    while (cur <= end) {
      nextOverrides[fmt(cur)] = {
        type: "blocked",
        reason: blockForm.reason || (lang === "nl" ? "Geblokkeerd" : "Blocked"),
        from,
        to: endDate,
        staff_id: staffId,
        staff_name: staffName,
      };
      cur.setDate(cur.getDate() + 1);
    }
    const { error } = await supabase
      .from("profiles")
      .update({ day_overrides: nextOverrides })
      .eq("id", salonData.owner_id);
    setBlockSaving(false);
    if (error) {
      toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
      return;
    }
    update(d => { d.day_overrides = nextOverrides; return d; });
    setBlockModalOpen(false);
    toast.show(lang === "nl" ? "Dag geblokkeerd" : "Day blocked");
  };

  const saveEditAppt = async () => {
    if (!editingAppt || editApptSaving) return;
    const priceNum = parseFloat(editApptForm.price);
    const durationNum = parseInt(editApptForm.duration);
    if (!editApptForm.date) { toast.show(lang === "nl" ? "Datum is verplicht" : "Date is required", "error"); return; }
    if (!editApptForm.time) { toast.show(lang === "nl" ? "Tijd is verplicht" : "Time is required", "error"); return; }
    if (!Number.isFinite(priceNum) || priceNum < 0) { toast.show(lang === "nl" ? "Ongeldige prijs" : "Invalid price", "error"); return; }
    if (!Number.isFinite(durationNum) || durationNum < 5) { toast.show(lang === "nl" ? "Ongeldige duur" : "Invalid duration", "error"); return; }
    setEditApptSaving(true);
    const orig = editingAppt;
    const payload = {
      date: editApptForm.date,
      time: editApptForm.time,
      service_price: priceNum,
      service_duration: durationNum,
    };
    const { error } = await supabase.from("appointments").update(payload).eq("id", editingAppt.id);
    if (error) {
      setEditApptSaving(false);
      toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
      return;
    }
    update(d => { d.appointments = d.appointments.map(x => x.id === editingAppt.id ? { ...x, ...payload } : x); return d; });

    // Notify the client when something they care about actually changed.
    // Duration-only edits don't trigger an email — clients don't see duration
    // in their confirmation, and pinging them for an invisible change just
    // creates inbox noise. Cancelled/no-show appointments also skip the email.
    const dateChanged = orig.date !== payload.date;
    const timeChanged = (orig.time || "").slice(0, 5) !== payload.time;
    const priceChanged = parseFloat(orig.service_price || 0) !== priceNum;
    const skipEmail = orig.status === "cancelled" || orig.status === "no_show";
    if ((dateChanged || timeChanged || priceChanged) && !skipEmail && orig.client_email) {
      try {
        // Try to surface an existing cancellation token so the client can
        // bail if the new slot doesn't work for them. Best-effort: a missing
        // or expired token just omits the link, doesn't block the email.
        let cancelUrl = "";
        try {
          const { data: tok } = await supabase
            .from("cancellation_tokens")
            .select("token")
            .eq("appointment_id", orig.id)
            .eq("used", false)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
          if (tok?.token) cancelUrl = `${window.location.origin}/cancel/${tok.token}`;
        } catch { /* token lookup failure is non-fatal */ }
        const notifyPayload = {
          client_name: orig.client_name,
          client_email: orig.client_email,
          client_phone: orig.client_phone || null,
          service_name: orig.service_name,
          // New values:
          date: payload.date,
          time: payload.time,
          price: priceNum,
          // Old values for the diff render:
          old_date: dateChanged ? orig.date : null,
          old_time: timeChanged ? (orig.time || "").slice(0, 5) : null,
          old_price: priceChanged ? parseFloat(orig.service_price || 0) : null,
          salon_name: salonData.name,
          salon_accent: salonData.accent || "",
          salon_logo: salonData.logo_url || "",
          salon_slug: salonData.id || "",
          owner_id: salonData.owner_id,
          cancel_url: cancelUrl || null,
          lang,
        };
        await sendEmails("appointment_updated", notifyPayload);
        // Fire SMS too — the edge function silently skips if the salon isn't
        // on Professional or the client has no phone. Runs in parallel so the
        // save UX isn't blocked by network chatter.
        sendSMS("appointment_updated", notifyPayload).catch(() => { /* logged in helper */ });
      } catch (e) {
        // Don't fail the save flow if the email send hiccups — the DB write
        // already succeeded. Just log so we notice.
        console.error("appointment_updated email failed:", e);
      }
    }
    setEditApptSaving(false);
    setEditingAppt(null);
    toast.show(lang === "nl" ? "Afspraak bijgewerkt" : "Appointment updated");
  };

  // Send an invoice using a specific profile. profileIdx === null uses the
  // primary (top-level profiles.* columns); a number picks that entry in
  // profiles.invoice_profiles. Each profile owns its own next-number counter.
  const sendInvoiceWith = async (id, profileIdx) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    setInvoicePickerFor(null);
    try {
      const a = salonData.appointments.find(x => x.id === id);
      if (a) {
        const extras = salonData.invoice_profiles || [];
        const isExtra = profileIdx !== null && profileIdx !== undefined && extras[profileIdx];
        const p = isExtra ? extras[profileIdx] : null;
        const prefix = (p ? p.invoice_prefix : salonData.invoice_prefix) || "INV";
        const nextNum = (p ? p.next_invoice_number : salonData.next_invoice_number) || 1;
        const invoiceNumber = `${prefix}-${String(nextNum).padStart(4, "0")}`;
        await sendEmails("invoice", {
          client_name: a.client_name,
          client_email: a.client_email,
          service_name: a.service_name,
          date: a.date,
          price: a.service_price,
          salon_name: p?.label ? `${salonData.name} — ${p.label}` : salonData.name,
          invoice_number: invoiceNumber,
          salon_address: (p ? p.address : salonData.address) || "",
          salon_kvk: (p ? p.kvk_number : salonData.kvk_number) || "",
          salon_btw: (p ? p.btw_id : salonData.btw_id) || "",
          salon_iban: (p ? p.iban : salonData.iban) || "",
          salon_accent: salonData.accent || "",
          salon_btw_rate: salonData.btw_rate ?? 21,
          salon_logo: salonData.logo_url || "",
          lang
        });
        await supabase.from("appointments").update({ invoice_sent: true }).eq("id", id);
        if (isExtra) {
          const nextExtras = extras.map((x, i) => i === profileIdx ? { ...x, next_invoice_number: (x.next_invoice_number || 1) + 1 } : x);
          await supabase.from("profiles").update({ invoice_profiles: nextExtras }).eq("id", salonData.owner_id);
          update(d => { d.invoice_profiles = nextExtras; return d; });
        } else {
          const next = (salonData.next_invoice_number || 1) + 1;
          await supabase.from("profiles").update({ next_invoice_number: next }).eq("id", salonData.owner_id);
          update(d => { d.next_invoice_number = next; return d; });
        }
      }
      update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, invoice_sent:true} : a); return d; });
      toast.show(t.invoiceSent);
    } finally { setProcessingApptId(null); }
  };

  const sendInvoice = async (id) => {
    if (processingApptId) return;
    // With no extras there's only one profile — send instantly. With extras,
    // open the picker so the right person invoices the right client.
    if ((salonData.invoice_profiles || []).length === 0) {
      return sendInvoiceWith(id, null);
    }
    setInvoicePickerFor(id);
  };

  // Set invoice_view_state for a single appointment. Used by the Facturen view
  // hide/delete actions — the underlying appointment row is left alone so
  // agenda + customer history stay intact, only the Facturen view changes.
  const setInvoiceViewState = async (apptId, state /* "hidden" | "deleted" | null */) => {
    const { error } = await supabase
      .from("appointments")
      .update({ invoice_view_state: state })
      .eq("id", apptId);
    if (error) {
      toast.show(lang === "nl" ? "Kon factuur niet bijwerken" : "Could not update invoice", "error");
      return;
    }
    update(d => {
      d.appointments = d.appointments.map(a => a.id === apptId ? { ...a, invoice_view_state: state } : a);
      return d;
    });
    if (state === "hidden") toast.show(lang === "nl" ? "Factuur verborgen" : "Invoice hidden");
    else if (state === "deleted") toast.show(lang === "nl" ? "Factuur verwijderd" : "Invoice deleted");
    else toast.show(lang === "nl" ? "Factuur teruggezet" : "Invoice restored");
  };

  const addService = async () => {
    // Owner-visible input in current lang → require that. If lang=en they type
    // name_en and NL gets auto-translated below (and vice versa).
    const primaryName = lang === "nl" ? newSvc.name_nl : (newSvc.name_en || newSvc.name_nl);
    if (!primaryName || !newSvc.price) { setSvcError(t.fillRequired); return; }
    const price = parseFloat(newSvc.price);
    if (!Number.isFinite(price) || price < 0) { setSvcError(lang === "nl" ? "Ongeldige prijs" : "Invalid price"); return; }
    setSvcError("");
    const filled = await autoFillTranslations(newSvc, [{ nl: "name_nl", en: "name_en" }], lang);
    // Append to end: position = max existing + 1 (so new rows land below drag-drop ordered ones).
    const nextPosition = (salonData.services || []).reduce((m, s) => Math.max(m, s.position ?? -1), -1) + 1;
    const { data, error } = await supabase.from("services").insert({
      owner_id: salonData.owner_id,
      name: filled.name_nl || filled.name_en,
      name_nl: filled.name_nl || filled.name_en,
      name_en: filled.name_en || null,
      price,
      duration: parseInt(filled.duration) || 60,
      position: nextPosition,
      category_id: filled.category_id || null
    }).select().single();
    if (error || !data) {
      // Previously the error was silently swallowed and the form was cleared so owners
      // thought the service was added. Show a real error and keep the form so they can retry.
      toast.show(lang === "nl" ? "Dienst toevoegen mislukt" : "Failed to add service", "error");
      return;
    }
    update(d => { d.services = [...d.services, { ...data, name_nl: data.name_nl || data.name, name_en: data.name_en || data.name, photos: [], variants: [], extras: [] }]; return d; });
    setNewSvc({ name_nl: "", name_en: "", price: "", duration: "60", category_id: "" });
  };

  const deleteService = async (id) => {
    // Delete children first (still not a true transaction — ideally Postgres ON DELETE CASCADE
    // would handle this, but we at least surface errors instead of silently leaving orphans).
    const d1 = await supabase.from("service_photos").delete().eq("service_id", id);
    const d2 = await supabase.from("service_extras").delete().eq("service_id", id);
    const d3 = await supabase.from("service_variants").delete().eq("service_id", id);
    if (d1.error || d2.error || d3.error) {
      toast.show(lang === "nl" ? "Verwijderen van onderdelen mislukt" : "Failed to delete related items", "error");
      return;
    }
    const { error } = await supabase.from("services").delete().eq("id", id).eq("owner_id", salonData.owner_id);
    if (error) { toast.show(t.somethingWrong, "error"); return; }
    update(d => { d.services = d.services.filter(s => s.id !== id); return d; });
  };

  const [photoUploading, setPhotoUploading] = useState(null); // serviceId or null

  const addPhoto = async (serviceId, file) => {
    setPhotoUploading(serviceId);
    const uploadFile = await compressImage(file);
    const fileName = `${salonData.owner_id}/${serviceId}/${Date.now()}_${uploadFile.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("service-photos")
      .upload(fileName, uploadFile, { cacheControl: "3600", upsert: false });
    
    if (uploadError) {
      console.error("Upload error:", uploadError);
      setPhotoUploading(null);
      return;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("service-photos")
      .getPublicUrl(fileName);
    
    // Save to database
    const { data: photoData, error: dbError } = await supabase.from("service_photos").insert({
      service_id: serviceId,
      owner_id: salonData.owner_id,
      storage_path: publicUrl
    }).select().single();
    
    if (dbError) {
      console.error("DB error:", dbError);
      // Clean up orphaned file from storage
      await supabase.storage.from("service-photos").remove([fileName]);
      setPhotoUploading(null);
      return;
    }

    // Update local state
    update(d => {
      d.services = d.services.map(s => s.id === serviceId ? {...s, photos: [...(s.photos || []), { id: photoData.id, url: publicUrl, focal_x: 50, focal_y: 50 }]} : s);
      return d;
    });
    setPhotoUploading(null);
  };

  const [focalPicker, setFocalPicker] = useState(null); // { serviceId, photoId, url, focal_x, focal_y }
  const setFocalPoint = async (serviceId, photoId, x, y) => {
    const fx = Math.round(x);
    const fy = Math.round(y);
    const { error } = await supabase.from("service_photos").update({ focal_x: fx, focal_y: fy }).eq("id", photoId);
    if (error) { toast.show(t.somethingWrong, "error"); return; }
    update(d => {
      d.services = d.services.map(s => s.id === serviceId ? {...s, photos: (s.photos || []).map(p => p.id === photoId ? {...p, focal_x: fx, focal_y: fy} : p)} : s);
      return d;
    });
    setFocalPicker(fp => fp ? {...fp, focal_x: fx, focal_y: fy} : null);
  };

  const deletePhoto = async (serviceId, photoId, photoUrl) => {
    // Delete from database — scope by owner_id for defense-in-depth and surface errors.
    const { error } = await supabase.from("service_photos").delete().eq("id", photoId).eq("owner_id", salonData.owner_id);
    if (error) { toast.show(lang === "nl" ? "Verwijderen mislukt" : "Delete failed", "error"); return; }

    // Extract file path from URL and delete from storage
    try {
      const urlParts = photoUrl.split("/service-photos/");
      if (urlParts[1]) {
        await supabase.storage.from("service-photos").remove([urlParts[1]]);
      }
    } catch (e) {
      console.error("Storage delete error:", e);
    }
    
    // Update local state
    update(d => { 
      d.services = d.services.map(s => s.id === serviceId ? {...s, photos: (s.photos || []).filter(p => p.id !== photoId)} : s); 
      return d; 
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`vellu.cc/${salonData.id}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    try { localStorage.setItem(`vellu_shared_${salonData.id}`, "1"); } catch {}
    setHasSharedLink(true);
  };

  const exportCalendar = (apptList) => {
    // Emit UTC times (Z suffix). Previously DTSTART/DTEND were "floating" (no timezone),
    // which Google/Apple Calendar interpret in the importing device's local time —
    // an owner traveling abroad would see appointments on wrong hours. UTC is unambiguous.
    const pad = (n) => String(n).padStart(2, "0");
    const fmtUTC = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    const icsStatus = (s) => s === "completed" ? "CONFIRMED" : (s === "cancelled" || s === "no_show" ? "CANCELLED" : "CONFIRMED");
    const events = apptList.map(a => {
      const start = new Date(a.date + "T" + a.time + ":00");
      const end = new Date(start.getTime() + (a.service_duration || 60) * 60000);
      return [
        "BEGIN:VEVENT",
        `DTSTART:${fmtUTC(start)}`,
        `DTEND:${fmtUTC(end)}`,
        `SUMMARY:${a.client_name} — ${a.service_name}`,
        `DESCRIPTION:${a.client_name}\\n${a.client_email}${a.client_phone ? "\\n" + a.client_phone : ""}\\n€${a.service_price}\\nStatus: ${a.status}`,
        `LOCATION:${salonData.name}, ${salonData.city}`,
        `STATUS:${icsStatus(a.status)}`,
        `UID:${a.id}@vellu.cc`,
        "END:VEVENT"
      ].join("\r\n");
    });
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Vellu//Beauty Booking//EN",
      "X-WR-CALNAME:Vellu - " + salonData.name,
      ...events,
      "END:VCALENDAR"
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vellu-${salonData.id}-agenda.ics`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Rendered as a plain function (NOT a React component) so it doesn't get a new identity
  // on every OwnerApp render — previously `const ApptCard = ({a}) => ...` caused every
  // appointment card to remount on every keystroke in any form input, a real perf hit
  // for salons with many appointments. The caller passes `key` on the returned element.
  const renderApptCard = (a) => {
    // Lookup this client's no-show history for THIS salon. Shows a warning
    // badge next to the name once they hit 2+, and a solid block indicator
    // if they've been auto-blocked.
    const noShowInfo = salonData.client_no_shows?.[(a.client_email || "").toLowerCase()];
    const showWarn = noShowInfo && noShowInfo.no_show_count >= 2 && !noShowInfo.blocked;
    const showBlocked = noShowInfo?.blocked;
    // Client note — surfaced from the manual_clients row so staff sees
    // it at the point of service without having to click through.
    const clientNote = salonData.client_notes?.[(a.client_email || "").toLowerCase()];
    return (
    <div key={a._slotKey || a.id} className="appt-card" title={a.service_name}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {a.client_name}
            {showWarn && (
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: `${c.warning}22`, color: c.warning, border: `1px solid ${c.warning}44`, fontWeight: 600, letterSpacing: "0.04em" }}
                title={lang === "nl" ? `${noShowInfo.no_show_count} no-shows bij jouw salon` : `${noShowInfo.no_show_count} no-shows at your salon`}>
                ⚠ {noShowInfo.no_show_count}× NO-SHOW
              </span>
            )}
            {showBlocked && (
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: `${c.danger}22`, color: c.danger, border: `1px solid ${c.danger}44`, fontWeight: 600, letterSpacing: "0.04em" }}
                title={lang === "nl" ? "Deze klant is geblokkeerd voor nieuwe boekingen" : "This client is blocked from new bookings"}>
                {lang === "nl" ? "GEBLOKKEERD" : "BLOCKED"}
              </span>
            )}
          </div>
          {(() => {
            // Compute end time from start + duration so the owner sees the
            // real time window, not just "start + Xm".
            const [h, m] = (a.time || "0:0").split(":").map(Number);
            const startMin = h * 60 + (m || 0);
            const endMin = startMin + parseInt(a.service_duration || 60);
            const pad = n => String(n).padStart(2, "0");
            const endTime = `${pad(Math.floor(endMin / 60) % 24)}:${pad(endMin % 60)}`;
            return (
              <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3, wordBreak: "break-word", lineHeight: 1.45 }}>
                <strong style={{ color: c.text, fontWeight: 600 }}>{a.time} – {endTime}</strong> · {a.service_name}
              </div>
            );
          })()}
          {a.staff_name && (
            <div style={{ fontSize: 10, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 100, background: `${accent}18`, color: accent, border: `1px solid ${accent}33`, fontWeight: 600 }}>
              <NavIcon name="user" size={9} color={accent} /> {a.staff_name}
            </div>
          )}
          <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{a.client_email}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span className={`badge badge-${a.status}`}>{a.status === "confirmed" ? (lang === "nl" ? "Bevestigd" : "Confirmed") : a.status === "cancelled" ? (lang === "nl" ? "Geannuleerd" : "Cancelled") : a.status === "no_show" ? "No-show" : (lang === "nl" ? "Voltooid" : "Completed")}</span>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{parseFloat(a.service_price || 0).toFixed(2)}</span>
        </div>
      </div>
      {a.client_allergies && (
        <div style={{ fontSize: 10, color: c.warning, background: `${c.warning}14`, border: `1px solid ${c.warning}28`, borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
          ⚠️ {t.clientAllergies}: {a.client_allergies}
        </div>
      )}
      {clientNote && (
        <div style={{ fontSize: 10, color: c.textSub, background: `${accent}0d`, border: `1px solid ${accent}33`, borderRadius: 8, padding: "6px 10px", marginBottom: 6, display: "flex", gap: 6, alignItems: "flex-start" }} title={clientNote}>
          <span style={{ fontSize: 10 }}>📝</span>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{clientNote}</span>
        </div>
      )}
      {a.status === "confirmed" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn-ghost" style={{ flex: 1, fontSize:10, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markComplete(a.id)}>{processingApptId === a.id ? "..." : t.markComplete}</button>
          <button className="btn-ghost" style={{ fontSize:10, padding: "0 14px", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => setRescheduling(a)}>{lang === "nl" ? "Verplaats" : "Reschedule"}</button>
          <button className="btn-ghost" style={{ fontSize:10, padding: "0 14px", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => openEditAppt(a)} title={lang === "nl" ? "Datum, tijd of prijs aanpassen" : "Edit date, time or price"}>{lang === "nl" ? "Bewerk" : "Edit"}</button>
          <button className="btn-ghost" style={{ fontSize:10, padding: "0 14px", color: c.danger, borderColor: `${c.danger}33`, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markNoShow(a.id)}>{processingApptId === a.id ? "..." : t.markNoShow}</button>
          <button aria-label={lang === "nl" ? "Verwijderen" : "Delete"} title={lang === "nl" ? "Afspraak verwijderen" : "Delete appointment"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => deleteAppt(a)}>
            <NavIcon name="xmark" size={11} color="currentColor" />
          </button>
        </div>
      )}
      {a.status === "completed" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
          <button className="btn-ghost" style={{ flex: 1, fontSize:10, padding: "6px 14px", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => openEditAppt(a)} title={lang === "nl" ? "Prijs of datum aanpassen (bv. correctie)" : "Edit price or date (e.g. correction)"}>{lang === "nl" ? "Bewerk" : "Edit"}</button>
          <button aria-label={lang === "nl" ? "Verwijderen" : "Delete"} title={lang === "nl" ? "Afspraak verwijderen" : "Delete appointment"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => deleteAppt(a)}>
            <NavIcon name="xmark" size={11} color="currentColor" />
          </button>
        </div>
      )}
      {(a.status === "cancelled" || a.status === "no_show") && (
        <button className="btn-ghost" style={{ fontSize:10, padding: "6px 14px", marginTop: 6, color: c.danger, borderColor: `${c.danger}33`, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => deleteAppt(a)}>
          {lang === "nl" ? "Verwijderen" : "Delete"}
        </button>
      )}
      {a.status === "completed" && !a.invoice_sent && <button className="btn-primary" style={{ fontSize:11, marginTop:4, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => sendInvoice(a.id)}>{processingApptId === a.id ? "..." : t.sendInvoice}</button>}
      {a.status === "completed" && a.invoice_sent && <div style={{ fontSize:11, color: c.success, marginTop:6 }}>{t.invoiceSent}</div>}
      {a.status === "no_show" && <div style={{ fontSize:11, color: c.danger, marginTop:6 }}><NavIcon name="xmark" size={11} color={c.danger} /> {t.noShow}</div>}
      {/* Quick actions: Google Calendar + WhatsApp */}
      {a.status === "confirmed" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "6px 8px", color: c.textLabel }} onClick={() => {
            const dur = parseInt(a.service_duration || a.duration || 60);
            window.open(getGoogleCalUrl({
              title: `${a.client_name} — ${a.service_name}`,
              date: a.date, time: a.time, duration: dur,
              description: `${t.treatment}: ${a.service_name}\n${t.name}: ${a.client_name}\n€${a.service_price}`,
              location: salonData.name + (salonData.city ? ", " + salonData.city : "")
            }), "_blank");
          }}>{t.addToGoogleCal}</button>
          {salonData.whatsapp_number && a.client_phone && (
            <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 10px", color: "#25d366", borderColor: "rgba(37,211,102,0.2)" }} onClick={() => {
              const msg = getWhatsAppBookingMsg(lang, {
                clientName: a.client_name, salonName: salonData.name,
                date: parseDate(a.date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" }),
                time: a.time, serviceName: a.service_name, price: parseFloat(a.service_price || 0).toFixed(2)
              });
              window.open(getWhatsAppUrl(a.client_phone, msg), "_blank");
            }}><NavIcon name="chat" size={13} color="currentColor" /> WhatsApp</button>
          )}
        </div>
      )}
    </div>
    );
  };

  // Responsive hook
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const navItems = [
    ["dashboard", "dashboard", t.dashboard],
    ["agenda", "agenda", t.agenda],
    ["klanten", "team", lang === "nl" ? "Klanten" : "Clients"],
    ["analytics", "analytics", t.analytics],
    ["facturen", "facturen", t.invoices],
    ["instellingen", "instellingen", t.settings]
  ];

  // Show loading skeleton while data is being fetched
  if (!dataLoaded) {
    return (
      <Layout accent={accent}>
        <div style={{ background: c.bg, height: "100dvh", display: "flex", fontFamily: "'Jost',sans-serif", color: c.text }}>
    
          <DashboardSkeleton />
        </div>
      </Layout>
    );
  }

  // Show onboarding wizard for new salons
  if (showOnboarding) {
    return <OnboardingWizard salonData={salonData} update={update} lang={lang} setLang={setLang} accent={accent} onFinish={() => setShowOnboarding(false)} />;
  }

  return (
    <Layout accent={accent}>
      <ToastContainer toasts={toast.toasts} />
      <ConfirmModal state={confirmState} onYes={confirmYes} onNo={confirmNo} lang={lang} />

      {/* Mobile-only PWA install banner. Self-hides on desktop (UA check),
          when already installed, or once dismissed. Shown on every owner
          dashboard page AFTER login (component only mounts when dataLoaded
          is true + not on login screen). Puts Vellu one tap from the home
          screen for owners — the install story matters more for them than
          for customers since they open the app daily. */}
      <InstallAppPrompt
        dismissKey="vellu_install_dismissed_owner"
        title={lang === "nl" ? "Installeer Vellu" : "Install Vellu"}
        subtitle={lang === "nl" ? "Snelle toegang tot je dashboard" : "Quick access to your dashboard"}
        lang={lang} accent={accent} c={c}
      />

      {qrOpen && (
        <QRCodeModal
          url={`https://vellu.cc/${salonData.id}`}
          salonName={salonData.name}
          lang={lang}
          c={c}
          accent={accent}
          onClose={() => setQrOpen(false)}
        />
      )}
      {/* Quick-block modal — same fields as the Planning tab's blocker but
          persists immediately so blocking from the agenda feels like a
          direct action. Portal'd to escape the .fade-up transform context. */}
      {blockModalOpen && createPortal((
        <div onClick={() => !blockSaving && setBlockModalOpen(false)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 320, fontFamily: "'Jost', sans-serif", color: c.text }}>
          <div onClick={(e) => e.stopPropagation()}
               style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: 24, maxWidth: 440, width: "100%", color: c.text }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, marginBottom: 4 }}>
              {lang === "nl" ? "Blokkeer tijd of dag" : "Block time or day"}
            </div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 18 }}>
              {lang === "nl"
                ? "Klanten kunnen dan geen afspraak boeken in dit tijdvak of op deze dag."
                : "Clients won't be able to book during this window or on this day."}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[
                { key: "time", nl: "Tijdvak", en: "Time window" },
                { key: "day", nl: "Hele dag", en: "Whole day" },
              ].map(opt => {
                const active = blockForm.mode === opt.key;
                return (
                  <button key={opt.key} type="button"
                    onClick={() => setBlockForm(f => ({ ...f, mode: opt.key }))}
                    style={{
                      flex: 1, padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                      background: active ? `${c.danger}1f` : "transparent",
                      color: active ? c.danger : c.textSub,
                      border: `1px solid ${active ? `${c.danger}4d` : c.inputBorder}`,
                      fontFamily: "'Jost', sans-serif",
                    }}
                  >{lang === "nl" ? opt.nl : opt.en}</button>
                );
              })}
            </div>
            {(() => { const lbl = { fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4, display: "block" }; return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              {blockForm.mode === "time" ? (
                <>
                  <div><label style={lbl}>{lang === "nl" ? "Datum" : "Date"}</label>
                    <input className="input-field" type="date" value={blockForm.from} onChange={e => setBlockForm(f => ({ ...f, from: e.target.value }))} style={{ width: "100%" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={lbl}>{lang === "nl" ? "Van" : "From"}</label>
                      <select className="input-field" value={blockForm.time_start} onChange={e => setBlockForm(f => ({ ...f, time_start: e.target.value }))} style={{ width: "100%", fontFamily: "'Jost',sans-serif" }}>
                        {TIMES.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>{lang === "nl" ? "Tot" : "To"}</label>
                      <select className="input-field" value={blockForm.time_end} onChange={e => setBlockForm(f => ({ ...f, time_end: e.target.value }))} style={{ width: "100%", fontFamily: "'Jost',sans-serif" }}>
                        {TIMES.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={lbl}>{lang === "nl" ? "Van" : "From"}</label>
                    <input className="input-field" type="date" value={blockForm.from} onChange={e => setBlockForm(f => ({ ...f, from: e.target.value }))} style={{ width: "100%" }} autoFocus />
                  </div>
                  <div><label style={lbl}>{lang === "nl" ? "Tot (optioneel)" : "To (optional)"}</label>
                    <input className="input-field" type="date" value={blockForm.to} onChange={e => setBlockForm(f => ({ ...f, to: e.target.value }))} style={{ width: "100%" }} />
                  </div>
                </div>
              )}
              {(salonData.staff || []).length > 0 && (
                <div><label style={lbl}>{lang === "nl" ? "Voor wie?" : "Who?"}</label>
                  <select className="input-field" value={blockForm.staff_id} onChange={e => setBlockForm(f => ({ ...f, staff_id: e.target.value }))} style={{ width: "100%", fontFamily: "'Jost',sans-serif" }}>
                    <option value="">{lang === "nl" ? "Iedereen (hele salon)" : "Everyone (whole salon)"}</option>
                    {(salonData.staff || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                    {blockForm.staff_id
                      ? (lang === "nl" ? "Alleen deze medewerker is dan niet boekbaar; anderen blijven beschikbaar." : "Only this staff member is blocked; the rest stays bookable.")
                      : (lang === "nl" ? "De hele salon is dicht in dit tijdvak." : "The whole salon is closed during this window.")}
                  </div>
                </div>
              )}
              <div><label style={lbl}>{lang === "nl" ? "Reden (optioneel)" : "Reason (optional)"}</label>
                <input className="input-field" value={blockForm.reason} onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))} placeholder={lang === "nl" ? "bijv. Privé-afspraak, vakantie" : "e.g. Private appointment, vacation"} style={{ width: "100%" }} />
              </div>
            </div>
            ); })()}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" disabled={blockSaving} onClick={saveBlock} style={{ flex: 1, background: c.danger, color: "#fff" }}>
                {blockSaving ? (lang === "nl" ? "Bezig…" : "Saving…") : (lang === "nl" ? "Blokkeer" : "Block")}
              </button>
              <button className="btn-ghost" disabled={blockSaving} onClick={() => setBlockModalOpen(false)} style={{ padding: "0 18px" }}>
                {lang === "nl" ? "Annuleer" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {invoicePickerFor && createPortal((
        <div onClick={() => setInvoicePickerFor(null)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 320, fontFamily: "'Jost', sans-serif", color: c.text }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20, padding: 24, maxWidth: 440, width: "100%", color: c.text }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, marginBottom: 4 }}>
              {lang === "nl" ? "Welk factuurprofiel?" : "Which invoice profile?"}
            </div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 18 }}>
              {lang === "nl"
                ? "Kies namens welk profiel je deze factuur verstuurt. Elk profiel heeft zijn eigen nummering."
                : "Pick which profile is sending this invoice. Each has its own numbering."}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              <button className="btn-ghost" onClick={() => sendInvoiceWith(invoicePickerFor, null)}
                style={{ padding: "12px 14px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: c.bgCard, border: `1px solid ${c.border}`, color: c.text }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{salonData.name}</div>
                  <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{lang === "nl" ? "Standaardprofiel" : "Primary profile"}</div>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: accent, flexShrink: 0 }}>
                  {(salonData.invoice_prefix || "INV")}-{String(salonData.next_invoice_number || 1).padStart(4, "0")}
                </div>
              </button>
              {(salonData.invoice_profiles || []).map((p, idx) => (
                <button key={p.id || idx} className="btn-ghost" onClick={() => sendInvoiceWith(invoicePickerFor, idx)}
                  style={{ padding: "12px 14px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: c.bgCard, border: `1px solid ${c.border}`, color: c.text }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.label || (lang === "nl" ? `Profiel ${idx + 2}` : `Profile ${idx + 2}`)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>
                      {p.btw_id ? `BTW ${p.btw_id}` : (p.kvk_number ? `KVK ${p.kvk_number}` : (lang === "nl" ? "Extra profiel" : "Extra profile"))}
                    </div>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: accent, flexShrink: 0 }}>
                    {(p.invoice_prefix || "INV")}-{String(p.next_invoice_number || 1).padStart(4, "0")}
                  </div>
                </button>
              ))}
            </div>
            <button className="btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setInvoicePickerFor(null)}>
              {lang === "nl" ? "Annuleer" : "Cancel"}
            </button>
          </div>
        </div>
      ), document.body)}

      {editingAppt && createPortal((
        <div onClick={() => !editApptSaving && setEditingAppt(null)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 320, fontFamily: "'Jost', sans-serif", color: c.text }}>
          <div onClick={(e) => e.stopPropagation()}
               style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: 24, maxWidth: 420, width: "100%", color: c.text }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, marginBottom: 4 }}>
              {lang === "nl" ? "Afspraak bewerken" : "Edit appointment"}
            </div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 18 }}>
              {editingAppt.client_name} · {editingAppt.service_name}
            </div>
            {(() => { const lbl = { fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4, display: "block" }; return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                <div><label style={lbl}>{lang === "nl" ? "Datum" : "Date"}</label><input className="input-field" type="date" value={editApptForm.date} onChange={(e) => setEditApptForm((f) => ({ ...f, date: e.target.value }))} style={{ width: "100%" }} /></div>
                <div><label style={lbl}>{lang === "nl" ? "Tijd" : "Time"}</label><input className="input-field" type="time" value={editApptForm.time} onChange={(e) => setEditApptForm((f) => ({ ...f, time: e.target.value }))} style={{ width: "100%" }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={lbl}>{lang === "nl" ? "Prijs (€)" : "Price (€)"}</label><input className="input-field" type="number" step="0.01" min="0" value={editApptForm.price} onChange={(e) => setEditApptForm((f) => ({ ...f, price: e.target.value }))} style={{ width: "100%" }} /></div>
                <div><label style={lbl}>{lang === "nl" ? "Duur (min)" : "Duration (min)"}</label><input className="input-field" type="number" step="5" min="5" value={editApptForm.duration} onChange={(e) => setEditApptForm((f) => ({ ...f, duration: e.target.value }))} style={{ width: "100%" }} /></div>
              </div>
            </div>
            ); })()}
            <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
              {lang === "nl"
                ? "Let op: dit is een directe override. Beschikbaarheid van staff wordt niet automatisch gecontroleerd. Voor een normale verplaatsing met slot-check gebruik je 'Verplaats'."
                : "Note: this is a direct override. Staff availability is not checked. Use 'Reschedule' for a slot-validated move."}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" disabled={editApptSaving} onClick={saveEditAppt} style={{ flex: 1 }}>
                {editApptSaving ? (lang === "nl" ? "Bezig…" : "Saving…") : (lang === "nl" ? "Opslaan" : "Save")}
              </button>
              <button className="btn-ghost" disabled={editApptSaving} onClick={() => setEditingAppt(null)} style={{ padding: "0 18px" }}>
                {lang === "nl" ? "Annuleer" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
      {rescheduling && (
        <RescheduleModal
          appt={rescheduling}
          onClose={() => setRescheduling(null)}
          onSuccess={(updated) => {
            update(d => { d.appointments = d.appointments.map(a => a.id === updated.id ? {...a, ...updated} : a); return d; });
            setRescheduling(null);
            toast.show(lang === "nl" ? "Afspraak verplaatst" : "Appointment rescheduled");
          }}
          lang={lang}
          c={c}
          accent={accent}
          toast={toast}
          staffList={salonData.staff || []}
        />
      )}
      <div style={{
        background: c.bg,
        minHeight: "100dvh",
        display: "flex",
        fontFamily: "'Jost',sans-serif",
        color: c.text
      }}>
        
        {/* Desktop Sidebar */}
        {!isMobile && (
          <aside style={{
            width: 260,
            borderRight: "1px solid " + c.border,
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            background: c.bg,
            zIndex: 50,
            flexShrink: 0
          }}>
            {/* Sidebar Header */}
            <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.18em" }}>vellu</div>
            </div>

            {/* Salon Info */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{salonData.name}</div>
              <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 10 }}>{salonData.city}</div>
              <div style={{
                fontSize: 11,
                color: accent,
                background: `${accent}12`,
                border: `1px solid ${accent}22`,
                borderRadius: 8,
                padding: "7px 12px"
              }}>
                vellu.cc/{salonData.id}
              </div>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, minHeight: 0, padding: "12px 12px", overflowY: "auto" }}>
              {navItems.map(([k, icon, label]) => (
                <div
                  key={k}
                  onClick={() => setView(k)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 16px",
                    borderRadius: 12,
                    cursor: "pointer",
                    marginBottom: 3,
                    background: view === k ? `${accent}12` : "transparent",
                    border: `1px solid ${view === k ? `${accent}22` : "transparent"}`,
                    transition: "all 0.2s"
                  }}
                >
                  <NavIcon name={icon} size={18} color={view === k ? accent : c.textLabel} />
                  <span style={{
                    fontSize: 13,
                    fontWeight: view === k ? 600 : 400,
                    color: view === k ? accent : c.textSub,
                    letterSpacing: "0.02em"
                  }}>{label}</span>
                </div>
              ))}
            </nav>

            {/* Sidebar Footer */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <ThemeToggle />
                <LangToggle lang={lang} setLang={setLang} />
              </div>
              <button
                className="btn-ghost"
                style={{ width: "100%", marginTop: 4, fontSize: 11, color: c.textLabel, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={onLogout}
              >
                <NavIcon name="logout" size={14} color={c.textLabel} />
                {t.logout}
              </button>
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          marginLeft: isMobile ? 0 : 260
        }}>
          {/* Mobile Header */}
          {isMobile && (
            <div style={{
              position: "sticky",
              top: 0,
              zIndex: 50,
              paddingTop: "max(8px, env(safe-area-inset-top, 8px))",
              paddingBottom: 8,
              paddingLeft: 14,
              paddingRight: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: c.bg,
              borderBottom: `1px solid ${c.border}`,
              gap: 8
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 400, letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{salonData.name}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <ThemeToggle />
                <LangToggle lang={lang} setLang={setLang} />
              </div>
            </div>
          )}

          {/* Desktop Header */}
          {!isMobile && (
            <div style={{
              padding: "24px 40px",
              borderBottom: "1px solid " + c.border,
            }}>
              <div style={{
                maxWidth: 960,
                margin: "0 auto",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
                    {navItems.find(([k]) => k === view)?.[2] || t.dashboard}
                  </h1>
                  <div style={{ fontSize: 12, color: c.textLabel }}>
                    {view === "dashboard" ? t.welcomeBack : view === "agenda" ? t.manageAppts : view === "klanten" ? (lang === "nl" ? "Bekijk en beheer je klanten." : "View and manage your clients.") : view === "analytics" ? (t.salonInsight) : view === "facturen" ? t.completedTreatments : view === "instellingen" ? t.manageSalon : t.welcomeBack}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11, borderColor: `${accent}33`, color: accent, display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => window.open(`/${salonData.id}`, "_blank", "noopener,noreferrer")}
                  >
                    <NavIcon name="eye" size={14} color={accent} /> {t.preview}
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}
                    onClick={copyLink}
                  >
                    <NavIcon name="link" size={14} color={copied ? c.success : c.textSub} /> {copied ? "✓ " + t.copied : t.copyLink}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content — flows with natural body scroll (settings has its own structure below) */}
          {view !== "instellingen" ? (
          <div style={{
            minWidth: 0,
            padding: isMobile ? "14px 14px calc(100px + env(safe-area-inset-bottom, 0px))" : "32px 40px 32px",
            backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}08 0%, transparent 55%)`
          }}>

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto", overflow: "hidden" }}>
              {isMobile && <PTitle sub={t.welcomeBack}>{t.dashboard}</PTitle>}

              {/* Onboarding checklist for new salons */}
              {appts.length === 0 && (
                <div style={{ background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 20, padding: "24px 22px", marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 12 }}>{t.welcomeVellu}</div>
                  <div style={{ fontSize: 12, color: c.textSub, marginBottom: 16, lineHeight: 1.6 }}>{t.followSteps}</div>
                  {[
                    { done: salonData.services?.length > 0, label: t.addServices, action: () => setView("instellingen") },
                    { done: salonData.business_hours && Object.values(salonData.business_hours).some(d => !d.closed), label: t.setHours, action: () => setView("instellingen") },
                    { done: salonData.logo_url, label: t.uploadLogo, action: () => setView("instellingen") },
                    { done: hasSharedLink, label: t.shareLink + "vellu.cc/" + salonData.id, action: copyLink },
                  ].map((step, i) => (
                    <div key={i} onClick={step.action} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, cursor: "pointer", marginBottom: 4, background: step.done ? `${accent}08` : "transparent", border: `1px solid ${step.done ? accent + "22" : c.border}` }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${step.done ? accent : c.textMuted}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {step.done && <NavIcon name="check" size={12} color={accent} />}
                      </div>
                      <div style={{ fontSize: 12, color: step.done ? c.textSub : c.text, textDecoration: step.done ? "line-through" : "none" }}>{step.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* TODAY HERO — the first thing owners want to know */}
              {(() => {
                const now = new Date();
                // Compare date strings, not Date objects. `new Date("2026-04-20")` parses as
                // UTC midnight, which misclassifies rows at the day boundary for non-UTC users.
                const weekAgoStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
                const monthAgoStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
                const prevWeekStartStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14));
                const weekRevenue = appts.filter(a => a.status === "completed" && a.date >= weekAgoStr).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const prevWeekRevenue = appts.filter(a => a.status === "completed" && a.date >= prevWeekStartStr && a.date < weekAgoStr).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const monthRevenue = appts.filter(a => a.status === "completed" && a.date >= monthAgoStr).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const weekChange = prevWeekRevenue > 0 ? Math.round(((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100) : 0;
                const avgRating = salonData.reviews?.length > 0 ? (salonData.reviews.reduce((s, r) => s + r.rating, 0) / salonData.reviews.length).toFixed(1) : "—";

                // Daily revenue for sparklines — key by the LOCAL-time date string to match a.date.
                const revByDay = {};
                appts.forEach(a => {
                  if (a.status !== "completed") return;
                  revByDay[a.date] = (revByDay[a.date] || 0) + parseFloat(a.service_price || 0);
                });
                const weekDaily = [];
                const weekLabels = [];
                const dayInitialsNL = ["Z", "M", "D", "W", "D", "V", "Z"];
                const dayInitialsEN = ["S", "M", "T", "W", "T", "F", "S"];
                const dayInitials = lang === "nl" ? dayInitialsNL : dayInitialsEN;
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                  weekDaily.push(revByDay[fmt(d)] || 0);
                  weekLabels.push(dayInitials[d.getDay()]);
                }
                const monthDaily = [];
                const monthLabels = [];
                for (let i = 29; i >= 0; i--) {
                  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                  monthDaily.push(revByDay[fmt(d)] || 0);
                  // Sparse labels: show day-of-month on every ~5th column so
                  // the strip reads like a calendar without crowding.
                  monthLabels.push((29 - i) % 5 === 0 ? String(d.getDate()) : "");
                }
                // Bar chart used by the WEEK / MONTH KPI cards. Bars beat a
                // smoothed curve for sparse daily-revenue data: an empty week
                // with one €110 day reads as "spike + flat" instead of a
                // misleading wave. Each bar carries a tiny x-axis tick label
                // (first letter of the weekday for weeks, week number for the
                // 30-day version) and the peak bar gets a value pill.
                const sparkline = (data, color, opts) => {
                  if (!data || data.length === 0) return null;
                  const labels = (opts && opts.labels) || [];
                  const padL = 0, padR = 0, padT = 14, padB = labels.length ? 14 : 4;
                  const W = 220, H = 80;
                  const innerW = W - padL - padR;
                  const innerH = H - padT - padB;
                  const max = Math.max(...data, 1);
                  const gap = data.length > 14 ? 1.5 : 3;
                  const barW = Math.max(2, (innerW - gap * (data.length - 1)) / data.length);
                  let peakIdx = 0;
                  data.forEach((v, i) => { if (v > data[peakIdx]) peakIdx = i; });
                  const peakVal = data[peakIdx];
                  const fmt = (n) => Math.round(n).toLocaleString(lang === "nl" ? "nl-NL" : "en-US");
                  return (
                    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
                      {/* Faint baseline so the chart reads as a floor + bars,
                          not free-floating shapes. */}
                      <line x1={padL} y1={padT + innerH + 0.5} x2={padL + innerW} y2={padT + innerH + 0.5} stroke={c.border} strokeWidth="0.5" />
                      {data.map((v, i) => {
                        const x = padL + i * (barW + gap);
                        const h = v > 0 ? Math.max(1, (v / max) * innerH) : 0;
                        const y = padT + innerH - h;
                        const isPeak = peakVal > 0 && i === peakIdx;
                        return (
                          <g key={i}>
                            <rect
                              x={x} y={y} width={barW} height={Math.max(0.5, h)}
                              rx={Math.min(1.5, barW / 2)}
                              fill={isPeak ? color : `${color}55`}
                            />
                          </g>
                        );
                      })}
                      {/* Peak value label sits just above the tallest bar so
                          the owner can read the magnitude without hovering. */}
                      {peakVal > 0 && (() => {
                        const x = padL + peakIdx * (barW + gap) + barW / 2;
                        const y = padT + innerH - (peakVal / max) * innerH - 3;
                        const label = "€" + fmt(peakVal);
                        const labelW = Math.max(22, label.length * 5 + 8);
                        const lx = Math.max(0, Math.min(W - labelW, x - labelW / 2));
                        return (
                          <g>
                            <rect x={lx} y={y - 11} width={labelW} height={12} rx={6} fill={c.bgCard} stroke={`${color}55`} strokeWidth="0.5" />
                            <text x={lx + labelW / 2} y={y - 2.5} textAnchor="middle" fontSize="8" fontFamily="'Jost', sans-serif" fontWeight="600" fill={color}>{label}</text>
                          </g>
                        );
                      })()}
                      {/* X-axis tick labels (e.g. M D W D V Z Z) */}
                      {labels.length > 0 && labels.map((lab, i) => {
                        const x = padL + i * (barW + gap) + barW / 2;
                        return (
                          <text key={i} x={x} y={H - 2} textAnchor="middle" fontSize="7" fontFamily="'Jost', sans-serif" fill={c.textMuted} letterSpacing="0.04em">
                            {lab}
                          </text>
                        );
                      })}
                    </svg>
                  );
                };

                // Rating breakdown for the rating card
                const ratingDist = [5, 4, 3, 2, 1].map(r => {
                  const count = (salonData.reviews || []).filter(rv => rv.rating === r).length;
                  const pct = salonData.reviews?.length > 0 ? (count / salonData.reviews.length) * 100 : 0;
                  return { rating: r, count, pct };
                });
                const todayRevenue = todayAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const todayDate = now.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" });
                return (
                  <>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr", gap: 14, marginBottom: 22 }}>
                    {/* Left: Today's appointments — the hero */}
                    <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: isMobile ? 16 : 22, padding: isMobile ? "16px 14px" : "22px 24px", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 60% 80% at 100% 0%, ${accent}10 0%, transparent 55%)`, pointerEvents: "none" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, position: "relative" }}>
                        <div>
                          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{t.today}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.text, lineHeight: 1.15 }}>
                            {todayAppts.length} {todayAppts.length === 1 ? (lang === "nl" ? "afspraak" : "appointment") : t.appts.toLowerCase()}
                          </div>
                          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, textTransform: "capitalize" }}>{todayDate}</div>
                        </div>
                        {todayAppts.length > 0 && (
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Verwacht" : "Expected"}</div>
                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: accent }}>€{todayRevenue.toFixed(0)}</div>
                          </div>
                        )}
                      </div>
                      {todayAppts.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "18px 0 6px", color: c.textMuted, position: "relative" }}>
                          <div style={{ marginBottom: 10, opacity: 0.5 }}><NavIcon name="calendar" size={28} color={c.textMuted} /></div>
                          <div style={{ fontSize: 12 }}>{t.noTodayAppts}</div>
                          <div style={{ fontSize: 11, color: accent, cursor: "pointer", marginTop: 10 }} onClick={() => setView("agenda")}>{lang === "nl" ? "Bekijk agenda →" : "View agenda →"}</div>
                        </div>
                      ) : (
                        <div style={{ position: "relative" }}>
                          {todayAppts.slice(0, 3).map(a => renderApptCard(a))}
                          {todayAppts.length > 3 && (
                            <div style={{ fontSize: 11, color: accent, cursor: "pointer", marginTop: 8, textAlign: "center" }} onClick={() => setView("agenda")}>
                              {lang === "nl" ? `+ ${todayAppts.length - 3} meer · Bekijk alles →` : `+ ${todayAppts.length - 3} more · View all →`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: 3 KPI cards — consistent structure, equal heights */}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr", gap: 10, gridAutoRows: isMobile ? "auto" : "1fr" }}>
                      {/* WEEK REVENUE */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.weeklyRevenue}</div>
                          <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "7 dagen" : "7 days"}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1 }}>€{weekRevenue.toFixed(0)}</div>
                          {weekChange !== 0 && (
                            <div style={{ fontSize: 10, color: weekChange > 0 ? c.success : c.danger, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 100, background: weekChange > 0 ? `${c.success}18` : `${c.danger}18`, border: `1px solid ${weekChange > 0 ? c.success : c.danger}33`, whiteSpace: "nowrap" }}>
                              {weekChange > 0 ? "↑" : "↓"} {Math.abs(weekChange)}%
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minHeight: 56, marginTop: 12 }}>
                          {sparkline(weekDaily, accent, { labels: weekLabels })}
                        </div>
                      </div>

                      {/* MONTH REVENUE */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.monthlyRevenue}</div>
                          <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "30 dagen" : "30 days"}</div>
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1, marginTop: 6 }}>€{monthRevenue.toFixed(0)}</div>
                        <div style={{ flex: 1, minHeight: 56, marginTop: 12 }}>
                          {sparkline(monthDaily, accent, { labels: monthLabels })}
                        </div>
                      </div>

                      {/* RATING — breakdown bars as the visual */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.avgRating}</div>
                          <span style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{salonData.reviews?.length || 0} {t.reviews?.toLowerCase?.() || "reviews"}</span>
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: c.text, display: "flex", alignItems: "center", gap: 6, lineHeight: 1, marginTop: 6 }}>
                          {avgRating}
                          <svg width={18} height={18} viewBox="0 0 20 20" fill={accent}>
                            <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 13.28l-4.77 2.43.91-5.32L2.27 6.62l5.34-.78L10 1z" />
                          </svg>
                        </div>
                        <div style={{ flex: 1, marginTop: 12, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          {salonData.reviews?.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {ratingDist.map(r => (
                                <div key={r.rating} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 9, color: c.textMuted }}>
                                  <span style={{ width: 8, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.rating}</span>
                                  <div style={{ flex: 1, height: 5, background: c.inputBg, borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${r.pct}%`, background: accent, borderRadius: 3, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                                  </div>
                                  <span style={{ width: 14, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: 10, color: c.textMuted, textAlign: "center", padding: "8px 0" }}>{lang === "nl" ? "Nog geen reviews" : "No reviews yet"}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  </>
                );
              })()}

              {/* Quick Actions — primary first, rest ghost */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `1.2fr 1fr 1fr ${appts.length > 0 ? "1fr" : ""}`, gap: 8, marginBottom: 22 }}>
                <button className="btn-primary" style={{ padding: "12px 14px", fontSize: 11, display: "flex", alignItems: "center", gap: 8, justifyContent: "center", width: "100%" }}
                  onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ services: [{ id: `s_${Date.now()}`, service_id: "", variant_id: "", extra_ids: [], staff_id: "" }], date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "", client_allergies: "" }); setClientSearch(""); setClientMode("existing"); setShowClientDropdown(false); }}>
                  <NavIcon name="plus" size={14} color={c.btnOnDark} /> {t.addAppointment}
                </button>
                <button className="btn-ghost" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => window.open(`/${salonData.id}`, "_blank", "noopener,noreferrer")}>
                  <NavIcon name="eye" size={14} color={c.textSub} /> {t.previewPage}
                </button>
                <button className="btn-ghost" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center", color: copied ? c.success : undefined, borderColor: copied ? `${c.success}55` : undefined }} onClick={copyLink}>
                  <NavIcon name="link" size={14} color={copied ? c.success : c.textSub} /> {copied ? t.copied : t.copyLink}
                </button>
                {appts.length > 0 && (
                  <button className="btn-ghost" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => {
                    const upcoming = appts.filter(a => a.status === "confirmed");
                    if (upcoming.length === 0) return;
                    exportCalendar(upcoming);
                  }}>
                    <NavIcon name="download" size={14} color={c.textSub} /> {t.exportCalendar}
                  </button>
                )}
              </div>

              {/* Revenue Chart + Popular Services */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: 14, marginBottom: 22, alignItems: "stretch" }}>
                {/* Revenue area chart */}
                {(() => {
                  const weeks = [];
                  const now = new Date();
                  // Monday-start weeks to match the agenda (getDay() returns 0=Sun; shift so Monday=0).
                  const dowMon = (now.getDay() + 6) % 7;
                  for (let w = 7; w >= 0; w--) {
                    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (w * 7 + dowMon));
                    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
                    const wsStr = fmt(weekStart); const weStr = fmt(weekEnd);
                    const rev = appts
                      .filter(a => a.status === "completed" && a.date >= wsStr && a.date < weStr)
                      .reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                    const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
                    weeks.push({ label, revenue: rev });
                  }
                  const total8w = weeks.reduce((s, w) => s + w.revenue, 0);
                  const maxRev = Math.max(...weeks.map(w => w.revenue), 1);
                  // Trend compares halves using only non-zero weeks to avoid flat "—" for new salons.
                  const nonZero = weeks.filter(w => w.revenue > 0);
                  const avgWeek = nonZero.length ? (total8w / nonZero.length) : 0;
                  const peakIdx = weeks.reduce((best, w, i) => w.revenue > weeks[best].revenue ? i : best, 0);
                  const nzFirst = weeks.slice(0, 4).filter(w => w.revenue > 0);
                  const firstHalfAvg = nzFirst.length ? nzFirst.reduce((s, w) => s + w.revenue, 0) / nzFirst.length : 0;
                  const nzSecond = weeks.slice(4).filter(w => w.revenue > 0);
                  const secondHalfAvg = nzSecond.length ? nzSecond.reduce((s, w) => s + w.revenue, 0) / nzSecond.length : 0;
                  const trendPct = firstHalfAvg > 0 ? Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100) : 0;
                  // Chart dimensions — viewBox matches intended pixel size to minimize distortion
                  const W = 560, H = 220, PAD_L = 16, PAD_R = 16, PAD_TOP = 32, PAD_BOT = 30;
                  const innerW = W - PAD_L - PAD_R;
                  const innerH = H - PAD_TOP - PAD_BOT;
                  const pts = weeks.map((w, i) => {
                    const x = PAD_L + (i / (weeks.length - 1)) * innerW;
                    const y = PAD_TOP + innerH - (w.revenue / maxRev) * innerH;
                    return { x, y, ...w };
                  });
                  // Smooth curve via cubic bezier
                  const smoothPath = pts.reduce((acc, p, i) => {
                    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                    const prev = pts[i - 1];
                    const cx1 = prev.x + (p.x - prev.x) / 2;
                    const cy1 = prev.y;
                    const cx2 = prev.x + (p.x - prev.x) / 2;
                    const cy2 = p.y;
                    return `${acc} C${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  }, "");
                  const areaPath = `${smoothPath} L${pts[pts.length - 1].x.toFixed(1)},${PAD_TOP + innerH} L${pts[0].x.toFixed(1)},${PAD_TOP + innerH} Z`;
                  const gradId = "rev-grad-" + Math.abs(accent.charCodeAt(1) * 7).toString(16);
                  return (
                    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "20px 22px", display: "flex", flexDirection: "column" }}>
                      {/* Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>{t.revenueOverTime}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: c.text, lineHeight: 1 }}>€{total8w.toFixed(0)}</div>
                          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{lang === "nl" ? "afgelopen 8 weken" : "last 8 weeks"}</div>
                        </div>
                        <span style={{ fontSize: 10, color: accent, cursor: "pointer", padding: "6px 12px", borderRadius: 100, border: `1px solid ${accent}33`, letterSpacing: "0.06em" }} onClick={() => setView("analytics")}>{t.viewMore}</span>
                      </div>
                      {/* Chart area — flex grows to fill card */}
                      <div style={{ flex: 1, display: "flex", alignItems: "stretch", marginTop: 14, minHeight: 180 }}>
                        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", overflow: "visible" }}>
                          <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                              <stop offset="100%" stopColor={accent} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {/* Horizontal gridlines — subtle */}
                          {[0.25, 0.5, 0.75].map(pct => (
                            <line key={pct} x1={PAD_L} y1={PAD_TOP + innerH * pct} x2={W - PAD_R} y2={PAD_TOP + innerH * pct} stroke={c.border} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
                          ))}
                          {/* Baseline */}
                          <line x1={PAD_L} y1={PAD_TOP + innerH} x2={W - PAD_R} y2={PAD_TOP + innerH} stroke={c.border} strokeWidth="1" />
                          {/* Area fill */}
                          {maxRev > 0 && <path d={areaPath} fill={`url(#${gradId})`} />}
                          {/* Smooth line */}
                          {maxRev > 0 && <path d={smoothPath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                          {/* Peak label — only if there's actual data */}
                          {pts[peakIdx].revenue > 0 && (
                            <g>
                              <rect x={pts[peakIdx].x - 28} y={pts[peakIdx].y - 26} width="56" height="18" rx="9" fill={c.bg} stroke={accent} strokeWidth="1" />
                              <text x={pts[peakIdx].x} y={pts[peakIdx].y - 13} fontSize="11" fill={accent} textAnchor="middle" fontFamily="'Jost',sans-serif" fontWeight="600">
                                €{pts[peakIdx].revenue.toFixed(0)}
                              </text>
                            </g>
                          )}
                          {/* Data dots — current week bigger */}
                          {pts.map((p, i) => (
                            <g key={i}>
                              <circle cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3} fill={c.bg} stroke={accent} strokeWidth={i === pts.length - 1 ? 2.5 : 1.8}>
                                <title>{p.label} · €{p.revenue.toFixed(0)}</title>
                              </circle>
                              {i === pts.length - 1 && (
                                <circle cx={p.x} cy={p.y} r="10" fill={accent} opacity="0.15">
                                  <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
                                  <animate attributeName="opacity" values="0.25;0;0.25" dur="2s" repeatCount="indefinite" />
                                </circle>
                              )}
                            </g>
                          ))}
                          {/* X axis labels — first, middle, last */}
                          {[0, Math.floor(pts.length / 2), pts.length - 1].map(i => (
                            <text key={i} x={pts[i].x} y={H - 10} fontSize="11" fill={c.textMuted} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} fontFamily="'Jost',sans-serif">
                              {pts[i].label}
                            </text>
                          ))}
                        </svg>
                      </div>
                      {/* Footer stats row */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>{lang === "nl" ? "Beste week" : "Best week"}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: c.text }}>€{pts[peakIdx].revenue.toFixed(0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>{lang === "nl" ? "Gemiddeld" : "Average"}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: c.text }}>€{avgWeek.toFixed(0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>{lang === "nl" ? "Trend" : "Trend"}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: trendPct > 0 ? c.success : trendPct < 0 ? c.danger : c.text }}>
                            {trendPct > 0 ? "↑" : trendPct < 0 ? "↓" : "—"} {Math.abs(trendPct)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Popular services — thumbnails + revenue */}
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "20px 22px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{t.popularServices}</div>
                    <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Top 5" : "Top 5"}</div>
                  </div>
                  {(() => {
                    const svcStats = {};
                    appts.forEach(a => {
                      if (a.status !== "completed" && a.status !== "confirmed") return;
                      const n = a.service_name?.split(" — ")[0] || "?";
                      if (!svcStats[n]) svcStats[n] = { count: 0, revenue: 0, serviceId: a.service_id };
                      svcStats[n].count += 1;
                      svcStats[n].revenue += parseFloat(a.service_price || 0);
                    });
                    const sorted = Object.entries(svcStats).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
                    if (sorted.length === 0) return (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: c.textMuted, gap: 10 }}>
                        <div style={{ opacity: 0.4 }}><NavIcon name="chart" size={32} color={c.textMuted} /></div>
                        <div style={{ fontSize: 12 }}>{t.noAppts}</div>
                      </div>
                    );
                    const max = sorted[0][1].count;
                    return (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        {sorted.map(([name, stats], idx) => {
                          const svc = (salonData.services || []).find(s => s.id === stats.serviceId || (lang === "nl" ? s.name_nl : (s.name_en || s.name_nl)) === name);
                          const thumb = svc?.photos?.[0]?.url || svc?.photos?.[0];
                          return (
                            <div key={name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{ width: 40, height: 40, borderRadius: 10, background: c.inputBg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                                {thumb ? <img src={thumb} alt="" loading="lazy" onError={e => { e.target.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0, zIndex: 1 }} /> : null}
                                {!thumb && <NavIcon name="scissors" size={16} color={c.textMuted} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: accent, flexShrink: 0, lineHeight: 1 }}>€{stats.revenue.toFixed(0)}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ flex: 1, height: 5, borderRadius: 4, background: c.inputBg, overflow: "hidden" }}>
                                    <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(stats.count / max) * 100}%`, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                                  </div>
                                  <span style={{ fontSize: 10, color: c.textMuted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{stats.count}×</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>
          )}

          {/* CUSTOMERS */}
          {view === "klanten" && (
            <CustomersView ownerId={salonData.owner_id} lang={lang} c={c} accent={accent} isMobile={isMobile} toast={toast} />
          )}

          {/* AGENDA */}
          {view === "agenda" && (() => {
            const todayDate = getToday();
            const MON_FULL_NL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
            const MON_FULL_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            const MON_FULL = lang === "nl" ? MON_FULL_NL : MON_FULL_EN;
            const MON_SHORT = lang === "nl" ? MON_NL : MON_EN;

            // Compute the current period's appointments for the summary bar
            let periodAppts = [];
            let periodLabel = "";
            if (calViewMode === "day") {
              // Day view uses calDate directly; the prev/next arrows also
              // shift calDate by ±1 day so this label follows suit.
              periodAppts = filteredAgendaAppts.filter(a => a.date === calDate);
              const d = new Date(calDate + "T12:00:00");
              periodLabel = `${d.getDate()} ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}`;
            } else if (calViewMode === "week") {
              const base = new Date(todayDate);
              base.setDate(base.getDate() + calWeekOffset * 7);
              const weekStart = new Date(base);
              weekStart.setDate(base.getDate() - ((base.getDay() + 6) % 7));
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekStart.getDate() + 6);
              const ws = fmt(weekStart);
              const we = fmt(weekEnd);
              periodAppts = filteredAgendaAppts.filter(a => a.date >= ws && a.date <= we);
              const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
              periodLabel = sameMonth
                ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MON_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
                : `${weekStart.getDate()} ${MON_SHORT[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MON_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
            } else if (calViewMode === "month") {
              const target = new Date(todayDate.getFullYear(), todayDate.getMonth() + calWeekOffset, 1);
              const prefix = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
              periodAppts = filteredAgendaAppts.filter(a => a.date?.startsWith(prefix));
              periodLabel = `${MON_FULL[target.getMonth()]} ${target.getFullYear()}`;
            } else {
              const yr = todayDate.getFullYear() + calWeekOffset;
              periodAppts = filteredAgendaAppts.filter(a => a.date?.startsWith(String(yr)));
              periodLabel = String(yr);
            }
            const periodRevenue = periodAppts.filter(a => a.status === "completed").reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const periodConfirmed = periodAppts.filter(a => a.status === "confirmed").length;
            const periodDone = periodAppts.filter(a => a.status === "completed").length;

            return (
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto" }}>
              {isMobile && <PTitle sub={t.manageAppts}>{t.agenda}</PTitle>}

              {/* Top toolbar — view toggle (left) + period navigator (right) */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 4, padding: 3, background: c.inputBg, borderRadius: 100, border: `1px solid ${c.inputBorder}` }}>
                    {["day", "week", "month", "year"].map(mode => (
                      <div key={mode} onClick={() => { setCalViewMode(mode); setCalWeekOffset(0); if (mode === "day") setCalDate(fmt(getToday())); }} style={{
                        padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                        letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
                        background: calViewMode === mode ? accent : "transparent",
                        color: calViewMode === mode ? c.btnOnDark : c.textSub,
                      }}>{mode === "day" ? (lang === "nl" ? "Dag" : "Day") : mode === "week" ? t.weekView : mode === "month" ? t.monthView : t.yearView}</div>
                    ))}
                  </div>
                  {/* Block-time / block-day button. Opens a quick modal that
                      writes to profile.day_overrides straight away — no need
                      to bounce to the Planning settings screen. */}
                  <button
                    onClick={openBlockModal}
                    style={{
                      padding: "8px 14px", borderRadius: 100, cursor: "pointer",
                      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                      background: `${c.danger}10`, color: c.danger,
                      border: `1px solid ${c.danger}33`,
                      display: "inline-flex", alignItems: "center", gap: 6,
                      fontFamily: "'Jost', sans-serif",
                    }}
                    title={lang === "nl" ? "Blokkeer een tijd of dag" : "Block a time or day"}
                  >
                    <span aria-hidden="true">🚫</span>
                    {lang === "nl" ? "Blokkeer tijd" : "Block time"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {/* Prev/next either shift calWeekOffset (week/month/year)
                      or hop the day by ±1 for the day view — reduces two
                      state variables into one intuitive navigator. */}
                  {(() => {
                    const shift = (dir) => {
                      if (calViewMode === "day") {
                        const d = new Date(calDate + "T12:00:00");
                        d.setDate(d.getDate() + dir);
                        setCalDate(fmt(d));
                      } else {
                        setCalWeekOffset(o => o + dir);
                      }
                    };
                    const isTodayInDay = calViewMode === "day" && calDate === fmt(getToday());
                    const showBackToToday = calViewMode === "day" ? !isTodayInDay : calWeekOffset !== 0;
                    return (
                      <>
                        {showBackToToday && (
                          <div onClick={() => { setCalWeekOffset(0); setCalDate(fmt(getToday())); }} style={{
                            padding: "7px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                            letterSpacing: "0.06em", textTransform: "uppercase",
                            background: `${accent}14`, color: accent, border: `1px solid ${accent}33`
                          }}>{t.backToToday}</div>
                        )}
                        <div onClick={() => shift(-1)} role="button" tabIndex={0} aria-label={lang === "nl" ? "Vorige" : "Previous"} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); shift(-1); } }} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${c.inputBorder}`, color: c.textSub, background: c.bgCard, transition: "all 0.2s" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: c.text, padding: "0 8px", minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>{periodLabel}</div>
                        <div onClick={() => shift(1)} role="button" tabIndex={0} aria-label={lang === "nl" ? "Volgende" : "Next"} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); shift(1); } }} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${c.inputBorder}`, color: c.textSub, background: c.bgCard, transition: "all 0.2s" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Staff filter */}
              {(salonData.staff || []).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  <div onClick={() => setAgendaStaff(null)} style={{
                    padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                    letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
                    background: !agendaStaff ? accent : "transparent",
                    color: !agendaStaff ? c.btnOnDark : c.textSub,
                    border: `1px solid ${!agendaStaff ? accent : c.inputBorder}`
                  }}>{t.everyone}</div>
                  {(salonData.staff || []).map(m => (
                    <div key={m.id} onClick={() => setAgendaStaff(agendaStaff === m.id ? null : m.id)} style={{
                      padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
                      background: agendaStaff === m.id ? accent : "transparent",
                      color: agendaStaff === m.id ? c.btnOnDark : c.textSub,
                      border: `1px solid ${agendaStaff === m.id ? accent : c.inputBorder}`
                    }}>{m.name}</div>
                  ))}
                </div>
              )}

              {/* Period summary strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16, padding: "14px 18px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16 }}>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Totaal" : "Total"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: c.text, lineHeight: 1 }}>{periodAppts.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Bevestigd" : "Confirmed"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: c.text, lineHeight: 1 }}>{periodConfirmed}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Voltooid" : "Completed"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: c.text, lineHeight: 1 }}>{periodDone}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Omzet" : "Revenue"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: accent, lineHeight: 1 }}>€{periodRevenue.toFixed(0)}</div>
                </div>
              </div>

              {/* DAY VIEW — timeline for the selected date so the owner sees
                  the whole day's plan (times + full booking details) in one
                  read. Bounds come from the salon's business hours for that
                  weekday, clamped so appointments outside those hours still
                  fit. Appointments are absolutely positioned by start-minute
                  and stretch to their duration; clicking opens the edit modal. */}
              {calViewMode === "day" && (() => {
                const toMin = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
                const dayOfWeek = new Date(calDate + "T12:00:00").getDay();
                const dayHours = salonData.business_hours?.[dayOfWeek] || {};
                const dayAppts = filteredAgendaAppts.filter(a => a.date === calDate).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
                // Blocks for this date: owner-authored day_override + staff-authored
                // staff_blocks. Time blocks widen the timeline like appointments;
                // full-day blocks span whatever window the timeline ends up using.
                const staffNameById = Object.fromEntries((salonData.staff || []).map(s => [s.id, s.name]));
                const rawBlocks = [];
                const dayOv = (salonData.day_overrides || {})[calDate];
                if (dayOv && dayOv.type === "blocked" && (!agendaStaff || dayOv.staff_id === agendaStaff || !dayOv.staff_id)) {
                  rawBlocks.push({
                    key: `owner-${calDate}`,
                    staffName: dayOv.staff_name || staffNameById[dayOv.staff_id] || null,
                    reason: dayOv.reason || "",
                    timeStart: dayOv.block_time_start || null,
                    timeEnd: dayOv.block_time_end || null,
                  });
                }
                for (const b of (salonData.staff_blocks || [])) {
                  if (b.date !== calDate) continue;
                  if (agendaStaff && b.staff_id !== agendaStaff) continue;
                  rawBlocks.push({
                    key: `sb-${b.id}`,
                    staffName: staffNameById[b.staff_id] || "",
                    reason: b.reason || "",
                    timeStart: b.block_time_start || null,
                    timeEnd: b.block_time_end || null,
                  });
                }
                const openDefault = 8 * 60;
                const closeDefault = 20 * 60;
                let earliestMin = dayHours.closed ? openDefault : toMin(dayHours.open || "08:00");
                let latestMin = dayHours.closed ? closeDefault : toMin(dayHours.close || "20:00");
                for (const a of dayAppts) {
                  const start = toMin(a.time);
                  const end = start + parseInt(a.service_duration || 60);
                  if (start < earliestMin) earliestMin = start;
                  if (end > latestMin) latestMin = end;
                }
                // Widen for time blocks so the block is always visible.
                for (const b of rawBlocks) {
                  if (b.timeStart && b.timeEnd) {
                    const s = toMin(b.timeStart);
                    const e = toMin(b.timeEnd);
                    if (s < earliestMin) earliestMin = s;
                    if (e > latestMin) latestMin = e;
                  }
                }
                // Round to the hour and add padding above / below.
                const startHour = Math.max(0, Math.floor(earliestMin / 60));
                const endHour = Math.min(24, Math.ceil(latestMin / 60));
                const HOUR_HEIGHT = isMobile ? 60 : 68;
                const dayStartMin = startHour * 60;
                const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
                const nowMinutes = (() => {
                  const now = new Date();
                  const nowStr = fmt(now);
                  if (nowStr !== calDate) return null;
                  return now.getHours() * 60 + now.getMinutes();
                })();
                return (
                  <div style={{ marginBottom: 20, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${c.border}`, background: c.inputBg, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: c.text, textTransform: "capitalize" }}>
                        {new Date(calDate + "T12:00:00").toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
                      </div>
                      <div style={{ fontSize: 10, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {dayAppts.length} {dayAppts.length === 1 ? (lang === "nl" ? "afspraak" : "appt") : (lang === "nl" ? "afspraken" : "appts")}
                      </div>
                    </div>
                    <div style={{ display: "flex", position: "relative" }}>
                      {/* Hour rail */}
                      <div style={{ width: isMobile ? 46 : 56, flexShrink: 0, background: c.inputBg, borderRight: `1px solid ${c.border}` }}>
                        {hours.map((h, i) => (
                          <div key={h} style={{ height: HOUR_HEIGHT, padding: "6px 6px 0 0", fontSize: 10, color: c.textMuted, textAlign: "right", borderBottom: i < hours.length - 1 ? `1px dashed ${c.border}` : "none", fontVariantNumeric: "tabular-nums" }}>
                            {String(h).padStart(2, "0")}:00
                          </div>
                        ))}
                      </div>
                      {/* Slots */}
                      <div style={{ flex: 1, position: "relative", minHeight: hours.length * HOUR_HEIGHT }}>
                        {hours.map((h, i) => (
                          <div key={h} style={{ position: "absolute", top: i * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT, borderBottom: i < hours.length - 1 ? `1px dashed ${c.border}` : "none" }} />
                        ))}
                        {/* Now-line */}
                        {nowMinutes !== null && nowMinutes >= dayStartMin && nowMinutes <= endHour * 60 && (
                          <div style={{ position: "absolute", left: 0, right: 0, top: ((nowMinutes - dayStartMin) / 60) * HOUR_HEIGHT, height: 2, background: c.danger, zIndex: 2 }}>
                            <div style={{ position: "absolute", left: -4, top: -3, width: 8, height: 8, borderRadius: "50%", background: c.danger }} />
                          </div>
                        )}
                        {/* Staff / owner blocks — striped red overlay. Full-day
                            blocks span the whole visible window; time blocks
                            only cover their range. Sits BEHIND appointments so
                            an appointment on the same slot still reads clearly. */}
                        {rawBlocks.map(b => {
                          const isTime = b.timeStart && b.timeEnd;
                          const startMin = isTime ? toMin(b.timeStart) : dayStartMin;
                          const endMin = isTime ? toMin(b.timeEnd) : endHour * 60;
                          const top = ((startMin - dayStartMin) / 60) * HOUR_HEIGHT;
                          const height = Math.max(24, ((endMin - startMin) / 60) * HOUR_HEIGHT - 2);
                          const pad2 = n => String(n).padStart(2, "0");
                          const label = isTime
                            ? `${b.timeStart}–${b.timeEnd}`
                            : (lang === "nl" ? "Hele dag" : "All day");
                          return (
                            <div key={b.key} title={b.reason || label}
                              style={{
                                position: "absolute", top, left: 6, right: 6, height,
                                background: `${c.danger}18`,
                                backgroundImage: `repeating-linear-gradient(45deg, transparent 0 8px, ${c.danger}22 8px 12px)`,
                                border: `1px dashed ${c.danger}66`,
                                borderRadius: 6, padding: "6px 10px", overflow: "hidden", zIndex: 1
                              }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.danger} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                                <div style={{ fontSize: 11, fontWeight: 700, color: c.danger, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>{label}</div>
                              </div>
                              <div style={{ fontSize: 11, color: c.text, fontWeight: 500 }}>
                                {b.staffName || (lang === "nl" ? "Iedereen" : "Everyone")}
                              </div>
                              {b.reason && (
                                <div style={{ fontSize: 10, color: c.textSub, marginTop: 2, fontStyle: "italic", wordBreak: "break-word", lineHeight: 1.35 }}>{b.reason}</div>
                              )}
                            </div>
                          );
                        })}
                        {dayAppts.length === 0 && rawBlocks.length === 0 && (() => {
                          // If the current staff filter targets someone whose
                          // working_hours mark this weekday closed, or the
                          // whole salon is closed and no staff overrides it,
                          // say "unavailable" instead of "no appointments".
                          const dow = new Date(calDate + "T12:00:00").getDay();
                          // Exception day overrides normal working hours — a
                          // staff-scoped exception opens THAT specific staff
                          // on THIS date; a salon-wide exception opens
                          // everyone.
                          const dayOv = (salonData.day_overrides || {})[calDate];
                          const isSalonWideException = dayOv?.type === "exception" && !dayOv.staff_id;
                          const exceptionStaffId = dayOv?.type === "exception" ? (dayOv.staff_id || null) : null;
                          let unavailable = false;
                          let unavailableName = "";
                          if (agendaStaff) {
                            const sm = (salonData.staff || []).find(s => s.id === agendaStaff);
                            const wh = sm?.working_hours?.[dow];
                            const openByException = isSalonWideException || exceptionStaffId === agendaStaff;
                            if (sm && !openByException && (!wh || wh.closed)) { unavailable = true; unavailableName = sm.name; }
                          } else if (salonData.account_type === "team") {
                            const anyOpen = isSalonWideException || !!exceptionStaffId || (salonData.staff || []).some(s => {
                              const wh = s.working_hours?.[dow];
                              return wh && !wh.closed;
                            });
                            if (!anyOpen) unavailable = true;
                          } else {
                            const bh = salonData.business_hours?.[dow];
                            if (!bh || bh.closed) {
                              if (!isSalonWideException && !exceptionStaffId) unavailable = true;
                            }
                          }
                          return (
                            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: c.textMuted, fontSize: 12, textAlign: "center", padding: 16, gap: 6 }}>
                              {unavailable ? (
                                <>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>
                                    {lang === "nl"
                                      ? (unavailableName ? `${unavailableName} werkt niet op deze dag` : "Niet beschikbaar op deze dag")
                                      : (unavailableName ? `${unavailableName} doesn't work on this day` : "Unavailable on this day")}
                                  </div>
                                  <div style={{ fontSize: 11, color: c.textMuted, maxWidth: 320, lineHeight: 1.4 }}>
                                    {lang === "nl"
                                      ? "Volgens de ingestelde werkuren. Pas ze aan in Team of Salon-instellingen als dit klopt niet."
                                      : "Based on the current working hours. Change them in Team or Salon settings if this is wrong."}
                                  </div>
                                </>
                              ) : (
                                <div>{lang === "nl" ? "Geen afspraken op deze dag" : "No appointments on this day"}</div>
                              )}
                            </div>
                          );
                        })()}
                        {dayAppts.map(a => {
                          const startMin = toMin(a.time);
                          const durMin = Math.max(15, parseInt(a.service_duration || 60));
                          const top = ((startMin - dayStartMin) / 60) * HOUR_HEIGHT;
                          const height = Math.max(28, (durMin / 60) * HOUR_HEIGHT - 2);
                          const isCancelled = a.status === "cancelled" || a.status === "no_show";
                          const color = isCancelled ? c.danger : a.status === "completed" ? c.success : accent;
                          return (
                            <div key={a._slotKey || a.id} onClick={() => openEditAppt(a)}
                              style={{
                                position: "absolute", top, left: 6, right: 6, height,
                                background: `${color}18`, borderLeft: `3px solid ${color}`, borderRadius: 6,
                                padding: "6px 10px", overflow: "hidden", cursor: "pointer",
                                opacity: isCancelled ? 0.55 : 1
                              }}>
                              {(() => {
                                const pad2 = n => String(n).padStart(2, "0");
                                const endMinLocal = startMin + durMin;
                                const endTime = `${pad2(Math.floor(endMinLocal / 60) % 24)}:${pad2(endMinLocal % 60)}`;
                                return (
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{a.time}–{endTime}</div>
                                    <div style={{ fontSize: 10, color: c.textMuted, fontVariantNumeric: "tabular-nums" }}>{durMin} {t.min}</div>
                                  </div>
                                );
                              })()}
                              <div style={{ fontSize: 12, fontWeight: 500, color: c.text, wordBreak: "break-word", lineHeight: 1.35 }}>{a.client_name}</div>
                              <div style={{ fontSize: 10, color: c.textSub, marginTop: 2, wordBreak: "break-word", lineHeight: 1.35 }}>{a.service_name}</div>
                              {a.staff_name && (
                                <div style={{ fontSize: 9, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 100, background: `${accent}20`, color: accent, border: `1px solid ${accent}44`, fontWeight: 700, letterSpacing: "0.04em" }}>
                                  <NavIcon name="user" size={8} color={accent} /> {a.staff_name}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* WEEK VIEW — calendar grid with appointment previews */}
              {calViewMode === "week" && (() => {
                const base = getToday();
                base.setDate(base.getDate() + calWeekOffset * 7);
                const dayOfWeek = (base.getDay() + 6) % 7;
                const weekStart = new Date(base);
                weekStart.setDate(base.getDate() - dayOfWeek);
                const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
                const DAY_HEADERS = lang === "nl" ? ["Ma","Di","Wo","Do","Vr","Za","Zo"] : ["Mo","Tu","We","Th","Fr","Sa","Su"];
                return (
                  <div style={{ marginBottom: 20, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                    {weekDays.map((d, i) => {
                      const ds = fmt(d);
                      const isToday = ds === fmt(getToday());
                      const isSel = calDate === ds;
                      const dayAppts = filteredAgendaAppts.filter(a => a.date === ds).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
                      const visibleAppts = dayAppts.slice(0, isMobile ? 2 : 5);
                      const moreCount = dayAppts.length - visibleAppts.length;
                      // Blocks on this date — filtered against the staff-scope pill.
                      // A block with staff_id === null blocks everyone; a specific
                      // staff_id only blocks that person, so when the "iedereen"
                      // filter is on we show it too (it's still relevant info).
                      const ov = salonData.day_overrides?.[ds];
                      const blockMatchesStaff = ov && ov.type === "blocked" && (
                        !agendaStaff || !ov.staff_id || ov.staff_id === agendaStaff
                      );
                      // Staff-authored blocks (staff_day_overrides). Owner sees
                      // them so they know why a stylist isn't bookable.
                      const staffBlocksHere = (salonData.staff_blocks || [])
                        .filter(b => b.date === ds && (!agendaStaff || b.staff_id === agendaStaff));
                      const staffNameById = (id) => (salonData.staff || []).find(sm => sm.id === id)?.name || "";
                      const staffFullDayBlock = staffBlocksHere.find(b => !b.block_time_start);
                      const staffTimeBlocks = staffBlocksHere.filter(b => b.block_time_start);
                      const isFullDayBlocked = (blockMatchesStaff && !ov.block_time_start) || !!staffFullDayBlock;
                      const isTimeBlocked = blockMatchesStaff && !!ov.block_time_start;
                      return (
                        <div key={i} role="button" tabIndex={0}
                          onClick={() => { setCalDate(ds); setCalViewMode("day"); }}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCalDate(ds); setCalViewMode("day"); } }}
                          style={{ borderRight: i < 6 ? `1px solid ${c.border}` : "none", cursor: "pointer", display: "flex", flexDirection: "column", background: isSel ? `${accent}22` : isFullDayBlocked ? `${c.danger}0d` : isToday ? `${accent}08` : "transparent", position: "relative" }}>
                          {/* Diagonal stripe overlay for fully-blocked days —
                              visually unmistakable without eating readable space. */}
                          {isFullDayBlocked && (
                            <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `repeating-linear-gradient(45deg, transparent 0 8px, ${c.danger}14 8px 9px)` }} />
                          )}
                          {/* Day header */}
                          <div style={{ textAlign: "center", padding: isMobile ? "8px 2px 6px" : "10px 4px", background: c.inputBg, borderBottom: `1px solid ${c.border}`, position: "relative" }}>
                            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: isToday ? accent : c.textLabel, marginBottom: 4 }}>{DAY_HEADERS[i]}</div>
                            <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? c.btnOnDark : c.text, width: isToday ? 24 : "auto", height: isToday ? 24 : "auto", borderRadius: isToday ? "50%" : 0, background: isToday ? accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: isToday ? 24 : "auto" }}>{d.getDate()}</div>
                          </div>
                          {/* Day content */}
                          <div style={{ flex: 1, minHeight: isMobile ? 80 : 160, padding: isMobile ? "6px 3px 8px" : "8px 8px 10px", display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
                            {isFullDayBlocked && (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: isMobile ? "6px 2px" : "8px 4px", background: `${c.danger}18`, border: `1px solid ${c.danger}44`, borderRadius: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                  <svg width={isMobile ? 10 : 12} height={isMobile ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke={c.danger} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                                  <div style={{ fontSize: isMobile ? 8 : 10, fontWeight: 700, color: c.danger, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                    {lang === "nl" ? "Gesloten" : "Closed"}
                                  </div>
                                </div>
                                {ov.staff_name && (
                                  <div style={{ fontSize: isMobile ? 7 : 9, color: c.danger, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{ov.staff_name}</div>
                                )}
                              </div>
                            )}
                            {isTimeBlocked && (
                              <div style={{ display: "flex", alignItems: "center", gap: 3, padding: isMobile ? "3px 4px" : "4px 6px", background: `${c.danger}14`, border: `1px solid ${c.danger}33`, borderRadius: 4 }}>
                                <svg width={isMobile ? 8 : 10} height={isMobile ? 8 : 10} viewBox="0 0 24 24" fill="none" stroke={c.danger} strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                                <div style={{ fontSize: isMobile ? 8 : 9, fontWeight: 600, color: c.danger, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ov.block_time_start}–{ov.block_time_end}</div>
                              </div>
                            )}
                            {staffFullDayBlock && !isFullDayBlocked && (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: isMobile ? "4px 2px" : "6px 4px", background: `${c.danger}18`, border: `1px solid ${c.danger}44`, borderRadius: 6 }}>
                                <div style={{ fontSize: isMobile ? 8 : 10, fontWeight: 700, color: c.danger, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Vrij" : "Off"}</div>
                                <div style={{ fontSize: isMobile ? 7 : 9, color: c.danger, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{staffNameById(staffFullDayBlock.staff_id)}</div>
                              </div>
                            )}
                            {staffTimeBlocks.map(b => (
                              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: isMobile ? "3px 4px" : "4px 6px", background: `${c.danger}14`, border: `1px solid ${c.danger}33`, borderRadius: 4 }} title={staffNameById(b.staff_id)}>
                                <svg width={isMobile ? 8 : 10} height={isMobile ? 8 : 10} viewBox="0 0 24 24" fill="none" stroke={c.danger} strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                                <div style={{ fontSize: isMobile ? 8 : 9, fontWeight: 600, color: c.danger, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.block_time_start}–{b.block_time_end}</div>
                              </div>
                            ))}
                            {dayAppts.length === 0 && !isFullDayBlocked && !isTimeBlocked && staffBlocksHere.length === 0 ? (
                              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: 11, color: c.textMuted }}>—</div>
                            ) : dayAppts.length === 0 ? null : (
                              <>
                                {visibleAppts.map((a, ai) => {
                                  const isCancelled = a.status === "cancelled" || a.status === "no_show";
                                  const statusColor = isCancelled ? c.danger : a.status === "completed" ? c.success : accent;
                                  return (
                                    <div key={ai} style={{ padding: isMobile ? "2px 3px" : "4px 6px", borderRadius: 4, background: `${statusColor}14`, borderLeft: `2.5px solid ${statusColor}`, overflow: "hidden", opacity: isCancelled ? 0.5 : 1 }}>
                                      {(() => {
                                        const [ah, am] = (a.time || "0:0").split(":").map(Number);
                                        const startMin = ah * 60 + (am || 0);
                                        const endMin = startMin + parseInt(a.service_duration || 60);
                                        const pad2 = n => String(n).padStart(2, "0");
                                        const endTime = `${pad2(Math.floor(endMin / 60) % 24)}:${pad2(endMin % 60)}`;
                                        return (
                                          <div style={{ fontSize: isMobile ? 8 : 10, fontWeight: 600, color: statusColor, fontVariantNumeric: "tabular-nums", textDecoration: isCancelled ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {a.time}–{endTime}
                                          </div>
                                        );
                                      })()}
                                      <div style={{ fontSize: isMobile ? 8 : 10, color: c.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: isCancelled ? "line-through" : "none" }}>{a.client_name?.split(" ")[0] || ""}</div>
                                      {!isMobile && <div style={{ fontSize: 9, color: c.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.service_name?.split(" — ")[0] || a.service_name}</div>}
                                      {a.staff_name && (
                                        <div style={{ fontSize: isMobile ? 7 : 9, color: accent, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1, letterSpacing: "0.03em" }}>
                                          · {a.staff_name.split(",")[0].trim()}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {moreCount > 0 && <div style={{ fontSize: isMobile ? 8 : 9, color: accent, fontWeight: 600, textAlign: "center" }}>+{moreCount}</div>}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* MONTH VIEW — proper calendar grid with lines */}
              {calViewMode === "month" && (() => {
                const base = getToday();
                const targetMonth = new Date(base.getFullYear(), base.getMonth() + calWeekOffset, 1);
                const year = targetMonth.getFullYear();
                const month = targetMonth.getMonth();
                const firstOfMonth = new Date(year, month, 1);
                const lastOfMonth = new Date(year, month + 1, 0);
                const startDay = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
                const daysInMonth = lastOfMonth.getDate();
                // Build cells including leading/trailing days from prev/next month for a full 6-row grid
                const cells = [];
                // Leading days from previous month
                const prevMonthLast = new Date(year, month, 0).getDate();
                for (let i = startDay - 1; i >= 0; i--) {
                  const d = prevMonthLast - i;
                  const prevMonth = month === 0 ? 11 : month - 1;
                  const prevYear = month === 0 ? year - 1 : year;
                  cells.push({ day: d, month: prevMonth, year: prevYear, muted: true });
                }
                // Current month days
                for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, month, year, muted: false });
                // Trailing days from next month — fill to complete rows
                const totalCells = Math.ceil(cells.length / 7) * 7;
                const needed = totalCells - cells.length;
                for (let d = 1; d <= needed; d++) {
                  const nextMonth = month === 11 ? 0 : month + 1;
                  const nextYear = month === 11 ? year + 1 : year;
                  cells.push({ day: d, month: nextMonth, year: nextYear, muted: true });
                }
                const DAY_HEADERS = lang === "nl" ? ["Ma","Di","Wo","Do","Vr","Za","Zo"] : ["Mo","Tu","We","Th","Fr","Sa","Su"];
                const rows = cells.length / 7;
                return (
                  <div style={{ marginBottom: 20, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
                    {/* Day headers */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${c.border}`, background: c.inputBg }}>
                      {DAY_HEADERS.map((dh, i) => (
                        <div key={dh} style={{
                          textAlign: "center", fontSize: 10, fontWeight: 600, color: c.textLabel,
                          padding: "10px 0", letterSpacing: "0.12em", textTransform: "uppercase",
                          borderRight: i < 6 ? `1px solid ${c.border}` : "none"
                        }}>{dh}</div>
                      ))}
                    </div>
                    {/* Calendar grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                      {cells.map((cell, i) => {
                        const ds = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
                        const isSel = calDate === ds;
                        const isToday = ds === fmt(getToday());
                        const count = filteredAgendaAppts.filter(a => a.date === ds).length;
                        const dayAppts = filteredAgendaAppts.filter(a => a.date === ds).slice(0, 3);
                        const col = i % 7;
                        const row = Math.floor(i / 7);
                        return (
                          <div key={i} onClick={() => {
                            setCalDate(ds);
                            setCalViewMode("week");
                            const clickedDate = new Date(ds + "T12:00:00");
                            const today = getToday();
                            const clickedMonday = new Date(clickedDate);
                            clickedMonday.setDate(clickedDate.getDate() - ((clickedDate.getDay() + 6) % 7));
                            const todayMonday = new Date(today);
                            todayMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
                            const weekDiff = Math.round((clickedMonday - todayMonday) / (7 * 24 * 60 * 60 * 1000));
                            setCalWeekOffset(weekDiff);
                          }} style={{
                            minHeight: isMobile ? 48 : 92, padding: isMobile ? "6px 4px" : "8px 8px 6px", cursor: "pointer", position: "relative",
                            background: isSel ? `${accent}22` : (() => {
                              if (cell.muted) return "transparent";
                              const ov = salonData.day_overrides?.[ds];
                              const blocked = ov?.type === "blocked" && !ov.block_time_start && (!agendaStaff || !ov.staff_id || ov.staff_id === agendaStaff);
                              return blocked ? `${c.danger}12` : isToday ? `${accent}10` : "transparent";
                            })(),
                            borderRight: col < 6 ? `1px solid ${c.border}` : "none",
                            borderBottom: row < rows - 1 ? `1px solid ${c.border}` : "none",
                            transition: "background 0.15s",
                            opacity: cell.muted ? 0.35 : 1,
                            display: "flex", flexDirection: "column", gap: 3, alignItems: isMobile ? "center" : "stretch"
                          }}>
                            {(() => {
                              if (cell.muted) return null;
                              const ov = salonData.day_overrides?.[ds];
                              if (!ov || ov.type !== "blocked") return null;
                              if (agendaStaff && ov.staff_id && ov.staff_id !== agendaStaff) return null;
                              const isFull = !ov.block_time_start;
                              return (
                                <>
                                  {isFull && (
                                    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `repeating-linear-gradient(45deg, transparent 0 6px, ${c.danger}18 6px 7px)` }} />
                                  )}
                                  <div style={{ position: "absolute", top: 4, right: 4, display: "flex", alignItems: "center", gap: 2 }}>
                                    <svg width={isMobile ? 9 : 11} height={isMobile ? 9 : 11} viewBox="0 0 24 24" fill="none" stroke={c.danger} strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                                  </div>
                                </>
                              );
                            })()}
                            <div style={{
                              fontSize: 12, fontWeight: isToday ? 700 : 500,
                              color: isToday ? c.btnOnDark : isSel ? accent : c.text,
                              width: isToday ? 24 : "auto", height: isToday ? 24 : "auto",
                              borderRadius: isToday ? "50%" : 0,
                              background: isToday ? accent : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center"
                            }}>{cell.day}</div>
                            {!cell.muted && count > 0 && isMobile && (
                              <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                                {Array.from({ length: Math.min(count, 3) }).map((_, di) => (
                                  <div key={di} style={{ width: 5, height: 5, borderRadius: "50%", background: accent }} />
                                ))}
                                {count > 3 && <div style={{ fontSize: 9, color: accent, fontWeight: 700, lineHeight: "5px" }}>+</div>}
                              </div>
                            )}
                            {!cell.muted && !isMobile && (<>
                              {dayAppts.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                                  {dayAppts.map((a, ai) => (
                                    <div key={ai} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${accent}1a`, color: c.textSub, borderLeft: `2px solid ${accent}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {a.time}{a.service_duration ? ` (${a.service_duration}m)` : ""} {a.client_name?.split(" ")[0] || ""}
                                    </div>
                                  ))}
                                  {count > 3 && <div style={{ fontSize: 9, color: c.textMuted, paddingLeft: 2 }}>+{count - 3}</div>}
                                </div>
                              )}
                              {count > 0 && (
                                <div style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 100, background: `${accent}22`, color: accent, alignSelf: "flex-end" }}>{count}</div>
                              )}
                            </>)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* YEAR VIEW */}
              {calViewMode === "year" && (() => {
                const baseYear = getToday().getFullYear() + calWeekOffset;
                const currentMonth = getToday().getMonth();
                const currentYear = getToday().getFullYear();
                const monthCounts = Array.from({ length: 12 }, (_, mi) => {
                  const monthPrefix = `${baseYear}-${String(mi + 1).padStart(2, "0")}`;
                  return filteredAgendaAppts.filter(a => a.date?.startsWith(monthPrefix)).length;
                });
                const maxMonthCount = Math.max(...monthCounts, 1);
                return (
                  <div style={{ marginBottom: 20, display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10 }}>
                    {MON_FULL.map((monthName, mi) => {
                      const isCurrent = baseYear === currentYear && mi === currentMonth;
                      const count = monthCounts[mi];
                      const pct = (count / maxMonthCount) * 100;
                      return (
                        <div key={mi} onClick={() => {
                          setCalViewMode("month");
                          const now = getToday();
                          setCalWeekOffset((baseYear - now.getFullYear()) * 12 + mi - now.getMonth());
                        }} style={{
                          padding: "16px 18px", borderRadius: 14, cursor: "pointer",
                          background: isCurrent ? `${accent}12` : c.bgCard,
                          border: `1px solid ${isCurrent ? `${accent}55` : c.border}`,
                          transition: "all 0.2s",
                          display: "flex", flexDirection: "column", gap: 10
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 400, color: c.text }}>{monthName}</div>
                            {isCurrent && <div style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: `${accent}22`, color: accent, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Nu" : "Now"}</div>}
                          </div>
                          <div>
                            <div style={{ height: 4, borderRadius: 3, background: c.inputBg, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: accent, borderRadius: 3, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                            </div>
                            <div style={{ fontSize: 10, color: count > 0 ? c.textSub : c.textMuted, marginTop: 6 }}>
                              {count > 0 ? `${count} ${t.appts?.toLowerCase() || "afspraken"}` : (lang === "nl" ? "Geen afspraken" : "No appointments")}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Blocked-day banner — sits above the appointments list so the
                  owner instantly sees why the day is "empty", and can undo
                  the block if it was a mistake. Same scope-rules as the week
                  strip: an all-staff block always shows; a staff-specific
                  block only shows when its person is the selected filter. */}
              {calViewMode !== "year" && (() => {
                const ov = salonData.day_overrides?.[calDate];
                if (!ov || ov.type !== "blocked") return null;
                if (agendaStaff && ov.staff_id && ov.staff_id !== agendaStaff) return null;
                const isTimeBlock = !!ov.block_time_start;
                const unblock = async () => {
                  const label = isTimeBlock
                    ? (lang === "nl" ? `tijdvak ${ov.block_time_start}–${ov.block_time_end}` : `${ov.block_time_start}–${ov.block_time_end} time block`)
                    : (lang === "nl" ? "geblokkeerde dag" : "blocked day");
                  if (!window.confirm(lang === "nl" ? `Deblokkeer deze ${label}?` : `Unblock this ${label}?`)) return;
                  const next = { ...(salonData.day_overrides || {}) };
                  if (isTimeBlock || !ov.from || ov.from === ov.to) {
                    delete next[calDate];
                  } else {
                    // Multi-day range block: remove every date in the range so
                    // the whole span disappears (matches how it was created).
                    let cur = new Date(ov.from);
                    const end = new Date(ov.to);
                    while (cur <= end) {
                      const k = fmt(cur);
                      if (next[k] && next[k].type === "blocked" && next[k].from === ov.from) delete next[k];
                      cur.setDate(cur.getDate() + 1);
                    }
                  }
                  const { error } = await supabase
                    .from("profiles")
                    .update({ day_overrides: next })
                    .eq("id", salonData.owner_id);
                  if (error) { toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error"); return; }
                  update(d => { d.day_overrides = next; return d; });
                  toast.show(lang === "nl" ? "Blokkade verwijderd" : "Block removed");
                };
                return (
                  <div style={{ marginBottom: 12, padding: "12px 14px", background: `${c.danger}0f`, border: `1px solid ${c.danger}44`, borderRadius: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: `${c.danger}22`, flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.danger} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: c.danger, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
                        {isTimeBlock
                          ? (lang === "nl" ? `Geblokkeerd ${ov.block_time_start}–${ov.block_time_end}` : `Blocked ${ov.block_time_start}–${ov.block_time_end}`)
                          : (lang === "nl" ? "Dag geblokkeerd" : "Day blocked")}
                      </div>
                      <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.4 }}>
                        {ov.staff_name
                          ? (lang === "nl" ? `${ov.staff_name} · ` : `${ov.staff_name} · `)
                          : (lang === "nl" ? "Iedereen · " : "Everyone · ")}
                        {ov.reason || (lang === "nl" ? "Geen reden opgegeven" : "No reason given")}
                      </div>
                    </div>
                    <button className="btn-ghost" onClick={unblock}
                      style={{ fontSize: 10, padding: "8px 14px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: c.danger, borderColor: `${c.danger}55` }}>
                      {lang === "nl" ? "Deblokkeer" : "Unblock"}
                    </button>
                  </div>
                );
              })()}

              {/* Staff-authored block banners (staff_day_overrides). One card
                  per matching row so the owner can unblock each individually. */}
              {calViewMode !== "year" && (salonData.staff_blocks || [])
                .filter(b => b.date === calDate && (!agendaStaff || b.staff_id === agendaStaff))
                .map(b => {
                  const isTimeBlock = !!b.block_time_start;
                  const staffName = (salonData.staff || []).find(sm => sm.id === b.staff_id)?.name || "";
                  const removeBlock = async () => {
                    if (!window.confirm(lang === "nl" ? `Deblokkade van ${staffName} verwijderen?` : `Remove ${staffName}'s block?`)) return;
                    const { error } = await supabase.from("staff_day_overrides").delete().eq("id", b.id);
                    if (error) { toast.show(lang === "nl" ? "Verwijderen mislukt" : "Delete failed", "error"); return; }
                    update(d => { d.staff_blocks = (d.staff_blocks || []).filter(x => x.id !== b.id); return d; });
                    toast.show(lang === "nl" ? "Blokkade verwijderd" : "Block removed");
                  };
                  return (
                    <div key={b.id} style={{ marginBottom: 12, padding: "12px 14px", background: `${c.danger}0f`, border: `1px solid ${c.danger}44`, borderRadius: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: `${c.danger}22`, flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.danger} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: c.danger, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
                          {isTimeBlock
                            ? (lang === "nl" ? `${staffName} geblokkeerd ${b.block_time_start}–${b.block_time_end}` : `${staffName} blocked ${b.block_time_start}–${b.block_time_end}`)
                            : (lang === "nl" ? `${staffName} is vrij` : `${staffName} is off`)}
                        </div>
                        <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.4 }}>
                          {b.reason || (lang === "nl" ? "Eigen blokkade — geen reden opgegeven" : "Own block — no reason given")}
                        </div>
                      </div>
                      <button className="btn-ghost" onClick={removeBlock}
                        style={{ fontSize: 10, padding: "8px 14px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: c.danger, borderColor: `${c.danger}55` }}>
                        {lang === "nl" ? "Deblokkeer" : "Unblock"}
                      </button>
                    </div>
                  );
                })}

              {/* Appointments list (week/month views) */}
              {calViewMode !== "year" && (<>
                {/* Persistent "+ Afspraak" button — visible above the list on
                    every day so the owner can add multiple bookings without
                    having to first empty the day. */}
                <button className="btn-ghost" style={{ width: "100%", marginBottom: 12, padding: "12px 18px", borderStyle: "dashed", borderColor: `${accent}44`, color: accent, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}
                  onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ services: [{ id: `s_${Date.now()}`, service_id: "", variant_id: "", extra_ids: [], staff_id: "" }], date: calDate, time: "", client_name: "", client_email: "", client_phone: "", client_allergies: "" }); setClientSearch(""); setClientMode("existing"); setShowClientDropdown(false); }}>
                  <NavIcon name="plus" size={14} color="currentColor" /> {t.addAppointment}
                </button>
                {calAppts.length === 0 ? (() => {
                  // Same logic as the day-timeline empty state: if working
                  // hours say nobody works this day, call it "unavailable"
                  // instead of the ambiguous "no appointments".
                  const dow = new Date(calDate + "T12:00:00").getDay();
                  let unavailable = false;
                  let unavailableName = "";
                  if (agendaStaff) {
                    const sm = (salonData.staff || []).find(s => s.id === agendaStaff);
                    const wh = sm?.working_hours?.[dow];
                    if (sm && (!wh || wh.closed)) { unavailable = true; unavailableName = sm.name; }
                  } else if (salonData.account_type === "team") {
                    const anyOpen = (salonData.staff || []).some(s => {
                      const wh = s.working_hours?.[dow];
                      return wh && !wh.closed;
                    });
                    if (!anyOpen) unavailable = true;
                  } else {
                    const bh = salonData.business_hours?.[dow];
                    if (!bh || bh.closed) unavailable = true;
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 20px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16 }}>
                      <div style={{ opacity: 0.4 }}><NavIcon name="calendar" size={36} color={c.textMuted} /></div>
                      {unavailable ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, textAlign: "center" }}>
                            {lang === "nl"
                              ? (unavailableName ? `${unavailableName} werkt niet op deze dag` : "Niet beschikbaar op deze dag")
                              : (unavailableName ? `${unavailableName} doesn't work on this day` : "Unavailable on this day")}
                          </div>
                          <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", maxWidth: 340, lineHeight: 1.4 }}>
                            {lang === "nl"
                              ? "Volgens de ingestelde werkuren. Pas ze aan in Team of Salon-instellingen als dit niet klopt."
                              : "Based on the current working hours. Change them in Team or Salon settings if this is wrong."}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: c.textSub, textAlign: "center" }}>
                          {calDate === fmt(getToday()) ? t.noTodayAppts : (lang === "nl" ? "Geen afspraken op deze dag" : "No appointments on this day")}
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  calAppts.map(a => renderApptCard(a))
                )}
                {calAppts.length > 0 && (
                  <button className="btn-ghost" style={{ width: "100%", marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => exportCalendar(calAppts)}>
                    <NavIcon name="download" size={13} color="currentColor" /> {lang === "nl" ? `Exporteer ${calAppts.length} afspraak(en)` : `Export ${calAppts.length} appointment(s)`}
                  </button>
                )}
              </>)}
            </div>
            );
          })()}

          {/* FACTUREN */}
          {view === "facturen" && (() => {
            // Operational counts/filters are scoped to non-hidden, non-deleted
            // invoices so the stat cards line up with the rows the owner sees
            // in the Alles/Open/Verstuurd tabs. The Verborgen tab gets its own
            // bucket from `hiddenAppts`.
            const visibleCompleted = completedAppts.filter(a => a.invoice_view_state !== "hidden" && a.invoice_view_state !== "deleted");
            const hiddenAppts = completedAppts.filter(a => a.invoice_view_state === "hidden");
            const unsent = visibleCompleted.filter(a => !a.invoice_sent);
            const sent = visibleCompleted.filter(a => a.invoice_sent);
            const unsentTotal = unsent.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const thisMonthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
            const thisMonthAppts = visibleCompleted.filter(a => a.date?.startsWith(thisMonthPrefix));
            const thisMonthTotal = thisMonthAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);

            const formatDate = (ds) => {
              if (!ds) return "";
              const d = new Date(ds);
              const MON = lang === "nl" ? MON_NL : MON_EN;
              return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
            };
            const initials = (name) => {
              if (!name) return "?";
              const parts = name.trim().split(/\s+/);
              return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
            };

            return (
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto" }}>
              {isMobile && <PTitle sub={t.completedTreatments}>{t.invoices}</PTitle>}

              {completedAppts.length > 0 && (<>
                {/* Stat cards — scoped to visible invoices so the percentages
                    match the rows the owner sees in the tabs below. Hidden
                    invoices live in their own bucket; deleted ones are excluded
                    everywhere. */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14, gridAutoRows: "1fr" }}>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.totalEarnings}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: accent, lineHeight: 1 }}>€{visibleCompleted.reduce((s, a) => s + parseFloat(a.service_price || 0), 0).toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{visibleCompleted.length} {t.treatments}</div>
                  </div>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Deze maand" : "This month"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.text, lineHeight: 1 }}>€{thisMonthTotal.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{thisMonthAppts.length} {t.treatments}</div>
                  </div>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Te versturen" : "Unsent"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: unsent.length > 0 ? c.warning : c.text, lineHeight: 1 }}>{unsent.length}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>€{unsentTotal.toFixed(0)}</div>
                  </div>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Verstuurd" : "Sent"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.success, lineHeight: 1 }}>{sent.length}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{visibleCompleted.length > 0 ? Math.round((sent.length / visibleCompleted.length) * 100) : 0}%</div>
                  </div>
                </div>

                {/* Revenue report (PDF) — generate a tax/accountant-ready PDF
                    for a selected period. Runs entirely client-side via jsPDF,
                    so the owner gets an instant download with no server round
                    trip. */}
                <RevenueReportBlock
                  salonData={salonData}
                  completedAppts={completedAppts}
                  lang={lang}
                  c={c}
                  accent={accent}
                  toast={toast}
                />

                {/* Search + filter toolbar */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: c.textMuted, pointerEvents: "none", display: "flex" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    </div>
                    <input className="input-field" placeholder={t.searchPlaceholder} value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
                      style={{ width: "100%", fontSize: 12, padding: "11px 14px 11px 38px" }} />
                    {invoiceSearch && (
                      <button onClick={() => setInvoiceSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", background: c.inputBorder, border: "none", color: c.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, padding: 3, background: c.inputBg, borderRadius: 100, border: `1px solid ${c.inputBorder}`, flexWrap: "wrap" }}>
                    {[
                      ["all", lang === "nl" ? "Alles" : "All", visibleCompleted.length],
                      ["unsent", lang === "nl" ? "Open" : "Unsent", unsent.length],
                      ["sent", lang === "nl" ? "Verstuurd" : "Sent", sent.length],
                      ["hidden", lang === "nl" ? "Verborgen" : "Hidden", hiddenAppts.length],
                    ].map(([key, label, count]) => (
                      <div key={key} onClick={() => setInvoiceFilter(key)} style={{
                        padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                        letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
                        background: invoiceFilter === key ? accent : "transparent",
                        color: invoiceFilter === key ? c.btnOnDark : c.textSub,
                        display: "inline-flex", alignItems: "center", gap: 6
                      }}>
                        {label}
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 100, background: invoiceFilter === key ? `${c.btnOnDark}22` : c.inputBorder, color: invoiceFilter === key ? c.btnOnDark : c.textMuted, fontWeight: 700 }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>)}

              {/* Invoice list */}
              {(() => {
                const searchLower = invoiceSearch.toLowerCase();
                // Source bucket per tab: the 3 operational tabs run on visible
                // invoices only, "hidden" gets its own bucket. Deleted invoices
                // never appear here regardless of tab.
                const source = invoiceFilter === "hidden" ? hiddenAppts : visibleCompleted;
                const filtered = source.filter(a => {
                  if (invoiceFilter === "sent" && !a.invoice_sent) return false;
                  if (invoiceFilter === "unsent" && a.invoice_sent) return false;
                  if (searchLower && !a.client_name?.toLowerCase().includes(searchLower) && !a.service_name?.toLowerCase().includes(searchLower)) return false;
                  return true;
                });
                if (completedAppts.length === 0) return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "60px 20px", background: c.bgCard, border: `1px dashed ${c.border}`, borderRadius: 16 }}>
                    <div style={{ opacity: 0.4 }}><NavIcon name="facturen" size={36} color={c.textMuted} /></div>
                    <div style={{ fontSize: 13, color: c.textSub, textAlign: "center" }}>{t.noCompleted}</div>
                    <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", maxWidth: 320 }}>{lang === "nl" ? "Facturen verschijnen hier zodra je een afspraak als voltooid markeert." : "Invoices appear here once you mark an appointment as completed."}</div>
                  </div>
                );
                if (filtered.length === 0) return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 20px", background: c.bgCard, border: `1px dashed ${c.border}`, borderRadius: 16 }}>
                    <div style={{ opacity: 0.4 }}><NavIcon name="eye" size={30} color={c.textMuted} /></div>
                    <div style={{ fontSize: 12, color: c.textSub }}>{lang === "nl" ? "Geen resultaten voor deze filter" : "No results for this filter"}</div>
                    {(invoiceSearch || invoiceFilter !== "all") && (
                      <button className="btn-ghost" style={{ padding: "8px 16px" }} onClick={() => { setInvoiceSearch(""); setInvoiceFilter("all"); }}>
                        {lang === "nl" ? "Filter wissen" : "Clear filter"}
                      </button>
                    )}
                  </div>
                );
                const visible = invoicesExpanded ? filtered : filtered.slice(0, 10);
                return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {visible.map(a => {
                    const isSending = processingApptId === a.id;
                    return (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "14px 18px", background: c.bgCard,
                        border: `1px solid ${a.invoice_sent ? c.border : `${c.warning}33`}`,
                        borderRadius: 14, transition: "border-color 0.15s"
                      }}>
                        {/* Avatar */}
                        <div style={{
                          width: 42, height: 42, borderRadius: "50%",
                          background: `${accent}14`, border: `1px solid ${accent}22`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 600, color: accent, flexShrink: 0,
                          letterSpacing: "0.04em"
                        }}>{initials(a.client_name)}</div>

                        {/* Client + service */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.client_name}</span>
                            {!a.invoice_sent && (
                              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 100, background: `${c.warning}1f`, color: c.warning, border: `1px solid ${c.warning}44`, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                                {lang === "nl" ? "Open" : "Unsent"}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: c.textMuted, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span>{formatDate(a.date)}</span>
                            <span>·</span>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.service_name}</span>
                            {a.staff_name && <><span>·</span><span>{a.staff_name}</span></>}
                          </div>
                        </div>

                        {/* Price */}
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent, flexShrink: 0, lineHeight: 1 }}>€{parseFloat(a.service_price || 0).toFixed(2)}</div>

                        {/* Action */}
                        <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                          {a.invoice_view_state === "hidden" ? (
                            <>
                              <span style={{ fontSize: 10, color: c.textMuted, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 100, background: c.inputBg, border: `1px solid ${c.inputBorder}`, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                <NavIcon name="eye" size={10} color="currentColor" /> {lang === "nl" ? "Verborgen" : "Hidden"}
                              </span>
                              <button
                                className="btn-ghost"
                                style={{ padding: "6px 10px", fontSize: 10, display: "inline-flex", alignItems: "center", gap: 5 }}
                                onClick={() => setInvoiceViewState(a.id, null)}
                                title={lang === "nl" ? "Terugzetten" : "Restore"}
                              >
                                {lang === "nl" ? "Terugzetten" : "Restore"}
                              </button>
                              <button
                                aria-label={lang === "nl" ? "Definitief verwijderen" : "Delete permanently"}
                                onClick={async () => { if (await showConfirm(lang === "nl" ? "Factuur definitief verwijderen? (afspraak blijft bestaan)" : "Delete invoice permanently? (the appointment itself stays)")) setInvoiceViewState(a.id, "deleted"); }}
                                style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                title={lang === "nl" ? "Definitief verwijderen" : "Delete permanently"}
                              >
                                <NavIcon name="xmark" size={11} color="currentColor" />
                              </button>
                            </>
                          ) : (
                            <>
                              {a.invoice_sent ? (
                                <span style={{ fontSize: 10, color: c.success, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 100, background: `${c.success}14`, border: `1px solid ${c.success}33`, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                  <NavIcon name="check" size={10} color={c.success} /> {t.sent}
                                </span>
                              ) : (
                                <button className="btn-ghost" style={{ padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 6, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => sendInvoice(a.id)}>
                                  {isSending ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                                    </svg>
                                  ) : (
                                    <NavIcon name="send" size={11} color="currentColor" />
                                  )}
                                  {isSending ? "..." : t.send}
                                </button>
                              )}
                              <button
                                aria-label={lang === "nl" ? "Verbergen" : "Hide"}
                                onClick={() => setInvoiceViewState(a.id, "hidden")}
                                style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                title={lang === "nl" ? "Verbergen" : "Hide"}
                              >
                                <NavIcon name="eye" size={11} color="currentColor" />
                              </button>
                              <button
                                aria-label={lang === "nl" ? "Verwijderen" : "Delete"}
                                onClick={async () => { if (await showConfirm(lang === "nl" ? "Factuur verwijderen? De afspraak zelf blijft in je agenda en klanthistorie." : "Delete invoice? The appointment itself stays in your agenda and customer history.")) setInvoiceViewState(a.id, "deleted"); }}
                                style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                title={lang === "nl" ? "Verwijderen" : "Delete"}
                              >
                                <NavIcon name="xmark" size={11} color="currentColor" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length > 10 && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
                      <button className="btn-ghost" onClick={() => setInvoicesExpanded(v => !v)} style={{ padding: "10px 22px", display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {invoicesExpanded ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                            {t.showLess}
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                            {t.showMore} ({filtered.length - 10})
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>;
              })()}
            </div>
            );
          })()}

          {/* ANALYTICS */}
          {view === "analytics" && (
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto", overflowX: "hidden" }}>
              {isMobile && <PTitle sub={t.salonInsight}>{t.analytics}</PTitle>}

              {/* Key metrics + Revenue chart — combined IIFE to share computed data */}
              {(() => {
                const now = new Date();
                // Compare date strings to avoid UTC/local mismatch at day boundaries.
                const weekAgoStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
                const monthAgoStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
                const prevWeekStartStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14));
                const weekRevenue = appts.filter(a => a.status === "completed" && a.date >= weekAgoStr).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const prevWeekRevenue = appts.filter(a => a.status === "completed" && a.date >= prevWeekStartStr && a.date < weekAgoStr).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const monthRevenue = appts.filter(a => a.status === "completed" && a.date >= monthAgoStr).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const weekChange = prevWeekRevenue > 0 ? Math.round(((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100) : 0;
                const avgRating = salonData.reviews?.length > 0 ? (salonData.reviews.reduce((s, r) => s + r.rating, 0) / salonData.reviews.length).toFixed(1) : "—";

                // Daily revenue for sparklines — key by the stored a.date string directly.
                const revByDay = {};
                appts.forEach(a => {
                  if (a.status !== "completed") return;
                  revByDay[a.date] = (revByDay[a.date] || 0) + parseFloat(a.service_price || 0);
                });
                const dayInitialsNL_an = ["Z", "M", "D", "W", "D", "V", "Z"];
                const dayInitialsEN_an = ["S", "M", "T", "W", "T", "F", "S"];
                const dayInitials_an = lang === "nl" ? dayInitialsNL_an : dayInitialsEN_an;
                const weekDaily = [];
                const weekLabels = [];
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                  weekDaily.push(revByDay[fmt(d)] || 0);
                  weekLabels.push(dayInitials_an[d.getDay()]);
                }
                const monthDaily = [];
                const monthLabels = [];
                for (let i = 29; i >= 0; i--) {
                  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                  monthDaily.push(revByDay[fmt(d)] || 0);
                  monthLabels.push((29 - i) % 5 === 0 ? String(d.getDate()) : "");
                }

                // Same bar chart shape as the dashboard sparkline — peak pill,
                // muted non-peak bars, baseline + x-axis tick labels. Kept local
                // to the Analytics view so the dashboard version can evolve
                // independently if we want different sizing here later.
                const sparkline = (data, color, opts) => {
                  if (!data || data.length === 0) return null;
                  const labels = (opts && opts.labels) || [];
                  const padL = 0, padR = 0, padT = 14, padB = labels.length ? 14 : 4;
                  const W = 220, H = 80;
                  const innerW = W - padL - padR;
                  const innerH = H - padT - padB;
                  const max = Math.max(...data, 1);
                  const gap = data.length > 14 ? 1.5 : 3;
                  const barW = Math.max(2, (innerW - gap * (data.length - 1)) / data.length);
                  let peakIdx = 0;
                  data.forEach((v, i) => { if (v > data[peakIdx]) peakIdx = i; });
                  const peakVal = data[peakIdx];
                  const fmtN = (n) => Math.round(n).toLocaleString(lang === "nl" ? "nl-NL" : "en-US");
                  return (
                    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
                      <line x1={padL} y1={padT + innerH + 0.5} x2={padL + innerW} y2={padT + innerH + 0.5} stroke={c.border} strokeWidth="0.5" />
                      {data.map((v, i) => {
                        const x = padL + i * (barW + gap);
                        const h = v > 0 ? Math.max(1, (v / max) * innerH) : 0;
                        const y = padT + innerH - h;
                        const isPeak = peakVal > 0 && i === peakIdx;
                        return <rect key={i} x={x} y={y} width={barW} height={Math.max(0.5, h)} rx={Math.min(1.5, barW / 2)} fill={isPeak ? color : `${color}55`} />;
                      })}
                      {peakVal > 0 && (() => {
                        const x = padL + peakIdx * (barW + gap) + barW / 2;
                        const y = padT + innerH - (peakVal / max) * innerH - 3;
                        const label = "€" + fmtN(peakVal);
                        const labelW = Math.max(22, label.length * 5 + 8);
                        const lx = Math.max(0, Math.min(W - labelW, x - labelW / 2));
                        return (
                          <g>
                            <rect x={lx} y={y - 11} width={labelW} height={12} rx={6} fill={c.bgCard} stroke={`${color}55`} strokeWidth="0.5" />
                            <text x={lx + labelW / 2} y={y - 2.5} textAnchor="middle" fontSize="8" fontFamily="'Jost', sans-serif" fontWeight="600" fill={color}>{label}</text>
                          </g>
                        );
                      })()}
                      {labels.length > 0 && labels.map((lab, i) => {
                        const x = padL + i * (barW + gap) + barW / 2;
                        return (
                          <text key={i} x={x} y={H - 2} textAnchor="middle" fontSize="7" fontFamily="'Jost', sans-serif" fill={c.textMuted} letterSpacing="0.04em">{lab}</text>
                        );
                      })}
                    </svg>
                  );
                };

                // Rating distribution
                const ratingDist = [5, 4, 3, 2, 1].map(r => {
                  const count = (salonData.reviews || []).filter(rv => rv.rating === r).length;
                  const pct = salonData.reviews?.length > 0 ? (count / salonData.reviews.length) * 100 : 0;
                  return { rating: r, count, pct };
                });

                // Weekly revenue for the big area chart — Monday-start weeks, string-compare dates.
                const weeks = [];
                const dowMon = (now.getDay() + 6) % 7;
                for (let w = 7; w >= 0; w--) {
                  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (w * 7 + dowMon));
                  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
                  const wsStr = fmt(weekStart); const weStr = fmt(weekEnd);
                  const rev = appts
                    .filter(a => a.status === "completed" && a.date >= wsStr && a.date < weStr)
                    .reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                  const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
                  weeks.push({ label, revenue: rev });
                }
                const total8w = weeks.reduce((s, w) => s + w.revenue, 0);
                const maxRev = Math.max(...weeks.map(w => w.revenue), 1);
                const nonZero = weeks.filter(w => w.revenue > 0);
                const avgWeek = nonZero.length ? (total8w / nonZero.length) : 0;
                const peakIdx = weeks.reduce((best, w, i) => w.revenue > weeks[best].revenue ? i : best, 0);
                const nzFirst = weeks.slice(0, 4).filter(w => w.revenue > 0);
                const firstHalfAvg = nzFirst.length ? nzFirst.reduce((s, w) => s + w.revenue, 0) / nzFirst.length : 0;
                const nzSecond = weeks.slice(4).filter(w => w.revenue > 0);
                const secondHalfAvg = nzSecond.length ? nzSecond.reduce((s, w) => s + w.revenue, 0) / nzSecond.length : 0;
                const trendPct = firstHalfAvg > 0 ? Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100) : 0;
                const W = 560, H = 220, PAD_L = 16, PAD_R = 16, PAD_TOP = 32, PAD_BOT = 30;
                const innerW = W - PAD_L - PAD_R;
                const innerH = H - PAD_TOP - PAD_BOT;
                const pts = weeks.map((w, i) => {
                  const x = PAD_L + (i / (weeks.length - 1)) * innerW;
                  const y = PAD_TOP + innerH - (w.revenue / maxRev) * innerH;
                  return { x, y, ...w };
                });
                const smoothPath = pts.reduce((acc, p, i) => {
                  if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  const prev = pts[i - 1];
                  const cx1 = prev.x + (p.x - prev.x) / 2;
                  const cy1 = prev.y;
                  const cx2 = prev.x + (p.x - prev.x) / 2;
                  const cy2 = p.y;
                  return `${acc} C${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                }, "");
                const areaPath = `${smoothPath} L${pts[pts.length - 1].x.toFixed(1)},${PAD_TOP + innerH} L${pts[0].x.toFixed(1)},${PAD_TOP + innerH} Z`;
                const gradId = "an-rev-grad";

                return (
                  <>
                    {/* Stat cards row */}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14, gridAutoRows: "1fr" }}>
                      {/* Week */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.weeklyRevenue}</div>
                          <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "7d" : "7d"}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1 }}>€{weekRevenue.toFixed(0)}</div>
                          {weekChange !== 0 && (
                            <div style={{ fontSize: 10, color: weekChange > 0 ? c.success : c.danger, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 100, background: weekChange > 0 ? `${c.success}18` : `${c.danger}18`, border: `1px solid ${weekChange > 0 ? c.success : c.danger}33`, whiteSpace: "nowrap" }}>
                              {weekChange > 0 ? "↑" : "↓"} {Math.abs(weekChange)}%
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minHeight: 56, marginTop: 12 }}>{sparkline(weekDaily, accent, { labels: weekLabels })}</div>
                      </div>
                      {/* Month */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.monthlyRevenue}</div>
                          <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "30d" : "30d"}</div>
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1, marginTop: 6 }}>€{monthRevenue.toFixed(0)}</div>
                        <div style={{ flex: 1, minHeight: 56, marginTop: 12 }}>{sparkline(monthDaily, accent, { labels: monthLabels })}</div>
                      </div>
                      {/* Total appointments */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.totalAppts}</div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: c.text, lineHeight: 1, marginTop: 6 }}>{appts.length}</div>
                        <div style={{ flex: 1, marginTop: 12, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6 }}>
                          <div>
                            <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{t.treatments}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: c.textSub }}>
                              <div style={{ flex: 1, height: 4, background: c.inputBg, borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", background: accent, width: `${appts.length > 0 ? (completedAppts.length / appts.length) * 100 : 0}%` }} />
                              </div>
                              <span style={{ fontVariantNumeric: "tabular-nums" }}>{completedAppts.length}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Rating */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.avgRating}</div>
                          <span style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{salonData.reviews?.length || 0}</span>
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: c.text, display: "flex", alignItems: "center", gap: 6, lineHeight: 1, marginTop: 6 }}>
                          {avgRating}
                          <svg width={18} height={18} viewBox="0 0 20 20" fill={accent}>
                            <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 13.28l-4.77 2.43.91-5.32L2.27 6.62l5.34-.78L10 1z" />
                          </svg>
                        </div>
                        <div style={{ flex: 1, marginTop: 12, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          {salonData.reviews?.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {ratingDist.map(r => (
                                <div key={r.rating} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: c.textMuted }}>
                                  <span style={{ width: 8, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.rating}</span>
                                  <div style={{ flex: 1, height: 4, background: c.inputBg, borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${r.pct}%`, background: accent, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ width: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: 9, color: c.textMuted, textAlign: "center" }}>{lang === "nl" ? "Geen reviews" : "No reviews"}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Revenue area chart — big hero */}
                    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "22px 24px", marginBottom: 14, display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>{t.revenueOverTime}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, color: c.text, lineHeight: 1 }}>€{total8w.toFixed(0)}</div>
                          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{lang === "nl" ? "afgelopen 8 weken" : "last 8 weeks"}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 14, minHeight: 200 }}>
                        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", overflow: "hidden" }}>
                          <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                              <stop offset="100%" stopColor={accent} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {[0.25, 0.5, 0.75].map(pct => (
                            <line key={pct} x1={PAD_L} y1={PAD_TOP + innerH * pct} x2={W - PAD_R} y2={PAD_TOP + innerH * pct} stroke={c.border} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
                          ))}
                          <line x1={PAD_L} y1={PAD_TOP + innerH} x2={W - PAD_R} y2={PAD_TOP + innerH} stroke={c.border} strokeWidth="1" />
                          {maxRev > 0 && <path d={areaPath} fill={`url(#${gradId})`} />}
                          {maxRev > 0 && <path d={smoothPath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                          {pts[peakIdx].revenue > 0 && (() => {
                            const px = Math.max(PAD_L + 30, Math.min(W - PAD_R - 30, pts[peakIdx].x));
                            return (
                              <g>
                                <rect x={px - 30} y={pts[peakIdx].y - 26} width="60" height="18" rx="9" fill={c.bg} stroke={accent} strokeWidth="1" />
                                <text x={px} y={pts[peakIdx].y - 13} fontSize="11" fill={accent} textAnchor="middle" fontFamily="'Jost',sans-serif" fontWeight="600">
                                  €{pts[peakIdx].revenue.toFixed(0)}
                                </text>
                              </g>
                            );
                          })()}
                          {pts.map((p, i) => (
                            <g key={i}>
                              <circle cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3} fill={c.bg} stroke={accent} strokeWidth={i === pts.length - 1 ? 2.5 : 1.8}>
                                <title>{p.label} · €{p.revenue.toFixed(0)}</title>
                              </circle>
                              {i === pts.length - 1 && (
                                <circle cx={p.x} cy={p.y} r="10" fill={accent} opacity="0.15">
                                  <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
                                  <animate attributeName="opacity" values="0.25;0;0.25" dur="2s" repeatCount="indefinite" />
                                </circle>
                              )}
                            </g>
                          ))}
                          {[0, Math.floor(pts.length / 2), pts.length - 1].map(i => (
                            <text key={i} x={pts[i].x} y={H - 10} fontSize="11" fill={c.textMuted} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} fontFamily="'Jost',sans-serif">
                              {pts[i].label}
                            </text>
                          ))}
                        </svg>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>{lang === "nl" ? "Beste week" : "Best week"}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: c.text }}>€{pts[peakIdx].revenue.toFixed(0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>{lang === "nl" ? "Gemiddeld" : "Average"}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: c.text }}>€{avgWeek.toFixed(0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>{lang === "nl" ? "Trend" : "Trend"}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: trendPct > 0 ? c.success : trendPct < 0 ? c.danger : c.text }}>
                            {trendPct > 0 ? "↑" : trendPct < 0 ? "↓" : "—"} {Math.abs(trendPct)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Popular services — thumbnails + revenue */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "20px 22px", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{t.popularServices}</div>
                  <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Top 5</div>
                </div>
                {(() => {
                  const svcStats = {};
                  appts.forEach(a => {
                    if (a.status !== "completed" && a.status !== "confirmed") return;
                    const n = a.service_name?.split(" — ")[0] || "?";
                    if (!svcStats[n]) svcStats[n] = { count: 0, revenue: 0, serviceId: a.service_id };
                    svcStats[n].count += 1;
                    svcStats[n].revenue += parseFloat(a.service_price || 0);
                  });
                  const sorted = Object.entries(svcStats).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
                  if (sorted.length === 0) return (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: c.textMuted, gap: 10, padding: "24px 0" }}>
                      <div style={{ opacity: 0.4 }}><NavIcon name="chart" size={32} color={c.textMuted} /></div>
                      <div style={{ fontSize: 12 }}>{t.noAppts}</div>
                    </div>
                  );
                  const max = sorted[0][1].count;
                  return sorted.map(([name, stats], idx) => {
                    const svc = (salonData.services || []).find(s => s.id === stats.serviceId || (lang === "nl" ? s.name_nl : (s.name_en || s.name_nl)) === name);
                    const thumb = svc?.photos?.[0]?.url || svc?.photos?.[0];
                    return (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: idx === sorted.length - 1 ? 0 : 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: c.inputBg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                          {thumb ? <img src={thumb} alt="" loading="lazy" onError={e => { e.target.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0, zIndex: 1 }} /> : null}
                          {!thumb && <NavIcon name="scissors" size={16} color={c.textMuted} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: accent, flexShrink: 0, lineHeight: 1 }}>€{stats.revenue.toFixed(0)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 4, background: c.inputBg, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(stats.count / max) * 100}%`, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                            </div>
                            <span style={{ fontSize: 10, color: c.textMuted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{stats.count}×</span>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Staff performance — revenue, completion rate, no-show rate
                  per staff member. Only renders if the salon has ≥1 staff
                  assigned to any appointments; hiding it on solo salons
                  avoids a confusing empty block. */}
              {(() => {
                const staffList = salonData.staff || [];
                if (staffList.length === 0) return null;
                const stats = {};
                for (const s of staffList) {
                  stats[s.id] = {
                    name: s.name, role: s.role || "",
                    total: 0, completed: 0, cancelled: 0, no_show: 0,
                    revenue: 0, unique_clients: new Set(),
                  };
                }
                for (const a of appts) {
                  if (!a.staff_id || !stats[a.staff_id]) continue;
                  const row = stats[a.staff_id];
                  row.total++;
                  if (a.status === "completed") { row.completed++; row.revenue += parseFloat(a.service_price || 0); }
                  else if (a.status === "cancelled") row.cancelled++;
                  else if (a.status === "no_show") row.no_show++;
                  if (a.client_email) row.unique_clients.add(a.client_email);
                }
                const rows = Object.values(stats)
                  .filter(r => r.total > 0)
                  .sort((a, b) => b.revenue - a.revenue);
                if (rows.length === 0) return null;
                const maxRev = Math.max(...rows.map(r => r.revenue), 1);

                return (
                  <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "20px 22px", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>
                        {lang === "nl" ? "Team prestaties" : "Staff performance"}
                      </div>
                      <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {lang === "nl" ? "Laatste 90 dagen" : "Last 90 days"}
                      </div>
                    </div>
                    {rows.map((r, idx) => {
                      const completionRate = r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0;
                      const noShowRate = r.total > 0 ? Math.round((r.no_show / r.total) * 100) : 0;
                      return (
                        <div key={idx} style={{ paddingTop: idx === 0 ? 0 : 14, marginTop: idx === 0 ? 0 : 14, borderTop: idx === 0 ? "none" : `1px solid ${c.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{r.name}</span>
                              {r.role && <span style={{ fontSize: 10, color: c.textMuted, marginLeft: 8 }}>{r.role}</span>}
                            </div>
                            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent, lineHeight: 1 }}>€{r.revenue.toFixed(0)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <div style={{ flex: 1, height: 4, borderRadius: 4, background: c.inputBg, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(r.revenue / maxRev) * 100}%`, transition: "width 0.6s" }} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 14, fontSize: 10, color: c.textMuted, flexWrap: "wrap" }}>
                            <span>{r.total} {lang === "nl" ? "afspraken" : "appointments"}</span>
                            <span style={{ color: completionRate >= 85 ? c.success : c.textMuted }}>✓ {completionRate}% {lang === "nl" ? "voltooid" : "done"}</span>
                            <span style={{ color: noShowRate >= 15 ? c.danger : c.textMuted }}>{noShowRate}% {lang === "nl" ? "no-show" : "no-show"}</span>
                            <span>{r.unique_clients.size} {lang === "nl" ? "unieke klanten" : "unique clients"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Busiest days */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.busiestDays}</SL>
                {(() => {
                  const dayNames = lang === "nl" ? ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"] : ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                  const dayCounts = [0,0,0,0,0,0,0];
                  appts.forEach(a => {
                    // Parse local-date from YYYY-MM-DD so getDay() reflects the salon's local day,
                    // not a UTC-shifted one.
                    if (!a.date) return;
                    const [y, m, day] = a.date.split("-").map(Number);
                    if (!y) return;
                    dayCounts[new Date(y, m - 1, day).getDay()]++;
                  });
                  const max = Math.max(...dayCounts, 1);
                  return dayNames.map((name, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, width: 70, flexShrink: 0, color: c.textSub }}>{name.slice(0,3)}</span>
                      <div style={{ flex: 1, height: 4, borderRadius: 4, background: c.bgCardHover }}>
                        <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(dayCounts[i] / max) * 100}%`, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: 10, color: c.textLabel, width: 20, textAlign: "right" }}>{dayCounts[i]}</span>
                    </div>
                  ));
                })()}
              </div>

              {/* Busiest hours heatmap */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{lang === "nl" ? "Drukste uren" : "Busiest hours"}</SL>
                {(() => {
                  const hourCounts = {};
                  appts.forEach(a => { if (a.time) { const h = parseInt(a.time.split(":")[0]); hourCounts[h] = (hourCounts[h] || 0) + 1; } });
                  const hours = [];
                  for (let h = 8; h <= 21; h++) hours.push(h);
                  const max = Math.max(...hours.map(h => hourCounts[h] || 0), 1);
                  return (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
                      {hours.map(h => {
                        const count = hourCounts[h] || 0;
                        const pct = (count / max) * 100;
                        return (
                          <div key={h} style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div style={{ width: "100%", borderRadius: 4, background: count > 0 ? `${accent}${Math.max(Math.round(pct * 0.8 + 20), 20).toString(16).padStart(2,"0")}` : c.bgCardHover, height: Math.max(pct * 0.7, 2), transition: "height 0.3s" }} />
                            <span style={{ fontSize: 10, color: c.textMuted }}>{isMobile ? h : `${h}:00`}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Client retention */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{lang === "nl" ? "Klant retentie" : "Client retention"}</SL>
                {(() => {
                  const clientVisits = {};
                  appts.forEach(a => { if (a.client_email) clientVisits[a.client_email] = (clientVisits[a.client_email] || 0) + 1; });
                  const total = Object.keys(clientVisits).length;
                  const returning = Object.values(clientVisits).filter(v => v > 1).length;
                  const pct = total > 0 ? Math.round((returning / total) * 100) : 0;
                  return (
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <div style={{ position: "relative", width: 80, height: 80 }}>
                        <svg viewBox="0 0 36 36" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke={c.bgCardHover} strokeWidth="3" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke={accent} strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: accent }}>{pct}%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{returning} {lang === "nl" ? "terugkerende klanten" : "returning clients"}</div>
                        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{total} {lang === "nl" ? "unieke klanten totaal" : "unique clients total"}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Reviews */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16 }}>
                <SL>{t.reviews} ({salonData.reviews?.length || 0})</SL>
                {(!salonData.reviews || salonData.reviews.length === 0) ? (
                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noReviews}</div>
                ) : (() => {
                  const visible = analyticsReviewsExpanded ? salonData.reviews : salonData.reviews.slice(0, 5);
                  return <>
                    {visible.map(r => (
                      <div key={r.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid " + c.border }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{r.client_name}</span>
                          <span style={{ color: accent, fontSize: 13 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                        </div>
                        {r.comment && <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.5 }}>{r.comment}</div>}
                        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                    {salonData.reviews.length > 5 && (
                      <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                        <button className="btn-ghost" onClick={() => setAnalyticsReviewsExpanded(v => !v)} style={{ fontSize: 12, padding: "10px 22px" }}>
                          {analyticsReviewsExpanded ? t.showLess : `${t.showMore} (${salonData.reviews.length - 5})`}
                        </button>
                      </div>
                    )}
                  </>;
                })()}
              </div>
            </div>
          )}

          </div>
          ) : (
          /* INSTELLINGEN -- own scroll area with pinned save button */
          <>
          {/* Settings tabs — pinned above scroll area (flex sibling), always visible under the header */}
          <div style={{
            flexShrink: 0,
            background: c.bg,
            borderBottom: "1px solid " + c.border,
            paddingTop: isMobile ? 10 : 20, paddingBottom: 12
          }}>
            <div style={{
              maxWidth: 960,
              margin: "0 auto",
              padding: isMobile ? "0 14px" : "0 40px",
              display: "flex", gap: 6, overflowX: "auto",
              WebkitOverflowScrolling: "touch"
            }}>
              {[
                ["salon", "salon", lang === "nl" ? "Salon" : "Salon"],
                ["diensten", "diensten", t.services],
                ["team", "team", lang === "nl" ? "Team" : "Team"],
                ["planning", "planning", lang === "nl" ? "Planning" : "Schedule"],
                ["billing", "creditcard", lang === "nl" ? "Abonnement" : "Billing"],
                ["facturatie", "overig", lang === "nl" ? "Overig" : "Other"],
              ].map(([key, icon, label]) => (
                <div key={key} onClick={() => setSettingsTab(key)} style={{
                  padding: "8px 16px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap",
                  fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", transition: "all 0.2s",
                  background: settingsTab === key ? `${accent}15` : "transparent",
                  color: settingsTab === key ? accent : c.textSub,
                  border: `1px solid ${settingsTab === key ? `${accent}33` : "transparent"}`,
                  display: "flex", alignItems: "center", gap: 6
                }}><NavIcon name={icon} size={14} color={settingsTab === key ? accent : c.textSub} /> {label}</div>
              ))}
            </div>
          </div>

          <div style={{
            padding: isMobile ? "16px 0 calc(160px + env(safe-area-inset-bottom, 0px))" : "16px 0 100px",
            backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}08 0%, transparent 55%)`
          }}>

            <div className="fade-up" style={{
              maxWidth: 960,
              margin: "0 auto",
              padding: isMobile ? "0 22px" : "0 40px"
            }}>
              {isMobile && <PTitle sub={t.manageSalon}>{t.settings}</PTitle>}

              {/* ═══ SALON TAB ═══ */}
              {settingsTab === "salon" && <>

              {/* Upgrade confirmation — explains the no-extra-charge timing so
                  the owner doesn't worry they'll be billed twice for this
                  month. */}
              {upgradeConfirm && createPortal((
                <div onClick={() => !changingPlan && setUpgradeConfirm(false)}
                     style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 320, fontFamily: "'Jost', sans-serif", color: c.text }}>
                  <div onClick={(e) => e.stopPropagation()}
                       style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: 24, maxWidth: 460, width: "100%", color: c.text }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, marginBottom: 10 }}>
                      {lang === "nl" ? "Upgraden naar Professional?" : "Upgrade to Professional?"}
                    </div>
                    <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.6, marginBottom: 16 }}>
                      {lang === "nl"
                        ? "Je krijgt direct toegang tot alle Professional functies. Je betaalt deze maand niets extra — vanaf de volgende afschrijving wordt er €39/maand in plaats van €19/maand afgeschreven."
                        : "You get instant access to all Professional features. No extra charge this month — from the next renewal you'll be billed €39/month instead of €19/month."}
                    </div>
                    {salonData.plan_expires_at && (
                      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 16, padding: "10px 12px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10 }}>
                        {lang === "nl" ? "Nieuwe prijs gaat in op:" : "New price starts on:"}{" "}
                        <strong style={{ color: c.text }}>{new Date(salonData.plan_expires_at).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { day: "numeric", month: "long", year: "numeric" })}</strong>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-ghost" style={{ flex: 1 }} disabled={changingPlan}
                              onClick={() => setUpgradeConfirm(false)}>
                        {lang === "nl" ? "Annuleer" : "Cancel"}
                      </button>
                      <button className="btn-primary" style={{ flex: 1 }} disabled={changingPlan}
                              onClick={() => handleChangePlan("professional")}>
                        {changingPlan ? (lang === "nl" ? "Bezig…" : "Working…") : (lang === "nl" ? "Upgrade" : "Upgrade")}
                      </button>
                    </div>
                  </div>
                </div>
              ), document.body)}

              {/* Profile */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.profile}</SL>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <input className="input-field" placeholder={t.businessName} value={salonData.name} onChange={e => update(d => { d.name = e.target.value; return d; })} />
                  <input className="input-field" placeholder={t.city} value={salonData.city} onChange={e => update(d => { d.city = e.target.value; return d; })} />
                </div>

                {/* Salon URL / slug editor — separate save path from the big
                    Opslaan at the bottom because changing the slug invalidates
                    the query (data loads by slug) and forces a reload. */}
                <div style={{ marginTop: 18 }}>
                  <SL>{lang === "nl" ? "Salon-link" : "Salon link"}</SL>
                  <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 10 }}>
                    {lang === "nl"
                      ? "Dit is het webadres van jouw salon. Klanten boeken via deze link. Kies iets kort en herkenbaar."
                      : "This is your salon's public web address. Customers book via this link. Keep it short and recognisable."}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 0, background: c.bg, border: `1px solid ${c.inputBorder}`, borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ padding: "10px 4px 10px 14px", fontSize: 13, color: c.textMuted, fontFamily: "monospace", whiteSpace: "nowrap" }}>vellu.cc/</div>
                    <input
                      value={slugDraft}
                      onChange={e => setSlugDraft(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
                      maxLength={40}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      placeholder="ttnb-den-haag"
                      style={{
                        flex: 1, background: "transparent", border: "none", outline: "none",
                        padding: "10px 12px 10px 0",
                        color: c.text, fontFamily: "monospace", fontSize: 13, minWidth: 0,
                      }}
                    />
                  </div>
                  {/* Status row — colour-coded feedback */}
                  {slugStatus.state !== "idle" && (
                    <div style={{
                      marginTop: 8, fontSize: 11,
                      color: slugStatus.state === "available" ? c.success
                        : slugStatus.state === "checking" ? c.textMuted
                        : c.danger,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {slugStatus.state === "available" && <span>✓</span>}
                      {slugStatus.state === "taken" && <span>⚠</span>}
                      {slugStatus.state === "invalid" && <span>⚠</span>}
                      {slugStatus.state === "checking" && <span>…</span>}
                      <span>{slugStatus.message}</span>
                    </div>
                  )}
                  {slugDraft && slugDraft !== salonData.id && slugStatus.state === "available" && (
                    <div style={{
                      marginTop: 12, padding: "10px 12px",
                      background: `${c.warning}10`, border: `1px solid ${c.warning}33`,
                      borderRadius: 10, fontSize: 11, color: c.textSub, lineHeight: 1.5,
                    }}>
                      {lang === "nl"
                        ? <>Waarschuwing: de oude link <code style={{ fontFamily: "monospace", color: c.text }}>vellu.cc/{salonData.id}</code> werkt niet meer. Update je bio-links, QR-codes en visitekaartjes.</>
                        : <>Heads up: the old link <code style={{ fontFamily: "monospace", color: c.text }}>vellu.cc/{salonData.id}</code> will stop working. Update your bio links, QR codes, and business cards.</>}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      className="btn-primary"
                      disabled={slugSaving || slugStatus.state !== "available" || slugDraft === salonData.id}
                      onClick={saveSlug}
                      style={{ fontSize: 12, padding: "10px 18px", opacity: (slugStatus.state !== "available" || slugDraft === salonData.id) ? 0.5 : 1 }}
                    >
                      {slugSaving ? "…" : (lang === "nl" ? "Link bijwerken" : "Update link")}
                    </button>
                    {slugDraft !== salonData.id && (
                      <button
                        className="btn-ghost"
                        onClick={() => { setSlugDraft(salonData.id); setSlugStatus({ state: "idle", message: "" }); }}
                        style={{ fontSize: 12 }}
                      >{lang === "nl" ? "Annuleer" : "Cancel"}</button>
                    )}
                  </div>

                  {/* QR code trigger — separate card action, not tied to
                      slug-save state. Lazy-loaded modal generates the QR
                      on open. */}
                  <button
                    className="btn-ghost"
                    onClick={() => setQrOpen(true)}
                    style={{
                      marginTop: 12, fontSize: 11, padding: "10px 14px",
                      display: "inline-flex", alignItems: "center", gap: 8,
                      width: "100%", justifyContent: "center",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <line x1="14" y1="14" x2="14" y2="14.01" />
                      <line x1="18" y1="14" x2="18" y2="18" />
                      <line x1="14" y1="18" x2="18" y2="18" />
                      <line x1="18" y1="21" x2="21" y2="21" />
                      <line x1="21" y1="14" x2="21" y2="18" />
                    </svg>
                    {lang === "nl" ? "Toon QR-code" : "Show QR code"}
                  </button>
                </div>
                <div style={{ marginTop: 16 }}>
                  <SL>{t.brandColor}</SL>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {["#c9a96e","#e8a598","#a8c5a0","#9bb5d6","#c4a8d4","#d4756a","#6abfb8","#e8c547"].map(clr => (
                      <div key={clr} onClick={() => { setTempColor(null); update(d => { d.accent = clr; return d; }); }} style={{ width: 26, height: 26, borderRadius: "50%", background: clr, cursor: "pointer", outline: (tempColor || salonData.accent) === clr ? "2px solid " + c.text : "none", outlineOffset: 2, transform: (tempColor || salonData.accent) === clr ? "scale(1.18)" : "none", transition: "all 0.2s" }} />
                    ))}
                    <div style={{ position: "relative", width: 26, height: 26, cursor: "pointer" }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)`, border: "2px solid " + c.border }} />
                      <input type="color" value={tempColor || salonData.accent || "#c9a96e"} 
                        onChange={e => {
                          const val = e.target.value;
                          setTempColor(val);
                          if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
                          colorDebounceRef.current = setTimeout(() => {
                            update(d => { d.accent = val; return d; });
                            setTempColor(null);
                          }, 400);
                        }}
                        onBlur={() => {
                          if (tempColor) {
                            if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
                            update(d => { d.accent = tempColor; return d; });
                            setTempColor(null);
                          }
                        }}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", padding: 0, cursor: "pointer", borderRadius: "50%", opacity: 0 }}
                        title={t.customColor} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Locations */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{t.locations}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{(salonData.locations || []).length}</div>
                </div>

                {/* Main location from profile — shown when no explicit locations exist */}
                {(salonData.locations || []).length === 0 && (salonData.address || salonData.city) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 10, background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}14`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <NavIcon name="mappin" size={14} color={accent} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{lang === "nl" ? "Hoofdlocatie" : "Main location"}</span>
                        <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: `${accent}22`, color: accent, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {lang === "nl" ? "Uit profiel" : "From profile"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: c.textLabel }}>{salonData.address}{salonData.city ? `, ${salonData.city}` : ""}</div>
                      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 3 }}>{lang === "nl" ? "Klanten zien dit adres op je boekingspagina." : "Clients see this address on your booking page."}</div>
                    </div>
                  </div>
                )}

                {(salonData.locations || []).length === 0 && !(salonData.address || salonData.city) ? (
                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "14px 0", fontStyle: "italic" }}>{t.noLocations}</div>
                ) : (salonData.locations || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: c.textMuted, padding: "4px 2px 10px", lineHeight: 1.5 }}>
                    {lang === "nl"
                      ? "Voeg extra locaties toe als je op meerdere plekken werkt — klanten kunnen dan kiezen bij het boeken."
                      : "Add extra locations if you work from multiple venues — clients can then choose at booking time."}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                    {(salonData.locations || []).map(loc => {
                      const isEditing = editingLocation === loc.id;
                      return (
                        <div key={loc.id} style={{ background: c.bg, border: `1px solid ${isEditing ? `${accent}44` : c.border}`, borderRadius: 14, padding: isEditing ? 14 : "12px 14px", transition: "border-color 0.2s" }}>
                          {isEditing ? (
                            <div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <div>
                                  <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Naam" : "Name"}</div>
                                  <input className="input-field" value={editLocForm.name} onChange={e => setEditLocForm(f => ({...f, name: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px", width: "100%" }} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.city}</div>
                                  <input className="input-field" value={editLocForm.city} onChange={e => setEditLocForm(f => ({...f, city: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px", width: "100%" }} />
                                </div>
                              </div>
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.address}</div>
                                <input className="input-field" value={editLocForm.address} onChange={e => setEditLocForm(f => ({...f, address: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px", width: "100%" }} />
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Telefoon" : "Phone"}</div>
                                <input className="input-field" value={editLocForm.phone} onChange={e => setEditLocForm(f => ({...f, phone: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px", width: "100%" }} />
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="btn-ghost" style={{ flex: 1, padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", color: accent, borderColor: `${accent}55` }} onClick={async () => {
                                  await supabase.from("locations").update({ name: editLocForm.name, address: editLocForm.address || null, city: editLocForm.city || null, phone: editLocForm.phone || null }).eq("id", loc.id);
                                  update(d => { d.locations = d.locations.map(l => l.id === loc.id ? {...l, ...editLocForm} : l); return d; });
                                  setEditingLocation(null);
                                }}>
                                  <NavIcon name="check" size={12} color="currentColor" /> {t.saveChanges}
                                </button>
                                <button className="btn-ghost" style={{ padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }} onClick={() => setEditingLocation(null)}>
                                  <NavIcon name="xmark" size={12} color="currentColor" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}14`, border: `1px solid ${accent}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <NavIcon name="mappin" size={14} color={accent} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{loc.name}</div>
                                {(loc.address || loc.city) && <div style={{ fontSize: 11, color: c.textLabel, marginTop: 2 }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}</div>}
                                {loc.phone && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{loc.phone}</div>}
                              </div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={() => { setEditingLocation(loc.id); setEditLocForm({ name: loc.name, address: loc.address || "", city: loc.city || "", phone: loc.phone || "" }); }}
                                  style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <NavIcon name="edit" size={11} color="currentColor" />
                                </button>
                                <button onClick={async () => {
                                  if (!await showConfirm(lang === "nl" ? "Locatie verwijderen?" : "Delete location?")) return;
                                  await supabase.from("locations").delete().eq("id", loc.id);
                                  update(d => { d.locations = (d.locations || []).filter(l => l.id !== loc.id); return d; });
                                }} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <NavIcon name="xmark" size={11} color="currentColor" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <LocationAdder ownerId={salonData.owner_id} lang={lang} t={t} accent={accent} onAdd={(loc) => {
                  update(d => { d.locations = [...(d.locations || []), loc]; return d; });
                }} />
              </div>

              {/* Salon Contact Details */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{t.salonContact}</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 14 }}>{t.salonContactDesc}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { icon: "phone", placeholder: t.salonPhone, value: salonData.salon_phone, key: "salon_phone" },
                    { icon: "chat", placeholder: t.whatsappNumber, value: salonData.whatsapp_number, key: "whatsapp_number" },
                    { icon: "camera", placeholder: t.salonInstagram, value: salonData.salon_instagram, key: "salon_instagram" },
                    { icon: "mail", placeholder: t.salonEmail, value: salonData.salon_email, key: "salon_email" },
                  ].map(field => (
                    <div key={field.key} style={{ position: "relative" }}>
                      <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
                        <NavIcon name={field.icon} size={14} color={c.textMuted} />
                      </div>
                      <input className="input-field" placeholder={field.placeholder} value={field.value || ""} onChange={e => update(d => { d[field.key] = e.target.value; return d; })} style={{ paddingLeft: 40, width: "100%" }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Invoice details */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{t.invoiceDetails}</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 14 }}>{t.invoiceSettings}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.address}</div>
                    <input className="input-field" placeholder="Haarlemmerdijk 95, 1013 KD Amsterdam" value={salonData.address || ""} onChange={e => update(d => { d.address = e.target.value; return d; })} style={{ width: "100%" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.kvkNumber}</div>
                      <input className="input-field" placeholder="12345678" value={salonData.kvk_number || ""} onChange={e => update(d => { d.kvk_number = e.target.value; return d; })} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.btwId}</div>
                      <input className="input-field" placeholder="NL123456789B01" value={salonData.btw_id || ""} onChange={e => update(d => { d.btw_id = e.target.value; return d; })} style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.ibanNumber}</div>
                    <input className="input-field" placeholder="NL00 RABO 0000 0000 00" value={salonData.iban || ""} onChange={e => update(d => { d.iban = e.target.value; return d; })} style={{ width: "100%", fontFamily: "monospace", letterSpacing: "0.04em" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "BTW-percentage" : "VAT percentage"}</div>
                    <input className="input-field" type="number" min="0" max="100" step="1" placeholder="21" value={salonData.btw_rate ?? 21} onChange={e => update(d => { d.btw_rate = e.target.value === "" ? "" : parseFloat(e.target.value); return d; })} style={{ width: "100%" }} />
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 5, lineHeight: 1.5 }}>{lang === "nl" ? "21% voor nagels/schoonheid, 9% voor reguliere kappersdiensten. Wordt op de factuur als BTW-regel getoond zodra je een BTW-id hebt ingevuld." : "21% for nails/beauty, 9% for typical hairdresser services. Shown as a VAT line on the invoice once you've entered a BTW-id."}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.invoicePrefix}</div>
                      <input className="input-field" placeholder="INV" value={salonData.invoice_prefix || "INV"} onChange={e => update(d => { d.invoice_prefix = e.target.value; return d; })} style={{ width: "100%", fontFamily: "monospace", textTransform: "uppercase" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Volgend nummer" : "Next number"}</div>
                      <div className="input-field" style={{ width: "100%", fontVariantNumeric: "tabular-nums", opacity: 0.7, display: "flex", alignItems: "center" }} title={lang === "nl" ? "Automatisch bijgewerkt wanneer je een factuur verstuurt" : "Updated automatically when you send an invoice"}>
                        {salonData.next_invoice_number || 1}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Extra invoice profiles — shared-account use case where two
                  stylists on ONE login want to invoice under their own
                  KVK/BTW/IBAN. Each extra has its own counter that ticks
                  independently. Primary block above stays the default. */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Extra factuurprofielen" : "Extra invoice profiles"}</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
                  {lang === "nl"
                    ? "Handig als jullie met z'n tweeën één login delen en elk een eigen KVK/BTW/IBAN gebruiken. Bij het versturen van een factuur kies je welk profiel je wil gebruiken."
                    : "Useful if two of you share one login and each want your own VAT/IBAN details. When sending an invoice, you'll pick which profile to use."}
                </div>
                {(salonData.invoice_profiles || []).map((p, idx) => (
                  <div key={p.id || idx} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted }}>
                        {lang === "nl" ? `Profiel ${idx + 2}` : `Profile ${idx + 2}`}
                      </div>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: c.danger, borderColor: `${c.danger}33`, display: "inline-flex", alignItems: "center", gap: 5 }}
                        onClick={() => update(d => { d.invoice_profiles = (d.invoice_profiles || []).filter((_, i) => i !== idx); return d; })}>
                        <NavIcon name="xmark" size={11} color="currentColor" /> {lang === "nl" ? "Verwijder" : "Delete"}
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Naam / label" : "Name / label"}</div>
                        <input className="input-field" placeholder={lang === "nl" ? "bijv. Lady" : "e.g. Lady"} value={p.label || ""} onChange={e => update(d => { d.invoice_profiles = (d.invoice_profiles || []).map((x, i) => i === idx ? {...x, label: e.target.value} : x); return d; })} style={{ width: "100%" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.address}</div>
                        <input className="input-field" placeholder="Haarlemmerdijk 95, 1013 KD Amsterdam" value={p.address || ""} onChange={e => update(d => { d.invoice_profiles = (d.invoice_profiles || []).map((x, i) => i === idx ? {...x, address: e.target.value} : x); return d; })} style={{ width: "100%" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.kvkNumber}</div>
                          <input className="input-field" placeholder="12345678" value={p.kvk_number || ""} onChange={e => update(d => { d.invoice_profiles = (d.invoice_profiles || []).map((x, i) => i === idx ? {...x, kvk_number: e.target.value} : x); return d; })} style={{ width: "100%" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.btwId}</div>
                          <input className="input-field" placeholder="NL123456789B01" value={p.btw_id || ""} onChange={e => update(d => { d.invoice_profiles = (d.invoice_profiles || []).map((x, i) => i === idx ? {...x, btw_id: e.target.value} : x); return d; })} style={{ width: "100%" }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.ibanNumber}</div>
                        <input className="input-field" placeholder="NL00 RABO 0000 0000 00" value={p.iban || ""} onChange={e => update(d => { d.invoice_profiles = (d.invoice_profiles || []).map((x, i) => i === idx ? {...x, iban: e.target.value} : x); return d; })} style={{ width: "100%", fontFamily: "monospace", letterSpacing: "0.04em" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.invoicePrefix}</div>
                          <input className="input-field" placeholder="INV" value={p.invoice_prefix || ""} onChange={e => update(d => { d.invoice_profiles = (d.invoice_profiles || []).map((x, i) => i === idx ? {...x, invoice_prefix: e.target.value} : x); return d; })} style={{ width: "100%", fontFamily: "monospace", textTransform: "uppercase" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Volgend nummer" : "Next number"}</div>
                          <div className="input-field" style={{ width: "100%", fontVariantNumeric: "tabular-nums", opacity: 0.7, display: "flex", alignItems: "center" }}
                            title={lang === "nl" ? "Automatisch bijgewerkt wanneer je een factuur verstuurt" : "Updated automatically when you send an invoice"}>
                            {p.next_invoice_number || 1}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <button className="btn-ghost" style={{ width: "100%", padding: "12px 18px", borderStyle: "dashed", borderColor: `${accent}44`, color: accent, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 11 }}
                  onClick={() => update(d => {
                    const rid = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
                    d.invoice_profiles = [...(d.invoice_profiles || []), { id: rid, label: "", address: "", kvk_number: "", btw_id: "", iban: "", invoice_prefix: "INV", next_invoice_number: 1 }];
                    return d;
                  })}>
                  <NavIcon name="plus" size={13} color={accent} /> {lang === "nl" ? "Extra profiel toevoegen" : "Add extra profile"}
                </button>
              </div>
              </>}

              {/* ═══ DIENSTEN TAB ═══ */}
              {settingsTab === "diensten" && <>

              {/* ── CATEGORIES ── compact CRUD; used to group services on the public page */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{lang === "nl" ? "Categorieën" : "Categories"}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{(salonData.categories || []).length}</div>
                </div>
                {(salonData.categories || []).length === 0 && !showNewCategoryForm && (
                  <div style={{ fontSize: 11, color: c.textMuted, fontStyle: "italic", padding: "6px 2px 10px" }}>
                    {lang === "nl" ? "Nog geen categorieën. Groepeer je diensten (bv. Nagels, Brows) zodat klanten makkelijker kunnen kiezen." : "No categories yet. Group your services (e.g. Nails, Brows) so clients can browse faster."}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {(salonData.categories || []).map(cat => (
                    <div key={cat.id}>
                      {editingCategoryId === cat.id ? (
                        <div style={{ background: c.bgCard, border: `1px solid ${accent}44`, borderRadius: 12, padding: 10 }}>
                          <div style={{ marginBottom: 8 }}>
                            <AutoTranslateField
                              nlValue={editCategoryForm.name_nl}
                              enValue={editCategoryForm.name_en}
                              setNl={v => setEditCategoryForm(f => ({...f, name_nl: v}))}
                              setEn={v => setEditCategoryForm(f => ({...f, name_en: v}))}
                              lang={lang} accent={accent}
                              placeholder={lang === "nl" ? "Naam" : "Name"}
                            />
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn-ghost" style={{ flex: 1, padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", color: accent, borderColor: `${accent}55` }} onClick={async () => {
                              const primary = lang === "nl" ? editCategoryForm.name_nl : editCategoryForm.name_en;
                              if (!(primary || "").trim()) { toast.show(lang === "nl" ? "Naam is verplicht" : "Name is required", "error"); return; }
                              const filled = await autoFillTranslations(editCategoryForm, [{ nl: "name_nl", en: "name_en" }], lang);
                              const nlName = (filled.name_nl || filled.name_en || "").trim();
                              const enName = (filled.name_en || "").trim();
                              const { error } = await supabase.from("service_categories").update({ name_nl: nlName, name_en: enName || null }).eq("id", cat.id);
                              if (error) { toast.show(t.somethingWrong, "error"); return; }
                              update(d => { d.categories = (d.categories || []).map(x => x.id === cat.id ? {...x, name_nl: nlName, name_en: enName || null} : x); return d; });
                              setEditingCategoryId(null);
                            }}><NavIcon name="check" size={12} color="currentColor" /> {t.saveChanges}</button>
                            <button className="btn-ghost" style={{ padding: "9px 14px" }} onClick={() => setEditingCategoryId(null)}><NavIcon name="xmark" size={12} color="currentColor" /></button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{lang === "nl" ? (cat.name_nl || cat.name_en) : (cat.name_en || cat.name_nl)}</div>
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => { setEditingCategoryId(cat.id); setEditCategoryForm({ name_nl: cat.name_nl, name_en: cat.name_en || "" }); }}
                              style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                              title={lang === "nl" ? "Bewerken" : "Edit"}>
                              <NavIcon name="edit" size={11} color="currentColor" />
                            </button>
                            <button onClick={async () => {
                              const used = (salonData.services || []).some(sv => sv.category_id === cat.id);
                              const msg = used
                                ? (lang === "nl" ? `Categorie "${cat.name_nl}" is in gebruik. Diensten worden ongegroepeerd. Doorgaan?` : `Category "${cat.name_nl}" is in use. Services will be ungrouped. Continue?`)
                                : (lang === "nl" ? "Categorie verwijderen?" : "Delete category?");
                              if (!(await showConfirm(msg))) return;
                              const { error } = await supabase.from("service_categories").delete().eq("id", cat.id);
                              if (error) { toast.show(t.somethingWrong, "error"); return; }
                              update(d => {
                                d.categories = (d.categories || []).filter(x => x.id !== cat.id);
                                d.services = (d.services || []).map(sv => sv.category_id === cat.id ? {...sv, category_id: null} : sv);
                                return d;
                              });
                            }} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                              title={lang === "nl" ? "Verwijderen" : "Delete"}>
                              <NavIcon name="xmark" size={11} color="currentColor" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {showNewCategoryForm ? (
                  <div style={{ background: c.bgCard, border: `1px solid ${accent}44`, borderRadius: 12, padding: 10 }}>
                    <div style={{ marginBottom: 8 }}>
                      <AutoTranslateField
                        nlValue={newCategoryForm.name_nl}
                        enValue={newCategoryForm.name_en}
                        setNl={v => setNewCategoryForm(f => ({...f, name_nl: v}))}
                        setEn={v => setNewCategoryForm(f => ({...f, name_en: v}))}
                        lang={lang} accent={accent}
                        placeholder={lang === "nl" ? "bijv. Nagels" : "e.g. Nails"}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn-ghost" style={{ flex: 1, padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", color: accent, borderColor: `${accent}55` }} onClick={async () => {
                        const primary = lang === "nl" ? newCategoryForm.name_nl : newCategoryForm.name_en;
                        if (!(primary || "").trim()) { toast.show(lang === "nl" ? "Naam is verplicht" : "Name is required", "error"); return; }
                        const filled = await autoFillTranslations(newCategoryForm, [{ nl: "name_nl", en: "name_en" }], lang);
                        const nlName = (filled.name_nl || filled.name_en || "").trim();
                        const enName = (filled.name_en || "").trim();
                        const nextPos = ((salonData.categories || []).reduce((m, x) => Math.max(m, x.position || 0), 0)) + 1;
                        const { data, error } = await supabase.from("service_categories").insert({ owner_id: salonData.owner_id, name_nl: nlName, name_en: enName || null, position: nextPos }).select().single();
                        if (error || !data) { toast.show(t.somethingWrong, "error"); return; }
                        update(d => { d.categories = [...(d.categories || []), data]; return d; });
                        setNewCategoryForm({ name_nl: "", name_en: "" });
                        setShowNewCategoryForm(false);
                      }}><NavIcon name="check" size={12} color="currentColor" /> {lang === "nl" ? "Toevoegen" : "Add"}</button>
                      <button className="btn-ghost" style={{ padding: "9px 14px" }} onClick={() => { setShowNewCategoryForm(false); setNewCategoryForm({ name_nl: "", name_en: "" }); }}><NavIcon name="xmark" size={12} color="currentColor" /></button>
                    </div>
                  </div>
                ) : (
                  <button className="btn-ghost" style={{ width: "100%", padding: "10px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", fontSize: 12 }} onClick={() => setShowNewCategoryForm(true)}>
                    + {lang === "nl" ? "Categorie toevoegen" : "Add category"}
                  </button>
                )}
              </div>

              {/* Services list — collapsible cards */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{t.services}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{salonData.services.length} {salonData.services.length === 1 ? (lang === "nl" ? "dienst" : "service") : (lang === "nl" ? "diensten" : "services")}</div>
                </div>

                {salonData.services.length === 0 && !showNewServiceForm && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "36px 20px", background: c.bgCard, border: `1px dashed ${c.border}`, borderRadius: 16 }}>
                    <div style={{ opacity: 0.4 }}><NavIcon name="diensten" size={32} color={c.textMuted} /></div>
                    <div style={{ fontSize: 13, color: c.textSub, textAlign: "center" }}>{lang === "nl" ? "Nog geen diensten toegevoegd" : "No services yet"}</div>
                  </div>
                )}

                {/* Search + collapse-all toolbar. Only worth showing when
                    there are more than a couple of services — the search
                    would otherwise just add noise. */}
                {salonData.services.length > 3 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
                      <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: c.textMuted, pointerEvents: "none", display: "flex" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                      </div>
                      <input className="input-field" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)}
                        placeholder={lang === "nl" ? "Zoek dienst..." : "Search services..."}
                        style={{ width: "100%", fontSize: 12, padding: "9px 34px 9px 32px" }} />
                      {serviceSearch && (
                        <button onClick={() => setServiceSearch("")}
                          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: c.inputBorder, border: "none", color: c.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      )}
                    </div>
                    {(() => {
                      // Build the group list once to decide whether we're
                      // currently "all collapsed" or "all expanded" — the
                      // button then flips the opposite direction.
                      const catIdsInUse = new Set();
                      let hasUncat = false;
                      for (const s of salonData.services) {
                        if (s.category_id) catIdsInUse.add(s.category_id);
                        else hasUncat = true;
                      }
                      const totalGroups = catIdsInUse.size + (hasUncat ? 1 : 0);
                      const allCollapsed = totalGroups > 0 && collapsedGroups.size >= totalGroups;
                      return (
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            if (allCollapsed) setCollapsedGroups(new Set());
                            else {
                              const s = new Set(catIdsInUse);
                              if (hasUncat) s.add("__uncat");
                              setCollapsedGroups(s);
                            }
                          }}
                          style={{ fontSize: 10, padding: "8px 12px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, flexShrink: 0 }}
                        >
                          {allCollapsed
                            ? (lang === "nl" ? "Alles openen" : "Expand all")
                            : (lang === "nl" ? "Alles sluiten" : "Collapse all")}
                        </button>
                      );
                    })()}
                  </div>
                )}

                {(() => {
                  // Filter first (search), then bucket by category. Each group
                  // gets its own DndContext so drag-reorder is scoped to a
                  // single category — changing category still goes through the
                  // inline chip / edit form, which keeps this simple.
                  const q = serviceSearch.trim().toLowerCase();
                  const matches = (s) => {
                    if (!q) return true;
                    return (s.name_nl || "").toLowerCase().includes(q)
                        || (s.name_en || "").toLowerCase().includes(q)
                        || (s.name || "").toLowerCase().includes(q);
                  };
                  const buckets = new Map(); // catId -> services[]
                  const uncat = [];
                  for (const s of salonData.services) {
                    if (!matches(s)) continue;
                    if (s.category_id) {
                      if (!buckets.has(s.category_id)) buckets.set(s.category_id, []);
                      buckets.get(s.category_id).push(s);
                    } else {
                      uncat.push(s);
                    }
                  }
                  // Ordered category list follows the category-management order.
                  const orderedCats = (salonData.categories || []).filter(cat => buckets.has(cat.id));
                  const groups = orderedCats.map(cat => ({
                    key: cat.id,
                    label: lang === "nl" ? (cat.name_nl || cat.name_en) : (cat.name_en || cat.name_nl),
                    services: buckets.get(cat.id),
                  }));
                  if (uncat.length > 0) {
                    groups.push({
                      key: "__uncat",
                      label: lang === "nl" ? "Zonder categorie" : "Uncategorised",
                      services: uncat,
                      isUncat: true,
                    });
                  }
                  if (groups.length === 0 && salonData.services.length > 0) {
                    return (
                      <div style={{ textAlign: "center", padding: "24px 16px", color: c.textMuted, fontSize: 12, background: c.bgCard, border: `1px dashed ${c.border}`, borderRadius: 14 }}>
                        {lang === "nl" ? "Geen diensten gevonden voor" : "No services found for"} "{serviceSearch}"
                      </div>
                    );
                  }
                  const renderService = (s) => {
                  const isExpanded = expandedServiceId === s.id;
                  const isEditing = editingService === s.id;
                  const variantCount = (s.variants || []).length;
                  const extrasCount = (s.extras || []).length;
                  const photoCount = (s.photos || []).length;
                  const heroPhoto = s.photos?.[0]?.url || s.photos?.[0];
                  const minVariantPrice = variantCount > 0 ? Math.min(...s.variants.map(v => parseFloat(v.price))) : null;
                  const displayPrice = minVariantPrice !== null ? `${t.from} €${minVariantPrice}` : `€${s.price}`;

                  return (
                    <SortableService key={s.id} id={s.id}>{({ setNodeRef, style: sortStyle, attributes, listeners }) => (
                    <div ref={setNodeRef} style={{
                      ...sortStyle,
                      background: c.bgCard,
                      border: `1px solid ${isExpanded ? `${accent}44` : c.border}`,
                      borderRadius: 16, marginBottom: 10,
                      transition: sortStyle.transition || "border-color 0.2s",
                      overflow: "hidden"
                    }}>
                      {isEditing ? (
                        /* ── EDIT MODE — clean full-width form ── */
                        <div style={{ padding: 18 }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 12 }}>{lang === "nl" ? "Dienst bewerken" : "Edit service"}</div>
                          <div style={{ marginBottom: 10 }}>
                            <AutoTranslateField
                              nlValue={editSvcForm.name_nl}
                              enValue={editSvcForm.name_en}
                              setNl={v => setEditSvcForm(f => ({...f, name_nl: v}))}
                              setEn={v => setEditSvcForm(f => ({...f, name_en: v}))}
                              lang={lang} accent={accent}
                              label={lang === "nl" ? "Naam" : "Name"}
                            />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            <div>
                              <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Prijs (€)" : "Price (€)"}</div>
                              <input className="input-field" type="number" value={editSvcForm.price} onChange={e => setEditSvcForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Duur (minuten)" : "Duration (minutes)"}</div>
                              <input className="input-field" type="number" value={editSvcForm.duration} onChange={e => setEditSvcForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                            </div>
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Categorie" : "Category"}</div>
                            <select className="input-field" value={editSvcForm.category_id || ""} onChange={e => setEditSvcForm(f => ({...f, category_id: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }}>
                              <option value="" style={{ background: c.selectBg, color: c.text }}>{lang === "nl" ? "Geen categorie" : "No category"}</option>
                              {(salonData.categories || []).map(cat => (
                                <option key={cat.id} value={cat.id} style={{ background: c.selectBg, color: c.text }}>{lang === "nl" ? cat.name_nl : (cat.name_en || cat.name_nl)}</option>
                              ))}
                            </select>
                            {(salonData.categories || []).length === 0 && (
                              <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, fontStyle: "italic" }}>
                                {lang === "nl" ? "Voeg eerst categorieën toe bovenaan deze pagina." : "Add categories above to assign one."}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <button className="btn-primary" style={{ padding: "11px 18px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", flex: 1 }} onClick={async () => {
                              const newCatId = editSvcForm.category_id || null;
                              // Fill the empty language via DeepL before saving.
                              const filled = await autoFillTranslations(editSvcForm, [{ nl: "name_nl", en: "name_en" }], lang);
                              const { error } = await supabase.from("services").update({ name_nl: filled.name_nl, name_en: filled.name_en, name: filled.name_nl, price: parseFloat(filled.price), duration: parseInt(filled.duration), category_id: newCatId }).eq("id", s.id);
                              if (error) { toast.show(t.somethingWrong, "error"); return; }
                              update(d => { d.services = d.services.map(sv => sv.id === s.id ? {...sv, name_nl: filled.name_nl, name_en: filled.name_en, price: parseFloat(filled.price), duration: parseInt(filled.duration), category_id: newCatId} : sv); return d; });
                              setEditingService(null);
                            }}>
                              <NavIcon name="check" size={12} color={c.btnOnDark} /> {t.saveChanges}
                            </button>
                            <button className="btn-ghost" style={{ padding: "11px 18px", display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => setEditingService(null)}>
                              <NavIcon name="xmark" size={12} color="currentColor" /> {t.cancel}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* ── HEADER ROW — always visible ── */}
                          <div style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: 16, cursor: "pointer",
                            background: isExpanded ? `${accent}08` : "transparent",
                            transition: "background 0.15s"
                          }} onClick={() => setExpandedServiceId(isExpanded ? null : s.id)}>
                            {/* Drag handle — only renders when there's more than one
                                service to reorder; single-service salons don't need it. */}
                            {salonData.services.length > 1 && (
                              <DragHandle listeners={listeners} attributes={attributes} color={c.textMuted} />
                            )}
                            {/* Thumb */}
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: c.inputBg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                              {heroPhoto ? <img src={heroPhoto} alt="" loading="lazy" onError={e => { e.target.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0, zIndex: 1 }} /> : null}
                              {!heroPhoto && <NavIcon name="scissors" size={18} color={c.textMuted} />}
                            </div>
                            {/* Name + meta */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lang === "nl" ? s.name_nl : (s.name_en || s.name_nl)}</div>
                              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <span>{s.duration} {t.min}</span>
                                {variantCount > 0 && <><span>·</span><span>{variantCount} {variantCount === 1 ? (lang === "nl" ? "variant" : "variant") : (lang === "nl" ? "varianten" : "variants")}</span></>}
                                {extrasCount > 0 && <><span>·</span><span>{extrasCount} extra{extrasCount === 1 ? "" : "s"}</span></>}
                                {photoCount > 0 && <><span>·</span><span>{photoCount} {photoCount === 1 ? (lang === "nl" ? "foto" : "photo") : (lang === "nl" ? "foto's" : "photos")}</span></>}
                                {(salonData.categories || []).length > 0 && (
                                  <span onClick={e => e.stopPropagation()} style={{ display: "inline-flex" }}>
                                    <select
                                      value={s.category_id || ""}
                                      onChange={async (e) => {
                                        const newCatId = e.target.value || null;
                                        const { error } = await supabase.from("services").update({ category_id: newCatId }).eq("id", s.id);
                                        if (error) { toast.show(t.somethingWrong, "error"); return; }
                                        update(d => { d.services = d.services.map(sv => sv.id === s.id ? {...sv, category_id: newCatId} : sv); return d; });
                                      }}
                                      style={{
                                        fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
                                        border: `1px solid ${s.category_id ? `${accent}55` : c.border}`,
                                        background: s.category_id ? `${accent}14` : "transparent",
                                        color: s.category_id ? accent : c.textMuted,
                                        cursor: "pointer", appearance: "none", WebkitAppearance: "none",
                                        maxWidth: 140, textOverflow: "ellipsis"
                                      }}
                                      title={lang === "nl" ? "Categorie wijzigen" : "Change category"}
                                    >
                                      <option value="">{lang === "nl" ? "+ Categorie" : "+ Category"}</option>
                                      {(salonData.categories || []).map(cat => (
                                        <option key={cat.id} value={cat.id}>{lang === "nl" ? cat.name_nl : (cat.name_en || cat.name_nl)}</option>
                                      ))}
                                    </select>
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Price */}
                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, color: accent, flexShrink: 0, lineHeight: 1 }}>{displayPrice}</div>
                            {/* Actions */}
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditingService(s.id); setEditSvcForm({ name_nl: s.name_nl, name_en: s.name_en || "", price: s.price, duration: s.duration, category_id: s.category_id || "" }); setExpandedServiceId(null); }}
                                style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                                title={lang === "nl" ? "Bewerken" : "Edit"}>
                                <NavIcon name="edit" size={13} color="currentColor" />
                              </button>
                              <button onClick={async () => { if (await showConfirm(lang === "nl" ? "Dienst verwijderen?" : "Delete service?")) deleteService(s.id); }}
                                style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                                title={lang === "nl" ? "Verwijderen" : "Delete"}>
                                <NavIcon name="xmark" size={13} color="currentColor" />
                              </button>
                              <div style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: c.textMuted, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                              </div>
                            </div>
                          </div>

                          {/* ── EXPANDED CONTENT ── */}
                          {isExpanded && (
                            <div style={{ padding: "0 16px 18px", borderTop: `1px solid ${c.border}` }}>
                              {/* VARIANTS */}
                              <div style={{ marginTop: 18 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, fontWeight: 600 }}>{t.variants}</div>
                                  <div style={{ fontSize: 10, color: c.textMuted }}>{variantCount}</div>
                                </div>
                                {variantCount === 0 ? (
                                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>{lang === "nl" ? "Geen varianten" : "No variants"}</div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {(s.variants || []).map(v => (
                                      <div key={v.id}>
                                        {editingVariant === v.id ? (
                                          <div style={{ background: c.bg, border: `1px solid ${accent}44`, borderRadius: 12, padding: 12 }}>
                                            <div style={{ marginBottom: 8 }}>
                                              <AutoTranslateField
                                                nlValue={editVariantForm.name_nl}
                                                enValue={editVariantForm.name_en}
                                                setNl={v => setEditVariantForm(f => ({...f, name_nl: v}))}
                                                setEn={v => setEditVariantForm(f => ({...f, name_en: v}))}
                                                lang={lang} accent={accent}
                                                label={lang === "nl" ? "Naam" : "Name"}
                                                placeholder={lang === "nl" ? "bijv. Volledige set" : "e.g. Full set"}
                                              />
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                              <div><label style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4, display: "block" }}>{lang === "nl" ? "Prijs (€)" : "Price (€)"}</label><input className="input-field" type="number" value={editVariantForm.price} onChange={e => setEditVariantForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px", width: "100%" }} placeholder="€" /></div>
                                              <div><label style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4, display: "block" }}>{lang === "nl" ? "Duur (min)" : "Duration (min)"}</label><input className="input-field" type="number" value={editVariantForm.duration} onChange={e => setEditVariantForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px", width: "100%" }} placeholder={lang === "nl" ? "min" : "min"} /></div>
                                            </div>
                                            <div style={{ marginBottom: 8 }}>
                                              <AutoTranslateField
                                                nlValue={editVariantForm.description_nl}
                                                enValue={editVariantForm.description_en}
                                                setNl={v => setEditVariantForm(f => ({...f, description_nl: v}))}
                                                setEn={v => setEditVariantForm(f => ({...f, description_en: v}))}
                                                lang={lang} accent={accent}
                                                label={lang === "nl" ? "Omschrijving" : "Description"}
                                                placeholder={lang === "nl" ? "Omschrijving" : "Description"}
                                              />
                                            </div>
                                            <div style={{ display: "flex", gap: 6 }}>
                                              <button className="btn-ghost" style={{ flex: 1, padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", color: accent, borderColor: `${accent}55` }} onClick={async () => {
                                                const filled = await autoFillTranslations(editVariantForm, [{ nl: "name_nl", en: "name_en" }, { nl: "description_nl", en: "description_en" }], lang);
                                                await supabase.from("service_variants").update({ name_nl: filled.name_nl, name_en: filled.name_en || null, price: parseFloat(filled.price), duration: parseInt(filled.duration), description_nl: filled.description_nl || null, description_en: filled.description_en || null }).eq("id", v.id);
                                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: svc.variants.map(vr => vr.id === v.id ? {...vr, ...filled, price: parseFloat(filled.price), duration: parseInt(filled.duration)} : vr)} : svc); return d; });
                                                setEditingVariant(null);
                                              }}><NavIcon name="check" size={12} color="currentColor" /> {t.saveChanges}</button>
                                              <button className="btn-ghost" style={{ padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }} onClick={() => setEditingVariant(null)}><NavIcon name="xmark" size={12} color="currentColor" /></button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{lang === "nl" ? v.name_nl : (v.name_en || v.name_nl)}</div>
                                              {(lang === "nl" ? v.description_nl : (v.description_en || v.description_nl)) && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{lang === "nl" ? v.description_nl : (v.description_en || v.description_nl)}</div>}
                                              <div style={{ fontSize: 10, color: c.textLabel, marginTop: 2 }}>{v.duration} {t.min}</div>
                                            </div>
                                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent, flexShrink: 0 }}>€{v.price}</div>
                                            <div style={{ display: "flex", gap: 4 }}>
                                              <button aria-label={lang === "nl" ? "Bewerk variant" : "Edit variant"} onClick={() => { setEditingVariant(v.id); setEditVariantForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "", description_en: v.description_en || "" }); }}
                                                style={{ height: 30, padding: "0 12px", borderRadius: 8, border: `1px solid ${accent}55`, background: `${accent}14`, color: accent, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600 }}>
                                                <NavIcon name="edit" size={11} color="currentColor" /> {lang === "nl" ? "Bewerk" : "Edit"}
                                              </button>
                                              <button aria-label={lang === "nl" ? "Verwijder variant" : "Delete variant"} onClick={async () => {
                                                const { error } = await supabase.from("service_variants").delete().eq("id", v.id);
                                                if (error) { toast.show(t.somethingWrong, "error"); return; }
                                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: (svc.variants||[]).filter(x => x.id !== v.id)} : svc); return d; });
                                              }} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <NavIcon name="xmark" size={11} color="currentColor" />
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ marginTop: 8 }}>
                                  <VariantAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(variant) => {
                                    update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: [...(svc.variants||[]), variant]} : svc); return d; });
                                  }} />
                                </div>
                              </div>

                              {/* EXTRAS */}
                              <div style={{ marginTop: 20 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, fontWeight: 600 }}>{t.extras}</div>
                                  <div style={{ fontSize: 10, color: c.textMuted }}>{extrasCount}</div>
                                </div>
                                {extrasCount === 0 ? (
                                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>{lang === "nl" ? "Geen extra's" : "No extras"}</div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {(s.extras || []).map(e => (
                                      <div key={e.id}>
                                        {editingExtra === e.id ? (
                                          <div style={{ background: c.bg, border: `1px solid ${accent}44`, borderRadius: 12, padding: 12 }}>
                                            <div style={{ marginBottom: 8 }}>
                                              <AutoTranslateField
                                                nlValue={editExtraForm.name_nl}
                                                enValue={editExtraForm.name_en}
                                                setNl={v => setEditExtraForm(f => ({...f, name_nl: v}))}
                                                setEn={v => setEditExtraForm(f => ({...f, name_en: v}))}
                                                lang={lang} accent={accent}
                                                label={lang === "nl" ? "Naam" : "Name"}
                                                placeholder={lang === "nl" ? "bijv. Nail art" : "e.g. Nail art"}
                                              />
                                            </div>
                                            <div style={{ marginBottom: 8 }}>
                                              <label style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4, display: "block" }}>{lang === "nl" ? "Prijs (€)" : "Price (€)"}</label>
                                              <input className="input-field" type="number" value={editExtraForm.price} onChange={ev => setEditExtraForm(f => ({...f, price: ev.target.value}))} style={{ fontSize: 12, padding: "9px 11px", width: "100%" }} placeholder="€" />
                                            </div>
                                            <div style={{ display: "flex", gap: 6 }}>
                                              <button className="btn-ghost" style={{ flex: 1, padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", color: accent, borderColor: `${accent}55` }} onClick={async () => {
                                                const filled = await autoFillTranslations(editExtraForm, [{ nl: "name_nl", en: "name_en" }], lang);
                                                const { error } = await supabase.from("service_extras").update({ name_nl: filled.name_nl, name_en: filled.name_en || null, price: parseFloat(filled.price) }).eq("id", e.id);
                                                if (error) { toast.show(t.somethingWrong, "error"); return; }
                                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: svc.extras.map(ex => ex.id === e.id ? {...ex, name_nl: filled.name_nl, name_en: filled.name_en || null, price: parseFloat(filled.price)} : ex)} : svc); return d; });
                                                setEditingExtra(null);
                                              }}><NavIcon name="check" size={12} color="currentColor" /> {t.saveChanges}</button>
                                              <button className="btn-ghost" style={{ padding: "9px 14px" }} onClick={() => setEditingExtra(null)}><NavIcon name="xmark" size={12} color="currentColor" /></button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                                            <span style={{ fontSize: 16, color: accent, lineHeight: 1 }}>+</span>
                                            <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: c.text }}>{lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)}</div>
                                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: accent, flexShrink: 0 }}>+€{e.price}</div>
                                            <div style={{ display: "flex", gap: 4 }}>
                                              <button onClick={() => { setEditingExtra(e.id); setEditExtraForm({ name_nl: e.name_nl, name_en: e.name_en || "", price: e.price }); }}
                                                style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <NavIcon name="edit" size={11} color="currentColor" />
                                              </button>
                                              <button onClick={async () => {
                                                const { error } = await supabase.from("service_extras").delete().eq("id", e.id);
                                                if (error) { toast.show(t.somethingWrong, "error"); return; }
                                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: (svc.extras||[]).filter(x => x.id !== e.id)} : svc); return d; });
                                              }} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <NavIcon name="xmark" size={11} color="currentColor" />
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ marginTop: 8 }}>
                                  <ExtraAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(extra) => {
                                    update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: [...(svc.extras||[]), extra]} : svc); return d; });
                                  }} />
                                </div>
                              </div>

                              {/* PHOTOS */}
                              <div style={{ marginTop: 20 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, fontWeight: 600 }}>{lang === "nl" ? "Foto's" : "Photos"}</div>
                                  <div style={{ fontSize: 10, color: c.textMuted }}>{photoCount}</div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {(s.photos || []).map((p, i) => (
                                    <div key={p.id || i} style={{ position: "relative", flexShrink: 0 }}>
                                      <img src={p.url || p} loading="lazy"
                                        onClick={() => setFocalPicker({ serviceId: s.id, photoId: p.id, url: p.url || p, focal_x: p.focal_x ?? 50, focal_y: p.focal_y ?? 50 })}
                                        style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", objectPosition: `${p.focal_x ?? 50}% ${p.focal_y ?? 50}%`, cursor: "pointer", border: `1px solid ${c.border}` }} />
                                      {(p.focal_x != null && (p.focal_x !== 50 || p.focal_y !== 50)) && (
                                        <div style={{ position: "absolute", left: `${(p.focal_x ?? 50) * 0.72}px`, top: `${(p.focal_y ?? 50) * 0.72}px`, width: 6, height: 6, borderRadius: "50%", background: accent, border: "1px solid #fff", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />
                                      )}
                                      <button onClick={(e) => { e.stopPropagation(); deletePhoto(s.id, p.id, p.url || p); }}
                                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: c.danger, color: "#fff", border: `2px solid ${c.bgCard}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                      </button>
                                    </div>
                                  ))}
                                  <label style={{ width: 72, height: 72, borderRadius: 10, border: `1.5px dashed ${accent}55`, background: `${accent}06`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 2, flexShrink: 0, opacity: photoUploading === s.id ? 0.5 : 1 }}>
                                    {photoUploading === s.id ? (
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                                      </svg>
                                    ) : (
                                      <>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                                        <span style={{ fontSize: 9, color: accent, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{t.addPhoto}</span>
                                      </>
                                    )}
                                    <input type="file" accept="image/*" multiple style={{ display: "none" }}
                                      onChange={e => Array.from(e.target.files).forEach(f => addPhoto(s.id, f))} />
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    )}</SortableService>
                  );
                  };
                  return (
                    <div>
                      {groups.map((g) => {
                        const isCollapsed = collapsedGroups.has(g.key);
                        return (
                          <div key={g.key} style={{ marginBottom: 14 }}>
                            <button
                              onClick={() => {
                                setCollapsedGroups(prev => {
                                  const next = new Set(prev);
                                  if (next.has(g.key)) next.delete(g.key);
                                  else next.add(g.key);
                                  return next;
                                });
                              }}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "10px 14px",
                                background: c.bgCard,
                                border: `1px solid ${c.border}`,
                                borderRadius: 12,
                                cursor: "pointer",
                                marginBottom: isCollapsed ? 0 : 8,
                                color: c.text,
                                textAlign: "left",
                              }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                                style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: c.textMuted, flexShrink: 0 }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                              <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, fontStyle: g.isUncat ? "italic" : "normal", color: g.isUncat ? c.textMuted : c.text }}>
                                {g.label}
                              </span>
                              <span style={{ fontSize: 10, color: c.textMuted, marginLeft: "auto" }}>{g.services.length}</span>
                            </button>
                            {!isCollapsed && (
                              <DndContext
                                sensors={dndSensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleServiceDragEnd}
                              >
                                <SortableContext items={g.services.map(sv => sv.id)} strategy={verticalListSortingStrategy}>
                                  {g.services.map(renderService)}
                                </SortableContext>
                              </DndContext>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Add new service — collapsible CTA */}
                {showNewServiceForm ? (
                  <div style={{ background: c.bgCard, border: `1px solid ${accent}44`, borderRadius: 16, padding: 18, marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{lang === "nl" ? "Nieuwe dienst" : "New service"}</div>
                      <button onClick={() => { setShowNewServiceForm(false); setNewSvc({ name_nl: "", name_en: "", price: "", duration: "60" }); }} style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <AutoTranslateField
                        nlValue={newSvc.name_nl}
                        enValue={newSvc.name_en}
                        setNl={v => setNewSvc(s => ({...s, name_nl: v}))}
                        setEn={v => setNewSvc(s => ({...s, name_en: v}))}
                        lang={lang} accent={accent}
                        label={lang === "nl" ? "Naam" : "Name"}
                        placeholder="Gel Manicure"
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Prijs (€)" : "Price (€)"}</div>
                        <input className="input-field" placeholder="45" type="number" value={newSvc.price} onChange={e => setNewSvc(s => ({...s, price: e.target.value}))} style={{ fontSize: 13, padding: "11px 13px", width: "100%" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Duur (minuten)" : "Duration (minutes)"}</div>
                        <input className="input-field" placeholder="60" type="number" value={newSvc.duration} onChange={e => setNewSvc(s => ({...s, duration: e.target.value}))} style={{ fontSize: 13, padding: "11px 13px", width: "100%" }} />
                      </div>
                    </div>
                    {(salonData.categories || []).length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Categorie" : "Category"}</div>
                        <select className="input-field" value={newSvc.category_id || ""} onChange={e => setNewSvc(s => ({...s, category_id: e.target.value}))} style={{ fontSize: 13, padding: "11px 13px", width: "100%" }}>
                          <option value="" style={{ background: c.selectBg, color: c.text }}>{lang === "nl" ? "Geen categorie" : "No category"}</option>
                          {(salonData.categories || []).map(cat => (
                            <option key={cat.id} value={cat.id} style={{ background: c.selectBg, color: c.text }}>{lang === "nl" ? cat.name_nl : (cat.name_en || cat.name_nl)}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {svcError && <div style={{ fontSize: 11, color: c.danger, marginBottom: 8 }}>{svcError}</div>}
                    <button className="btn-primary" style={{ width: "100%", padding: "12px 18px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={async () => { await addService(); setShowNewServiceForm(false); }}>
                      <NavIcon name="plus" size={13} color={c.btnOnDark} /> {t.addService}
                    </button>
                  </div>
                ) : (
                  <button className="btn-ghost" style={{ width: "100%", marginTop: 10, padding: "14px 18px", borderStyle: "dashed", borderColor: `${accent}44`, color: accent, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => setShowNewServiceForm(true)}>
                    <NavIcon name="plus" size={14} color="currentColor" /> {lang === "nl" ? "Nieuwe dienst toevoegen" : "Add new service"}
                  </button>
                )}
              </div>
              </>}

              {/* ═══ TEAM TAB ═══ */}
              {settingsTab === "team" && <>

              {/* Staff / Team */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.staff}</SL>
                {/* Account type toggle */}
                <div style={{ display: "flex", gap: 6, marginBottom: accountTypeInfo ? 8 : 14 }}>
                  {[["joint", "user", t.jointAccount], ["team", "team", t.teamAccount]].map(([type, icon, label]) => (
                    <div key={type} onClick={() => update(d => { d.account_type = type; return d; })} style={{
                      flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center", transition: "all 0.2s", position: "relative",
                      background: salonData.account_type === type ? `${accent}12` : "transparent",
                      border: `1px solid ${salonData.account_type === type ? accent : c.inputBorder}`
                    }}>
                      {/* Info icon — stopPropagation so tapping "?" doesn't
                          switch the account type. Toggles the description
                          panel below and closes when tapped again. */}
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setAccountTypeInfo(v => v === type ? null : type); }}
                        aria-label={lang === "nl" ? "Meer info" : "More info"}
                        style={{
                          position: "absolute", top: 4, right: 4,
                          width: 18, height: 18, borderRadius: "50%",
                          background: accountTypeInfo === type ? `${accent}22` : "transparent",
                          border: `1px solid ${accountTypeInfo === type ? accent : c.inputBorder}`,
                          color: accountTypeInfo === type ? accent : c.textMuted,
                          cursor: "pointer", padding: 0,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, fontFamily: "'Jost',sans-serif", lineHeight: 1,
                        }}>i</button>
                      <NavIcon name={icon} size={14} color={salonData.account_type === type ? accent : c.textSub} />
                      <div style={{ fontSize: 10, fontWeight: 600, color: salonData.account_type === type ? accent : c.textSub, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                {accountTypeInfo && (
                  <div style={{ marginBottom: 14, padding: "12px 14px", background: c.bg, border: `1px solid ${accent}33`, borderRadius: 12, position: "relative" }}>
                    <button type="button" onClick={() => setAccountTypeInfo(null)}
                      style={{ position: "absolute", top: 6, right: 8, background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 4 }}
                      aria-label={lang === "nl" ? "Sluit" : "Close"}>×</button>
                    <div style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                      {accountTypeInfo === "joint" ? t.jointAccount : t.teamAccount}
                    </div>
                    <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.55 }}>
                      {accountTypeInfo === "joint"
                        ? (lang === "nl"
                            ? <>Eén salon-account voor iedereen. Je logt met dezelfde login in op de vellu.cc/owner-pagina en beheert alles vanuit dit dashboard. Handig als je in je eentje werkt of als het team altijd samen op één laptop / iPad zit.<br /><br /><strong>Kies dit als:</strong> je solo bent, of medewerkers werken alleen aan de kassa en hoeven geen eigen agenda / factuurgegevens te beheren.</>
                            : <>One salon account for everyone. You log in on vellu.cc/owner and manage everything from this dashboard. Handy if you work solo or the team always shares one device.<br /><br /><strong>Pick this when:</strong> you're solo, or your team only works at the front desk and doesn't need a personal agenda or invoice profile.</>)
                        : (lang === "nl"
                            ? <>Elke medewerker krijgt een eigen login op vellu.cc/staff. Ze zien alleen hun eigen afspraken, klanten en facturen. Ze kunnen hun eigen werktijden aanpassen, tijdvakken blokkeren en persoonlijke factuurgegevens (KVK, BTW, IBAN) invullen zodat facturen van hen persoonlijk uitgaan.<br /><br /><strong>Kies dit als:</strong> je met meerdere zelfstandige stylisten werkt, of iedereen een eigen agenda + factuurstroom wil.</>
                            : <>Every staff member gets their own login at vellu.cc/staff. They only see their own appointments, clients and invoices. They can edit their own working hours, block time and add personal invoice details (VAT/IBAN) so invoices go out in their name.<br /><br /><strong>Pick this when:</strong> you work with independent stylists or everyone needs their own agenda and invoicing flow.</>)}
                    </div>
                  </div>
                )}
                {/* Public owner-badge toggle — only relevant when there are
                    multiple staff (otherwise the label is redundant). */}
                {(salonData.staff || []).length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: c.text, marginBottom: 3 }}>
                        {lang === "nl" ? "Toon eigenaar op boekingspagina" : "Show owner on booking page"}
                      </div>
                      <div style={{ fontSize: 10, color: c.textMuted, lineHeight: 1.4 }}>
                        {lang === "nl"
                          ? "Klanten zien dan een badge naast je naam in het team-overzicht."
                          : "Clients will see a badge next to your name in the team list."}
                      </div>
                    </div>
                    <div
                      onClick={() => update(d => { d.show_owner_on_booking = !d.show_owner_on_booking; return d; })}
                      style={{ width: 36, height: 20, borderRadius: 10, background: salonData.show_owner_on_booking ? accent : c.inputBorder, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: salonData.show_owner_on_booking ? 18 : 2, transition: "left 0.2s" }} />
                    </div>
                  </div>
                )}
                {(salonData.staff || []).length === 0 && (
                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noStaff}</div>
                )}
                {(salonData.staff || []).map(m => (
                  <div key={m.id} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 10 }}>
                    {/* Staff header row */}
                    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                      {/* Photo */}
                      <div style={{ flexShrink: 0 }}>
                        {m.avatar_url ? (
                          <div style={{ position: "relative" }}>
                            <img src={m.avatar_url} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "1px solid " + c.inputBorder }} />
                            {editingStaff === m.id && (
                              <div onClick={async () => {
                                await supabase.from("staff_members").update({ avatar_url: null }).eq("id", m.id);
                                update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, avatar_url: null} : s); return d; });
                              }} style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: c.danger, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, cursor: "pointer", border: `2px solid ${c.bgCard}` }}>×</div>
                            )}
                          </div>
                        ) : (
                          editingStaff === m.id ? (
                            <label style={{ width: 52, height: 52, borderRadius: "50%", border: `1.5px dashed ${accent}44`, background: `${accent}06`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 2 }}>
                              <NavIcon name="camera" size={16} color={`${accent}88`} />
                              <span style={{ fontSize: 9, color: `${accent}66` }}>FOTO</span>
                              <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                                const file = e.target.files[0];
                                if (!file) return;
                                const fileName = `${salonData.owner_id}/staff_${m.id}_${Date.now()}.${file.name.split(".").pop()}`;
                                const { error } = await supabase.storage.from("business-images").upload(fileName, file);
                                if (!error) {
                                  const { data: { publicUrl } } = supabase.storage.from("business-images").getPublicUrl(fileName);
                                  await supabase.from("staff_members").update({ avatar_url: publicUrl }).eq("id", m.id);
                                  update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, avatar_url: publicUrl} : s); return d; });
                                }
                              }} />
                            </label>
                          ) : (
                            <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${accent}18`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 600, color: accent }}>{m.name?.[0] || "?"}</div>
                          )
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editingStaff === m.id ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input className="input-field" value={editStaffForm.name} onChange={e => setEditStaffForm(f => ({...f, name: e.target.value}))} style={{ fontSize: 12, padding: "7px 10px", flex: 1 }} placeholder={t.staffName} />
                              <input className="input-field" value={editStaffForm.role} onChange={e => setEditStaffForm(f => ({...f, role: e.target.value}))} style={{ fontSize: 12, padding: "7px 10px", flex: 1 }} placeholder={t.staffRole} />
                            </div>
                            <input className="input-field" type="email" value={editStaffForm.email || ""} onChange={e => setEditStaffForm(f => ({...f, email: e.target.value}))} placeholder={lang === "nl" ? "E-mail voor login (optioneel)" : "Login email (optional)"} style={{ fontSize: 12, padding: "7px 10px" }} />
                            <textarea className="input-field" value={editStaffForm.bio} onChange={e => setEditStaffForm(f => ({...f, bio: e.target.value}))} placeholder={t.staffBio} rows={2} style={{ fontSize: 12, padding: "7px 10px", resize: "vertical" }} />
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {m.name}
                              {m.user_id === salonData.owner_id && (
                                <span title={lang === "nl" ? "Eigenaar van deze salon" : "Salon owner"} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: `${accent}18`, color: accent, border: `1px solid ${accent}44`, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}>
                                  <NavIcon name="crown" size={9} color={accent} />
                                  {lang === "nl" ? "Eigenaar" : "Owner"}
                                </span>
                              )}
                              {m.email && m.user_id !== salonData.owner_id && (
                                <span title={m.user_id ? (lang === "nl" ? "Gekoppeld aan login" : "Linked to login") : (lang === "nl" ? "Wacht op inloggen" : "Waiting for first login")} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: m.user_id ? `${c.success}18` : `${c.warning}18`, color: m.user_id ? c.success : c.warning, border: `1px solid ${m.user_id ? `${c.success}33` : `${c.warning}33`}`, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                                  {m.user_id ? (lang === "nl" ? "Gekoppeld" : "Linked") : (lang === "nl" ? "Uitgenodigd" : "Invited")}
                                </span>
                              )}
                            </div>
                            {m.role && <div style={{ fontSize: 11, color: c.textLabel, marginTop: 2 }}>{m.role}</div>}
                            {m.email && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{m.email}</div>}
                            {m.bio && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4, lineHeight: 1.5 }}>{m.bio}</div>}
                          </>
                        )}
                        {editingStaff !== m.id && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
                            {(m.service_ids?.length > 0) ? m.service_ids.map(sid => {
                              const svc = salonData.services.find(s => s.id === sid);
                              return svc ? <span key={sid} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: `${accent}12`, color: accent, border: `1px solid ${accent}22` }}>{svc.name_nl || svc.name}</span> : null;
                            }) : (
                              <span style={{ fontSize: 10, color: c.textMuted, fontStyle: "italic" }}>{lang === "nl" ? "Alle diensten" : "All services"}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Buttons */}
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {editingStaff === m.id ? (
                          <>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: accent, borderColor: `${accent}33` }} onClick={async () => {
                              const emailTrim = (editStaffForm.email || "").trim().toLowerCase();
                              if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { toast.show(lang === "nl" ? "Ongeldig e-mailadres" : "Invalid email address", "error"); return; }
                              const { error } = await supabase.from("staff_members").update({ name: editStaffForm.name, role: editStaffForm.role || null, email: emailTrim || null, bio: editStaffForm.bio || null, working_hours: editStaffForm.working_hours }).eq("id", m.id).eq("owner_id", salonData.owner_id);
                              if (error) { toast.show(t.somethingWrong, "error"); return; }
                              await supabase.from("staff_services").delete().eq("staff_id", m.id);
                              if (editStaffForm.service_ids.length > 0) {
                                await supabase.from("staff_services").insert(editStaffForm.service_ids.map(sid => ({ staff_id: m.id, service_id: sid })));
                              }
                              update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, name: editStaffForm.name, role: editStaffForm.role, email: emailTrim || null, bio: editStaffForm.bio, working_hours: editStaffForm.working_hours, service_ids: editStaffForm.service_ids} : s); return d; });
                              setEditingStaff(null);
                            }}><NavIcon name="check" size={12} /> {lang === "nl" ? "Opslaan" : "Save"}</button>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px" }} onClick={() => setEditingStaff(null)}><NavIcon name="xmark" size={12} /></button>
                          </>
                        ) : (
                          <>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: accent, borderColor: `${accent}33` }} onClick={() => { setEditingStaff(m.id); setEditStaffForm({ name: m.name, role: m.role || "", email: m.email || "", bio: m.bio || "", working_hours: m.working_hours || {}, service_ids: m.service_ids || [] }); }}><NavIcon name="edit" size={10} color={accent} /> {lang === "nl" ? "Bewerk" : "Edit"}</button>
                            {/* Delete is guarded for the owner-self row — the owner
                                is the salon's anchor and losing that row breaks
                                agenda ownership and the "eigenaar" badge. */}
                            {m.user_id !== salonData.owner_id && (
                              <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: c.danger, borderColor: `${c.danger}26` }} onClick={async () => {
                                if (!await showConfirm(lang === "nl" ? `${m.name} verwijderen?` : `Delete ${m.name}?`)) return;
                                await supabase.from("staff_services").delete().eq("staff_id", m.id);
                                await supabase.from("appointments").update({ staff_id: null }).eq("staff_id", m.id);
                                const { error } = await supabase.from("staff_members").delete().eq("id", m.id);
                                if (error) { toast.show(t.somethingWrong, "error"); return; }
                                update(d => { d.staff = (d.staff || []).filter(s => s.id !== m.id); return d; });
                                toast.show(lang === "nl" ? `${m.name} verwijderd` : `${m.name} deleted`);
                              }}>×</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {/* Expanded edit section */}
                    {editingStaff === m.id && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + c.border }}>
                        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, marginBottom: 8 }}>{t.staffDays}</div>
                        {[0,1,2,3,4,5,6].map(day => {
                          const DAY_FULL = lang === "nl" ? DAY_FULL_NL : DAY_FULL_EN;
                          const staffDay = editStaffForm.working_hours?.[day];
                          const isOn = staffDay ? !staffDay.closed : true;
                          const openTime = staffDay?.open || "09:00";
                          const closeTime = staffDay?.close || "17:30";
                          return (
                            <div key={day} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "4px 0" }}>
                              <div style={{ width: 28, fontSize: 10, fontWeight: 500, color: c.textSub, flexShrink: 0 }}>{DAY_FULL[day].slice(0,2)}</div>
                              <div onClick={() => { setEditStaffForm(f => { const wh = {...(f.working_hours || {})}; if (isOn) wh[day] = { closed: true }; else wh[day] = { closed: false, open: openTime, close: closeTime }; return {...f, working_hours: wh}; }); }}
                                style={{ width: 28, height: 16, borderRadius: 8, background: isOn ? accent : c.bgCardHover, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: isOn ? 14 : 2, transition: "left 0.2s" }} />
                              </div>
                              {isOn ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <select value={openTime} onChange={e => { setEditStaffForm(f => { const wh = {...(f.working_hours || {})}; wh[day] = { closed: false, open: e.target.value, close: wh[day]?.close || closeTime }; return {...f, working_hours: wh}; }); }} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 6, padding: "3px 4px", color: c.text, fontSize: 10, fontFamily: "'Jost',sans-serif" }}>
                                    {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                                  </select>
                                  <span style={{ fontSize: 10, color: c.textMuted }}>–</span>
                                  <select value={closeTime} onChange={e => { setEditStaffForm(f => { const wh = {...(f.working_hours || {})}; wh[day] = { closed: false, open: wh[day]?.open || openTime, close: e.target.value }; return {...f, working_hours: wh}; }); }} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 6, padding: "3px 4px", color: c.text, fontSize: 10, fontFamily: "'Jost',sans-serif" }}>
                                    {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                                  </select>
                                </div>
                              ) : (<span style={{ fontSize: 10, color: c.textMuted, fontStyle: "italic" }}>{t.closed}</span>)}
                            </div>
                          );
                        })}
                        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, marginBottom: 14 }}>{lang === "nl" ? "Leeg/alles aan = volgt salon openingstijden" : "Empty/all on = follows salon hours"}</div>
                        {salonData.services.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.services}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {salonData.services.map(s => {
                                const isOn = editStaffForm.service_ids.includes(s.id);
                                return (<div key={s.id} onClick={() => setEditStaffForm(f => ({...f, service_ids: isOn ? f.service_ids.filter(x => x !== s.id) : [...f.service_ids, s.id]}))}
                                  style={{ fontSize: 10, padding: "4px 10px", borderRadius: 100, cursor: "pointer", border: `1px solid ${isOn ? accent : c.inputBorder}`, background: isOn ? `${accent}18` : "transparent", color: isOn ? accent : c.textSub, transition: "all 0.2s" }}>
                                  {lang === "nl" ? (s.name_nl || s.name) : (s.name_en || s.name_nl || s.name)}</div>);
                              })}
                            </div>
                            <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{lang === "nl" ? "Leeg = alle diensten" : "Empty = all services"}</div>
                          </div>
                        )}
                        {salonData.account_type === "team" && !m.user_id && (
                          <div style={{ padding: "12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: accent, marginBottom: 6 }}><NavIcon name="key" size={10} color={accent} /> {t.inviteStaffDesc}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input className="input-field" placeholder={t.staffEmail} type="email" value={staffInvite[m.id]?.email || ""} onChange={e => setStaffInvite(prev => ({...prev, [m.id]: {...(prev[m.id] || {}), email: e.target.value}}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                              <div style={{ position: "relative" }}>
                                <input className="input-field" placeholder={t.staffPassword}
                                  type={staffInvite[m.id]?.show ? "text" : "password"}
                                  value={staffInvite[m.id]?.password || ""}
                                  onChange={e => setStaffInvite(prev => ({...prev, [m.id]: {...(prev[m.id] || {}), password: e.target.value}}))}
                                  style={{ fontSize: 11, padding: "8px 34px 8px 10px", width: "100%" }} />
                                <button type="button" tabIndex={-1}
                                  onClick={() => setStaffInvite(prev => ({...prev, [m.id]: {...(prev[m.id] || {}), show: !prev[m.id]?.show}}))}
                                  aria-label={staffInvite[m.id]?.show ? (lang === "nl" ? "Wachtwoord verbergen" : "Hide password") : (lang === "nl" ? "Wachtwoord tonen" : "Show password")}
                                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 }}>
                                  {staffInvite[m.id]?.show ? (
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.79 19.79 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19M6.71 6.71 1 1M17.29 17.29 23 23M14.12 14.12A3 3 0 1 1 9.88 9.88" />
                                    </svg>
                                  ) : (
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                              <button className="btn-ghost" style={{ fontSize: 10, color: accent, borderColor: `${accent}44` }}
                                onClick={async () => {
                                  const staffEmail = staffInvite[m.id]?.email;
                                  const staffPass = staffInvite[m.id]?.password;
                                  if (!staffEmail || !staffPass || staffPass.length < 6) return;
                                  const { data: result, error } = await supabase.functions.invoke("create-staff-account", {
                                    body: { staff_id: m.id, email: staffEmail, password: staffPass, owner_id: salonData.owner_id }
                                  });
                                  if (error) { toast.show(lang === "nl" ? "Fout bij uitnodigen" : "Error inviting staff", "error"); return; }
                                  if (result?.success) {
                                    update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, user_id: result.user_id, email: staffEmail} : s); return d; });
                                    setStaffInvite(prev => { const next = {...prev}; delete next[m.id]; return next; });
                                    toast.show(t.inviteSent);
                                  } else { toast.show(result?.error === "email_taken" ? t.emailTaken : (lang === "nl" ? "Fout" : "Error"), "error"); }
                                }}>{t.inviteStaff}</button>
                            </div>
                          </div>
                        )}
                        {salonData.account_type === "team" && m.user_id && (
                          <div style={{ fontSize: 10, color: c.success, display: "flex", alignItems: "center", gap: 3 }}><NavIcon name="check" size={10} color={c.success} /> {m.email || t.staffLoginInfo}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}                <StaffAdder ownerId={salonData.owner_id} services={salonData.services} lang={lang} t={t} accent={accent} onAdd={(member) => {
                  update(d => { d.staff = [...(d.staff || []), member]; return d; });
                }} />
              </div>
              </>}

              {/* ═══ PLANNING TAB ═══ */}
              {settingsTab === "planning" && <>

              {/* Business Hours */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.businessHours}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.businessHoursDesc}</div>
                {[0,1,2,3,4,5,6].map(day => {
                  const DAY_FULL = lang === "nl" ? DAY_FULL_NL : DAY_FULL_EN;
                  const hours = salonData.business_hours?.[day] || DEFAULT_HOURS[day];
                  const isClosed = hours.closed;
                  return (
                    <div key={day} style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 10, 
                      marginBottom: 10, 
                      padding: "10px 12px",
                      background: isClosed ? c.bgCard : `${accent}08`,
                      border: `1px solid ${isClosed ? c.border : `${accent}22`}`,
                      borderRadius: 12,
                      opacity: isClosed ? 0.6 : 1,
                      transition: "all 0.2s"
                    }}>
                      <div style={{ width: 85, fontSize: 12, fontWeight: 500 }}>{DAY_FULL[day]}</div>
                      
                      {/* Closed toggle */}
                      <div 
                        onClick={() => update(d => {
                          if (!d.business_hours) d.business_hours = {...DEFAULT_HOURS};
                          d.business_hours[day] = { ...d.business_hours[day], closed: !isClosed };
                          return d;
                        })}
                        style={{ 
                          width: 36, 
                          height: 20, 
                          borderRadius: 10, 
                          background: isClosed ? c.inputBorder : accent,
                          cursor: "pointer",
                          position: "relative",
                          transition: "all 0.2s",
                          flexShrink: 0
                        }}
                      >
                        <div style={{ 
                          position: "absolute",
                          top: 2,
                          left: isClosed ? 2 : 18,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "left 0.2s"
                        }} />
                      </div>
                      
                      {!isClosed ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                          <select 
                            value={hours.open}
                            onChange={e => update(d => {
                              if (!d.business_hours) d.business_hours = {...DEFAULT_HOURS};
                              d.business_hours[day] = { ...d.business_hours[day], open: e.target.value };
                              return d;
                            })}
                            style={{ 
                              background: c.bgCardHover, 
                              border: "1px solid " + c.inputBorder, 
                              borderRadius: 8, 
                              padding: "6px 8px", 
                              color: c.text, 
                              fontSize: 11,
                              fontFamily: "'Jost',sans-serif",
                              cursor: "pointer"
                            }}
                          >
                            {TIMES.map(t => <option key={t} value={t} style={{ background: c.selectBg }}>{t}</option>)}
                          </select>
                          <span style={{ fontSize: 11, color: c.textLabel }}>—</span>
                          <select 
                            value={hours.close}
                            onChange={e => update(d => {
                              if (!d.business_hours) d.business_hours = {...DEFAULT_HOURS};
                              d.business_hours[day] = { ...d.business_hours[day], close: e.target.value };
                              return d;
                            })}
                            style={{ 
                              background: c.bgCardHover, 
                              border: "1px solid " + c.inputBorder, 
                              borderRadius: 8, 
                              padding: "6px 8px", 
                              color: c.text, 
                              fontSize: 11,
                              fontFamily: "'Jost',sans-serif",
                              cursor: "pointer"
                            }}
                          >
                            {TIMES.map(t => <option key={t} value={t} style={{ background: c.selectBg }}>{t}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: c.textLabel, fontStyle: "italic" }}>{t.closed}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Break time between appointments */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.breakMinutes}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.breakMinutesDesc}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[0, 5, 10, 15, 20, 30].map(mins => (
                    <div key={mins} onClick={() => update(d => { d.break_minutes = mins; return d; })}
                      style={{
                        padding: "10px 16px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s",
                        background: (salonData.break_minutes || 0) === mins ? `${accent}18` : c.inputBg,
                        border: `1px solid ${(salonData.break_minutes || 0) === mins ? accent : c.inputBorder}`,
                        color: (salonData.break_minutes || 0) === mins ? accent : c.textSub,
                        fontSize: 12, fontWeight: 500
                      }}
                    >{mins === 0 ? t.breakNone : `${mins} ${t.breakMin}`}</div>
                  ))}
                </div>
              </div>

              {/* Reminder timing */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.reminderTiming}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.reminderTimingDesc}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[0, 1, 2, 4, 12, 24, 48].map(hrs => (
                    <div key={hrs} onClick={() => update(d => { d.reminder_hours = hrs; return d; })}
                      style={{
                        padding: "10px 16px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s",
                        background: (salonData.reminder_hours ?? 24) === hrs ? `${accent}18` : c.inputBg,
                        border: `1px solid ${(salonData.reminder_hours ?? 24) === hrs ? accent : c.inputBorder}`,
                        color: (salonData.reminder_hours ?? 24) === hrs ? accent : c.textSub,
                        fontSize: 12, fontWeight: 500
                      }}
                    >{hrs === 0 ? t.reminderNone : `${hrs}u ${t.reminderBefore}`}</div>
                  ))}
                </div>
              </div>

              {/* Rebook nudge timing */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.rebookNudge}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.rebookNudgeDesc}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[0, 7, 14, 21, 28, 42, 56].map(days => (
                    <div key={days} onClick={() => update(d => { d.rebook_nudge_days = days; return d; })}
                      style={{
                        padding: "10px 16px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s",
                        background: (salonData.rebook_nudge_days ?? 28) === days ? `${accent}18` : c.inputBg,
                        border: `1px solid ${(salonData.rebook_nudge_days ?? 28) === days ? accent : c.inputBorder}`,
                        color: (salonData.rebook_nudge_days ?? 28) === days ? accent : c.textSub,
                        fontSize: 12, fontWeight: 500
                      }}
                    >{days === 0 ? t.rebookNudgeOff : `${days / 7} ${t.rebookNudgeWeeks}`}</div>
                  ))}
                </div>
              </div>

              {/* Exception Days */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.exceptionDays}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.exceptionDesc}</div>
                {Object.entries(salonData.day_overrides || {}).filter(([_k, v]) => v.type === "exception").map(([date, v]) => (
                  <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 14, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{parseDate(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })}</span>
                        {v.staff_id ? (
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: `${accent}18`, color: accent, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            {(salonData.staff || []).find(sm => sm.id === v.staff_id)?.name || (lang === "nl" ? "Medewerker" : "Staff")}
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: c.inputBg, color: c.textMuted, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            {lang === "nl" ? "Iedereen" : "Everyone"}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: c.textLabel }}>{v.open} — {v.close}</div>
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: c.danger, borderColor: `${c.danger}26` }}
                      onClick={() => update(d => { const o = {...(d.day_overrides || {})}; delete o[date]; d.day_overrides = o; return d; })}>×</button>
                  </div>
                ))}
                {showExceptionForm ? (<>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <input type="date" className="input-field" value={newException.date} onChange={e => setNewException(f => ({...f, date: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px", flex: 1, minWidth: 120 }} />
                    <select value={newException.open} onChange={e => setNewException(f => ({...f, open: e.target.value}))} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, padding: "6px 8px", color: c.text, fontSize: 11, fontFamily: "'Jost',sans-serif" }}>
                      {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                    </select>
                    <span style={{ color: c.textMuted, fontSize: 11, alignSelf: "center" }}>—</span>
                    <select value={newException.close} onChange={e => setNewException(f => ({...f, close: e.target.value}))} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, padding: "6px 8px", color: c.text, fontSize: 11, fontFamily: "'Jost',sans-serif" }}>
                      {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                    </select>
                  </div>
                  {(salonData.staff || []).length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, fontWeight: 600, marginBottom: 4 }}>{lang === "nl" ? "Voor wie?" : "Who?"}</div>
                      <select value={newException.staff_id} onChange={e => setNewException(f => ({...f, staff_id: e.target.value}))}
                        style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, padding: "8px 10px", color: c.text, fontSize: 11, fontFamily: "'Jost',sans-serif", width: "100%" }}>
                        <option value="" style={{ background: c.selectBg }}>{lang === "nl" ? "Iedereen (hele salon)" : "Everyone (whole salon)"}</option>
                        {(salonData.staff || []).map(m => (
                          <option key={m.id} value={m.id} style={{ background: c.selectBg }}>{m.name}</option>
                        ))}
                      </select>
                      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                        {newException.staff_id
                          ? (lang === "nl" ? "Alleen deze medewerker is dan boekbaar op deze dag, ook als ze normaal vrij zijn." : "Only this staff member is bookable that day, even if they'd normally be off.")
                          : (lang === "nl" ? "De hele salon is die dag open met deze tijden." : "The whole salon opens with these hours that day.")}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button className="btn-ghost" style={{ flex: 1, fontSize: 10, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
                      onClick={() => {
                        if (!newException.date) return;
                        const entry = { type: "exception", open: newException.open, close: newException.close };
                        if (newException.staff_id) {
                          const staffName = (salonData.staff || []).find(sm => sm.id === newException.staff_id)?.name || "";
                          entry.staff_id = newException.staff_id;
                          entry.staff_name = staffName;
                        }
                        update(d => { d.day_overrides = {...(d.day_overrides || {}), [newException.date]: entry }; return d; });
                        setNewException({ date: "", open: "09:00", close: "17:30", staff_id: "" });
                        setShowExceptionForm(false);
                      }}>{t.addException}</button>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px", color: c.textSub }}
                      onClick={() => { setNewException({ date: "", open: "09:00", close: "17:30", staff_id: "" }); setShowExceptionForm(false); }}>×</button>
                  </div>
                </>) : (
                  <button className="btn-ghost" style={{ width: "100%", marginTop: 8, fontSize: 10, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
                    onClick={() => setShowExceptionForm(true)}>{t.addException}</button>
                )}
              </div>

              {/* Blocked Days */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.blockedDays}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.blockedDesc}</div>
                {Object.entries(salonData.day_overrides || {}).filter(([date, v]) => v.type === "blocked" && (!v.from || date === v.from || v.block_time_start)).map(([date, v]) => (
                  <div key={date + (v.block_time_start || "")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: `${c.danger}10`, border: `1px solid ${c.danger}26`, borderRadius: 14, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{date}{v.to && v.to !== date ? ` → ${v.to}` : ""}</span>
                        {/* Scope badge: staff name when the block is per-staff,
                            "Iedereen" when it's salon-wide. Matches the label
                            in the agenda modal so it's the same wording. */}
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                          padding: "2px 7px", borderRadius: 100,
                          background: v.staff_id ? `${accent}18` : `${c.danger}18`,
                          color: v.staff_id ? accent : c.danger,
                          border: `1px solid ${v.staff_id ? `${accent}44` : `${c.danger}44`}`,
                        }}>
                          {v.staff_id
                            ? (v.staff_name || ((salonData.staff || []).find(s => s.id === v.staff_id)?.name) || (lang === "nl" ? "Medewerker" : "Staff"))
                            : (lang === "nl" ? "Iedereen" : "Everyone")}
                        </span>
                      </div>
                      {v.block_time_start && v.block_time_end && (
                        <div style={{ fontSize: 10, color: accent, fontWeight: 500 }}>{v.block_time_start} — {v.block_time_end}</div>
                      )}
                      {v.reason && <div style={{ fontSize: 10, color: c.textLabel }}>{v.reason}</div>}
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: c.danger, borderColor: `${c.danger}26` }}
                      onClick={() => {
                        update(d => {
                          const o = {...(d.day_overrides || {})};
                          // Remove all dates in range
                          if (v.to) {
                            // parseDate: local-midnight parsing. new Date("YYYY-MM-DD") is UTC
                            // midnight, and fmt() reads local components — in any UTC-negative
                            // timezone that combination deleted the day BEFORE each intended key.
                            let cur = parseDate(v.from || date);
                            const end = parseDate(v.to);
                            while (cur <= end) { delete o[fmt(cur)]; cur.setDate(cur.getDate() + 1); }
                          } else { delete o[date]; }
                          d.day_overrides = o; return d;
                        });
                      }}>×</button>
                  </div>
                ))}
                {showBlockedForm ? (<>
                  {/* Block mode toggle: whole day or time slot */}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 10 }}>
                    <div onClick={() => setNewBlocked(f => ({...f, mode: "day"}))} style={{
                      padding: "6px 14px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      background: (newBlocked.mode || "day") === "day" ? `${c.danger}1f` : "transparent",
                      color: (newBlocked.mode || "day") === "day" ? c.danger : c.textSub,
                      border: `1px solid ${(newBlocked.mode || "day") === "day" ? `${c.danger}4d` : c.inputBorder}`
                    }}>{t.blockWholeDay}</div>
                    <div onClick={() => setNewBlocked(f => ({...f, mode: "time"}))} style={{
                      padding: "6px 14px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      background: newBlocked.mode === "time" ? `${c.danger}1f` : "transparent",
                      color: newBlocked.mode === "time" ? c.danger : c.textSub,
                      border: `1px solid ${newBlocked.mode === "time" ? `${c.danger}4d` : c.inputBorder}`
                    }}>{t.blockTimeSlot}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input type="date" className="input-field" value={newBlocked.from} onChange={e => setNewBlocked(f => ({...f, from: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px", flex: 1, minWidth: 110 }} placeholder={t.dateFrom} />
                    {(newBlocked.mode || "day") === "day" && (
                      <input type="date" className="input-field" value={newBlocked.to} onChange={e => setNewBlocked(f => ({...f, to: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px", flex: 1, minWidth: 110 }} placeholder={t.dateTo} />
                    )}
                    {newBlocked.mode === "time" && (<>
                      <select className="input-field" value={newBlocked.time_start || "09:00"} onChange={e => setNewBlocked(f => ({...f, time_start: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px", minWidth: 75, background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, color: c.text, fontFamily: "'Jost',sans-serif" }}>
                        {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                      </select>
                      <span style={{ color: c.textMuted, fontSize: 11, alignSelf: "center" }}>—</span>
                      <select className="input-field" value={newBlocked.time_end || "17:30"} onChange={e => setNewBlocked(f => ({...f, time_end: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px", minWidth: 75, background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, color: c.text, fontFamily: "'Jost',sans-serif" }}>
                        {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                      </select>
                    </>)}
                  </div>
                  <input className="input-field" value={newBlocked.reason} onChange={e => setNewBlocked(f => ({...f, reason: e.target.value}))} placeholder={t.blockedReason} style={{ fontSize: 11, padding: "8px 10px", width: "100%", marginTop: 6 }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button className="btn-ghost" style={{ flex: 1, fontSize: 10, borderStyle: "dashed", borderColor: `${c.danger}33`, color: c.danger }}
                      onClick={() => {
                        if (!newBlocked.from) return;
                        const endDate = newBlocked.to || newBlocked.from;
                        update(d => {
                          const o = {...(d.day_overrides || {})};
                          if (newBlocked.mode === "time") {
                            // Time-slot block: store on single date with time range
                            o[newBlocked.from] = { type: "blocked", reason: newBlocked.reason || t.blocked, from: newBlocked.from, to: newBlocked.from, block_time_start: newBlocked.time_start || "09:00", block_time_end: newBlocked.time_end || "17:30" };
                          } else {
                            // Whole day block
                            let cur = new Date(newBlocked.from);
                            const end = new Date(endDate);
                            const first = fmt(cur);
                            while (cur <= end) {
                              o[fmt(cur)] = { type: "blocked", reason: newBlocked.reason || t.blocked, from: first, to: endDate };
                              cur.setDate(cur.getDate() + 1);
                            }
                          }
                          d.day_overrides = o; return d;
                        });
                        setNewBlocked({ from: "", to: "", reason: "", mode: newBlocked.mode || "day", time_start: "09:00", time_end: "17:30" });
                        setShowBlockedForm(false);
                      }}>{t.addBlocked}</button>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px", color: c.textSub }}
                      onClick={() => { setNewBlocked({ from: "", to: "", reason: "", mode: "day", time_start: "09:00", time_end: "17:30" }); setShowBlockedForm(false); }}>×</button>
                  </div>
                </>) : (
                  <button className="btn-ghost" style={{ width: "100%", marginTop: 8, fontSize: 10, borderStyle: "dashed", borderColor: `${c.danger}33`, color: c.danger }}
                    onClick={() => setShowBlockedForm(true)}>{t.addBlocked}</button>
                )}
              </div>

              {/* Google Calendar Sync */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.googleCalendar}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.googleCalendarDesc}</div>
                {salonData.google_calendar_connected ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: `${accent}12`, border: `1px solid ${accent}33`, borderRadius: 12, marginBottom: 10 }}>
                      <NavIcon name="calendar" size={16} color={accent} />
                      <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>{t.googleCalendarConnected}</span>
                    </div>
                    <button className="btn-ghost" style={{ width: "100%", fontSize: 10, color: c.danger, borderColor: `${c.danger}33` }}
                      onClick={async () => {
                        if (!await showConfirm(lang === "nl" ? "Google Agenda ontkoppelen?" : "Disconnect Google Calendar?")) return;
                        await supabase.functions.invoke("google-auth", { body: { action: "disconnect", owner_id: salonData.owner_id } });
                        update(d => { d.google_calendar_connected = false; return d; });
                      }}>{t.googleCalendarDisconnect}</button>
                  </div>
                ) : (
                  <button className="btn-ghost" style={{ width: "100%", fontSize: 12, borderColor: `${accent}33`, color: accent }}
                    onClick={async () => {
                      const { data } = await supabase.functions.invoke("google-auth", { body: { action: "get_url", owner_id: salonData.owner_id } });
                      if (data?.url) window.location.href = data.url;
                    }}>
                    <NavIcon name="calendar" size={14} color={accent} /> {t.googleCalendarConnect}
                  </button>
                )}
              </div>

              {/* Google Reviews (Place ID) — when set, the 24h follow-up email
                  to clients adds a "Leave a review on Google" CTA that opens
                  the write-review dialog for this business. Helps the salon's
                  Google SEO. If empty, the follow-up only links to the
                  Vellu-internal review form (unchanged behavior). */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{lang === "nl" ? "Google Reviews" : "Google Reviews"}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 10 }}>
                  {lang === "nl"
                    ? "Plak hier je Google Place ID om klanten in de follow-up e-mail ook naar Google te laten reviewen. Nog geen Place ID? Zoek je salon op google.com/maps, klik op Delen → Link naar deze plaats kopiëren — de Place ID vind je via places-id.appspot.com of Google's Place ID Finder."
                    : "Paste your Google Place ID here to let clients leave a Google review via the follow-up email. No Place ID yet? Find your salon on google.com/maps and use Google's Place ID Finder tool."}
                </div>
                <input
                  className="input-field"
                  placeholder="ChIJ..."
                  value={salonData.google_place_id || ""}
                  onChange={e => update(d => { d.google_place_id = e.target.value.trim(); return d; })}
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
                {salonData.google_place_id && (
                  <div style={{ marginTop: 10, fontSize: 11 }}>
                    <a
                      href={`https://search.google.com/local/writereview?placeid=${encodeURIComponent(salonData.google_place_id)}`}
                      target="_blank" rel="noreferrer"
                      style={{ color: accent, textDecoration: "none", borderBottom: `1px solid ${accent}44` }}
                    >{lang === "nl" ? "Test je review-link →" : "Test your review link →"}</a>
                  </div>
                )}
              </div>

              {/* No-show auto-block threshold — when a client hits this many
                  no-shows at your salon, future bookings with their email are
                  refused by book-appointment. 0 disables. Scoped per salon so a
                  no-show at one salon doesn't block the client elsewhere. */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{lang === "nl" ? "No-show blokkade" : "No-show block"}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 12 }}>
                  {lang === "nl"
                    ? "Klanten die bij jouw salon dit aantal no-shows hebben worden automatisch geblokkeerd. Toont een waarschuwingsbadge vanaf 2 no-shows."
                    : "Clients with this many no-shows at your salon are automatically blocked. A warning badge appears from 2 no-shows."}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { v: 0, l: lang === "nl" ? "Uit" : "Off" },
                    { v: 2, l: "2×" },
                    { v: 3, l: "3×" },
                    { v: 4, l: "4×" },
                    { v: 5, l: "5×" },
                  ].map(({ v, l }) => {
                    const active = (salonData.auto_block_no_show_threshold ?? 0) === v;
                    return (
                      <div key={v}
                        onClick={() => update(d => { d.auto_block_no_show_threshold = v; return d; })}
                        style={{
                          padding: "8px 14px", borderRadius: 100, cursor: "pointer", fontSize: 11,
                          fontWeight: active ? 600 : 400,
                          background: active ? `${accent}18` : c.inputBg,
                          border: `1px solid ${active ? accent : c.inputBorder}`,
                          color: active ? accent : c.textSub,
                          transition: "all 0.2s",
                        }}
                      >{l}</div>
                    );
                  })}
                </div>
                {/* Quick list of currently blocked clients, with unblock button */}
                {Object.entries(salonData.client_no_shows || {}).filter(([_k, v]) => v.blocked).length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.danger, marginBottom: 8 }}>
                      {lang === "nl" ? "Geblokkeerd" : "Blocked"}
                    </div>
                    {Object.entries(salonData.client_no_shows || {}).filter(([_k, v]) => v.blocked).map(([email, info]) => (
                      <div key={email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 11, color: c.text }}>
                        <div>
                          <span>{email}</span>
                          <span style={{ color: c.textMuted, marginLeft: 8 }}>({info.no_show_count} no-shows)</span>
                        </div>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 10, padding: "4px 10px" }}
                          onClick={async () => {
                            const { error: unblockErr } = await supabase.from("client_no_shows")
                              .update({ blocked: false })
                              .eq("owner_id", salonData.owner_id)
                              .eq("client_email", email);
                            if (unblockErr) { toast.show(lang === "nl" ? "Deblokkeren mislukt" : "Unblock failed", "error"); return; }
                            update(d => {
                              if (d.client_no_shows?.[email]) d.client_no_shows[email].blocked = false;
                              return d;
                            });
                            toast.show(lang === "nl" ? "Klant gedeblokkeerd" : "Client unblocked");
                          }}
                        >{lang === "nl" ? "Deblokkeer" : "Unblock"}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>}

              {/* ═══ BILLING TAB ═══ */}
              {settingsTab === "billing" && <>
              {(() => {
                if (!billingLoaded) {
                  return (
                    <div style={{ padding: "40px 0", textAlign: "center", color: c.textMuted, fontSize: 12 }}>
                      <div style={{ width: 24, height: 24, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                      {lang === "nl" ? "Bezig met laden…" : "Loading…"}
                    </div>
                  );
                }
                const bp = billingProfile || {};
                const status = bp.subscription_status || (bp.plan ? "active" : null);
                const isTrial = status === "trialing";
                const isActive = status === "active";
                const isPastDue = status === "past_due";
                const isCancelled = status === "cancelled";
                const willCancel = !!bp.cancel_at_period_end && isActive;
                const planLabel = bp.plan === "professional" ? t.planProfessional : (bp.plan === "starter" ? t.planStarter : (lang === "nl" ? "Geen abonnement" : "No subscription"));
                const intervalLabel = bp.billing_interval === "yearly" ? (lang === "nl" ? "jaarlijks" : "yearly") : (lang === "nl" ? "maandelijks" : "monthly");
                const expires = bp.plan_expires_at ? new Date(bp.plan_expires_at) : null;
                const daysLeft = expires ? Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000)) : null;
                const trialEnds = bp.trial_ends_at ? new Date(bp.trial_ends_at) : null;
                const trialDaysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000)) : null;
                const fmtEUR = (n) => `€${parseFloat(n || 0).toFixed(2)}`;
                const fmtDate = (d) => d ? new Date(d).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

                const statusColor = isActive ? c.success : isTrial ? ACCENT : isPastDue ? c.warning : c.textLabel;
                const statusLabel = isTrial ? (lang === "nl" ? "Proefperiode" : "Trial")
                  : isActive ? (willCancel ? (lang === "nl" ? "Actief — stopt aan einde periode" : "Active — cancels at period end") : (lang === "nl" ? "Actief" : "Active"))
                  : isPastDue ? (lang === "nl" ? "Betaling mislukt" : "Payment failed")
                  : isCancelled ? (lang === "nl" ? "Geannuleerd" : "Cancelled")
                  : (lang === "nl" ? "Geen abonnement" : "No subscription");

                const handleCancel = async (immediate) => {
                  if (cancelBusy) return;
                  setCancelBusy(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("cancel-subscription", { body: { immediate: !!immediate } });
                    if (error || !data?.success) {
                      const code = data?.error || error?.message || "unknown";
                      toast.show(lang === "nl" ? `Probleem: ${code}` : `Error: ${code}`, "error");
                      setCancelBusy(false);
                      return;
                    }
                    toast.show(lang === "nl" ? "Abonnement opgezegd" : "Subscription cancelled", "success");
                    setCancelConfirmOpen(false);
                    // Refresh the billing snapshot so the UI reflects the new state.
                    const { data: prof } = await supabase
                      .from("profiles")
                      .select("plan, billing_interval, subscription_status, trial_ends_at, plan_expires_at, current_period_start, cancel_at_period_end, mollie_subscription_id")
                      .eq("id", user.id)
                      .maybeSingle();
                    setBillingProfile(prof || null);
                    setCancelBusy(false);
                  } catch (e) {
                    console.error("cancel-subscription error:", e);
                    toast.show(t.somethingWrong, "error");
                    setCancelBusy(false);
                  }
                };

                return (<>
                  {/* Current plan card */}
                  <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 20, marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>
                          {lang === "nl" ? "Huidig abonnement" : "Current plan"}
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, lineHeight: 1.1, marginBottom: 4 }}>
                          {planLabel}
                        </div>
                        <div style={{ fontSize: 12, color: c.textSub }}>
                          {bp.plan ? `${intervalLabel}` : ""}
                        </div>
                      </div>
                      <div style={{
                        padding: "5px 12px", borderRadius: 100, fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}44`,
                        whiteSpace: "nowrap",
                      }}>
                        {statusLabel}
                      </div>
                    </div>

                    {/* Status detail row */}
                    {(isTrial || isActive || isPastDue) && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid " + c.border, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
                        {isTrial && trialEnds && (
                          <div>
                            <div style={{ fontSize: 10, color: c.textLabel, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                              {lang === "nl" ? "Proef eindigt" : "Trial ends"}
                            </div>
                            <div style={{ fontSize: 14, color: c.text }}>{fmtDate(trialEnds)}</div>
                            <div style={{ fontSize: 11, color: ACCENT, marginTop: 2 }}>
                              {trialDaysLeft === 0 ? (lang === "nl" ? "vandaag" : "today") : (lang === "nl" ? `nog ${trialDaysLeft} dagen` : `${trialDaysLeft} days left`)}
                            </div>
                          </div>
                        )}
                        {(isActive || isPastDue) && expires && (
                          <div>
                            <div style={{ fontSize: 10, color: c.textLabel, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                              {willCancel ? (lang === "nl" ? "Toegang tot" : "Access until") : (lang === "nl" ? "Volgende afschrijving" : "Next charge")}
                            </div>
                            <div style={{ fontSize: 14, color: c.text }}>{fmtDate(expires)}</div>
                            {daysLeft !== null && (
                              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                                {lang === "nl" ? `over ${daysLeft} dagen` : `in ${daysLeft} days`}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {isTrial && (
                        <button
                          className="btn-primary"
                          style={{ width: "auto", flex: "0 0 auto" }}
                          onClick={async () => {
                            // Trial → upgrade to paid: kick off Mollie checkout
                            try {
                              const { data, error } = await supabase.functions.invoke("create-subscription", {
                                body: { plan: bp.plan || "starter", billing_interval: bp.billing_interval || "monthly" },
                              });
                              if (error || !data?.checkout_url) {
                                toast.show(lang === "nl" ? "Checkout kon niet starten" : "Could not start checkout", "error");
                                return;
                              }
                              window.location.href = data.checkout_url;
                            } catch { toast.show(t.somethingWrong, "error"); }
                          }}
                        >
                          {lang === "nl" ? "Nu abonneren" : "Subscribe now"}
                        </button>
                      )}
                      {isActive && !willCancel && bp.plan === "starter" && (
                        <button
                          className="btn-primary"
                          style={{ width: "auto", flex: "0 0 auto", opacity: changingPlan ? 0.6 : 1 }}
                          disabled={changingPlan}
                          onClick={() => setUpgradeConfirm(true)}
                        >
                          {changingPlan ? (lang === "nl" ? "Bezig…" : "Working…") : (lang === "nl" ? "Upgraden naar Professional" : "Upgrade to Professional")}
                        </button>
                      )}
                      {isActive && !willCancel && (
                        <button
                          className="btn-ghost"
                          style={{ borderColor: c.danger + "44", color: c.danger }}
                          onClick={() => setCancelConfirmOpen(true)}
                        >
                          {lang === "nl" ? "Abonnement opzeggen" : "Cancel subscription"}
                        </button>
                      )}
                      {isPastDue && (
                        <button
                          className="btn-primary"
                          style={{ width: "auto" }}
                          onClick={async () => {
                            try {
                              const { data, error } = await supabase.functions.invoke("create-subscription", {
                                body: { plan: bp.plan || "starter", billing_interval: bp.billing_interval || "monthly" },
                              });
                              if (error || !data?.checkout_url) {
                                toast.show(lang === "nl" ? "Checkout kon niet starten" : "Could not start checkout", "error");
                                return;
                              }
                              window.location.href = data.checkout_url;
                            } catch { toast.show(t.somethingWrong, "error"); }
                          }}
                        >
                          {lang === "nl" ? "Betaalmethode bijwerken" : "Update payment method"}
                        </button>
                      )}
                      {isCancelled && (
                        <button
                          className="btn-primary"
                          style={{ width: "auto" }}
                          onClick={() => { window.location.href = "/owner"; }}
                        >
                          {lang === "nl" ? "Opnieuw abonneren" : "Resubscribe"}
                        </button>
                      )}
                    </div>

                    {willCancel && (
                      <div style={{ marginTop: 14, padding: 12, background: `${c.warning}11`, border: `1px solid ${c.warning}33`, borderRadius: 12, fontSize: 12, color: c.text }}>
                        {lang === "nl"
                          ? `Je abonnement loopt af op ${fmtDate(expires)}. Tot dan blijft alles werken.`
                          : `Your subscription ends on ${fmtDate(expires)}. Everything keeps working until then.`}
                      </div>
                    )}
                  </div>

                  {/* Cancel confirmation modal */}
                  {cancelConfirmOpen && (
                    <div onClick={() => !cancelBusy && setCancelConfirmOpen(false)}
                         style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}>
                      <div onClick={(e) => e.stopPropagation()}
                           style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: 24, maxWidth: 420, width: "100%" }}>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 300, marginBottom: 8 }}>
                          {lang === "nl" ? "Abonnement opzeggen?" : "Cancel subscription?"}
                        </div>
                        <div style={{ fontSize: 13, color: c.textSub, marginBottom: 18, lineHeight: 1.5 }}>
                          {lang === "nl"
                            ? `Je toegang blijft actief tot ${fmtDate(expires)}. Je wordt niet meer afgeschreven. Je kunt opnieuw beginnen wanneer je wilt.`
                            : `Your access stays active until ${fmtDate(expires)}. You won't be charged again. You can resubscribe anytime.`}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-ghost" style={{ flex: 1 }} disabled={cancelBusy}
                                  onClick={() => setCancelConfirmOpen(false)}>
                            {lang === "nl" ? "Behouden" : "Keep"}
                          </button>
                          <button className="btn-primary" style={{ flex: 1, background: c.danger, color: "#fff" }} disabled={cancelBusy}
                                  onClick={() => handleCancel(false)}>
                            {cancelBusy ? (lang === "nl" ? "Bezig…" : "…") : (lang === "nl" ? "Opzeggen" : "Cancel")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Invoice history */}
                  <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 20, marginBottom: 12 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 16 }}>
                      {lang === "nl" ? "Facturen van Vellu" : "Vellu invoices"}
                    </div>
                    {billingInvoices.length === 0 ? (
                      <div style={{ fontSize: 12, color: c.textMuted, padding: "12px 0" }}>
                        {lang === "nl" ? "Nog geen facturen — facturen verschijnen hier zodra je een betaling doet." : "No invoices yet — they'll appear here after your first payment."}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {billingInvoices.map((inv) => (
                          <div key={inv.id} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                            padding: "10px 12px", borderRadius: 10, background: c.bg, border: `1px solid ${c.border}`,
                            fontSize: 12,
                          }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, color: c.text }}>{inv.invoice_number}</div>
                              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                                {fmtDate(inv.issued_at)}
                                {inv.period_start && inv.period_end ? ` · ${fmtDate(inv.period_start)} – ${fmtDate(inv.period_end)}` : ""}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                              <div style={{ fontWeight: 600, color: c.text }}>{fmtEUR(inv.total_eur)}</div>
                              <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>
                                {lang === "nl" ? "incl. btw" : "incl. VAT"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Legal footer — Vellu's own entity, NOT the salon's */}
                  <div style={{ fontSize: 10, color: c.textMuted, textAlign: "center", padding: "12px 0", lineHeight: 1.5 }}>
                    {lang === "nl"
                      ? "Vellu is een product van Mirah Ventures · KVK 42045867 · Amersfoort"
                      : "Vellu is a product of Mirah Ventures · Chamber of Commerce 42045867 · Amersfoort"}
                  </div>
                </>);
              })()}
              </>}

              {/* ═══ FACTURATIE TAB ═══ */}
              {settingsTab === "facturatie" && <>

              {/* ── ACCOUNT — change email / password ─────────────────
                  Both changes re-authenticate with the current password
                  first so a stolen session can't silently swap the login.
                  Supabase sends a confirmation link to the new email
                  before it takes effect — the UI just triggers it. */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                <SL>{lang === "nl" ? "Account" : "Account"}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14, lineHeight: 1.5 }}>
                  {lang === "nl"
                    ? "Wijzig je inlog-e-mail of wachtwoord. Je huidige wachtwoord is altijd nodig ter bevestiging."
                    : "Change your login email or password. Your current password is required for either change."}
                </div>

                {/* Current login email — read-only info line */}
                <div style={{ padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel }}>{lang === "nl" ? "Huidig e-mailadres" : "Current email"}</div>
                    <div style={{ fontSize: 12, color: c.text, marginTop: 3, wordBreak: "break-word" }}>{user.email}</div>
                  </div>
                </div>

                {/* ── Change email ── */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, fontWeight: 600, marginBottom: 10 }}>
                    {lang === "nl" ? "Nieuw e-mailadres" : "New email"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input className="input-field" type="email" placeholder={lang === "nl" ? "nieuw@voorbeeld.nl" : "new@example.com"} autoComplete="off"
                      value={accountForm.newEmail}
                      onChange={e => setAccountForm(f => ({ ...f, newEmail: e.target.value }))}
                      style={{ width: "100%" }} />
                    <div style={{ position: "relative" }}>
                      <input className="input-field" placeholder={lang === "nl" ? "Huidig wachtwoord" : "Current password"}
                        autoComplete="current-password"
                        type={accountShowPw.currentEmail ? "text" : "password"}
                        value={accountForm.currentPasswordForEmail}
                        onChange={e => setAccountForm(f => ({ ...f, currentPasswordForEmail: e.target.value }))}
                        style={{ width: "100%", paddingRight: 40 }} />
                      <button type="button" tabIndex={-1}
                        onClick={() => setAccountShowPw(s => ({ ...s, currentEmail: !s.currentEmail }))}
                        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", lineHeight: 0 }}
                        aria-label={accountShowPw.currentEmail ? (lang === "nl" ? "Verberg" : "Hide") : (lang === "nl" ? "Toon" : "Show")}>
                        {accountShowPw.currentEmail ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.79 19.79 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19M6.71 6.71 1 1M17.29 17.29 23 23M14.12 14.12A3 3 0 1 1 9.88 9.88" /></svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                        )}
                      </button>
                    </div>
                    <button className="btn-primary" disabled={accountSaving === "email" || !accountForm.newEmail || !accountForm.currentPasswordForEmail}
                      style={{ width: "auto", alignSelf: "flex-start", padding: "10px 20px", fontSize: 11 }}
                      onClick={async () => {
                        const newEmail = accountForm.newEmail.trim().toLowerCase();
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { toast.show(lang === "nl" ? "Ongeldig e-mailadres" : "Invalid email address", "error"); return; }
                        if (newEmail === (user.email || "").toLowerCase()) { toast.show(lang === "nl" ? "Dit is al je huidige e-mailadres" : "That's already your current email", "error"); return; }
                        setAccountSaving("email");
                        try {
                          // Re-authenticate to prove ownership before allowing an
                          // email change. Supabase then sends a confirmation to
                          // the NEW address; login stays on the current one until
                          // the recipient clicks the link.
                          const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: accountForm.currentPasswordForEmail });
                          if (reAuthErr) { toast.show(lang === "nl" ? "Huidig wachtwoord klopt niet" : "Current password is incorrect", "error"); return; }
                          // emailRedirectTo pins the confirmation link back to
                          // the LIVE site — without it, Supabase falls back to
                          // whatever Site URL is set on the project (which is
                          // localhost while you develop, so real users would
                          // get an unreachable link).
                          const redirectTo = `${window.location.origin}/owner`;
                          const { error: updErr } = await supabase.auth.updateUser({ email: newEmail }, { emailRedirectTo: redirectTo });
                          if (updErr) { toast.show(updErr.message, "error"); return; }
                          toast.show(lang === "nl" ? "Check je nieuwe e-mail voor de bevestigingslink" : "Check your new inbox for a confirmation link");
                          setAccountForm(f => ({ ...f, newEmail: "", currentPasswordForEmail: "" }));
                        } finally {
                          setAccountSaving("");
                        }
                      }}>
                      {accountSaving === "email" ? "…" : (lang === "nl" ? "Wijzig e-mail" : "Change email")}
                    </button>
                    <div style={{ fontSize: 10, color: c.textMuted, lineHeight: 1.5 }}>
                      {lang === "nl"
                        ? "We sturen een bevestigingslink naar het nieuwe adres. Je login blijft op het oude adres staan tot je de link opent."
                        : "We'll email a confirmation link to the new address. Your login stays on the old email until you open the link."}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 18 }} />

                {/* ── Change password ── */}
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, fontWeight: 600, marginBottom: 10 }}>
                    {lang === "nl" ? "Nieuw wachtwoord" : "New password"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { key: "currentPasswordForPw", show: "currentPw", placeholder: lang === "nl" ? "Huidig wachtwoord" : "Current password", autoComplete: "current-password" },
                      { key: "newPassword", show: "newPw", placeholder: lang === "nl" ? "Nieuw wachtwoord (min. 6 tekens)" : "New password (min. 6 chars)", autoComplete: "new-password" },
                      { key: "newPasswordConfirm", show: "confirmPw", placeholder: lang === "nl" ? "Nieuw wachtwoord herhalen" : "Confirm new password", autoComplete: "new-password" },
                    ].map(f => (
                      <div key={f.key} style={{ position: "relative" }}>
                        <input className="input-field" placeholder={f.placeholder}
                          autoComplete={f.autoComplete}
                          type={accountShowPw[f.show] ? "text" : "password"}
                          value={accountForm[f.key]}
                          onChange={e => setAccountForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                          style={{ width: "100%", paddingRight: 40 }} />
                        <button type="button" tabIndex={-1}
                          onClick={() => setAccountShowPw(s => ({ ...s, [f.show]: !s[f.show] }))}
                          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", lineHeight: 0 }}
                          aria-label={accountShowPw[f.show] ? (lang === "nl" ? "Verberg" : "Hide") : (lang === "nl" ? "Toon" : "Show")}>
                          {accountShowPw[f.show] ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.79 19.79 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19M6.71 6.71 1 1M17.29 17.29 23 23M14.12 14.12A3 3 0 1 1 9.88 9.88" /></svg>
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                          )}
                        </button>
                      </div>
                    ))}
                    <button className="btn-primary" disabled={accountSaving === "password" || !accountForm.currentPasswordForPw || !accountForm.newPassword || !accountForm.newPasswordConfirm}
                      style={{ width: "auto", alignSelf: "flex-start", padding: "10px 20px", fontSize: 11 }}
                      onClick={async () => {
                        if (accountForm.newPassword.length < 6) { toast.show(lang === "nl" ? "Wachtwoord moet minimaal 6 tekens zijn" : "Password must be at least 6 characters", "error"); return; }
                        if (accountForm.newPassword !== accountForm.newPasswordConfirm) { toast.show(lang === "nl" ? "Wachtwoorden komen niet overeen" : "Passwords do not match", "error"); return; }
                        if (accountForm.newPassword === accountForm.currentPasswordForPw) { toast.show(lang === "nl" ? "Nieuw wachtwoord moet anders zijn dan het huidige" : "New password must be different from the current one", "error"); return; }
                        setAccountSaving("password");
                        try {
                          const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: accountForm.currentPasswordForPw });
                          if (reAuthErr) { toast.show(lang === "nl" ? "Huidig wachtwoord klopt niet" : "Current password is incorrect", "error"); return; }
                          const { error: updErr } = await supabase.auth.updateUser({ password: accountForm.newPassword });
                          if (updErr) { toast.show(updErr.message, "error"); return; }
                          toast.show(lang === "nl" ? "Wachtwoord bijgewerkt" : "Password updated");
                          setAccountForm(f => ({ ...f, currentPasswordForPw: "", newPassword: "", newPasswordConfirm: "" }));
                        } finally {
                          setAccountSaving("");
                        }
                      }}>
                      {accountSaving === "password" ? "…" : (lang === "nl" ? "Wijzig wachtwoord" : "Change password")}
                    </button>
                    <div style={{ fontSize: 10, color: c.textMuted, lineHeight: 1.5 }}>
                      {lang === "nl"
                        ? "Wachtwoord vergeten? Log uit en gebruik de \"Wachtwoord vergeten\"-knop op het inlogscherm."
                        : "Forgot your password? Log out and use the \"Forgot password\" link on the sign-in screen."}
                    </div>
                  </div>
                </div>
              </div>


              {/* Appearance Section */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 16 }}>{t.appearance}</div>

                {/* Logo upload */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: c.textSub, marginBottom: 8 }}>{t.logoDesc}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {salonData.logo_url ? (
                      <div style={{ position: "relative" }}>
                        <img src={salonData.logo_url} style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover", border: `1px solid ${c.inputBorder}` }} />
                        <button onClick={() => update(d => { d.logo_url = ""; return d; })}
                          style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", background: c.danger, color: "#fff", border: `2px solid ${c.bgCard}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ) : (
                      <label style={{ width: 72, height: 72, borderRadius: 14, border: `1.5px dashed ${accent}55`, background: `${accent}08`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4, flexShrink: 0 }}>
                        <NavIcon name="camera" size={20} color={accent} />
                        <span style={{ fontSize: 9, color: accent, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>{t.logo}</span>
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const fileName = `${salonData.owner_id}/logo_${Date.now()}.${file.name.split(".").pop()}`;
                          const { error } = await supabase.storage.from("business-images").upload(fileName, file);
                          if (!error) {
                            const { data: { publicUrl } } = supabase.storage.from("business-images").getPublicUrl(fileName);
                            update(d => { d.logo_url = publicUrl; return d; });
                          }
                        }} />
                      </label>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 2 }}>{t.logo}</div>
                      <div style={{ fontSize: 10, color: c.textMuted }}>{lang === "nl" ? "Verschijnt op je pagina en facturen" : "Shown on your page and invoices"}</div>
                    </div>
                  </div>
                </div>

                {/* Cover image upload */}
                <div>
                  <div style={{ fontSize: 11, color: c.textSub, marginBottom: 8 }}>{t.coverDesc}</div>
                  {salonData.cover_image_url ? (
                    <div style={{ position: "relative" }}>
                      <div style={{ width: "100%", height: 120, borderRadius: 14, overflow: "hidden", border: `1px solid ${c.inputBorder}`, position: "relative" }}>
                        <img src={salonData.cover_image_url} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `center ${salonData.cover_focal_y ?? 50}%`, display: "block" }} />
                      </div>
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: c.textLabel, flexShrink: 0 }}>{lang === "nl" ? "Positie" : "Position"}</span>
                        <input type="range" min="0" max="100" value={salonData.cover_focal_y ?? 50}
                          onChange={e => update(d => { d.cover_focal_y = parseInt(e.target.value); return d; })}
                          style={{ flex: 1, accentColor: accent, height: 4 }} />
                      </div>
                      <button onClick={() => update(d => { d.cover_image_url = ""; d.cover_focal_y = 50; return d; })}
                        style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, backdropFilter: "blur(8px)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ) : (
                    <label style={{ width: "100%", height: 120, borderRadius: 14, border: `1.5px dashed ${accent}55`, background: `${accent}08`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 6 }}>
                      <NavIcon name="image" size={22} color={accent} />
                      <span style={{ fontSize: 10, color: accent, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>{t.uploadCover}</span>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const fileName = `${salonData.owner_id}/cover_${Date.now()}.${file.name.split(".").pop()}`;
                        const { error } = await supabase.storage.from("business-images").upload(fileName, file);
                        if (!error) {
                          const { data: { publicUrl } } = supabase.storage.from("business-images").getPublicUrl(fileName);
                          update(d => { d.cover_image_url = publicUrl; return d; });
                        }
                      }} />
                    </label>
                  )}
                </div>
              </div>

              {/* Booking Policy Section — separate NL/EN so the public profile
                  shows the right text when the visitor toggles language. EN is
                  optional; when empty the NL text is shown for both languages. */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.bookingPolicy}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 10 }}>{t.bookingPolicyDesc}</div>
                <AutoTranslateField
                  nlValue={salonData.booking_policy || ""}
                  enValue={salonData.booking_policy_en || ""}
                  setNl={v => update(d => { d.booking_policy = v; return d; })}
                  setEn={v => update(d => { d.booking_policy_en = v; return d; })}
                  lang={lang} accent={accent}
                  textarea rows={6}
                  placeholder={t.bookingPolicyPlaceholder}
                />
              </div>

              {/* Phone Required Toggle */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{t.phoneRequired}</div>
                    <div style={{ fontSize: 11, color: c.textLabel }}>{t.phoneRequiredDesc}</div>
                  </div>
                  <div
                    onClick={() => update(d => { d.phone_required = !d.phone_required; return d; })}
                    style={{
                      width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                      background: salonData.phone_required ? accent : c.toggleInactive,
                      position: "relative", transition: "background 0.2s"
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: salonData.phone_required ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s"
                    }} />
                  </div>
                </div>
              </div>

              {/* Waitlist Toggle */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{lang === "nl" ? "Wachtlijst" : "Waitlist"}</div>
                    <div style={{ fontSize: 11, color: c.textLabel, lineHeight: 1.4 }}>
                      {lang === "nl"
                        ? "Klanten kunnen zich aanmelden als er geen tijd vrij is. Bij een annulering krijgt de eerste wachtende automatisch een mail."
                        : "Clients can sign up when nothing is free. When an appointment is cancelled the first waiting client is emailed automatically."}
                    </div>
                  </div>
                  <div
                    onClick={() => update(d => { d.waitlist_enabled = !d.waitlist_enabled; return d; })}
                    style={{
                      width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                      background: salonData.waitlist_enabled ? accent : c.toggleInactive,
                      position: "relative", transition: "background 0.2s", flexShrink: 0
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: salonData.waitlist_enabled ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s"
                    }} />
                  </div>
                </div>
              </div>

              {/* Booking Window Section */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.bookingWindow}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 12 }}>{t.bookingWindowDesc}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, fontSize: 12, color: c.text }}>{t.minAdvance}</div>
                    <select 
                      value={salonData.min_advance_hours || 0} 
                      onChange={e => update(d => { d.min_advance_hours = parseInt(e.target.value); return d; })}
                      style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 10, padding: "8px 12px", color: c.text, fontSize: 12, fontFamily: "'Jost',sans-serif", minWidth: 120 }}
                    >
                      <option value={0} style={{ background: c.selectBg }}>-</option>
                      <option value={1} style={{ background: c.selectBg }}>1 {t.hours}</option>
                      <option value={2} style={{ background: c.selectBg }}>2 {t.hours}</option>
                      <option value={4} style={{ background: c.selectBg }}>4 {t.hours}</option>
                      <option value={6} style={{ background: c.selectBg }}>6 {t.hours}</option>
                      <option value={12} style={{ background: c.selectBg }}>12 {t.hours}</option>
                      <option value={24} style={{ background: c.selectBg }}>24 {t.hours}</option>
                      <option value={48} style={{ background: c.selectBg }}>48 {t.hours}</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, fontSize: 12, color: c.text }}>{t.maxAdvance}</div>
                    <select 
                      value={salonData.max_advance_days || 60} 
                      onChange={e => update(d => { d.max_advance_days = parseInt(e.target.value); return d; })}
                      style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 10, padding: "8px 12px", color: c.text, fontSize: 12, fontFamily: "'Jost',sans-serif", minWidth: 120 }}
                    >
                      <option value={7} style={{ background: c.selectBg }}>7 {t.days}</option>
                      <option value={14} style={{ background: c.selectBg }}>14 {t.days}</option>
                      <option value={30} style={{ background: c.selectBg }}>30 {t.days}</option>
                      <option value={60} style={{ background: c.selectBg }}>60 {t.days}</option>
                      <option value={90} style={{ background: c.selectBg }}>90 {t.days}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Discount Codes Section */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{t.discountCodes}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{(salonData.discount_codes || []).filter(c => c.active).length} / {(salonData.discount_codes || []).length} {lang === "nl" ? "actief" : "active"}</div>
                </div>

                {/* Existing codes */}
                {(salonData.discount_codes || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "14px 0", fontStyle: "italic" }}>{lang === "nl" ? "Geen kortingscodes" : "No discount codes"}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    {(salonData.discount_codes || []).map((code, idx) => (
                      <div key={idx} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 14px",
                        background: code.active ? c.bg : c.inputBg,
                        borderRadius: 14,
                        border: `1px solid ${code.active ? `${c.success}33` : c.border}`,
                        opacity: code.active ? 1 : 0.6,
                        transition: "all 0.2s"
                      }}>
                        {/* Tag icon */}
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}14`, border: `1px solid ${accent}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <NavIcon name="tag" size={14} color={accent} />
                        </div>
                        {/* Code + amount */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: "monospace", letterSpacing: "0.04em" }}>{code.code}</div>
                          <div style={{ fontSize: 11, color: c.textSub, marginTop: 2 }}>
                            <span style={{ color: accent, fontWeight: 600 }}>{code.type === "percent" ? `${code.amount}%` : `€${code.amount}`}</span>
                            {" "}{t.discount.toLowerCase()}
                          </div>
                        </div>
                        {/* Active toggle */}
                        <div
                          onClick={() => update(d => { d.discount_codes[idx].active = !d.discount_codes[idx].active; return d; })}
                          style={{
                            width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                            background: code.active ? c.success : c.toggleInactive,
                            position: "relative", transition: "background 0.2s", flexShrink: 0
                          }}>
                          <div style={{ position: "absolute", top: 2, left: code.active ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                        </div>
                        {/* Delete */}
                        <button onClick={() => update(d => { d.discount_codes = d.discount_codes.filter((_, i) => i !== idx); return d; })}
                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <NavIcon name="xmark" size={11} color="currentColor" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new code form */}
                <div style={{ padding: 14, background: c.bg, border: `1px dashed ${accent}44`, borderRadius: 14 }}>
                  <div style={{ fontSize: 9, color: c.textLabel, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{lang === "nl" ? "Nieuwe code" : "New code"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 0.7fr", gap: 8, marginBottom: 10 }}>
                    <input className="input-field" placeholder={t.discountCode} value={newDiscount.code} onChange={e => setNewDiscount(d => ({...d, code: e.target.value.toUpperCase()}))} style={{ fontSize: 12, padding: "10px 12px", fontFamily: "monospace", letterSpacing: "0.04em" }} />
                    <input className="input-field" placeholder={t.discountAmount} type="number" value={newDiscount.amount} onChange={e => setNewDiscount(d => ({...d, amount: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
                    <select value={newDiscount.type} onChange={e => setNewDiscount(d => ({...d, type: e.target.value}))} style={{ background: c.inputBg, border: "1px solid " + c.inputBorder, borderRadius: 14, padding: "10px 12px", color: c.text, fontSize: 12, fontFamily: "'Jost',sans-serif", cursor: "pointer" }}>
                      <option value="percent" style={{ background: c.selectBg }}>%</option>
                      <option value="fixed" style={{ background: c.selectBg }}>€</option>
                    </select>
                  </div>
                  <button className="btn-ghost" style={{ width: "100%", padding: "10px 16px", display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => {
                    if (!newDiscount.code || !newDiscount.amount) return;
                    update(d => {
                      d.discount_codes = [...(d.discount_codes || []), { ...newDiscount, amount: parseFloat(newDiscount.amount) }];
                      return d;
                    });
                    setNewDiscount({ code: "", amount: "", type: "percent", active: true });
                  }}>
                    <NavIcon name="plus" size={13} color="currentColor" /> {t.addDiscountCode}
                  </button>
                </div>
              </div>

              {/* Birthday email — opt-in per salon. Cron runs daily server-
                  side and picks up any client whose birthday matches today,
                  provided the salon has this toggled on and set a discount %.
                  Owner only needs to configure once, then it runs itself. */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>
                  {lang === "nl" ? "Verjaardagsmail" : "Birthday email"}
                </div>
                <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.55, marginBottom: 14 }}>
                  {lang === "nl"
                    ? "Stuur automatisch een verjaardagswens met kortingscode naar klanten waarvan je de geboortedatum weet. Vul geboortedatum in via 'Bewerk klant' of importeer via CSV met een kolom 'birthday' (jjjj-mm-dd)."
                    : "Automatically send a birthday wish + discount code to clients whose birthday you know. Add birthdays via 'Edit customer' or CSV import with a 'birthday' column (yyyy-mm-dd)."}
                </div>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{lang === "nl" ? "Verjaardagsmail aan" : "Enable birthday email"}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{lang === "nl" ? "Cron draait elke ochtend rond 09:10" : "Cron runs every morning around 09:10"}</div>
                  </div>
                  <div
                    onClick={() => update(d => { d.birthday_email_enabled = !d.birthday_email_enabled; return d; })}
                    style={{
                      width: 40, height: 22, borderRadius: 100, position: "relative",
                      background: salonData.birthday_email_enabled ? accent : c.inputBorder,
                      transition: "background 0.2s", flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: salonData.birthday_email_enabled ? 20 : 2,
                      width: 18, height: 18, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </div>
                </label>
                {salonData.birthday_email_enabled && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Korting (%)" : "Discount (%)"}</div>
                      <input
                        className="input-field"
                        type="number" min={1} max={99}
                        value={salonData.birthday_email_discount_pct ?? ""}
                        onChange={e => update(d => { const v = parseInt(e.target.value); d.birthday_email_discount_pct = Number.isFinite(v) ? Math.max(1, Math.min(99, v)) : null; return d; })}
                        placeholder="10"
                        style={{ width: "100%", fontSize: 13, padding: "10px 12px" }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Code-prefix" : "Code prefix"}</div>
                      <input
                        className="input-field"
                        value={salonData.birthday_email_code_prefix || ""}
                        onChange={e => update(d => { d.birthday_email_code_prefix = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); return d; })}
                        placeholder="BDAY"
                        style={{ width: "100%", fontSize: 13, padding: "10px 12px", fontFamily: "'Courier New',monospace", letterSpacing: "0.06em" }}
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1", fontSize: 10, color: c.textMuted, marginTop: -4 }}>
                      {(() => {
                        const pct = salonData.birthday_email_discount_pct || 10;
                        const prefix = (salonData.birthday_email_code_prefix || "BDAY");
                        return lang === "nl"
                          ? `Voorbeeldcode: ${prefix}-ANNA-${pct} · Vergeet niet 'Opslaan' om je instelling te bewaren.`
                          : `Example code: ${prefix}-ANNA-${pct} · Don't forget to hit 'Save' to keep this setting.`;
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Newsletter — compose + send a one-off email to all clients
                  who have booked here. Recipients derived server-side. */}
              <NewsletterBlock
                ownerId={salonData.owner_id}
                lang={lang}
                c={c}
                accent={accent}
                toast={toast}
              />

              {/* CSV client export — downloadable client list for marketing,
                  GDPR portability requests, accountant handoff, or switching
                  platforms. Runs client-side via clientExport.js. */}
              <ClientExportBlock
                ownerId={salonData.owner_id}
                salonName={salonData.name}
                lang={lang}
                c={c}
                accent={accent}
                toast={toast}
              />

              {/* Referral program — each owner has a unique 8-char code. When
                  a new salon signs up via /owner?ref=CODE, both sides get
                  1 free month credited (redeemed on billing via iDEAL when
                  that ships). For now we just track and display. */}
              <ReferralBlock
                salonData={salonData}
                lang={lang}
                c={c}
                accent={accent}
                toast={toast}
              />

              {/* Mobile logout — sidebar is hidden on mobile, so expose logout here */}
              {isMobile && (
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 12 }}>{t.account || (lang === "nl" ? "Account" : "Account")}</div>
                  <button
                    className="btn-ghost"
                    style={{ width: "100%", padding: "12px 16px", display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", color: c.textLabel }}
                    onClick={onLogout}
                  >
                    <NavIcon name="logout" size={14} color={c.textLabel} />
                    {t.logout}
                  </button>
                </div>
              )}
              </>}

            </div>
          </div>
          </>
          )}

        </main>

        {/* Floating save button -- position:fixed OUTSIDE main, like cookie banner */}
        {view === "instellingen" && (
          <div style={{ position: "fixed", bottom: isMobile ? "calc(80px + env(safe-area-inset-bottom, 0px))" : 24, left: isMobile ? 0 : 260, right: 0, display: "flex", justifyContent: "center", zIndex: 99, pointerEvents: "none" }}>
            <button style={{ background: accent, color: c.btnOnDark, border: "none", borderRadius: 100, padding: isMobile ? "12px 36px" : "14px 48px", fontFamily: "'Jost',sans-serif", fontSize: isMobile ? 12 : 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", pointerEvents: "auto", boxShadow: `0 4px 20px ${accent}44, 0 8px 32px rgba(0,0,0,0.5)` }} onClick={async () => {
                // Auto-translate booking policy if only one language is filled.
                const filledPolicy = await autoFillTranslations(
                  { booking_policy: salonData.booking_policy || "", booking_policy_en: salonData.booking_policy_en || "" },
                  [{ nl: "booking_policy", en: "booking_policy_en" }],
                  lang
                );
                if (filledPolicy.booking_policy !== (salonData.booking_policy || "") || filledPolicy.booking_policy_en !== (salonData.booking_policy_en || "")) {
                  update(d => { d.booking_policy = filledPolicy.booking_policy; d.booking_policy_en = filledPolicy.booking_policy_en; return d; });
                }
                const updateData = {
                  business_name: salonData.name,
                  city: salonData.city,
                  accent_color: salonData.accent,
                  address: salonData.address || null,
                  kvk_number: salonData.kvk_number || null,
                  btw_id: salonData.btw_id || null,
                  btw_rate: salonData.btw_rate === "" || salonData.btw_rate == null ? 21 : salonData.btw_rate,
                  iban: salonData.iban || null,
                  invoice_prefix: salonData.invoice_prefix || "INV",
                  // Extras are stored in ONE jsonb column so we have to write
                  // the whole array — including each extra's next_invoice_number
                  // counter. sendInvoice keeps salonData.invoice_profiles in
                  // sync when it increments, so this write is safe.
                  invoice_profiles: salonData.invoice_profiles || [],
                  // NOTE: next_invoice_number is intentionally excluded from this save.
                  // It's owned by sendInvoice() exclusively — saving settings after an
                  // invoice was sent would otherwise roll the counter back to the stale
                  // local value, producing duplicate invoice numbers.
                  business_hours: salonData.business_hours || DEFAULT_HOURS,
                  booking_policy: filledPolicy.booking_policy || null,
                  booking_policy_en: filledPolicy.booking_policy_en || null,
                  salon_phone: salonData.salon_phone || null,
                  salon_instagram: salonData.salon_instagram || null,
                  salon_email: salonData.salon_email || null,
                  whatsapp_number: salonData.whatsapp_number || null,
                  phone_required: salonData.phone_required || false,
                  waitlist_enabled: salonData.waitlist_enabled !== false,
                  birthday_email_enabled: !!salonData.birthday_email_enabled,
                  birthday_email_discount_pct: salonData.birthday_email_discount_pct ?? null,
                  birthday_email_code_prefix: (salonData.birthday_email_code_prefix || "").trim() || null,
                  break_minutes: salonData.break_minutes || 0,
                  logo_url: salonData.logo_url || null,
                  cover_image_url: salonData.cover_image_url || null,
                  cover_focal_y: salonData.cover_focal_y ?? 50,
                  discount_codes: salonData.discount_codes || [],
                  day_overrides: salonData.day_overrides || {},
                  account_type: salonData.account_type || "joint",
                  show_owner_on_booking: !!salonData.show_owner_on_booking,
                  min_advance_hours: salonData.min_advance_hours || 0,
                  max_advance_days: salonData.max_advance_days || 60,
                  reminder_hours: salonData.reminder_hours ?? 24,
                  rebook_nudge_days: salonData.rebook_nudge_days ?? 28,
                  google_place_id: salonData.google_place_id || null,
                  auto_block_no_show_threshold: salonData.auto_block_no_show_threshold ?? 0
                };
                const { data: updatedRows, error } = await supabase.from("profiles").update(updateData).eq("id", salonData.owner_id).select();
                if (error) {
                  console.error("Save error:", error);
                  toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
                } else if (!updatedRows || updatedRows.length === 0) {
                  console.error("Save: no rows updated");
                  toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
                } else {
                  // Settings saved successfully
                  setSaved(true); setTimeout(() => setSaved(false), 2000);
                  toast.show(lang === "nl" ? "Instellingen opgeslagen" : "Settings saved");
                }
              }}>{saved ? t.saved : t.save}</button>
          </div>
        )}

        {/* Mobile Bottom Nav — must be OUTSIDE main (overflow:hidden breaks position:fixed on iOS) */}
        {isMobile && (
          <div style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: c.bg,
            borderTop: "1px solid " + c.border,
            display: "flex",
            padding: "10px 2px 8px",
            paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) + 4px))",
            zIndex: 100,
            // Promote to its own GPU layer. Without this, iOS Safari/PWA can
            // fail to repaint a position:fixed bar while the page scrolls,
            // making page content "bleed through" beneath it.
            transform: "translateZ(0)",
            WebkitTransform: "translateZ(0)",
            backfaceVisibility: "hidden"
          }}>
            {navItems.map(([k, icon, label]) => (
              <div key={k} className="nav-item" role="tab" tabIndex={0} aria-selected={view === k} onClick={() => setView(k)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(k); } }} style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <NavIcon name={icon} size={18} color={view === k ? accent : c.textMuted} />
                <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.01em", textTransform: "uppercase", color: view === k ? accent : c.textMuted, transition: "color 0.2s", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Add Appointment Modal */}
        {showAddAppt && (
          <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(12px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowAddAppt(false)}>
            <div style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 24, padding: 28, maxWidth: 460, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              {!addApptDone ? (<>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ marginBottom: 10 }}><NavIcon name="calendar" size={32} color={accent} /></div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300 }}>{t.addAppointment}</div>
                  <div style={{ fontSize: 11, color: c.textSub, marginTop: 4 }}>{t.addAppointmentDesc}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Multi-service list — the owner picks one or more services
                      per client. Each row can point at its own stylist. */}
                  {(addApptForm.services || []).map((row, idx) => {
                    const selSvc = salonData.services.find(s => s.id === row.service_id);
                    const hasVariants = !!selSvc?.variants?.length;
                    const hasExtras = !!selSvc?.extras?.length;
                    return (
                      <div key={row.id} style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, fontWeight: 600 }}>
                            {lang === "nl" ? `Dienst ${idx + 1}` : `Service ${idx + 1}`}
                          </div>
                          {(addApptForm.services || []).length > 1 && (
                            <button type="button"
                              onClick={() => setAddApptForm(f => ({ ...f, services: (f.services || []).filter((_, i) => i !== idx) }))}
                              style={{ background: "transparent", border: `1px solid ${c.danger}33`, color: c.danger, cursor: "pointer", borderRadius: 8, padding: "3px 8px", fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <NavIcon name="xmark" size={10} color="currentColor" /> {lang === "nl" ? "Verwijder" : "Remove"}
                            </button>
                          )}
                        </div>
                        <select className="input-field" value={row.service_id}
                          onChange={e => setAddApptForm(f => ({ ...f, services: (f.services || []).map((r, i) => i === idx ? { ...r, service_id: e.target.value, variant_id: "", extra_ids: [] } : r) }))}
                          style={{ fontSize: 12 }}>
                          <option value="" style={{ background: c.selectBg }}>—</option>
                          {salonData.services.map(s => <option key={s.id} value={s.id} style={{ background: c.selectBg }}>{lang === "nl" ? s.name_nl : s.name_en} — €{s.price}</option>)}
                        </select>
                        {hasVariants && (
                          <select className="input-field" value={row.variant_id || ""}
                            onChange={e => setAddApptForm(f => ({ ...f, services: (f.services || []).map((r, i) => i === idx ? { ...r, variant_id: e.target.value } : r) }))}
                            style={{ fontSize: 12 }}>
                            <option value="" style={{ background: c.selectBg }}>— {lang === "nl" ? "Geen variant" : "No variant"}</option>
                            {selSvc.variants.map(v => <option key={v.id} value={v.id} style={{ background: c.selectBg }}>{lang === "nl" ? v.name_nl : (v.name_en || v.name_nl)} — €{v.price} · {v.duration} min</option>)}
                          </select>
                        )}
                        {hasExtras && (
                          <div>
                            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, fontWeight: 600, marginBottom: 6 }}>
                              {lang === "nl" ? "Extra's (optioneel)" : "Extras (optional)"}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {selSvc.extras.map(ex => {
                                const on = (row.extra_ids || []).includes(ex.id);
                                const label = lang === "nl" ? ex.name_nl : (ex.name_en || ex.name_nl);
                                return (
                                  <button key={ex.id} type="button"
                                    onClick={() => setAddApptForm(f => ({ ...f, services: (f.services || []).map((r, i) => {
                                      if (i !== idx) return r;
                                      const cur = new Set(r.extra_ids || []);
                                      if (cur.has(ex.id)) cur.delete(ex.id); else cur.add(ex.id);
                                      return { ...r, extra_ids: Array.from(cur) };
                                    }) }))}
                                    style={{
                                      cursor: "pointer", border: `1px solid ${on ? accent : c.inputBorder}`,
                                      background: on ? `${accent}18` : "transparent",
                                      color: on ? accent : c.textSub, fontSize: 11, padding: "6px 10px",
                                      borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4,
                                      fontWeight: on ? 600 : 500,
                                    }}>
                                    {on && <NavIcon name="check" size={10} color={accent} />}
                                    {label} · +€{parseFloat(ex.price || 0).toFixed(2)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {(salonData.staff || []).length > 0 && (
                          <select className="input-field" value={row.staff_id}
                            onChange={e => setAddApptForm(f => ({ ...f, services: (f.services || []).map((r, i) => i === idx ? { ...r, staff_id: e.target.value } : r) }))}
                            style={{ fontSize: 12 }}>
                            <option value="" style={{ background: c.selectBg }}>{t.anyStaff}</option>
                            {(salonData.staff || []).map(m => <option key={m.id} value={m.id} style={{ background: c.selectBg }}>{m.name}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" className="btn-ghost"
                    onClick={() => setAddApptForm(f => ({ ...f, services: [...(f.services || []), { id: `s_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, service_id: "", variant_id: "", extra_ids: [], staff_id: "" }] }))}
                    style={{ borderStyle: "dashed", borderColor: `${accent}44`, color: accent, fontSize: 11, padding: "10px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    <NavIcon name="plus" size={12} color={accent} /> {lang === "nl" ? "Nog een dienst toevoegen" : "Add another service"}
                  </button>
                  <div>
                    <SL>{t.selectDateFor}</SL>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="date" className="input-field" value={addApptForm.date} onChange={e => setAddApptForm(f => ({...f, date: e.target.value}))} style={{ fontSize: 12, flex: 1 }} />
                      <select className="input-field" value={addApptForm.time} onChange={e => setAddApptForm(f => ({...f, time: e.target.value}))} style={{ fontSize: 12, flex: 1 }}>
                        <option value="" style={{ background: c.selectBg }}>—</option>
                        {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <SL>{t.clientDetails}</SL>
                    {/* Client mode toggle */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      <div onClick={() => { setClientMode("existing"); setClientSearch(""); }} style={{
                        flex: 1, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontSize: 11, fontWeight: 600, textAlign: "center",
                        background: clientMode === "existing" ? `${accent}18` : "transparent",
                        color: clientMode === "existing" ? accent : c.textSub,
                        border: `1px solid ${clientMode === "existing" ? `${accent}44` : c.inputBorder}`
                      }}>{t.selectClient}</div>
                      <div onClick={() => setClientMode("new")} style={{
                        flex: 1, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontSize: 11, fontWeight: 600, textAlign: "center",
                        background: clientMode === "new" ? `${accent}18` : "transparent",
                        color: clientMode === "new" ? accent : c.textSub,
                        border: `1px solid ${clientMode === "new" ? `${accent}44` : c.inputBorder}`
                      }}>{t.newClient}</div>
                    </div>
                    
                    {clientMode === "existing" ? (
                      <div>
                        <input className="input-field" placeholder={t.searchClients} value={clientSearch}
                          onChange={e => setClientSearch(e.target.value)}
                          style={{ fontSize: 13, marginBottom: 12 }} />
                        {/* Client list -- inline, not a dropdown */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                          {(() => {
                            const filtered = clientList.filter(cl => {
                              if (!clientSearch) return true;
                              const q = clientSearch.toLowerCase();
                              return (cl.first_name || "").toLowerCase().includes(q) || (cl.last_name || "").toLowerCase().includes(q) || (cl.email || "").toLowerCase().includes(q) || (cl.phone || "").includes(q);
                            }).slice(0, 10);
                            if (filtered.length === 0) return (
                              <div style={{ textAlign: "center", padding: "20px 0", color: c.textMuted, fontSize: 12 }}>
                                {lang === "nl" ? "Geen klanten gevonden" : "No clients found"}
                                <div style={{ marginTop: 8 }}>
                                  <span onClick={() => setClientMode("new")} style={{ color: accent, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>{t.newClient} →</span>
                                </div>
                              </div>
                            );
                            return filtered.map((cl, idx) => {
                              const isSelected = addApptForm.client_email === cl.email;
                              const initials = ((cl.first_name?.[0] || "") + (cl.last_name?.[0] || "")).toUpperCase();
                              return (
                                <div key={cl.id || cl.email || idx} onClick={() => {
                                  setAddApptForm(f => ({
                                    ...f,
                                    client_name: `${cl.first_name || ""} ${cl.last_name || ""}`.trim(),
                                    client_email: cl.email || "",
                                    client_phone: cl.phone || "",
                                    client_allergies: cl.allergies || ""
                                  }));
                                  setClientSearch(`${cl.first_name || ""} ${cl.last_name || ""}`.trim());
                                }} style={{
                                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                                  background: isSelected ? `${accent}12` : c.bgCard,
                                  border: `1px solid ${isSelected ? accent : c.border}`,
                                  borderRadius: 14, cursor: "pointer", transition: "all 0.15s"
                                }}>
                                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: isSelected ? `${accent}22` : c.bgCardHover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: isSelected ? accent : c.textSub, flexShrink: 0 }}>
                                    {initials}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>{cl.first_name} {cl.last_name}</div>
                                    {(cl.email || cl.phone) && <div style={{ fontSize: 11, color: c.textLabel, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl.email}{cl.phone ? ` · ${cl.phone}` : ""}</div>}
                                  </div>
                                  {isSelected && <div style={{ width: 20, height: 20, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: c.btnOnDark, fontSize: 12 }}>✓</span></div>}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input className="input-field" placeholder={t.name} value={addApptForm.client_name} onChange={e => setAddApptForm(f => ({...f, client_name: e.target.value}))} style={{ fontSize: 12 }} />
                        <input className="input-field" placeholder={t.email} type="email" value={addApptForm.client_email} onChange={e => setAddApptForm(f => ({...f, client_email: e.target.value}))} style={{ fontSize: 12 }} />
                        <input className="input-field" placeholder={`${t.phone} (${t.optional})`} value={addApptForm.client_phone} onChange={e => setAddApptForm(f => ({...f, client_phone: e.target.value}))} style={{ fontSize: 12 }} />
                      </div>
                    )}
                    {/* Allergies — shown for both client modes; prefilled from the
                        selected client's record. Health data (AVG art. 9): only
                        record what the client shared for treatment safety. */}
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{t.allergies} ({t.allergiesOptional})</div>
                      <textarea className="input-field" rows={2} placeholder={t.allergiesPlaceholder} value={addApptForm.client_allergies} onChange={e => setAddApptForm(f => ({...f, client_allergies: e.target.value}))} style={{ fontSize: 12, resize: "vertical", width: "100%" }} />
                    </div>
                  </div>
                </div>
                <button className="btn-primary" style={{ marginTop: 16 }} disabled={addApptLoading || !(addApptForm.services || []).length || (addApptForm.services || []).some(r => !r.service_id) || !addApptForm.date || !addApptForm.time || !addApptForm.client_name || !addApptForm.client_email}
                  onClick={async () => {
                    setAddApptLoading(true);
                    // Resolve each row into {svc, variant, staff, price, duration}
                    // and compose the combined booking the same way book-appointment
                    // does: joined service_name, summed price + duration, primary
                    // staff on staff_id, full map on staff_assignments, ordered
                    // breakdown on service_breakdown.
                    const rows = [];
                    for (const r of (addApptForm.services || [])) {
                      const svc = salonData.services.find(s => s.id === r.service_id);
                      if (!svc) continue;
                      const variant = svc.variants?.find(v => v.id === r.variant_id);
                      const staff = (salonData.staff || []).find(m => m.id === r.staff_id);
                      // Extras add to price but not duration (matches client flow —
                      // service_extras schema has no duration column).
                      const extras = (svc.extras || []).filter(ex => (r.extra_ids || []).includes(ex.id));
                      const extrasPrice = extras.reduce((s, ex) => s + parseFloat(ex.price || 0), 0);
                      const price = parseFloat(variant ? variant.price : svc.price) + extrasPrice;
                      const duration = parseInt(variant ? variant.duration : svc.duration);
                      const extrasSuffix = extras.length
                        ? " + " + extras.map(ex => lang === "nl" ? ex.name_nl : (ex.name_en || ex.name_nl)).join(", ")
                        : "";
                      const labelBase = (lang === "nl" ? svc.name_nl : svc.name_en) + (variant ? " — " + (lang === "nl" ? variant.name_nl : (variant.name_en || variant.name_nl)) : "") + extrasSuffix;
                      const labelFull = labelBase + (staff ? ` (${staff.name})` : "");
                      rows.push({ svc, variant, extras, staff, price, duration, labelBase, labelFull });
                    }
                    if (rows.length === 0) {
                      toast.show(lang === "nl" ? "Dienst niet gevonden — herlaad de pagina" : "Service not found — please reload", "error");
                      setAddApptLoading(false);
                      return;
                    }
                    const combinedName = rows.map(r => r.labelFull).join(" · ");
                    const totalPrice = rows.reduce((s, r) => s + (Number.isFinite(r.price) ? r.price : 0), 0);
                    const totalDuration = rows.reduce((s, r) => s + (Number.isFinite(r.duration) ? r.duration : 60), 0);
                    const staffAssignments = Object.fromEntries(rows.filter(r => r.staff).map(r => [r.svc.id, r.staff.id]));
                    const staffNames = rows.map(r => r.staff?.name).filter(Boolean);
                    let runningOffset = 0;
                    const serviceBreakdown = rows.map(r => {
                      const entry = { service_id: r.svc.id, staff_id: r.staff?.id || null, duration: r.duration, offset_min: runningOffset, label: r.labelBase };
                      runningOffset += r.duration;
                      return entry;
                    });
                    const primaryStaff = rows.find(r => r.staff)?.staff || null;
                    // Save client. NOTE: clients.email is globally unique right now, so we
                    // don't scope by owner_id. See TODO on the data model in book-appointment.
                    const email = addApptForm.client_email.toLowerCase().trim();
                    const nameTrim = addApptForm.client_name.trim();
                    const allergiesTrim = (addApptForm.client_allergies || "").trim();
                    let clientId = null;
                    const { data: existing } = await supabase.from("clients").select("id, allergies").eq("email", email).maybeSingle();
                    if (existing) {
                      clientId = existing.id;
                      // Keep the client record in sync when the owner typed or
                      // corrected allergy info during this booking.
                      if (allergiesTrim && allergiesTrim !== (existing.allergies || "")) {
                        await supabase.from("clients").update({ allergies: allergiesTrim }).eq("id", existing.id);
                      }
                    }
                    else {
                      const nameParts = nameTrim.split(" ");
                      const { data: nc } = await supabase.from("clients").insert({ email, first_name: nameParts[0] || nameTrim, last_name: nameParts.slice(1).join(" ") || "", phone: addApptForm.client_phone || null, allergies: allergiesTrim || null }).select("id").single();
                      if (nc) clientId = nc.id;
                    }
                    // Insert appointment — primary service_id is the first row so
                    // legacy code paths that expect a single service_id still work.
                    const apptData = {
                      owner_id: salonData.owner_id, service_id: rows[0].svc.id, client_id: clientId,
                      service_name: combinedName,
                      service_price: totalPrice, service_duration: totalDuration,
                      date: addApptForm.date, time: addApptForm.time,
                      client_name: addApptForm.client_name, client_email: email, client_phone: addApptForm.client_phone || null,
                      client_allergies: allergiesTrim || null,
                      payment_method: "on-arrival", status: "confirmed", invoice_sent: false,
                      staff_id: primaryStaff?.id || null,
                      staff_name: staffNames.length > 0 ? staffNames.join(", ") : null,
                      staff_assignments: staffAssignments,
                      service_breakdown: serviceBreakdown,
                    };
                    const { data: appt, error: apptError } = await supabase.from("appointments").insert(apptData).select("*").single();
                    if (apptError || !appt) {
                      toast.show(lang === "nl" ? "Fout bij het toevoegen van afspraak" : "Error adding appointment", "error");
                      setAddApptLoading(false);
                      return;
                    }
                    update(d => { d.appointments = [appt, ...d.appointments]; return d; });
                    // Send confirmation email
                    const bookingConfirmPayload = {
                      client_name: addApptForm.client_name, client_email: email,
                      client_phone: addApptForm.client_phone || null,
                      service_name: apptData.service_name, date: addApptForm.date, time: addApptForm.time,
                      payment: "on-arrival", price: totalPrice,
                      salon_name: salonData.name, owner_email: null,
                      salon_accent: salonData.accent || "", salon_logo: salonData.logo_url || "",
                      owner_id: salonData.owner_id, lang
                    };
                    await sendEmails("booking_confirmation", bookingConfirmPayload);
                    sendSMS("booking_confirmation", bookingConfirmPayload).catch(() => { /* logged in helper */ });
                    // Notify every assigned staff — combined bookings can have
                    // more than one, dedupe on email so nobody gets it twice.
                    const staffEmails = Array.from(new Set(rows.map(r => r.staff?.email).filter(Boolean)));
                    if (staffEmails.length > 0) {
                      await sendEmails("booking_notification", {
                        owner_email: null, staff_emails: staffEmails,
                        client_name: addApptForm.client_name, client_phone: addApptForm.client_phone || null,
                        service_name: apptData.service_name, date: addApptForm.date, time: addApptForm.time,
                        price: totalPrice, salon_name: salonData.name,
                        salon_accent: salonData.accent || "", salon_logo: salonData.logo_url || "", lang
                      });
                    }
                    setAddApptDone(true);
                    setAddApptLoading(false);
                  }}>
                  {addApptLoading ? "..." : t.confirm}
                </button>
                <button className="btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => setShowAddAppt(false)}>{t.cancelEdit}</button>
              </>) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ marginBottom: 16 }}><NavIcon name="check" size={48} color={c.success} /></div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 8 }}>{t.appointmentAdded}</div>
                  <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddAppt(false)}>{t.close}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Focal point picker overlay */}
        {focalPicker && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 10000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}
            onClick={() => setFocalPicker(null)}>
            <div style={{ fontSize: 12, color: "#fff", marginBottom: 12, textAlign: "center", opacity: 0.8 }}>
              {lang === "nl" ? "Klik op het belangrijkste deel van de foto" : "Click on the most important part of the photo"}
            </div>
            <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "70vh", borderRadius: 16, overflow: "hidden", cursor: "crosshair" }}
              onClick={e => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                setFocalPoint(focalPicker.serviceId, focalPicker.photoId, x, y);
              }}>
              <img src={focalPicker.url} style={{ display: "block", maxWidth: "90vw", maxHeight: "70vh", objectFit: "contain" }} />
              <div style={{
                position: "absolute",
                left: `${focalPicker.focal_x}%`, top: `${focalPicker.focal_y}%`,
                width: 20, height: 20, borderRadius: "50%",
                border: `2px solid #fff`, background: `${accent}88`,
                transform: "translate(-50%,-50%)", pointerEvents: "none",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.4)"
              }} />
            </div>
            <button className="btn-ghost" style={{ marginTop: 16, color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
              onClick={() => setFocalPicker(null)}>
              {lang === "nl" ? "Sluiten" : "Close"}
            </button>
          </div>
        )}

        {/* Photo gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)} onKeyDown={e => e.key === "Escape" && setGallery(null)}>
            <img src={gallery.photos[gallery.idx]?.url || gallery.photos[gallery.idx]} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {gallery.photos.map((p, i) => (
                <img key={p.id || i} src={p.url || p} onClick={e => { e.stopPropagation(); setGallery(g => ({...g, idx: i})); }}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `2px solid ${i === gallery.idx ? accent : "transparent"}`, opacity: i === gallery.idx ? 1 : 0.5, transition: "all 0.2s" }} />
              ))}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}

// ─── STAFF APP (team member view) ─────────────────────────────

export { OwnerApp, PlanSelection, OnboardingWizard, VariantAdder, ExtraAdder, StaffAdder, LocationAdder };
export default OwnerApp;
