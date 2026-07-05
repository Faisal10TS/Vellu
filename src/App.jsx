import { useState, useEffect, Component, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase.js";
import {
  ThemeProvider, useTheme, useSEO, ACCENT, T, NavIcon, DEFAULT_HOURS, sendEmails, sendSMS
} from "./shared.jsx";

// ─── LAZY ROUTE CHUNKS ────────────────────────────────────────
const LandingScreen = lazy(() => import("./LandingScreen.jsx").then(m => ({ default: m.LandingScreen })));
const OwnerAuth = lazy(() => import("./LandingScreen.jsx").then(m => ({ default: m.OwnerAuth })));
const ClientApp = lazy(() => import("./ClientApp.jsx"));
const OwnerApp = lazy(() => import("./OwnerApp.jsx"));
const PlanSelection = lazy(() => import("./OwnerApp.jsx").then(m => ({ default: m.PlanSelection })));
const StaffApp = lazy(() => import("./StaffApp.jsx"));
// Admin-only dashboard (app_admins table gating). Lazy so non-admin users
// never download the code.
const AdminDashboard = lazy(() => import("./AdminDashboard.jsx"));
const PrivacyPage = lazy(() => import("./LegalPages.jsx").then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./LegalPages.jsx").then(m => ({ default: m.TermsPage })));
const ContactPage = lazy(() => import("./LegalPages.jsx").then(m => ({ default: m.ContactPage })));
const DpaPage = lazy(() => import("./LegalPages.jsx").then(m => ({ default: m.DpaPage })));
const GoogleIntegrationPage = lazy(() => import("./LegalPages.jsx").then(m => ({ default: m.GoogleIntegrationPage })));

// ─── ROLE RESOLUTION ─────────────────────────────────────────
// Figure out whether a logged-in auth user is a SALON OWNER or a STAFF member.
//
// The staff-link flow works like this:
//   1. Owner creates a staff_members row with an `email` field (but no user_id yet).
//   2. Staff member signs up / logs in at /owner with that email.
//   3. On first login we find the staff row by email + user_id IS NULL, and claim it
//      by setting its user_id to session.user.id. Subsequent logins match by user_id.
//
// Precedence: a staff link to ANOTHER salon wins over the owner path — that
// catches the invite race where handle_new_user leaves a ghost profile behind
// before staff_members.user_id is set. But a staff row where
// owner_id === user.id is the owner listing themselves as staff of their own
// team-account salon (very common); that must stay routed to the owner app.
async function resolveUserRole(user) {
  if (!user) return { role: null };
  const email = (user.email || "").toLowerCase();
  const [{ data: staffByUserId }, { data: ownerProfile }] = await Promise.all([
    supabase.from("staff_members").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("id, business_name").eq("id", user.id).maybeSingle()
  ]);

  let staffMember = staffByUserId;
  if (!staffMember && email) {
    // Try to claim an unlinked staff row that matches our email.
    const { data: staffByEmail } = await supabase.from("staff_members").select("*").eq("email", email).is("user_id", null).maybeSingle();
    if (staffByEmail) {
      const { data: claimed } = await supabase.from("staff_members").update({ user_id: user.id }).eq("id", staffByEmail.id).is("user_id", null).select("*").maybeSingle();
      if (claimed) staffMember = claimed;
    }
  }
  // Self-staff (owner_id === user.id) means the owner added themselves to
  // their own team-account roster — don't hijack their owner dashboard.
  if (staffMember && staffMember.owner_id !== user.id) {
    const { data: salonProfile } = await supabase.from("profiles").select("*").eq("id", staffMember.owner_id).maybeSingle();
    if (salonProfile) {
      return { role: "staff", staffUser: { staffMember, profile: salonProfile, email: user.email } };
    }
  }

  // No cross-salon staff link → owner path. Any profile row is enough to
  // route into the owner app; PlanSelection / onboarding handle the
  // empty-profile case.
  if (ownerProfile) return { role: "owner" };
  return { role: null };
}

function OwnerEntryPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const [owner, setOwner] = useState(null);
  const [staffUser, setStaffUser] = useState(null); // { staffMember, salonData }
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount (and on auth state changes so password-reset
  // callbacks / magic links don't race the initial mount).
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) {
        const resolved = await resolveUserRole(session.user);
        if (cancelled) return;
        if (resolved.role === "staff") { setStaffUser(resolved.staffUser); setLoading(false); return; }
        if (resolved.role === "owner") {
          // Rebuild the owner view-model from the full profile.
          const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
          if (profile) {
            setOwner({
              name: profile.business_name || "Mijn Salon",
              email: session.user.email,
              slug: profile.slug || session.user.email.split("@")[0],
              city: profile.city || "Nederland",
              id: session.user.id,
              accent: profile.accent_color,
              plan: profile.plan || null,
              plan_expires_at: profile.plan_expires_at || null,
              account_type: profile.account_type || "joint"
            });
          }
        }
      }
      setLoading(false);
    };
    hydrate();
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, _session) => { hydrate(); });
    return () => { cancelled = true; authSub?.subscription?.unsubscribe?.(); };
  }, []);

  const handleLogin = async (u) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const resolved = await resolveUserRole(session.user);
      if (resolved.role === "staff") { setStaffUser(resolved.staffUser); return; }
      if (resolved.role === "owner") { setOwner(u); return; }
    }
    setOwner(u);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setOwner(null);
    setStaffUser(null);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg, color: c.textLabel, fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      <div style={{ width: 40, height: 40, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  // Staff member — redirect to /staff
  if (staffUser) return <Navigate to="/staff" replace />;

  // Check if plan is active
  // If plan_expires_at is a date-only string (YYYY-MM-DD) the plan is valid through the END of that day.
  // If it's a full timestamp, use it as-is — do NOT special-case only length===10.
  const hasPlan = owner?.plan && (!owner.plan_expires_at || new Date(typeof owner.plan_expires_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(owner.plan_expires_at) ? owner.plan_expires_at + "T23:59:59" : owner.plan_expires_at) > new Date());

  if (owner && !hasPlan) {
    return <PlanSelection user={owner} lang={lang} setLang={setLang} onLogout={handleLogout} />;
  }

  if (owner) {
    return <OwnerApp user={owner} lang={lang} setLang={setLang} salons={{}} onSalonUpdate={() => {}} onLogout={handleLogout} />;
  }

  return <OwnerAuth lang={lang} setLang={setLang} onBack={() => navigate("/")} onLogin={handleLogin} />;
}

// ─── STAFF ENTRY PAGE (vellu.cc/staff) ──────────────────────
function StaffEntryPage({ lang, setLang, staffUser: propStaffUser, onLogout: propOnLogout }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const [staffUser, setStaffUser] = useState(propStaffUser || null);
  const [loading, setLoading] = useState(!propStaffUser);

  useEffect(() => {
    if (propStaffUser) return;
    let cancelled = false;
    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) {
        const resolved = await resolveUserRole(session.user);
        if (cancelled) return;
        if (resolved.role === "staff") { setStaffUser(resolved.staffUser); setLoading(false); return; }
      }
      // Not a staff member — redirect to /owner
      setLoading(false);
      navigate("/owner", { replace: true });
    };
    hydrate();
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, _session) => { if (!propStaffUser) hydrate(); });
    return () => { cancelled = true; authSub?.subscription?.unsubscribe?.(); };
  }, []);

  const handleLogout = propOnLogout || (async () => {
    await supabase.auth.signOut();
    navigate("/owner");
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg }}>
      <div style={{ width: 40, height: 40, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (!staffUser) return null;

  return <StaffApp staffUser={staffUser} lang={lang} setLang={setLang} onLogout={handleLogout} />;
}

// ─── SALON ROUTE WRAPPER ─────────────────────────────────────
function SalonRouteWrapper({ lang, setLang }) {
  const { colors: c } = useTheme();
  const { slug } = useParams();
  // Reserved routes go to main app — pass lang/setLang down so the Landing/Legal pages
  // inside AppInner don't receive undefined and crash on T[lang].
  if (slug === "owner" || slug === "staff" || slug === "login" || slug === "admin" || slug === "privacy" || slug === "terms" || slug === "voorwaarden" || slug === "contact" || slug === "dpa") {
    return <AppInner lang={lang} setLang={setLang} />;
  }
  return <SalonRoute lang={lang} setLang={setLang} />;
}

// ─── SALON ROUTE (vellu.cc/salon-naam) ───────────────────────
function SalonRoute({ lang, setLang }) {
  const { colors: c } = useTheme();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [salon, setSalon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Check Supabase
      const { data, error } = await supabase.from("profiles").select("*, services(*, service_variants(*), service_extras(*), service_photos(*))").eq("slug", slug).single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      // Load related data in parallel for faster page load
      const [
        { data: reviews },
        { data: staffData },
        { data: categories },
        { data: locData }
      ] = await Promise.all([
        supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false }),
        supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).eq("active", true).order("position"),
        supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position"),
        supabase.from("locations").select("*").eq("owner_id", data.id).eq("active", true).order("position")
      ]);
      setSalon({
        id: data.slug,
        owner_id: data.id,
        name: data.business_name || data.owner_name || "Studio",
        city: data.city || "Nederland",
        country_code: data.country_code || "NL",
        address: data.address || "",
        accent: data.accent_color || "#c9a96e",
        // NOTE: the owner's login email is deliberately NOT exposed here. The
        // public page only ever shows `salon_email` (a separate, owner-chosen
        // contact address). Booking confirmation/notification emails to the
        // owner are sent server-side by the book-appointment edge function
        // (salon_email || login email), so the public payload never needs it.
        business_hours: data.business_hours || DEFAULT_HOURS,
        account_type: data.account_type || "joint",
        booking_policy: data.booking_policy || "",
        booking_policy_en: data.booking_policy_en || "",
        salon_phone: data.salon_phone || "",
        salon_instagram: data.salon_instagram || "",
        salon_email: data.salon_email || "",
        whatsapp_number: data.whatsapp_number || "",

        phone_required: data.phone_required || false,
        break_minutes: data.break_minutes || 0,
        logo_url: data.logo_url || "",
        cover_image_url: data.cover_image_url || "",
        cover_focal_y: data.cover_focal_y ?? 50,
        discount_codes: (data.discount_codes || []).filter(d => d.active),
        day_overrides: data.day_overrides || {},
        min_advance_hours: data.min_advance_hours || 0,
        max_advance_days: data.max_advance_days || 60,
        // Sort by `position` (the owner's drag-drop order) so the public page
        // renders services in the same order as the owner dashboard.
        // Fall back to created_at for rows that predate the position column.
        services: (data.services || [])
          .slice()
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
        appointments: [],
        reviews: reviews || [],
        staff: (staffData || []).map(s => ({ ...s, service_ids: (s.staff_services || []).map(ss => ss.service_id), working_hours: s.working_hours || null })),
        categories: categories || [],
        locations: locData || []
      });
      setLoading(false);
    };
    load();
  }, [slug]);

  // Dynamic SEO for salon pages
  useSEO({
    title: salon ? `${salon.name} | Vellu` : undefined,
    description: salon ? `${lang === "nl" ? "Boek een afspraak bij" : "Book an appointment at"} ${salon.name}${salon.city ? ` in ${salon.city}` : ""}. ${lang === "nl" ? "Online boeken, geen commissie." : "Book online, no commission."}` : undefined,
    ogImage: salon?.cover_image_url || salon?.logo_url || undefined,
    url: `https://vellu.cc/${slug}`
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg, color: c.textLabel, fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      <div style={{ width: 40, height: 40, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (notFound) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg, color: c.text, fontFamily: "'Jost',sans-serif", gap: 16 }}>

      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>{lang === "nl" ? "Salon niet gevonden" : "Salon not found"}</div>
      <div style={{ fontSize: 12, color: c.textLabel }}>vellu.cc/{slug} {lang === "nl" ? "bestaat niet" : "does not exist"}</div>
      <button className="btn-ghost" onClick={() => navigate("/")}>← {lang === "nl" ? "Terug naar home" : "Back to home"}</button>
    </div>
  );

  // Security: never trust an ?email= URL param for reviews — anyone can craft a URL to
  // impersonate a victim. If we want pre-fill, it must come from a signed token later.
  return <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => navigate("/")} reviewMode={new URLSearchParams(window.location.search).get("review") === "true"} reviewEmail="" />;
}

// ─── CANCEL ROUTE (vellu.cc/cancel/TOKEN) ─────────────────────
function CancelRoute({ lang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const { token } = useParams();
  const t = T[lang];
  const [status, setStatus] = useState("loading");
  const [appointment, setAppointment] = useState(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const checkToken = async () => {
      // Look up token via edge function — cancellation_tokens table is
      // locked down to service_role only, no direct client access.
      const { data, error } = await supabase.functions.invoke("cancel-appointment", {
        body: { action: "check", token },
      });
      if (error || !data) {
        setStatus("error");
        return;
      }
      if (data.status === "already_cancelled") { setStatus("cancelled"); return; }
      if (data.status === "expired") { setStatus("expired"); return; }
      if (data.status === "valid" && data.appointment) {
        setAppointment(data.appointment);
        setStatus("confirm");
        return;
      }
      setStatus("error");
    };
    checkToken();
  }, [token]);

  const handleCancel = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("cancel-appointment", {
        body: { action: "cancel", token, reason: reason || null },
      });
      if (error || !data || data.status !== "cancelled") {
        throw new Error(data?.error || error?.message || "cancel_failed");
      }

      const a = data.appointment;
      const notify = data.notify || {};

      await sendEmails("booking_cancelled", {
        client_name: a.client_name,
        client_email: a.client_email,
        service_name: a.service_name,
        date: a.date,
        time: a.time,
        salon_name: notify.salon_name || "",
        salon_accent: notify.salon_accent || "", salon_logo: notify.salon_logo || "", lang,
      });

      // SMS mirror — gated server-side to Pro plan + valid phone. The
      // cancellation flow returns the notify.owner_id we need for the gate.
      if (a.client_phone && notify.owner_id) {
        sendSMS("booking_cancelled", {
          client_name: a.client_name,
          client_phone: a.client_phone,
          service_name: a.service_name,
          date: a.date,
          time: a.time,
          salon_name: notify.salon_name || "",
          owner_id: notify.owner_id,
          lang,
        }).catch(e => console.error("cancellation SMS failed:", e));
      }

      // Notify owner + staff about cancellation
      if (notify.owner_email) {
        const staffEmails = notify.staff_email ? [notify.staff_email] : [];
        await sendEmails("booking_notification", {
          owner_email: notify.owner_email,
          staff_emails: staffEmails,
          client_name: a.client_name, client_phone: null,
          service_name: `GEANNULEERD: ${a.service_name}`,
          date: a.date, time: a.time,
          price: a.service_price || 0,
          salon_name: notify.salon_name || "",
          salon_accent: notify.salon_accent || "", salon_logo: notify.salon_logo || "", lang,
        });
      }

      // Delete Google Calendar event if it exists (best effort)
      if (a.owner_id) {
        supabase.functions.invoke("google-calendar", {
          body: { action: "delete", owner_id: a.owner_id, appointment_id: a.id }
        }).catch(e => console.error("Google Calendar delete error:", e));
      }

      setStatus("cancelled");
    } catch (err) {
      console.error("Cancel error:", err);
      setStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: c.bg, fontFamily: "'Jost',sans-serif", color: c.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>

      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        {status === "loading" && (
          <div style={{ color: c.textLabel }}>{lang === "nl" ? "laden..." : "loading..."}</div>
        )}
        
        {status === "confirm" && appointment && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}><NavIcon name="calendar" size={48} color={ACCENT} /></div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {t.cancelBooking}
            </h1>
            <p style={{ color: c.textSub, marginBottom: 30 }}>{t.cancelBookingDesc}</p>
            
            <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 20, marginBottom: 24, textAlign: "left" }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.treatment}</div>
                <div style={{ fontWeight: 500 }}>{appointment.service_name}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.date}</div>
                <div style={{ fontWeight: 500 }}>{appointment.date} {lang === "nl" ? "om" : "at"} {appointment.time}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.total}</div>
                <div style={{ fontWeight: 500, color: ACCENT }}>€{parseFloat(appointment.service_price).toFixed(2)}</div>
              </div>
            </div>
            
            <textarea 
              className="input-field" 
              placeholder={t.cancellationReason}
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ minHeight: 80, marginBottom: 16, resize: "none" }}
            />
            
            <button className="btn-primary" style={{ background: "#ef4444", width: "100%" }} onClick={handleCancel}>
              {t.confirmCancel}
            </button>
            
            <button className="btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => navigate("/")}>
              {t.back}
            </button>
          </div>
        )}
        
        {status === "cancelled" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}><NavIcon name="check" size={48} color="#86efac" /></div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {t.bookingCancelled}
            </h1>
            <p style={{ color: c.textSub, marginBottom: 30 }}>
              {lang === "nl" ? "Je ontvangt een bevestiging per e-mail." : "You will receive a confirmation email."}
            </p>
            <button className="btn-ghost" onClick={() => navigate("/")}>
              {lang === "nl" ? "Terug naar home" : "Back to home"}
            </button>
          </div>
        )}
        
        {status === "expired" && (
          <div className="fade-up">
            <div style={{ fontSize: 48, marginBottom: 20 }}>⏰</div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {t.cannotCancel}
            </h1>
            <p style={{ color: c.textSub, marginBottom: 30 }}>{t.cancelBeforeTime}</p>
            <button className="btn-ghost" onClick={() => navigate("/")}>
              {lang === "nl" ? "Terug naar home" : "Back to home"}
            </button>
          </div>
        )}
        
        {status === "error" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}><NavIcon name="xmark" size={48} color="#f87171" /></div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {lang === "nl" ? "Link ongeldig" : "Invalid link"}
            </h1>
            <p style={{ color: c.textSub, marginBottom: 30 }}>
              {lang === "nl" ? "Deze annuleringslink is niet geldig." : "This cancellation link is not valid."}
            </p>
            <button className="btn-ghost" onClick={() => navigate("/")}>
              {lang === "nl" ? "Terug naar home" : "Back to home"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ADMIN ROUTE GUARD ───────────────────────────────────────
// Quick auth check: if no session, bounce to /owner (the login page).
// Otherwise render AdminDashboard, which does the real is_admin() check
// via RPC. Keeps anonymous visitors from seeing the admin chrome even
// briefly.
function AdminRoute() {
  const [authed, setAuthed] = useState(null); // null = loading, false = no session
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setAuthed(!!data.session);
      if (!data.session) navigate("/owner", { replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate]);

  if (!authed) return null; // either still loading or already bouncing away
  return <AdminDashboard onLogout={() => supabase.auth.signOut().then(() => navigate("/"))} />;
}

// ─── ROOT ─────────────────────────────────────────────────────
function AppInner({ lang, setLang }) {
  const { colors: c } = useTheme();
  const [screen, setScreen] = useState("landing");
  const [salon, setSalon] = useState(null);
  const [owner, setOwner] = useState(null);
  const [salons, setSalons] = useState({});

  const updateSalon = (updated) => setSalons(prev => ({ ...prev, [updated.id]: updated }));
  const handleSelectSalon = (s) => { setSalon(salons[s.id] || s); setScreen("client"); };

  return (
    <>
      {screen === "landing" && <LandingScreen lang={lang} setLang={setLang} salons={salons} onSelectSalon={handleSelectSalon} onOwnerEnter={() => setScreen("ownerAuth")} />}
      {screen === "client" && <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => setScreen("landing")} />}
      {screen === "ownerAuth" && <OwnerAuth lang={lang} setLang={setLang} onBack={() => setScreen("landing")} onLogin={u => { setOwner(u); setScreen("owner"); }} />}
      {screen === "owner" && (() => {
        // If plan_expires_at is a date-only string (YYYY-MM-DD) the plan is valid through the END of that day.
  // If it's a full timestamp, use it as-is — do NOT special-case only length===10.
  const hasPlan = owner?.plan && (!owner.plan_expires_at || new Date(typeof owner.plan_expires_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(owner.plan_expires_at) ? owner.plan_expires_at + "T23:59:59" : owner.plan_expires_at) > new Date());
        if (!hasPlan) return <PlanSelection user={owner} lang={lang} setLang={setLang} onLogout={async () => { await supabase.auth.signOut(); setOwner(null); setScreen("landing"); }} />;
        return <OwnerApp user={owner} lang={lang} setLang={setLang} salons={salons} onSalonUpdate={updateSalon} onLogout={async () => { await supabase.auth.signOut(); setOwner(null); setScreen("landing"); }} />;
      })()}
    </>
  );
}

// ─── COOKIE CONSENT ──────────────────────────────────────────
function CookieConsent({ lang }) {
  const { colors: c } = useTheme();
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("vellu_cookies_accepted")) {
      setTimeout(() => setVisible(true), 1500);
    }
  }, []);

  // Don't show on authenticated dashboards or cancel page — those are logged-in
  // contexts where the banner would be redundant noise (and the cancel page is
  // reached from an email link where any consent dance is pointless).
  if (!visible || location.pathname.startsWith("/owner") || location.pathname.startsWith("/staff") || location.pathname.startsWith("/cancel")) return null;

  return (
    <div style={{
      position: "fixed", bottom: 20, left: 20, right: 20, maxWidth: 420, margin: "0 auto",
      background: c.bg, border: "1px solid " + c.border, borderRadius: 18,
      padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 9999,
      fontFamily: "'Jost',sans-serif", animation: "fadeUp 0.4s ease"
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: c.text, fontWeight: 500, marginBottom: 3 }}><NavIcon name="cookie" size={12} color={c.text} /> Cookies</div>
        <div style={{ fontSize: 10, color: c.textSub, lineHeight: 1.5 }}>
          {lang === "nl" 
            ? "Wij gebruiken alleen functionele cookies. " 
            : "We only use functional cookies. "}
          <a href="/privacy" style={{ color: ACCENT, textDecoration: "none" }}>{lang === "nl" ? "Meer info" : "Learn more"}</a>
        </div>
      </div>
      <button onClick={() => { localStorage.setItem("vellu_cookies_accepted", "true"); setVisible(false); }}
        aria-label={lang === "nl" ? "Begrepen" : "Got it"}
        style={{ background: ACCENT, color: c.btnOnDark, border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Jost',sans-serif", flexShrink: 0 }}>
        {lang === "nl" ? "Begrepen" : "Got it"}
      </button>
    </div>
  );
}

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err, info) { console.error("ErrorBoundary caught:", err, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0b0a", color: "#ede8e0", fontFamily: "system-ui, sans-serif", padding: 32, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 8 }}>Er ging iets mis</div>
          <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 24 }}>Something went wrong</div>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid rgba(237,232,224,0.15)", background: "transparent", color: "#ede8e0", cursor: "pointer", fontSize: 13 }}>
            Herlaad pagina / Reload
          </button>
        </div>
      </div>
    );
  }
}

export default function VelluApp() {
  const [lang, setLang] = useState("nl");
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<AppInner lang={lang} setLang={setLang} />} />
              <Route path="/owner" element={<OwnerEntryPage lang={lang} setLang={setLang} />} />
              <Route path="/staff" element={<StaffEntryPage lang={lang} setLang={setLang} />} />
              <Route path="/cancel/:token" element={<CancelRoute lang={lang} />} />
              <Route path="/privacy" element={<PrivacyPage lang={lang} setLang={setLang} />} />
              <Route path="/terms" element={<TermsPage lang={lang} setLang={setLang} />} />
              {/* Dutch alias — Vellu is NL-first so /voorwaarden must work */}
              <Route path="/voorwaarden" element={<TermsPage lang={lang} setLang={setLang} />} />
              <Route path="/contact" element={<ContactPage lang={lang} setLang={setLang} />} />
              <Route path="/dpa" element={<DpaPage lang={lang} setLang={setLang} />} />
              {/* Google OAuth verification wants a dedicated public page; this
                  describes the Google Calendar integration + Limited Use. */}
              <Route path="/integrations/google" element={<GoogleIntegrationPage lang={lang} setLang={setLang} />} />
              {/* Admin route — rendered for anyone, but the component itself
                  calls is_admin() via RPC and shows "Not authorised" for
                  non-admins. Real enforcement sits in the DB (app_admins). */}
              <Route path="/admin" element={<AdminRoute />} />
              <Route path="/:slug" element={<SalonRouteWrapper lang={lang} setLang={setLang} />} />
            </Routes>
          </Suspense>
            <CookieConsent lang={lang} />
          </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
