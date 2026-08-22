import { useState, useEffect, useRef, Component, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase.js";
import {
  ThemeProvider, useTheme, useSEO, ACCENT, T, NavIcon, DEFAULT_HOURS, fmt, Layout, curSym
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
          if (resolved.role === "staff") { setStaffUser(resolved.staffUser); return; }
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

  // Herstel-modus gaat vóór alles, óók vóór een actieve sessie: het hele punt
  // is dat de gebruiker eerst een nieuw wachtwoord kiest voordat hij verder mag.
  if (recovery || recoveryError) {
    return (
      <SetPasswordScreen
        lang={lang} c={c}
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
    return <PlanSelection user={owner} lang={lang} setLang={setLang} onLogout={handleLogout} />;
  }

  if (owner) {
    return <OwnerApp user={owner} lang={lang} setLang={setLang} salons={{}} onSalonUpdate={() => {}} onLogout={handleLogout} />;
  }

  return <OwnerAuth lang={lang} setLang={setLang} onBack={() => navigate("/")} onLogin={handleLogin} />;
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
    <Layout accent={ACCENT}>
      <div style={{ minHeight: "100dvh", background: c.bg, color: c.text, fontFamily: "'Jost',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 400 }} className="fade-up">
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ marginBottom: 12 }}><NavIcon name="crown" size={36} color={ACCENT} /></div>
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
                  {err && <div style={{ color: "#f87171", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
                  <button className="btn-primary" style={{ width: "100%" }} disabled={busy} onClick={nieuweLink}>
                    {busy ? "…" : T3("Stuur nieuwe herstellink", "Enviar enlace nuevo", "Send new reset link")}
                  </button>
                </>
              )
            ) : klaar ? (
              <div style={{ fontSize: 14, textAlign: "center", color: c.textSub }}>
                ✓ {T3("Wachtwoord opgeslagen — je wordt ingelogd…", "Contraseña guardada — iniciando sesión…", "Password saved — signing you in…")}
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
                {err && <div style={{ color: "#f87171", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
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
      // public_salons is a column-safe VIEW over profiles: the anon key can no
      // longer read the base table, so financial/private columns never reach
      // the wire. discount_codes arrives pre-filtered to active codes and
      // payment_configured is already a boolean.
      // products.visible_online: de eigenaar kan een product wel verkopen aan
      // de kassa maar NIET online tonen. Het filter zit in de query zelf
      // (PostgREST filtert de embedded rows) zodat verborgen producten nooit
      // over de lijn gaan — RLS filtert al op active, dit filtert daarbovenop.
      const { data, error } = await supabase.from("public_salons").select("*, services(*, service_variants(*), service_extras(*), service_photos(*)), products(*)").eq("slug", slug).eq("products.visible_online", true).single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      // Load related data in parallel for faster page load
      const [
        { data: reviews },
        { data: staffData },
        { data: categories },
        { data: locData },
        { data: staffBlocksData }
      ] = await Promise.all([
        // public_reviews is een kolom-veilige VIEW over reviews. select("*") op
        // de tabel zelf stuurde client_email en appointment_id mee naar iedere
        // bezoeker, terwijl de pagina alleen de voornaam, sterren, tekst en
        // datum toont. De view levert client_name al als voornaam; hier staan
        // de kolommen nog eens expliciet zodat een latere kolom in de view niet
        // stilzwijgend in de publieke payload belandt. owner_id hoeft niet in
        // de select: PostgREST filtert er ook op zonder hem terug te geven.
        supabase.from("public_reviews").select("id, client_name, rating, comment, created_at").eq("owner_id", data.id).order("created_at", { ascending: false }),
        // public_staff view: name/role/bio/avatar/hours only — freelancer
        // billing data and emails never reach the anon wire.
        supabase.from("public_staff").select("*, staff_services(service_id)").eq("owner_id", data.id).eq("active", true).order("position"),
        supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position"),
        supabase.from("locations").select("*").eq("owner_id", data.id).eq("active", true).order("position"),
        // fmt = LOCAL date. toISOString() is UTC: late-evening in a UTC-negative
        // timezone it says "tomorrow" and silently drops TODAY's staff blocks.
        supabase.from("staff_day_overrides").select("*").eq("owner_id", data.id).gte("date", fmt(new Date())),
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
        break_minutes: data.break_minutes || 0,
        logo_url: data.logo_url || "",
        cover_image_url: data.cover_image_url || "",
        cover_focal_y: data.cover_focal_y ?? 50,
        cover_focal_x: data.cover_focal_x ?? 50,
        cover_zoom: Number(data.cover_zoom) || 1,
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
            extras: (s.service_extras || []).sort((a, b) => (a.position || 0) - (b.position || 0))
          })),
        // Retail products (Professional plan). Anonymous visitors only get
        // active rows (RLS); sort mirrors the owner's list order.
        products: (data.products || [])
          .slice()
          .sort((a, b) => ((a.position ?? 0) - (b.position ?? 0)) || ((a.created_at || "") < (b.created_at || "") ? -1 : 1)),
        appointments: [],
        reviews: reviews || [],
        // Owner first, then the rest in their drag/position order — the salon
        // owner should lead the team list and the staff picker.
        staff: (staffData || [])
          .slice()
          .sort((a, b) => ((b.is_owner === true) - (a.is_owner === true)) || ((a.position ?? 0) - (b.position ?? 0)))
          .map(s => ({ ...s, service_ids: (s.staff_services || []).map(ss => ss.service_id), working_hours: s.working_hours || null })),
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
    url: `https://vellu.cc/${slug}`
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg, color: c.textLabel, fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      <div style={{ width: 40, height: 40, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (notFound) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: c.bg, color: c.text, fontFamily: "'Jost',sans-serif", gap: 16 }}>

      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>{lang === "nl" ? "Salon niet gevonden" : lang === "es" ? "Salón no encontrado" : "Salon not found"}</div>
      <div style={{ fontSize: 12, color: c.textLabel }}>vellu.cc/{slug} {lang === "nl" ? "bestaat niet" : lang === "es" ? "no existe" : "does not exist"}</div>
      <button className="btn-ghost" onClick={() => navigate("/")}>← {lang === "nl" ? "Terug naar home" : lang === "es" ? "Volver al inicio" : "Back to home"}</button>
    </div>
  );

  // Security: never trust an ?email= URL param for reviews — anyone can craft a URL to
  // impersonate a victim. Die identiteit komt nu uit het token in ?review=…, dat
  // ClientApp zelf uit de URL leest en aan submit_review geeft; de prop
  // reviewEmail bestond daar niet meer en is daarom hier ook weg. reviewMode
  // blijft alleen voor de oude ?review=true-links uit al verstuurde mails.
  return <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => navigate("/")} reviewMode={new URLSearchParams(window.location.search).get("review") === "true"} />;
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
        throw new Error(body?.error || error.message || "cancel_failed");
      }
      if (!data || data.status !== "cancelled") {
        throw new Error(data?.error || "cancel_failed");
      }

      const a = data.appointment;

      // All cancellation messaging is now sent SERVER-SIDE inside the
      // cancel-appointment edge function: the client's "afspraak geannuleerd"
      // email + SMS, and the owner/staff notification. This page is used by the
      // anonymous customer, whose browser can't authenticate to send-emails/
      // send-sms (they 401), so doing it here never worked. Nothing to send
      // client-side anymore.

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
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.treatment}</div>
                <div style={{ fontWeight: 500 }}>{appointment.service_name}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.date}</div>
                <div style={{ fontWeight: 500 }}>{appointment.date} {lang === "nl" ? "om" : lang === "es" ? "a las" : "at"} {appointment.time}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.total}</div>
                <div style={{ fontWeight: 500, color: ACCENT }}>{curSym(appointment.country_code)}{parseFloat(appointment.service_price).toFixed(2)}</div>
              </div>
            </div>
            
            <textarea 
              className="input-field" 
              placeholder={t.cancellationReason}
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ minHeight: 80, marginBottom: 16, resize: "none" }}
            />
            
            <button className="btn-primary" style={{ background: "#ef4444", color: "#fff", width: "100%" }} onClick={handleCancel}>
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
              {lang === "nl" ? "Je ontvangt een bevestiging per e-mail." : lang === "es" ? "Recibirás un correo de confirmación." : "You will receive a confirmation email."}
            </p>
            <button className="btn-ghost" onClick={() => navigate("/")}>
              {lang === "nl" ? "Terug naar home" : lang === "es" ? "Volver al inicio" : "Back to home"}
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
              {lang === "nl" ? "Terug naar home" : lang === "es" ? "Volver al inicio" : "Back to home"}
            </button>
          </div>
        )}

        {status === "too_late" && (
          <div className="fade-up">
            <div style={{ fontSize: 48, marginBottom: 20 }}>⏰</div>
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
                {appointment.service_name} — {appointment.date} {lang === "nl" ? "om" : lang === "es" ? "a las" : "at"} {appointment.time}
              </p>
            )}
            {lateInfo?.phone && (
              <a className="btn-primary" href={`tel:${String(lateInfo.phone).replace(/[^+\d]/g, "")}`}
                style={{ display: "block", width: "100%", textDecoration: "none", textAlign: "center", boxSizing: "border-box", marginBottom: 10 }}>
                {lang === "nl" ? `Bel ${lateInfo.salon || "de salon"}` : lang === "es" ? `Llamar a ${lateInfo.salon || "el salón"}` : `Call ${lateInfo.salon || "the salon"}`}
              </a>
            )}
            <button className="btn-ghost" style={{ width: "100%" }} onClick={() => navigate("/")}>
              {lang === "nl" ? "Terug naar home" : lang === "es" ? "Volver al inicio" : "Back to home"}
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
            <button className="btn-ghost" onClick={() => navigate("/")}>
              {lang === "nl" ? "Terug naar home" : lang === "es" ? "Volver al inicio" : "Back to home"}
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
          <a href="/privacy" style={{ color: ACCENT, textDecoration: "none" }}>{lang === "nl" ? "Meer info" : lang === "es" ? "Más información" : "Learn more"}</a>
        </div>
      </div>
      <button onClick={() => { localStorage.setItem("vellu_cookies_accepted", "true"); setVisible(false); }}
        aria-label={lang === "nl" ? "Begrepen" : lang === "es" ? "Entendido" : "Got it"}
        style={{ background: ACCENT, color: c.btnOnDark, border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Jost',sans-serif", flexShrink: 0 }}>
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
  // pill flip, (2) browser preference (nl-*, otherwise en), (3) nl default.
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem("vellu_lang");
      if (saved === "nl" || saved === "en" || saved === "es") return saved;
    } catch { /* private mode */ }
    if (typeof navigator !== "undefined") {
      const nav = (navigator.language || navigator.languages?.[0] || "").toLowerCase();
      if (nav.startsWith("nl")) return "nl";
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
              {/* Admin route — rendered for anyone, but the component itself
                  calls is_admin() via RPC and shows "Not authorised" for
                  non-admins. Real enforcement sits in the DB (app_admins). */}
              <Route path="/admin" element={<AdminRoute />} />
              <Route path="/:slug" element={<SalonRouteWrapper lang={lang} setLang={setLangPersist} />} />
            </Routes>
          </Suspense>
            <CookieConsent lang={lang} />
          </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
