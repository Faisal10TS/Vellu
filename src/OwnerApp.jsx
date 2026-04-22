import { useState, useEffect, useRef } from "react";
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
  compressImage, sendEmails, ACCENT,
  getGoogleCalUrl, getWhatsAppUrl, getWhatsAppBookingMsg, getWhatsAppReminderMsg,
  getToday, fmt, getDays,
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
              min={new Date().toISOString().slice(0, 10)}
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

function VariantAdder({ serviceId, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name_nl: "", name_en: "", description_nl: "", description_en: "", price: "", duration: "60" });

  const add = async () => {
    if (!form.name_nl || !form.price) return;
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) { toast.show(lang === "nl" ? "Ongeldige prijs" : "Invalid price", "error"); return; }
    const { data, error } = await supabase.from("service_variants").insert({
      service_id: serviceId, name_nl: form.name_nl, name_en: form.name_en || null,
      description_nl: form.description_nl || null, description_en: form.description_en || null,
      price, duration: parseInt(form.duration) || 60
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
        <input className="input-field" placeholder="Naam (NL) *" value={form.name_nl} onChange={e => setForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Name (EN)" value={form.name_en} onChange={e => setForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Omschrijving (NL)" value={form.description_nl} onChange={e => setForm(f => ({...f, description_nl: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Description (EN)" value={form.description_en} onChange={e => setForm(f => ({...f, description_en: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="€ Prijs *" type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Duur (min)" type="number" value={form.duration} onChange={e => setForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
      </div>
      {(!form.name_nl || !form.price) && <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 4 }}>* {lang === "nl" ? "Vul naam en prijs in" : "Fill in name and price"}</div>}
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
    if (!form.name_nl || !form.price) return;
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) { toast.show(lang === "nl" ? "Ongeldige prijs" : "Invalid price", "error"); return; }
    const { data, error } = await supabase.from("service_extras").insert({
      service_id: serviceId, name_nl: form.name_nl, name_en: form.name_en || null,
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
        <input className="input-field" placeholder="Naam (NL) *" value={form.name_nl} onChange={e => setForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Name (EN)" value={form.name_en} onChange={e => setForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="€ Prijs *" type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
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
function PlanSelection({ user, lang, setLang, onLogout }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const accent = ACCENT;
  const toast = useToast();

  const plans = [
    {
      id: "starter",
      name: t.planStarter,
      price: t.planStarterPrice,
      desc: t.planStarterDesc,
      features: [t.planFeatureBookings, t.planFeatureEmail, t.planFeatureReminders, t.planFeatureReviews, t.planFeatureStaff + " (max 3)"],
      popular: false
    },
    {
      id: "professional",
      name: t.planProfessional,
      price: t.planProfessionalPrice,
      desc: t.planProfessionalDesc,
      features: [t.planFeatureBookings, t.planFeatureEmail, t.planFeatureReminders, t.planFeatureReviews, t.planFeatureUnlimited, t.planFeatureAnalytics, t.planFeatureCustomBranding, t.planFeatureDiscounts, t.planFeatureCategories, t.planFeaturePriority],
      popular: true
    }
  ];

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
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ marginBottom: 16 }}><NavIcon name="crown" size={36} color={ACCENT} /></div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{t.choosePlan}</div>
            <div style={{ fontSize: 13, color: c.textLabel }}>{t.choosePlanSub}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 32 }}>
            {plans.map(plan => (
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
                  <div style={{ fontSize: 12, color: c.textLabel, marginBottom: 12 }}>{plan.desc}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: accent }}>
                    €{plan.price}<span style={{ fontSize: 16, color: c.textLabel }}>{t.perMonth}</span>
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 12, color: c.textSub }}>
                      <NavIcon name="check" size={14} color={accent} />
                      {f}
                    </div>
                  ))}
                </div>
                <button className={plan.popular ? "btn-primary" : "btn-ghost"} style={{ width: "100%", ...(plan.popular ? {} : { borderColor: `${accent}44`, color: accent }) }}
                  onClick={() => {
                    // TODO: Replace with Mollie checkout when ready
                    toast.show(lang === "nl"
                      ? `Neem contact op via info@vellu.cc om ${plan.name} te activeren.`
                      : `Contact info@vellu.cc to activate ${plan.name}.`
                    );
                  }}
                >{t.selectPlan}</button>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", color: c.textMuted, fontSize: 11 }}>
            {t.paymentComingSoon}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── ONBOARDING WIZARD ──────────────────────────────────────
function OnboardingWizard({ salonData, update, lang, onFinish, accent = ACCENT }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const DAY_FULL = lang === "nl" ? DAY_FULL_NL : DAY_FULL_EN;
  const [step, setStep] = useState(0);
  const [salonName, setSalonName] = useState(salonData.name || "");
  const [city, setCity] = useState(salonData.city || "");
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
    if (!salonName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ business_name: salonName.trim(), city: city.trim() || null }).eq("id", salonData.owner_id);
    if (error) { setSaving(false); return; }
    update(d => { d.name = salonName.trim(); d.city = city.trim(); return d; });
    setSaving(false);
    setStep(1);
  };

  const saveStep2 = async () => {
    if (!svcName.trim() || !svcPrice) return;
    setSaving(true);
    const { data: newSvc, error } = await supabase.from("services").insert({
      owner_id: salonData.owner_id,
      name_nl: svcName.trim(),
      name_en: svcName.trim(),
      price: parseFloat(svcPrice),
      duration: parseInt(svcDuration) || 60,
      position: 0
    }).select().single();
    if (error || !newSvc) { setSaving(false); return; }
    update(d => { d.services = [...d.services, { ...newSvc, photos: [], variants: [], extras: [] }]; return d; });
    setSaving(false);
    setStep(2);
  };

  const saveStep3 = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ business_hours: salonData.business_hours || DEFAULT_HOURS }).eq("id", salonData.owner_id);
    if (error) { setSaving(false); return; }
    setSaving(false);
    setStep(3);
  };

  return (
    <Layout>

      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
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

              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.onboardingStep1}</div>
              <input className="input-field" placeholder={t.businessName} value={salonName} onChange={e => setSalonName(e.target.value)} style={{ marginBottom: 10 }} />
              <input className="input-field" placeholder={t.city} value={city} onChange={e => setCity(e.target.value)} style={{ marginBottom: 24 }} />

              <button className="btn-primary" style={{ width: "100%" }} onClick={saveStep1} disabled={saving || !salonName.trim()}>
                {saving ? "..." : t.onboardingNext}
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
      booking_policy: "", salon_phone: "", salon_instagram: "", salon_email: "", phone_required: false, logo_url: "", cover_image_url: "", discount_codes: [],
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
  const [newSvc, setNewSvc] = useState({ name_nl: "", name_en: "", price: "", duration: "60" });
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
  const [editingLocation, setEditingLocation] = useState(null);
  const [editLocForm, setEditLocForm] = useState({ name: "", address: "", city: "", phone: "" });
  const [editSvcForm, setEditSvcForm] = useState({ name_nl: "", name_en: "", price: "", duration: "" });
  const [editingStaff, setEditingStaff] = useState(null);
  const [editStaffForm, setEditStaffForm] = useState({ name: "", role: "", bio: "", working_hours: {}, service_ids: [] });
  // Manual appointment
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("all"); // "all" | "sent" | "unsent"
  const [invoicesExpanded, setInvoicesExpanded] = useState(false);
  const [analyticsReviewsExpanded, setAnalyticsReviewsExpanded] = useState(false);
  const [addApptForm, setAddApptForm] = useState({ service_id: "", variant_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "", staff_id: "" });
  const [addApptLoading, setAddApptLoading] = useState(false);
  const [addApptDone, setAddApptDone] = useState(false);
  const [clientList, setClientList] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [clientMode, setClientMode] = useState("existing"); // "existing" or "new"
  // Exception/blocked days
  const [newException, setNewException] = useState({ date: "", open: "09:00", close: "17:30" });
  const [newBlocked, setNewBlocked] = useState({ from: "", to: "", reason: "", mode: "day", time_start: "09:00", time_end: "17:30" });
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [showBlockedForm, setShowBlockedForm] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);
  const [editVariantForm, setEditVariantForm] = useState({ name_nl: "", name_en: "", price: "", duration: "", description_nl: "" });
  const [editingExtra, setEditingExtra] = useState(null);
  const [editExtraForm, setEditExtraForm] = useState({ name_nl: "", name_en: "", price: "" });
  const [settingsTab, setSettingsTab] = useState("salon");
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
          { count: referralCount }
        ] = await Promise.all([
          supabase.from("appointments").select("*").eq("owner_id", data.id).gte("date", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]).order("date", { ascending: false }),
          supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false }),
          supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).order("position"),
          supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position"),
          supabase.from("locations").select("*").eq("owner_id", data.id).order("position"),
          supabase.from("client_no_shows").select("client_email, no_show_count, blocked").eq("owner_id", data.id),
          // How many other salons signed up using this owner's referral code.
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("referred_by", data.id)
        ]);
        // Shape client_no_shows as a lookup by email so renderApptCard is O(1).
        const clientNoShowsMap = {};
        for (const r of noShowRows || []) {
          clientNoShowsMap[r.client_email] = { no_show_count: r.no_show_count, blocked: r.blocked };
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
          iban: data.iban || "",
          invoice_prefix: data.invoice_prefix || "INV",
          next_invoice_number: data.next_invoice_number || 1,
          business_hours: data.business_hours || DEFAULT_HOURS,
          booking_policy: data.booking_policy || "",
          salon_phone: data.salon_phone || "",
          salon_instagram: data.salon_instagram || "",
          salon_email: data.salon_email || "",
          whatsapp_number: data.whatsapp_number || "",
          phone_required: data.phone_required || false,
          break_minutes: data.break_minutes || 0,
          logo_url: data.logo_url || "",
          cover_image_url: data.cover_image_url || "",
          cover_focal_y: data.cover_focal_y ?? 50,
          discount_codes: data.discount_codes || [],
          day_overrides: data.day_overrides || {},
          account_type: data.account_type || "joint",
          min_advance_hours: data.min_advance_hours || 0,
          max_advance_days: data.max_advance_days || 60,
          reminder_hours: data.reminder_hours ?? 24,
          rebook_nudge_days: data.rebook_nudge_days ?? 28,
          google_calendar_connected: data.google_calendar_connected || false,
          google_place_id: data.google_place_id || "",
          auto_block_no_show_threshold: data.auto_block_no_show_threshold ?? 0,
          client_no_shows: clientNoShowsMap,
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
  const filteredAgendaAppts = agendaStaff ? allVisibleAppts.filter(a => a.staff_id === agendaStaff) : allVisibleAppts;
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
              phone: a.client_phone || ""
            };
          }
        });
        // Pull full client records for these emails. NOTE: clients.email is currently a
        // globally-unique column — the data model shares a single client row across
        // salons. A proper fix requires a (owner_id, email) unique constraint + a
        // migration to split shared rows. Until then, RLS is the only barrier here.
        const emails = Object.keys(uniqueClients);
        if (emails.length > 0) {
          const { data: fullClients } = await supabase.from("clients").select("id, first_name, last_name, email, phone").in("email", emails);
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
  // Reschedule modal state — holds the appointment being moved, or null.
  const [rescheduling, setRescheduling] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);

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
  const sendInvoice = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      const a = salonData.appointments.find(x => x.id === id);
      if (a) {
        const invoiceNumber = `${salonData.invoice_prefix || "INV"}-${String(salonData.next_invoice_number || 1).padStart(4, "0")}`;
        await sendEmails("invoice", {
          client_name: a.client_name,
          client_email: a.client_email,
          service_name: a.service_name,
          date: a.date,
          price: a.service_price,
          salon_name: salonData.name,
          invoice_number: invoiceNumber,
          salon_address: salonData.address || "",
          salon_kvk: salonData.kvk_number || "",
          salon_btw: salonData.btw_id || "",
          salon_iban: salonData.iban || ""
        });
        await supabase.from("appointments").update({ invoice_sent: true }).eq("id", id);
        // Auto-increment invoice number
        const nextNum = (salonData.next_invoice_number || 1) + 1;
        await supabase.from("profiles").update({ next_invoice_number: nextNum }).eq("id", salonData.owner_id);
        update(d => { d.next_invoice_number = nextNum; return d; });
      }
      update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, invoice_sent:true} : a); return d; });
      toast.show(t.invoiceSent);
    } finally { setProcessingApptId(null); }
  };

  const addService = async () => {
    if (!newSvc.name_nl || !newSvc.price) { setSvcError(t.fillRequired); return; }
    const price = parseFloat(newSvc.price);
    if (!Number.isFinite(price) || price < 0) { setSvcError(lang === "nl" ? "Ongeldige prijs" : "Invalid price"); return; }
    setSvcError("");
    // Append to end: position = max existing + 1 (so new rows land below drag-drop ordered ones).
    const nextPosition = (salonData.services || []).reduce((m, s) => Math.max(m, s.position ?? -1), -1) + 1;
    const { data, error } = await supabase.from("services").insert({
      owner_id: salonData.owner_id,
      name: newSvc.name_nl,
      name_nl: newSvc.name_nl,
      name_en: newSvc.name_en || null,
      price,
      duration: parseInt(newSvc.duration) || 60,
      position: nextPosition
    }).select().single();
    if (error || !data) {
      // Previously the error was silently swallowed and the form was cleared so owners
      // thought the service was added. Show a real error and keep the form so they can retry.
      toast.show(lang === "nl" ? "Dienst toevoegen mislukt" : "Failed to add service", "error");
      return;
    }
    update(d => { d.services = [...d.services, { ...data, name_nl: data.name_nl || data.name, name_en: data.name_en || data.name, photos: [], variants: [], extras: [] }]; return d; });
    setNewSvc({ name_nl: "", name_en: "", price: "", duration: "60" });
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
    return (
    <div key={a.id} className="appt-card" title={a.service_name}>
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
          <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.time} · {a.service_name}</div>
          <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{a.client_email}{a.staff_name ? ` · ${a.staff_name}` : ""}</div>
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
      {a.status === "confirmed" && (
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-ghost" style={{ flex: 1, fontSize:10, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markComplete(a.id)}>{processingApptId === a.id ? "..." : t.markComplete}</button>
          <button className="btn-ghost" style={{ fontSize:10, padding: "0 14px", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => setRescheduling(a)}>{lang === "nl" ? "Verplaats" : "Reschedule"}</button>
          <button className="btn-ghost" style={{ fontSize:10, padding: "0 14px", color: c.danger, borderColor: `${c.danger}33`, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markNoShow(a.id)}>{processingApptId === a.id ? "..." : t.markNoShow}</button>
        </div>
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
                date: new Date(a.date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" }),
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
    return <OnboardingWizard salonData={salonData} update={update} lang={lang} accent={accent} onFinish={() => setShowOnboarding(false)} />;
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
                    {view === "dashboard" ? t.welcomeBack : view === "agenda" ? t.manageAppts : view === "analytics" ? (t.salonInsight) : view === "facturen" ? t.completedTreatments : view === "instellingen" ? t.manageSalon : t.welcomeBack}
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
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                  weekDaily.push(revByDay[fmt(d)] || 0);
                }
                const monthDaily = [];
                for (let i = 29; i >= 0; i--) {
                  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                  monthDaily.push(revByDay[fmt(d)] || 0);
                }
                const sparkline = (data, color) => {
                  if (!data || data.length < 2) return null;
                  const W = 200, H = 80, pad = 4;
                  const max = Math.max(...data, 1);
                  const min = Math.min(...data);
                  const range = max - min || 1;
                  const pts = data.map((v, i) => {
                    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
                    const y = pad + (H - pad * 2) - ((v - min) / range) * (H - pad * 2);
                    return { x, y };
                  });
                  // Smooth bezier curve
                  const linePath = pts.reduce((acc, p, i) => {
                    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                    const prev = pts[i - 1];
                    const cx1 = prev.x + (p.x - prev.x) / 2;
                    const cy1 = prev.y;
                    const cx2 = prev.x + (p.x - prev.x) / 2;
                    const cy2 = p.y;
                    return `${acc} C${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  }, "");
                  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${H - pad} L${pts[0].x.toFixed(1)},${H - pad} Z`;
                  const lastPt = pts[pts.length - 1];
                  const gradId = "spark-" + color.replace(/[^a-z0-9]/gi, "") + "-" + data.length;
                  return (
                    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                          <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} fill={`url(#${gradId})`} />
                      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={color} vectorEffect="non-scaling-stroke" />
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
                        <div style={{ flex: 1, minHeight: 40, marginTop: 12 }}>
                          {sparkline(weekDaily, accent)}
                        </div>
                      </div>

                      {/* MONTH REVENUE */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.monthlyRevenue}</div>
                          <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "30 dagen" : "30 days"}</div>
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1, marginTop: 6 }}>€{monthRevenue.toFixed(0)}</div>
                        <div style={{ flex: 1, minHeight: 40, marginTop: 12 }}>
                          {sparkline(monthDaily, accent)}
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
                  onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ service_id: "", variant_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "", staff_id: "" }); setClientSearch(""); setClientMode("existing"); setShowClientDropdown(false); }}>
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
            if (calViewMode === "week") {
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
                <div style={{ display: "flex", gap: 4, padding: 3, background: c.inputBg, borderRadius: 100, border: `1px solid ${c.inputBorder}` }}>
                  {["week", "month", "year"].map(mode => (
                    <div key={mode} onClick={() => { setCalViewMode(mode); setCalWeekOffset(0); }} style={{
                      padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
                      background: calViewMode === mode ? accent : "transparent",
                      color: calViewMode === mode ? c.btnOnDark : c.textSub,
                    }}>{mode === "week" ? t.weekView : mode === "month" ? t.monthView : t.yearView}</div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {calWeekOffset !== 0 && (
                    <div onClick={() => { setCalWeekOffset(0); setCalDate(fmt(getToday())); }} style={{
                      padding: "7px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      background: `${accent}14`, color: accent, border: `1px solid ${accent}33`
                    }}>{t.backToToday}</div>
                  )}
                  <div onClick={() => setCalWeekOffset(o => o - 1)} role="button" tabIndex={0} aria-label={lang === "nl" ? "Vorige" : "Previous"} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCalWeekOffset(o => o - 1); } }} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${c.inputBorder}`, color: c.textSub, background: c.bgCard, transition: "all 0.2s" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text, padding: "0 8px", minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>{periodLabel}</div>
                  <div onClick={() => setCalWeekOffset(o => o + 1)} role="button" tabIndex={0} aria-label={lang === "nl" ? "Volgende" : "Next"} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCalWeekOffset(o => o + 1); } }} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${c.inputBorder}`, color: c.textSub, background: c.bgCard, transition: "all 0.2s" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
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
                      return (
                        <div key={i} role="button" tabIndex={0} onClick={() => setCalDate(ds)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCalDate(ds); } }}
                          style={{ borderRight: i < 6 ? `1px solid ${c.border}` : "none", cursor: "pointer", display: "flex", flexDirection: "column", background: isSel ? `${accent}22` : isToday ? `${accent}08` : "transparent" }}>
                          {/* Day header */}
                          <div style={{ textAlign: "center", padding: isMobile ? "8px 2px 6px" : "10px 4px", background: c.inputBg, borderBottom: `1px solid ${c.border}` }}>
                            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: isToday ? accent : c.textLabel, marginBottom: 4 }}>{DAY_HEADERS[i]}</div>
                            <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? c.btnOnDark : c.text, width: isToday ? 24 : "auto", height: isToday ? 24 : "auto", borderRadius: isToday ? "50%" : 0, background: isToday ? accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: isToday ? 24 : "auto" }}>{d.getDate()}</div>
                          </div>
                          {/* Day content */}
                          <div style={{ flex: 1, minHeight: isMobile ? 80 : 160, padding: isMobile ? "6px 3px 8px" : "8px 8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                            {dayAppts.length === 0 ? (
                              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: 11, color: c.textMuted }}>—</div>
                            ) : (
                              <>
                                {visibleAppts.map((a, ai) => {
                                  const isCancelled = a.status === "cancelled" || a.status === "no_show";
                                  const statusColor = isCancelled ? c.danger : a.status === "completed" ? c.success : accent;
                                  return (
                                    <div key={ai} style={{ padding: isMobile ? "2px 3px" : "4px 6px", borderRadius: 4, background: `${statusColor}14`, borderLeft: `2.5px solid ${statusColor}`, overflow: "hidden", opacity: isCancelled ? 0.5 : 1 }}>
                                      <div style={{ fontSize: isMobile ? 8 : 10, fontWeight: 600, color: statusColor, fontVariantNumeric: "tabular-nums", textDecoration: isCancelled ? "line-through" : "none" }}>{a.time}</div>
                                      <div style={{ fontSize: isMobile ? 8 : 10, color: c.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: isCancelled ? "line-through" : "none" }}>{a.client_name?.split(" ")[0] || ""}</div>
                                      {!isMobile && <div style={{ fontSize: 9, color: c.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.service_name?.split(" — ")[0] || a.service_name}</div>}
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
                            background: isSel ? `${accent}22` : isToday ? `${accent}10` : "transparent",
                            borderRight: col < 6 ? `1px solid ${c.border}` : "none",
                            borderBottom: row < rows - 1 ? `1px solid ${c.border}` : "none",
                            transition: "background 0.15s",
                            opacity: cell.muted ? 0.35 : 1,
                            display: "flex", flexDirection: "column", gap: 3, alignItems: isMobile ? "center" : "stretch"
                          }}>
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
                                      {a.time} {a.client_name?.split(" ")[0] || ""}
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

              {/* Appointments list (week/month views) */}
              {calViewMode !== "year" && (<>
                {calAppts.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 20px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16 }}>
                    <div style={{ opacity: 0.4 }}><NavIcon name="calendar" size={36} color={c.textMuted} /></div>
                    <div style={{ fontSize: 13, color: c.textSub, textAlign: "center" }}>
                      {calDate === fmt(getToday()) ? t.noTodayAppts : (lang === "nl" ? "Geen afspraken op deze dag" : "No appointments on this day")}
                    </div>
                    <button className="btn-ghost" style={{ padding: "10px 20px", display: "inline-flex", alignItems: "center", gap: 8 }}
                      onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ service_id: "", variant_id: "", date: calDate, time: "", client_name: "", client_email: "", client_phone: "", staff_id: "" }); setClientSearch(""); setClientMode("existing"); setShowClientDropdown(false); }}>
                      <NavIcon name="plus" size={13} color="currentColor" /> {t.addAppointment}
                    </button>
                  </div>
                ) : (
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
            const unsent = completedAppts.filter(a => !a.invoice_sent);
            const sent = completedAppts.filter(a => a.invoice_sent);
            const unsentTotal = unsent.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const thisMonthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
            const thisMonthAppts = completedAppts.filter(a => a.date?.startsWith(thisMonthPrefix));
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
                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14, gridAutoRows: "1fr" }}>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.totalEarnings}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: accent, lineHeight: 1 }}>€{totalEarnings.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{completedAppts.length} {t.treatments}</div>
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
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{completedAppts.length > 0 ? Math.round((sent.length / completedAppts.length) * 100) : 0}%</div>
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
                  <div style={{ display: "flex", gap: 4, padding: 3, background: c.inputBg, borderRadius: 100, border: `1px solid ${c.inputBorder}` }}>
                    {[
                      ["all", lang === "nl" ? "Alles" : "All", completedAppts.length],
                      ["unsent", lang === "nl" ? "Open" : "Unsent", unsent.length],
                      ["sent", lang === "nl" ? "Verstuurd" : "Sent", sent.length]
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
                const filtered = completedAppts.filter(a => {
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
                        <div style={{ flexShrink: 0, minWidth: 90, display: "flex", justifyContent: "flex-end" }}>
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
                const weekDaily = [];
                for (let i = 6; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); weekDaily.push(revByDay[fmt(d)] || 0); }
                const monthDaily = [];
                for (let i = 29; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); monthDaily.push(revByDay[fmt(d)] || 0); }

                const sparkline = (data, color) => {
                  if (!data || data.length < 2) return null;
                  const W = 200, H = 80, pad = 4;
                  const max = Math.max(...data, 1);
                  const min = Math.min(...data);
                  const range = max - min || 1;
                  const pts = data.map((v, i) => {
                    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
                    const y = pad + (H - pad * 2) - ((v - min) / range) * (H - pad * 2);
                    return { x, y };
                  });
                  const linePath = pts.reduce((acc, p, i) => {
                    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                    const prev = pts[i - 1];
                    const cx1 = prev.x + (p.x - prev.x) / 2;
                    const cy1 = prev.y;
                    const cx2 = prev.x + (p.x - prev.x) / 2;
                    const cy2 = p.y;
                    return `${acc} C${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  }, "");
                  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${H - pad} L${pts[0].x.toFixed(1)},${H - pad} Z`;
                  const lastPt = pts[pts.length - 1];
                  const gradId = "anspark-" + color.replace(/[^a-z0-9]/gi, "") + "-" + data.length;
                  return (
                    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                          <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} fill={`url(#${gradId})`} />
                      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={color} vectorEffect="non-scaling-stroke" />
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
                        <div style={{ flex: 1, minHeight: 40, marginTop: 12 }}>{sparkline(weekDaily, accent)}</div>
                      </div>
                      {/* Month */}
                      <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: isMobile ? "12px 12px" : "16px 18px", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.monthlyRevenue}</div>
                          <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "30d" : "30d"}</div>
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1, marginTop: 6 }}>€{monthRevenue.toFixed(0)}</div>
                        <div style={{ flex: 1, minHeight: 40, marginTop: 12 }}>{sparkline(monthDaily, accent)}</div>
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

              {/* Billing / Subscription */}
              <div style={{ background: `${accent}06`, border: `1px solid ${accent}22`, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.billing}</SL>
                {salonData.plan ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, letterSpacing: "0.08em", textTransform: "uppercase", background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}>
                        {salonData.plan === "starter" ? t.planStarter : t.planProfessional}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: `${c.success}1a`, color: c.success, border: `1px solid ${c.success}33` }}>
                        {t.activePlan}
                      </span>
                    </div>
                    {salonData.plan_expires_at && (
                      <div style={{ fontSize: 11, color: c.textLabel }}>
                        {t.planExpires}: {new Date(salonData.plan_expires_at).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { day: "numeric", month: "long", year: "numeric" })}
                      </div>
                    )}
                    {salonData.plan === "starter" && (
                      <button className="btn-ghost" style={{ marginTop: 12, fontSize: 10, color: accent, borderColor: `${accent}44` }}
                        onClick={() => toast.show(lang === "nl" ? "Neem contact op via info@vellu.cc om te upgraden." : "Contact info@vellu.cc to upgrade.")}>
                        {t.upgradePlan} → {t.planProfessional}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: c.textLabel }}>{t.noPlan}</div>
                )}
              </div>

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
              </>}

              {/* ═══ DIENSTEN TAB ═══ */}
              {settingsTab === "diensten" && <>

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

                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleServiceDragEnd}
                >
                  <SortableContext items={salonData.services.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {salonData.services.map(s => {
                  const isExpanded = expandedServiceId === s.id;
                  const isEditing = editingService === s.id;
                  const variantCount = (s.variants || []).length;
                  const extrasCount = (s.extras || []).length;
                  const photoCount = (s.photos || []).length;
                  const heroPhoto = s.photos?.[0]?.url || s.photos?.[0];
                  const minVariantPrice = variantCount > 0 ? Math.min(...s.variants.map(v => parseFloat(v.price))) : null;
                  const displayPrice = minVariantPrice !== null ? `€${minVariantPrice}+` : `€${s.price}`;

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
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            <div>
                              <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Naam (NL)" : "Name (NL)"}</div>
                              <input className="input-field" value={editSvcForm.name_nl} onChange={e => setEditSvcForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Naam (EN)" : "Name (EN)"}</div>
                              <input className="input-field" value={editSvcForm.name_en} onChange={e => setEditSvcForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Prijs (€)" : "Price (€)"}</div>
                              <input className="input-field" type="number" value={editSvcForm.price} onChange={e => setEditSvcForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Duur (minuten)" : "Duration (minutes)"}</div>
                              <input className="input-field" type="number" value={editSvcForm.duration} onChange={e => setEditSvcForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <button className="btn-primary" style={{ padding: "11px 18px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", flex: 1 }} onClick={async () => {
                              const { error } = await supabase.from("services").update({ name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, name: editSvcForm.name_nl, price: parseFloat(editSvcForm.price), duration: parseInt(editSvcForm.duration) }).eq("id", s.id);
                              if (error) { toast.show(t.somethingWrong, "error"); return; }
                              update(d => { d.services = d.services.map(sv => sv.id === s.id ? {...sv, name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, price: parseFloat(editSvcForm.price), duration: parseInt(editSvcForm.duration)} : sv); return d; });
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
                              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <span>{s.duration} {t.min}</span>
                                {variantCount > 0 && <><span>·</span><span>{variantCount} {variantCount === 1 ? (lang === "nl" ? "variant" : "variant") : (lang === "nl" ? "varianten" : "variants")}</span></>}
                                {extrasCount > 0 && <><span>·</span><span>{extrasCount} extra{extrasCount === 1 ? "" : "s"}</span></>}
                                {photoCount > 0 && <><span>·</span><span>{photoCount} {photoCount === 1 ? (lang === "nl" ? "foto" : "photo") : (lang === "nl" ? "foto's" : "photos")}</span></>}
                              </div>
                            </div>
                            {/* Price */}
                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, color: accent, flexShrink: 0, lineHeight: 1 }}>{displayPrice}</div>
                            {/* Actions */}
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditingService(s.id); setEditSvcForm({ name_nl: s.name_nl, name_en: s.name_en || "", price: s.price, duration: s.duration }); setExpandedServiceId(null); }}
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
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                              <input className="input-field" value={editVariantForm.name_nl} onChange={e => setEditVariantForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px" }} placeholder={lang === "nl" ? "Naam (NL)" : "Name (NL)"} />
                                              <input className="input-field" value={editVariantForm.name_en} onChange={e => setEditVariantForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px" }} placeholder={lang === "nl" ? "Naam (EN)" : "Name (EN)"} />
                                              <input className="input-field" type="number" value={editVariantForm.price} onChange={e => setEditVariantForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px" }} placeholder="€" />
                                              <input className="input-field" type="number" value={editVariantForm.duration} onChange={e => setEditVariantForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px" }} placeholder={lang === "nl" ? "Duur (min)" : "Duration (min)"} />
                                            </div>
                                            <input className="input-field" value={editVariantForm.description_nl} onChange={e => setEditVariantForm(f => ({...f, description_nl: e.target.value}))} style={{ fontSize: 12, padding: "9px 11px", width: "100%", marginBottom: 8 }} placeholder={lang === "nl" ? "Omschrijving" : "Description"} />
                                            <div style={{ display: "flex", gap: 6 }}>
                                              <button className="btn-ghost" style={{ flex: 1, padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", color: accent, borderColor: `${accent}55` }} onClick={async () => {
                                                await supabase.from("service_variants").update({ name_nl: editVariantForm.name_nl, name_en: editVariantForm.name_en || null, price: parseFloat(editVariantForm.price), duration: parseInt(editVariantForm.duration), description_nl: editVariantForm.description_nl || null }).eq("id", v.id);
                                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: svc.variants.map(vr => vr.id === v.id ? {...vr, ...editVariantForm, price: parseFloat(editVariantForm.price), duration: parseInt(editVariantForm.duration)} : vr)} : svc); return d; });
                                                setEditingVariant(null);
                                              }}><NavIcon name="check" size={12} color="currentColor" /> {t.saveChanges}</button>
                                              <button className="btn-ghost" style={{ padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }} onClick={() => setEditingVariant(null)}><NavIcon name="xmark" size={12} color="currentColor" /></button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{v.name_nl}</div>
                                              {v.description_nl && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{v.description_nl}</div>}
                                              <div style={{ fontSize: 10, color: c.textLabel, marginTop: 2 }}>{v.duration} {t.min}</div>
                                            </div>
                                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent, flexShrink: 0 }}>€{v.price}</div>
                                            <div style={{ display: "flex", gap: 4 }}>
                                              <button onClick={() => { setEditingVariant(v.id); setEditVariantForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "" }); }}
                                                style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <NavIcon name="edit" size={11} color="currentColor" />
                                              </button>
                                              <button onClick={async () => {
                                                const { error } = await supabase.from("service_variants").delete().eq("id", v.id);
                                                if (error) { toast.show(t.somethingWrong, "error"); return; }
                                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: (svc.variants||[]).filter(x => x.id !== v.id)} : svc); return d; });
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
                                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
                                              <input className="input-field" value={editExtraForm.name_nl} onChange={ev => setEditExtraForm(f => ({...f, name_nl: ev.target.value}))} style={{ fontSize: 12, padding: "9px 11px" }} placeholder={lang === "nl" ? "Naam" : "Name"} />
                                              <input className="input-field" type="number" value={editExtraForm.price} onChange={ev => setEditExtraForm(f => ({...f, price: ev.target.value}))} style={{ fontSize: 12, padding: "9px 11px" }} placeholder="€" />
                                            </div>
                                            <div style={{ display: "flex", gap: 6 }}>
                                              <button className="btn-ghost" style={{ flex: 1, padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", color: accent, borderColor: `${accent}55` }} onClick={async () => {
                                                const { error } = await supabase.from("service_extras").update({ name_nl: editExtraForm.name_nl, name_en: editExtraForm.name_en || null, price: parseFloat(editExtraForm.price) }).eq("id", e.id);
                                                if (error) { toast.show(t.somethingWrong, "error"); return; }
                                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: svc.extras.map(ex => ex.id === e.id ? {...ex, name_nl: editExtraForm.name_nl, name_en: editExtraForm.name_en || null, price: parseFloat(editExtraForm.price)} : ex)} : svc); return d; });
                                                setEditingExtra(null);
                                              }}><NavIcon name="check" size={12} color="currentColor" /> {t.saveChanges}</button>
                                              <button className="btn-ghost" style={{ padding: "9px 14px" }} onClick={() => setEditingExtra(null)}><NavIcon name="xmark" size={12} color="currentColor" /></button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                                            <span style={{ fontSize: 16, color: accent, lineHeight: 1 }}>+</span>
                                            <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: c.text }}>{e.name_nl}</div>
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
                })}
                  </SortableContext>
                </DndContext>

                {/* Add new service — collapsible CTA */}
                {showNewServiceForm ? (
                  <div style={{ background: c.bgCard, border: `1px solid ${accent}44`, borderRadius: 16, padding: 18, marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{lang === "nl" ? "Nieuwe dienst" : "New service"}</div>
                      <button onClick={() => { setShowNewServiceForm(false); setNewSvc({ name_nl: "", name_en: "", price: "", duration: "60" }); }} style={{ background: "transparent", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Naam (NL)" : "Name (NL)"}</div>
                        <input className="input-field" placeholder="Gel Manicure" value={newSvc.name_nl} onChange={e => setNewSvc(s => ({...s, name_nl: e.target.value}))} style={{ fontSize: 13, padding: "11px 13px", width: "100%" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Naam (EN)" : "Name (EN)"}</div>
                        <input className="input-field" placeholder="Gel Manicure" value={newSvc.name_en} onChange={e => setNewSvc(s => ({...s, name_en: e.target.value}))} style={{ fontSize: 13, padding: "11px 13px", width: "100%" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Prijs (€)" : "Price (€)"}</div>
                        <input className="input-field" placeholder="45" type="number" value={newSvc.price} onChange={e => setNewSvc(s => ({...s, price: e.target.value}))} style={{ fontSize: 13, padding: "11px 13px", width: "100%" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Duur (minuten)" : "Duration (minutes)"}</div>
                        <input className="input-field" placeholder="60" type="number" value={newSvc.duration} onChange={e => setNewSvc(s => ({...s, duration: e.target.value}))} style={{ fontSize: 13, padding: "11px 13px", width: "100%" }} />
                      </div>
                    </div>
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
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {[["joint", "user", t.jointAccount], ["team", "team", t.teamAccount]].map(([type, icon, label]) => (
                    <div key={type} onClick={() => update(d => { d.account_type = type; return d; })} style={{
                      flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center", transition: "all 0.2s",
                      background: salonData.account_type === type ? `${accent}12` : "transparent",
                      border: `1px solid ${salonData.account_type === type ? accent : c.inputBorder}`
                    }}>
                      <NavIcon name={icon} size={14} color={salonData.account_type === type ? accent : c.textSub} />
                      <div style={{ fontSize: 10, fontWeight: 600, color: salonData.account_type === type ? accent : c.textSub, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
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
                              {m.email && (
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
                            <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: c.danger, borderColor: `${c.danger}26` }} onClick={async () => {
                              if (!await showConfirm(lang === "nl" ? `${m.name} verwijderen?` : `Delete ${m.name}?`)) return;
                              await supabase.from("staff_services").delete().eq("staff_id", m.id);
                              await supabase.from("appointments").update({ staff_id: null }).eq("staff_id", m.id);
                              const { error } = await supabase.from("staff_members").delete().eq("id", m.id);
                              if (error) { toast.show(t.somethingWrong, "error"); return; }
                              update(d => { d.staff = (d.staff || []).filter(s => s.id !== m.id); return d; });
                              toast.show(lang === "nl" ? `${m.name} verwijderd` : `${m.name} deleted`);
                            }}>×</button>
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
                                  <select value={openTime} onChange={e => { setEditStaffForm(f => { const wh = {...(f.working_hours || {})}; wh[day] = { ...wh[day], closed: false, open: e.target.value }; return {...f, working_hours: wh}; }); }} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 6, padding: "3px 4px", color: c.text, fontSize: 10, fontFamily: "'Jost',sans-serif" }}>
                                    {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                                  </select>
                                  <span style={{ fontSize: 10, color: c.textMuted }}>–</span>
                                  <select value={closeTime} onChange={e => { setEditStaffForm(f => { const wh = {...(f.working_hours || {})}; wh[day] = { ...wh[day], closed: false, close: e.target.value }; return {...f, working_hours: wh}; }); }} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 6, padding: "3px 4px", color: c.text, fontSize: 10, fontFamily: "'Jost',sans-serif" }}>
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
                                  {s.name_nl || s.name}</div>);
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
                              <input className="input-field" placeholder={t.staffPassword} type="password" value={staffInvite[m.id]?.password || ""} onChange={e => setStaffInvite(prev => ({...prev, [m.id]: {...(prev[m.id] || {}), password: e.target.value}}))} style={{ fontSize: 11, padding: "8px 10px" }} />
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
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })}</div>
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
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button className="btn-ghost" style={{ flex: 1, fontSize: 10, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
                      onClick={() => {
                        if (!newException.date) return;
                        update(d => { d.day_overrides = {...(d.day_overrides || {}), [newException.date]: { type: "exception", open: newException.open, close: newException.close }}; return d; });
                        setNewException({ date: "", open: "09:00", close: "17:30" });
                        setShowExceptionForm(false);
                      }}>{t.addException}</button>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px", color: c.textSub }}
                      onClick={() => { setNewException({ date: "", open: "09:00", close: "17:30" }); setShowExceptionForm(false); }}>×</button>
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
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{date}{v.to && v.to !== date ? ` → ${v.to}` : ""}</div>
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
                            let cur = new Date(date);
                            const end = new Date(v.to);
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

              {/* ═══ FACTURATIE TAB ═══ */}
              {settingsTab === "facturatie" && <>

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

              {/* Booking Policy Section */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.bookingPolicy}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 8 }}>{t.bookingPolicyDesc}</div>
                <textarea 
                  className="input-field" 
                  placeholder={t.bookingPolicyPlaceholder}
                  value={salonData.booking_policy || ""}
                  onChange={e => update(d => { d.booking_policy = e.target.value; return d; })}
                  style={{ minHeight: 80, resize: "vertical", fontSize: 12 }}
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
                const updateData = {
                  business_name: salonData.name,
                  city: salonData.city,
                  accent_color: salonData.accent,
                  address: salonData.address || null,
                  kvk_number: salonData.kvk_number || null,
                  btw_id: salonData.btw_id || null,
                  iban: salonData.iban || null,
                  invoice_prefix: salonData.invoice_prefix || "INV",
                  // NOTE: next_invoice_number is intentionally excluded from this save.
                  // It's owned by sendInvoice() exclusively — saving settings after an
                  // invoice was sent would otherwise roll the counter back to the stale
                  // local value, producing duplicate invoice numbers.
                  business_hours: salonData.business_hours || DEFAULT_HOURS,
                  booking_policy: salonData.booking_policy || null,
                  salon_phone: salonData.salon_phone || null,
                  salon_instagram: salonData.salon_instagram || null,
                  salon_email: salonData.salon_email || null,
                  whatsapp_number: salonData.whatsapp_number || null,
                  phone_required: salonData.phone_required || false,
                  break_minutes: salonData.break_minutes || 0,
                  logo_url: salonData.logo_url || null,
                  cover_image_url: salonData.cover_image_url || null,
                  cover_focal_y: salonData.cover_focal_y ?? 50,
                  discount_codes: salonData.discount_codes || [],
                  day_overrides: salonData.day_overrides || {},
                  account_type: salonData.account_type || "joint",
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
            boxShadow: `0 -8px 16px -8px ${c.bg}`,
            display: "flex",
            padding: "12px 4px 8px",
            paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) + 4px))",
            zIndex: 100
          }}>
            {navItems.map(([k, icon, label]) => (
              <div key={k} className="nav-item" role="tab" tabIndex={0} aria-selected={view === k} onClick={() => setView(k)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(k); } }} style={{ gap: 3, flex: 1, minWidth: 0 }}>
                <NavIcon name={icon} size={18} color={view === k ? accent : c.textMuted} />
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: view === k ? accent : c.textMuted, transition: "color 0.2s", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
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
                  <div>
                    <SL>{t.selectServiceFor}</SL>
                    <select className="input-field" value={addApptForm.service_id} onChange={e => setAddApptForm(f => ({...f, service_id: e.target.value, variant_id: ""}))} style={{ fontSize: 12 }}>
                      <option value="" style={{ background: c.selectBg }}>—</option>
                      {salonData.services.map(s => <option key={s.id} value={s.id} style={{ background: c.selectBg }}>{lang === "nl" ? s.name_nl : s.name_en} — €{s.price}</option>)}
                    </select>
                  </div>
                  {/* Variant selector */}
                  {(() => {
                    const selSvc = salonData.services.find(s => s.id === addApptForm.service_id);
                    if (!selSvc?.variants?.length) return null;
                    return (
                      <div>
                        <SL>{t.selectVariant}</SL>
                        <select className="input-field" value={addApptForm.variant_id || ""} onChange={e => setAddApptForm(f => ({...f, variant_id: e.target.value}))} style={{ fontSize: 12 }}>
                          <option value="" style={{ background: c.selectBg }}>— {lang === "nl" ? "Geen variant" : "No variant"}</option>
                          {selSvc.variants.map(v => <option key={v.id} value={v.id} style={{ background: c.selectBg }}>{lang === "nl" ? v.name_nl : (v.name_en || v.name_nl)} — €{v.price} · {v.duration} min</option>)}
                        </select>
                      </div>
                    );
                  })()}
                  {(salonData.staff || []).length > 0 && (
                    <div>
                      <SL>{t.selectStaff}</SL>
                      <select className="input-field" value={addApptForm.staff_id} onChange={e => setAddApptForm(f => ({...f, staff_id: e.target.value}))} style={{ fontSize: 12 }}>
                        <option value="" style={{ background: c.selectBg }}>{t.anyStaff}</option>
                        {(salonData.staff || []).map(m => <option key={m.id} value={m.id} style={{ background: c.selectBg }}>{m.name}</option>)}
                      </select>
                    </div>
                  )}
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
                                    client_phone: cl.phone || ""
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
                  </div>
                </div>
                <button className="btn-primary" style={{ marginTop: 16 }} disabled={addApptLoading || !addApptForm.service_id || !addApptForm.date || !addApptForm.time || !addApptForm.client_name || !addApptForm.client_email}
                  onClick={async () => {
                    setAddApptLoading(true);
                    const svc = salonData.services.find(s => s.id === addApptForm.service_id);
                    const variant = svc?.variants?.find(v => v.id === addApptForm.variant_id);
                    const staffMember = (salonData.staff || []).find(m => m.id === addApptForm.staff_id);
                    const svcLabel = svc ? (lang === "nl" ? svc.name_nl : svc.name_en) + (variant ? " — " + (lang === "nl" ? variant.name_nl : (variant.name_en || variant.name_nl)) : "") + (staffMember ? ` (${staffMember.name})` : "") : "";
                    const price = variant ? variant.price : (svc?.price || 0);
                    const duration = variant ? variant.duration : (svc?.duration || 60);
                    // Save client. NOTE: clients.email is globally unique right now, so we
                    // don't scope by owner_id. See TODO on the data model in book-appointment.
                    const email = addApptForm.client_email.toLowerCase().trim();
                    const nameTrim = addApptForm.client_name.trim();
                    let clientId = null;
                    const { data: existing } = await supabase.from("clients").select("id").eq("email", email).maybeSingle();
                    if (existing) { clientId = existing.id; }
                    else {
                      const nameParts = nameTrim.split(" ");
                      const { data: nc } = await supabase.from("clients").insert({ email, first_name: nameParts[0] || nameTrim, last_name: nameParts.slice(1).join(" ") || "", phone: addApptForm.client_phone || null }).select("id").single();
                      if (nc) clientId = nc.id;
                    }
                    // Data integrity: abort if the selected service disappeared between pick and submit.
                    // Never fall back to client_name — that corrupts invoices and analytics.
                    if (!svc || !svcLabel) {
                      toast.show(lang === "nl" ? "Dienst niet gevonden — herlaad de pagina" : "Service not found — please reload", "error");
                      return;
                    }
                    // Insert appointment
                    const apptData = {
                      owner_id: salonData.owner_id, service_id: svc.id, client_id: clientId,
                      service_name: svcLabel,
                      service_price: price, service_duration: duration,
                      date: addApptForm.date, time: addApptForm.time,
                      client_name: addApptForm.client_name, client_email: email, client_phone: addApptForm.client_phone || null,
                      payment_method: "on-arrival", status: "confirmed", invoice_sent: false,
                      staff_id: staffMember?.id || null, staff_name: staffMember?.name || null
                    };
                    const { data: appt, error: apptError } = await supabase.from("appointments").insert(apptData).select("*").single();
                    if (apptError || !appt) {
                      toast.show(lang === "nl" ? "Fout bij het toevoegen van afspraak" : "Error adding appointment", "error");
                      setAddApptLoading(false);
                      return;
                    }
                    update(d => { d.appointments = [appt, ...d.appointments]; return d; });
                    // Send confirmation email
                    await sendEmails("booking_confirmation", {
                      client_name: addApptForm.client_name, client_email: email,
                      service_name: apptData.service_name, date: addApptForm.date, time: addApptForm.time,
                      payment: "on-arrival", price: price,
                      salon_name: salonData.name, owner_email: null
                    });
                    // Notify assigned staff
                    if (staffMember?.email) {
                      await sendEmails("booking_notification", {
                        owner_email: null, staff_emails: [staffMember.email],
                        client_name: addApptForm.client_name, client_phone: addApptForm.client_phone || null,
                        service_name: apptData.service_name, date: addApptForm.date, time: addApptForm.time,
                        price, salon_name: salonData.name
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
