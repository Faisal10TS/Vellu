import { useState, useEffect, useRef, Component, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation, useNavigationType } from "react-router-dom";
import { supabase, rememberStaffInviteFromUrl, readStaffInvite, claimStaffInvite } from "./supabase.js";
import {
  ThemeProvider, useTheme, useSEO, ACCENT, T, NavIcon, DEFAULT_HOURS, fmt, parseDate, Layout, curSym, fmtAmt,
  AT, AT_COLORS, AT_RADIUS, AtelierSkin, salonNow, ToastContainer
} from "./shared.jsx";

// ─── LAZY ROUTE CHUNKS ────────────────────────────────────────
// Op deze branch (landing-atelier) draait de "Atelier"-richting: ivoor
// redactioneel, ter vergelijking naast de Signature-branch. OwnerAuth blijft
// gewoon uit LandingScreen.jsx komen.
const LandingScreen = lazy(() => import("./LandingAtelier.jsx").then(m => ({ default: m.LandingScreen })));
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
// Beoordeel Vellu: de pagina achter de link in de beoordelingsmail aan salons
// (token in de URL is de toegang, geen inlog). Zie src/RateVellu.jsx.
const RateVelluPage = lazy(() => import("./RateVellu.jsx"));

// ─── PLAN-TOEGANG ─────────────────────────────────────────────
// Mag deze eigenaar de app in? Normaal: een plan én plan_expires_at in de
// toekomst (een datum zonder tijd geldt tot het EINDE van die dag).
//
// Verlengingscoulance (sinds 2026-08-22): voor een LOPEND betaald abonnement
// (subscription_status 'active' + Mollie-abonnement) geldt 3 dagen speling ná
// plan_expires_at. Mollie incasseert de verlenging op zijn eigen moment en pas
// de webhook (recurring.paid) schuift plan_expires_at op; komt die webhook te
// laat of even niet aan, dan stond een betalende salon tot nu toe op de minuut
// voor een dichte deur. Mislukt de incasso écht, dan zet de webhook
// subscription_status op 'past_due' en vervalt de coulance direct. Proefaccounts
// en jaarklanten-zonder-abonnement (eenmalige betaling) hebben geen
// mollie_subscription_id en krijgen hem dus nooit.
const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
function planIsActive(owner) {
  if (!owner?.plan) return false;
  const raw = owner.plan_expires_at;
  if (!raw) return true;
  const exp = new Date(typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + "T23:59:59" : raw);
  const now = new Date();
  if (exp > now) return true;
  const renewing = owner.subscription_status === "active" && !!owner.mollie_subscription_id;
  return renewing && (now - exp) < RENEWAL_GRACE_MS;
}

// Poortje vóór het "Kies een plan"-scherm. Het founder/beheerdersaccount heeft
// GEEN salonprofiel (het ís geen salon) en viel op /owner daardoor door alle
// checks heen op de plan-muur — een doodlopende weg, want de beheerder hoort op
// /admin (27-08-2026). Eén rpc-check vóór we de muur tonen: beheerders gaan
// door naar /admin, iedereen anders ziet gewoon de plannen. De rpc draait
// alleen op dit pad, dus salons met een geldig plan merken er niets van.
function PlanSelectionGate(props) {
  const navigate = useNavigate();
  const [showPlans, setShowPlans] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.rpc("is_admin")
      .then(({ data }) => {
        if (!alive) return;
        if (data === true) navigate("/admin", { replace: true });
        else setShowPlans(true);
      })
      .catch(() => { if (alive) setShowPlans(true); });
    return () => { alive = false; };
  }, [navigate]);
  if (!showPlans) return null;
  return <PlanSelection {...props} />;
}

// ─── ROLE RESOLUTION ─────────────────────────────────────────
// Figure out whether a logged-in auth user is a SALON OWNER or a STAFF member.
//
// The staff-link flow works like this:
//   1. Owner creates a staff_members row with an `email` field (but no user_id yet).
//   2. Vellu mails that address an invite link: /owner?invite=<token>
//      (create-staff-account, action 'invite'). OwnerEntryPage keeps the
//      token in sessionStorage (src/supabase.js).
//   3. The stylist signs up or logs in; with a stored token we call
//      claim_staff_invite, which binds the row to session.user.id in the
//      database. Subsequent logins match by user_id.
//   Matching on e-mail alone is gone (R-02): signup is auto-confirmed, so an
//   e-mail address proves nothing — anyone who knew a pending stylist's
//   address could take her place. The owner-created login ("Login aanmaken")
//   still links the row server-side and matches by user_id here.
//
// Precedence: a staff link to ANOTHER salon wins over the owner path — that
// catches the invite race where handle_new_user leaves a ghost profile behind
// before staff_members.user_id is set. But a staff row where
// owner_id === user.id is the owner listing themselves as staff of their own
// team-account salon (very common); that must stay routed to the owner app.
// inviteOutcome: uitkomst van een claim met een bewaard uitnodigingstoken
// ('claimed' | 'invalid_or_expired' | 'has_salon' | 'failed'), of null als er
// niets te claimen viel. OwnerEntryPage toont bij de laatste twee echte
// weigeringen een melding.
// role 'staff_inactive': teamlid van een andere salon zonder salonprofiel
// (gedeactiveerd, of de salon was niet te laden; zie reason) en zonder eigen
// salon. OwnerEntryPage logt dan uit met een melding.
async function resolveUserRole(user) {
  if (!user) return { role: null, inviteOutcome: null };
  const [{ data: staffByUserId }, { data: ownerProfile }] = await Promise.all([
    supabase.from("staff_members").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("id, business_name").eq("id", user.id).maybeSingle()
  ]);

  let staffMember = staffByUserId;
  let inviteOutcome = null;
  if (!staffMember) {
    // Uitnodiging uit de mail (token in sessionStorage, zie supabase.js):
    // de database koppelt de rij aan deze login, daarna lezen we hem gewoon
    // op user_id. Geen token = geen koppeling meer op e-mailadres.
    const invite = readStaffInvite();
    if (invite) {
      inviteOutcome = await claimStaffInvite(invite);
      if (inviteOutcome === "claimed") {
        const { data: claimed } = await supabase.from("staff_members").select("*").eq("user_id", user.id).maybeSingle();
        if (claimed) staffMember = claimed;
      }
    }
  }
  // Self-staff (owner_id === user.id) means the owner added themselves to
  // their own team-account roster — don't hijack their owner dashboard.
  if (staffMember && staffMember.owner_id !== user.id) {
    // Salonprofiel via de rpc staff_salon_profile: hetzelfde object als de
    // profielrij, maar zonder geheimen (agenda-feedtoken, Google-token,
    // Mollie-id's, facturatieprofielen…). Een medewerker mag de profielrij
    // van de salon niet meer zelf lezen (S1-12).
    let { data: salonProfile, error: profileErr } = await supabase.rpc("staff_salon_profile");
    if (profileErr) {
      // Uitrolvangnet: staat deze frontend live vóór de migratie met de rpc
      // (PGRST202/404), dan nog één keer de oude rechtstreekse lezing. Die
      // policy verdwijnt pas ná deze deploy; daarna geeft dit gewoon niets.
      const { data: legacy } = await supabase.from("profiles").select("*").eq("id", staffMember.owner_id).maybeSingle();
      salonProfile = legacy || null;
    }
    if (salonProfile) {
      return { role: "staff", staffUser: { staffMember, profile: salonProfile, email: user.email }, inviteOutcome };
    }
    // Geen salonprofiel: de rpc geeft alleen een ACTIEF teamlid haar salon
    // (gedeactiveerd), of de salon was niet te laden. Niet doorvallen naar het
    // eigenaarspad zonder profiel: dan zag ze ingelogd het inlogscherm of
    // "kies een plan". Heeft ze daarnaast een eigen salon, dan gaat ze daar
    // gewoon heen (hieronder).
    if (!ownerProfile) {
      return { role: "staff_inactive", reason: staffMember.active === false ? "inactive" : "unavailable", inviteOutcome };
    }
  }

  // No cross-salon staff link → owner path. Any profile row is enough to
  // route into the owner app; PlanSelection / onboarding handle the
  // empty-profile case.
  if (ownerProfile) return { role: "owner", inviteOutcome };
  return { role: null, inviteOutcome };
}

// ─── PUSH BIJ UITLOGGEN ──────────────────────────────────────
// Uitloggen = dit apparaat krijgt geen pushmeldingen van dit account meer
// (O8-21). Voorheen bleef een baliecomputer of -iPad na uitloggen
// boekingsmeldingen (klantnaam, dienst, tijd, bedrag) tonen, en zag een
// volgende eigenaar op hetzelfde apparaat "aan" terwijl de pushes nog naar
// de vorige gingen. Eerst de eigen rij weg (kan alleen nog met de sessie),
// dan het abonnement in de browser opzeggen; dat laatste maakt het endpoint
// ook ongeldig voor een rij die niet van ons is. Altijd best effort en met
// een tijdslimiet: uitloggen mag hier nooit op blijven hangen.
async function forgetPushOnThisDevice() {
  const limit = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  const run = async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // getRegistration i.p.v. .ready: .ready wacht eeuwig als er geen
    // service worker is.
    const reg = await limit(navigator.serviceWorker.getRegistration(), 1500);
    const sub = reg?.pushManager ? await limit(reg.pushManager.getSubscription(), 1500) : null;
    if (!sub) return;
    await limit(supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint), 2000);
    // Opzeggen in de browser heeft de sessie niet nodig: niet op wachten, dan
    // hangt de uitlogknop alleen nog op het wissen van de rij.
    sub.unsubscribe().catch(() => {});
  };
  try { await limit(run().catch(() => {}), 3500); } catch { /* uitloggen gaat altijd door */ }
}

function OwnerEntryPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const [owner, setOwner] = useState(null);
  const [staffUser, setStaffUser] = useState(null); // { staffMember, salonData }
  const [loading, setLoading] = useState(true);
  // Meldingen als een uitnodiging niet (meer) kan of een teamaccount geen
  // salon (meer) heeft. Eigen lijst i.p.v. useToast: die verdwijnt na 3
  // seconden, te kort voor deze zinnen, en dit is het enige teken dat er iets
  // niet doorging. Eén keer zolang hij in beeld staat, ook al lopen de
  // sessie-check en het inlogformulier tegelijk.
  // Alleen refs en de (stabiele) state-setter: de sessie-check hieronder
  // draait in een effect dat maar één keer wordt opgezet en houdt dus de
  // versie van de eerste render vast; de taal komt daarom uit een ref.
  const [notices, setNotices] = useState([]);
  const noticesShown = useRef(new Set());
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; });
  const notify = (key, msg) => {
    if (noticesShown.current.has(key)) return;
    noticesShown.current.add(key);
    setNotices(prev => [...prev, { id: key, message: msg, type: "error" }]);
    setTimeout(() => {
      noticesShown.current.delete(key);
      setNotices(prev => prev.filter(n => n.id !== key));
    }, 10000);
  };
  const noteInvite = (outcome) => {
    if (outcome !== "invalid_or_expired" && outcome !== "has_salon") return;
    const lang = langRef.current;
    const msg = outcome === "has_salon"
      ? (lang === "nl" ? "Dit account heeft al een eigen salon. Gebruik een ander e-mailadres voor je teamaccount."
        : lang === "es" ? "Esta cuenta ya tiene su propio salón. Usa otro correo electrónico para tu cuenta de equipo."
        : "This account already has its own salon. Use a different email address for your team account.")
      : (lang === "nl" ? "Deze uitnodiging is verlopen of al gebruikt."
        : lang === "es" ? "Esta invitación ha caducado o ya se ha usado."
        : "This invitation has expired or was already used.");
    notify("invite_" + outcome, msg);
  };
  // Teamlid zonder salonprofiel (resolveUserRole 'staff_inactive'): uitloggen
  // met uitleg, i.p.v. ingelogd op het inlogscherm of bij "kies een plan".
  const noteStaffInactive = (reason) => {
    const lang = langRef.current;
    const msg = reason === "inactive"
      ? (lang === "nl" ? "Je teamaccount is gedeactiveerd. Neem contact op met je salon."
        : lang === "es" ? "Tu cuenta de equipo ha sido desactivada. Ponte en contacto con tu salón."
        : "Your team account has been deactivated. Please contact your salon.")
      : (lang === "nl" ? "Je salon kon niet worden geladen. Log opnieuw in."
        : lang === "es" ? "No se pudo cargar tu salón. Vuelve a iniciar sesión."
        : "Your salon could not be loaded. Please sign in again.");
    notify("staff_" + reason, msg);
  };

  // Wachtwoord-herstel. De reset-mail landt hier met een hash: bij een geldig
  // token #access_token=…&type=recovery, bij een verlopen of al gebruikt token
  // #error_code=otp_expired. Beide werden genegeerd: supabase-js maakte bij een
  // geldig token stil een sessie aan (ingelogd zonder ooit een nieuw wachtwoord
  // te vragen) en bij een verlopen token zag de gebruiker gewoon het inlogscherm
  // — zonder wachtwoord, zonder uitleg. Let op: het token is eenmalig, en
  // Gmail's linkscanner opent de link soms vóór de gebruiker; dan telt de echte
  // klik als "al gebruikt". Daarom verdient juist dat pad een nette uitleg.
  // De hash synchroon bij de eerste render lezen, vóór supabase-js hem opruimt.
  const [recovery, setRecovery] = useState(() => {
    try { return new URLSearchParams((window.location.hash || "").replace(/^#/, "")).get("type") === "recovery"; }
    catch { return false; }
  });
  const [recoveryError, setRecoveryError] = useState(() => {
    try {
      const h = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
      return h.get("error_code") || h.get("error") ? (h.get("error_description") || h.get("error_code") || "error") : "";
    } catch { return ""; }
  });

  // Check for existing session on mount (and on auth state changes so password-reset
  // callbacks / magic links don't race the initial mount).
  useEffect(() => {
    let cancelled = false;
    // Uitnodigingslink (?invite=<token>, R-02): bewaren vóór de sessie-check
    // hieronder, die hem bij een bestaande sessie meteen gebruikt. Het
    // inlogformulier verschijnt pas ná die check, dus ziet hem ook.
    rememberStaffInviteFromUrl();
    // Hard stop on the spinner. Every exit path below must clear `loading`,
    // including the ones nobody plans for: a throw, or a supabase call that
    // neither resolves nor rejects (a hung request leaves the finally-block
    // unreached, which is exactly how this screen used to spin forever).
    // Falling through to the login form is recoverable; an endless spinner
    // is not.
    const watchdog = setTimeout(() => { if (!cancelled) setLoading(false); }, 12000);
    const hydrate = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          const resolved = await resolveUserRole(session.user);
          if (cancelled) return;
          noteInvite(resolved.inviteOutcome);
          if (resolved.role === "staff") { setStaffUser(resolved.staffUser); return; }
          if (resolved.role === "staff_inactive") {
            noteStaffInactive(resolved.reason);
            // SIGNED_OUT draait hydrate opnieuw: zonder sessie het inlogscherm.
            await supabase.auth.signOut();
            return;
          }
          if (resolved.role === "owner") {
            // Rebuild the owner view-model from the full profile.
            const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
            if (cancelled) return;
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
                // Nodig voor de verlengingscoulance in planIsActive().
                subscription_status: profile.subscription_status || null,
                mollie_subscription_id: profile.mollie_subscription_id || null,
                account_type: profile.account_type || "joint"
              });
            } else {
              // Sessie mét owner-rol maar zónder profielrij: het founder-
              // account. Zonder deze tak bleef owner null en toonde /owner het
              // INLOGscherm terwijl je al ingelogd was. Beheerder → /admin.
              const { data: adm } = await supabase.rpc("is_admin");
              if (!cancelled && adm === true) { navigate("/admin", { replace: true }); return; }
            }
          }
        }
      } catch (e) {
        console.error("owner hydrate failed:", e);
      } finally {
        if (!cancelled) { clearTimeout(watchdog); setLoading(false); }
      }
    };
    hydrate();
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, _session) => {
      // Vangnet naast de hash-check hierboven: supabase-js meldt het herstel
      // ook als event, mocht de hash al opgeruimd zijn vóór onze eerste render.
      if (_event === "PASSWORD_RECOVERY") setRecovery(true);
      hydrate();
    });
    return () => { cancelled = true; clearTimeout(watchdog); authSub?.subscription?.unsubscribe?.(); };
  }, []);

  const handleLogin = async (u) => {
    // Het aanmeldformulier claimt een uitnodiging zelf en geeft de uitkomst
    // mee (u.inviteOutcome); bij inloggen claimt resolveUserRole hieronder.
    noteInvite(u?.inviteOutcome);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const resolved = await resolveUserRole(session.user);
      noteInvite(resolved.inviteOutcome);
      if (resolved.role === "staff") { setStaffUser(resolved.staffUser); return; }
      if (resolved.role === "staff_inactive") {
        noteStaffInactive(resolved.reason);
        await supabase.auth.signOut();
        return;
      }
      if (resolved.role === "owner") { setOwner(u); return; }
    }
    setOwner(u);
  };

  const handleLogout = async () => {
    await forgetPushOnThisDevice();
    await supabase.auth.signOut();
    setOwner(null);
    setStaffUser(null);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg, color: c.textLabel, fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      <div style={{ width: 40, height: 40, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  // Herstel-modus gaat vóór alles, óók vóór een actieve sessie: het hele punt
  // is dat de gebruiker eerst een nieuw wachtwoord kiest voordat hij verder mag.
  if (recovery || recoveryError) {
    return (
      <SetPasswordScreen
        lang={lang} c={AT_COLORS}
        expired={!!recoveryError}
        onDone={() => {
          try { window.history.replaceState(null, "", window.location.pathname); } catch { /* hash blijft dan staan */ }
          setRecovery(false); setRecoveryError("");
        }}
      />
    );
  }

  // Staff member — redirect to /staff
  if (staffUser) return <Navigate to="/staff" replace />;

  // Check if plan is active (incl. verlengingscoulance — zie planIsActive).
  const hasPlan = planIsActive(owner);

  if (owner && !hasPlan) {
    return <><PlanSelectionGate user={owner} lang={lang} setLang={setLang} onLogout={handleLogout} /><ToastContainer toasts={notices} /></>;
  }

  if (owner) {
    return <><OwnerApp user={owner} lang={lang} setLang={setLang} salons={{}} onSalonUpdate={() => {}} onLogout={handleLogout} /><ToastContainer toasts={notices} /></>;
  }

  return <><OwnerAuth lang={lang} setLang={setLang} onBack={() => navigate("/")} onLogin={handleLogin} /><ToastContainer toasts={notices} /></>;
}

// ─── NIEUW WACHTWOORD INSTELLEN (herstel-link uit de mail) ──────────────────
// Twee gezichten: het formulier (geldig herstel-token, sessie staat al klaar)
// en de verlopen-uitleg mét een veld om direct een verse link aan te vragen —
// want "log maar opnieuw in" is precies wat iemand zonder wachtwoord niet kan.
function SetPasswordScreen({ lang, c, expired, onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [klaar, setKlaar] = useState(false);
  const [toonExpired, setToonExpired] = useState(expired);
  const [mail, setMail] = useState("");
  const [mailVerstuurd, setMailVerstuurd] = useState(false);
  const T3 = (nl, es, en) => (lang === "nl" ? nl : lang === "es" ? es : en);

  const opslaan = async () => {
    setErr("");
    if (pw.length < 6) { setErr(T3("Minimaal 6 tekens.", "Mínimo 6 caracteres.", "At least 6 characters.")); return; }
    if (pw !== pw2) { setErr(T3("De wachtwoorden komen niet overeen.", "Las contraseñas no coinciden.", "The passwords don't match.")); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      // "Auth session missing" = het token was al verbruikt (vaak door de
      // linkscanner van de mailbox) — dan is de verlopen-uitleg het eerlijke
      // antwoord, niet een kale foutcode.
      if (/session/i.test(error.message || "")) { setToonExpired(true); return; }
      setErr(error.message);
      return;
    }
    setKlaar(true);
    setTimeout(onDone, 1600);
  };

  const nieuweLink = async () => {
    setErr("");
    if (!/.+@.+\..+/.test(mail)) { setErr(T3("Vul je e-mailadres in.", "Introduce tu correo.", "Enter your email address.")); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(mail.trim(), { redirectTo: `${window.location.origin}/owner` });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMailVerstuurd(true);
  };

  const veld = { width: "100%", marginBottom: 12 };
  return (
    <Layout accent={AT.EARTH}>
      <AtelierSkin />
      <div className="atelier" style={{ minHeight: "100dvh", background: c.bg, color: c.text, fontFamily: "'Jost',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 400 }} className="fade-up">
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ marginBottom: 12 }}><NavIcon name="crown" size={36} color={AT.EARTH} /></div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300 }}>
              {toonExpired
                ? T3("Link verlopen", "Enlace caducado", "Link expired")
                : T3("Nieuw wachtwoord instellen", "Establecer nueva contraseña", "Set a new password")}
            </div>
          </div>
          <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 24, padding: 28 }}>
            {toonExpired ? (
              mailVerstuurd ? (
                <div style={{ fontSize: 14, lineHeight: 1.6, textAlign: "center", color: c.textSub }}>
                  {T3("Check je mail — er staat een verse herstellink voor je klaar. Open hem het liefst direct op dit apparaat.",
                      "Revisa tu correo: te espera un enlace nuevo. Ábrelo directamente en este dispositivo.",
                      "Check your inbox — a fresh reset link is waiting. Open it on this device if you can.")}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: c.textSub, marginBottom: 16 }}>
                    {T3("Deze herstellink is verlopen of al gebruikt. Dat kan buiten jou om gebeuren: sommige mailprogramma's openen links alvast uit voorzorg, en de link werkt maar één keer. Vraag hieronder een nieuwe aan.",
                        "Este enlace ha caducado o ya se ha usado. Puede pasar sin que hagas nada: algunos correos abren los enlaces por seguridad, y el enlace solo funciona una vez. Pide uno nuevo aquí.",
                        "This reset link has expired or was already used. That can happen without you doing anything: some mail apps pre-open links as a safety check, and the link only works once. Request a fresh one below.")}
                  </div>
                  <input className="input-field" type="email" style={veld} placeholder={T3("Je e-mailadres", "Tu correo", "Your email address")}
                    value={mail} onChange={e => setMail(e.target.value)} onKeyDown={e => e.key === "Enter" && nieuweLink()} />
                  {err && <div style={{ color: "#a8564a", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
                  <button className="btn-primary" style={{ width: "100%" }} disabled={busy} onClick={nieuweLink}>
                    {busy ? "…" : T3("Stuur nieuwe herstellink", "Enviar enlace nuevo", "Send new reset link")}
                  </button>
                </>
              )
            ) : klaar ? (
              <div style={{ fontSize: 14, textAlign: "center", color: c.textSub, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <NavIcon name="check" size={16} color={AT.EARTH} /> {T3("Wachtwoord opgeslagen — je wordt ingelogd…", "Contraseña guardada — iniciando sesión…", "Password saved — signing you in…")}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: c.textSub, marginBottom: 16 }}>
                  {T3("Kies een nieuw wachtwoord voor je Vellu-account.", "Elige una nueva contraseña para tu cuenta de Vellu.", "Choose a new password for your Vellu account.")}
                </div>
                <input className="input-field" type="password" autoComplete="new-password" style={veld} placeholder={T3("Nieuw wachtwoord", "Nueva contraseña", "New password")}
                  value={pw} onChange={e => setPw(e.target.value)} />
                <input className="input-field" type="password" autoComplete="new-password" style={veld} placeholder={T3("Herhaal wachtwoord", "Repite la contraseña", "Repeat password")}
                  value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === "Enter" && opslaan()} />
                {err && <div style={{ color: "#a8564a", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
                <button className="btn-primary" style={{ width: "100%" }} disabled={busy} onClick={opslaan}>
                  {busy ? "…" : T3("Opslaan en inloggen", "Guardar e iniciar sesión", "Save and sign in")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── STAFF ENTRY PAGE (vellu.cc/staff) ──────────────────────
function StaffEntryPage({ lang, setLang, staffUser: propStaffUser, onLogout: propOnLogout }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const [staffUser, setStaffUser] = useState(propStaffUser || null);
  const [loading, setLoading] = useState(!propStaffUser);

  // Wat merkte de gebruiker hiervan? Niets — dit was alleen een waarschuwing.
  // Toch niet blind de dependency erbij, want navigate is hier géén stabiele
  // referentie: zonder data-router (wij draaien <BrowserRouter>) geeft
  // useNavigate() de variant terug die op de pathname gememoïseerd is, dus de
  // referentie wisselt zodra de URL wijzigt.
  // Een échte lus wordt het niet, ook niet als je navigate wél toevoegt: dit
  // scherm navigeert naar /owner en is dan al ontkoppeld, en de setStaffUser
  // hieronder verandert de pathname niet, dus daar hertriggert niets van.
  // Het probleem is minder luid en daarom makkelijker over het hoofd te zien:
  // komt er ooit een subroute bij (/staff/agenda), dan wordt bij élke
  // URL-wijziging de supabase-auth-subscription afgebroken en opnieuw
  // aangemeld en start er een verse hydrate() — een database-ronde per klik,
  // terwijl deze effect bedoeld is als eenmalige sessiecontrole.
  // Een ref is dan de kleinste ingreep: de effect blijft eenmalig, de aanroep
  // blijft de actuele navigate. useCallback kan niet, want navigate komt uit
  // react-router en die definitie is niet van ons. En een eslint-disable zou
  // óók de propStaffUser-melding hieronder doven — precies het deel dat wél
  // een echte fout is en zichtbaar moet blijven.
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });

  useEffect(() => {
    if (propStaffUser) return;
    let cancelled = false;
    // Same watchdog as the owner entry — never leave a bare spinner up.
    const watchdog = setTimeout(() => { if (!cancelled) { setLoading(false); navigateRef.current("/owner", { replace: true }); } }, 12000);
    const hydrate = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          const resolved = await resolveUserRole(session.user);
          if (cancelled) return;
          if (resolved.role === "staff") { setStaffUser(resolved.staffUser); setLoading(false); clearTimeout(watchdog); return; }
        }
      } catch (e) {
        console.error("staff hydrate failed:", e);
      }
      // Not a staff member (or the lookup failed) — fall back to /owner.
      if (cancelled) return;
      clearTimeout(watchdog);
      setLoading(false);
      navigateRef.current("/owner", { replace: true });
    };
    hydrate();
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, _session) => { if (!propStaffUser) hydrate(); });
    return () => { cancelled = true; clearTimeout(watchdog); authSub?.subscription?.unsubscribe?.(); };
    // propStaffUser hoort er wél in. Eerlijk: vandaag merkt niemand hier iets
    // van, want geen enkele aanroeper geeft de prop mee — <Route path="/staff">
    // rendert dit scherm kaal, dus propStaffUser is altijd undefined. Dit is de
    // sluimerende variant van de fout, niet een klacht die binnenkomt. Zodra een
    // ouder de medewerker-sessie wél doorgeeft, bevriest een lege array de keuze
    // "de ouder regelt het" op de eerste render: logt de medewerker daarna uit
    // (prop valt terug naar null), dan blijft dit scherm op de oude sessie staan
    // en begint het nooit aan zijn eigen sessiecontrole. Toevoegen kan geen lus
    // geven — de effect leest de prop alleen, schrijft hem niet, en zolang hij
    // gevuld is doet de body niets. Eerlijk erbij: dit repareert alleen de
    // sessiecontrole. Het lokale staffUser-veld wordt uit de eerste prop
    // geïnitialiseerd en volgt latere prop-wijzigingen niet, dus wie de prop
    // ooit wél gaat meegeven moet die initialisatie meenemen.
  }, [propStaffUser]);

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
// Elke nieuwe pagina opent bovenaan (Faisal 17-09-2026). Op de iPhone stond
// een boekingspagina die je vanaf de homepage opende halverwege, bij
// "Services": de router wisselt alleen de inhoud, dus niets zet de scrollstand
// terug, en iOS Safari laat het scherm bovendien verschoven achter als het
// zoekveld van "Vind een salon" nog focus heeft (toetsenbord open) op het
// moment dat zijn pagina verdwijnt. Chrome op de computer knijpt de stand
// toevallig wél naar 0 (de laadpagina is maar één scherm hoog), daarom viel
// het daar niet op.
//
// scrollTopAfterNav: focus weghalen (klapt het toetsenbord dicht), dan naar
// boven — meteen, één frame later, en nog twee keer ná de toetsenbordanimatie
// van iOS. Niet als de bezoeker zelf al scrolde, niet bij een #anker, en niet
// bij terug/vooruit in de browser (POP): daar hoort de vorige stand terug te
// komen. Gebruikt door ScrollToTop (elke routewissel) en door SalonRoute
// (nog één keer zodra de boekingspagina echt is neergezet).
function scrollTopAfterNav() {
  if (typeof window === "undefined" || window.location.hash) return () => {};
  try { const a = document.activeElement; if (a && a !== document.body && typeof a.blur === "function") a.blur(); } catch { /* geen focus */ }
  let touched = false;
  const mark = () => { touched = true; };
  window.addEventListener("touchstart", mark, { passive: true, once: true });
  window.addEventListener("wheel", mark, { passive: true, once: true });
  const top = () => { if (!touched && (window.scrollY !== 0 || document.documentElement.scrollTop !== 0)) window.scrollTo(0, 0); };
  window.scrollTo(0, 0);
  const raf = requestAnimationFrame(top);
  const t1 = setTimeout(top, 120);
  const t2 = setTimeout(top, 420);
  return () => {
    cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2);
    window.removeEventListener("touchstart", mark); window.removeEventListener("wheel", mark);
  };
}
function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    if (navType === "POP") return;
    return scrollTopAfterNav();
  }, [pathname, navType]);
  return null;
}

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

// ─── NIET GEVONDEN ───────────────────────────────────────────
// Onbekende salon (/bestaat-niet) én elke URL die geen route heeft
// (/bloomstudio/extra/pad gaf een helemaal leeg scherm, L3-11). Binnen
// <Layout>, anders had de knop geen stijl. En noindex (L3-05): de SPA geeft
// hier status 200, dus zonder deze regel zag Google een "soft 404" als
// gewone pagina met de canonical van de homepage.
function NotFoundView({ lang, path }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const shown = path || location.pathname.replace(/^\/+/, "");
  useSEO({ title: lang === "nl" ? "Niet gevonden | Vellu" : lang === "es" ? "No encontrado | Vellu" : "Not found | Vellu" });
  useEffect(() => {
    let el = document.querySelector('meta[name="robots"]');
    const prev = el ? el.getAttribute("content") : null;
    const created = !el;
    if (created) { el = document.createElement("meta"); el.setAttribute("name", "robots"); document.head.appendChild(el); }
    el.setAttribute("content", "noindex");
    return () => { if (created) el.remove(); else el.setAttribute("content", prev || "index, follow"); };
  }, []);
  return (
    <Layout accent={ACCENT}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg, color: c.text, fontFamily: "'Jost',sans-serif", gap: 16, padding: 24, textAlign: "center" }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>{lang === "nl" ? "Salon niet gevonden" : lang === "es" ? "Salón no encontrado" : "Salon not found"}</div>
        <div style={{ fontSize: 12, color: c.textLabel, wordBreak: "break-all" }}>vellu.cc/{shown} {lang === "nl" ? "bestaat niet" : lang === "es" ? "no existe" : "does not exist"}</div>
        <button className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => navigate("/")}>
          <ArrowLeft /> {lang === "nl" ? "Terug naar home" : lang === "es" ? "Volver al inicio" : "Back to home"}
        </button>
      </div>
    </Layout>
  );
}

// Pijl naar links als inline SVG (currentColor), i.p.v. het teken "←".
function ArrowLeft({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

// ─── SALON ROUTE (vellu.cc/salon-naam) ───────────────────────
function SalonRoute({ lang, setLang }) {
  const { colors: c } = useTheme();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [salon, setSalon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // "owner" | "staff" | null — is de ingelogde bezoeker de eigenaar of een
  // medewerker van DIT salon? Bepaalt of de terug-naar-dashboard-pill toont.
  const [previewRole, setPreviewRole] = useState(null);
  // Boekingspagina opent bovenaan (zie scrollTopAfterNav): nog één keer zodra
  // de pagina echt is neergezet. Tussen de routewissel en dit moment staat er
  // alleen een laadscherm van één scherm hoog; iOS Safari kan in die tussentijd
  // de oude stand terugzetten zodra de pagina weer lang wordt.
  const navType = useNavigationType();
  useEffect(() => {
    if (loading || navType === "POP") return;
    return scrollTopAfterNav();
  }, [loading, navType]);

  useEffect(() => {
    if (!salon?.owner_id) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) return;
        if (uid === salon.owner_id) { if (alive) setPreviewRole("owner"); return; }
        // Medewerker? Eigen staff-rij lezen mag via de self-select-RLS; de
        // publieke views exposen user_id bewust niet, dus dit is de enige route.
        const { data: st } = await supabase.from("staff_members").select("owner_id").eq("user_id", uid).maybeSingle();
        if (st && st.owner_id === salon.owner_id && alive) setPreviewRole("staff");
      } catch { /* geen (geldige) sessie = gewone bezoeker, geen pill */ }
    })();
    return () => { alive = false; };
  }, [salon?.owner_id]);

  useEffect(() => {
    const load = async () => {
      // public_salons is a column-safe VIEW over profiles: the anon key can no
      // longer read the base table, so financial/private columns never reach
      // the wire. discount_codes arrives pre-filtered to active codes and
      // payment_configured is already a boolean.
      // Producten komen NIET meer als embed uit public_salons: de tabel
      // products is niet meer publiek leesbaar (inkoopprijs, voorraad,
      // leverancier en barcode lagen open, audit L4-01). De view
      // public_products hieronder geeft alleen actieve, online zichtbare
      // producten van Professional-salons, met alleen de kolommen die de
      // boekingspagina toont — dezelfde regel als book-appointment (E1-27).
      // services.visible: een eigenaar kan een dienst verbergen. Een
      // dienst "on hold" (nog niet gestart, seizoenspauze, verlof) blijft in de
      // agenda en de rapporten van de eigenaar staan, maar hoort niet op de
      // boekingspagina. Ook dit filter zit in de query zelf, zodat een verborgen
      // dienst niet eens over de lijn gaat. De echte grens staat in
      // book-appointment: die weigert een verborgen service_id.
      const { data, error } = await supabase.from("public_salons").select("*, services(*, service_variants(*), service_extras(*, staff_extra_exclusions(staff_id)), service_photos(*))").eq("slug", slug).eq("services.visible", true).single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      // Ondergrens voor de eenmalige blokkades: GISTEREN op de klok van de
      // salon. Met de datum van het apparaat viel bij een bezoeker die verder
      // in de tijd zit (NL 's nachts, salon op Bonaire nog 's avonds) de
      // blokkade van de salon-dag van vandaag weg, en leken geblokkeerde
      // tijden vrij (C1-13). Een dag extra kost niets: de boekingsmotor kijkt
      // toch alleen naar vandaag en later.
      const salonToday = salonNow(data.country_code || "NL");
      const blocksFrom = fmt(new Date(salonToday.getFullYear(), salonToday.getMonth(), salonToday.getDate() - 1));
      // Uitrolvangnet voor de twee nieuwe views: staat deze frontend live
      // vóór de migratie (view bestaat nog niet), dan nog één keer de oude
      // tabel met dezelfde filters, zoals de pagina die vandaag leest. Die
      // publieke policies verdwijnen pas ná deze deploy; daarna wordt de
      // terugval niet meer gebruikt (en zou hij niets opleveren).
      const viewOr = async (query, legacy) => { const r = await query; return r.error ? legacy() : r; };
      // Load related data in parallel for faster page load
      const [
        { data: reviews },
        { data: staffData },
        { data: categories },
        { data: locData },
        { data: staffBlocksData },
        { data: productsData }
      ] = await Promise.all([
        // public_reviews is een kolom-veilige VIEW over reviews. select("*") op
        // de tabel zelf stuurde client_email en appointment_id mee naar iedere
        // bezoeker, terwijl de pagina alleen de voornaam, sterren, tekst en
        // datum toont. De view levert client_name al als voornaam; hier staan
        // de kolommen nog eens expliciet zodat een latere kolom in de view niet
        // stilzwijgend in de publieke payload belandt. owner_id hoeft niet in
        // de select: PostgREST filtert er ook op zonder hem terug te geven.
        // `anonymous`: de view geeft dan al geen naam terug; de vlag laat de
        // pagina een vertaald "Anoniem" tonen in plaats van een lege regel.
        supabase.from("public_reviews").select("id, client_name, rating, comment, created_at, anonymous").eq("owner_id", data.id).order("created_at", { ascending: false }),
        // public_staff view: name/role/bio/avatar/hours only — freelancer
        // billing data and emails never reach the anon wire.
        supabase.from("public_staff").select("*, staff_services(service_id), staff_service_prices(service_id, variant_id, price)").eq("owner_id", data.id).eq("active", true).order("position"),
        supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position"),
        supabase.from("locations").select("*").eq("owner_id", data.id).eq("active", true).order("position"),
        // public_staff_day_overrides is een VIEW zonder de vrije-tekstkolom
        // reason ("Prive", "tandarts", klantnamen…): die las iedere bezoeker
        // mee uit de tabel zelf (C1-07). De boekingsmotor gebruikt alleen
        // datum, weekdag, soort en tijden.
        // Ook terugkerende blokkades (weekday gezet) meenemen — hun anker-
        // datum kan in het verleden liggen en zou anders uit de gte vallen.
        viewOr(
          supabase.from("public_staff_day_overrides").select("*").eq("owner_id", data.id).or(`date.gte.${blocksFrom},weekday.not.is.null`),
          () => supabase.from("staff_day_overrides").select("id, owner_id, staff_id, service_id, date, weekday, kind, block_time_start, block_time_end").eq("owner_id", data.id).or(`date.gte.${blocksFrom},weekday.not.is.null`)
        ),
        // Winkelproducten (Professional): zie de uitleg bij public_salons hierboven.
        viewOr(
          supabase.from("public_products").select("*").eq("owner_id", data.id).order("position"),
          () => supabase.from("products").select("id, owner_id, name_nl, name_en, name_es, description_nl, description_en, description_es, price, photo_url, position, created_at").eq("owner_id", data.id).eq("active", true).eq("visible_online", true).order("position")
        ),
      ]);
      setSalon({
        id: data.slug,
        slug: data.slug,
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
        page_font: data.page_font || "classic",
        // Boekingspagina opent in dark (oude gedrag) | light | auto (apparaat).
        booking_theme: data.booking_theme || "dark",
        // Uitnodigingscode van de salon: de "Powered by Vellu"-link onderaan
        // de pagina draagt hem mee (zie ClientApp, profile-footer). De view
        // geeft NULL voor de demo-salon, dan gaat de link zonder code.
        referral_code: data.referral_code || null,
        // Annuleringstermijn in uren (0 = altijd annuleerbaar): de
        // bevestigingsstap noemt de echte termijn van de salon.
        cancel_deadline_hours: data.cancel_deadline_hours ?? 0,
        slot_interval_minutes: data.slot_interval_minutes || 30,
        show_owner_on_booking: !!data.show_owner_on_booking,
        booking_policy: data.booking_policy || "",
        booking_policy_en: data.booking_policy_en || "",
        salon_phone: data.salon_phone || "",
        salon_instagram: data.salon_instagram || "",
        salon_email: data.salon_email || "",
        whatsapp_number: data.whatsapp_number || "",

        phone_required: data.phone_required || false,
        waitlist_enabled: data.waitlist_enabled !== false,
        // Whether the "pay afterwards via payment request" option makes sense:
        // the salon set up a pay link and/or an IBAN for the invoice email.
        // Boolean only — the actual details never enter the public payload.
        payment_configured: !!data.payment_configured,
        // Vooruitbetalen: de view zet dit alleen op true als de salon het aanzet
        // én een betaallink of IBAN heeft.
        prepay_enabled: !!data.prepay_enabled,
        // No-show-vergoeding: de view geeft 0 zolang de salon het uit heeft staan.
        no_show_fee_pct: parseInt(data.no_show_fee_pct) || 0,
        break_minutes: data.break_minutes || 0,
        logo_url: data.logo_url || "",
        cover_image_url: data.cover_image_url || "",
        cover_focal_y: data.cover_focal_y ?? 50,
        cover_focal_x: data.cover_focal_x ?? 50,
        cover_zoom: Number(data.cover_zoom) || 1,
        // Optioneel verjaardagsveld in de boekingsflow (salon-instelling).
        ask_birthday_on_booking: !!data.ask_birthday_on_booking,
        // Stempelkaart: alleen deze drie zitten in de view — genoeg voor de badge.
        loyalty_enabled: !!data.loyalty_enabled,
        loyalty_visits: parseInt(data.loyalty_visits) || 10,
        loyalty_discount_pct: parseInt(data.loyalty_discount_pct) || 10,
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
            // excluded_staff_ids: medewerkers die deze extra NIET uitvoeren
            // (geen rijen = iedereen doet hem, net als service_ids leeg = alles).
            extras: (s.service_extras || []).sort((a, b) => (a.position || 0) - (b.position || 0)).map(e => ({ ...e, excluded_staff_ids: (e.staff_extra_exclusions || []).map(x => x.staff_id) }))
          })),
        // Retail products (Professional plan). public_products levert alleen
        // actieve, online zichtbare rijen; sort mirrors the owner's list order.
        products: (productsData || [])
          .slice()
          .sort((a, b) => ((a.position ?? 0) - (b.position ?? 0)) || ((a.created_at || "") < (b.created_at || "") ? -1 : 1)),
        appointments: [],
        reviews: reviews || [],
        // Owner first, then the rest in their drag/position order — the salon
        // owner should lead the team list and the staff picker.
        staff: (staffData || [])
          .slice()
          .sort((a, b) => ((b.is_owner === true) - (a.is_owner === true)) || ((a.position ?? 0) - (b.position ?? 0)))
          .map(s => ({ ...s, service_ids: (s.staff_services || []).map(ss => ss.service_id), price_overrides: s.staff_service_prices || [], working_hours: s.working_hours || null })),
        // One table, two meanings: kind='block' rows make a stylist (or the
        // whole salon) unavailable; kind='exception' rows are EXTRA open
        // windows (block_time_start/end double as open/close). Split here so
        // the booking engine never confuses the two.
        staff_blocks: (staffBlocksData || []).filter(r => (r.kind || "block") !== "exception"),
        staff_exceptions: (staffBlocksData || []).filter(r => r.kind === "exception"),
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
    description: salon ? `${lang === "nl" ? "Boek een afspraak bij" : lang === "es" ? "Reserva una cita en" : "Book an appointment at"} ${salon.name}${salon.city ? ` in ${salon.city}` : ""}. ${lang === "nl" ? "Online boeken, geen commissie." : lang === "es" ? "Reserva online, sin comisión." : "Book online, no commission."}` : undefined,
    ogImage: salon?.cover_image_url || salon?.logo_url || undefined,
    // De canonieke link is altijd de echte slug, ook als de pagina via een
    // oude of anders geschreven link werd geopend.
    url: `https://vellu.cc/${salon?.slug || slug}`
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg, color: c.textLabel, fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      <div style={{ width: 40, height: 40, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (notFound) return <NotFoundView lang={lang} path={slug} />;

  // Security: never trust an ?email= URL param for reviews — anyone can craft a URL to
  // impersonate a victim. Die identiteit komt nu uit het token in ?review=…, dat
  // ClientApp zelf uit de URL leest en aan submit_review geeft; de prop
  // reviewEmail bestond daar niet meer en is daarom hier ook weg. reviewMode
  // blijft alleen voor de oude ?review=true-links uit al verstuurde mails.
  return (<>
    <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => navigate("/")} reviewMode={new URLSearchParams(window.location.search).get("review") === "true"} />
    {/* Preview-ontsnapping: wie ingelogd is als eigenaar of medewerker van DIT
        salon en de eigen publieke pagina bekijkt (Preview page in de PWA opent
        in hetzelfde venster — terug kán dan niet), krijgt een vaste pill terug
        naar het dashboard. Klanten hebben geen sessie en zien dus nooit iets;
        de detectie is puur sessie-gebaseerd, geen URL-param die kan lekken.
        Bewust een los <style>-blok en neutrale donkere kleuren: dit is een
        app-control bóven de salonpagina, geen onderdeel van de salon-huisstijl. */}
    {previewRole && (<>
      <style>{`
        .vl-preview-back {
          position: fixed; left: 14px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 360;
          display: inline-flex; align-items: center; gap: 7px;
          padding: 11px 16px; border-radius: 8px; text-decoration: none;
          background: rgba(22,19,16,0.92); color: #f6f2ec;
          border: 1px solid rgba(255,255,255,0.18);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          box-shadow: 0 6px 24px rgba(0,0,0,0.35);
        }
        /* Op telefoons zit bottom-center de "View & book"-pill en tijdens het
           boeken een sticky doorgaan-balk — til de terugknop daarboven uit. */
        @media (max-width: 640px) {
          .vl-preview-back { bottom: calc(92px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>
      <a className="vl-preview-back" href="/owner">
        <ArrowLeft /> {lang === "nl" ? "Terug naar dashboard" : lang === "es" ? "Volver al panel" : "Back to dashboard"}
      </a>
    </>)}
  </>);
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
  // Binnen de annuleringstermijn van de salon: uren + telefoonnummer voor de
  // "bel de salon"-uitleg, gevuld door het check-antwoord of door een 403 op
  // het annuleren zelf (pagina stond al open toen de grens verstreek).
  const [lateInfo, setLateInfo] = useState(null);
  // Naam en slug van de salon (uit het check- en cancel-antwoord): de pagina
  // noemt de salon en "terug" gaat naar haar boekingspagina i.p.v. naar de
  // Vellu-homepage.
  const [salonInfo, setSalonInfo] = useState({ name: "", slug: "" });
  // Bezig met annuleren: de knop staat dan uit, zodat een dubbele tik niet
  // twee keer annuleert (en twee keer mailt).
  const [cancelling, setCancelling] = useState(false);
  const noteSalon = (d) => {
    if (d && (d.salon_name || d.salon_slug)) setSalonInfo({ name: d.salon_name || "", slug: d.salon_slug || "" });
  };
  const backTo = salonInfo.slug ? `/${salonInfo.slug}` : "/";
  const backLabel = salonInfo.slug
    ? (lang === "nl" ? `Naar ${salonInfo.name || "de salon"}` : lang === "es" ? `Ir a ${salonInfo.name || "el salón"}` : `Go to ${salonInfo.name || "the salon"}`)
    : (lang === "nl" ? "Terug naar home" : lang === "es" ? "Volver al inicio" : "Back to home");
  // "dinsdag 6 oktober" i.p.v. de kale ISO-datum.
  const dateLabel = (ds) => {
    try {
      const d = parseDate(ds);
      if (isNaN(d.getTime())) return ds || "";
      return d.toLocaleDateString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
    } catch { return ds || ""; }
  };

  useEffect(() => {
    const checkToken = async () => {
      // Look up token via edge function — cancellation_tokens table is
      // locked down to service_role only, no direct client access.
      const { data, error } = await supabase.functions.invoke("cancel-appointment", {
        body: { action: "check", token },
      });
      if (error || !data) {
        // De afspraak is al geweest of als no-show afgesloten (410
        // not_cancellable): dezelfde uitleg als een verlopen link.
        let body = null;
        try { body = await error?.context?.json?.(); } catch { /* geen json-body */ }
        if (body?.error === "not_cancellable" || body?.error === "expired") { setStatus("expired"); return; }
        setStatus("error");
        return;
      }
      noteSalon(data);
      // Al geannuleerd (door de klant zelf, door de salon, of een niet op tijd
      // betaalde reservering): een eigen scherm, zonder te beloven dat er nu
      // een bevestigingsmail komt.
      if (data.status === "already_cancelled") {
        if (data.appointment) setAppointment({ ...data.appointment, country_code: data.country_code || "NL" });
        setStatus("already_cancelled");
        return;
      }
      if (data.status === "expired") { setStatus("expired"); return; }
      if (data.status === "too_late") {
        setLateInfo({ hours: data.deadline_hours, phone: data.salon_phone || "", salon: data.salon_name || "" });
        if (data.appointment) setAppointment({ ...data.appointment, country_code: data.country_code || "NL" });
        setStatus("too_late");
        return;
      }
      if (data.status === "valid" && data.appointment) {
        setAppointment({ ...data.appointment, country_code: data.country_code || "NL" });
        setStatus("confirm");
        return;
      }
      setStatus("error");
    };
    checkToken();
  }, [token]);

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-appointment", {
        body: { action: "cancel", token, reason: reason || null },
      });
      if (error) {
        // Race met de termijn: de pagina stond al open vóór de grens, de klik
        // kwam erna. De server weigert dan met 403 too_late_to_cancel — toon
        // dezelfde uitleg als wanneer de pagina meteen te laat was geopend.
        let body = null;
        try { body = await error.context?.json?.(); } catch { /* geen json-body */ }
        if (body?.error === "too_late_to_cancel") {
          setLateInfo({ hours: body.deadline_hours, phone: body.salon_phone || "", salon: body.salon_name || "" });
          setStatus("too_late");
          return;
        }
        // Link intussen al gebruikt (tweede tabblad, of een eerdere tik die
        // net klaar was): de afspraak ís geannuleerd, geen "Link ongeldig".
        if (body?.error === "already_used") { setStatus("already_cancelled"); return; }
        if (body?.error === "expired" || body?.error === "not_cancellable") { setStatus("expired"); return; }
        throw new Error(body?.error || error.message || "cancel_failed");
      }
      noteSalon(data);
      // De server annuleert atomair: was de afspraak al geannuleerd, dan
      // verstuurt hij niets en zegt hij dat. Dan ook hier geen belofte van
      // een bevestigingsmail.
      if (data?.status === "already_cancelled") { setStatus("already_cancelled"); return; }
      if (!data || data.status !== "cancelled") {
        throw new Error(data?.error || "cancel_failed");
      }

      // All cancellation messaging is now sent SERVER-SIDE inside the
      // cancel-appointment edge function: the client's "afspraak geannuleerd"
      // email + SMS, and the owner/staff notification. This page is used by the
      // anonymous customer, whose browser can't authenticate to send-emails/
      // send-sms (they 401), so doing it here never worked. Nothing to send
      // client-side anymore. Ook de Google Agenda-aanroep is weg: die functie
      // accepteert alleen nog server-aanroepen (R-06).

      setStatus("cancelled");
    } catch (err) {
      console.error("Cancel error:", err);
      setStatus("error");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Layout accent={ACCENT}>
    <div style={{ minHeight: "100dvh", background: c.bg, fontFamily: "'Jost',sans-serif", color: c.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>

      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        {status === "loading" && (
          <div style={{ color: c.textLabel }}>{lang === "nl" ? "laden..." : lang === "es" ? "cargando..." : "loading..."}</div>
        )}
        
        {status === "confirm" && appointment && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}><NavIcon name="calendar" size={48} color={ACCENT} /></div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {t.cancelBooking}
            </h1>
            <p style={{ color: c.textSub, marginBottom: 30 }}>{t.cancelBookingDesc}</p>
            
            <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 20, marginBottom: 24, textAlign: "left" }}>
              {salonInfo.name && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{lang === "es" ? "Salón" : "Salon"}</div>
                  <div style={{ fontWeight: 500 }}>{salonInfo.name}</div>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.treatment}</div>
                <div style={{ fontWeight: 500 }}>{appointment.service_name}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.date}</div>
                <div style={{ fontWeight: 500 }}>{dateLabel(appointment.date)} {lang === "nl" ? "om" : lang === "es" ? "a las" : "at"} {appointment.time}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.total}</div>
                <div style={{ fontWeight: 500, color: ACCENT }}>{fmtAmt(curSym(appointment.country_code), appointment.service_price)}</div>
              </div>
            </div>
            
            <textarea 
              className="input-field" 
              placeholder={t.cancellationReason}
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ minHeight: 80, marginBottom: 16, resize: "none" }}
            />
            
            {/* Uit tijdens het verzoek: de server wacht op alle mails voor hij
                antwoordt, en een tweede tik annuleerde vroeger nog een keer. */}
            <button className="btn-primary" style={{ background: "#ef4444", color: "#fff", width: "100%", opacity: cancelling ? 0.7 : 1, cursor: cancelling ? "wait" : "pointer" }} onClick={handleCancel} disabled={cancelling} aria-busy={cancelling}>
              {cancelling ? "…" : t.confirmCancel}
            </button>

            <button className="btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => navigate(backTo)} disabled={cancelling}>
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
              {lang === "nl" ? "Je ontvangt een bevestiging per e-mail." : lang === "es" ? "Recibirás un correo de confirmación." : "You will receive a confirmation email."}
            </p>
            <button className="btn-ghost" onClick={() => navigate(backTo)}>
              {backLabel}
            </button>
          </div>
        )}

        {/* Link opnieuw geopend, of de afspraak was al geannuleerd (door de
            salon, of een niet op tijd betaalde reservering): geen nieuwe
            belofte van een mail, en ook niet "jij hebt geannuleerd". */}
        {status === "already_cancelled" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}><NavIcon name="check" size={48} color={c.textLabel} /></div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {lang === "nl" ? "Deze afspraak is al geannuleerd" : lang === "es" ? "Esta cita ya está cancelada" : "This appointment has already been cancelled"}
            </h1>
            <p style={{ color: c.textSub, marginBottom: appointment ? 12 : 30 }}>
              {lang === "nl" ? "Je hoeft niets meer te doen." : lang === "es" ? "No tienes que hacer nada más." : "There's nothing more you need to do."}
            </p>
            {appointment && (
              <p style={{ color: c.textLabel, fontSize: 12, marginBottom: 24 }}>
                {[salonInfo.name, appointment.service_name].filter(Boolean).join(" · ")} · {dateLabel(appointment.date)} {lang === "nl" ? "om" : lang === "es" ? "a las" : "at"} {appointment.time}
              </p>
            )}
            <button className="btn-ghost" onClick={() => navigate(backTo)}>
              {backLabel}
            </button>
          </div>
        )}

        {status === "expired" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}><NavIcon name="clock" size={48} color={ACCENT} /></div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {t.cannotCancel}
            </h1>
            <p style={{ color: c.textSub, marginBottom: 30 }}>{t.cancelBeforeTime}</p>
            <button className="btn-ghost" onClick={() => navigate(backTo)}>
              {backLabel}
            </button>
          </div>
        )}

        {status === "too_late" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}><NavIcon name="clock" size={48} color={ACCENT} /></div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {lang === "nl" ? "Online annuleren kan niet meer" : lang === "es" ? "Ya no se puede cancelar en línea" : "Online cancellation has closed"}
            </h1>
            <p style={{ color: c.textSub, marginBottom: 12 }}>
              {lang === "nl"
                ? `${lateInfo?.salon || "Deze salon"} hanteert een annuleringstermijn van ${lateInfo?.hours || ""} uur. Neem contact op met de salon om je afspraak te verplaatsen of te annuleren.`
                : lang === "es"
                ? `${lateInfo?.salon || "Este salón"} aplica un plazo de cancelación de ${lateInfo?.hours || ""} horas. Ponte en contacto con el salón para cambiar o cancelar tu cita.`
                : `${lateInfo?.salon || "This salon"} has a ${lateInfo?.hours || ""}-hour cancellation policy. Please contact the salon to move or cancel your appointment.`}
            </p>
            {appointment && (
              <p style={{ color: c.textLabel, fontSize: 12, marginBottom: 24 }}>
                {appointment.service_name} · {dateLabel(appointment.date)} {lang === "nl" ? "om" : lang === "es" ? "a las" : "at"} {appointment.time}
              </p>
            )}
            {lateInfo?.phone && (
              <a className="btn-primary" href={`tel:${String(lateInfo.phone).replace(/[^+\d]/g, "")}`}
                style={{ display: "block", width: "100%", textDecoration: "none", textAlign: "center", boxSizing: "border-box", marginBottom: 10 }}>
                {lang === "nl" ? `Bel ${lateInfo.salon || "de salon"}` : lang === "es" ? `Llamar a ${lateInfo.salon || "el salón"}` : `Call ${lateInfo.salon || "the salon"}`}
              </a>
            )}
            <button className="btn-ghost" style={{ width: "100%" }} onClick={() => navigate(backTo)}>
              {backLabel}
            </button>
          </div>
        )}
        
        {status === "error" && (
          <div className="fade-up">
            <div style={{ marginBottom: 20 }}><NavIcon name="xmark" size={48} color="#f87171" /></div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {lang === "nl" ? "Link ongeldig" : lang === "es" ? "Enlace no válido" : "Invalid link"}
            </h1>
            <p style={{ color: c.textSub, marginBottom: 30 }}>
              {lang === "nl" ? "Deze annuleringslink is niet geldig." : lang === "es" ? "Este enlace de cancelación no es válido." : "This cancellation link is not valid."}
            </p>
            <button className="btn-ghost" onClick={() => navigate(backTo)}>
              {backLabel}
            </button>
          </div>
        )}
      </div>
    </div>
    </Layout>
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
        // Zelfde regel als in OwnerEntryPage, incl. verlengingscoulance.
        const hasPlan = planIsActive(owner);
        if (!hasPlan) return <PlanSelectionGate user={owner} lang={lang} setLang={setLang} onLogout={async () => { await forgetPushOnThisDevice(); await supabase.auth.signOut(); setOwner(null); setScreen("landing"); }} />;
        return <OwnerApp user={owner} lang={lang} setLang={setLang} salons={salons} onSalonUpdate={updateSalon} onLogout={async () => { await forgetPushOnThisDevice(); await supabase.auth.signOut(); setOwner(null); setScreen("landing"); }} />;
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

  // Twee huiden (Faisal 16-09: "de cookiebanner heeft nog het oude thema"):
  // op Vellu's eigen pagina's (landing, juridisch, contact) het Atelier-palet —
  // bone-kaart, espresso-knop, vierkante hoeken; op de pagina van een salon
  // neutraal in het thema van die pagina (inkt op papier, geen Vellu-goud), want
  // daar hoort geen Vellu-branding. Op de telefoon staat hij boven de vaste
  // Boek-balk van de salonpagina.
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const eigen = path === "/" || ["/privacy", "/terms", "/voorwaarden", "/contact", "/dpa", "/admin"].includes(path) || path.startsWith("/integrations/");
  const s = eigen
    ? { bg: AT.BONE, border: AT.PUTTY, text: AT.ESPRESSO, sub: AT.EARTH, btnBg: AT.ESPRESSO, btnInk: AT.BONE, shadow: "0 22px 40px -26px rgba(69,58,43,0.6), 0 2px 4px rgba(69,58,43,0.08)" }
    // c.bg en niet c.bgCard: die kaarttint is doorschijnend (3%) en de banner
    // zweeft over de pagina — dan schijnt de inhoud erdoorheen.
    : { bg: c.bg, border: c.border, text: c.text, sub: c.textSub, btnBg: c.text, btnInk: c.bg, shadow: "0 22px 40px -26px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.08)" };
  const bovenBoekbalk = !eigen && typeof window !== "undefined" && window.innerWidth < 900;
  return (
    <div data-cookie-banner={eigen ? "atelier" : "salon"} style={{
      position: "fixed", bottom: `calc(${bovenBoekbalk ? 86 : 20}px + env(safe-area-inset-bottom, 0px))`, left: 16, right: 16, maxWidth: 440, margin: "0 auto",
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12,
      padding: "14px 16px 14px 18px", display: "flex", alignItems: "center", gap: 14,
      boxShadow: s.shadow, zIndex: 9999,
      fontFamily: "'Jost',sans-serif", animation: "fadeUp 0.4s ease"
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: s.text, fontWeight: 600, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}><NavIcon name="cookie" size={13} color={s.text} /> Cookies</div>
        <div style={{ fontSize: 11.5, color: s.sub, lineHeight: 1.5 }}>
          {lang === "nl"
            ? "Wij gebruiken alleen functionele cookies. "
            : lang === "es" ? "Solo usamos cookies funcionales. " : "We only use functional cookies. "}
          <a href="/privacy" style={{ color: s.text, textDecoration: "underline", textUnderlineOffset: 2 }}>{lang === "nl" ? "Meer info" : lang === "es" ? "Más información" : "Learn more"}</a>
        </div>
      </div>
      <button onClick={() => { localStorage.setItem("vellu_cookies_accepted", "true"); setVisible(false); }}
        aria-label={lang === "nl" ? "Begrepen" : lang === "es" ? "Entendido" : "Got it"}
        style={{ background: s.btnBg, color: s.btnInk, border: `1px solid ${s.btnBg}`, borderRadius: AT_RADIUS, padding: "10px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Jost',sans-serif", flexShrink: 0 }}>
        {lang === "nl" ? "Begrepen" : lang === "es" ? "Entendido" : "Got it"}
      </button>
    </div>
  );
}

// Route-level Suspense fallback. This used to be `null`, which renders a
// completely blank page while a lazy chunk downloads — indistinguishable from
// a crash on a slow mobile connection, and the reason the PWA looked "dead"
// rather than "busy". A spinner says the app is alive.
function RouteFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: "#0d0b0a" }}>
      <div style={{ width: 40, height: 40, border: "2px solid rgba(237,232,224,0.12)", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
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
  // Language priority: (1) explicit user choice saved to localStorage on any
  // pill flip, (2) browser preference (nl-* → nl, es-* → es, otherwise en),
  // (3) nl default. Spaans kwam er later bij en viel hier eerst op Engels
  // terug (L3-10).
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem("vellu_lang");
      if (saved === "nl" || saved === "en" || saved === "es") return saved;
    } catch { /* private mode */ }
    if (typeof navigator !== "undefined") {
      const nav = (navigator.language || navigator.languages?.[0] || "").toLowerCase();
      if (nav.startsWith("nl")) return "nl";
      if (nav.startsWith("es")) return "es";
      if (nav) return "en";
    }
    return "nl";
  });
  const setLangPersist = (next) => {
    setLang(next);
    try { localStorage.setItem("vellu_lang", next); } catch { /* private mode */ }
  };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<AppInner lang={lang} setLang={setLangPersist} />} />
              <Route path="/owner" element={<OwnerEntryPage lang={lang} setLang={setLangPersist} />} />
              <Route path="/staff" element={<StaffEntryPage lang={lang} setLang={setLangPersist} />} />
              <Route path="/cancel/:token" element={<CancelRoute lang={lang} />} />
              <Route path="/privacy" element={<PrivacyPage lang={lang} setLang={setLangPersist} />} />
              <Route path="/terms" element={<TermsPage lang={lang} setLang={setLangPersist} />} />
              {/* Dutch alias — Vellu is NL-first so /voorwaarden must work */}
              <Route path="/voorwaarden" element={<TermsPage lang={lang} setLang={setLangPersist} />} />
              <Route path="/contact" element={<ContactPage lang={lang} setLang={setLangPersist} />} />
              <Route path="/dpa" element={<DpaPage lang={lang} setLang={setLangPersist} />} />
              {/* Google OAuth verification wants a dedicated public page; this
                  describes the Google Calendar integration + Limited Use. */}
              <Route path="/integrations/google" element={<GoogleIntegrationPage lang={lang} setLang={setLangPersist} />} />
              <Route path="/beoordeel/:token" element={<RateVelluPage />} />
              <Route path="/rate/:token" element={<RateVelluPage />} />
              {/* Admin route — rendered for anyone, but the component itself
                  calls is_admin() via RPC and shows "Not authorised" for
                  non-admins. Real enforcement sits in the DB (app_admins). */}
              <Route path="/admin" element={<AdminRoute />} />
              <Route path="/:slug" element={<SalonRouteWrapper lang={lang} setLang={setLangPersist} />} />
              {/* Alles wat hierboven niet past (bijv. /salon/extra/pad): de
                  niet-gevonden-pagina i.p.v. een leeg scherm (L3-11). */}
              <Route path="*" element={<NotFoundView lang={lang} />} />
            </Routes>
          </Suspense>
            <CookieConsent lang={lang} />
          </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
