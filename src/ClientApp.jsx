import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";
import {
  useTheme, useSEO, useToast, ToastContainer, useConfirm, ConfirmModal, useFocusTrap,
  compressImage, sendEmails, ACCENT,
  getGoogleCalUrl, getWhatsAppUrl, getWhatsAppBookingMsg, getWhatsAppReminderMsg,
  getToday, fmt, getDays,
  TIMES, DAY_NL, DAY_EN, DAY_FULL_NL, DAY_FULL_EN, MON_NL, MON_EN,
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

// ─── CLIENT BOOKING ───────────────────────────────────────────
function ClientApp({ salon: initialSalon, onBack, lang, setLang, reviewMode = false, reviewEmail = "" }) {
  const { colors: c, theme } = useTheme();
  const accent = initialSalon.accent || ACCENT;
  const t = T[lang];
  const DAY = lang === "nl" ? DAY_NL : DAY_EN;
  const MON = lang === "nl" ? MON_NL : MON_EN;
  const svcName = (s) => lang === "nl" ? (s.name_nl || s.name_en || s.name || "") : (s.name_en || s.name_nl || s.name || "");

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
    return true;
  };
  const isTimeBlockedByOverride = (dateStr, timeStr) => {
    const override = dayOverrides[dateStr];
    if (!override || override.type !== "blocked") return false;
    if (override.block_time_start && override.block_time_end) {
      return timeStr >= override.block_time_start && timeStr < override.block_time_end;
    }
    return false; // whole-day blocks are handled by isDayBlocked
  };
  const isDayException = (dateStr) => dayOverrides[dateStr]?.type === "exception";
  const getEffectiveHours = (dateStr) => {
    if (isDayBlocked(dateStr)) return { closed: true };
    if (isDayException(dateStr)) return { closed: false, open: dayOverrides[dateStr].open, close: dayOverrides[dateStr].close };
    const dayOfWeek = new Date(dateStr).getDay();
    return activeHours[dayOfWeek] || DEFAULT_HOURS[dayOfWeek];
  };
  
  // Check if a staff member works on a given day
  const isStaffAvailable = (staffMember, dateStr) => {
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

  // Get effective time window considering all selected staff members' working hours
  const getStaffTimeWindow = (dateStr) => {
    const assignedStaff = selectedServices.filter(item => item.staff).map(item => item.staff);
    if (assignedStaff.length === 0) return null; // No staff constraint
    const dayOfWeek = new Date(dateStr).getDay();
    let latestStart = "00:00";
    let earliestEnd = "23:59";
    for (const staff of assignedStaff) {
      if (!staff.working_hours) continue; // No constraints, follows salon hours
      const staffDay = staff.working_hours[dayOfWeek];
      if (!staffDay) continue; // Day not configured = follows salon hours
      if (staffDay.closed) return { closed: true }; // Staff explicitly closed this day
      if (staffDay.open && staffDay.open > latestStart) latestStart = staffDay.open;
      if (staffDay.close && staffDay.close < earliestEnd) earliestEnd = staffDay.close;
    }
    if (latestStart >= earliestEnd) return { closed: true }; // No overlapping window
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
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival", allergies: "" });
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
  const [bookedSlots, setBookedSlots] = useState([]);
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
  
  // Check if form is complete
  const phoneValid = !initialSalon.phone_required || form.phone.length >= 6;
  const policyValid = !initialSalon.booking_policy || policyAgreed;
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

  const canProceedStep1 = selectedServices.length > 0 && selectedServices.every(item =>
    !item.service.variants?.length || item.variant
  );
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

  const getPrice = () => {
    let total = selectedServices.reduce((sum, item) => {
      const base = item.variant ? parseFloat(item.variant.price) : parseFloat(item.service.price || 0);
      const extrasTotal = item.extras.reduce((s, e) => s + parseFloat(e.price || 0), 0);
      return sum + base + extrasTotal;
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
      const base = item.variant ? parseFloat(item.variant.price) : parseFloat(item.service.price || 0);
      const extrasTotal = item.extras.reduce((s, e) => s + parseFloat(e.price || 0), 0);
      return sum + base + extrasTotal;
    }, 0);
  };
  const getDuration = () => {
    return selectedServices.reduce((sum, item) => {
      return sum + (item.variant ? item.variant.duration : (item.service.duration || 0));
    }, 0);
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

  const reset = () => { setMode("profile"); setStep(hasLocations ? 0 : 1); setSelectedServices([]); setTime(null); setDone(false); setSubmitting(false); setSlotsRefreshKey(k => k + 1); setClientNoShows(0); setForm({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival", allergies: "" }); setPolicyAgreed(false); setAppliedDiscount(null); setDiscountCode(""); if (hasLocations) setSelectedLocation(null); };

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
    setActiveCategory("all");
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

  // Check if a time slot overlaps with existing bookings (including break time)
  // For multi-staff salons: only check slots for the same staff member(s)
  const breakBuffer = activeBreakMinutes;
  
  const isTimeSlotBooked = (slotTime) => {
    const slotMinutes = parseInt(slotTime.split(":")[0]) * 60 + parseInt(slotTime.split(":")[1]);
    const myDuration = Math.max(getDuration(), 30); // Minimum 30 min block
    const selectedStaffIds = selectedServices.filter(item => item.staff).map(item => item.staff.id);
    const hasStaffSelection = selectedStaffIds.length > 0;
    
    for (const booked of bookedSlots) {
      if (!booked.time) continue;
      // Multi-staff filtering: if staff is selected, only check overlaps with same staff
      // If no staff selected (solo salon), check all appointments
      if (hasStaffSelection && booked.staff_id && !selectedStaffIds.includes(booked.staff_id)) continue;
      
      const bookedMinutes = parseInt(booked.time.split(":")[0]) * 60 + parseInt(booked.time.split(":")[1]);
      const bookedDuration = Math.max(booked.service_duration || 30, 30);
      // Overlap check with symmetric break buffer on BOTH sides so the break applies
      // whether the new slot precedes or follows the existing booking. Previously the
      // buffer was only added to the trailing side, letting back-to-back slots squeak
      // through the UI that the server would then reject.
      const slotEnd = slotMinutes + myDuration;
      const bookedEnd = bookedMinutes + bookedDuration;
      if (slotMinutes - breakBuffer < bookedEnd && slotEnd + breakBuffer > bookedMinutes) {
        return true;
      }
    }
    return false;
  };

  // Shared time-slot filter: returns available times for a given date
  const getAvailableTimes = (forDate) => {
    const dayHours = getEffectiveHours(forDate);
    const staffWindow = getStaffTimeWindow(forDate);
    const effectiveOpen = staffWindow?.open && staffWindow.open > dayHours.open ? staffWindow.open : dayHours.open;
    const effectiveClose = staffWindow?.close && staffWindow.close < dayHours.close ? staffWindow.close : dayHours.close;
    const serviceDuration = Math.max(getDuration(), 30);
    return TIMES.filter(tt => {
      if (dayHours.closed || staffWindow?.closed) return false;
      if (tt < effectiveOpen || tt >= effectiveClose) return false;
      // Check if service fits before closing time
      const [sh, sm] = tt.split(":").map(Number);
      const slotEndMinutes = sh * 60 + sm + serviceDuration;
      const [ch, cm] = effectiveClose.split(":").map(Number);
      if (slotEndMinutes > ch * 60 + cm) return false;
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
          owner_email: result.owner_email || initialSalon.owner_email || "info@vellu.cc",
          cancel_url: cancelToken ? `https://vellu.cc/cancel/${cancelToken}` : null,
        }).catch(e => console.error("confirmation email failed:", e));

        sendEmails("booking_notification", {
          owner_email: result.owner_email || initialSalon.owner_email || null,
          staff_emails: result.staff_emails || [],
          client_name: clientFullName,
          client_phone: form.phone || null,
          service_name: combinedServiceName,
          date, time,
          price: serverPrice,
          salon_name: result.salon_name || initialSalon.name,
        }).catch(e => console.error("notification email failed:", e));
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

      if (form.payment === "online") {
        sendEmails("invoice", {
          client_name: clientFullName, client_email: clientEmail, service_name: combinedServiceName,
          date, time, price: serverPrice, salon_name: result.salon_name || initialSalon.name,
          salon_address: initialSalon.address || "", salon_kvk: initialSalon.kvk_number || "",
          salon_btw: initialSalon.btw_id || "", salon_iban: initialSalon.iban || "",
        }).catch(e => console.error("invoice email failed:", e));
      }
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
  const todayHoursObj = activeHours[todayDayIndex] || { closed: true };
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
          {(initialSalon.salon_email || initialSalon.owner_email) && (
            <div className="profile-header-contact">
              <NavIcon name="mail" size={14} color={c.textSub} />
              <a href={`mailto:${initialSalon.salon_email || initialSalon.owner_email}`} style={{ color: c.textSub, textDecoration: "none" }}>{initialSalon.salon_email || initialSalon.owner_email}</a>
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
          </div>
        </div>

        {/* ═══ BODY — main + sidebar ═══ */}
        <div className="profile-body">

          {/* ─── MAIN CONTENT ─── */}
          <div className="profile-main">

            {/* SERVICES */}
            <section ref={el => profileSectionRefs.current.services = el} className="profile-section">
              <h2 className="profile-section-title">{t.profileServices}</h2>
              
              {(() => { const usedCats = categories.filter(cat => initialSalon.services.some(s => s.category_id === cat.id)); return usedCats.length > 0 && (
                <div className="profile-cat-scroll">
                  <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 14 }}>
                    <button className={`profile-cat-pill ${profileCategory === "all" ? "active" : ""}`}
                      onClick={() => setProfileCategory("all")}>{t.allCategories}</button>
                    {usedCats.map(cat => (
                      <button key={cat.id} className={`profile-cat-pill ${profileCategory === cat.id ? "active" : ""}`}
                        onClick={() => setProfileCategory(cat.id)}>
                        {lang === "nl" ? (cat.name_nl || cat.name) : (cat.name_en || cat.name_nl || cat.name)}
                      </button>
                    ))}
                  </div>
                </div>
              ); })()}

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
                          {s.duration} {t.min}
                        </span>
                      </div>
                    </div>
                    <div className="profile-service-price">
                      €{s.variants?.length > 0 ? `${Math.min(...s.variants.map(v => parseFloat(v.price)))}+` : s.price}
                    </div>
                    <div className="profile-service-book-btn" onClick={e => { e.stopPropagation(); enterBooking(s); }}>
                      {t.book}
                    </div>
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
                          <div style={{ fontWeight: 500, fontSize: 14, color: c.text }}>{member.name}</div>
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
                {((initialSalon.salon_email || initialSalon.owner_email) || initialSalon.salon_phone || initialSalon.salon_instagram) && (
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 10 }}>{t.contactUs}</h3>
                    {(initialSalon.salon_email || initialSalon.owner_email) && (
                      <div className="profile-contact-row">
                        <NavIcon name="mail" size={14} color={c.textSub} />
                        <a href={`mailto:${initialSalon.salon_email || initialSalon.owner_email}`}>{initialSalon.salon_email || initialSalon.owner_email}</a>
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
                {initialSalon.booking_policy && (
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
                        {initialSalon.booking_policy}
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
                  const dayHrs = activeHours[dayIdx] || { closed: true };
                  const override = initialSalon.day_overrides?.[fmt(checkDate)];
                  if (override?.type === "blocked") continue;
                  const hrs = override?.type === "exception" ? { open: override.open, close: override.close, closed: false } : dayHrs;
                  if (hrs.closed) continue;
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
                  const todayHrs = activeHours[todayDayIndex] || { closed: true };
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
                      const dayHrs = activeHours[dayIdx] || { closed: true };
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
              {((initialSalon.salon_email || initialSalon.owner_email) || initialSalon.salon_phone || initialSalon.salon_instagram) && (
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
                    {(initialSalon.salon_email || initialSalon.owner_email) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: c.textSub }}>
                        <NavIcon name="mail" size={13} color={c.textSub} />
                        <a href={`mailto:${initialSalon.salon_email || initialSalon.owner_email}`} style={{ color: c.textSub, textDecoration: "none", fontSize: 11 }}>{initialSalon.salon_email || initialSalon.owner_email}</a>
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
                <span>{item.variant ? item.variant.duration : item.service.duration} {t.min}{item.staff ? ` · ${item.staff.name}` : ""}</span>
                <span style={{ color: accent }}>€{((item.variant ? parseFloat(item.variant.price) : parseFloat(item.service.price || 0)) + item.extras.reduce((s, e) => s + parseFloat(e.price || 0), 0)).toFixed(2)}</span>
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
            {new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
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
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, color: accent }}>€{getPrice().toFixed(2)}</span>
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
                
                {/* Category tabs */}
                {(() => { const usedCats = categories.filter(cat => initialSalon.services.some(s => s.category_id === cat.id)); return usedCats.length > 0 && (
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, marginBottom: 8 }}>
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
                ); })()}

                {/* Selected services counter */}
                {selectedServices.length > 0 && (
                  <div style={{ background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 14, padding: "10px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: accent, fontWeight: 500 }}>
                      <NavIcon name="check" size={11} color={c.btnOnDark} /> {selectedServices.length} {selectedServices.length === 1 ? t.serviceSelected : t.servicesSelected}
                    </span>
                    <span style={{ fontSize: 12, color: c.textSub }}>{getDuration()} {t.min} · €{getOriginalPrice().toFixed(2)}</span>
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
                  const displayPrice = s.variants?.length > 0 ? `€${Math.min(...s.variants.map(v => parseFloat(v.price)))}+` : `€${s.price}`;
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
                            <NavIcon name="clock" size={10} color={c.textLabel} /> {s.duration} {t.min}
                          </span>
                          {s.variants?.length > 0 && <span style={{ fontSize: 10, color: c.textMuted }}>{s.variants.length} {t.variants?.toLowerCase()}</span>}
                          {s.photos?.length > 1 && <span style={{ fontSize: 10, color: c.textMuted }}>{s.photos.length} {t.photos?.toLowerCase()}</span>}
                        </div>
                      </div>
                      {/* Price */}
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: accent, flexShrink: 0, lineHeight: 1 }}>
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
                                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{v.price}</div>
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
                            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8, fontWeight: 600 }}>{t.selectStaff}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <div onClick={() => updateServiceItem(s.id, { staff: null })}
                                style={{
                                  padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                                  background: !item?.staff ? `${accent}14` : "transparent",
                                  border: `1px solid ${!item?.staff ? accent : c.border}`,
                                  fontSize: 12, fontWeight: 500, color: !item?.staff ? accent : c.textSub,
                                  transition: "all 0.15s"
                                }}>{t.anyStaff}</div>
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
                          const isToday = ds === fmt(getToday());
                          return (
                            <div key={i} role="button" tabIndex={isClosed ? -1 : 0}
                              onClick={() => { if (!isClosed) { setDate(ds); setTime(null); } }}
                              style={{
                                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                                padding: "10px 14px", borderRadius: 12, cursor: isClosed ? "not-allowed" : "pointer",
                                background: isSel ? accent : c.bgCard,
                                border: `1.5px solid ${isSel ? accent : isToday ? `${accent}55` : c.border}`,
                                opacity: isClosed ? 0.3 : 1,
                                transition: "all 0.2s", flexShrink: 0, minWidth: 52, position: "relative"
                              }}>
                              {isToday && !isSel && <div style={{ position: "absolute", top: 5, right: 5, width: 4, height: 4, borderRadius: "50%", background: accent }} />}
                              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: isSel ? c.btnOnDark : c.textLabel }}>{DAY[d.getDay()]}</span>
                              <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 400, color: isSel ? c.btnOnDark : c.text, lineHeight: 1 }}>{d.getDate()}</span>
                              {!isClosed && (
                                <span style={{ fontSize: 8, color: isSel ? `${c.btnOnDark}bb` : c.textMuted, fontWeight: 500, marginTop: 1 }}>
                                  {dayHours.open?.slice(0,5)}–{dayHours.close?.slice(0,5)}
                                </span>
                              )}
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
                      <div style={{ fontSize: 13 }}>{t.noTimesAvailable}</div>
                    </div>
                  );
                  if (freeCount === 0) return (
                    <div style={{ textAlign: "center", padding: "40px 20px" }}>
                      <div style={{ marginBottom: 10, opacity: 0.4 }}><NavIcon name="calendar" size={28} color={c.textMuted} /></div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 6 }}>{lang === "nl" ? "Volgeboekt" : "Fully booked"}</div>
                      <div style={{ fontSize: 12, color: c.textLabel, lineHeight: 1.5 }}>
                        {lang === "nl"
                          ? `Alle ${totalSlots} tijdslots op deze dag zijn geboekt. Kies een andere datum.`
                          : `All ${totalSlots} time slots on this day are booked. Please pick another date.`}
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
                  {form.allergies && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{t.allergyDisclaimer}</div>}
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
                  {[["on-arrival","home",t.payArrival],["online","creditcard",t.payOnline]].map(([v,icon,label]) => (
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
                {initialSalon.booking_policy && (
                  <div style={{ marginBottom: 20, padding: "16px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14 }}>
                    <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.bookingPolicy}</div>
                    <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6, marginBottom: 14, whiteSpace: "pre-wrap" }}>{initialSalon.booking_policy}</div>
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
                  {[[t.date, new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })],[t.time, time],[t.totalDuration, getDuration() + " " + t.min],[t.name, `${form.firstName} ${form.lastName}`],
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
                      date: new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" }),
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
                <button className="btn-primary" disabled={!canProceedStep1} onClick={() => goToStep(2)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  {selectedServices.length > 0 ? (
                    <>{t.next} · {getDuration()} {t.min} · €{getOriginalPrice().toFixed(2)}</>
                  ) : (
                    <>{t.noServicesSelected}</>
                  )}
                </button>
              </>}
              {step === 2 && (
                <button className="btn-primary" disabled={!time} onClick={() => setStep(3)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  {time ? (
                    <>{t.next} · {new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "short", day: "numeric", month: "short" })} {lang === "nl" ? "om" : "at"} {time}</>
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
                <button className="btn-primary" onClick={confirmBooking} disabled={submitting}>{submitting ? "..." : t.confirm}</button>
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
                {/* Back button on cover */}
                <button onClick={done ? reset : (step > (hasLocations ? 0 : 1) ? () => setStep(s => s-1) : () => setMode("profile"))} style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "none", borderRadius: 100, padding: "8px 14px", color: "#fff", fontSize: 12, cursor: "pointer" }}>
                    ←
                  </button>
                <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 6 }}>
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
                    
                    {/* Category tabs */}
                    {(() => { const usedCats = categories.filter(cat => initialSalon.services.some(s => s.category_id === cat.id)); return usedCats.length > 0 && (
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 6 }}>
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
                    ); })()}

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
                                  {s.duration} {t.min}
                                  {(s.photos || []).length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} {t.photos.toLowerCase()}</span>}
                                  {(s.variants?.length > 0) && <span style={{ color: accent, marginLeft: 8 }}>· {s.variants.length} {t.variants.toLowerCase()}</span>}
                                </div>
                              </div>
                            </div>
                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>
                              {s.variants?.length > 0 ? `€${Math.min(...s.variants.map(v => parseFloat(v.price)))}+` : `€${s.price}`}
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
                                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{v.price}</div>
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
                            <SL>{t.selectStaff}</SL>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <div className={`service-card ${!item?.staff ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => updateServiceItem(s.id, { staff: null })}>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{t.anyStaff}</div>
                              </div>
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
                        return (
                          <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} role="button" tabIndex={isClosed ? -1 : 0} aria-label={`${DAY[d.getDay()]} ${d.getDate()}`} aria-disabled={isClosed} onClick={() => { if (!isClosed) { setDate(ds); setTime(null); } }} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !isClosed) { e.preventDefault(); setDate(ds); setTime(null); } }} style={isClosed ? { opacity: 0.35, cursor: "not-allowed" } : {}}>
                            <span style={{ fontSize: 10, color: isSel ? c.btnOnDark : c.textLabel }}>{DAY[d.getDay()]}</span>
                            <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? c.btnOnDark : c.text, marginTop: 2 }}>{d.getDate()}</span>
                            <span style={{ fontSize: 10, color: isSel ? c.btnOnDark : c.textMuted }}>{isClosed ? (lang === "nl" ? "gesloten" : "closed") : MON[d.getMonth()]}</span>
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
                      return availableTimes.length > 0 ? (
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
                        <div style={{ textAlign: "center", padding: "30px 20px", color: c.textLabel, fontSize: 13, marginBottom: 20 }}>
                          {t.noTimesAvailable}
                        </div>
                      );
                    })()}
                    <button className="btn-primary" disabled={!time} onClick={() => setStep(3)}>{t.next}</button>
                  </>}

                  {/* Step 3 — Details (mobile) */}
                  {step === 3 && <>
                    <PTitle sub={t.yourDetailsSub}>{t.yourDetails}</PTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
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
                  {form.allergies && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{t.allergyDisclaimer}</div>}
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
                      {[["on-arrival","home",t.payArrival],["online","creditcard",t.payOnline]].map(([v,icon,label]) => (
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
                    {initialSalon.booking_policy && (
                      <div style={{ marginBottom: 20, padding: "14px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14 }}>
                        <div style={{ fontSize: 10, color: c.textLabel, marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.bookingPolicy}</div>
                        <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{initialSalon.booking_policy}</div>
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
                      {[[t.date, new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })],[t.time, time],[t.totalDuration, getDuration() + " " + t.min],[t.name, `${form.firstName} ${form.lastName}`],
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
                    {t.confirmedSub} {new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })} {t.at} {time}
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
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>€{getPrice().toFixed(2)}</div>
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
      </div>
    </Layout>
  );
}

// ─── VARIANT & EXTRA ADDERS ─────────────────────────────────

export { ClientApp, ReviewForm };
export default ClientApp;
