// NOTE: the PWA install prompt (src/InstallAppPrompt.jsx) is deliberately
// NOT shown on the customer-facing salon page anymore — clients just use the
// link; the installable app is for salon owners (see OwnerApp).
import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";
import {
  useTheme, useSEO, useToast, ToastContainer, useConfirm, ConfirmModal, useFocusTrap,
  compressImage, sendEmails, sendSMS, ACCENT,
  getGoogleCalUrl, getWhatsAppUrl, getWhatsAppBookingMsg, getWhatsAppReminderMsg,
  getToday, fmt, parseDate, getDays,
  genTimes, DAY_NL, DAY_EN, DAY_FULL_NL, DAY_FULL_EN, MON_NL, MON_EN,
  DEFAULT_HOURS, T, Layout, NavIcon, PTitle, SL, ThemeToggle, LangToggle, Header
} from "./shared.jsx";

function ReviewForm({ salon, clientName, clientEmail, lang, t, accent }) {
  const { colors: c } = useTheme();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const submit = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    setReviewError("");
    try {
      const { error } = await supabase.from("reviews").insert({
        owner_id: salon.owner_id,
        client_name: clientName,
        client_email: clientEmail,
        rating,
        comment: comment || null
      });
      if (error) {
        setReviewError(t.reviewSaveFailed);
      } else {
        setSubmitted(true);
      }
    } catch (e) {
      console.error("Review submit error:", e);
      setReviewError(t.somethingWrong);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: 13, color: "#86efac" }}>{t.reviewSubmitted}</div>
      </div>
    );
  }

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, textAlign: "left" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 10 }}>{t.writeReview}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[1,2,3,4,5].map(s => (
          <span key={s} onClick={() => setRating(s)} onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)} style={{ fontSize: 26, cursor: "pointer", color: s <= (hoverRating || rating) ? accent : c.textMuted, transition: "all 0.15s", transform: s <= (hoverRating || rating) ? "scale(1.1)" : "none" }}>★</span>
        ))}
      </div>
      <textarea className="input-field" placeholder={t.reviewComment} value={comment} maxLength={1000} onChange={e => setComment(e.target.value.slice(0, 1000))}
        style={{ minHeight: 70, resize: "vertical", marginBottom: 10, fontSize: 12 }} />
      {reviewError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8, textAlign: "center" }}>{reviewError}</div>}
      <button className="btn-ghost" style={{ width: "100%", color: rating > 0 ? accent : undefined, borderColor: rating > 0 ? `${accent}44` : undefined, opacity: submitting ? 0.5 : 1 }}
        onClick={submit} disabled={rating === 0 || submitting}>{submitting ? "..." : t.submitReview}</button>
    </div>
  );
}


// Circular share button pinned to the top-right of the salon profile hero.
// Uses the native Web Share API when available (opens the OS share sheet
// on mobile — WhatsApp / SMS / Instagram DM etc.) and falls back to a
// small popover with a "copy link" action and a direct WhatsApp share for
// desktop browsers that don't expose navigator.share.
function SalonShareButton({ salon, lang, open, setOpen, accent }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/${salon.id}`
    : `https://vellu.cc/${salon.id}`;
  const shareText = lang === "nl"
    ? `Boek bij ${salon.name} via Vellu:`
    : `Book at ${salon.name} via Vellu:`;

  const openNativeOrPopover = async (e) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: salon.name, text: shareText, url });
        return;
      } catch {
        // User dismissed or share failed — fall through to the popover so
        // they still have a way to share.
      }
    }
    setOpen(o => !o);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard API blocked (rare) — select fallback via a hidden input
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* give up quietly */ }
      document.body.removeChild(el);
    }
  };

  const openWhatsApp = () => {
    const msg = encodeURIComponent(`${shareText} ${url}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  // Close the popover when the user clicks elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    // setTimeout so the click that opened it doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("click", onDoc), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", onDoc); };
  }, [open, setOpen]);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={openNativeOrPopover}
        aria-label={lang === "nl" ? "Deel deze pagina" : "Share this page"}
        title={lang === "nl" ? "Deel" : "Share"}
        style={{
          height: 44, padding: "0 22px 0 18px", borderRadius: 100,
          background: "#fff", border: `1px solid rgba(255,255,255,0.9)`,
          color: "#111", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 8,
          fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 600,
          letterSpacing: "0.06em", textTransform: "uppercase",
          boxShadow: "0 10px 28px rgba(0,0,0,0.32)",
          transition: "transform 0.18s, box-shadow 0.18s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 14px 32px rgba(0,0,0,0.38)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.32)"; }}
      >
        <NavIcon name="share" size={15} color={accent || "#c9a96e"} />
        {lang === "nl" ? "Deel deze salon" : "Share this salon"}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)", minWidth: 240,
            background: "#fff", color: "#1a1a1a",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14, padding: 6,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            fontFamily: "'Jost', sans-serif", zIndex: 6,
          }}
        >
          <button
            onClick={copyLink}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", background: "transparent", border: "none",
              borderRadius: 10, cursor: "pointer",
              fontSize: 13, color: "inherit", textAlign: "left",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <NavIcon name="copy" size={14} color="currentColor" />
            <span style={{ flex: 1 }}>{copied ? (lang === "nl" ? "✓ Gekopieerd" : "✓ Copied") : (lang === "nl" ? "Kopieer link" : "Copy link")}</span>
          </button>
          <button
            onClick={openWhatsApp}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", background: "transparent", border: "none",
              borderRadius: 10, cursor: "pointer",
              fontSize: 13, color: "inherit", textAlign: "left",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(37,211,102,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            <span style={{ flex: 1 }}>WhatsApp</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── CLIENT BOOKING ───────────────────────────────────────────
function ClientApp({ salon: initialSalon, onBack, lang, setLang, reviewMode = false, reviewEmail = "" }) {
  const { colors: c, theme } = useTheme();
  const accent = initialSalon.accent || ACCENT;
  const t = T[lang];

  // Swap the global manifest for a salon-scoped one while the customer is on
  // this profile page. Without this override, installing the PWA would open
  // /owner (the default from public/manifest.json) which is the wrong page
  // for a booking customer. Uses a Blob URL — no server changes needed.
  useEffect(() => {
    if (!initialSalon?.slug) return;
    const dynamicManifest = {
      name: `${initialSalon.name} via Vellu`,
      short_name: initialSalon.name?.slice(0, 12) || "Vellu",
      description: `Boek je afspraak bij ${initialSalon.name}`,
      start_url: `/${initialSalon.slug}`,
      scope: "/",
      display: "standalone",
      background_color: "#0d0b0a",
      theme_color: initialSalon.accent || "#0d0b0a",
      orientation: "portrait",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    const blob = new Blob([JSON.stringify(dynamicManifest)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const existing = document.querySelector('link[rel="manifest"]');
    const prevHref = existing?.href;
    let link = existing;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = url;
    return () => {
      URL.revokeObjectURL(url);
      // Restore the global manifest when leaving the profile page so /owner
      // and /staff installs still point to the right default start_url.
      if (prevHref) link.href = prevHref;
      else link.remove();
    };
  }, [initialSalon?.slug, initialSalon?.name, initialSalon?.accent]);

  const DAY = lang === "nl" ? DAY_NL : DAY_EN;
  const MON = lang === "nl" ? MON_NL : MON_EN;
  const svcName = (s) => lang === "nl" ? (s.name_nl || s.name_en || s.name || "") : (s.name_en || s.name_nl || s.name || "");
  // Display duration for a service row. Services with variants often have a
  // meaningless parent duration (0 min) because the real durations live on the
  // variants — show the variant range instead ("40–80 min"), collapsing to a
  // single value when they're all equal.
  const svcDuration = (s) => {
    const varDurations = (s.variants || []).map(v => parseInt(v.duration)).filter(d => Number.isFinite(d) && d > 0);
    if (varDurations.length > 0) {
      const lo = Math.min(...varDurations), hi = Math.max(...varDurations);
      return lo === hi ? `${lo} ${t.min}` : `${lo}–${hi} ${t.min}`;
    }
    return `${s.duration} ${t.min}`;
  };

  // Security: salon_instagram is owner-controlled text. Before interpolating it into an
  // href, strip to the charset Instagram allows for handles (alphanumeric, ., _). This
  // prevents the owner from injecting `javascript:` URLs or path traversal against their
  // own customers.
  const igHandle = (raw) => {
    if (!raw || typeof raw !== "string") return "";
    const stripped = raw.replace(/^@/, "").match(/^[a-zA-Z0-9._]{1,30}/);
    return stripped ? stripped[0] : "";
  };



  const [step, setStep] = useState(() => {
    // If salon has multiple locations, start at step 0 (location picker)
    const locs = initialSalon.locations || [];
    if (locs.length > 1) return 0;
    return 1;
  });
  const [selectedLocation, setSelectedLocation] = useState(() => {
    const locs = initialSalon.locations || [];
    return locs.length === 1 ? locs[0] : null;
  });
  const hasLocations = (initialSalon.locations || []).length > 1;
  const hasAnyLocation = (initialSalon.locations || []).length > 0;
  const goToStep = (s) => {
    if (s === 2) setSlotsRefreshKey(k => k + 1);
    setStep(s);
  };
  const goBack = () => {
    if (step <= (hasLocations ? 0 : 1)) { setMode("profile"); return; }
    const prev = step - 1;
    if (prev === 2) setSlotsRefreshKey(k => k + 1);
    setStep(prev);
  };
  // Multi-service state: array of { service, variant, extras: [], staff: null }
  const [selectedServices, setSelectedServices] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  
  // Location-aware business hours and break minutes
  const activeHours = (selectedLocation?.business_hours) || initialSalon.business_hours || DEFAULT_HOURS;
  const activeBreakMinutes = selectedLocation?.break_minutes ?? initialSalon.break_minutes ?? 0;
  
  // Day override helpers (blocked/exception days)
  const dayOverrides = initialSalon.day_overrides || {};
  const isDayBlocked = (dateStr) => {
    const override = dayOverrides[dateStr];
    if (!override || override.type !== "blocked") return false;
    // If it has specific time bounds, it's a time-slot block, NOT a full-day block
    if (override.block_time_start && override.block_time_end) return false;
    // Per-staff blocks don't close the whole day — other staff may still work.
    // The per-slot filter in staffCoversWindow handles the affected staff.
    if (override.staff_id) return false;
    return true;
  };
  const isTimeBlockedByOverride = (dateStr, timeStr) => {
    // Legacy salon-wide time block stored on profiles.day_overrides.
    const override = dayOverrides[dateStr];
    if (override && override.type === "blocked" && !override.staff_id
        && override.block_time_start && override.block_time_end
        && timeStr >= override.block_time_start && timeStr < override.block_time_end) {
      return true;
    }
    // New multi-block model: rows in staff_day_overrides with staff_id=null
    // are salon-wide time blocks. Iterate through every match on this date
    // so multiple windows (e.g. 10-11 AND 14-15) all take effect.
    for (const b of initialSalon.staff_blocks || []) {
      if (b.date !== dateStr) continue;
      if (b.staff_id) continue;
      if (!b.block_time_start || !b.block_time_end) continue;
      if (timeStr >= b.block_time_start && timeStr < b.block_time_end) return true;
    }
    return false;
  };
  // ── Exceptions (extra open days) ──
  // Two sources, merged: the legacy profiles.day_overrides JSON (at most ONE
  // entry per date — the reason Esther's and Lady's exception days used to
  // overwrite each other) and staff_day_overrides rows with kind='exception'
  // (many per date; block_time_start/end double as open/close; staff_id NULL
  // means salon-wide). Every consumer below works off this merged list.
  const getExceptionsFor = (dateStr) => {
    const out = [];
    const ov = dayOverrides[dateStr];
    if (ov?.type === "exception") out.push({ staff_id: ov.staff_id || null, open: ov.open, close: ov.close });
    for (const r of initialSalon.staff_exceptions || []) {
      if (r.date !== dateStr) continue;
      if (!r.block_time_start || !r.block_time_end) continue;
      out.push({ staff_id: r.staff_id || null, open: r.block_time_start, close: r.block_time_end });
    }
    return out;
  };
  // Exceptions that apply to one specific stylist (their own + salon-wide).
  const staffExceptionsFor = (dateStr, staffId) =>
    getExceptionsFor(dateStr).filter(e => !e.staff_id || e.staff_id === staffId);

  const getEffectiveHours = (dateStr) => {
    if (isDayBlocked(dateStr)) return { closed: true };
    const [yEH, mEH, dEH] = (dateStr || "").split("-").map(Number);
    const dayOfWeek = (yEH && mEH && dEH) ? new Date(yEH, mEH - 1, dEH).getDay() : new Date(dateStr).getDay();
    const exceptions = getExceptionsFor(dateStr);
    // For team accounts, derive the day window from the staff schedule
    // rather than the salon/location business_hours. See getWeeklyHours
    // for the full rationale — same logic, just per-date here.
    if (initialSalon.account_type === "team") {
      const staffMembers = (initialSalon.staff || []).filter(s => s.active !== false);
      const staffDayWindows = staffMembers.flatMap(s => {
        // Exception windows (own or salon-wide) REPLACE the weekly schedule
        // for this date; a stylist can have several extra windows.
        const exc = exceptions.filter(e => !e.staff_id || e.staff_id === s.id);
        if (exc.length > 0) return exc.map(e => ({ open: e.open, close: e.close }));
        const w = s.working_hours?.[dayOfWeek];
        if (!w || w.closed) return [];
        return [w];
      });
      if (staffDayWindows.length > 0) {
        // Salon/location business_hours for this day, used as a fallback
        // when a staff entry has closed:false but is missing an open or
        // close time (a legacy bug in the toggle UI could persist such rows).
        // Falling back to "00:00" / "23:59" would show absurd times like
        // "00:00 – 18:00" to clients, so we borrow the salon's window
        // instead of trusting broken data.
        const salonFallback = activeHours[dayOfWeek] || DEFAULT_HOURS[dayOfWeek] || {};
        const fbOpen = salonFallback.open || "09:00";
        const fbClose = salonFallback.close || "17:30";
        let open = "23:59", close = "00:00";
        for (const w of staffDayWindows) {
          const o = w.open || fbOpen;
          const cl = w.close || fbClose;
          if (o < open) open = o;
          if (cl > close) close = cl;
        }
        return { closed: false, open, close };
      }
      // Team account with no staff windows and no exception → closed.
      if (staffMembers.length > 0) return { closed: true };
    }
    // Non-team: any exception widens/opens the day (union with salon hours
    // when those are open, or on its own when the salon is closed).
    const salonDay = activeHours[dayOfWeek] || DEFAULT_HOURS[dayOfWeek];
    if (exceptions.length > 0) {
      let open = "23:59", close = "00:00";
      const windows = [...exceptions];
      if (salonDay && !salonDay.closed) windows.push({ open: salonDay.open, close: salonDay.close });
      for (const w of windows) {
        if ((w.open || "23:59") < open) open = w.open || "23:59";
        if ((w.close || "00:00") > close) close = w.close || "00:00";
      }
      return { closed: false, open, close };
    }
    return salonDay;
  };

  // Check if a staff member works on a given day
  const isStaffAvailable = (staffMember, dateStr) => {
    // Exception days override the weekly schedule: salon-wide exceptions
    // open EVERY stylist, staff-scoped ones only that stylist. Without this,
    // picking an exception date silently RESET the client's staff choice
    // (see the selectedServices effect), dropping the booking into
    // no-preference mode with the wrong availability.
    if (staffExceptionsFor(dateStr, staffMember?.id).length > 0) return true;
    if (!staffMember?.working_hours) return true;
    // Parse as local-date to match the rest of the app (avoid UTC-shifted getDay()).
    const [y, m, d] = (dateStr || "").split("-").map(Number);
    const dayOfWeek = (y && m && d) ? new Date(y, m - 1, d).getDay() : new Date(dateStr).getDay();
    const staffDay = staffMember.working_hours[dayOfWeek];
    if (!staffDay) {
      // Day not configured for this staff member — follow salon hours.
      const salonDay = activeHours[dayOfWeek];
      return salonDay ? !salonDay.closed : false;
    }
    return !staffDay.closed;
  };

  // Get effective time window considering all selected staff members' working hours.
  //
  // For each selected service:
  //   - If a specific staff is assigned (item.staff set), use their hours.
  //   - If no staff assigned, use the set of ELIGIBLE staff (who can perform
  //     this service) and take the union of their working hours for that day.
  //     If none of the eligible staff work that day, the whole booking can't
  //     happen on that date — return closed.
  //
  // We then intersect across services (every service must be doable in the
  // same window since appointments are sequential within one booking).
  //
  // Known limitation: within-service UNION uses earliest-open / latest-close,
  // which ignores internal gaps (e.g. one staff works 09-12, another works
  // 14-17 — we model it as 09-17). Good enough for salons where eligible sets
  // are usually size 1 (specialist-bound services); revisit if we see the
  // multi-staff-with-gap case in practice.
  const getStaffTimeWindow = (dateStr) => {
    if (selectedServices.length === 0) return null;
    // Parse dateStr as local so getDay() isn't UTC-shifted into the wrong weekday.
    const [yyyy, mm, dd] = (dateStr || "").split("-").map(Number);
    const dayOfWeek = (yyyy && mm && dd) ? new Date(yyyy, mm - 1, dd).getDay() : new Date(dateStr).getDay();

    // Extract a single staff member's window for a given day. Returns:
    //   null            -> no constraints (follow salon hours)
    //   { closed:true } -> staff explicitly closed this day
    //   { open, close } -> staff's working window
    //
    // When a staff row is closed:false but missing open or close (legacy
    // toggle-picker bug), fall back to the salon business_hours for that
    // day so we never widen availability to "00:00 – 23:59".
    const salonDayFallback = activeHours[dayOfWeek] || DEFAULT_HOURS[dayOfWeek] || {};
    const fbOpen = salonDayFallback.open || "09:00";
    const fbClose = salonDayFallback.close || "17:30";
    // Exception day widens staff on THIS date (merged legacy JSON + table
    // rows — see getExceptionsFor). A staff-scoped exception applies only to
    // that stylist; a salon-wide one to everyone — same rule as
    // staffCoversWindow in getAvailableTimes. With several exception windows
    // for one stylist we take the outer bounds; per-slot precision happens
    // in staffCoversWindow.
    const staffWindow = (staff) => {
      const exc = staffExceptionsFor(dateStr, staff?.id);
      if (exc.length > 0) {
        let open = "23:59", close = "00:00";
        for (const e of exc) {
          if ((e.open || fbOpen) < open) open = e.open || fbOpen;
          if ((e.close || fbClose) > close) close = e.close || fbClose;
        }
        return { open, close };
      }
      if (!staff?.working_hours) return null;
      const day = staff.working_hours[dayOfWeek];
      if (!day) return null;
      if (day.closed) return { closed: true };
      return { open: day.open || fbOpen, close: day.close || fbClose };
    };

    // Effective window for one selected-service row.
    const serviceWindow = (item) => {
      if (item.staff) return staffWindow(item.staff);
      // No explicit staff pick — find who CAN do this service and union their windows.
      const eligible = (initialSalon.staff || []).filter(s =>
        !s.service_ids || s.service_ids.length === 0 || s.service_ids.includes(item.service.id)
      );
      if (eligible.length === 0) return null; // No staff list = no constraint
      const windows = eligible.map(staffWindow).filter(w => w && !w.closed);
      if (windows.length === 0) return { closed: true }; // Nobody eligible is working today
      // Union approximation: earliest start, latest close.
      let open = "23:59", close = "00:00";
      for (const w of windows) {
        if (w.open < open) open = w.open;
        if (w.close > close) close = w.close;
      }
      return { open, close };
    };

    let latestStart = "00:00";
    let earliestEnd = "23:59";
    let hasConstraint = false;
    for (const item of selectedServices) {
      const w = serviceWindow(item);
      if (!w) continue; // No constraint from this item
      hasConstraint = true;
      if (w.closed) return { closed: true };
      if (w.open > latestStart) latestStart = w.open;
      if (w.close < earliestEnd) earliestEnd = w.close;
    }
    if (!hasConstraint) return null;
    if (latestStart >= earliestEnd) return { closed: true };
    return { open: latestStart, close: earliestEnd };
  };

  // Booking window helpers (min/max advance)
  const minAdvanceHours = initialSalon.min_advance_hours || 0;
  const maxAdvanceDays = initialSalon.max_advance_days || 60;
  
  const isDayInBookingWindow = (dateStr) => {
    const now = getToday();
    const dayDate = new Date(dateStr + "T23:59:59");
    const minDate = new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000);
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + maxAdvanceDays);
    maxDate.setHours(23, 59, 59, 999);
    if (dayDate < minDate) return false;
    if (new Date(dateStr + "T00:00:00") > maxDate) return false;
    return true;
  };
  
  // Find first available (non-closed) day within booking window
  const getFirstAvailableDate = () => {
    const now = getToday();
    const maxDays = Math.min(maxAdvanceDays + 1, 90);
    for (let i = 0; i < maxDays; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const dateStr = fmt(d);
      const hours = getEffectiveHours(dateStr);
      if (!hours.closed && isDayInBookingWindow(dateStr)) return dateStr;
    }
    return fmt(getToday()); // Fallback
  };
  
  const [date, setDate] = useState(getFirstAvailableDate);
  const [time, setTime] = useState(null);
  // `website` is a honeypot field — invisible to real users (positioned
  // off-screen, aria-hidden, autocomplete off) but filled by dumb bots that
  // blindly populate every input on a page. If the server receives a non-empty
  // value, it rejects the booking. See also book-appointment edge fn.
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival", allergies: "", website: "" });
  const [clientNoShows, setClientNoShows] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorToast, setErrorToast] = useState("");
  const [gallery, setGallery] = useState(null);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState("");
  const [clientFound, setClientFound] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [waitlistNotes, setWaitlistNotes] = useState("");
  const [waitlistError, setWaitlistError] = useState("");
  // Days the customer wants to be notified about (multi-select). Seeded with
  // the day they were looking at; they can add more full days in the modal.
  const [waitlistDates, setWaitlistDates] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  // Booked slots for the WHOLE visible window (keyed by date), so the day
  // strip can grey out fully-booked days — not just the selected date.
  const [rangeBooked, setRangeBooked] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(reviewMode);
  const [mode, setMode] = useState("profile"); // "profile" | "booking"
  const [profileTab, setProfileTab] = useState("services");
  const [profileCategory, setProfileCategory] = useState("all");
  const [reviewSort, setReviewSort] = useState("recent");
  const [expandedHours, setExpandedHours] = useState(false);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  const [expandedPolicy, setExpandedPolicy] = useState(false);
  // Share popover — only used on desktop / browsers without navigator.share.
  const [shareOpen, setShareOpen] = useState(false);
  const [expandedTeamMember, setExpandedTeamMember] = useState(null);
  const profileSectionRefs = useRef({});
  const profileMainRef = useRef(null);
  const profileTabsBarRef = useRef(null);

  // When date changes, drop any assigned staff member who isn't available that day and
  // clear the chosen time. Otherwise the booking could be submitted against a staff
  // member who doesn't work on the new date.
  useEffect(() => {
    setSelectedServices(prev => prev.map(item => item.staff && !isStaffAvailable(item.staff, date) ? { ...item, staff: null } : item));
    setTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  const isScrollingToTab = useRef(false);
  const emailLookupRef = useRef(0);

  // Return-client prefill. Debounces so we don't fire on every keystroke, and
  // never overwrites fields the user has already typed into — the lookup is a
  // convenience, not a source of truth.
  useEffect(() => {
    const raw = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) { setClientFound(false); return; }
    const myTick = ++emailLookupRef.current;
    const t = setTimeout(() => {
      if (myTick !== emailLookupRef.current) return;
      try {
        const store = JSON.parse(localStorage.getItem(`vellu_return_${initialSalon.id}`) || "{}");
        const hit = store[raw];
        if (!hit) { setClientFound(false); return; }
        setClientFound(true);
        setForm(f => ({
          ...f,
          firstName: f.firstName || hit.firstName || "",
          lastName: f.lastName || hit.lastName || "",
          phone: f.phone || hit.phone || "",
        }));
      } catch { /* private mode — skip silently */ }
    }, 350);
    return () => clearTimeout(t);
  }, [form.email, initialSalon.id]);

  // Scroll-spy: update active tab based on which section is closest to top
  useEffect(() => {
    if (mode !== "profile") return;
    const HEADER_OFFSET = 80;
    let ticking = false;
    const onScroll = () => {
      if (ticking || isScrollingToTab.current) return;
      ticking = true;
      requestAnimationFrame(() => {
        const sections = profileSectionRefs.current;
        const sectionIds = Object.keys(sections).filter(k => sections[k]);
        let activeId = sectionIds[0];
        for (const id of sectionIds) {
          const el = sections[id];
          if (!el) continue;
          const top = el.getBoundingClientRect().top;
          if (top <= HEADER_OFFSET + 40) activeId = id;
        }
        if (activeId) setProfileTab(activeId);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [mode]);


  // Auto-scroll the tab bar so the active tab is visible
  useEffect(() => {
    const bar = profileTabsBarRef.current;
    if (!bar) return;
    const activeBtn = bar.querySelector(`[data-tab-id="${profileTab}"]`);
    if (!activeBtn) return;
    // First tab — always snap to start
    const allBtns = bar.querySelectorAll("[data-tab-id]");
    if (allBtns.length > 0 && allBtns[0] === activeBtn) {
      bar.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    // If the tab is already fully visible, don't scroll
    const btnLeft = activeBtn.offsetLeft;
    const btnRight = btnLeft + activeBtn.offsetWidth;
    if (btnLeft >= bar.scrollLeft && btnRight <= bar.scrollLeft + bar.offsetWidth) return;
    const scrollLeft = activeBtn.offsetLeft - bar.offsetWidth / 2 + activeBtn.offsetWidth / 2;
    bar.scrollTo({ left: Math.max(0, scrollLeft), behavior: "smooth" });
  }, [profileTab]);
  const days = getDays(Math.min(maxAdvanceDays + 1, 90));
  
  // Booking policy: NL is the default, EN is optional. Falls back to NL when
  // the salon hasn't provided an English translation, so we don't show empty
  // space to English visitors of NL-only salons.
  const effectivePolicy = lang === "en"
    ? (initialSalon.booking_policy_en || initialSalon.booking_policy || "")
    : (initialSalon.booking_policy || "");

  // Check if form is complete
  const phoneValid = !initialSalon.phone_required || form.phone.length >= 6;
  const policyValid = !effectivePolicy || policyAgreed;
  // Basic email validation — lets the UI block submit with an invalid address instead of
  // sending to the server and silently failing the confirmation email.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const canConfirm = form.firstName.trim() && form.lastName.trim() && emailValid && phoneValid && policyValid;
  // Show the user WHY the next button is disabled.
  const invalidReason = !form.firstName.trim() ? (lang === "nl" ? "Vul je voornaam in" : "Enter your first name")
    : !form.lastName.trim() ? (lang === "nl" ? "Vul je achternaam in" : "Enter your last name")
    : !emailValid ? (lang === "nl" ? "Vul een geldig e-mailadres in" : "Enter a valid email address")
    : !phoneValid ? (lang === "nl" ? "Vul een geldig telefoonnummer in" : "Enter a valid phone number")
    : !policyValid ? (lang === "nl" ? "Accepteer de voorwaarden" : "Please accept the terms")
    : "";

  // Multi-service helpers
  const getStaffForService = (serviceId) => {
    return (initialSalon.staff || []).filter(m =>
      (m.service_ids?.length === 0 || m.service_ids?.includes(serviceId)) &&
      (step <= 1 || isStaffAvailable(m, date))
    );
  };

  const isServiceSelected = (serviceId) => selectedServices.some(item => item.service.id === serviceId);
  
  const getServiceItem = (serviceId) => selectedServices.find(item => item.service.id === serviceId);

  const toggleServiceSelection = (s) => {
    setSelectedServices(prev => {
      if (prev.find(item => item.service.id === s.id)) {
        return prev.filter(item => item.service.id !== s.id);
      }
      return [...prev, { service: s, variant: null, extras: [], staff: null }];
    });
  };

  const updateServiceItem = (serviceId, updates) => {
    setSelectedServices(prev => prev.map(item =>
      item.service.id === serviceId ? { ...item, ...updates } : item
    ));
  };

  const toggleExtraForService = (serviceId, extra) => {
    setSelectedServices(prev => prev.map(item => {
      if (item.service.id !== serviceId) return item;
      const has = item.extras.find(e => e.id === extra.id);
      return { ...item, extras: has ? item.extras.filter(e => e.id !== extra.id) : [...item.extras, extra] };
    }));
  };

  // Team accounts with 2+ staff must have a specific stylist picked per
  // service — otherwise the booking floats without attribution and doesn't
  // show up in any per-staff agenda filter (see also the server-side check
  // in book-appointment).
  const requireStaffPick = initialSalon.account_type === "team" && (initialSalon.staff || []).length > 1;
  const staffEligibleForService = (svcId) => (initialSalon.staff || []).filter(s => !s.service_ids || s.service_ids.length === 0 || s.service_ids.includes(svcId));
  const missingStaff = requireStaffPick
    ? selectedServices.filter(item => !item.staff && staffEligibleForService(item.service.id).length > 0)
    : [];
  const canProceedStep1 = selectedServices.length > 0
    && selectedServices.every(item => !item.service.variants?.length || item.variant)
    && missingStaff.length === 0;
  const missingVariants = selectedServices.filter(item => item.service.variants?.length > 0 && !item.variant);

  // Category filtering
  const categories = initialSalon.categories || [];
  const filteredServices = activeCategory === "all"
    ? initialSalon.services
    : initialSalon.services.filter(s => s.category_id === activeCategory);

  // Get active discount codes
  const activeCodes = (initialSalon.discount_codes || []).filter(dc => dc.active);
  
  // Apply discount code - called on input change for instant feedback
  const applyDiscountCode = (code = discountCode) => {
    setDiscountError("");
    if (!code.trim()) return;
    const found = activeCodes.find(dc => dc.code.toUpperCase() === code.toUpperCase());
    if (found) {
      setAppliedDiscount(found);
      setDiscountCode("");
    } else {
      setDiscountError(t.invalidCode);
    }
  };
  
  // Auto-apply discount when code matches
  const handleDiscountInput = (value) => {
    const upperVal = value.toUpperCase();
    setDiscountCode(upperVal);
    setDiscountError("");
    // Auto-apply if exact match found — compare both sides uppercased to match the
    // behaviour of applyDiscountCode (owner may have stored mixed-case codes).
    const found = activeCodes.find(dc => (dc.code || "").toUpperCase() === upperVal);
    if (found) {
      setAppliedDiscount(found);
      setDiscountCode("");
    }
  };

  // Provisional pricing while no variant is chosen yet: fall back to the
  // CHEAPEST variant instead of the (often 0) parent price, so step 1 shows
  // "Vanaf €30.00" rather than a misleading €0.00. Once every variant-service
  // has a variant picked (enforced before step 2) these equal the exact values.
  const itemBasePrice = (item) => {
    if (item.variant) return parseFloat(item.variant.price);
    const vs = item.service.variants || [];
    if (vs.length > 0) return Math.min(...vs.map(v => parseFloat(v.price)));
    return parseFloat(item.service.price || 0);
  };
  const itemBaseDuration = (item) => {
    if (item.variant) return item.variant.duration;
    const vs = (item.service.variants || []).map(v => parseInt(v.duration)).filter(d => Number.isFinite(d) && d > 0);
    if (vs.length > 0) return Math.min(...vs);
    return item.service.duration || 0;
  };
  const hasUnchosenVariant = selectedServices.some(it => (it.service.variants || []).length > 0 && !it.variant);
  // "Vanaf €30.00" prefix for totals while any variant is still unchosen.
  const fromPrefix = hasUnchosenVariant ? (lang === "nl" ? "vanaf " : "from ") : "";
  const getPrice = () => {
    let total = selectedServices.reduce((sum, item) => {
      const extrasTotal = item.extras.reduce((s, e) => s + parseFloat(e.price || 0), 0);
      return sum + itemBasePrice(item) + extrasTotal;
    }, 0);
    if (appliedDiscount) {
      if (appliedDiscount.type === "percent") {
        total = Math.max(0, total * (1 - appliedDiscount.amount / 100));
      } else {
        total = Math.max(0, total - appliedDiscount.amount);
      }
    }
    return total;
  };
  const getOriginalPrice = () => {
    return selectedServices.reduce((sum, item) => {
      const extrasTotal = item.extras.reduce((s, e) => s + parseFloat(e.price || 0), 0);
      return sum + itemBasePrice(item) + extrasTotal;
    }, 0);
  };
  const getDuration = () => {
    return selectedServices.reduce((sum, item) => sum + itemBaseDuration(item), 0);
  };
  const getServiceLabel = () => {
    return selectedServices.map(item => {
      let label = svcName(item.service);
      if (item.variant) label += " — " + (lang === "nl" ? item.variant.name_nl : (item.variant.name_en || item.variant.name_nl));
      if (item.staff) label += ` (${item.staff.name})`;
      return label;
    }).join(" + ");
  };
  const getAllExtrasFlat = () => {
    return selectedServices.flatMap(item => item.extras);
  };

  const reset = () => { setMode("profile"); setStep(hasLocations ? 0 : 1); setSelectedServices([]); setTime(null); setDone(false); setSubmitting(false); setSlotsRefreshKey(k => k + 1); setClientNoShows(0); setForm({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival", allergies: "" }); setPolicyAgreed(false); setAppliedDiscount(null); setDiscountCode(""); if (hasLocations) setSelectedLocation(null); setWaitlistOpen(false); setWaitlistDone(false); setWaitlistNotes(""); setWaitlistError(""); };

  // Seed the day multi-select when the waitlist modal opens (with the day the
  // customer was looking at), and clear it when it closes.
  useEffect(() => {
    if (waitlistOpen) setWaitlistDates(date ? [date] : []);
    else setWaitlistDates([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitlistOpen]);

  const toggleWaitlistDate = (ds) =>
    setWaitlistDates(prev => prev.includes(ds) ? prev.filter(x => x !== ds) : [...prev, ds].sort());

  // Submit a waitlist entry — ONE row per chosen day, so the customer can ask
  // to be told about several specific days at once. No server-side dedup:
  // someone joining twice for the same date is fine, the owner sees both rows
  // and can dismiss. If the client hasn't filled in their name yet (they
  // haven't been through step 3), we require it in the modal; otherwise we
  // prefill from `form`.
  const submitWaitlist = async () => {
    if (waitlistSubmitting) return;
    const dates = (waitlistDates.length ? waitlistDates : (date ? [date] : []));
    if (!dates.length) { setWaitlistError(T[lang].waitlistNoDate); return; }
    const first = form.firstName.trim();
    const last = form.lastName.trim();
    const email = form.email.trim().toLowerCase();
    if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setWaitlistError(T[lang].waitlistSubmitError);
      return;
    }
    // Honour the salon's "phone required" setting here too (same rule the
    // booking form enforces via phoneValid).
    if (initialSalon.phone_required && (form.phone || "").trim().length < 6) {
      setWaitlistError(T[lang].phone_required);
      return;
    }
    setWaitlistSubmitting(true);
    setWaitlistError("");
    // Pick the first selected service's staff (if any) as the anchor — the
    // owner can still fulfil with any stylist later. service_ids is best-effort
    // context for the owner.
    const staffId = selectedServices.find(s => s.staff)?.staff?.id || null;
    const serviceIds = selectedServices.map(s => s.service?.id).filter(Boolean);
    const rows = dates.map(d => ({
      owner_id: initialSalon.owner_id,
      staff_id: staffId,
      date: d,
      client_name: `${first} ${last}`,
      client_email: email,
      client_phone: form.phone?.trim() || null,
      service_ids: serviceIds.length ? serviceIds : null,
      notes: waitlistNotes.trim() || null,
    }));
    const { error } = await supabase.from("waitlist").insert(rows);
    setWaitlistSubmitting(false);
    if (error) { setWaitlistError(T[lang].waitlistSubmitError); return; }
    setWaitlistDone(true);
    // Fire the confirmation (to the client) + notification (to the salon)
    // emails SERVER-SIDE. The recipient addresses — the salon's contact email
    // and the stylist's email — are deliberately NOT in the public salon
    // payload, so an anonymous visitor can't send these directly; the
    // waitlist-notify edge function resolves them from the IDs. Best-effort:
    // the entry is already saved, so a mail hiccup must not surface as an
    // error to the client.
    try {
      await supabase.functions.invoke("waitlist-notify", {
        body: {
          owner_id: initialSalon.owner_id,
          client_name: `${first} ${last}`,
          client_email: email,
          client_phone: form.phone?.trim() || null,
          dates,
          service_ids: serviceIds.length ? serviceIds : null,
          staff_id: staffId,
          notes: waitlistNotes.trim() || null,
          lang,
        },
      });
    } catch (e) { console.error("waitlist-notify failed:", e); }
  };

  // Enter booking mode (optionally pre-select a service)
  const enterBooking = (service = null) => {
    // Reset booking state
    setStep(hasLocations ? 0 : 1);
    setSelectedServices(service ? [{ service, variant: null, extras: [], staff: null }] : []);
    setTime(null);
    setDone(false);
    setSubmitting(false);
    setSlotsRefreshKey(k => k + 1);
    setClientNoShows(0);
    setForm({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival", allergies: "" });
    setPolicyAgreed(false);
    setAppliedDiscount(null);
    setDiscountCode("");
    // Carry over the category the user was browsing on the profile page so
     // the booking-flow filter starts on the same tab. Falls back to "all"
     // when the user opened booking from outside a category context.
    setActiveCategory(profileCategory || "all");
    if (hasLocations) setSelectedLocation(null);
    setMode("booking");
  };

  // Responsive hook
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Client email autofill has been REMOVED for privacy/security reasons.
  // Previously we did an unauthenticated SELECT on the `clients` table keyed
  // by email to prefill the booking form for returning clients. That also
  // leaked name/phone/allergies to anyone who entered an email, allowing
  // enumeration of the customer base. Clients now type their info each time.
  // The server-side upsert in book-appointment still keeps one row per email.

  // Load booked time slots for selected date. Goes through the RPC
  // `get_booked_slots` (SECURITY DEFINER) which only returns the non-PII
  // fields — time, service_duration, staff_id — so the appointments table
  // itself can stay locked down to owner/client access only.
  useEffect(() => {
    if (!date || !initialSalon.id) return;
    let cancelled = false;
    setSlotsLoading(true);
    const loadSlots = async () => {
      const { data, error } = await supabase.rpc("get_booked_slots", {
        p_slug: initialSalon.id,
        p_date: date,
        p_location_id: selectedLocation?.id || null,
      });
      if (cancelled) return;
      setBookedSlots(error ? [] : (data || []));
      setSlotsLoading(false);
    };
    loadSlots();
    return () => { cancelled = true; };
  }, [date, initialSalon.id, slotsRefreshKey, selectedLocation?.id]);

  // Load booked slots across the whole booking window in ONE query so the day
  // strip can mark fully-booked days grey (and we can point to the first free
  // day). Grouped by date. Refreshes when a booking is made (slotsRefreshKey).
  useEffect(() => {
    if (!initialSalon.id) return;
    let cancelled = false;
    const loadRange = async () => {
      const from = fmt(getToday());
      const toD = new Date(getToday());
      toD.setDate(toD.getDate() + Math.min(maxAdvanceDays + 1, 90));
      const { data, error } = await supabase.rpc("get_booked_slots_range", {
        p_slug: initialSalon.id,
        p_from: from,
        p_to: fmt(toD),
        p_location_id: selectedLocation?.id || null,
      });
      if (cancelled) return;
      const map = {};
      if (!error && Array.isArray(data)) {
        for (const r of data) {
          const key = String(r.date);
          (map[key] = map[key] || []).push({ time: r.time, service_duration: r.service_duration, staff_id: r.staff_id });
        }
      }
      setRangeBooked(map);
    };
    loadRange();
    return () => { cancelled = true; };
  }, [initialSalon.id, slotsRefreshKey, selectedLocation?.id, maxAdvanceDays]);

  // Check if a time slot overlaps with existing bookings (including break time)
  // For multi-staff salons: only check slots for the same staff member(s)
  const breakBuffer = activeBreakMinutes;
  
  const isTimeSlotBooked = (slotTime, bookedList = bookedSlots) => {
    const toMin = (hm) => { const [h, m] = (hm || "0:0").split(":").map(Number); return h * 60 + m; };
    const slotStart = toMin(slotTime);
    const allStaff = initialSalon.staff || [];

    // Mirror getAvailableTimes' eligibility model: an explicit staff pick
    // narrows to that person; "no preference" means anyone who can PERFORM
    // this service. Previously "no preference" counted appointments of ALL
    // staff as conflicts — so a fully-free Lady slot showed as booked purely
    // because Esther (who can't even do the service) had a client then.
    const rows = selectedServices.length > 0
      ? selectedServices.map(item => ({
          duration: (item.variant ? item.variant.duration : item.service.duration) || 30,
          eligible: item.staff
            ? [item.staff]
            : allStaff.filter(s => !s.service_ids || s.service_ids.length === 0 || s.service_ids.includes(item.service.id)),
        }))
      : [{ duration: Math.max(getDuration(), 30), eligible: [] }];

    // Does this staff member have a conflicting appointment in [start, end)?
    // Appointments without staff_id (solo-era / unassigned) block everyone —
    // they occupy "the salon" and we can't tell who takes them.
    const staffBusy = (staffId, startMin, endMin) => {
      for (const b of bookedList) {
        if (!b.time) continue;
        if (b.staff_id && staffId && b.staff_id !== staffId) continue;
        const bStart = toMin(b.time);
        const bEnd = bStart + Math.max(b.service_duration || 30, 30);
        // Symmetric break buffer on BOTH sides so the pause applies whether
        // the new slot precedes or follows the existing booking.
        if (startMin - breakBuffer < bEnd && endMin + breakBuffer > bStart) return true;
      }
      return false;
    };

    // Walk the services sequentially (same sub-window model as
    // getAvailableTimes): each sub-window needs at least one eligible
    // staff member without an appointment conflict.
    let cur = slotStart;
    for (const r of rows) {
      const end = cur + r.duration;
      const free = r.eligible.length === 0
        ? !staffBusy(null, cur, end) // no staff configured → any appointment blocks
        : r.eligible.some(sm => !staffBusy(sm.id, cur, end));
      if (!free) return true;
      cur = end;
    }
    return false;
  };

  // Shared time-slot filter: returns available times for a given date.
  //
  // For multi-service bookings we walk each service in order and require that
  // its specific sub-window ([start + previous durations, +duration)) is
  // covered by at least one eligible staff member. This correctly handles:
  //
  //   - services bound to different staff (Acryl→Esther, Pedicure→Lady):
  //     each sub-window must land in that staff's hours, so a Tuesday where
  //     Lady is closed zeroes out the whole date no matter how many other
  //     times are "salon open".
  //
  //   - services each staff with non-overlapping shifts: if Esther works
  //     09-12 and Lady works 14-17 and both can do the service, start time
  //     T=09:00 is valid if Esther covers the whole service; T=11:30 is
  //     invalid because nobody covers the gap 12-14. No blanket-window
  //     union can express this — only per-slot checks can.
  //
  //   - explicit staff assignment: if item.staff is set (customer picked
  //     a specific person), only that person counts as "eligible".
  const getAvailableTimes = (forDate) => {
    const dayHours = getEffectiveHours(forDate);
    if (dayHours.closed) return [];

    // Parse date locally so getDay() isn't shifted into the wrong weekday
    // for negative-offset timezones.
    const [yyyy, mm, dd] = (forDate || "").split("-").map(Number);
    const dayOfWeek = (yyyy && mm && dd) ? new Date(yyyy, mm - 1, dd).getDay() : new Date(forDate).getDay();

    const toMin = (hm) => { const [h, m] = (hm || "0:0").split(":").map(Number); return h * 60 + m; };

    // Precompute per-service: duration + eligible-staff list.
    const allStaff = initialSalon.staff || [];
    const serviceSlots = selectedServices.map(item => {
      const duration = (item.variant ? item.variant.duration : item.service.duration) || 30;
      const eligible = item.staff
        ? [item.staff]
        : allStaff.filter(s =>
            !s.service_ids || s.service_ids.length === 0 || s.service_ids.includes(item.service.id)
          );
      return { duration, eligible };
    });

    // If any service has zero eligible staff at all (misconfigured salon), bail.
    // A single service with no eligible set means nobody in the salon can do it
    // — definitively impossible, doesn't matter what hours are set.
    if (selectedServices.length > 0 && allStaff.length > 0 && serviceSlots.some(s => s.eligible.length === 0)) return [];

    // Is this staff member working the full [startMin, endMin) window today?
    // Returns true when the staff has no constraint (follows salon hours —
    // the salon-wide check has already passed by this point). When the
    // staff row has closed:false but missing open/close (legacy toggle
    // bug), fall back to the salon business_hours for that day so a
    // half-saved row can't quietly widen bookable slots to 00:00–23:59.
    const gatFallback = activeHours[dayOfWeek] || DEFAULT_HOURS[dayOfWeek] || {};
    const gatFbOpen = gatFallback.open || "09:00";
    const gatFbClose = gatFallback.close || "17:30";
    // Per-staff block for the current date, if any. Only relevant to slots
    // that involve THIS specific staff — other staff can still work through
    // it, which is why isTimeBlockedByOverride skips this case (see above).
    // Two flavours: time-window (has start/end) and whole-day (no bounds).
    const dayOverride = dayOverrides[forDate];
    const staffBlock = (dayOverride && dayOverride.type === "blocked" && dayOverride.staff_id)
      ? {
          staffId: dayOverride.staff_id,
          wholeDay: !dayOverride.block_time_start || !dayOverride.block_time_end,
          start: dayOverride.block_time_start ? toMin(dayOverride.block_time_start) : 0,
          end: dayOverride.block_time_end ? toMin(dayOverride.block_time_end) : 24 * 60,
        }
      : null;
    // Per-staff blocks pulled from staff_day_overrides — one array of blocks
    // per staff_id so multiple stylists can each have their own block on the
    // same date without stepping on each other.
    const staffBlocksById = {};
    for (const b of initialSalon.staff_blocks || []) {
      if (b.date !== forDate) continue;
      (staffBlocksById[b.staff_id] = staffBlocksById[b.staff_id] || []).push({
        wholeDay: !b.block_time_start,
        start: b.block_time_start ? toMin(b.block_time_start) : 0,
        end: b.block_time_end ? toMin(b.block_time_end) : 24 * 60,
      });
    }
    // Exceptions on this date (merged legacy JSON + staff_day_overrides
    // rows via getExceptionsFor). When a stylist has one or more exception
    // windows they REPLACE the weekly schedule for this date: the slot must
    // fit entirely inside one of the windows. Several stylists can each
    // bring their own exception on the same day.
    const dayExceptions = getExceptionsFor(forDate);
    const staffCoversWindow = (staff, startMin, endMin) => {
      const exc = dayExceptions.filter(e => !e.staff_id || e.staff_id === staff?.id);
      if (exc.length > 0) {
        const fits = exc.some(e => {
          const excOpen = toMin(e.open || gatFbOpen);
          const excClose = toMin(e.close || gatFbClose);
          return startMin >= excOpen && endMin <= excClose;
        });
        if (!fits) return false;
      } else {
        if (!staff?.working_hours) return true;
        const day = staff.working_hours[dayOfWeek];
        if (!day) return true;
        if (day.closed) return false;
        const staffOpen = toMin(day.open || gatFbOpen);
        const staffClose = toMin(day.close || gatFbClose);
        if (startMin < staffOpen || endMin > staffClose) return false;
      }
      // Per-staff block: this staff can't cover a window that overlaps with
      // their personal block (or any window if the block is whole-day).
      // Other eligible staff are still evaluated by the enclosing loop, so
      // a Lady-block only closes Lady's slot options.
      if (staffBlock && staff.id === staffBlock.staffId) {
        if (staffBlock.wholeDay) return false;
        if (startMin < staffBlock.end && endMin > staffBlock.start) return false;
      }
      // Same logic against staff-authored blocks in staff_day_overrides.
      const ownBlocks = staffBlocksById[staff.id] || [];
      for (const b of ownBlocks) {
        if (b.wholeDay) return false;
        if (startMin < b.end && endMin > b.start) return false;
      }
      return true;
    };

    const salonOpen = toMin(dayHours.open);
    const salonClose = toMin(dayHours.close);
    const totalDuration = serviceSlots.reduce((sum, s) => sum + s.duration, 0) || 30;

    // Candidate start times follow the salon's own slot grid (owner setting,
    // default 30 min) instead of a hardcoded half-hour raster.
    return genTimes(initialSalon.slot_interval_minutes || 30).filter(tt => {
      const startMin = toMin(tt);

      // Salon-wide bounds: start within open hours, end before close.
      if (startMin < salonOpen) return false;
      if (startMin + totalDuration > salonClose) return false;

      // Per-service sub-window: at least one eligible staff must cover it.
      // Walk services sequentially — each sub-window starts right after the
      // previous one ends (no gaps within a single booking).
      let cur = startMin;
      for (const s of serviceSlots) {
        const end = cur + s.duration;
        const covered = s.eligible.length === 0
          ? true // no staff configured for salon → fall back to salon hours (already checked)
          : s.eligible.some(sm => staffCoversWindow(sm, cur, end));
        if (!covered) return false;
        cur = end;
      }

      if (isTimeBlockedByOverride(forDate, tt)) return false;
      if (forDate === fmt(getToday())) {
        const now = getToday();
        const [h, m] = tt.split(":").map(Number);
        if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) return false;
      }
      if (minAdvanceHours > 0 && forDate === fmt(getToday())) {
        const now = getToday();
        const slotDate = new Date(forDate + "T" + tt + ":00");
        if (slotDate.getTime() - now.getTime() < minAdvanceHours * 60 * 60 * 1000) return false;
      }
      return true;
    });
  };

  // Availability per day for the whole strip: 'closed' | 'full' | 'open'.
  // 'full' = the salon is open but every bookable slot is already taken. Built
  // off the range-loaded bookings so we can grey full days like closed ones and
  // point the customer at the first free day. Memoised on the inputs that move
  // availability — the per-slot maths is too heavy to re-run every render.
  const servicesSig = selectedServices.map(i =>
    `${i.service.id}:${i.variant?.id || ""}:${i.staff?.id || ""}:${(i.extras || []).map(e => e.id).join("+")}`
  ).join("|");
  const dayAvailability = useMemo(() => {
    const map = {};
    for (const d of days) {
      const ds = fmt(d);
      const dayHours = getEffectiveHours(ds);
      const staffWindow = getStaffTimeWindow(ds);
      if (dayHours.closed || staffWindow?.closed || !isDayInBookingWindow(ds)) { map[ds] = "closed"; continue; }
      const times = getAvailableTimes(ds);
      if (times.length === 0) { map[ds] = "closed"; continue; }
      const booked = rangeBooked[ds] || [];
      map[ds] = times.some(tt => !isTimeSlotBooked(tt, booked)) ? "open" : "full";
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeBooked, servicesSig, selectedLocation?.id, maxAdvanceDays, minAdvanceHours]);

  // First day (from today) that actually has a free slot — used for the "next
  // available" hint shown when the chosen day turns out to be full or closed.
  const firstOpenDate = useMemo(() => {
    for (const d of days) {
      const ds = fmt(d);
      if (dayAvailability[ds] === "open") return ds;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayAvailability]);

  // A tappable "first available: <date>" hint. Jumps the picker to that day.
  const FirstAvailableHint = () => {
    if (!firstOpenDate || firstOpenDate === date) return null;
    const label = parseDate(firstOpenDate).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" });
    return (
      <button type="button" onClick={() => { setDate(firstOpenDate); setTime(null); }}
        style={{ background: `${accent}12`, border: `1px solid ${accent}44`, color: accent, borderRadius: 12, padding: "10px 16px", fontSize: 12.5, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, lineHeight: 1.4 }}>
        <NavIcon name="calendar" size={14} color={accent} />
        <span>{lang === "nl" ? "Eerste beschikbare dag: " : "First available: "}<b style={{ textTransform: "capitalize" }}>{label}</b> →</span>
      </button>
    );
  };

  // Confirm booking — calls the book-appointment edge function which validates
  // everything server-side (price, discount, business hours, slot conflict,
  // staff assignment) with service_role. Client code NEVER inserts directly.
  const submittingRef = useRef(false);
  const confirmBooking = async () => {
    // Synchronous guard via ref — React state updates are batched, so a rapid
    // double-tap can fire confirmBooking twice before `submitting` flips to true.
    if (submittingRef.current || submitting) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Build the payload. The server recomputes price/duration — we don't
      // trust any client numbers. We just tell it what was selected.
      const clientEmail = form.email.toLowerCase();

      const variant_ids = {};
      const extra_ids = {};
      const staff_ids_per_service = {};
      const service_ids = selectedServices.map(item => {
        const sid = item.service.id;
        if (item.variant) variant_ids[sid] = item.variant.id;
        if (item.extras && item.extras.length > 0) extra_ids[sid] = item.extras.map(e => e.id);
        if (item.staff) staff_ids_per_service[sid] = item.staff.id;
        return sid;
      });

      const { data: result, error: fnErr } = await supabase.functions.invoke("book-appointment", {
        body: {
          salon_slug: initialSalon.id, // salon slug (routed as /:slug)
          service_ids,
          variant_ids,
          extra_ids,
          staff_ids_per_service,
          discount_code: appliedDiscount?.code || null,
          date,
          time,
          client: {
            firstName: form.firstName,
            lastName: form.lastName,
            email: clientEmail,
            phone: form.phone || null,
            allergies: form.allergies || null,
            // Honeypot — real users leave this empty; bots fill it. Server
            // silently rejects if non-empty.
            website: form.website || "",
          },
          payment_method: form.payment,
          location_id: selectedLocation?.id || null,
          policy_agreed: !!policyAgreed,
          lang,
        },
      });

      if (fnErr) {
        // supabase-js wraps non-2xx responses in FunctionsHttpError whose `message` is
        // always "Edge Function returned a non-2xx status code". The real code lives in
        // the Response body under `context`, which we have to .json() ourselves.
        let serverCode = "booking_failed";
        try {
          if (fnErr.context && typeof fnErr.context.json === "function") {
            const body = await fnErr.context.json();
            if (body?.error) serverCode = String(body.error);
          } else if (fnErr.context?.body?.error) {
            serverCode = String(fnErr.context.body.error);
          }
        } catch { /* swallow — fall back to generic code */ }
        throw new Error(serverCode);
      }
      if (!result?.success) throw new Error(result?.error || "booking_failed");

      const appointmentId = result.appointment_id;
      const cancelToken = result.cancel_token;
      const combinedServiceName = result.service_name;
      const serverPrice = result.service_price;
      const serverDuration = result.service_duration;

      setDone(true);
      setSubmitting(false);
      submittingRef.current = false;
      setSlotsRefreshKey(k => k + 1);

      // Cache this client's details locally so a repeat booking from the same
      // browser can prefill after they type their email. Keyed per salon so
      // switching salons doesn't cross-pollinate. Not a DB lookup on purpose —
      // an anonymous "type any email → get name/phone" endpoint would leak PII.
      try {
        const key = `vellu_return_${initialSalon.id}`;
        const store = JSON.parse(localStorage.getItem(key) || "{}");
        store[form.email.trim().toLowerCase()] = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: (form.phone || "").trim(),
        };
        localStorage.setItem(key, JSON.stringify(store));
      } catch { /* private mode / quota — skip silently */ }

      const clientFullName = `${form.firstName} ${form.lastName}`;
      const allStaffNames = selectedServices.filter(item => item.staff).map(item => item.staff.name);

      // book-appointment now fires confirmation + notification emails server-side
      // (send-emails has verify_jwt=true, so an anonymous customer can't call it directly).
      // Only fall back to client-side sends on older server versions that didn't signal emails_sent.
      if (!result.emails_sent) {
        sendEmails("booking_confirmation", {
          client_name: clientFullName,
          client_email: clientEmail,
          service_name: combinedServiceName,
          date, time,
          payment: form.payment,
          price: serverPrice,
          salon_name: result.salon_name || initialSalon.name,
          salon_accent: initialSalon.accent || "", salon_logo: initialSalon.logo_url || "", lang,
          owner_email: result.owner_email || "info@vellu.cc",
          cancel_url: cancelToken ? `https://vellu.cc/cancel/${cancelToken}` : null,
        }).catch(e => console.error("confirmation email failed:", e));

        sendEmails("booking_notification", {
          owner_email: result.owner_email || null,
          staff_emails: result.staff_emails || [],
          client_name: clientFullName,
          client_phone: form.phone || null,
          service_name: combinedServiceName,
          date, time,
          price: serverPrice,
          salon_name: result.salon_name || initialSalon.name,
          salon_accent: initialSalon.accent || "", salon_logo: initialSalon.logo_url || "", lang,
        }).catch(e => console.error("notification email failed:", e));
      }

      // SMS to the client — only as a fallback for older server versions.
      // book-appointment now dispatches the confirmation SMS server-side (and
      // signals emails_sent), so on current servers we skip this to avoid a
      // double SMS. send-sms silently no-ops for Starter-plan salons / clients
      // without a phone either way.
      if (!result.emails_sent && form.phone) {
        sendSMS("booking_confirmation", {
          client_name: clientFullName,
          client_phone: form.phone,
          service_name: combinedServiceName,
          date, time,
          price: serverPrice,
          salon_name: result.salon_name || initialSalon.name,
          owner_id: initialSalon.owner_id,
          lang,
        }).catch(e => console.error("confirmation SMS failed:", e));
      }

      supabase.functions.invoke("google-calendar", {
        body: {
          action: "create",
          owner_id: initialSalon.owner_id,
          booking: {
            appointment_id: appointmentId,
            service_name: combinedServiceName,
            client_name: clientFullName,
            client_email: clientEmail,
            client_phone: form.phone || null,
            staff_name: allStaffNames.length > 0 ? allStaffNames.join(", ") : null,
            date, time,
            duration: serverDuration,
            price: serverPrice,
          },
        },
      }).catch(e => console.error("Google Calendar error:", e));

      // No invoice at booking time anymore: "online" now means "payment
      // request afterwards" — the owner sends the invoice (with the pay
      // link / SEPA QR block) from the dashboard after the appointment is
      // completed, when the final price is known.
    } catch (err) {
      console.error("Booking error:", err);
      // Map the server's specific error code to a friendly message. Any code we don't
      // recognise falls back to the generic "something went wrong" string.
      const code = (err?.message || "").toLowerCase().trim();
      const isNl = lang === "nl";
      const MAP = {
        slot_conflict: isNl ? "Dit tijdslot is net geboekt — kies een ander." : "This slot was just taken — please pick another.",
        closed: isNl ? "De salon is niet open op dit tijdstip." : "The salon is not open at this time.",
        outside_hours: isNl ? "De salon is niet open op dit tijdstip." : "The salon is not open at this time.",
        day_blocked: isNl ? "De salon is gesloten op deze dag." : "The salon is closed on this day.",
        slot_blocked: isNl ? "Dit tijdslot is geblokkeerd." : "This time slot is blocked.",
        too_soon: isNl ? "Je boekt te snel — probeer een later tijdstip." : "You're booking too soon — try a later time.",
        too_far: isNl ? "Je kunt nog niet zo ver vooruit boeken." : "You can't book that far ahead yet.",
        invalid_discount: isNl ? "Ongeldige kortingscode." : "Invalid discount code.",
        rate_limited: isNl ? "Te veel pogingen, probeer het zo opnieuw." : "Too many attempts, try again in a moment.",
        invalid_email: isNl ? "Ongeldig e-mailadres." : "Invalid email address.",
        missing_name: isNl ? "Vul je voor- en achternaam in." : "Please enter your first and last name.",
        phone_required: isNl ? "Telefoonnummer is verplicht voor deze salon." : "Phone number is required for this salon.",
        policy_not_agreed: isNl ? "Je moet akkoord gaan met de voorwaarden." : "You must agree to the booking terms.",
        salon_not_found: isNl ? "Salon niet gevonden." : "Salon not found.",
        invalid_service: isNl ? "Deze behandeling is niet meer beschikbaar — ververs de pagina." : "This service is no longer available — please reload.",
        invalid_variant: isNl ? "Deze variant is niet meer beschikbaar — ververs de pagina." : "This variant is no longer available — please reload.",
        invalid_extra: isNl ? "Deze extra is niet meer beschikbaar — ververs de pagina." : "This extra is no longer available — please reload.",
        invalid_staff: isNl ? "Deze medewerker is niet meer beschikbaar — ververs de pagina." : "This staff member is no longer available — please reload.",
        staff_not_assigned: isNl ? "Deze medewerker doet deze behandeling niet." : "This staff member does not perform this treatment.",
        staff_required: isNl ? "Kies een medewerker voor elke behandeling." : "Pick a stylist for each treatment.",
        staff_day_blocked: isNl ? "Deze medewerker is niet beschikbaar op deze dag." : "This stylist isn't available on this day.",
        staff_time_blocked: isNl ? "Deze medewerker is niet beschikbaar in dit tijdvak." : "This stylist isn't available in this time window.",
        staff_not_available: isNl ? "Deze medewerker werkt niet op dit tijdstip." : "This stylist doesn't work at this time.",
      };
      const msg = MAP[code] || t.bookingError;
      setErrorToast(msg);
      setTimeout(() => setErrorToast(""), 5000);
      setSubmitting(false);
      submittingRef.current = false;
    }
  };


  // ─── SALON PROFILE VIEW ─────────────────────────────────────
  const FULL_DAYS = lang === "nl" 
    ? ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"]
    : ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  
  const _nowDate = new Date();
  const todayDayIndex = _nowDate.getDay();
  // Recurring weekly hours per day index. For team accounts the source of
  // truth is the staff schedule — owners often leave the salon/location
  // business_hours at their default values (Mon–Fri 09:00–17:30 open),
  // which then misrepresent reality. So: if *any* active staff member has
  // working_hours configured for this weekday, derive the open window
  // from the union of those who aren't closed. If everybody with hours
  // is closed → really closed. Only when no staff has hours at all do
  // we fall back to the salon/location business_hours.
  const getWeeklyHours = (dayIdx) => {
    if (initialSalon.account_type === "team") {
      const staffDays = (initialSalon.staff || [])
        .filter(s => s.active !== false)
        .map(s => s.working_hours?.[dayIdx])
        .filter(Boolean);
      if (staffDays.length > 0) {
        const openWindows = staffDays.filter(d => !d.closed);
        if (openWindows.length === 0) return { closed: true };
        // See getEffectiveHours for the "why". A staff row saved as
        // closed:false but missing open or close is broken data (legacy
        // toggle bug); fall back to the salon business_hours for that day
        // rather than "00:00" so we never show times like "00:00 – 18:00".
        const salonFallback = activeHours[dayIdx] || DEFAULT_HOURS[dayIdx] || {};
        const fbOpen = salonFallback.open || "09:00";
        const fbClose = salonFallback.close || "17:30";
        let open = "23:59", close = "00:00";
        for (const w of openWindows) {
          const o = w.open || fbOpen;
          const cl = w.close || fbClose;
          if (o < open) open = o;
          if (cl > close) close = cl;
        }
        return { closed: false, open, close };
      }
    }
    return activeHours[dayIdx] || DEFAULT_HOURS[dayIdx];
  };
  const todayHoursObj = getWeeklyHours(todayDayIndex) || { closed: true };
  // Compute both an "is open now" boolean AND a status label with the right
  // phrasing for each case (day-closed vs before-open vs after-close vs open).
  const { salonIsOpen, salonStatusLabel } = (() => {
    if (todayHoursObj.closed) {
      return { salonIsOpen: false, salonStatusLabel: t.closedToday };
    }
    if (!todayHoursObj.open || !todayHoursObj.close) {
      return { salonIsOpen: false, salonStatusLabel: t.closedNow };
    }
    const [openH, openM] = String(todayHoursObj.open).split(":").map(Number);
    const [closeH, closeM] = String(todayHoursObj.close).split(":").map(Number);
    if (Number.isNaN(openH) || Number.isNaN(closeH)) {
      return { salonIsOpen: false, salonStatusLabel: t.closedNow };
    }
    const mins = _nowDate.getHours() * 60 + _nowDate.getMinutes();
    const openMins = openH * 60 + (openM || 0);
    const closeMins = closeH * 60 + (closeM || 0);
    if (mins < openMins) {
      return { salonIsOpen: false, salonStatusLabel: `${t.closedNow} · ${t.opensAt} ${todayHoursObj.open}` };
    }
    if (mins >= closeMins) {
      return { salonIsOpen: false, salonStatusLabel: t.closedNow };
    }
    return { salonIsOpen: true, salonStatusLabel: `${t.openNow} · ${t.closesAt} ${todayHoursObj.close}` };
  })();

  const avgRating = initialSalon.reviews?.length > 0
    ? (initialSalon.reviews.reduce((s, r) => s + r.rating, 0) / initialSalon.reviews.length).toFixed(1)
    : null;
  const ratingBreakdown = [5, 4, 3, 2, 1].map(r => ({
    stars: r,
    count: (initialSalon.reviews || []).filter(rv => rv.rating === r).length,
  }));

  const sortedReviews = [...(initialSalon.reviews || [])].sort((a, b) => {
    if (reviewSort === "rating") return b.rating - a.rating;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const getRelativeTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const dys = Math.floor(diff / 86400000);
    if (dys < 1) return lang === "nl" ? "vandaag" : "today";
    if (dys < 7) return `${dys} ${t.nDaysAgo}`;
    if (dys < 30) return `${Math.floor(dys / 7)} ${t.nWeeksAgo}`;
    return `${Math.floor(dys / 30)} ${t.nMonthsAgo}`;
  };

  const allPhotos = initialSalon.services.flatMap(s => (s.photos || []).map(p => {
    const obj = typeof p === "string" ? { url: p } : p;
    return { ...obj, serviceName: svcName(s) };
  }));

  const profileFilteredServices = profileCategory === "all"
    ? initialSalon.services
    : initialSalon.services.filter(s => s.category_id === profileCategory);

  const scrollToProfileSection = (tabId) => {
    setProfileTab(tabId);
    isScrollingToTab.current = true;
    const el = profileSectionRefs.current[tabId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => { isScrollingToTab.current = false; }, 800);
  };

  const StarRow = ({ rating: r, size = 13 }) => (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={i <= r ? accent : c.inputBg}>
          <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 13.28l-4.77 2.43.91-5.32L2.27 6.62l5.34-.78L10 1z" />
        </svg>
      ))}
    </span>
  );

  const profileTabs = [
    { id: "services", label: t.profileServices },
    ...(initialSalon.staff?.length > 0 ? [{ id: "team", label: t.profileTeam }] : []),
    ...(allPhotos.length > 0 ? [{ id: "gallery", label: t.profileGallery }] : []),
    ...(initialSalon.reviews?.length > 0 ? [{ id: "reviews", label: t.profileReviews }] : []),
    { id: "contact", label: t.profileContact },
  ];

  if (mode === "profile") return (
    <Layout accent={accent}>

      <div className="profile-root" style={{ background: c.bg, fontFamily: "'Jost',sans-serif", color: c.text }}>

        {/* ═══ STICKY HEADER — logo | tabs | contact ═══ */}
        <div className="profile-header">
          {initialSalon.logo_url ? (
            <img src={initialSalon.logo_url} className="profile-header-logo" alt={`${initialSalon.name} logo`} />
          ) : (
            <div className="profile-header-logo-placeholder">{initialSalon.name?.[0] || "S"}</div>
          )}
          <div className="profile-tabs" ref={profileTabsBarRef}>
            {profileTabs.map(tab => (
              <button key={tab.id} data-tab-id={tab.id} className={`profile-tab ${profileTab === tab.id ? "active" : ""}`}
                onClick={() => scrollToProfileSection(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>
          {(initialSalon.salon_email) && (
            <div className="profile-header-contact">
              <NavIcon name="mail" size={14} color={c.textSub} />
              <a href={`mailto:${initialSalon.salon_email}`} style={{ color: c.textSub, textDecoration: "none" }}>{initialSalon.salon_email}</a>
            </div>
          )}
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <ThemeToggle />
            <LangToggle lang={lang} setLang={setLang} />
          </div>
        </div>

        {/* ═══ SCROLLABLE AREA (mobile: flex-1 with overflow-y auto) ═══ */}
        <div className="profile-scroll-area">

        {/* ═══ HERO BANNER ═══ */}
        <div className="profile-hero" style={{ height: initialSalon.cover_image_url ? (isMobile ? 200 : 300) : (isMobile ? 160 : 220) }}>
          {initialSalon.cover_image_url && (
            <img src={initialSalon.cover_image_url} className="profile-hero-cover" alt={`${initialSalon.name} cover`} style={{ objectPosition: `center ${initialSalon.cover_focal_y ?? 50}%` }} />
          )}
          <div className="profile-hero-gradient" />
          <div className="profile-hero-content">
            <h1 className="profile-hero-name" style={{ fontSize: isMobile ? 28 : 42 }}>{initialSalon.name}</h1>
            {initialSalon.city && (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.12em" }}>{initialSalon.city}</div>
            )}
            {(initialSalon.reviews?.length > 0 || initialSalon.services?.length > 0) && (
              <div className="profile-hero-meta">
                {initialSalon.reviews?.length > 0 && (
                  <span className="profile-hero-meta-item">
                    <svg width={13} height={13} viewBox="0 0 20 20" fill={accent}>
                      <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 13.28l-4.77 2.43.91-5.32L2.27 6.62l5.34-.78L10 1z" />
                    </svg>
                    <span>{avgRating} · {initialSalon.reviews.length} {t.reviews.toLowerCase()}</span>
                  </span>
                )}
                {initialSalon.reviews?.length > 0 && initialSalon.services?.length > 0 && (
                  <span className="profile-hero-meta-sep" />
                )}
                {initialSalon.services?.length > 0 && (
                  <span className="profile-hero-meta-item">
                    <NavIcon name="scissors" size={13} color="rgba(255,255,255,0.88)" />
                    <span>{initialSalon.services.length} {t.profileServices.toLowerCase()}</span>
                  </span>
                )}
              </div>
            )}
            {/* Share pill — sits right under the salon name so it's the first
                thing after the meta row, impossible to miss. */}
            <div style={{ marginTop: 14, display: "flex", justifyContent: "center", position: "relative" }}>
              <SalonShareButton
                salon={initialSalon}
                lang={lang}
                open={shareOpen}
                setOpen={setShareOpen}
                accent={accent}
              />
            </div>
          </div>
        </div>

        {/* ═══ BODY — main + sidebar ═══ */}
        <div className="profile-body">

          {/* ─── MAIN CONTENT ─── */}
          <div className="profile-main">

            {/* SERVICES */}
            <section ref={el => profileSectionRefs.current.services = el} className="profile-section">
              <h2 className="profile-section-title">{t.profileServices}</h2>
              
              {(() => {
                const usedCats = categories.filter(cat => initialSalon.services.some(s => s.category_id === cat.id));
                if (usedCats.length === 0) return null;
                const scrollRef = { current: null };
                const scrollBy = (dir) => { scrollRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" }); };
                return (
                  <div className="profile-cat-scroll" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => scrollBy(-1)} aria-label={lang === "nl" ? "Vorige" : "Previous"} style={{ width: 28, height: 28, borderRadius: "50%", background: c.bgCard, border: `1px solid ${c.border}`, color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <div ref={el => scrollRef.current = el} style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 14, flex: 1, scrollbarWidth: "none", msOverflowStyle: "none" }}>
                      <button className={`profile-cat-pill ${profileCategory === "all" ? "active" : ""}`}
                        onClick={() => setProfileCategory("all")}>{t.allCategories}</button>
                      {usedCats.map(cat => (
                        <button key={cat.id} className={`profile-cat-pill ${profileCategory === cat.id ? "active" : ""}`}
                          onClick={() => setProfileCategory(cat.id)}>
                          {lang === "nl" ? (cat.name_nl || cat.name) : (cat.name_en || cat.name_nl || cat.name)}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => scrollBy(1)} aria-label={lang === "nl" ? "Volgende" : "Next"} style={{ width: 28, height: 28, borderRadius: "50%", background: c.bgCard, border: `1px solid ${c.border}`, color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  </div>
                );
              })()}

              <div className="profile-services-grid">
                {profileFilteredServices.map(s => (
                  <div key={s.id} className="profile-service-row" onClick={() => enterBooking(s)}>
                    <div className="profile-service-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                      {s.photos?.length > 0 ? <img src={s.photos[0].url || s.photos[0]} alt={svcName(s)} loading="lazy" onError={e => { e.target.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${s.photos[0].focal_x ?? 50}% ${s.photos[0].focal_y ?? 50}%`, position: "absolute", inset: 0, zIndex: 1 }} /> : null}
                      <NavIcon name="scissors" size={20} color={c.textMuted} />
                    </div>
                    <div className="profile-service-info">
                      <div className="profile-service-name">{svcName(s)}</div>
                      <div className="profile-service-meta">
                        <span className="profile-service-duration-pill">
                          <NavIcon name="clock" size={10} color={c.textSub} />
                          {svcDuration(s)}
                        </span>
                      </div>
                    </div>
                    <div className="profile-service-price">
                      {s.variants?.length > 0 ? `${t.from} €${Math.min(...s.variants.map(v => parseFloat(v.price)))}` : `€${s.price}`}
                    </div>
                    <button type="button" className="profile-service-book-btn" aria-label={`${t.book}: ${svcName(s)}`} onClick={e => { e.stopPropagation(); enterBooking(s); }}>
                      {t.book}
                    </button>
                  </div>
                ))}
              </div>
              {profileFilteredServices.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 16px", color: c.textMuted, fontSize: 13 }}>
                  {t.noTreatments}
                </div>
              )}
            </section>

            {/* TEAM / STAFF */}
            {initialSalon.staff?.length > 0 && (
              <section ref={el => profileSectionRefs.current.team = el} className="profile-section">
                <h2 className="profile-section-title">{t.profileTeam}</h2>
                {initialSalon.staff.map(member => {
                  const isExpanded = expandedTeamMember === member.id;
                  const memberServices = member.service_ids?.length > 0
                    ? initialSalon.services.filter(s => member.service_ids.includes(s.id))
                    : initialSalon.services;
                  return (
                    <div key={member.id}>
                      <div className="profile-team-row" style={{ cursor: "pointer" }} onClick={() => setExpandedTeamMember(isExpanded ? null : member.id)}>
                        {member.avatar_url ? (
                          <img src={member.avatar_url} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt={member.name} />
                        ) : (
                          <div className="profile-team-avatar">{member.name?.[0] || "?"}</div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 14, color: c.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {member.name}
                            {/* Owner tag only surfaces when the salon opted in via
                                Settings → Team. Clients otherwise see all team
                                members as equals. */}
                            {initialSalon.show_owner_on_booking && member.user_id && member.user_id === initialSalon.owner_id && (
                              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: `${accent}18`, color: accent, border: `1px solid ${accent}44`, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                                {lang === "nl" ? "Eigenaar" : "Owner"}
                              </span>
                            )}
                          </div>
                          {member.role && <div style={{ fontSize: 12, color: c.textLabel, marginTop: 2 }}>{member.role}</div>}
                        </div>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={c.textMuted} strokeWidth="1.5"
                          style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "none" }}><path d="M7 5l5 5-5 5" /></svg>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: "12px 0 16px 52px", animation: "fadeUp 0.2s ease" }}>
                          {member.bio && <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.6, marginBottom: 12 }}>{member.bio}</div>}
                          {memberServices.length > 0 && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.services}</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {memberServices.map(s => (
                                  <span key={s.id} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: `${accent}12`, color: accent, border: `1px solid ${accent}22` }}>
                                    {lang === "nl" ? s.name_nl : (s.name_en || s.name_nl)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* GALLERY */}
            {allPhotos.length > 0 && (
              <section ref={el => profileSectionRefs.current.gallery = el} className="profile-section">
                <h2 className="profile-section-title">{t.profileGallery}</h2>
                {(() => {
                  const initialCount = isMobile ? 4 : 3;
                  return (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 3}, 1fr)`, gap: 8 }}>
                        {(galleryExpanded ? allPhotos : allPhotos.slice(0, initialCount)).map((photo, idx) => (
                          <div key={photo.id || idx} className="profile-gallery-item" onClick={() => setGallery({ photos: allPhotos, idx })}>
                            <img src={photo.url || photo} loading="lazy" alt={photo.serviceName || (t.galleryPhoto)} />
                          </div>
                        ))}
                      </div>
                      {allPhotos.length > initialCount && (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                          <button className="btn-ghost" onClick={() => setGalleryExpanded(v => !v)} style={{ fontSize: 12, padding: "10px 22px" }}>
                            {galleryExpanded ? t.showLess : `${t.showMore} (${allPhotos.length - initialCount})`}
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </section>
            )}

            {/* REVIEWS */}
            {initialSalon.reviews?.length > 0 && (
              <section ref={el => profileSectionRefs.current.reviews = el} className="profile-section">
                <h2 className="profile-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {t.profileReviews}
                  <select value={reviewSort} onChange={e => setReviewSort(e.target.value)}
                    style={{ background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 8, padding: "6px 10px", color: c.textSub, fontSize: 12, fontFamily: "'Jost',sans-serif", cursor: "pointer", fontWeight: 400 }}>
                    <option value="recent">{t.sortBy}: {t.mostRecent}</option>
                    <option value="rating">{t.sortBy}: {t.highestRated}</option>
                  </select>
                </h2>
                
                {/* Rating summary — Setmore style: bars left, big score right */}
                <div className="profile-reviews-summary">
                  <div className="profile-rating-bars">
                    {ratingBreakdown.map(rb => (
                      <div key={rb.stars} className="profile-rating-bar-row">
                        <StarRow rating={rb.stars} size={12} />
                        <div className="profile-rating-bar-track">
                          <div className="profile-rating-bar-fill" style={{ width: `${initialSalon.reviews.length > 0 ? (rb.count / initialSalon.reviews.length) * 100 : 0}%` }} />
                        </div>
                        <span style={{ width: 18, textAlign: "right" }}>{rb.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="profile-rating-big">
                    <div className="profile-rating-score">{avgRating}</div>
                    <StarRow rating={Math.round(parseFloat(avgRating))} size={16} />
                    <div style={{ fontSize: 12, color: c.textLabel, marginTop: 6 }}>{initialSalon.reviews.length} {t.reviews.toLowerCase()}</div>
                    <button className="profile-write-review-btn" onClick={() => setShowReviewForm(true)}>{t.writeAReview}</button>
                  </div>
                </div>

                {/* Review list */}
                {(reviewsExpanded ? sortedReviews : sortedReviews.slice(0, 5)).map(review => (
                  <div key={review.id} className="profile-review-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: c.text }}>{review.client_name?.split(" ")[0] || "Klant"}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                          <StarRow rating={review.rating} size={12} />
                          <span style={{ fontSize: 12, color: c.textMuted }}>· {getRelativeTime(review.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    {review.comment && <p style={{ fontSize: 14, color: c.textSub, lineHeight: 1.5, marginTop: 6 }}>{review.comment}</p>}
                  </div>
                ))}
                {sortedReviews.length > 5 && (
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                    <button className="btn-ghost" onClick={() => setReviewsExpanded(v => !v)} style={{ fontSize: 12, padding: "10px 22px" }}>
                      {reviewsExpanded ? t.showLess : `${t.showMore} (${sortedReviews.length - 5})`}
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* CONTACT & ADDRESS */}
            <section ref={el => profileSectionRefs.current.contact = el} className="profile-section" style={{ borderBottom: "none" }}>
              <h2 className="profile-section-title">{t.profileContact}</h2>
              
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24, marginBottom: 20 }}>
                {/* Contact details */}
                {((initialSalon.salon_email) || initialSalon.salon_phone || initialSalon.salon_instagram) && (
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 10 }}>{t.contactUs}</h3>
                    {(initialSalon.salon_email) && (
                      <div className="profile-contact-row">
                        <NavIcon name="mail" size={14} color={c.textSub} />
                        <a href={`mailto:${initialSalon.salon_email}`}>{initialSalon.salon_email}</a>
                      </div>
                    )}
                    {initialSalon.salon_phone && (
                      <div className="profile-contact-row">
                        <NavIcon name="phone" size={14} color={c.textSub} />
                        <a href={`tel:${initialSalon.salon_phone}`} style={{ color: c.textSub, textDecoration: "none" }}>{initialSalon.salon_phone}</a>
                      </div>
                    )}
                    {initialSalon.salon_instagram && (
                      <div className="profile-contact-row">
                        <NavIcon name="camera" size={14} color={c.textSub} />
                        <a href={`https://instagram.com/${igHandle(initialSalon.salon_instagram)}`} target="_blank" rel="noopener noreferrer" style={{ color: c.textSub, textDecoration: "none" }}>
                          {initialSalon.salon_instagram.startsWith("@") ? initialSalon.salon_instagram : "@" + initialSalon.salon_instagram}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Booking policy */}
                {effectivePolicy && (
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 10 }}>{t.goodToKnow}</h3>
                    <div className="profile-contact-row" style={{ cursor: "pointer" }} onClick={() => setExpandedPolicy(!expandedPolicy)}>
                      <NavIcon name="clipboard" size={14} color={c.textSub} />
                      <span style={{ flex: 1 }}>{t.bookingPolicy}</span>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round"
                        style={{ transition: "transform 0.2s", transform: expandedPolicy ? "rotate(180deg)" : "none" }}><path d="M5 8l5 5 5-5" /></svg>
                    </div>
                    {expandedPolicy && (
                      <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.7, padding: "12px 0 4px 28px", whiteSpace: "pre-wrap" }}>
                        {effectivePolicy}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Address */}
              {hasAnyLocation ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  {(initialSalon.locations || []).map(loc => {
                    const locAddr = (loc.address || "").trim();
                    const locCity = (loc.city || "").trim();
                    const locQuery = locAddr
                      ? (locCity && !locAddr.toLowerCase().includes(locCity.toLowerCase()) ? `${locAddr}, ${locCity}` : locAddr)
                      : locCity;
                    const locMapsHref = locQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locQuery)}` : null;
                    return (
                      <div key={loc.id} style={{ padding: 16, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{loc.name}</div>
                        {loc.address && <div style={{ fontSize: 13, color: c.textSub }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}</div>}
                        {loc.phone && <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}><NavIcon name="phone" size={10} color={c.textMuted} /> {loc.phone}</div>}
                        {locQuery && (
                          <div style={{ marginTop: 12, borderRadius: 10, overflow: "hidden", border: `1px solid ${c.border}`, position: "relative" }}>
                            <iframe
                              title={`${loc.name} — map`}
                              src={`https://maps.google.com/maps?q=${encodeURIComponent(locQuery)}&t=m&z=16&hl=${lang}&output=embed`}
                              width="100%"
                              height={isMobile ? 180 : 220}
                              style={{ border: 0, display: "block", filter: theme === "dark" ? "grayscale(0.15) contrast(1.05)" : "none" }}
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                            {locMapsHref && (
                              <a href={locMapsHref} target="_blank" rel="noopener noreferrer"
                                style={{
                                  position: "absolute", top: 8, right: 8,
                                  background: c.bg, color: c.text, fontSize: 10, fontWeight: 500,
                                  padding: "5px 10px", borderRadius: 100,
                                  textDecoration: "none",
                                  border: `1px solid ${c.border}`,
                                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                                }}>
                                Maps ↗
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (initialSalon.address || initialSalon.city) ? (
                <>
                  <div style={{ fontSize: 14, color: c.textSub, lineHeight: 1.6 }}>
                    <span style={{ marginRight: 6 }}><NavIcon name="mappin" size={12} color={c.textSub} /></span>
                    {initialSalon.address && <>{initialSalon.address}, </>}{initialSalon.city}
                  </div>
                  {(() => {
                    // If the address already contains the city name, don't append it
                    // again — double "Amsterdam, Amsterdam" makes Google zoom out to
                    // the whole city instead of the exact street.
                    const addr = (initialSalon.address || "").trim();
                    const city = (initialSalon.city || "").trim();
                    const mainQuery = addr
                      ? (city && !addr.toLowerCase().includes(city.toLowerCase()) ? `${addr}, ${city}` : addr)
                      : city;
                    if (!mainQuery) return null;
                    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mainQuery)}`;
                    return (
                      <div style={{ marginTop: 14, borderRadius: 14, overflow: "hidden", border: `1px solid ${c.border}`, position: "relative" }}>
                        <iframe
                          title={`${initialSalon.name} — map`}
                          src={`https://maps.google.com/maps?q=${encodeURIComponent(mainQuery)}&t=m&z=16&hl=${lang}&output=embed`}
                          width="100%"
                          height={isMobile ? 220 : 280}
                          style={{ border: 0, display: "block", filter: theme === "dark" ? "grayscale(0.15) contrast(1.05)" : "none" }}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                        <a href={mapsHref} target="_blank" rel="noopener noreferrer"
                          style={{
                            position: "absolute", top: 10, right: 10,
                            background: c.bg, color: c.text, fontSize: 11, fontWeight: 500,
                            padding: "6px 12px", borderRadius: 100,
                            textDecoration: "none",
                            border: `1px solid ${c.border}`,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                          }}>
                          {lang === "nl" ? "Open in Maps ↗" : "Open in Maps ↗"}
                        </a>
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </section>

            {/* Powered by */}
            <div className="profile-footer">
              {t.poweredBy} <span style={{ color: accent, fontWeight: 600 }}>Vellu</span> · {t.noCommission}
              <div style={{ marginTop: 6, fontSize: 10, opacity: 0.6 }}>
                <a href="/privacy" style={{ color: "inherit", textDecoration: "none", borderBottom: "1px solid currentColor" }}>{lang === "nl" ? "Privacy" : "Privacy"}</a>
                {" · "}
                <a href="/terms" style={{ color: "inherit", textDecoration: "none", borderBottom: "1px solid currentColor" }}>{t.terms}</a>
              </div>
            </div>
          </div>

          {/* ─── SIDEBAR (desktop only via CSS) ─── */}
          <div className="profile-sidebar">
            <div className="profile-sidebar-inner">
              {/* Circular logo */}
              {initialSalon.logo_url ? (
                <img src={initialSalon.logo_url} className="profile-sidebar-logo" alt={`${initialSalon.name} logo`} />
              ) : (
                <div className="profile-sidebar-logo-placeholder">{initialSalon.name?.[0] || "S"}</div>
              )}
              
              <div className="profile-sidebar-name">{initialSalon.name}</div>
              
              {avgRating && (
                <div className="profile-sidebar-rating">
                  <span style={{ fontWeight: 600, color: c.text }}>{avgRating}</span>
                  <StarRow rating={Math.round(parseFloat(avgRating))} size={13} />
                  <span>{initialSalon.reviews.length} {t.reviews.toLowerCase()}</span>
                </div>
              )}

              <button className="profile-book-btn" onClick={() => enterBooking()}>{t.book}</button>

              {/* Next availability hint */}
              {(() => {
                // Find next day with open hours (today or future)
                const now = new Date();
                for (let offset = 0; offset < 14; offset++) {
                  const checkDate = new Date(now);
                  checkDate.setDate(now.getDate() + offset);
                  const dayIdx = checkDate.getDay();
                  const dayHrs = getWeeklyHours(dayIdx) || { closed: true };
                  const override = initialSalon.day_overrides?.[fmt(checkDate)];
                  if (override?.type === "blocked") continue;
                  const hrs = override?.type === "exception" ? { open: override.open, close: override.close, closed: false } : dayHrs;
                  if (hrs.closed) continue;
                  // Respect the booking window: with e.g. a 24h minimum advance,
                  // "Vandaag beschikbaar" would promise a day the client can't
                  // actually book. Skip days that fall before now + min advance
                  // (a day only counts when a slot can still START before close).
                  if (minAdvanceHours > 0) {
                    const [ch, cm] = String(hrs.close || "0:0").split(":").map(Number);
                    const dayClose = new Date(checkDate);
                    dayClose.setHours(ch || 0, cm || 0, 0, 0);
                    if (new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000) >= dayClose) continue;
                  }
                  // Found an open day
                  const isToday = offset === 0;
                  const isTomorrow = offset === 1;
                  const dayLabel = isToday ? (lang === "nl" ? "Vandaag" : "Today") : isTomorrow ? (lang === "nl" ? "Morgen" : "Tomorrow") : checkDate.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "short" });
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 12, padding: "10px 14px", background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 12 }}>
                      <NavIcon name="calendar" size={13} color={accent} />
                      <div style={{ fontSize: 12, color: c.text }}>
                        <span style={{ fontWeight: 600, color: accent }}>{dayLabel}</span>
                        <span style={{ color: c.textSub }}> {lang === "nl" ? "beschikbaar" : "available"} · {hrs.open} – {hrs.close}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Open/Closed status + hours — always show today, expand for full week */}
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
                <div className="profile-sidebar-status" style={{ cursor: "pointer", justifyContent: "flex-start", marginTop: 0 }} onClick={() => setExpandedHours(!expandedHours)}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: salonIsOpen ? c.success : c.danger, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{salonStatusLabel}</span>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round"
                    style={{ transition: "transform 0.2s", transform: expandedHours ? "rotate(180deg)" : "none" }}><path d="M5 8l5 5 5-5" /></svg>
                </div>
                {/* Always show today's hours */}
                {(() => {
                  const todayHrs = getWeeklyHours(todayDayIndex) || { closed: true };
                  return (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 2px", fontSize: 12 }}>
                      <span style={{ color: c.text, fontWeight: 600 }}>{FULL_DAYS[todayDayIndex]}</span>
                      <span style={{ color: todayHrs.closed ? c.textMuted : accent, fontWeight: 600 }}>{todayHrs.closed ? t.closed : `${todayHrs.open} – ${todayHrs.close}`}</span>
                    </div>
                  );
                })()}
                {expandedHours && (
                  <div style={{ paddingTop: 4 }}>
                    {[1,2,3,4,5,6,0].filter(d => d !== todayDayIndex).map(dayIdx => {
                      const dayHrs = getWeeklyHours(dayIdx) || { closed: true };
                      return (
                        <div key={dayIdx} className="profile-hours-row">
                          <span style={{ color: c.textLabel }}>{FULL_DAYS[dayIdx]}</span>
                          <span style={{ color: dayHrs.closed ? c.textMuted : c.textSub }}>{dayHrs.closed ? t.closed : `${dayHrs.open} – ${dayHrs.close}`}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Address */}
              {(initialSalon.address || initialSalon.city) && (
                <div className="profile-sidebar-address">
                  <NavIcon name="mappin" size={11} color={c.textSub} /> {initialSalon.address && <>{initialSalon.address}<br /></>}{initialSalon.city}
                </div>
              )}

              {/* Contact us */}
              {((initialSalon.salon_email) || initialSalon.salon_phone || initialSalon.salon_instagram) && (
                <div style={{ marginTop: 4 }}>
                  <div className="profile-sidebar-contact-toggle" onClick={() => scrollToProfileSection("contact")}>
                    {t.contactUs} ↓
                  </div>
                  <div style={{ padding: "0 0 4px", fontSize: 12 }}>
                    {initialSalon.salon_phone && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: c.textSub }}>
                        <NavIcon name="phone" size={13} color={c.textSub} />
                        <a href={`tel:${initialSalon.salon_phone}`} style={{ color: c.textSub, textDecoration: "none" }}>{initialSalon.salon_phone}</a>
                      </div>
                    )}
                    {(initialSalon.salon_email) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: c.textSub }}>
                        <NavIcon name="mail" size={13} color={c.textSub} />
                        <a href={`mailto:${initialSalon.salon_email}`} style={{ color: c.textSub, textDecoration: "none", fontSize: 11 }}>{initialSalon.salon_email}</a>
                      </div>
                    )}
                    {initialSalon.salon_instagram && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: c.textSub }}>
                        <NavIcon name="camera" size={13} color={c.textSub} />
                        <a href={`https://instagram.com/${igHandle(initialSalon.salon_instagram)}`} target="_blank" rel="noopener noreferrer" style={{ color: c.textSub, textDecoration: "none" }}>
                          {initialSalon.salon_instagram.startsWith("@") ? initialSalon.salon_instagram : "@" + initialSalon.salon_instagram}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </div> {/* close profile-scroll-area */}

        {/* ═══ MOBILE FLOATING BOEKEN PILL — same pattern as settings save pill ═══ */}
        {createPortal(
          <div className="profile-mobile-pill-wrap">
            <button className="profile-mobile-pill" onClick={() => enterBooking()}>{t.book}</button>
          </div>,
          document.body
        )}

        {/* Gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)} onKeyDown={e => e.key === "Escape" && setGallery(null)}>
            <button onClick={() => setGallery(null)} aria-label={t.close} style={{ position: "absolute", top: 20, right: 20, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: "50%", fontSize: 20, cursor: "pointer", zIndex: 10 }}>&times;</button>
            <img src={gallery.photos[gallery.idx]?.url || gallery.photos[gallery.idx]} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} alt={t.galleryPhoto} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {gallery.photos.map((p, i) => (
                <img key={p.id || i} src={p.url || p} onClick={e => { e.stopPropagation(); setGallery(g => ({...g, idx: i})); }}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `2px solid ${i === gallery.idx ? accent : "transparent"}`, opacity: i === gallery.idx ? 1 : 0.5 }} loading="lazy" alt="" />
              ))}
            </div>
          </div>
        )}

        {/* Review overlay */}
        {showReviewForm && (
          <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(12px)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowReviewForm(false)}>
            <div style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 24, padding: 28, maxWidth: 420, width: "100%" }} onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⭐</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 300 }}>
                  {t.howWasAppt}
                </div>
              </div>
              <ReviewForm salon={initialSalon} clientName="" clientEmail={reviewEmail} lang={lang} t={t} accent={accent} />
              <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={() => setShowReviewForm(false)}>
                {t.close}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
  // ─── END PROFILE VIEW ──────────────────────────────────────

  // Step titles
  const stepTitles = hasLocations 
    ? [t.selectLocation, t.selectService, t.selectDate, t.yourDetails, t.confirmBooking]
    : [t.selectService, t.selectDate, t.yourDetails, t.confirmBooking];

  // Summary component
  const Summary = () => (
    <div style={{ 
      background: c.bgCard, 
      border: "1px solid " + c.border, 
      borderRadius: 16, 
      padding: 20,
      marginTop: isMobile ? 0 : 20
    }}>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 12 }}>
        {t.yourBooking}
        {selectedServices.length > 0 && <span style={{ color: accent, marginLeft: 6 }}>({selectedServices.length})</span>}
      </div>
      {selectedLocation && (
        <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid " + c.border }}>
          <div style={{ fontSize: 11, color: c.textSub }}><NavIcon name="mappin" size={11} color={c.textSub} /> {selectedLocation.name}</div>
          {selectedLocation.address && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{selectedLocation.address}</div>}
        </div>
      )}
      {selectedServices.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {selectedServices.map((item, idx) => (
            <div key={item.service.id} style={{ marginBottom: idx < selectedServices.length - 1 ? 10 : 0, paddingBottom: idx < selectedServices.length - 1 ? 10 : 0, borderBottom: idx < selectedServices.length - 1 ? "1px solid " + c.border : "none" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
                {svcName(item.service)}
                {item.variant && <span style={{ fontWeight: 400, color: c.textSub }}> — {lang === "nl" ? item.variant.name_nl : (item.variant.name_en || item.variant.name_nl)}</span>}
              </div>
              <div style={{ fontSize: 11, color: c.textLabel, marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                <span>{itemBaseDuration(item)} {t.min}{item.staff ? ` · ${item.staff.name}` : ""}</span>
                <span style={{ color: accent }}>{(item.service.variants || []).length > 0 && !item.variant ? (lang === "nl" ? "vanaf " : "from ") : ""}€{(itemBasePrice(item) + item.extras.reduce((s, e) => s + parseFloat(e.price || 0), 0)).toFixed(2)}</span>
              </div>
              {item.extras.length > 0 && item.extras.map(e => (
                <div key={e.id} style={{ fontSize: 10, color: c.textLabel, display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span>+ {lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)}</span>
                  <span>+€{e.price}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {date && time && (
        <div style={{ marginBottom: 16, paddingTop: selectedServices.length > 0 ? 16 : 0, borderTop: selectedServices.length > 0 ? "1px solid " + c.border : "none" }}>
          <div style={{ fontSize: 12, color: c.textSub }}>
            {parseDate(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: accent, marginTop: 4 }}>{time}</div>
          {selectedServices.length > 0 && <div style={{ fontSize: 11, color: c.textLabel, marginTop: 4 }}>{t.totalDuration}: {getDuration()} {t.min}</div>}
        </div>
      )}
      {selectedServices.length > 0 && (
        <div style={{ paddingTop: 16, borderTop: "1px solid " + c.border }}>
          {appliedDiscount && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#4ade80" }}>
                <NavIcon name="tag" size={11} color={accent} /> {appliedDiscount.code} ({appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`})
              </span>
              <span style={{ fontSize: 12, color: c.textLabel, textDecoration: "line-through" }}>€{getOriginalPrice().toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: c.textSub }}>{t.total}</span>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, color: accent }}>{fromPrefix}€{getPrice().toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Layout accent={accent}>

      <div style={{
        minHeight: "100dvh", 
        background: c.bg,
        backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -10%, ${accent}08 0%, transparent 60%)`,
        fontFamily: "'Jost',sans-serif", 
        color: c.text
      }}>
        
        {/* Desktop Layout */}
        {!isMobile ? (
          <div style={{ display: "flex", minHeight: "100dvh" }}>
            {/* Left Sidebar */}
            <div style={{ 
              width: 340, 
              background: c.bgCard, 
              borderRight: "1px solid " + c.border,
              padding: "0",
              display: "flex",
              flexDirection: "column",
              position: "sticky",
              top: 0,
              height: "100dvh",
              overflow: "hidden"
            }}>
              {/* Cover Image */}
              {initialSalon.cover_image_url && (
                <div style={{ 
                  width: "100%", 
                  height: 120, 
                  backgroundImage: `url(${initialSalon.cover_image_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: `center ${initialSalon.cover_focal_y ?? 50}%`,
                  flexShrink: 0
                }} />
              )}
              
              <div style={{ padding: "24px 30px", flex: 1, overflow: "auto" }}>
                {/* Salon Info */}
                <div style={{ marginBottom: 30 }}>
                  <button onClick={done ? reset : () => setMode("profile")} className="btn-ghost" style={{ marginBottom: 20, padding: "8px 14px", fontSize: 11 }}>
                      {t.backToProfile}
                    </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {initialSalon.logo_url && (
                      <img src={initialSalon.logo_url} style={{ width: 50, height: 50, borderRadius: 12, objectFit: "cover", border: "1px solid " + c.inputBorder }} />
                    )}
                    <div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: initialSalon.logo_url ? 22 : 28, fontWeight: 300, color: c.text, lineHeight: 1.2 }}>
                        {initialSalon.name}
                      </div>
                      <div style={{ fontSize: 12, color: c.textLabel, marginTop: 4, letterSpacing: "0.04em" }}>
                        {initialSalon.city}
                      </div>
                    </div>
                  </div>
                </div>

              {/* Progress Steps */}
              {!done && (
                <div style={{ marginBottom: 30 }}>
                  {(hasLocations ? [0,1,2,3,4] : [1,2,3,4]).map((s, idx) => (
                    <div key={s} style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 12, 
                      padding: "12px 0",
                      opacity: step >= s ? 1 : 0.3,
                      transition: "opacity 0.3s"
                    }}>
                      <div style={{ 
                        width: 28, 
                        height: 28, 
                        borderRadius: "50%", 
                        background: step >= s ? accent : "transparent",
                        border: `2px solid ${step >= s ? accent : c.textMuted}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                        color: step >= s ? c.btnOnDark : c.textLabel,
                        transition: "all 0.3s"
                      }}>
                        {step > s ? <NavIcon name="check" size={12} color={accent} /> : (hasLocations ? s : s)}
                      </div>
                      <span style={{ fontSize: 13, color: step >= s ? c.text : c.textLabel }}>
                        {stepTitles[idx]}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              <Summary />

              {/* Lang Toggle */}
              <div style={{ marginTop: "auto", paddingTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <ThemeToggle />
                <LangToggle lang={lang} setLang={setLang} />
              </div>
              </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, height: "100dvh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "50px 60px 24px", maxWidth: 700, margin: "0 auto", width: "100%" }}>
              {!done ? (
                <div key={step} className="fade-up">

              {/* Step 0 — Location selection (desktop, only if multiple) */}
              {step === 0 && hasLocations && <>
                <PTitle sub={t.selectLocationSub}>{t.selectLocation}</PTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {(initialSalon.locations || []).map(loc => (
                    <div key={loc.id} className={`service-card ${selectedLocation?.id === loc.id ? "sel" : ""}`} onClick={() => { setSelectedLocation(loc); setDate(fmt(getToday())); setTime(null); }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{loc.name}</div>
                      {loc.address && <div style={{ fontSize: 11, color: c.textLabel }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}</div>}
                      {loc.phone && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}><NavIcon name="phone" size={10} color={c.textMuted} /> {loc.phone}</div>}
                    </div>
                  ))}
                </div>
                <button className="btn-primary" disabled={!selectedLocation} onClick={() => setStep(1)} style={{ marginTop: 20 }}>{t.next}</button>
              </>}

              {/* Step 1 — Service selection (multi-select) */}
              {step === 1 && <>
                <PTitle sub={t.selectServiceSub}>{t.selectService}</PTitle>
                
                {/* Category tabs — scrollable with arrows for long lists */}
                {(() => {
                  const usedCats = categories.filter(cat => initialSalon.services.some(s => s.category_id === cat.id));
                  if (usedCats.length === 0) return null;
                  const scrollRef = { current: null };
                  const scrollBy = (dir) => { scrollRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" }); };
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <button onClick={() => scrollBy(-1)} aria-label={lang === "nl" ? "Vorige" : "Previous"} style={{ width: 28, height: 28, borderRadius: "50%", background: c.bgCard, border: `1px solid ${c.border}`, color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <div ref={el => scrollRef.current = el} style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, flex: 1, scrollbarWidth: "none", msOverflowStyle: "none" }}>
                        <div
                          onClick={() => setActiveCategory("all")}
                          style={{
                            padding: "8px 16px", borderRadius: 100, cursor: "pointer", flexShrink: 0,
                            background: activeCategory === "all" ? accent : c.inputBg,
                            border: `1px solid ${activeCategory === "all" ? accent : c.inputBorder}`,
                            color: activeCategory === "all" ? c.btnOnDark : c.textSub,
                            fontSize: 12, fontWeight: 500, transition: "all 0.2s"
                          }}
                        >{t.allCategories}</div>
                        {usedCats.map(cat => (
                          <div
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            style={{
                              padding: "8px 16px", borderRadius: 100, cursor: "pointer", flexShrink: 0,
                              background: activeCategory === cat.id ? accent : c.inputBg,
                              border: `1px solid ${activeCategory === cat.id ? accent : c.inputBorder}`,
                              color: activeCategory === cat.id ? c.btnOnDark : c.textSub,
                              fontSize: 12, fontWeight: 500, transition: "all 0.2s"
                            }}
                          >{lang === "nl" ? (cat.name_nl || cat.name) : (cat.name_en || cat.name_nl || cat.name)}</div>
                        ))}
                      </div>
                      <button onClick={() => scrollBy(1)} aria-label={lang === "nl" ? "Volgende" : "Next"} style={{ width: 28, height: 28, borderRadius: "50%", background: c.bgCard, border: `1px solid ${c.border}`, color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                    </div>
                  );
                })()}

                {/* Selected services counter */}
                {selectedServices.length > 0 && (
                  <div style={{ background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 14, padding: "10px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: accent, fontWeight: 500 }}>
                      <NavIcon name="check" size={11} color={c.btnOnDark} /> {selectedServices.length} {selectedServices.length === 1 ? t.serviceSelected : t.servicesSelected}
                    </span>
                    <span style={{ fontSize: 12, color: c.textSub }}>{getDuration()} {t.min} · {fromPrefix}€{getOriginalPrice().toFixed(2)}</span>
                  </div>
                )}

                {filteredServices.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: c.textMuted }}>
                    <div style={{ marginBottom: 12 }}><NavIcon name="beauty" size={36} color={ACCENT} /></div>
                    <div style={{ fontSize: 13 }}>{activeCategory !== "all" ? (lang === "nl" ? "Geen behandelingen in deze categorie" : "No treatments in this category") : (lang === "nl" ? "Nog geen behandelingen beschikbaar" : "No treatments available yet")}</div>
                  </div>
                )}
                {filteredServices.map(s => {
                  const isSel = isServiceSelected(s.id);
                  const item = getServiceItem(s.id);
                  const staffForService = getStaffForService(s.id);
                  const heroThumb = s.photos?.[0]?.url || s.photos?.[0];
                  const displayPrice = s.variants?.length > 0 ? `${t.from} €${Math.min(...s.variants.map(v => parseFloat(v.price)))}` : `€${s.price}`;
                  return (
                  <div key={s.id} style={{ marginBottom: 8 }}>
                    {/* Service card — clean, thumbnail-based */}
                    <div
                      role="checkbox" tabIndex={0} aria-checked={isSel}
                      onClick={() => toggleServiceSelection(s)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleServiceSelection(s); } }}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "14px 16px",
                        background: isSel ? `${accent}10` : c.bgCard,
                        border: `1.5px solid ${isSel ? accent : c.border}`,
                        borderRadius: 16, cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      {/* Thumbnail or placeholder */}
                      <div style={{ width: 52, height: 52, borderRadius: 12, background: c.inputBg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}
                        onClick={e => { if (heroThumb && s.photos?.length > 0) { e.stopPropagation(); setGallery({ photos: s.photos, idx: 0 }); } }}>
                        {heroThumb ? <img src={heroThumb} alt="" loading="lazy" onError={e => { e.target.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${s.photos?.[0]?.focal_x ?? 50}% ${s.photos?.[0]?.focal_y ?? 50}%`, position: "absolute", inset: 0, zIndex: 1 }} /> : null}
                        {!heroThumb && <NavIcon name="scissors" size={18} color={c.textMuted} />}
                      </div>
                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 14, color: c.text, marginBottom: 4 }}>{svcName(s)}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: c.textLabel, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <NavIcon name="clock" size={10} color={c.textLabel} /> {svcDuration(s)}
                          </span>
                          {s.variants?.length > 0 && <span style={{ fontSize: 10, color: c.textMuted }}>{s.variants.length} {s.variants.length === 1 ? "variant" : t.variants?.toLowerCase()}</span>}
                          {s.photos?.length > 1 && <span style={{ fontSize: 10, color: c.textMuted }}>{s.photos.length} {t.photos?.toLowerCase()}</span>}
                        </div>
                      </div>
                      {/* Price */}
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: c.text, flexShrink: 0, lineHeight: 1 }}>
                        {displayPrice}
                      </div>
                      {/* Selection indicator */}
                      <div style={{
                        width: 26, height: 26, borderRadius: 8,
                        border: `2px solid ${isSel ? accent : c.inputBorder}`,
                        background: isSel ? accent : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s", flexShrink: 0
                      }}>
                        {isSel && <NavIcon name="check" size={14} color={c.btnOnDark} />}
                      </div>
                    </div>

                    {/* Expanded options — variants, extras, staff (contained within card) */}
                    {isSel && (s.variants?.length > 0 || s.extras?.length > 0 || staffForService.length > 0) && (
                      <div className="fade-up" style={{
                        marginTop: -8, marginLeft: 20, marginRight: 20, marginBottom: 4,
                        padding: "16px 18px",
                        background: c.bgCard,
                        border: `1px solid ${accent}30`,
                        borderTop: "none",
                        borderRadius: "0 0 14px 14px",
                      }}>
                        {/* Variants */}
                        {s.variants?.length > 0 && (
                          <div style={{ marginBottom: s.extras?.length > 0 || staffForService.length > 0 ? 14 : 0 }}>
                            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8, fontWeight: 600 }}>{t.selectVariant}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {s.variants.map(v => (
                                <div key={v.id} onClick={() => updateServiceItem(s.id, { variant: v })}
                                  style={{
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                                    background: item?.variant?.id === v.id ? `${accent}14` : "transparent",
                                    border: `1px solid ${item?.variant?.id === v.id ? accent : c.border}`,
                                    transition: "all 0.15s"
                                  }}>
                                  <div>
                                    <div style={{ fontWeight: 500, fontSize: 13, color: c.text }}>{lang === "nl" ? v.name_nl : (v.name_en || v.name_nl)}</div>
                                    {v.description_nl && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{lang === "nl" ? v.description_nl : (v.description_en || v.description_nl)}</div>}
                                    <div style={{ fontSize: 10, color: c.textLabel, marginTop: 2 }}>{v.duration} {t.min}</div>
                                  </div>
                                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: c.text }}>€{v.price}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Extras */}
                        {s.extras?.length > 0 && (
                          <div style={{ marginBottom: staffForService.length > 0 ? 14 : 0 }}>
                            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8, fontWeight: 600 }}>{t.selectExtras}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {s.extras.map(e => {
                                const extraSel = item?.extras?.find(x => x.id === e.id);
                                return (
                                  <div key={e.id} onClick={() => toggleExtraForService(s.id, e)}
                                    style={{
                                      padding: "8px 14px", borderRadius: 100, cursor: "pointer",
                                      background: extraSel ? `${accent}14` : "transparent",
                                      border: `1px solid ${extraSel ? accent : c.border}`,
                                      fontSize: 12, fontWeight: 500, color: extraSel ? accent : c.textSub,
                                      transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: 6
                                    }}>
                                    <span>+ {lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)}</span>
                                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: accent }}>+€{e.price}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Staff */}
                        {staffForService.length > 0 && (
                          <div>
                            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8, fontWeight: 600 }}>
                              {t.selectStaff}{requireStaffPick && <span style={{ color: c.danger, marginLeft: 4 }}>*</span>}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {/* "Geen voorkeur" is hidden for team accounts with
                                  2+ staff — the booking has to be attributable
                                  to a specific stylist for their own agenda. */}
                              {!requireStaffPick && (
                                <div onClick={() => updateServiceItem(s.id, { staff: null })}
                                  style={{
                                    padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                                    background: !item?.staff ? `${accent}14` : "transparent",
                                    border: `1px solid ${!item?.staff ? accent : c.border}`,
                                    fontSize: 12, fontWeight: 500, color: !item?.staff ? accent : c.textSub,
                                    transition: "all 0.15s"
                                  }}>{t.anyStaff}</div>
                              )}
                              {staffForService.map(m => (
                                <div key={m.id} onClick={() => updateServiceItem(s.id, { staff: m })}
                                  style={{
                                    padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                                    background: item?.staff?.id === m.id ? `${accent}14` : "transparent",
                                    border: `1px solid ${item?.staff?.id === m.id ? accent : c.border}`,
                                    transition: "all 0.15s", textAlign: "center"
                                  }}>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: item?.staff?.id === m.id ? accent : c.text }}>{m.name}</div>
                                  {m.role && <div style={{ fontSize: 10, color: c.textLabel }}>{m.role}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}

                {/* Reviews */}
                {initialSalon.reviews?.length > 0 && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid " + c.border }}>
                    <SL>{t.reviews} ({initialSalon.reviews.length}) · {(initialSalon.reviews.reduce((s,r) => s + r.rating, 0) / initialSalon.reviews.length).toFixed(1)} ★</SL>
                    {initialSalon.reviews.slice(0, 3).map(r => (
                      <div key={r.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid " + c.border }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontWeight: 500, fontSize: 12 }}>{r.client_name?.split(" ")[0] || (t.client)}</span>
                          <span style={{ color: accent, fontSize: 12 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                        </div>
                        {r.comment && <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.5 }}>{r.comment}</div>}
                      </div>
                    ))}
                  </div>
                )}

              </>}

              {/* Step 2 — Date & Time */}
              {step === 2 && <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={goBack} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.text, lineHeight: 1.2 }}>{t.selectDate}</div>
                    <div style={{ fontSize: 12, color: c.textLabel, marginTop: 2 }}>{t.selectDateSub}</div>
                  </div>
                </div>

                {/* Date picker — scrollable with arrows outside */}
                {(() => {
                  const scrollRef = { current: null };
                  const scrollBy = (dir) => { scrollRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" }); };
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                      <button onClick={() => scrollBy(-1)} style={{ width: 32, height: 32, borderRadius: "50%", background: c.bgCard, border: `1px solid ${c.border}`, color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <div ref={el => scrollRef.current = el} style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, scrollbarWidth: "none", msOverflowStyle: "none", paddingBottom: 4 }}>
                        {days.map((d, i) => {
                          const ds = fmt(d);
                          const isSel = date === ds;
                          const dayHours = getEffectiveHours(ds);
                          const staffWindow = getStaffTimeWindow(ds);
                          const isClosed = dayHours.closed || staffWindow?.closed || !isDayInBookingWindow(ds);
                          // Fully booked: salon is open but no free slot. Greyed like a
                          // closed day, but still tappable so the customer can select it
                          // and join the waitlist for that specific day.
                          const isFull = !isClosed && dayAvailability[ds] === "full";
                          const isToday = ds === fmt(getToday());
                          return (
                            <div key={i} role="button" tabIndex={isClosed ? -1 : 0}
                              aria-label={`${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}${isClosed ? ` (${lang === "nl" ? "gesloten" : "closed"})` : isFull ? ` (${lang === "nl" ? "volgeboekt" : "fully booked"})` : ""}`}
                              aria-disabled={isClosed}
                              onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !isClosed) { e.preventDefault(); setDate(ds); setTime(null); } }}
                              onClick={() => { if (!isClosed) { setDate(ds); setTime(null); } }}
                              style={{
                                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                                padding: "10px 14px", borderRadius: 12, cursor: isClosed ? "not-allowed" : "pointer",
                                background: isSel ? accent : c.bgCard,
                                border: `1.5px solid ${isSel ? accent : isToday ? `${accent}55` : c.border}`,
                                opacity: isClosed ? 0.3 : isFull ? 0.5 : 1,
                                transition: "all 0.2s", flexShrink: 0, minWidth: 52, position: "relative"
                              }}>
                              {isToday && !isSel && <div style={{ position: "absolute", top: 5, right: 5, width: 4, height: 4, borderRadius: "50%", background: accent }} />}
                              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: isSel ? c.btnOnDark : c.textLabel }}>{DAY[d.getDay()]}</span>
                              <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 400, color: isSel ? c.btnOnDark : c.text, lineHeight: 1 }}>{d.getDate()}</span>
                              {!isClosed && !isFull && (
                                <span style={{ fontSize: 8, color: isSel ? `${c.btnOnDark}bb` : c.textMuted, fontWeight: 500, marginTop: 1 }}>
                                  {dayHours.open?.slice(0,5)}–{dayHours.close?.slice(0,5)}
                                </span>
                              )}
                              {isFull && <span style={{ fontSize: 8, color: isSel ? `${c.btnOnDark}cc` : c.danger, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 1 }}>{lang === "nl" ? "vol" : "full"}</span>}
                              {isClosed && <span style={{ fontSize: 8, color: c.textMuted }}>—</span>}
                            </div>
                          );
                        })}
                      </div>
                      <button onClick={() => scrollBy(1)} style={{ width: 32, height: 32, borderRadius: "50%", background: c.bgCard, border: `1px solid ${c.border}`, color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                    </div>
                  );
                })()}

                {/* Time slots — grouped by period */}
                {(() => {
                  // Wait for bookedSlots to load before showing slots, otherwise a fast
                  // user can tap a slot that's about to be greyed out and get a 409 later.
                  if (slotsLoading) return (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: c.textLabel }}>
                      <div style={{ width: 28, height: 28, margin: "0 auto 12px", border: `2px solid ${c.border}`, borderTopColor: accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      <div style={{ fontSize: 12 }}>{lang === "nl" ? "Beschikbaarheid laden..." : "Loading availability..."}</div>
                    </div>
                  );
                  const availableTimes = getAvailableTimes(date);
                  const totalSlots = availableTimes.length;
                  const bookedCount = availableTimes.filter(tt => isTimeSlotBooked(tt)).length;
                  const freeCount = totalSlots - bookedCount;

                  if (totalSlots === 0) return (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: c.textLabel }}>
                      <div style={{ marginBottom: 8, opacity: 0.4 }}><NavIcon name="clock" size={28} color={c.textMuted} /></div>
                      <div style={{ fontSize: 13, marginBottom: 16 }}>{t.noTimesAvailable}</div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <FirstAvailableHint />
                        {initialSalon.waitlist_enabled !== false && (
                          <button type="button" onClick={() => setWaitlistOpen(true)} style={{ background: "transparent", border: `1px solid ${accent}`, color: accent, borderRadius: 999, padding: "8px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>{t.joinWaitlist}</button>
                        )}
                      </div>
                    </div>
                  );
                  if (freeCount === 0) return (
                    <div style={{ textAlign: "center", padding: "40px 20px" }}>
                      <div style={{ marginBottom: 10, opacity: 0.4 }}><NavIcon name="calendar" size={28} color={c.textMuted} /></div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>{lang === "nl" ? "Volgeboekt" : "Fully booked"}</div>
                      <div style={{ fontSize: 12, color: c.textLabel, lineHeight: 1.5, marginBottom: 16 }}>
                        {lang === "nl"
                          ? `Alle ${totalSlots} tijdslots op deze dag zijn geboekt.`
                          : `All ${totalSlots} time slots on this day are booked.`}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <FirstAvailableHint />
                        {initialSalon.waitlist_enabled !== false && (
                          <button type="button" onClick={() => setWaitlistOpen(true)} style={{ background: "transparent", border: `1px solid ${accent}`, color: accent, borderRadius: 999, padding: "8px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>{t.joinWaitlist}</button>
                        )}
                      </div>
                    </div>
                  );
                  // Group into morning / afternoon / evening
                  const morning = availableTimes.filter(tt => { const h = parseInt(tt); return h < 12; });
                  const afternoon = availableTimes.filter(tt => { const h = parseInt(tt); return h >= 12 && h < 17; });
                  const evening = availableTimes.filter(tt => { const h = parseInt(tt); return h >= 17; });
                  const groups = [
                    { label: lang === "nl" ? "Ochtend" : "Morning", icon: "sun", times: morning },
                    { label: lang === "nl" ? "Middag" : "Afternoon", icon: "clock", times: afternoon },
                    { label: lang === "nl" ? "Avond" : "Evening", icon: "moon", times: evening },
                  ].filter(g => g.times.some(tt => !isTimeSlotBooked(tt)));

                  return (
                    <div style={{ marginBottom: 20 }}>
                      {groups.map(group => (
                        <div key={group.label} style={{ marginBottom: 20 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <NavIcon name={group.icon} size={14} color={c.textLabel} />
                            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel }}>{group.label}</span>
                            <span style={{ fontSize: 10, color: accent }}>({group.times.filter(tt => !isTimeSlotBooked(tt)).length})</span>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {group.times.map(tt => {
                              // Don't render any slot until bookedSlots has loaded — otherwise
                              // a fast user could tap a slot that will be greyed-out once the
                              // fetch returns, and the server would then reject with slot_conflict.
                              if (slotsLoading) return null;
                              const booked = isTimeSlotBooked(tt);
                              if (booked) return null; // Hide booked slots entirely
                              const isSel = time === tt;
                              return (
                                <div key={tt} role="button" tabIndex={0}
                                  onClick={() => setTime(tt)}
                                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTime(tt); } }}
                                  style={{
                                    padding: "10px 20px", borderRadius: 10, cursor: "pointer",
                                    background: isSel ? accent : c.bgCard,
                                    border: `1.5px solid ${isSel ? accent : c.border}`,
                                    color: isSel ? c.btnOnDark : c.text,
                                    fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums",
                                    transition: "all 0.15s",
                                  }}
                                >{tt}</div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

              </>}

              {/* Step 3 — Details */}
              {step === 3 && <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={goBack} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.text, lineHeight: 1.2 }}>{t.yourDetails}</div>
                    <div style={{ fontSize: 12, color: c.textLabel, marginTop: 2 }}>{t.yourDetailsSub}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  {/* Honeypot — invisible to real users, bots fill it. Offscreen
                      positioning beats display:none (savvier bots skip hidden
                      inputs). tabIndex=-1 keeps keyboard users out. */}
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    value={form.website}
                    onChange={e => setForm(f => ({...f, website: e.target.value}))}
                    style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                  />
                  {/* Email first for client lookup */}
                  <input className="input-field" placeholder={t.email} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
                  
                  {/* Client found indicator */}
                  {clientFound && (
                    <div style={{ background: `${accent}12`, border: `1px solid ${accent}30`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <NavIcon name="wave" size={18} color={accent} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: accent }}>{t.welcomeBackClient}!</div>
                        <div style={{ fontSize: 10, color: c.textSub }}>{t.foundYourDetails}</div>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input className="input-field" type="text" autoComplete="given-name" placeholder={t.firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                    <input className="input-field" type="text" autoComplete="family-name" placeholder={t.lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                  </div>
                  <input className="input-field" placeholder={`${t.phone}${initialSalon.phone_required ? ` (${t.required})` : ` (${t.optional})`}`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={initialSalon.phone_required && !form.phone ? { borderColor: "rgba(248,113,113,0.3)" } : {}} />
                  <input className="input-field" placeholder={`${t.allergies} (${t.allergiesOptional})`} value={form.allergies} onChange={e => setForm(f => ({...f, allergies: e.target.value}))} />
                  <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, lineHeight: 1.5 }}>{t.allergyDisclaimer}</div>
                </div>
                
                {/* No-show warning */}
                {clientNoShows > 0 && (
                  <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <NavIcon name="alerttri" size={16} color="#fb923c" />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#f87171" }}>{t.noShowWarning}</div>
                      <div style={{ fontSize: 10, color: "rgba(248,113,113,0.6)" }}>{clientNoShows}x {t.noShowCount}</div>
                    </div>
                  </div>
                )}

                <SL>{t.payMethod}</SL>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {[["on-arrival","home",t.payArrival], ...(initialSalon.payment_configured ? [["online","creditcard",t.payOnline]] : [])].map(([v,icon,label]) => (
                    <div key={v} className={`pay-opt ${form.payment === v ? "sel" : ""}`} role="radio" tabIndex={0} aria-checked={form.payment === v} onClick={() => setForm(f => ({...f, payment: v}))} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setForm(f => ({...f, payment: v})); } }}>
                      <div className={`radio ${form.payment === v ? "on" : ""}`} />
                      <NavIcon name={icon} size={15} color={c.textSub} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Discount Code Input */}
                {activeCodes.length > 0 && !appliedDiscount && (
                  <div style={{ marginBottom: 20 }}>
                    <SL>{t.enterDiscountCode}</SL>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="input-field" placeholder={t.discountCode} value={discountCode} onChange={e => handleDiscountInput(e.target.value)} style={{ flex: 1, fontFamily: "monospace" }} />
                      <button className="btn-ghost" style={{ padding: "0 20px" }} onClick={() => applyDiscountCode()}>{t.applyCode}</button>
                    </div>
                    {discountError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{discountError}</div>}
                  </div>
                )}
                {appliedDiscount && (
                  <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 500 }}><NavIcon name="tag" size={12} color="#4ade80" /> {t.codeApplied}</div>
                      <div style={{ fontSize: 11, color: c.textSub }}>{appliedDiscount.code}: {appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`}</div>
                    </div>
                    <div onClick={() => setAppliedDiscount(null)} style={{ cursor: "pointer", fontSize: 12, color: c.textLabel }}><NavIcon name="xmark" size={12} color={c.textLabel} /></div>
                  </div>
                )}

                {/* Booking Policy */}
                {effectivePolicy && (
                  <div style={{ marginBottom: 20, padding: "16px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14 }}>
                    <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.bookingPolicy}</div>
                    <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6, marginBottom: 14, whiteSpace: "pre-wrap" }}>{effectivePolicy}</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <div onClick={() => setPolicyAgreed(!policyAgreed)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${policyAgreed ? accent : c.textMuted}`, background: policyAgreed ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                        {policyAgreed && <NavIcon name="check" size={14} color={c.btnOnDark} />}
                      </div>
                      <span style={{ fontSize: 13, color: policyAgreed ? c.text : c.textSub }}>{t.agreeToPolicy}</span>
                    </label>
                  </div>
                )}

              </>}

              {/* Step 4 — Confirm */}
              {step === 4 && <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={goBack} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.text, lineHeight: 1.2 }}>{t.confirmBooking}</div>
                    <div style={{ fontSize: 12, color: c.textLabel, marginTop: 2 }}>{t.confirmSub}</div>
                  </div>
                </div>
                <div style={{ background: `${accent}09`, border: `1px solid ${accent}22`, borderRadius: 20, padding: "4px 18px", marginBottom: 20 }}>
                  {/* Services list */}
                  <div className="confirm-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                    <span style={{ fontSize: 11, color: c.textLabel, letterSpacing: "0.04em" }}>{t.treatment} ({selectedServices.length})</span>
                    {selectedServices.map((item, idx) => (
                      <div key={item.service.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{svcName(item.service)}{item.variant ? ` — ${lang === "nl" ? item.variant.name_nl : (item.variant.name_en || item.variant.name_nl)}` : ""}</span>
                          {item.staff && <span style={{ fontSize: 11, color: c.textLabel, marginLeft: 6 }}>({item.staff.name})</span>}
                          {item.extras.length > 0 && <div style={{ fontSize: 10, color: c.textLabel }}>+ {item.extras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ")}</div>}
                        </div>
                        <span style={{ fontSize: 12, color: accent, fontWeight: 500 }}>€{((item.variant ? parseFloat(item.variant.price) : parseFloat(item.service.price || 0)) + item.extras.reduce((s, e) => s + parseFloat(e.price || 0), 0)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  {[[t.date, parseDate(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })],[t.time, time],[t.totalDuration, getDuration() + " " + t.min],[t.name, `${form.firstName} ${form.lastName}`],
                    ...(form.allergies ? [[t.allergies, form.allergies]] : []),
                    [t.payment, form.payment === "online" ? t.payOnline : t.payArrival]].map(([l,v]) => (
                    <div key={l} className="confirm-row">
                      <span style={{ fontSize: 11, color: c.textLabel, letterSpacing: "0.04em" }}>{l}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                  {appliedDiscount && (
                    <div className="confirm-row">
                      <span style={{ fontSize: 11, color: "#4ade80", letterSpacing: "0.04em" }}><NavIcon name="tag" size={11} color="#4ade80" /> {t.discount}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#4ade80" }}>{appliedDiscount.code} ({appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`})</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: accent }}>{t.total}</span>
                    <div>
                      {appliedDiscount && <span style={{ fontSize: 14, color: c.textLabel, textDecoration: "line-through", marginRight: 10 }}>€{getOriginalPrice().toFixed(2)}</span>}
                      <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: accent }}>€{getPrice().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </>}
            </div>
          ) : (
            <div className="fade-up" style={{ textAlign: "center", paddingTop: 60 }}>
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: `${accent}18`, border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", fontSize: 28 }}><NavIcon name="beauty" size={28} color={accent} /></div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>{t.confirmed}</div>
              <div style={{ fontSize: 12, color: c.textSub, marginBottom: 6 }}>{t.confirmedSub} <strong style={{ color: accent }}>{date}</strong> {t.at} <strong style={{ color: accent }}>{time}</strong></div>
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 28 }}>{t.confirmationSent} {form.email}</div>

              {/* Calendar sync buttons */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textMuted, marginBottom: 10 }}>{t.addToCalendar}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: "10px 16px" }} onClick={() => {
                    const dur = getDuration();
                    const [h, m] = time.split(":").map(Number);
                    const start = new Date(date + "T" + time + ":00");
                    const end = new Date(start.getTime() + dur * 60000);
                    const fmt2 = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                    const title = encodeURIComponent(getServiceLabel() + " @ " + initialSalon.name);
                    const details = encodeURIComponent(`${t.treatment}: ${getServiceLabel()}\n${t.total}: €${getPrice().toFixed(2)}\n\nvellu.cc/${initialSalon.id}`);
                    const loc = encodeURIComponent(initialSalon.name + ", " + initialSalon.city);
                    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt2(start)}/${fmt2(end)}&details=${details}&location=${loc}`, "_blank");
                  }}><NavIcon name="calendar" size={13} color="currentColor" /> {t.googleCalendar}</button>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: "10px 16px" }} onClick={() => {
                    const dur = getDuration();
                    const start = new Date(date + "T" + time + ":00");
                    const end = new Date(start.getTime() + dur * 60000);
                    const fmt2 = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                    const ics = [
                      "BEGIN:VCALENDAR",
                      "VERSION:2.0",
                      "PRODID:-//Vellu//Beauty Booking//EN",
                      "BEGIN:VEVENT",
                      `DTSTART:${fmt2(start)}`,
                      `DTEND:${fmt2(end)}`,
                      `SUMMARY:${getServiceLabel()} @ ${initialSalon.name}`,
                      `DESCRIPTION:${t.treatment}: ${getServiceLabel()}\\n${t.total}: €${getPrice().toFixed(2)}\\nvellu.cc/${initialSalon.id}`,
                      `LOCATION:${initialSalon.name}, ${initialSalon.city}`,
                      "STATUS:CONFIRMED",
                      "END:VEVENT",
                      "END:VCALENDAR"
                    ].join("\r\n");
                    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `vellu-${initialSalon.id}-${date}.ics`;
                    a.click(); URL.revokeObjectURL(url);
                  }}><NavIcon name="calendar" size={13} color="currentColor" /> {t.appleCalendar}</button>
                </div>
              </div>

              {/* WhatsApp confirmation */}
              {initialSalon.whatsapp_number && (
                <div style={{ marginBottom: 32 }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: "10px 20px", color: "#25d366", borderColor: "rgba(37,211,102,0.3)" }} onClick={() => {
                    const msg = getWhatsAppBookingMsg(lang, {
                      clientName: form.firstName,
                      salonName: initialSalon.name,
                      date: parseDate(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" }),
                      time, serviceName: getServiceLabel(), price: getPrice().toFixed(2)
                    });
                    window.open(getWhatsAppUrl(initialSalon.whatsapp_number, msg), "_blank");
                  }}><NavIcon name="chat" size={13} color="currentColor" /> {t.whatsappBookingConfirm}</button>
                </div>
              )}

              <button className="btn-primary" style={{ maxWidth: 200, margin: "0 auto", marginBottom: 28 }} onClick={reset}>{t.newBooking}</button>

              {/* Write a review */}
              <ReviewForm salon={initialSalon} clientName={`${form.firstName} ${form.lastName}`} clientEmail={form.email} lang={lang} t={t} accent={accent} />
            </div>
          )}

          </div> {/* close scroll area */}

          {/* Fixed bottom action bar — outside scroll area */}
          {!done && (
            <div style={{ borderTop: `1px solid ${c.border}`, background: c.bg, flexShrink: 0 }}>
            <div style={{ padding: "16px 60px", maxWidth: 700, margin: "0 auto" }}>
              {step === 1 && <>
                {selectedServices.length > 0 && missingVariants.length > 0 && (
                  <div style={{ fontSize: 11, color: c.warning, marginBottom: 10, padding: "8px 12px", background: `${c.warning}14`, border: `1px solid ${c.warning}33`, borderRadius: 10 }}>
                    <NavIcon name="alerttri" size={13} color={c.warning} /> {lang === "nl" ? "Kies een variant voor: " : "Choose a variant for: "}{missingVariants.map(item => svcName(item.service)).join(", ")}
                  </div>
                )}
                {selectedServices.length > 0 && missingStaff.length > 0 && (
                  <div style={{ fontSize: 11, color: c.warning, marginBottom: 10, padding: "8px 12px", background: `${c.warning}14`, border: `1px solid ${c.warning}33`, borderRadius: 10 }}>
                    <NavIcon name="alerttri" size={13} color={c.warning} /> {lang === "nl" ? "Kies een medewerker voor: " : "Choose a stylist for: "}{missingStaff.map(item => svcName(item.service)).join(", ")}
                  </div>
                )}
                <button className="btn-primary" disabled={!canProceedStep1} onClick={() => goToStep(2)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  {selectedServices.length > 0 ? (
                    <>{t.next} · {getDuration()} {t.min} · {fromPrefix}€{getOriginalPrice().toFixed(2)}</>
                  ) : (
                    <>{t.noServicesSelected}</>
                  )}
                </button>
              </>}
              {step === 2 && (
                <button className="btn-primary" disabled={!time} onClick={() => setStep(3)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  {time ? (
                    <>{t.next} · {parseDate(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "short", day: "numeric", month: "short" })} {lang === "nl" ? "om" : "at"} {time}</>
                  ) : (
                    <>{lang === "nl" ? "Kies een tijdstip" : "Pick a time"}</>
                  )}
                </button>
              )}
              {step === 3 && (
                <>
                {invalidReason && <div style={{ fontSize: 11, color: c.danger, marginBottom: 8, textAlign: "center" }}>{invalidReason}</div>}
                <button className="btn-primary" disabled={!canConfirm} onClick={() => setStep(4)}>{t.next}</button>
                </>
              )}
              {step === 4 && (
                <>
                  <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 10, lineHeight: 1.5, textAlign: "center" }}>
                    {t.bookingLegalNotice}{" "}
                    <a href="/privacy" target="_blank" rel="noopener" style={{ color: c.textSub, textDecoration: "underline" }}>{lang === "nl" ? "privacybeleid" : "privacy policy"}</a>
                    {" "}{t.bookingLegalNoticeAnd}{" "}
                    <a href="/terms" target="_blank" rel="noopener" style={{ color: c.textSub, textDecoration: "underline" }}>{lang === "nl" ? "voorwaarden" : "terms"}</a>.
                    {" "}{t.bookingLegalNoticeRefund}
                  </div>
                  <button className="btn-primary" onClick={confirmBooking} disabled={submitting}>{submitting ? "..." : t.confirm}</button>
                </>
              )}
            </div>
            </div>
          )}

          </div> {/* close flex column */}
        </div>
      ) : (
          // NOTE: use natural body scroll on mobile (no 100dvh + nested overflow).
          // iOS Safari only collapses the URL bar when the body scrolls — a 100dvh
          // wrapper with an inner scroll area pins the URL bar and cramps the UI.
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
            {/* Mobile Cover Image */}
            {initialSalon.cover_image_url && (
              <div style={{ 
                width: "100%", 
                height: 140, 
                backgroundImage: `url(${initialSalon.cover_image_url})`,
                backgroundSize: "cover",
                backgroundPosition: `center ${initialSalon.cover_focal_y ?? 50}%`,
                position: "relative"
              }}>
                {/* Back button on cover. top respects the iOS safe area so it
                    isn't tucked under the status bar/notch in the installed PWA
                    (where it became untappable). */}
                <button onClick={done ? reset : goBack} aria-label={lang === "nl" ? "Terug" : "Back"} style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", left: 12, zIndex: 10, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "none", borderRadius: 100, width: 38, height: 38, color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                    ←
                  </button>
                <div style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", right: 12, zIndex: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <ThemeToggle />
                  <LangToggle lang={lang} setLang={setLang} />
                </div>
              </div>
            )}

            {/* Mobile Header with Logo */}
            {!initialSalon.cover_image_url ? (
              <Header
                title={initialSalon.name}
                subtitle={initialSalon.city}
                onBack={done ? reset : (step > (hasLocations ? 0 : 1) ? () => setStep(s => s-1) : () => setMode("profile"))}
                right={<div style={{ display: "flex", alignItems: "center", gap: 6 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>}
                accent={accent}
              />
            ) : (
              <div style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid " + c.border }}>
                {initialSalon.logo_url && (
                  <img src={initialSalon.logo_url} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", border: "1px solid " + c.inputBorder }} />
                )}
                <div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 400, color: c.text }}>{initialSalon.name}</div>
                  <div style={{ fontSize: 11, color: c.textLabel }}>{initialSalon.city}</div>
                </div>
              </div>
            )}

            {/* Mobile Content — natural page scroll, no nested overflow.
                Padding-bottom reserves space for the fixed Volgende pill. */}
            <div style={{ padding: `14px 22px ${!done && selectedServices.length > 0 ? 120 : 24}px` }}>
              {!done ? (
                <div key={step} className="fade-up">
                  {/* Progress bar */}
                  <div style={{ display: "flex", gap: 5, margin: "12px 0 22px" }}>
                    {(hasLocations ? [0,1,2,3,4] : [1,2,3,4]).map(s => <div key={s} style={{ flex:1, height:2, borderRadius:4, background: step >= s ? accent : c.border, transition:"background 0.4s" }} />)}
                  </div>

                  {/* Step 0 — Location selection (only if multiple locations) */}
                  {step === 0 && hasLocations && <>
                    <PTitle sub={t.selectLocationSub}>{t.selectLocation}</PTitle>
                    {(initialSalon.locations || []).map(loc => (
                      <div key={loc.id} className={`service-card ${selectedLocation?.id === loc.id ? "sel" : ""}`} onClick={() => { setSelectedLocation(loc); setDate(fmt(getToday())); setTime(null); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{loc.name}</div>
                            {loc.address && <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3 }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}</div>}
                            {loc.phone && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}><NavIcon name="phone" size={10} color={c.textMuted} /> {loc.phone}</div>}
                          </div>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selectedLocation?.id === loc.id ? accent : c.textMuted}`, background: selectedLocation?.id === loc.id ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                            {selectedLocation?.id === loc.id && <NavIcon name="check" size={10} color={c.btnOnDark} />}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button className="btn-primary" disabled={!selectedLocation} onClick={() => setStep(1)} style={{ marginTop: 10 }}>{t.next}</button>
                  </>}

                  {/* Step 1 — Service selection (multi-select) */}
                  {step === 1 && <>
                    <PTitle sub={t.selectServiceSub}>{t.selectService}</PTitle>
                    
                    {/* Category tabs — scrollable with arrows for long lists */}
                    {(() => {
                      const usedCats = categories.filter(cat => initialSalon.services.some(s => s.category_id === cat.id));
                      if (usedCats.length === 0) return null;
                      const scrollRef = { current: null };
                      const scrollBy = (dir) => { scrollRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" }); };
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <button onClick={() => scrollBy(-1)} aria-label={lang === "nl" ? "Vorige" : "Previous"} style={{ width: 24, height: 24, borderRadius: "50%", background: c.bgCard, border: `1px solid ${c.border}`, color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                          </button>
                          <div ref={el => scrollRef.current = el} style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, flex: 1, scrollbarWidth: "none", msOverflowStyle: "none" }}>
                            <div
                              onClick={() => setActiveCategory("all")}
                              style={{
                                padding: "7px 14px", borderRadius: 100, cursor: "pointer", flexShrink: 0,
                                background: activeCategory === "all" ? accent : c.inputBg,
                                border: `1px solid ${activeCategory === "all" ? accent : c.inputBorder}`,
                                color: activeCategory === "all" ? c.btnOnDark : c.textSub,
                                fontSize: 11, fontWeight: 500, transition: "all 0.2s"
                              }}
                            >{t.allCategories}</div>
                            {usedCats.map(cat => (
                              <div
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                style={{
                                  padding: "7px 14px", borderRadius: 100, cursor: "pointer", flexShrink: 0,
                                  background: activeCategory === cat.id ? accent : c.inputBg,
                                  border: `1px solid ${activeCategory === cat.id ? accent : c.inputBorder}`,
                                  color: activeCategory === cat.id ? c.btnOnDark : c.textSub,
                                  fontSize: 11, fontWeight: 500, transition: "all 0.2s"
                                }}
                              >{lang === "nl" ? (cat.name_nl || cat.name) : (cat.name_en || cat.name_nl || cat.name)}</div>
                            ))}
                          </div>
                          <button onClick={() => scrollBy(1)} aria-label={lang === "nl" ? "Volgende" : "Next"} style={{ width: 24, height: 24, borderRadius: "50%", background: c.bgCard, border: `1px solid ${c.border}`, color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                          </button>
                        </div>
                      );
                    })()}

                    {/* Selected services counter */}
                    {selectedServices.length > 0 && (
                      <div style={{ background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 14, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: accent, fontWeight: 500 }}>
                          <NavIcon name="check" size={11} color={c.btnOnDark} /> {selectedServices.length} {selectedServices.length === 1 ? t.serviceSelected : t.servicesSelected}
                        </span>
                        <span style={{ fontSize: 11, color: c.textSub }}>{getDuration()} {t.min}</span>
                      </div>
                    )}

                    {filteredServices.length === 0 && (
                      <div style={{ textAlign: "center", padding: "30px 16px", color: c.textMuted }}>
                        <div style={{ marginBottom: 10 }}><NavIcon name="beauty" size={32} color={accent} /></div>
                        <div style={{ fontSize: 12 }}>{activeCategory !== "all" ? (lang === "nl" ? "Geen behandelingen in deze categorie" : "No treatments in this category") : (lang === "nl" ? "Nog geen behandelingen beschikbaar" : "No treatments available yet")}</div>
                      </div>
                    )}
                    {filteredServices.map(s => {
                      const isSel = isServiceSelected(s.id);
                      const item = getServiceItem(s.id);
                      const staffForService = getStaffForService(s.id);
                      return (
                      <div key={s.id}>
                        <div className={`service-card ${isSel ? "sel" : ""}`} role="checkbox" tabIndex={0} aria-checked={isSel} onClick={() => toggleServiceSelection(s)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleServiceSelection(s); } }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {/* Checkbox */}
                              <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSel ? accent : c.textMuted}`, background: isSel ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}>
                                {isSel && <NavIcon name="check" size={12} color={c.btnOnDark} />}
                              </div>
                              <div>
                                <div style={{ fontWeight: 500, fontSize: 14 }}>{svcName(s)}</div>
                                <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3 }}>
                                  {svcDuration(s)}
                                  {(s.photos || []).length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} {t.photos.toLowerCase()}</span>}
                                  {(s.variants?.length > 0) && <span style={{ color: accent, marginLeft: 8 }}>· {s.variants.length} {s.variants.length === 1 ? "variant" : t.variants.toLowerCase()}</span>}
                                </div>
                              </div>
                            </div>
                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: c.text }}>
                              {s.variants?.length > 0 ? `${t.from} €${Math.min(...s.variants.map(v => parseFloat(v.price)))}` : `€${s.price}`}
                            </div>
                          </div>
                          {(s.photos || []).length > 0 && (
                            <div className="photo-grid" style={{ marginLeft: 30 }}>
                              {s.photos.map((p, i) => (
                                <img key={p.id || i} src={p.url || p} className="photo-thumb" loading="lazy" onClick={e => { e.stopPropagation(); setGallery({ photos: s.photos, idx: i }); }} />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Variants — per selected service */}
                        {isSel && s.variants?.length > 0 && (
                          <div style={{ marginLeft: 30, marginBottom: 10 }}>
                            <SL>{t.selectVariant}</SL>
                            {s.variants.map(v => (
                              <div key={v.id} className={`service-card ${item?.variant?.id === v.id ? "sel" : ""}`} style={{ padding: "12px 14px", marginBottom: 6 }} onClick={() => updateServiceItem(s.id, { variant: v })}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div>
                                    <div style={{ fontWeight: 500, fontSize: 13 }}>{lang === "nl" ? v.name_nl : (v.name_en || v.name_nl)}</div>
                                    {v.description_nl && <div style={{ fontSize: 10, color: c.textLabel, marginTop: 2 }}>{lang === "nl" ? v.description_nl : (v.description_en || v.description_nl)}</div>}
                                    <div style={{ fontSize: 10, color: c.textLabel, marginTop: 2 }}>{v.duration} {t.min}</div>
                                  </div>
                                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: c.text }}>€{v.price}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Extras — per selected service */}
                        {isSel && s.extras?.length > 0 && (
                          <div style={{ marginLeft: 30, marginBottom: 10 }}>
                            <SL>{t.selectExtras}</SL>
                            {s.extras.map(e => (
                              <div key={e.id} className={`service-card ${item?.extras?.find(x => x.id === e.id) ? "sel" : ""}`} style={{ padding: "10px 14px", marginBottom: 4 }} onClick={() => toggleExtraForService(s.id, e)}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ fontWeight: 500, fontSize: 12 }}>+ {lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)}</div>
                                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: accent }}>+€{e.price}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Staff selection — per selected service, filtered */}
                        {isSel && staffForService.length > 0 && (
                          <div style={{ marginLeft: 30, marginBottom: 10 }}>
                            <SL>{t.selectStaff}{requireStaffPick && <span style={{ color: c.danger, marginLeft: 4 }}>*</span>}</SL>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {!requireStaffPick && (
                                <div className={`service-card ${!item?.staff ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => updateServiceItem(s.id, { staff: null })}>
                                  <div style={{ fontSize: 12, fontWeight: 500 }}>{t.anyStaff}</div>
                                </div>
                              )}
                              {staffForService.map(m => (
                                <div key={m.id} className={`service-card ${item?.staff?.id === m.id ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => updateServiceItem(s.id, { staff: m })}>
                                  <div style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</div>
                                  {m.role && <div style={{ fontSize: 11, color: c.textLabel }}>{m.role}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })}
                    <div style={{ marginTop: 14 }}>
                      {selectedServices.length > 0 && missingVariants.length > 0 && (
                        <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 10, padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10 }}>
                          <NavIcon name="alerttri" size={13} color="#fb923c" /> {lang === "nl" ? "Kies een variant voor: " : "Choose a variant for: "}{missingVariants.map(item => svcName(item.service)).join(", ")}
                        </div>
                      )}
                      {selectedServices.length > 0 && missingStaff.length > 0 && (
                        <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 10, padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10 }}>
                          <NavIcon name="alerttri" size={13} color="#fb923c" /> {lang === "nl" ? "Kies een medewerker voor: " : "Choose a stylist for: "}{missingStaff.map(item => svcName(item.service)).join(", ")}
                        </div>
                      )}
                      {selectedServices.length === 0 && (
                        <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 10, textAlign: "center" }}>
                          {t.noServicesSelected}
                        </div>
                      )}
                      <button className="btn-primary" disabled={!canProceedStep1} onClick={() => goToStep(2)}>{t.next}</button>
                    </div>
                  </>}

                  {/* Step 2 — Date & Time (mobile) */}
                  {step === 2 && <>
                    <PTitle sub={t.selectDateSub}>{t.selectDate}</PTitle>
                    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20, WebkitMaskImage: "linear-gradient(to right, black 88%, transparent)", maskImage: "linear-gradient(to right, black 88%, transparent)" }}>
                      {days.map((d, i) => {
                        const ds = fmt(d); 
                        const isSel = date === ds;
                        const dayHours = getEffectiveHours(ds);
                        const staffWindow = getStaffTimeWindow(ds);
                        const isClosed = dayHours.closed || staffWindow?.closed || !isDayInBookingWindow(ds);
                        // Fully booked → greyed like a closed day, but still tappable so
                        // the customer can select it and join that day's waitlist.
                        const isFull = !isClosed && dayAvailability[ds] === "full";
                        return (
                          <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} role="button" tabIndex={isClosed ? -1 : 0} aria-label={`${DAY[d.getDay()]} ${d.getDate()}${isFull ? (lang === "nl" ? " volgeboekt" : " fully booked") : ""}`} aria-disabled={isClosed} onClick={() => { if (!isClosed) { setDate(ds); setTime(null); } }} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !isClosed) { e.preventDefault(); setDate(ds); setTime(null); } }} style={isClosed ? { opacity: 0.35, cursor: "not-allowed" } : isFull ? { opacity: 0.5 } : {}}>
                            <span style={{ fontSize: 10, color: isSel ? c.btnOnDark : c.textLabel }}>{DAY[d.getDay()]}</span>
                            <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? c.btnOnDark : c.text, marginTop: 2 }}>{d.getDate()}</span>
                            <span style={{ fontSize: 10, color: isSel ? c.btnOnDark : isFull ? c.danger : c.textMuted, fontWeight: isFull ? 700 : undefined }}>{isClosed ? (lang === "nl" ? "gesloten" : "closed") : isFull ? (lang === "nl" ? "vol" : "full") : MON[d.getMonth()]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <SL>{t.selectTime}</SL>
                    {(() => {
                      // Wait for bookedSlots to load before rendering — prevents the brief
                      // window where all slots look available while the fetch is in flight.
                      if (slotsLoading) {
                        return (
                          <div style={{ textAlign: "center", padding: "30px 20px", color: c.textLabel, fontSize: 13, marginBottom: 20 }}>
                            {lang === "nl" ? "Beschikbaarheid laden..." : "Loading availability..."}
                          </div>
                        );
                      }
                      const availableTimes = getAvailableTimes(date);
                      const anyFree = availableTimes.some(tt => !isTimeSlotBooked(tt));
                      return (availableTimes.length > 0 && anyFree) ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 20 }}>
                          {availableTimes.map(tt => {
                            const booked = isTimeSlotBooked(tt);
                            return (
                              <div key={tt} className={`time-chip ${time === tt ? "sel" : ""}`}
                                onClick={() => { if (!booked) setTime(tt); }}
                                style={booked ? { opacity: 0.25, cursor: "not-allowed", textDecoration: "line-through" } : {}}
                              >{tt}</div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", padding: "30px 20px", color: c.textLabel, marginBottom: 20 }}>
                          {availableTimes.length > 0
                            ? <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>{lang === "nl" ? "Volgeboekt" : "Fully booked"}</div>
                            : null}
                          <div style={{ fontSize: 13, marginBottom: 16 }}>
                            {availableTimes.length > 0
                              ? (lang === "nl" ? `Alle ${availableTimes.length} tijden op deze dag zijn geboekt.` : `All ${availableTimes.length} times on this day are booked.`)
                              : t.noTimesAvailable}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                            <FirstAvailableHint />
                            {initialSalon.waitlist_enabled !== false && (
                              <button type="button" onClick={() => setWaitlistOpen(true)} style={{ background: "transparent", border: `1px solid ${accent}`, color: accent, borderRadius: 999, padding: "8px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>{t.joinWaitlist}</button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <button className="btn-primary" disabled={!time} onClick={() => setStep(3)}>{t.next}</button>
                  </>}

                  {/* Step 3 — Details (mobile) */}
                  {step === 3 && <>
                    <PTitle sub={t.yourDetailsSub}>{t.yourDetails}</PTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                      {/* Honeypot — see desktop branch for rationale */}
                      <input
                        type="text"
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        value={form.website}
                        onChange={e => setForm(f => ({...f, website: e.target.value}))}
                        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                      />
                      {/* Email first for client lookup */}
                      <input className="input-field" placeholder={t.email} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
                      
                      {/* Client found indicator */}
                      {clientFound && (
                        <div style={{ background: `${accent}12`, border: `1px solid ${accent}30`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                          <NavIcon name="wave" size={18} color={accent} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: accent }}>{t.welcomeBackClient}!</div>
                            <div style={{ fontSize: 10, color: c.textSub }}>{t.foundYourDetails}</div>
                          </div>
                        </div>
                      )}
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <input className="input-field" type="text" autoComplete="given-name" placeholder={t.firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                        <input className="input-field" type="text" autoComplete="family-name" placeholder={t.lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                      </div>
                      <input className="input-field" placeholder={`${t.phone}${initialSalon.phone_required ? ` (${t.required})` : ` (${t.optional})`}`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={initialSalon.phone_required && !form.phone ? { borderColor: "rgba(248,113,113,0.3)" } : {}} />
                      <input className="input-field" placeholder={`${t.allergies} (${t.allergiesOptional})`} value={form.allergies} onChange={e => setForm(f => ({...f, allergies: e.target.value}))} />
                  <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, lineHeight: 1.5 }}>{t.allergyDisclaimer}</div>
                    </div>
                    
                    {/* No-show warning */}
                    {clientNoShows > 0 && (
                      <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                        <NavIcon name="alerttri" size={16} color="#fb923c" />
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 500, color: "#f87171" }}>{t.noShowWarning}</div>
                          <div style={{ fontSize: 10, color: "rgba(248,113,113,0.6)" }}>{clientNoShows}x {t.noShowCount}</div>
                        </div>
                      </div>
                    )}

                    <SL>{t.payMethod}</SL>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                      {[["on-arrival","home",t.payArrival], ...(initialSalon.payment_configured ? [["online","creditcard",t.payOnline]] : [])].map(([v,icon,label]) => (
                        <div key={v} className={`pay-opt ${form.payment === v ? "sel" : ""}`} role="radio" tabIndex={0} aria-checked={form.payment === v} onClick={() => setForm(f => ({...f, payment: v}))} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setForm(f => ({...f, payment: v})); } }}>
                          <div className={`radio ${form.payment === v ? "on" : ""}`} />
                          <NavIcon name={icon} size={15} color={c.textSub} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Discount Code Input (mobile) */}
                    {activeCodes.length > 0 && !appliedDiscount && (
                      <div style={{ marginBottom: 20 }}>
                        <SL>{t.enterDiscountCode}</SL>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input className="input-field" placeholder={t.discountCode} value={discountCode} onChange={e => handleDiscountInput(e.target.value)} style={{ flex: 1, fontFamily: "monospace" }} />
                          <button className="btn-ghost" style={{ padding: "0 16px" }} onClick={() => applyDiscountCode()}>{t.applyCode}</button>
                        </div>
                        {discountError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{discountError}</div>}
                      </div>
                    )}
                    {appliedDiscount && (
                      <div style={{ marginBottom: 20, padding: "10px 14px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 500 }}><NavIcon name="tag" size={12} color="#4ade80" /> {t.codeApplied}</div>
                          <div style={{ fontSize: 10, color: c.textSub }}>{appliedDiscount.code}: {appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`}</div>
                        </div>
                        <div onClick={() => setAppliedDiscount(null)} style={{ cursor: "pointer", fontSize: 12, color: c.textLabel }}><NavIcon name="xmark" size={12} color={c.textLabel} /></div>
                      </div>
                    )}

                    {/* Booking Policy (mobile) */}
                    {effectivePolicy && (
                      <div style={{ marginBottom: 20, padding: "14px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14 }}>
                        <div style={{ fontSize: 10, color: c.textLabel, marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.bookingPolicy}</div>
                        <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{effectivePolicy}</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <div onClick={() => setPolicyAgreed(!policyAgreed)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${policyAgreed ? accent : c.textMuted}`, background: policyAgreed ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                            {policyAgreed && <NavIcon name="check" size={12} color={c.btnOnDark} />}
                          </div>
                          <span style={{ fontSize: 12, color: policyAgreed ? c.text : c.textSub }}>{t.agreeToPolicy}</span>
                        </label>
                      </div>
                    )}

                    {invalidReason && <div style={{ fontSize: 11, color: c.danger, marginBottom: 8, textAlign: "center" }}>{invalidReason}</div>}
                    <button className="btn-primary" disabled={!canConfirm} onClick={() => setStep(4)}>{t.next}</button>
                  </>}

                  {/* Step 4 — Confirm (mobile) */}
                  {step === 4 && <>
                    <PTitle sub={t.confirmSub}>{t.confirmBooking}</PTitle>
                    <div style={{ background: `${accent}09`, border: `1px solid ${accent}22`, borderRadius: 20, padding: "4px 18px", marginBottom: 20 }}>
                      {/* Services list */}
                      <div className="confirm-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                        <span style={{ fontSize: 11, color: c.textLabel, letterSpacing: "0.04em" }}>{t.treatment} ({selectedServices.length})</span>
                        {selectedServices.map((item) => (
                          <div key={item.service.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{svcName(item.service)}{item.variant ? ` — ${lang === "nl" ? item.variant.name_nl : (item.variant.name_en || item.variant.name_nl)}` : ""}</span>
                              {item.staff && <span style={{ fontSize: 11, color: c.textLabel, marginLeft: 6 }}>({item.staff.name})</span>}
                              {item.extras.length > 0 && <div style={{ fontSize: 10, color: c.textLabel }}>+ {item.extras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ")}</div>}
                            </div>
                            <span style={{ fontSize: 12, color: accent, fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>€{((item.variant ? parseFloat(item.variant.price) : parseFloat(item.service.price || 0)) + item.extras.reduce((s, e) => s + parseFloat(e.price || 0), 0)).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      {[[t.date, parseDate(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })],[t.time, time],[t.totalDuration, getDuration() + " " + t.min],[t.name, `${form.firstName} ${form.lastName}`],
                        ...(form.allergies ? [[t.allergies, form.allergies]] : []),
                        [t.payment, form.payment === "online" ? t.payOnline : t.payArrival]].map(([l,v]) => (
                        <div key={l} className="confirm-row">
                          <span style={{ fontSize: 11, color: c.textLabel, letterSpacing: "0.04em" }}>{l}</span>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                        </div>
                      ))}
                      {appliedDiscount && (
                        <div className="confirm-row">
                          <span style={{ fontSize: 11, color: "#4ade80", letterSpacing: "0.04em" }}><NavIcon name="tag" size={11} color="#4ade80" /> {t.discount}</span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "#4ade80" }}>{appliedDiscount.code} ({appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`})</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: accent }}>{t.total}</span>
                        <div>
                          {appliedDiscount && <span style={{ fontSize: 14, color: c.textLabel, textDecoration: "line-through", marginRight: 8 }}>€{getOriginalPrice().toFixed(2)}</span>}
                          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: accent }}>€{getPrice().toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 10, lineHeight: 1.5, textAlign: "center" }}>
                      {t.bookingLegalNotice}{" "}
                      <a href="/privacy" target="_blank" rel="noopener" style={{ color: c.textSub, textDecoration: "underline" }}>{lang === "nl" ? "privacybeleid" : "privacy policy"}</a>
                      {" "}{t.bookingLegalNoticeAnd}{" "}
                      <a href="/terms" target="_blank" rel="noopener" style={{ color: c.textSub, textDecoration: "underline" }}>{lang === "nl" ? "voorwaarden" : "terms"}</a>.
                      {" "}{t.bookingLegalNoticeRefund}
                    </div>
                    <button className="btn-primary" onClick={confirmBooking} disabled={submitting}>{submitting ? "..." : t.confirm}</button>
                  </>}

                  {/* Reviews on mobile step 1 */}
                  {step === 1 && initialSalon.reviews?.length > 0 && (
                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid " + c.border }}>
                      <SL>{t.reviews} ({initialSalon.reviews.length}) · {(initialSalon.reviews.reduce((s,r) => s + r.rating, 0) / initialSalon.reviews.length).toFixed(1)} ★</SL>
                      {initialSalon.reviews.slice(0, 3).map(r => (
                        <div key={r.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid " + c.border }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <span style={{ fontWeight: 500, fontSize: 12 }}>{r.client_name?.split(" ")[0] || (t.client)}</span>
                            <span style={{ color: accent, fontSize: 12 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                          </div>
                          {r.comment && <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.5 }}>{r.comment}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Done screen mobile */
                <div className="fade-up" style={{ textAlign: "center", paddingTop: 40 }}>
                  <div style={{ fontSize: 48, marginBottom: 20 }}>✨</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, marginBottom: 10 }}>{t.confirmed}</div>
                  <p style={{ color: c.textSub, fontSize: 14, marginBottom: 30 }}>
                    {t.confirmedSub} {parseDate(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })} {t.at} {time}
                  </p>
                  <p style={{ fontSize: 12, color: c.textLabel, marginBottom: 30 }}>{t.confirmationSent} {form.email}</p>
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textMuted, marginBottom: 10 }}>{t.addToCalendar}</div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: "10px 16px" }} onClick={() => {
                        const dur = getDuration(); const start = new Date(date + "T" + time + ":00"); const end = new Date(start.getTime() + dur * 60000);
                        const fmt2 = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                        const title = encodeURIComponent(getServiceLabel() + " @ " + initialSalon.name);
                        window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt2(start)}/${fmt2(end)}`, "_blank");
                      }}><NavIcon name="calendar" size={13} color="currentColor" /> {t.googleCalendar}</button>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: "10px 16px" }} onClick={() => {
                        const dur = getDuration(); const start = new Date(date + "T" + time + ":00"); const end = new Date(start.getTime() + dur * 60000);
                        const fmt2 = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                        const ics = ["BEGIN:VCALENDAR","VERSION:2.0","BEGIN:VEVENT",`DTSTART:${fmt2(start)}`,`DTEND:${fmt2(end)}`,`SUMMARY:${getServiceLabel()} @ ${initialSalon.name}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
                        const blob = new Blob([ics], { type: "text/calendar" }); const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `booking.ics`; a.click();
                      }}><NavIcon name="calendar" size={13} color="currentColor" /> {t.appleCalendar}</button>
                    </div>
                  </div>
                  <button className="btn-primary" style={{ maxWidth: 200, margin: "0 auto", marginBottom: 28 }} onClick={reset}>{t.newBooking}</button>

                                    
                  <ReviewForm salon={initialSalon} clientName={`${form.firstName} ${form.lastName}`} clientEmail={form.email} lang={lang} t={t} accent={accent} />
                </div>
              )}
            </div>

            {/* Mobile bottom bar with action button */}
            {!done && selectedServices.length > 0 && (
              <div style={{ 
                position: "fixed", bottom: 0, left: 0, right: 0, 
                background: c.bg, 
                borderTop: "1px solid " + c.border, padding: "12px 22px",
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100,
                gap: 12
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: c.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedServices.length === 1 ? svcName(selectedServices[0].service) : `${selectedServices.length} ${t.servicesSelected}`}
                    {time && ` · ${time}`}
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>{fromPrefix}€{getPrice().toFixed(2)}</div>
                </div>
                {step === 1 && (
                  <button className="btn-primary" style={{ width: "auto", padding: "12px 24px", fontSize: 11, flexShrink: 0 }} 
                    disabled={!canProceedStep1} onClick={() => goToStep(2)}>{t.next}</button>
                )}
                {step === 2 && (
                  <button className="btn-primary" style={{ width: "auto", padding: "12px 24px", fontSize: 11, flexShrink: 0 }} 
                    disabled={!time} onClick={() => setStep(3)}>{t.next}</button>
                )}
                {step === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {invalidReason && <div style={{ fontSize: 11, color: c.danger }}>{invalidReason}</div>}
                    <button className="btn-primary" style={{ width: "auto", padding: "12px 24px", fontSize: 11, flexShrink: 0 }}
                      disabled={!canConfirm} onClick={() => setStep(4)}>{t.next}</button>
                  </div>
                )}
                {step === 4 && (
                  <button className="btn-primary" style={{ width: "auto", padding: "12px 24px", fontSize: 11, flexShrink: 0 }} 
                    disabled={submitting} onClick={confirmBooking}>{submitting ? "..." : t.confirm}</button>
                )}
              </div>
            )}
          </div>
        )}


                {/* Review mode overlay (from follow-up email link) */}
        {showReviewForm && (
          <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(12px)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowReviewForm(false)}>
            <div style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 24, padding: 28, maxWidth: 420, width: "100%" }} onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⭐</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 300 }}>
                  {t.howWasAppt}
                </div>
                <div style={{ fontSize: 12, color: c.textSub, marginTop: 4 }}>{initialSalon.name}</div>
              </div>
              <ReviewForm salon={initialSalon} clientName="" clientEmail={reviewEmail} lang={lang} t={t} accent={accent} />
              <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={() => setShowReviewForm(false)}>
                {t.close}
              </button>
            </div>
          </div>
        )}

        {/* Gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)} onKeyDown={e => e.key === "Escape" && setGallery(null)}>
            <img src={gallery.photos[gallery.idx]?.url || gallery.photos[gallery.idx]} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
            <div style={{ display: "flex", gap: 8, marginTop: 16, overflowX: "auto", maxWidth: "100%", paddingBottom: 4 }}>
              {gallery.photos.map((p, i) => (
                <img key={p.id || i} src={p.url || p} onClick={e => { e.stopPropagation(); setGallery(g => ({...g, idx: i})); }}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `2px solid ${i === gallery.idx ? accent : "transparent"}`, opacity: i === gallery.idx ? 1 : 0.5, transition: "all 0.2s", flexShrink: 0 }} />
              ))}
            </div>
          </div>
        )}

        {/* Error toast */}
        {errorToast && (
          <div style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "#991b1b", color: "#fef2f2", padding: "12px 24px", borderRadius: 14,
            fontSize: 12, fontWeight: 500, fontFamily: "'Jost',sans-serif",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 9999,
            animation: "fadeUp 0.3s ease", maxWidth: "90vw", textAlign: "center"
          }}>
            {errorToast}
          </div>
        )}

        {/* Waitlist modal — rendered at ClientApp root so it's available from
            both profile and booking modes. Portalled to body to sit above the
            floating pill and any sticky headers. */}
        {waitlistOpen && createPortal(
          <div onClick={() => !waitlistSubmitting && setWaitlistOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", zIndex: 340, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: 24, maxWidth: 400, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
              {waitlistDone ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: "50%", background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <NavIcon name="check" size={26} color={accent} />
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 8 }}>{T[lang].waitlistJoined}</div>
                  <div style={{ fontSize: 13, color: c.textLabel, marginBottom: 20 }}>{T[lang].waitlistJoinedSub}</div>
                  <button className="btn-primary" style={{ width: "100%" }} onClick={() => setWaitlistOpen(false)}>{T[lang].close}</button>
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 6 }}>{T[lang].waitlistTitle}</div>
                  <div style={{ fontSize: 12, color: c.textLabel, marginBottom: 14, lineHeight: 1.5 }}>
                    {T[lang].waitlistSub}
                  </div>
                  {/* Pick one or more specific days to be notified about. Seeded with
                      the day they were on; other fully-booked days are offered too. */}
                  {(() => {
                    const wlCandidates = Array.from(new Set([
                      ...(date ? [date] : []),
                      ...days.filter(d => dayAvailability[fmt(d)] === "full").map(fmt),
                    ])).sort();
                    return (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>
                          {lang === "nl" ? "Voor welke dag(en)?" : "Which day(s)?"}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {wlCandidates.map(ds => {
                            const on = waitlistDates.includes(ds);
                            const dd = parseDate(ds);
                            return (
                              <button key={ds} type="button" onClick={() => toggleWaitlistDate(ds)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 100,
                                  border: `1.5px solid ${on ? accent : c.inputBorder}`,
                                  background: on ? `${accent}18` : "transparent",
                                  color: on ? accent : c.textSub, fontSize: 12, fontWeight: on ? 600 : 500, cursor: "pointer",
                                  transition: "all 0.15s", fontFamily: "'Jost',sans-serif",
                                }}>
                                {on && <NavIcon name="check" size={11} color={accent} />}
                                <span style={{ textTransform: "capitalize" }}>{dd.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "short", day: "numeric", month: "short" })}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: 10.5, color: c.textMuted, marginTop: 8, lineHeight: 1.4 }}>
                          {lang === "nl"
                            ? `We appen of mailen je zodra er een plek vrijkomt op ${waitlistDates.length === 1 ? "deze dag" : `een van deze ${waitlistDates.length} dagen`}.`
                            : `We'll message you as soon as a spot opens on ${waitlistDates.length === 1 ? "this day" : `one of these ${waitlistDates.length} days`}.`}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input className="input-field" placeholder={T[lang].firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                      <input className="input-field" placeholder={T[lang].lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                    </div>
                    <input className="input-field" placeholder={T[lang].email} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
                    {/* Phone follows the salon's phone_required setting, exactly
                        like the booking form — it made no sense for the same
                        setting to be enforced at booking but ignored here. */}
                    <input className="input-field" placeholder={`${T[lang].phone}${initialSalon.phone_required ? ` (${T[lang].required})` : ` (${T[lang].optional})`}`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={initialSalon.phone_required && !form.phone ? { borderColor: "rgba(248,113,113,0.3)" } : {}} />
                    <textarea className="input-field" placeholder={T[lang].waitlistNotesPh} value={waitlistNotes} onChange={e => setWaitlistNotes(e.target.value)} rows={2} style={{ resize: "none" }} />
                  </div>
                  {waitlistError && (
                    <div style={{ fontSize: 11, color: c.danger, marginTop: 8 }}>{waitlistError}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button className="btn-ghost" style={{ flex: 1 }} disabled={waitlistSubmitting} onClick={() => setWaitlistOpen(false)}>{T[lang].cancel}</button>
                    <button className="btn-primary" style={{ flex: 1 }} disabled={waitlistSubmitting || waitlistDates.length === 0} onClick={submitWaitlist}>{waitlistSubmitting ? "..." : T[lang].joinWaitlist}</button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>
    </Layout>
  );
}

// ─── VARIANT & EXTRA ADDERS ─────────────────────────────────

export { ClientApp, ReviewForm };
export default ClientApp;
