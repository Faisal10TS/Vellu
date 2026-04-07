import { useState, useEffect, createContext, useContext, useRef, Component, Suspense } from "react";
import { supabase } from "./supabase.js";
import { BrowserRouter, Routes, Route, useParams, useNavigate, useLocation } from "react-router-dom";

// ─── THEME SYSTEM ─────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#0d0b0a",
    bgCard: "rgba(237,232,224,0.03)",
    bgCardHover: "rgba(237,232,224,0.06)",
    border: "rgba(237,232,224,0.08)",
    borderHover: "rgba(237,232,224,0.15)",
    text: "#ede8e0",
    textSub: "rgba(237,232,224,0.5)",
    textMuted: "rgba(237,232,224,0.25)",
    textLabel: "rgba(237,232,224,0.35)",
    inputBg: "rgba(237,232,224,0.04)",
    inputBorder: "rgba(237,232,224,0.1)",
    overlay: "rgba(0,0,0,0.95)",
    navBg: "rgba(13,11,10,1)",
    selectBg: "#1a1a1a",
    toggleInactive: "rgba(237,232,224,0.15)",
    btnOnDark: "#0d0b0a",
  },
  light: {
    bg: "#faf9f7",
    bgCard: "rgba(13,11,10,0.03)",
    bgCardHover: "rgba(13,11,10,0.06)",
    border: "rgba(13,11,10,0.12)",
    borderHover: "rgba(13,11,10,0.22)",
    text: "#1a1714",
    textSub: "rgba(13,11,10,0.7)",
    textMuted: "rgba(13,11,10,0.4)",
    textLabel: "rgba(13,11,10,0.55)",
    inputBg: "rgba(13,11,10,0.04)",
    inputBorder: "rgba(13,11,10,0.15)",
    overlay: "rgba(255,255,255,0.95)",
    navBg: "rgba(250,249,247,1)",
    selectBg: "#f0efed",
    toggleInactive: "rgba(13,11,10,0.2)",
    btnOnDark: "#1a1714",
  }
};

const ThemeContext = createContext({ theme: "dark", colors: THEMES.dark, toggle: () => {} });

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("vellu-theme") || "dark"; } catch { return "dark"; }
  });
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("vellu-theme", next); } catch {}
  };
  useEffect(() => {
    const bg = THEMES[theme].bg;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    const root = document.getElementById("root");
    if (root) root.style.background = bg;
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
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = (message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };
  return { toasts, show };
}

function ToastContainer({ toasts }) {
  const { colors: c } = useTheme();
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: "12px 20px", borderRadius: 14, fontSize: 13, fontWeight: 500,
          fontFamily: "'Jost',sans-serif", animation: "fadeUp 0.3s ease",
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
  const [state, setState] = useState(null); // { message, resolve }
  const confirm = (message) => new Promise((resolve) => setState({ message, resolve }));
  const handleYes = () => { state?.resolve(true); setState(null); };
  const handleNo = () => { state?.resolve(false); setState(null); };
  return { confirmState: state, confirm, handleYes, handleNo };
}

function ConfirmModal({ state, onYes, onNo, lang }) {
  const { colors: c } = useTheme();
  if (!state) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onNo}>
      <div style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: "28px 24px", maxWidth: 340, width: "100%", textAlign: "center", animation: "scaleIn 0.2s ease" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 20, lineHeight: 1.5, fontFamily: "'Jost',sans-serif" }}>{state.message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNo} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid " + c.border, background: "transparent", color: c.textSub, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}>
            {lang === "nl" ? "Annuleren" : "Cancel"}
          </button>
          <button onClick={onYes} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "#f87171", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}>
            {lang === "nl" ? "Verwijderen" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
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
    // Use supabase.functions.invoke which handles auth automatically
    const { data, error } = await supabase.functions.invoke("send-emails", {
      body: { type, booking }
    });
    if (error) console.error("Email error:", error);
    return data;
  } catch (e) {
    console.error("Email error:", e);
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

function getWhatsAppBookingMsg(lang, { clientName, salonName, date, time, serviceName, price }) {
  if (lang === "nl") {
    return `Hoi ${clientName}! ✨\n\nJe afspraak bij ${salonName} is bevestigd:\n📅 ${date}\n🕐 ${time}\n💅 ${serviceName}\n💰 €${price}\n\nTot dan! 🙏`;
  }
  return `Hi ${clientName}! ✨\n\nYour appointment at ${salonName} is confirmed:\n📅 ${date}\n🕐 ${time}\n💅 ${serviceName}\n💰 €${price}\n\nSee you then! 🙏`;
}

function getWhatsAppReminderMsg(lang, { clientName, salonName, date, time, serviceName }) {
  if (lang === "nl") {
    return `Hoi ${clientName}! 👋\n\nHerinnering: je hebt morgen een afspraak bij ${salonName}.\n📅 ${date}\n🕐 ${time}\n💅 ${serviceName}\n\nTot morgen! ✨`;
  }
  return `Hi ${clientName}! 👋\n\nReminder: you have an appointment at ${salonName} tomorrow.\n📅 ${date}\n🕐 ${time}\n💅 ${serviceName}\n\nSee you tomorrow! ✨`;
}

const getToday = () => new Date();
const fmt = (d) => d.toISOString().split("T")[0];
const getDays = (n = 14) => { const t = getToday(); return Array.from({ length: n }, (_, i) => { const d = new Date(t); d.setDate(t.getDate() + i); return d; }); };
const TIMES = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00"];
const DAY_NL = ["zo","ma","di","wo","do","vr","za"];
const DAY_EN = ["su","mo","tu","we","th","fr","sa"];
const DAY_FULL_NL = ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"];
const DAY_FULL_EN = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MON_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const MON_EN = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

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

const T = {
  nl: {
    book:"Boeken", myAppts:"Afspraken", dashboard:"Dashboard", agenda:"Agenda",
    invoices:"Facturen", settings:"Instellingen", selectService:"Kies een Behandeling",
    selectServiceSub:"Kies de behandeling die je wilt", selectDate:"Kies een Datum",
    selectDateSub:"Kies een datum en tijd", selectTime:"Kies een Tijd",
    yourDetails:"Jouw Gegevens", yourDetailsSub:"Vul je gegevens in",
    confirmBooking:"Bevestig je afspraak", confirmSub:"Controleer je gegevens",
    firstName:"Voornaam", lastName:"Achternaam", email:"E-mailadres",
    phone:"Telefoonnummer", optional:"optioneel",
    payMethod:"Betaalmethode", payOnline:"Online Betalen", payArrival:"Betalen bij Afspraak",
    next:"Volgende →", confirm:"Bevestigen", newBooking:"Nieuwe Afspraak",
    treatment:"Behandeling", date:"Datum", time:"Tijd", name:"Naam", payment:"Betaling",
    total:"Totaal", confirmed:"Bevestigd!", confirmedSub:"We zien je op", at:"om",
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
    manageAppts:"Beheer je afspraken", today:"Vandaag", earnings:"Inkomsten",
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
    totalRevenue:"Totale omzet", totalAppts:"Totaal afspraken", avgRating:"Gem. beoordeling",
    popularServices:"Populairste behandelingen", busiestDays:"Drukste dagen",
    revenueOverTime:"Omzet verloop", bookings:"boekingen",
    staff:"Team", addStaff:"+ Medewerker toevoegen", staffName:"Naam medewerker", staffBio:"Korte bio (zichtbaar voor klanten)",
    staffRole:"Functie (bijv. Nagelstyliste)", selectStaff:"Kies een medewerker",
    anyStaff:"Geen voorkeur", noStaff:"Nog geen medewerkers",
    businessHours:"Openingstijden", openTime:"Open", closeTime:"Sluit", closed:"Gesloten",
    businessHoursDesc:"Stel je werkdagen en -uren in", closedOnDay:"Gesloten op deze dag",
    // New customization translations
    bookingPolicy:"Boekingsvoorwaarden", bookingPolicyDesc:"Voorwaarden waar klanten mee akkoord moeten gaan",
    salonContact:"Contactgegevens salon", salonContactDesc:"Zichtbaar op je salonpagina voor klanten",
    salonPhone:"Telefoonnummer salon", salonInstagram:"Instagram (bijv. @jouwnaam)", salonEmail:"E-mail salon (zichtbaar voor klanten)",
    bookingPolicyPlaceholder:"Bijv. Annuleren kan tot 24 uur van tevoren...",
    agreeToPolicy:"Ik ga akkoord met de voorwaarden",
    phoneRequired:"Telefoonnummer verplicht", phoneRequiredDesc:"Maak telefoonnummer verplicht voor klanten",
    appearance:"Uiterlijk", logo:"Logo", coverImage:"Cover afbeelding",
    uploadLogo:"Logo uploaden", uploadCover:"Cover uploaden", removeLogo:"Verwijder logo", removeCover:"Verwijder cover",
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
    // Cancellation
    cancelBooking:"Afspraak annuleren", cancelBookingDesc:"Weet je zeker dat je wilt annuleren?",
    cancellationReason:"Reden voor annulering (optioneel)", confirmCancel:"Ja, annuleren",
    bookingCancelled:"Je afspraak is geannuleerd", cannotCancel:"Annuleren niet meer mogelijk",
    cancelBeforeTime:"Annuleren kan tot 24 uur van tevoren",
    // Pagination & Timeline
    showMore:"Meer laden", showing:"Getoond", of:"van",
    todaySchedule:"Schema vandaag", nextUp:"Volgende", inProgress:"Nu bezig", upcoming:"Straks",
    noMoreToday:"Geen afspraken meer vandaag", freeDay:"Vrije dag!",
    startsIn:"Start over", minutesShort:"min", hoursShort:"u",
    // Subscriptions
    choosePlan:"Kies een abonnement", choosePlanSub:"Selecteer het plan dat bij jou past",
    planStarter:"Starter", planProfessional:"Professional",
    planStarterPrice:"19", planProfessionalPrice:"39",
    perMonth:"/maand", planStarterDesc:"Perfect om te beginnen", planProfessionalDesc:"Voor de groeiende salon",
    planFeatureBookings:"Online boekingen", planFeatureStaff:"Team beheer", planFeatureAnalytics:"Analytics dashboard",
    planFeatureReviews:"Reviews systeem", planFeatureEmail:"Email bevestigingen", planFeatureReminders:"24u herinneringen",
    planFeatureCustomBranding:"Eigen branding", planFeatureDiscounts:"Kortingscodes", planFeaturePriority:"Prioriteit support",
    planFeatureUnlimited:"Onbeperkt medewerkers", planFeatureCategories:"Categorieën",
    selectPlan:"Plan kiezen", currentPlan:"Huidig plan", activePlan:"Actief", planExpires:"Verloopt op",
    billing:"Abonnement", billingDesc:"Beheer je abonnement", noPlan:"Geen actief abonnement",
    contactSupport:"Neem contact op om je plan te wijzigen", paymentComingSoon:"Betaling via iDEAL komt binnenkort beschikbaar",
    planActive:"Je abonnement is actief", upgradePlan:"Upgraden",
    // Break times & no-show & allergies
    breakMinutes:"Pauzetijd tussen afspraken", breakMinutesDesc:"Buffer na elke afspraak",
    breakNone:"Geen pauze", breakMin:"min pauze",
    noShow:"Niet verschenen", markNoShow:"No-show", noShowWarning:"Let op: deze klant is eerder niet verschenen",
    noShowCount:"keer niet verschenen",
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
    // Client dashboard
    myAppointments:"Mijn afspraken", enterEmailToLogin:"Voer je e-mail in om je afspraken te bekijken",
    sendCode:"Code versturen", enterCode:"Voer de 6-cijferige code in", verifyCode:"Verifiëren",
    codeExpired:"Code verlopen, probeer opnieuw", codeSent:"Code verzonden naar",
    upcomingAppointments:"Komende afspraken", pastAppointments:"Eerdere afspraken",
    rebookBtn:"Opnieuw boeken", myDetails:"Mijn gegevens", updateAllergies:"Bijwerken",
    allergiesUpdated:"Allergieën bijgewerkt", noUpcoming:"Geen komende afspraken",
    noPast:"Geen eerdere afspraken", loginFailed:"Geen account gevonden met dit e-mailadres",
    wrongCode:"Onjuiste code", backToBooking:"Terug naar boeken",
    // Client accounts with PIN
    clientLogin:"Inloggen", clientRegister:"Account aanmaken", enterPin:"Voer je 4-cijferige PIN in",
    choosePin:"Kies een 4-cijferige PIN", pinPlaceholder:"0000", wrongPin:"Onjuiste PIN",
    accountExists:"Er bestaat al een account met dit e-mailadres. Log in met je PIN.",
    createAccountPrompt:"Maak een account aan om je afspraken altijd terug te vinden",
    createAccountBtn:"Account aanmaken met PIN", skipAccount:"Overslaan",
    loggedInAs:"Ingelogd als", clientLogout:"Uitloggen", backToBook:"← Terug naar boeken",
    pinSaved:"Account aangemaakt!", noAccountYet:"Nog geen account?",
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
    blockedDays:"Geblokkeerde dagen", addBlocked:"+ Dag blokkeren",
    blockedDesc:"Blokkeer dagen (bijv. vakantie) zonder je vaste dagen te wijzigen",
    blockedReason:"Reden (optioneel)", vacation:"Vakantie", blocked:"Geblokkeerd",
    dateFrom:"Van", dateTo:"Tot",
    // Staff availability
    staffAvailability:"Beschikbaarheid", staffDays:"Werkdagen",
    staffAvailabilityDesc:"Stel per medewerker in op welke dagen ze werken",
    // Team accounts
    accountType:"Account type", jointAccount:"Gedeeld account", teamAccount:"Team account",
    jointDesc:"Eén login voor de hele salon", teamDesc:"Elke medewerker heeft een eigen login",
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
  },
  en: {
    book:"Book", myAppts:"Appointments", dashboard:"Dashboard", agenda:"Calendar",
    invoices:"Invoices", settings:"Settings", selectService:"Select a Service",
    selectServiceSub:"Choose the treatment you'd like", selectDate:"Select a Date",
    selectDateSub:"Pick a date and time", selectTime:"Select a Time",
    yourDetails:"Your Details", yourDetailsSub:"Fill in your information",
    confirmBooking:"Confirm Booking", confirmSub:"Review your details",
    firstName:"First Name", lastName:"Last Name", email:"Email address",
    phone:"Phone number", optional:"optional",
    payMethod:"Payment Method", payOnline:"Pay Online", payArrival:"Pay at Appointment",
    next:"Next →", confirm:"Confirm", newBooking:"New Booking",
    treatment:"Treatment", date:"Date", time:"Time", name:"Name", payment:"Payment",
    total:"Total", confirmed:"Confirmed!", confirmedSub:"We'll see you on", at:"at",
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
    manageAppts:"Manage your appointments", today:"Today", earnings:"Earnings",
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
    totalRevenue:"Total revenue", totalAppts:"Total appointments", avgRating:"Avg. rating",
    popularServices:"Most popular services", busiestDays:"Busiest days",
    revenueOverTime:"Revenue over time", bookings:"bookings",
    staff:"Team", addStaff:"+ Add staff member", staffName:"Staff name", staffBio:"Short bio (visible to clients)",
    staffRole:"Role (e.g. Nail technician)", selectStaff:"Choose a staff member",
    anyStaff:"No preference", noStaff:"No staff members yet",
    businessHours:"Business Hours", openTime:"Open", closeTime:"Close", closed:"Closed",
    businessHoursDesc:"Set your working days and hours", closedOnDay:"Closed on this day",
    // New customization translations
    bookingPolicy:"Booking Policy", bookingPolicyDesc:"Terms clients must agree to before booking",
    salonContact:"Salon contact details", salonContactDesc:"Visible on your salon page for clients",
    salonPhone:"Salon phone number", salonInstagram:"Instagram (e.g. @yourname)", salonEmail:"Salon email (visible to clients)",
    bookingPolicyPlaceholder:"E.g. Cancellations must be made 24 hours in advance...",
    agreeToPolicy:"I agree to the booking policy",
    phoneRequired:"Phone number required", phoneRequiredDesc:"Make phone number mandatory for clients",
    appearance:"Appearance", logo:"Logo", coverImage:"Cover image",
    uploadLogo:"Upload logo", uploadCover:"Upload cover", removeLogo:"Remove logo", removeCover:"Remove cover",
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
    // Cancellation
    cancelBooking:"Cancel booking", cancelBookingDesc:"Are you sure you want to cancel?",
    cancellationReason:"Reason for cancellation (optional)", confirmCancel:"Yes, cancel",
    bookingCancelled:"Your booking has been cancelled", cannotCancel:"Cancellation no longer possible",
    cancelBeforeTime:"Cancellations must be made 24 hours in advance",
    // Pagination & Timeline
    showMore:"Load more", showing:"Showing", of:"of",
    todaySchedule:"Today's schedule", nextUp:"Next up", inProgress:"In progress", upcoming:"Upcoming",
    noMoreToday:"No more appointments today", freeDay:"Day off!",
    startsIn:"Starts in", minutesShort:"min", hoursShort:"h",
    // Subscriptions
    choosePlan:"Choose a plan", choosePlanSub:"Select the plan that fits you",
    planStarter:"Starter", planProfessional:"Professional",
    planStarterPrice:"19", planProfessionalPrice:"39",
    perMonth:"/month", planStarterDesc:"Perfect to get started", planProfessionalDesc:"For the growing salon",
    planFeatureBookings:"Online bookings", planFeatureStaff:"Team management", planFeatureAnalytics:"Analytics dashboard",
    planFeatureReviews:"Reviews system", planFeatureEmail:"Email confirmations", planFeatureReminders:"24h reminders",
    planFeatureCustomBranding:"Custom branding", planFeatureDiscounts:"Discount codes", planFeaturePriority:"Priority support",
    planFeatureUnlimited:"Unlimited staff", planFeatureCategories:"Categories",
    selectPlan:"Choose plan", currentPlan:"Current plan", activePlan:"Active", planExpires:"Expires on",
    billing:"Subscription", billingDesc:"Manage your subscription", noPlan:"No active subscription",
    contactSupport:"Contact us to change your plan", paymentComingSoon:"iDEAL payment coming soon",
    planActive:"Your subscription is active", upgradePlan:"Upgrade",
    // Break times & no-show & allergies
    breakMinutes:"Break time between appointments", breakMinutesDesc:"Buffer after each appointment",
    breakNone:"No break", breakMin:"min break",
    noShow:"No-show", markNoShow:"No-show", noShowWarning:"Note: this client has missed appointments before",
    noShowCount:"times no-show",
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
    // Client dashboard
    myAppointments:"My appointments", enterEmailToLogin:"Enter your email to view your appointments",
    sendCode:"Send code", enterCode:"Enter the 6-digit code", verifyCode:"Verify",
    codeExpired:"Code expired, try again", codeSent:"Code sent to",
    upcomingAppointments:"Upcoming appointments", pastAppointments:"Past appointments",
    rebookBtn:"Book again", myDetails:"My details", updateAllergies:"Update",
    allergiesUpdated:"Allergies updated", noUpcoming:"No upcoming appointments",
    noPast:"No past appointments", loginFailed:"No account found with this email",
    wrongCode:"Incorrect code", backToBooking:"Back to booking",
    // Client accounts with PIN
    clientLogin:"Sign in", clientRegister:"Create account", enterPin:"Enter your 4-digit PIN",
    choosePin:"Choose a 4-digit PIN", pinPlaceholder:"0000", wrongPin:"Incorrect PIN",
    accountExists:"An account with this email already exists. Log in with your PIN.",
    createAccountPrompt:"Create an account to always find your appointments",
    createAccountBtn:"Create account with PIN", skipAccount:"Skip",
    loggedInAs:"Logged in as", clientLogout:"Log out", backToBook:"← Back to booking",
    pinSaved:"Account created!", noAccountYet:"No account yet?",
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
    blockedDays:"Blocked days", addBlocked:"+ Block day",
    blockedDesc:"Block days (e.g. vacation) without changing your regular hours",
    blockedReason:"Reason (optional)", vacation:"Vacation", blocked:"Blocked",
    dateFrom:"From", dateTo:"To",
    // Staff availability
    staffAvailability:"Availability", staffDays:"Working days",
    staffAvailabilityDesc:"Set working days per staff member",
    // Team accounts
    accountType:"Account type", jointAccount:"Joint account", teamAccount:"Team account",
    jointDesc:"One login for the entire salon", teamDesc:"Each staff member has their own login",
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
  }
};


// ─── CSS ─────────────────────────────────────────────────────
const makeCSS = (accent, c = THEMES.dark) => `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  input, textarea, select { outline: none; font-family: 'Jost', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
  @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
  .fade-up { animation: fadeUp 0.38s cubic-bezier(0.16,1,0.3,1) both; }
  .scale-in { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both; }

  .btn-primary {
    background: ${accent}; color: ${c.btnOnDark}; border: none; border-radius: 100px;
    padding: 15px 28px; font-family: 'Jost',sans-serif; font-size: 13px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; width: 100%;
    transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
  }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 32px ${accent}55; }
  .btn-primary:disabled { opacity: 0.28; cursor: not-allowed; transform: none; box-shadow: none; }

  .btn-ghost {
    background: transparent; color: ${c.textSub};
    border: 1px solid ${c.borderHover}; border-radius: 100px;
    padding: 11px 20px; font-family: 'Jost',sans-serif; font-size: 11px; font-weight: 500;
    letter-spacing: 0.07em; text-transform: uppercase; cursor: pointer; transition: all 0.2s;
  }
  .btn-ghost:hover { background: ${c.bgCardHover}; color: ${c.text}; border-color: ${c.borderHover}; }

  .input-field {
    background: ${c.inputBg}; border: 1px solid ${c.inputBorder};
    border-radius: 14px; padding: 14px 17px; color: ${c.text};
    font-family: 'Jost',sans-serif; font-size: 13px; width: 100%; transition: all 0.2s;
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

  .badge { font-size: 10px; font-weight: 600; padding: 3px 10px; border-radius: 100px; letter-spacing: 0.08em; text-transform: uppercase; }
  .badge-confirmed { background: rgba(147,197,253,0.1); color: #93c5fd; border: 1px solid rgba(147,197,253,0.2); }
  .badge-completed { background: rgba(134,239,172,0.1); color: #86efac; border: 1px solid rgba(134,239,172,0.2); }
  .badge-cancelled { background: rgba(248,113,113,0.1); color: #f87171; border: 1px solid rgba(248,113,113,0.2); }
  .badge-no_show { background: rgba(251,146,60,0.1); color: #fb923c; border: 1px solid rgba(251,146,60,0.2); }

  .confirm-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid ${c.bgCardHover}; }
  .confirm-row:last-child { border-bottom: none; }
  .stat-card { background: ${c.bgCard}; border: 1px solid ${c.border}; border-radius: 20px; padding: 18px 20px; flex: 1; }

  .lang-toggle { background: ${c.bgCardHover}; border: 1px solid ${c.inputBorder}; border-radius: 100px; padding: 5px; display: flex; gap: 2px; }
  .lang-btn { padding: 5px 10px; border-radius: 100px; font-family: 'Jost',sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; cursor: pointer; border: none; transition: all 0.2s; text-transform: uppercase; }
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
    .btn-primary { padding: 16px 28px; font-size: 14px; }
    .btn-ghost { font-size: 12px; }
    .input-field { padding: 15px 17px; font-size: 14px; }
    .nav-item { padding: 8px 4px; }
  }

  /* ── SALON PROFILE PAGE ── */
  /* Override #root padding for full-bleed profile */
  .profile-root { margin: -32px -16px; width: calc(100% + 32px); }
  @media (max-width: 520px) { .profile-root { margin: 0; width: 100%; } }

  .profile-header {
    position: sticky; top: 0; z-index: 50; background: ${c.bg};
    border-bottom: 1px solid ${c.border};
    display: flex; align-items: center; padding: 0 28px; height: 52px;
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
    font-family: 'Cormorant Garamond', serif; font-size: 16px; font-weight: 400; color: ${c.text};
  }
  .profile-tabs {
    display: flex; gap: 0; flex: 1; overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .profile-tabs::-webkit-scrollbar { display: none; }
  .profile-tab {
    position: relative; padding: 16px 14px; font-size: 13px; font-weight: 400;
    color: ${c.textLabel}; cursor: pointer; transition: color 0.2s;
    background: none; border: none; font-family: 'Jost', sans-serif;
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
    background: linear-gradient(135deg, #1a1814 0%, ${c.bg} 40%, #18161a 100%);
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
    font-family: 'Cormorant Garamond', serif; font-weight: 300; color: #fff;
    letter-spacing: 0.03em; text-shadow: 0 2px 16px rgba(0,0,0,0.5);
  }

  .profile-body {
    max-width: 1200px; margin: 0 auto; display: flex; gap: 0;
    padding: 0;
  }
  .profile-main {
    flex: 1; min-width: 0;
    border-right: 1px solid ${c.border};
    padding: 0 32px;
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
    margin-bottom: 18px; font-family: 'Jost', sans-serif;
  }

  /* Service rows — Setmore style */
  .profile-service-row {
    display: flex; align-items: center; gap: 16px;
    padding: 18px 0; border-bottom: 1px solid ${c.border};
    cursor: pointer; transition: background 0.2s;
  }
  .profile-service-row:last-child { border-bottom: none; }
  .profile-service-row:hover { background: ${c.bgCard}; margin: 0 -12px; padding: 18px 12px; border-radius: 12px; }
  .profile-service-thumb {
    width: 54px; height: 54px; border-radius: 10px; object-fit: cover;
    flex-shrink: 0; background: ${c.bgCard}; border: 1px solid ${c.border};
  }
  .profile-service-info { flex: 1; min-width: 0; }
  .profile-service-name { font-size: 15px; font-weight: 500; color: ${c.text}; margin-bottom: 4px; }
  .profile-service-meta {
    font-size: 13px; color: ${c.textLabel};
    display: flex; align-items: center; gap: 6px;
  }
  .profile-service-meta a { color: ${accent}; text-decoration: underline; cursor: pointer; }
  .profile-service-price {
    font-size: 15px; font-weight: 500; color: ${c.text};
    margin-right: 8px; flex-shrink: 0;
  }
  .profile-service-chevron { color: ${c.textMuted}; flex-shrink: 0; }

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
    border-radius: 8px; font-size: 13px; font-weight: 500; color: ${c.text};
    cursor: pointer; transition: all 0.2s; background: transparent;
    font-family: 'Jost', sans-serif; margin-top: 8px;
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
    font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 300; color: ${c.text};
  }
  .profile-sidebar-name {
    font-size: 18px; font-weight: 500; color: ${c.text}; text-align: center;
    font-family: 'Jost', sans-serif;
  }
  .profile-sidebar-rating {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    margin-top: 6px; font-size: 13px; color: ${c.textSub};
  }
  .profile-book-btn {
    width: 100%; padding: 13px; border-radius: 8px; border: none;
    background: ${accent}; color: ${c.btnOnDark}; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; font-family: 'Jost', sans-serif;
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

  /* Mobile bottom bar */
  .profile-mobile-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 12px 20px; padding-bottom: max(12px, env(safe-area-inset-bottom));
    background: ${c.bg};
    border-top: 1px solid ${c.border}; z-index: 100;
    display: none; gap: 12px; align-items: center;
  }

  /* Category pills */
  .profile-cat-pill {
    padding: 7px 16px; border-radius: 100px; font-size: 12px; font-weight: 500;
    border: 1px solid ${c.inputBorder}; background: transparent;
    color: ${c.textSub}; cursor: pointer; transition: all 0.2s;
    font-family: 'Jost', sans-serif; white-space: nowrap; flex-shrink: 0;
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
    .profile-header { padding: 0 16px; height: 48px; gap: 12px; }
    .profile-header-contact { display: none; }
    .profile-root { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
    .profile-scroll-area { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
    .profile-main { border-right: none; padding: 0 18px; }
    .profile-sidebar { display: none; }
    .profile-body { flex-direction: column; }
    .profile-mobile-bar { display: flex; position: static; flex-shrink: 0; }
    .profile-section { scroll-margin-top: 52px; }
  }
`;

// ─── SHARED ───────────────────────────────────────────────────
// Layout wrapper - full-screen responsive (replaces old Phone component)
function Layout({ children, accent = ACCENT, maxWidth = "100%" }) {
  const { colors: c } = useTheme();
  return (
    <div style={{ width: "100%", maxWidth, margin: "0 auto", background: c.bg, minHeight: "100dvh" }}>
      <style>{makeCSS(accent, c)}</style>
      {children}
    </div>
  );
}

function NavIcon({ name, size = 18, color = "currentColor" }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    dashboard: <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
    agenda: <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    analytics: <svg {...props}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    facturen: <svg {...props}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>,
    instellingen: <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    plus: <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
    download: <svg {...props}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
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
        <button key={m} className={`lang-btn ${theme === m ? "active" : "inactive"}`} onClick={toggle} style={{ padding: "5px 9px", display: "flex", alignItems: "center" }}><NavIcon name={icon} size={12} color="currentColor" /></button>
      ))}
    </div>
  );
}

function LangToggle({ lang, setLang }) {
  return (
    <div className="lang-toggle">
      {["nl","en"].map(l => (
        <button key={l} className={`lang-btn ${lang === l ? "active" : "inactive"}`} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
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

// ─── LANDING ─────────────────────────────────────────────────
function LandingScreen({ onSelectSalon, onOwnerEnter, lang, setLang, salons = {} }) {
  const { colors: c, theme } = useTheme();
  const navigate = useNavigate();
  const t = T[lang];
  const [slugInput, setSlugInput] = useState("");
  const [error, setError] = useState("");
  const [faqOpen, setFaqOpen] = useState(null);

  const goToSlug = (slug) => {
    let clean = slug.toLowerCase().trim()
      .replace(/^https?:\/\//, "")
      .replace(/^(www\.)?vellu\.cc\//, "");
    if (!clean) return;
    navigate("/" + clean);
  };

  const faqs = lang === "nl" ? [
    ["Wat is Vellu precies?", "Vellu geeft jou je eigen boekingspagina op vellu.cc/jouw-naam. Klanten boeken direct bij jou, zonder tussenpartij. Jij beheert alles vanuit je dashboard."],
    ["Voor wie is Vellu?", "Voor onafhankelijke beauty professionals: nail techs, lash artists, brow specialists, kappers, en beautysalons. Of je nu solo werkt of een team hebt."],
    ["Hoeveel kost het?", "Starter is €19/maand, Professional €39/maand. Vast tarief, 0% commissie per boeking. Geen verborgen kosten."],
    ["Waarom geen commissie?", "Wij geloven dat jouw omzet van jou is. Je betaalt een vast bedrag per maand en houdt 100% van elke boeking."],
    ["Kan ik het eerst uitproberen?", "Ja, je kan je pagina gratis opzetten en alles instellen. Je betaalt pas als je live wilt gaan."],
    ["Kunnen mijn medewerkers hun eigen agenda beheren?", "Ja! Met het Professional plan krijgt elke medewerker een eigen login. Ze zien alleen hun eigen afspraken en beheren hun eigen diensten en werktijden."],
    ["Krijgen klanten herinneringen?", "Ja, automatisch. Bevestiging bij het boeken, herinnering 24 uur van tevoren, en een follow-up na het bezoek voor een review."],
    ["Hoe annuleren klanten?", "Via de annuleringslink in hun bevestigingsmail. Jij bepaalt tot wanneer ze kunnen annuleren."],
  ] : [
    ["What is Vellu exactly?", "Vellu gives you your own booking page at vellu.cc/your-name. Clients book directly with you, no middleman. You manage everything from your dashboard."],
    ["Who is Vellu for?", "For independent beauty professionals: nail techs, lash artists, brow specialists, hairdressers, and beauty salons. Whether you work solo or have a team."],
    ["How much does it cost?", "Starter is €19/month, Professional €39/month. Fixed price, 0% commission per booking. No hidden fees."],
    ["Why no commission?", "We believe your revenue is yours. You pay a fixed monthly fee and keep 100% of every booking."],
    ["Can I try it first?", "Yes, you can set up your page for free and configure everything. You only pay when you want to go live."],
    ["Can my staff manage their own agenda?", "Yes! With the Professional plan, each staff member gets their own login. They only see their own appointments and manage their own services and hours."],
    ["Do clients receive reminders?", "Yes, automatically. Confirmation when booking, reminder 24 hours before, and a follow-up after the visit for a review."],
    ["How do clients cancel?", "Via the cancellation link in their confirmation email. You decide the cancellation deadline."],
  ];

  return (
    <Layout>
      <div style={{ 
        background: c.bg, 
        minHeight: "100dvh", 
        fontFamily: "'Jost',sans-serif", 
        color: c.text,
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Ambient glow */}
        <div style={{ position: "absolute", top: "-20%", left: "20%", width: "60%", height: "60%", background: `radial-gradient(ellipse at center, ${ACCENT}0a 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "-10%", width: "40%", height: "40%", background: `radial-gradient(ellipse at center, ${ACCENT}06 0%, transparent 60%)`, pointerEvents: "none" }} />

        {/* Navigation */}
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 32px", position: "relative", zIndex: 10, maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 26, fontWeight: 300, letterSpacing: "0.18em" }}>vellu</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ThemeToggle />
            <LangToggle lang={lang} setLang={setLang} />
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => navigate("/owner")}>
              <NavIcon name="crown" size={12} color={ACCENT} /> {lang === "nl" ? "Inloggen" : "Sign in"}
            </button>
          </div>
        </nav>

        {/* ─── HERO ─── */}
        <div style={{ padding: "80px 24px 60px", textAlign: "center", position: "relative", zIndex: 10, maxWidth: 700, margin: "0 auto" }}>
          <div className="fade-up">
            <div style={{ display: "inline-block", background: `${ACCENT}15`, border: `1px solid ${ACCENT}33`, borderRadius: 100, padding: "6px 18px", fontSize: 11, fontWeight: 500, color: ACCENT, letterSpacing: "0.04em", marginBottom: 28 }}>
              <NavIcon name="sparkle" size={11} color={ACCENT} /> {lang === "nl" ? "Voor nail techs, lash artists, kappers & meer" : "For nail techs, lash artists, hairdressers & more"}
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(44px, 9vw, 72px)", fontWeight: 300, letterSpacing: "0.06em", lineHeight: 1.05, marginBottom: 24 }}>
              {lang === "nl" ? "Jouw salon." : "Your salon."}
              <br />
              <span style={{ color: ACCENT }}>{lang === "nl" ? "Jouw merk. Jouw klanten." : "Your brand. Your clients."}</span>
            </h1>
            <p style={{ fontSize: "clamp(14px, 2vw, 17px)", color: c.textSub, lineHeight: 1.7, maxWidth: 480, margin: "0 auto 40px", letterSpacing: "0.01em" }}>
              {lang === "nl" 
                ? "Je eigen boekingspagina met jouw naam, jouw kleuren en jouw diensten. Vast tarief, 0% commissie. Klaar in 2 minuten." 
                : "Your own booking page with your name, your colors and your services. Fixed price, 0% commission. Ready in 2 minutes."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" style={{ width: "auto", padding: "16px 36px", fontSize: 13 }} onClick={() => navigate("/owner")}>
                {lang === "nl" ? "Gratis beginnen →" : "Start for free →"}
              </button>
              <button className="btn-ghost" style={{ width: "auto", padding: "16px 28px", fontSize: 13, color: c.textSub }} onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                {lang === "nl" ? "Hoe werkt het?" : "How does it work?"}
              </button>
            </div>
          </div>
        </div>

        {/* ─── SOCIAL PROOF ─── */}
        <div style={{ padding: "20px 24px 60px", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap", opacity: 0.6 }}>
            {[
              { num: "0%", nl: "Commissie", en: "Commission" },
              { num: "24/7", nl: "Online beschikbaar", en: "Available online" },
              { num: "€19", nl: "Vast per maand", en: "Fixed per month" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: ACCENT }}>{s.num}</div>
                <div style={{ fontSize: 10, color: c.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{lang === "nl" ? s.nl : s.en}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── SEARCH BOX ─── */}
        <div style={{ padding: "0 24px 60px", position: "relative", zIndex: 10 }}>
          <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 24, padding: "28px 28px", maxWidth: 440, margin: "0 auto" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textMuted, marginBottom: 10 }}>
              {lang === "nl" ? "Al een afspraak? Ga naar je salon" : "Have an appointment? Go to your salon"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: c.textMuted, pointerEvents: "none" }}>vellu.cc/</div>
                <input className="input-field" placeholder={lang === "nl" ? "salon-naam" : "salon-name"} value={slugInput} onChange={e => setSlugInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && goToSlug(slugInput)} style={{ paddingLeft: 85, borderRadius: 12 }} />
              </div>
              <button className="btn-primary" style={{ width: "auto", padding: "14px 24px", flexShrink: 0 }} onClick={() => goToSlug(slugInput)}>→</button>
            </div>
          </div>
        </div>

        {/* ─── HOW IT WORKS ─── */}
        <div id="how-it-works" style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {lang === "nl" ? "In 3 stappen live" : "Live in 3 steps"}
              </div>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
              {[
                { num: "01", icon: "diamond", nl: ["Maak je pagina", "Voeg je behandelingen toe, stel je team in, kies je kleuren. Je eigen link: vellu.cc/jouw-naam."], en: ["Create your page", "Add your treatments, set up your team, choose your colors. Your own link: vellu.cc/your-name."] },
                { num: "02", icon: "target", nl: ["Deel je link", "Zet je link in je Instagram bio, WhatsApp status of visitekaartje. Klanten boeken direct, zonder tussenpartij."], en: ["Share your link", "Put your link in your Instagram bio, WhatsApp status or business card. Clients book directly, no middleman."] },
                { num: "03", icon: "sparkle", nl: ["Ontvang boekingen", "Automatische bevestigingen, 24u herinneringen en follow-up emails. Jij focust op je vak, Vellu regelt de rest."], en: ["Receive bookings", "Automatic confirmations, 24h reminders and follow-up emails. You focus on your craft, Vellu handles the rest."] }
              ].map((item, i) => (
                <div key={i} style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 24, padding: "32px 28px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 16, right: 20, fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: `${ACCENT}12` }}>{item.num}</div>
                  <div style={{ marginBottom: 16 }}><NavIcon name={item.icon} size={28} color={ACCENT} /></div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>
                    {lang === "nl" ? item.nl[0] : item.en[0]}
                  </div>
                  <div style={{ fontSize: 13, color: c.textLabel, lineHeight: 1.7 }}>
                    {lang === "nl" ? item.nl[1] : item.en[1]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── FEATURES ─── */}
        <div style={{ padding: "40px 24px 60px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {lang === "nl" ? "Alles wat je salon nodig heeft" : "Everything your salon needs"}
              </div>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              {[
                { icon: "calendar", nl: "Eigen boekingspagina", en: "Your own booking page", sub: { nl: "vellu.cc/jouw-naam — jouw merk, jouw link", en: "vellu.cc/your-name — your brand, your link" } },
                { icon: "team", nl: "Team accounts", en: "Team accounts", sub: { nl: "Elke medewerker een eigen login, agenda en diensten", en: "Each staff member gets their own login, schedule and services" } },
                { icon: "mail", nl: "Automatische emails", en: "Automatic emails", sub: { nl: "Bevestigingen, herinneringen en follow-ups", en: "Confirmations, reminders and follow-ups" } },
                { icon: "chart", nl: "0% commissie", en: "0% commission", sub: { nl: "Vast maandtarief. Geen verborgen kosten, geen commissie per boeking", en: "Fixed monthly price. No hidden fees, no commission per booking" } },
                { icon: "star2", nl: "Reviews", en: "Reviews", sub: { nl: "Automatisch reviews verzamelen na bezoek", en: "Automatically collect reviews after visits" } },
                { icon: "palette", nl: "Eigen branding", en: "Custom branding", sub: { nl: "Jouw logo, kleuren en stijl", en: "Your logo, colors and style" } },
                { icon: "camera", nl: "Portfolio", en: "Portfolio", sub: { nl: "Foto's per behandeling tonen", en: "Show photos per treatment" } },
                { icon: "tag", nl: "Kortingscodes", en: "Discount codes", sub: { nl: "Maak en deel korting met je klanten", en: "Create and share discounts with clients" } },
              ].map((f, i) => (
                <div key={i} style={{ padding: "20px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 18 }}>
                  <NavIcon name={f.icon} size={24} color={ACCENT} />
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{lang === "nl" ? f.nl : f.en}</div>
                  <div style={{ fontSize: 11, color: c.textLabel, lineHeight: 1.5 }}>{lang === "nl" ? f.sub.nl : f.sub.en}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── TESTIMONIALS ─── */}
        <div style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {lang === "nl" ? "Wat onze gebruikers zeggen" : "What our users say"}
              </div>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {(lang === "nl" ? [
                { name: "Yasmin El Amrani", role: "Nail Tech · Amsterdam", text: "Eindelijk een boekingssysteem zonder commissie. Mijn klanten boeken nu 24/7 en ik heb alles op één plek. Super blij mee!", rating: 5 },
                { name: "Sophie de Vries", role: "Lash Artist · Utrecht", text: "De automatische herinneringen hebben mijn no-shows met 80% verminderd. En het ziet er zo professioneel uit — klanten zijn onder de indruk.", rating: 5 },
                { name: "Fatima Benali", role: "Kapsalon · Rotterdam", text: "We zijn overgestapt van Treatwell en besparen nu honderden euro's per maand. Het team account werkt perfect voor ons salon met 4 medewerkers.", rating: 5 },
              ] : [
                { name: "Yasmin El Amrani", role: "Nail Tech · Amsterdam", text: "Finally a booking system without commission. My clients book 24/7 and I have everything in one place. Super happy with it!", rating: 5 },
                { name: "Sophie de Vries", role: "Lash Artist · Utrecht", text: "The automatic reminders reduced my no-shows by 80%. And it looks so professional — clients are impressed.", rating: 5 },
                { name: "Fatima Benali", role: "Hair Salon · Rotterdam", text: "We switched from Treatwell and now save hundreds of euros per month. The team account works perfectly for our salon with 4 staff members.", rating: 5 },
              ]).map((review, i) => (
                <div key={i} style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "24px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[1,2,3,4,5].map(s => (
                      <svg key={s} width={14} height={14} viewBox="0 0 20 20" fill={s <= review.rating ? "#f5c518" : c.inputBg}>
                        <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 13.28l-4.77 2.43.91-5.32L2.27 6.62l5.34-.78L10 1z" />
                      </svg>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, flex: 1 }}>"{review.text}"</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{review.name}</div>
                    <div style={{ fontSize: 11, color: c.textLabel }}>{review.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── PRICING ─── */}
        <div style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {lang === "nl" ? "Simpele, eerlijke prijzen" : "Simple, honest pricing"}
              </div>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {[
                { name: "Starter", price: "19", popular: false, features: { nl: ["Online boekingen", "Email bevestigingen", "24u herinneringen", "Reviews systeem", "Tot 3 medewerkers"], en: ["Online bookings", "Email confirmations", "24h reminders", "Reviews system", "Up to 3 staff members"] } },
                { name: "Professional", price: "39", popular: true, features: { nl: ["Alles van Starter +", "Onbeperkt medewerkers", "Team accounts (eigen login)", "Analytics dashboard", "Eigen branding & logo", "Kortingscodes", "Prioriteit support"], en: ["Everything in Starter +", "Unlimited staff members", "Team accounts (own login)", "Analytics dashboard", "Custom branding & logo", "Discount codes", "Priority support"] } },
              ].map((plan, i) => (
                <div key={i} style={{
                  background: plan.popular ? `${ACCENT}08` : c.bgCard,
                  border: `1.5px solid ${plan.popular ? ACCENT : c.border}`,
                  borderRadius: 24, padding: "32px 28px", position: "relative"
                }}>
                  {plan.popular && (
                    <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: ACCENT, color: c.btnOnDark, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 16px", borderRadius: 100 }}>
                      {lang === "nl" ? "Populair" : "Popular"}
                    </div>
                  )}
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{plan.name}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: ACCENT }}>
                      €{plan.price}<span style={{ fontSize: 16, color: c.textMuted }}>{lang === "nl" ? "/maand" : "/month"}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {(lang === "nl" ? plan.features.nl : plan.features.en).map((f, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: c.textSub }}>
                        <NavIcon name="check" size={14} color={ACCENT} />{f}
                      </div>
                    ))}
                  </div>
                  <button className={plan.popular ? "btn-primary" : "btn-ghost"} style={{ width: "100%", ...(plan.popular ? {} : { borderColor: `${ACCENT}44`, color: ACCENT }) }}
                    onClick={() => navigate("/owner")}>
                    {lang === "nl" ? "Beginnen" : "Get started"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── FAQ ─── */}
        <div style={{ padding: "60px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 300, marginBottom: 8 }}>
                {lang === "nl" ? "Veelgestelde vragen" : "FAQ"}
              </div>
              <div style={{ width: 50, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "0 auto" }} />
            </div>
            {faqs.map(([q, a], i) => (
              <div key={i} style={{ borderBottom: "1px solid " + c.border, marginBottom: 0 }}>
                <div onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ padding: "18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{q}</div>
                  <div style={{ fontSize: 18, color: c.textMuted, transition: "transform 0.2s", transform: faqOpen === i ? "rotate(45deg)" : "none" }}>+</div>
                </div>
                {faqOpen === i && (
                  <div style={{ paddingBottom: 18, fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{a}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ─── FINAL CTA ─── */}
        <div style={{ padding: "60px 24px 80px", textAlign: "center", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: 500, margin: "0 auto", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 28, padding: "48px 32px" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(26px, 5vw, 36px)", fontWeight: 300, marginBottom: 12 }}>
              {lang === "nl" ? "Begin vandaag met je eigen boekingspagina" : "Start your own booking page today"}
            </div>
            <p style={{ fontSize: 14, color: c.textLabel, marginBottom: 28, lineHeight: 1.6 }}>
              {lang === "nl" ? "Klaar in 2 minuten. Geen commissie. Geen gedoe." : "Ready in 2 minutes. No commission. No hassle."}
            </p>
            <button className="btn-primary" style={{ width: "auto", padding: "16px 44px", fontSize: 14 }} onClick={() => navigate("/owner")}>
              {lang === "nl" ? "Gratis beginnen →" : "Start for free →"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ padding: "24px 32px", textAlign: "center", borderTop: "1px solid " + c.border, position: "relative", zIndex: 10 }}>
          <div style={{ fontSize: 11, color: c.textMuted }}>© {new Date().getFullYear()} vellu · <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>Privacy</a> · <a href="/terms" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Voorwaarden" : "Terms"}</a> · <a href="/dpa" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Verwerkingsovereenkomst" : "DPA"}</a> · <a href="/contact" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>Contact</a></div>
        </footer>
      </div>
    </Layout>
  );
}

// ─── OWNER AUTH ───────────────────────────────────────────────
function OwnerAuth({ onLogin, onBack, lang, setLang }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ email: "", password: "", businessName: "", slug: "", city: "", accountType: "joint" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleReset = async () => {
    if (!form.email) { setError(lang === "nl" ? "Vul je e-mailadres in" : "Enter your email"); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: "https://vellu.cc/owner" });
    if (error) { setError(error.message); } else { setResetSent(true); }
    setLoading(false);
  };

  const handle = async () => {
    if (!form.email || !form.password) { setError(lang === "nl" ? "Vul alle velden in" : "Fill in all fields"); return; }
    if (mode === "signup" && !form.businessName) { setError(lang === "nl" ? "Vul je bedrijfsnaam in" : "Enter your business name"); return; }
    setLoading(true);
    setError("");

    if (mode === "signup") {
      let slug = form.slug || form.businessName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "mijn-studio";
      // Check slug uniqueness
      const { data: existing } = await supabase.from("profiles").select("id").eq("slug", slug).maybeSingle();
      if (existing) {
        slug = slug + "-" + Math.random().toString(36).slice(2, 6);
      }
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            business_name: form.businessName,
            slug: slug,
            city: form.city || "Nederland"
          }
        }
      });
      if (error) { setError(error.message); setLoading(false); return; }
      // Also upsert directly in case trigger doesn't fire
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: form.email,
        business_name: form.businessName,
        slug: slug,
        city: form.city || "Nederland",
        accent_color: "#c9a96e",
        account_type: form.accountType || "joint"
      });
      onLogin({ name: form.businessName, email: form.email, slug, city: form.city || "Nederland", id: data.user.id, plan: null, plan_expires_at: null, account_type: form.accountType });
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) { setError(lang === "nl" ? "Verkeerd e-mail of wachtwoord" : "Incorrect email or password"); setLoading(false); return; }
      // Load profile
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      const slug = profile?.slug || data.user.email.split("@")[0];
      onLogin({ name: profile?.business_name || "Mijn Studio", email: form.email, slug, city: profile?.city || "Nederland", id: data.user.id, accent: profile?.accent_color, plan: profile?.plan || null, plan_expires_at: profile?.plan_expires_at || null, account_type: profile?.account_type || "joint" });
    }
    setLoading(false);
  };

  return (
    <Layout>
      <div style={{ 
        background: c.bg, 
        minHeight: "100dvh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        padding: "40px 24px", 
        fontFamily: "'Jost',sans-serif", 
        color: c.text, 
        position: "relative" 
      }}>
        {/* Background decoration */}
        <div style={{ 
          position: "absolute", 
          top: "10%", 
          left: "50%", 
          transform: "translateX(-50%)",
          width: "80%", 
          maxWidth: 600,
          height: "50%", 
          background: `radial-gradient(ellipse at center, ${ACCENT}08 0%, transparent 70%)`,
          pointerEvents: "none"
        }} />

        {/* Back button */}
        <div style={{ position: "absolute", top: 32, left: 32 }}>
          <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }} onClick={onBack}>← {lang === "nl" ? "Terug" : "Back"}</button>
        </div>
        
        {/* Lang toggle */}
        <div style={{ position: "absolute", top: 32, right: 32, display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle />
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        <div style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 10 }} className="fade-up">
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ marginBottom: 12 }}><NavIcon name="crown" size={36} color={ACCENT} /></div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>{t.ownerLogin}</div>
            <div style={{ fontSize: 13, color: c.textLabel, marginTop: 8, letterSpacing: "0.02em" }}>{t.ownerSub}</div>
          </div>

          <div style={{ 
            background: c.bgCard, 
            border: "1px solid " + c.border,
            borderRadius: 24,
            padding: 28
          }}>
            <div style={{ display: "flex", marginBottom: 24, borderBottom: "1px solid " + c.border }}>
              {[["signin", t.signIn], ["signup", t.signUp]].map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                  flex: 1, padding: "12px", border: "none", background: "transparent",
                  fontFamily: "'Jost',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: mode === m ? ACCENT : c.textMuted,
                  borderBottom: `2px solid ${mode === m ? ACCENT : "transparent"}`,
                  marginBottom: -1, transition: "all 0.2s"
                }}>{label}</button>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {mode === "signup" && <>
                <input className="input-field" placeholder={t.businessNameField} value={form.businessName} onChange={e => setForm(f => ({...f, businessName: e.target.value}))} />
                <input className="input-field" placeholder={t.city} value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 17, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: c.textLabel, fontFamily: "'Jost',sans-serif", pointerEvents: "none" }}>vellu.cc/</div>
                  <input className="input-field" placeholder={lang === "nl" ? "jouw-salon-naam" : "your-salon-name"} value={form.slug} onChange={e => setForm(f => ({...f, slug: e.target.value.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")}))} style={{ paddingLeft: 85 }} />
                </div>
                {/* Account type */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.accountType}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["joint", "user", t.jointAccount, t.jointDesc], ["team", "team", t.teamAccount, t.teamDesc]].map(([type, icon, label, desc]) => (
                      <div key={type} onClick={() => setForm(f => ({...f, accountType: type}))} style={{
                        flex: 1, padding: "14px 12px", borderRadius: 14, cursor: "pointer", textAlign: "center", transition: "all 0.2s",
                        background: form.accountType === type ? `${ACCENT}12` : c.inputBg,
                        border: `1.5px solid ${form.accountType === type ? ACCENT : c.inputBorder}`
                      }}>
                        <div style={{ marginBottom: 4 }}><NavIcon name={icon} size={20} color={form.accountType === type ? ACCENT : c.textSub} /></div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: form.accountType === type ? ACCENT : c.text }}>{label}</div>
                        <div style={{ fontSize: 9, color: c.textMuted, marginTop: 3, lineHeight: 1.3 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>}
              <input className="input-field" placeholder={t.emailField} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              <input className="input-field" placeholder={t.passwordField} type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
            </div>
            {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 16, textAlign: "center" }}>{error}</div>}
            {resetSent && <div style={{ fontSize: 12, color: "#86efac", marginBottom: 16, textAlign: "center" }}>{lang === "nl" ? "Reset link verstuurd! Check je inbox." : "Reset link sent! Check your inbox."}</div>}
            <button className="btn-primary" onClick={handle} disabled={loading}>{loading ? "..." : (mode === "signin" ? t.login : t.createAccount)}</button>
            {mode === "signin" && (
              <button style={{ display: "block", width: "100%", marginTop: 12, background: "none", border: "none", color: c.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}
                onClick={handleReset}>
                {lang === "nl" ? "Wachtwoord vergeten?" : "Forgot password?"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── REVIEW FORM ────────────────────────────────────────────
function ReviewForm({ salon, clientName, clientEmail, lang, t, accent }) {
  const { colors: c } = useTheme();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("reviews").insert({
        owner_id: salon.owner_id,
        client_name: clientName,
        client_email: clientEmail,
        rating,
        comment: comment || null
      });
      if (!error) setSubmitted(true);
    } catch (e) {
      console.error("Review submit error:", e);
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
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, textAlign: "left" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 10 }}>{t.writeReview}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[1,2,3,4,5].map(s => (
          <span key={s} onClick={() => setRating(s)} style={{ fontSize: 26, cursor: "pointer", color: s <= rating ? accent : c.textMuted, transition: "all 0.15s", transform: s <= rating ? "scale(1.1)" : "none" }}>★</span>
        ))}
      </div>
      <textarea className="input-field" placeholder={t.reviewComment} value={comment} onChange={e => setComment(e.target.value)}
        style={{ minHeight: 70, resize: "vertical", marginBottom: 10, fontSize: 12 }} />
      <button className="btn-ghost" style={{ width: "100%", color: rating > 0 ? accent : undefined, borderColor: rating > 0 ? `${accent}44` : undefined, opacity: submitting ? 0.5 : 1 }}
        onClick={submit} disabled={rating === 0 || submitting}>{submitting ? "..." : t.submitReview}</button>
    </div>
  );
}

// ─── CLIENT BOOKING ───────────────────────────────────────────
function ClientApp({ salon: initialSalon, onBack, lang, setLang, reviewMode = false, reviewEmail = "" }) {
  const { colors: c } = useTheme();
  const accent = initialSalon.accent || ACCENT;
  const t = T[lang];
  const DAY = lang === "nl" ? DAY_NL : DAY_EN;
  const MON = lang === "nl" ? MON_NL : MON_EN;
  const svcName = (s) => lang === "nl" ? (s.name_nl || s.name_en || s.name || "") : (s.name_en || s.name_nl || s.name || "");






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
  const goToStep = (s) => {
    if (s === 2) setSlotsRefreshKey(k => k + 1); // Refresh booked slots when entering date step
    setStep(s);
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
    const dayOfWeek = new Date(dateStr).getDay();
    const staffDay = staffMember.working_hours[dayOfWeek];
    if (!staffDay) return true;
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
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(reviewMode);
  const [mode, setMode] = useState("profile"); // "profile" | "booking"
  const [profileTab, setProfileTab] = useState("services");
  const [profileCategory, setProfileCategory] = useState("all");
  const [reviewSort, setReviewSort] = useState("recent");
  const [expandedHours, setExpandedHours] = useState(false);
  const [expandedPolicy, setExpandedPolicy] = useState(false);
  const [expandedTeamMember, setExpandedTeamMember] = useState(null);
  const profileSectionRefs = useRef({});
  const profileMainRef = useRef(null);
  const profileTabsBarRef = useRef(null);
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
    const scrollLeft = activeBtn.offsetLeft - bar.offsetWidth / 2 + activeBtn.offsetWidth / 2;
    bar.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }, [profileTab]);
  const days = getDays(Math.min(maxAdvanceDays + 1, 90));
  
  // Check if form is complete
  const phoneValid = !initialSalon.phone_required || form.phone.length >= 6;
  const policyValid = !initialSalon.booking_policy || policyAgreed;
  const canConfirm = form.firstName && form.lastName && form.email && phoneValid && policyValid;

  // Multi-service helpers
  const getStaffForService = (serviceId) => {
    return (initialSalon.staff || []).filter(m =>
      (m.service_ids?.length === 0 || m.service_ids?.includes(serviceId)) &&
      isStaffAvailable(m, date)
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
    // Auto-apply if exact match found
    const found = activeCodes.find(dc => dc.code === upperVal);
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
        total = total * (1 - appliedDiscount.amount / 100);
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

  // Client lookup (debounced) - check if returning client
  useEffect(() => {
    if (!form.email || form.email.length < 5 || !form.email.includes("@")) {
      setClientFound(false);
      return;
    }
    const lookupId = ++emailLookupRef.current;
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("clients").select("*").eq("email", form.email.toLowerCase()).single();
      // Ignore stale responses - only apply if this is still the latest lookup
      if (lookupId !== emailLookupRef.current) return;
      if (data) {
        setForm(f => ({ ...f, firstName: data.first_name || f.firstName, lastName: data.last_name || f.lastName, phone: data.phone || f.phone, allergies: data.allergies || f.allergies }));
        setClientNoShows(data.no_show_count || 0);
        setClientFound(true);
      } else {
        setClientFound(false);
        setClientNoShows(0);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.email]);

  // Load booked time slots for selected date (include staff_id for multi-staff filtering)
  useEffect(() => {
    if (!date || !initialSalon.owner_id) return;
    const loadSlots = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("time, service_duration, staff_id")
        .eq("owner_id", initialSalon.owner_id)
        .eq("date", date)
        .in("status", ["confirmed", "completed"]);
      if (!error) setBookedSlots(data || []);
    };
    loadSlots();
  }, [date, initialSalon.owner_id, slotsRefreshKey]);

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
      const bookedDuration = Math.max(booked.service_duration || 30, 30) + breakBuffer;
      // Check overlap: two ranges [slotStart, slotEnd+break) and [bookedStart, bookedEnd+break)
      const slotEnd = slotMinutes + myDuration + breakBuffer;
      const bookedEnd = bookedMinutes + bookedDuration;
      if (slotMinutes < bookedEnd && slotEnd > bookedMinutes) {
        return true;
      }
    }
    return false;
  };

  // Generate random cancellation token (cryptographically secure)
  const generateToken = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const values = crypto.getRandomValues(new Uint32Array(24));
    return Array.from(values, (v) => chars[v % chars.length]).join("");
  };

  // Confirm booking - handles client save, appointment insert, cancellation token
  const confirmBooking = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
    // 1. Save or update client
    const clientEmail = form.email.toLowerCase();
    let clientId = null;
    const { data: existingClient } = await supabase.from("clients").select("id").eq("email", clientEmail).single();
    
    if (existingClient) {
      clientId = existingClient.id;
      await supabase.from("clients").update({
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone || null,
        allergies: form.allergies || null,
        last_visit: new Date().toISOString()
      }).eq("id", clientId);
    } else {
      const { data: newClient } = await supabase.from("clients").insert({
        email: clientEmail,
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone || null,
        allergies: form.allergies || null,
        last_visit: new Date().toISOString()
      }).select("id").single();
      if (newClient) clientId = newClient.id;
    }

    // 2. Build combined service name with per-service staff and extras
    const combinedServiceName = selectedServices.map(item => {
      let label = svcName(item.service);
      if (item.variant) label += " — " + (lang === "nl" ? item.variant.name_nl : (item.variant.name_en || item.variant.name_nl));
      if (item.staff) label += ` (${item.staff.name})`;
      if (item.extras.length > 0) label += " + " + item.extras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ");
      return label;
    }).join(" · ") + (appliedDiscount ? ` [${appliedDiscount.code}]` : "");

    // Use first service's staff as primary (for staff_id column)
    const primaryStaff = selectedServices[0]?.staff;
    const allStaffNames = selectedServices.filter(item => item.staff).map(item => item.staff.name);

    const apptData = {
      owner_id: initialSalon.owner_id, service_id: selectedServices[0]?.service?.id || null, client_id: clientId,
      service_name: combinedServiceName,
      service_price: getPrice(), service_duration: getDuration(), date, time,
      client_name: `${form.firstName} ${form.lastName}`, client_email: clientEmail, client_phone: form.phone || null,
      payment_method: form.payment, status: "confirmed", invoice_sent: false,
      staff_id: primaryStaff?.id || null, staff_name: allStaffNames.length > 0 ? allStaffNames.join(", ") : null,
      client_allergies: form.allergies || null,
      location_id: selectedLocation?.id || null
    };
    const { data: appt } = await supabase.from("appointments").insert(apptData).select("id").single();
    
    // 3. Generate cancellation token (expires 24h before appointment)
    let cancelToken = null;
    if (appt) {
      const token = generateToken();
      const appointmentDate = new Date(date + "T" + time + ":00");
      const expiresAt = new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000);
      
      await supabase.from("cancellation_tokens").insert({
        appointment_id: appt.id,
        token: token,
        expires_at: expiresAt.toISOString()
      });
      cancelToken = token;
    }

    setDone(true);
    setSubmitting(false);
    setSlotsRefreshKey(k => k + 1);
    
    // 4. Send confirmation email with cancellation link
    await sendEmails("booking_confirmation", {
      client_name: `${form.firstName} ${form.lastName}`, client_email: clientEmail, service_name: combinedServiceName,
      date, time, payment: form.payment, price: getPrice(), salon_name: initialSalon.name, owner_email: initialSalon.owner_email || "info@vellu.cc",
      cancel_url: cancelToken ? `https://vellu.cc/cancel/${cancelToken}` : null
    });

    // 5. Notify owner + assigned staff about new booking
    const staffEmails = selectedServices.filter(item => item.staff?.email).map(item => item.staff.email);
    await sendEmails("booking_notification", {
      owner_email: initialSalon.owner_email || null,
      staff_emails: [...new Set(staffEmails)],
      client_name: `${form.firstName} ${form.lastName}`, client_phone: form.phone || null,
      service_name: combinedServiceName, date, time, price: getPrice(),
      salon_name: initialSalon.name
    });

    // 6. Create Google Calendar event (if connected)
    if (appt) {
      supabase.functions.invoke("google-calendar", {
        body: {
          action: "create",
          owner_id: initialSalon.owner_id,
          booking: {
            appointment_id: appt.id,
            service_name: combinedServiceName,
            client_name: `${form.firstName} ${form.lastName}`,
            client_email: clientEmail,
            client_phone: form.phone || null,
            staff_name: allStaffNames.length > 0 ? allStaffNames.join(", ") : null,
            date, time, duration: getDuration(), price: getPrice()
          }
        }
      }).catch(e => console.error("Google Calendar error:", e));
    }
    
    if (form.payment === "online") {
      await sendEmails("invoice", { client_name: `${form.firstName} ${form.lastName}`, client_email: clientEmail, service_name: combinedServiceName,
        date, time, price: getPrice(), salon_name: initialSalon.name,
        salon_address: initialSalon.address || "", salon_kvk: initialSalon.kvk_number || "",
        salon_btw: initialSalon.btw_id || "", salon_iban: initialSalon.iban || "" });
    }
    } catch (err) {
      console.error("Booking error:", err);
      setErrorToast(lang === "nl" ? "Er ging iets mis bij het boeken. Probeer het opnieuw." : "Something went wrong while booking. Please try again.");
      setTimeout(() => setErrorToast(""), 5000);
      setSubmitting(false);
    }
  };


  // ─── SALON PROFILE VIEW ─────────────────────────────────────
  const FULL_DAYS = lang === "nl" 
    ? ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"]
    : ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  
  const todayDayIndex = new Date().getDay();
  const todayHoursObj = activeHours[todayDayIndex] || { closed: true };
  const salonIsOpen = !todayHoursObj.closed;

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

  const allPhotos = initialSalon.services.flatMap(s => (s.photos || []).map(p => ({ ...p, serviceName: svcName(s) })));

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
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={i <= r ? "#f5c518" : c.inputBg}>
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
    <Layout>
      <style>{makeCSS(accent, c)}</style>
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
            <img src={initialSalon.cover_image_url} className="profile-hero-cover" alt={`${initialSalon.name} cover`} />
          )}
          <div className="profile-hero-gradient" />
          <div className="profile-hero-content">
            <h1 className="profile-hero-name" style={{ fontSize: isMobile ? 28 : 42 }}>{initialSalon.name}</h1>
            {initialSalon.city && (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.12em" }}>{initialSalon.city}</div>
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
              
              {categories.length > 0 && (
                <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 14 }}>
                  <button className={`profile-cat-pill ${profileCategory === "all" ? "active" : ""}`}
                    onClick={() => setProfileCategory("all")}>{t.allCategories}</button>
                  {categories.map(cat => (
                    <button key={cat.id} className={`profile-cat-pill ${profileCategory === cat.id ? "active" : ""}`}
                      onClick={() => setProfileCategory(cat.id)}>
                      {lang === "nl" ? (cat.name_nl || cat.name) : (cat.name_en || cat.name_nl || cat.name)}
                    </button>
                  ))}
                </div>
              )}

              {profileFilteredServices.map(s => (
                <div key={s.id} className="profile-service-row" onClick={() => enterBooking(s)}>
                  {s.photos?.length > 0 ? (
                    <img src={s.photos[0].url || s.photos[0]} className="profile-service-thumb" alt={svcName(s)} />
                  ) : (
                    <div className="profile-service-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><NavIcon name="scissors" size={20} color={c.textMuted} /></div>
                  )}
                  <div className="profile-service-info">
                    <div className="profile-service-name">{svcName(s)}</div>
                    <div className="profile-service-meta">
                      <span>{s.duration} {t.min}</span>
                      <span>·</span>
                      <span style={{ color: accent, cursor: "pointer" }}>Details</span>
                      <span>·</span>
                      <span style={{ fontWeight: 500, color: c.text }}>€{s.variants?.length > 0 ? `${Math.min(...s.variants.map(v => parseFloat(v.price)))}+` : s.price}</span>
                    </div>
                  </div>
                  <svg className="profile-service-chevron" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={c.textMuted} strokeWidth="1.5"><path d="M7 5l5 5-5 5" /></svg>
                </div>
              ))}
              {profileFilteredServices.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 16px", color: c.textMuted, fontSize: 13 }}>
                  {lang === "nl" ? "Geen behandelingen beschikbaar" : "No treatments available"}
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
                              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{lang === "nl" ? "Diensten" : "Services"}</div>
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
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 3}, 1fr)`, gap: 8 }}>
                  {allPhotos.map((photo, idx) => (
                    <div key={photo.id || idx} className="profile-gallery-item" onClick={() => setGallery({ photos: allPhotos, idx })}>
                      <img src={photo.url || photo} loading="lazy" alt={photo.serviceName || (lang === "nl" ? "Galerij foto" : "Gallery photo")} />
                    </div>
                  ))}
                </div>
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
                {sortedReviews.slice(0, 10).map(review => (
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
                        <a href={`https://instagram.com/${initialSalon.salon_instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" style={{ color: c.textSub, textDecoration: "none" }}>
                          {initialSalon.salon_instagram.startsWith("@") ? initialSalon.salon_instagram : "@" + initialSalon.salon_instagram}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Booking policy */}
                {initialSalon.booking_policy && (
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 10 }}>{lang === "nl" ? "Goed om te weten" : "Good to know"}</h3>
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
              {hasLocations ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  {(initialSalon.locations || []).map(loc => (
                    <div key={loc.id} style={{ padding: 16, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{loc.name}</div>
                      {loc.address && <div style={{ fontSize: 13, color: c.textSub }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}</div>}
                      {loc.phone && <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}><NavIcon name="phone" size={10} color={c.textMuted} /> {loc.phone}</div>}
                    </div>
                  ))}
                </div>
              ) : (initialSalon.address || initialSalon.city) ? (
                <div style={{ fontSize: 14, color: c.textSub, lineHeight: 1.6 }}>
                  <span style={{ marginRight: 6 }}><NavIcon name="mappin" size={12} color={c.textSub} /></span>
                  {initialSalon.address && <>{initialSalon.address}, </>}{initialSalon.city}
                </div>
              ) : null}
            </section>

            {/* Powered by */}
            <div className="profile-footer">
              {t.poweredBy} <span style={{ color: accent, fontWeight: 600 }}>Vellu</span> · {t.noCommission}
              <div style={{ marginTop: 6, fontSize: 10, opacity: 0.6 }}>
                <a href="/privacy" style={{ color: "inherit", textDecoration: "none", borderBottom: "1px solid currentColor" }}>{lang === "nl" ? "Privacy" : "Privacy"}</a>
                {" · "}
                <a href="/terms" style={{ color: "inherit", textDecoration: "none", borderBottom: "1px solid currentColor" }}>{lang === "nl" ? "Voorwaarden" : "Terms"}</a>
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

              {/* Open/Closed status */}
              <div className="profile-sidebar-status" style={{ cursor: "pointer" }} onClick={() => setExpandedHours(!expandedHours)}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: salonIsOpen ? "#4ade80" : "#f87171" }} />
                <span>{salonIsOpen ? (todayHoursObj.close ? `${t.openNow} · ${t.closesAt} ${todayHoursObj.close}` : t.openNow) : t.closedToday}</span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round"
                  style={{ transition: "transform 0.2s", transform: expandedHours ? "rotate(180deg)" : "none", marginLeft: 2 }}><path d="M5 8l5 5 5-5" /></svg>
              </div>
              {expandedHours && (
                <div style={{ marginTop: 8, padding: "8px 0" }}>
                  {[1,2,3,4,5,6,0].map(dayIdx => {
                    const dayHrs = activeHours[dayIdx] || { closed: true };
                    const isToday = dayIdx === todayDayIndex;
                    return (
                      <div key={dayIdx} className="profile-hours-row">
                        <span style={{ color: isToday ? c.text : c.textLabel, fontWeight: isToday ? 600 : 400 }}>{FULL_DAYS[dayIdx]}</span>
                        <span style={{ color: dayHrs.closed ? c.textMuted : c.textSub, fontWeight: isToday ? 600 : 400 }}>{dayHrs.closed ? t.closed : `${dayHrs.open} – ${dayHrs.close}`}</span>
                      </div>
                    );
                  })}
                </div>
              )}

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
                        <a href={`https://instagram.com/${initialSalon.salon_instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" style={{ color: c.textSub, textDecoration: "none" }}>
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

        {/* ═══ MOBILE BOOK BAR ═══ */}
        <div className="profile-mobile-bar">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{initialSalon.name}</div>
            {avgRating && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <StarRow rating={Math.round(parseFloat(avgRating))} size={11} />
                <span style={{ fontSize: 12, color: c.textLabel }}>{avgRating}</span>
              </div>
            )}
          </div>
          <button className="profile-book-btn" style={{ width: "auto", padding: "11px 28px", marginTop: 0 }} onClick={() => enterBooking()}>{t.book}</button>
        </div>

        {/* Gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)}>
            <img src={gallery.photos[gallery.idx]?.url || gallery.photos[gallery.idx]} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {gallery.photos.map((p, i) => (
                <img key={p.id || i} src={p.url || p} onClick={e => { e.stopPropagation(); setGallery(g => ({...g, idx: i})); }}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `2px solid ${i === gallery.idx ? accent : "transparent"}`, opacity: i === gallery.idx ? 1 : 0.5 }} />
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
                  {lang === "nl" ? "Hoe was je afspraak?" : "How was your appointment?"}
                </div>
              </div>
              <ReviewForm salon={initialSalon} clientName="" clientEmail={reviewEmail} lang={lang} t={t} accent={accent} />
              <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={() => setShowReviewForm(false)}>
                {lang === "nl" ? "Sluiten" : "Close"}
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
        {lang === "nl" ? "Jouw boeking" : "Your booking"}
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
    <Layout>
      <style>{makeCSS(accent, c)}</style>
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
                  backgroundPosition: "center",
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
            <div style={{ flex: 1, padding: "50px 60px", maxWidth: 700 }}>
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
                {categories.length > 0 && (
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
                    {categories.map(cat => (
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
                )}

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
                  return (
                  <div key={s.id}>
                    <div className={`service-card ${isSel ? "sel" : ""}`} onClick={() => toggleServiceSelection(s)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {/* Checkbox */}
                          <div style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${isSel ? accent : c.textMuted}`, background: isSel ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}>
                            {isSel && <NavIcon name="check" size={13} color={c.btnOnDark} />}
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
                        <div className="photo-grid" style={{ marginLeft: 34 }}>
                          {s.photos.map((p, i) => (
                            <img key={p.id || i} src={p.url || p} className="photo-thumb" onClick={e => { e.stopPropagation(); setGallery({ photos: s.photos, idx: i }); }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Variants — per selected service */}
                    {isSel && s.variants?.length > 0 && (
                      <div style={{ marginLeft: 34, marginBottom: 10 }}>
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
                      <div style={{ marginLeft: 34, marginBottom: 10 }}>
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
                      <div style={{ marginLeft: 34, marginBottom: 10 }}>
                        <SL>{t.selectStaff}</SL>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <div className={`service-card ${!item?.staff ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => updateServiceItem(s.id, { staff: null })}>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{t.anyStaff}</div>
                          </div>
                          {staffForService.map(m => (
                            <div key={m.id} className={`service-card ${item?.staff?.id === m.id ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => updateServiceItem(s.id, { staff: m })}>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</div>
                              {m.role && <div style={{ fontSize: 9, color: c.textLabel }}>{m.role}</div>}
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
                
                {/* Reviews */}
                {initialSalon.reviews?.length > 0 && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid " + c.border }}>
                    <SL>{t.reviews} ({initialSalon.reviews.length}) · {(initialSalon.reviews.reduce((s,r) => s + r.rating, 0) / initialSalon.reviews.length).toFixed(1)} ★</SL>
                    {initialSalon.reviews.slice(0, 3).map(r => (
                      <div key={r.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid " + c.border }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontWeight: 500, fontSize: 12 }}>{r.client_name?.split(" ")[0] || (lang === "nl" ? "Klant" : "Client")}</span>
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
                <PTitle sub={t.selectDateSub}>{t.selectDate}</PTitle>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                  {days.map((d, i) => {
                    const ds = fmt(d); 
                    const isSel = date === ds;
                    const dayHours = getEffectiveHours(ds);
                    const staffWindow = getStaffTimeWindow(ds);
                    const isClosed = dayHours.closed || staffWindow?.closed || !isDayInBookingWindow(ds);
                    return (
                      <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} onClick={() => { if (!isClosed) { setDate(ds); setTime(null); } }} style={isClosed ? { opacity: 0.35, cursor: "not-allowed" } : {}}>
                        <span style={{ fontSize: 10, color: isSel ? c.btnOnDark : c.textLabel }}>{DAY[d.getDay()]}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? c.btnOnDark : c.text, marginTop: 2 }}>{d.getDate()}</span>
                        <span style={{ fontSize: 9, color: isSel ? c.btnOnDark : c.textMuted }}>{isClosed ? (lang === "nl" ? "gesloten" : "closed") : MON[d.getMonth()]}</span>
                      </div>
                    );
                  })}
                </div>
                <SL>{t.selectTime}</SL>
                {(() => {
                  const dayHours = getEffectiveHours(date);
                  const staffWindow = getStaffTimeWindow(date);
                  const effectiveOpen = staffWindow?.open && staffWindow.open > dayHours.open ? staffWindow.open : dayHours.open;
                  const effectiveClose = staffWindow?.close && staffWindow.close < dayHours.close ? staffWindow.close : dayHours.close;
                  const availableTimes = TIMES.filter(tt => {
                    if (dayHours.closed || staffWindow?.closed) return false;
                    if (tt < effectiveOpen || tt >= effectiveClose) return false;
                    // Filter out times blocked by time-slot overrides
                    if (isTimeBlockedByOverride(date, tt)) return false;
                    // Filter out past times if selected date is today
                    if (date === fmt(getToday())) {
                      const now = getToday();
                      const [h, m] = tt.split(":").map(Number);
                      if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) return false;
                    }
                    // Filter out times within min_advance_hours
                    if (minAdvanceHours > 0 && date === fmt(getToday())) {
                      const now = getToday();
                      const slotDate = new Date(date + "T" + tt + ":00");
                      if (slotDate.getTime() - now.getTime() < minAdvanceHours * 60 * 60 * 1000) return false;
                    }
                    return true;
                  });
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
                      {lang === "nl" ? "Geen beschikbare tijden op deze dag" : "No available times on this day"}
                    </div>
                  );
                })()}
                <button className="btn-primary" disabled={!time} onClick={() => setStep(3)}>{t.next}</button>
              </>}

              {/* Step 3 — Details */}
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
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input className="input-field" placeholder={t.firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                    <input className="input-field" placeholder={t.lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                  </div>
                  <input className="input-field" placeholder={`${t.phone}${initialSalon.phone_required ? ` (${t.required})` : ` (${t.optional})`}`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={initialSalon.phone_required && !form.phone ? { borderColor: "rgba(248,113,113,0.3)" } : {}} />
                  <input className="input-field" placeholder={`${t.allergies} (${t.allergiesOptional})`} value={form.allergies} onChange={e => setForm(f => ({...f, allergies: e.target.value}))} />
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
                    <div key={v} className={`pay-opt ${form.payment === v ? "sel" : ""}`} onClick={() => setForm(f => ({...f, payment: v}))}>
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

                <button className="btn-primary" disabled={!canConfirm} onClick={() => setStep(4)}>{t.next}</button>
              </>}

              {/* Step 4 — Confirm */}
              {step === 4 && <>
                <PTitle sub={t.confirmSub}>{t.confirmBooking}</PTitle>
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
                <button className="btn-primary" onClick={confirmBooking} disabled={submitting}>{submitting ? "..." : t.confirm}</button>
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

          </div>
        </div>
      ) : (
          <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
            {/* Mobile Cover Image */}
            {initialSalon.cover_image_url && (
              <div style={{ 
                width: "100%", 
                height: 140, 
                backgroundImage: `url(${initialSalon.cover_image_url})`, 
                backgroundSize: "cover", 
                backgroundPosition: "center",
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

            {/* Mobile Content */}
            <div style={{ flex: 1, overflow: "auto", padding: "14px 22px 120px" }}>
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
                    {categories.length > 0 && (
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
                        {categories.map(cat => (
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
                    )}

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
                        <div className={`service-card ${isSel ? "sel" : ""}`} onClick={() => toggleServiceSelection(s)}>
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
                                <img key={p.id || i} src={p.url || p} className="photo-thumb" onClick={e => { e.stopPropagation(); setGallery({ photos: s.photos, idx: i }); }} />
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
                                  {m.role && <div style={{ fontSize: 9, color: c.textLabel }}>{m.role}</div>}
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
                    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                      {days.map((d, i) => {
                        const ds = fmt(d); 
                        const isSel = date === ds;
                        const dayHours = getEffectiveHours(ds);
                        const staffWindow = getStaffTimeWindow(ds);
                        const isClosed = dayHours.closed || staffWindow?.closed || !isDayInBookingWindow(ds);
                        return (
                          <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} onClick={() => { if (!isClosed) { setDate(ds); setTime(null); } }} style={isClosed ? { opacity: 0.35, cursor: "not-allowed" } : {}}>
                            <span style={{ fontSize: 10, color: isSel ? c.btnOnDark : c.textLabel }}>{DAY[d.getDay()]}</span>
                            <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? c.btnOnDark : c.text, marginTop: 2 }}>{d.getDate()}</span>
                            <span style={{ fontSize: 9, color: isSel ? c.btnOnDark : c.textMuted }}>{isClosed ? (lang === "nl" ? "gesloten" : "closed") : MON[d.getMonth()]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <SL>{t.selectTime}</SL>
                    {(() => {
                      const dayHours = getEffectiveHours(date);
                      const staffWindow = getStaffTimeWindow(date);
                      const effectiveOpen = staffWindow?.open && staffWindow.open > dayHours.open ? staffWindow.open : dayHours.open;
                      const effectiveClose = staffWindow?.close && staffWindow.close < dayHours.close ? staffWindow.close : dayHours.close;
                      const availableTimes = TIMES.filter(tt => {
                        if (dayHours.closed || staffWindow?.closed) return false;
                        if (tt < effectiveOpen || tt >= effectiveClose) return false;
                        // Filter out times blocked by time-slot overrides
                        if (isTimeBlockedByOverride(date, tt)) return false;
                        if (date === fmt(getToday())) {
                          const now = getToday();
                          const [h, m] = tt.split(":").map(Number);
                          if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) return false;
                        }
                        if (minAdvanceHours > 0 && date === fmt(getToday())) {
                          const now = getToday();
                          const slotDate = new Date(date + "T" + tt + ":00");
                          if (slotDate.getTime() - now.getTime() < minAdvanceHours * 60 * 60 * 1000) return false;
                        }
                        return true;
                      });
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
                          {lang === "nl" ? "Geen beschikbare tijden op deze dag" : "No available times on this day"}
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
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <input className="input-field" placeholder={t.firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                        <input className="input-field" placeholder={t.lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                      </div>
                      <input className="input-field" placeholder={`${t.phone}${initialSalon.phone_required ? ` (${t.required})` : ` (${t.optional})`}`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={initialSalon.phone_required && !form.phone ? { borderColor: "rgba(248,113,113,0.3)" } : {}} />
                      <input className="input-field" placeholder={`${t.allergies} (${t.allergiesOptional})`} value={form.allergies} onChange={e => setForm(f => ({...f, allergies: e.target.value}))} />
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
                        <div key={v} className={`pay-opt ${form.payment === v ? "sel" : ""}`} onClick={() => setForm(f => ({...f, payment: v}))}>
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
                            <span style={{ fontWeight: 500, fontSize: 12 }}>{r.client_name?.split(" ")[0] || (lang === "nl" ? "Klant" : "Client")}</span>
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
                  <button className="btn-primary" style={{ width: "auto", padding: "12px 24px", fontSize: 11, flexShrink: 0 }} 
                    disabled={!canConfirm} onClick={() => setStep(4)}>{t.next}</button>
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
                  {lang === "nl" ? "Hoe was je afspraak?" : "How was your appointment?"}
                </div>
                <div style={{ fontSize: 12, color: c.textSub, marginTop: 4 }}>{initialSalon.name}</div>
              </div>
              <ReviewForm salon={initialSalon} clientName="" clientEmail={reviewEmail} lang={lang} t={t} accent={accent} />
              <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={() => setShowReviewForm(false)}>
                {lang === "nl" ? "Sluiten" : "Close"}
              </button>
            </div>
          </div>
        )}

        {/* Gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)}>
            <img src={gallery.photos[gallery.idx]?.url || gallery.photos[gallery.idx]} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {gallery.photos.map((p, i) => (
                <img key={p.id || i} src={p.url || p} onClick={e => { e.stopPropagation(); setGallery(g => ({...g, idx: i})); }}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `2px solid ${i === gallery.idx ? accent : "transparent"}`, opacity: i === gallery.idx ? 1 : 0.5, transition: "all 0.2s" }} />
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
function VariantAdder({ serviceId, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name_nl: "", name_en: "", description_nl: "", description_en: "", price: "", duration: "60" });

  const add = async () => {
    if (!form.name_nl || !form.price) return;
    const { data, error } = await supabase.from("service_variants").insert({
      service_id: serviceId, name_nl: form.name_nl, name_en: form.name_en || null,
      description_nl: form.description_nl || null, description_en: form.description_en || null,
      price: parseFloat(form.price), duration: parseInt(form.duration)
    }).select().single();
    if (!error && data) {
      onAdd(data);
      setForm({ name_nl: "", name_en: "", description_nl: "", description_en: "", price: "", duration: "60" });
      setOpen(false);
    }
  };

  if (!open) return (
    <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 10px", borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
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
      {(!form.name_nl || !form.price) && <div style={{ fontSize: 9, color: c.textMuted, marginBottom: 4 }}>* {lang === "nl" ? "Vul naam en prijs in" : "Fill in name and price"}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "Toevoegen" : "Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}><NavIcon name="xmark" size={12} /></button>
      </div>
    </div>
  );
}

function ExtraAdder({ serviceId, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name_nl: "", name_en: "", price: "" });

  const add = async () => {
    if (!form.name_nl || !form.price) return;
    const { data, error } = await supabase.from("service_extras").insert({
      service_id: serviceId, name_nl: form.name_nl, name_en: form.name_en || null,
      price: parseFloat(form.price)
    }).select().single();
    if (!error && data) {
      onAdd(data);
      setForm({ name_nl: "", name_en: "", price: "" });
      setOpen(false);
    }
  };

  if (!open) return (
    <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 10px", borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "Toevoegen" : "Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}><NavIcon name="xmark" size={12} /></button>
      </div>
    </div>
  );
}

// ─── STAFF ADDER ────────────────────────────────────────────
function StaffAdder({ ownerId, services, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "" });
  const [selServices, setSelServices] = useState([]);

  const add = async () => {
    if (!form.name) return;
    const { data, error } = await supabase.from("staff_members").insert({
      owner_id: ownerId, name: form.name, role: form.role || null
    }).select().single();
    if (!error && data) {
      // Link selected services
      if (selServices.length > 0) {
        await supabase.from("staff_services").insert(
          selServices.map(sid => ({ staff_id: data.id, service_id: sid }))
        );
      }
      onAdd({ ...data, service_ids: selServices });
      setForm({ name: "", role: "" });
      setSelServices([]);
      setOpen(false);
    }
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
      </div>
      {services.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.services}</div>
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "Toevoegen" : "Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}><NavIcon name="xmark" size={12} /></button>
      </div>
    </div>
  );
}

// ─── LOCATION ADDER ────────────────────────────────────────
function LocationAdder({ ownerId, lang, t, accent, onAdd }) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", city: "", phone: "" });

  const add = async () => {
    if (!form.name) return;
    const { data, error } = await supabase.from("locations").insert({
      owner_id: ownerId, name: form.name, address: form.address || null,
      city: form.city || null, phone: form.phone || null,
      business_hours: DEFAULT_HOURS, break_minutes: 0
    }).select().single();
    if (!error && data) {
      onAdd(data);
      setForm({ name: "", address: "", city: "", phone: "" });
      setOpen(false);
    }
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "Toevoegen" : "Add"}</button>
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
      <div style={{ 
        background: c.bg, minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "40px 24px",
        fontFamily: "'Jost',sans-serif", color: c.text, position: "relative"
      }}>
        <style>{makeCSS(accent, c)}</style>
        <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: "80%", maxWidth: 600, height: "50%", background: `radial-gradient(ellipse at center, ${accent}08 0%, transparent 70%)`, pointerEvents: "none" }} />
        
        {/* Header */}
        <div style={{ position: "absolute", top: 24, left: 24, right: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.18em" }}>vellu</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <ThemeToggle />
            <LangToggle lang={lang} setLang={setLang} />
            <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={onLogout}>{t.logout}</button>
          </div>
        </div>

        <div style={{ maxWidth: 720, width: "100%", position: "relative", zIndex: 10 }} className="fade-up">
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
                  <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: accent, color: c.btnOnDark, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 14px", borderRadius: 100 }}>
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
                    alert(lang === "nl" 
                      ? `iDEAL betaling voor ${plan.name} (€${plan.price}/maand) komt binnenkort. Neem contact op via info@vellu.cc om je account te activeren.`
                      : `iDEAL payment for ${plan.name} (€${plan.price}/month) coming soon. Contact info@vellu.cc to activate your account.`
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
    await supabase.from("profiles").update({ business_name: salonName.trim(), city: city.trim() || null }).eq("id", salonData.owner_id);
    update(d => { d.name = salonName.trim(); d.city = city.trim(); return d; });
    setSaving(false);
    setStep(1);
  };

  const saveStep2 = async () => {
    if (!svcName.trim() || !svcPrice) return;
    setSaving(true);
    const { data: newSvc } = await supabase.from("services").insert({
      owner_id: salonData.owner_id,
      name_nl: svcName.trim(),
      name_en: svcName.trim(),
      price: parseFloat(svcPrice),
      duration: parseInt(svcDuration) || 60,
      position: 0
    }).select().single();
    if (newSvc) {
      update(d => { d.services = [...d.services, { ...newSvc, photos: [], variants: [], extras: [] }]; return d; });
    }
    setSaving(false);
    setStep(2);
  };

  const saveStep3 = async () => {
    setSaving(true);
    await supabase.from("profiles").update({ business_hours: salonData.business_hours || DEFAULT_HOURS }).eq("id", salonData.owner_id);
    setSaving(false);
    setStep(3);
  };

  return (
    <Layout>
      <style>{makeCSS(accent, c)}</style>
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
              <div style={{ fontSize: 28, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingWelcome}</div>
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
              <div style={{ fontSize: 22, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingStep2}</div>
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
              <div style={{ fontSize: 22, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingStep3}</div>
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
      google_calendar_connected: false
    };
  });
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const { confirmState, confirm: showConfirm, handleYes: confirmYes, handleNo: confirmNo } = useConfirm();
  const [newSvc, setNewSvc] = useState({ name_nl: "", name_en: "", price: "", duration: "60" });
  const [svcError, setSvcError] = useState("");
  const [gallery, setGallery] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [newDiscount, setNewDiscount] = useState({ code: "", amount: "", type: "percent", active: true });
  // Edit states
  const [editingService, setEditingService] = useState(null);
  const [editSvcForm, setEditSvcForm] = useState({ name_nl: "", name_en: "", price: "", duration: "" });
  const [editingStaff, setEditingStaff] = useState(null);
  const [editStaffForm, setEditStaffForm] = useState({ name: "", role: "", bio: "", working_hours: {}, service_ids: [] });
  // Manual appointment
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("all"); // "all" | "sent" | "unsent"
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
          { data: locData }
        ] = await Promise.all([
          supabase.from("appointments").select("*").eq("owner_id", data.id).gte("date", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]).order("date", { ascending: false }),
          supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false }),
          supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).order("position"),
          supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position"),
          supabase.from("locations").select("*").eq("owner_id", data.id).order("position")
        ]);
        setSalonData(prev => ({
          ...prev,
          owner_id: data.id,
          name: data.business_name || prev.name,
          city: data.city || prev.city,
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
          discount_codes: data.discount_codes || [],
          day_overrides: data.day_overrides || {},
          account_type: data.account_type || "joint",
          min_advance_hours: data.min_advance_hours || 0,
          max_advance_days: data.max_advance_days || 60,
          reminder_hours: data.reminder_hours ?? 24,
          rebook_nudge_days: data.rebook_nudge_days ?? 28,
          google_calendar_connected: data.google_calendar_connected || false,
          plan: data.plan || null,
          plan_expires_at: data.plan_expires_at || null,
          services: (data.services || []).map(s => ({
            ...s,
            name_nl: s.name_nl || s.name || "",
            name_en: s.name_en || s.name || "",
            photos: (s.service_photos || []).map(p => ({ id: p.id, url: p.storage_path })),
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
          update(d => { d.appointments = d.appointments.map(a => a.id === payload.new.id ? payload.new : a); return d; });
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
  const days = getDays();

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
        // Also try to get full client records for these emails for most up-to-date info
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
  const markComplete = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
      update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, status:"completed"} : a); return d; });
      toast.show(lang === "nl" ? "Afspraak voltooid" : "Appointment completed");
    } finally { setProcessingApptId(null); }
  };
  const markNoShow = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      await supabase.from("appointments").update({ status: "no_show" }).eq("id", id);
      // Increment client no-show count
      const appt = salonData.appointments.find(a => a.id === id);
      if (appt?.client_id) {
        const { data: client } = await supabase.from("clients").select("no_show_count").eq("id", appt.client_id).single();
        if (client) {
          await supabase.from("clients").update({ no_show_count: (client.no_show_count || 0) + 1 }).eq("id", appt.client_id);
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
      toast.show(lang === "nl" ? "Factuur verstuurd" : "Invoice sent");
    } finally { setProcessingApptId(null); }
  };

  const addService = async () => {
    if (!newSvc.name_nl || !newSvc.price) { setSvcError(t.fillRequired); return; }
    setSvcError("");
    const { data, error } = await supabase.from("services").insert({
      owner_id: salonData.owner_id,
      name: newSvc.name_nl,
      name_nl: newSvc.name_nl,
      name_en: newSvc.name_en || null,
      price: parseFloat(newSvc.price),
      duration: parseInt(newSvc.duration)
    }).select().single();
    if (!error && data) {
      update(d => { d.services = [...d.services, { ...data, name_nl: data.name_nl || data.name, name_en: data.name_en || data.name, photos: [], variants: [], extras: [] }]; return d; });
    }
    setNewSvc({ name_nl: "", name_en: "", price: "", duration: "60" });
  };

  const deleteService = async (id) => {
    await supabase.from("services").delete().eq("id", id);
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
      setPhotoUploading(null);
      return;
    }
    
    // Update local state
    update(d => { 
      d.services = d.services.map(s => s.id === serviceId ? {...s, photos: [...(s.photos || []), { id: photoData.id, url: publicUrl }]} : s); 
      return d; 
    });
    setPhotoUploading(null);
  };

  const deletePhoto = async (serviceId, photoId, photoUrl) => {
    // Delete from database
    await supabase.from("service_photos").delete().eq("id", photoId);
    
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
  };

  const exportCalendar = (apptList) => {
    const events = apptList.map(a => {
      const start = new Date(a.date + "T" + a.time + ":00");
      const end = new Date(start.getTime() + (a.service_duration || 60) * 60000);
      const pad = (n) => String(n).padStart(2, "0");
      const fmt2 = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      return [
        "BEGIN:VEVENT",
        `DTSTART:${fmt2(start)}`,
        `DTEND:${fmt2(end)}`,
        `SUMMARY:${a.client_name} — ${a.service_name}`,
        `DESCRIPTION:${a.client_name}\\n${a.client_email}${a.client_phone ? "\\n" + a.client_phone : ""}\\n€${a.service_price}\\nStatus: ${a.status}`,
        `LOCATION:${salonData.name}, ${salonData.city}`,
        `STATUS:${a.status === "confirmed" ? "CONFIRMED" : "COMPLETED"}`,
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

  const ApptCard = ({ a }) => (
    <div className="appt-card" title={a.service_name}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{a.client_name}</div>
          <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "calc(100% - 20px)" }}>{a.time} · {a.service_name}</div>
          <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{a.client_email}{a.staff_name ? ` · ${a.staff_name}` : ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span className={`badge badge-${a.status}`}>{a.status === "confirmed" ? (lang === "nl" ? "Bevestigd" : "Confirmed") : a.status === "cancelled" ? (lang === "nl" ? "Geannuleerd" : "Cancelled") : a.status === "no_show" ? "No-show" : (lang === "nl" ? "Voltooid" : "Completed")}</span>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{parseFloat(a.service_price || 0).toFixed(2)}</span>
        </div>
      </div>
      {a.client_allergies && (
        <div style={{ fontSize: 10, color: "#f59e0b", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
          ⚠️ {t.clientAllergies}: {a.client_allergies}
        </div>
      )}
      {a.status === "confirmed" && (
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-ghost" style={{ flex: 1, fontSize:10, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markComplete(a.id)}>{processingApptId === a.id ? "..." : t.markComplete}</button>
          <button className="btn-ghost" style={{ fontSize:10, padding: "0 14px", color: "#f87171", borderColor: "rgba(248,113,113,0.2)", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markNoShow(a.id)}>{processingApptId === a.id ? "..." : t.markNoShow}</button>
        </div>
      )}
      {a.status === "completed" && !a.invoice_sent && <button className="btn-primary" style={{ fontSize:11, marginTop:4, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => sendInvoice(a.id)}>{processingApptId === a.id ? "..." : t.sendInvoice}</button>}
      {a.status === "completed" && a.invoice_sent && <div style={{ fontSize:11, color:"#86efac", marginTop:6 }}>{t.invoiceSent}</div>}
      {a.status === "no_show" && <div style={{ fontSize:11, color:"#f87171", marginTop:6 }}><NavIcon name="xmark" size={11} color="#f87171" /> {t.noShow}</div>}
      {/* Quick actions: Google Calendar + WhatsApp */}
      {a.status === "confirmed" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn-ghost" style={{ flex: 1, fontSize: 9, padding: "6px 8px", color: c.textLabel }} onClick={() => {
            const dur = parseInt(a.service_duration || a.duration || 60);
            window.open(getGoogleCalUrl({
              title: `${a.client_name} — ${a.service_name}`,
              date: a.date, time: a.time, duration: dur,
              description: `${t.treatment}: ${a.service_name}\n${t.name}: ${a.client_name}\n€${a.service_price}`,
              location: salonData.name + (salonData.city ? ", " + salonData.city : "")
            }), "_blank");
          }}>{t.addToGoogleCal}</button>
          {salonData.whatsapp_number && a.client_phone && (
            <button className="btn-ghost" style={{ fontSize: 9, padding: "6px 10px", color: "#25d366", borderColor: "rgba(37,211,102,0.2)" }} onClick={() => {
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
          <style>{makeCSS(accent, c)}</style>
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
      <div style={{
        background: c.bg,
        height: "100dvh",
        overflow: "hidden",
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
            position: "sticky",
            top: 0,
            height: "100dvh",
            flexShrink: 0
          }}>
            {/* Sidebar Header */}
            <div style={{ padding: "28px 24px", borderBottom: "1px solid " + c.border }}>
              <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 24, fontWeight: 300, letterSpacing: "0.18em", marginBottom: 4 }}>vellu</div>
              <div style={{ fontSize: 10, color: c.textLabel, letterSpacing: "0.08em" }}>{lang === "nl" ? "EIGENAAR DASHBOARD" : "OWNER DASHBOARD"}</div>
            </div>

            {/* Salon Info */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid " + c.border }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4 }}>{salonData.name}</div>
              <div style={{ fontSize: 11, color: c.textLabel }}>{salonData.city}</div>
              <div style={{ 
                marginTop: 12, 
                fontSize: 11, 
                color: accent, 
                background: `${accent}12`,
                border: `1px solid ${accent}22`,
                borderRadius: 8,
                padding: "8px 12px"
              }}>
                vellu.cc/{salonData.id}
              </div>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, padding: "16px 12px" }}>
              {navItems.map(([k, icon, label]) => (
                <div 
                  key={k}
                  onClick={() => setView(k)}
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 14,
                    padding: "14px 16px",
                    borderRadius: 12,
                    cursor: "pointer",
                    marginBottom: 4,
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
            <div style={{ padding: "16px 20px", borderTop: "1px solid " + c.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <ThemeToggle />
                <LangToggle lang={lang} setLang={setLang} />
              </div>
              <button 
                className="btn-ghost" 
                style={{ width: "100%", marginTop: 12, fontSize: 11, color: c.textLabel, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} 
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
          height: "100dvh",
          minWidth: 0,
          overflow: "hidden"
        }}>
          {/* Mobile Header */}
          {isMobile && (
            <div style={{ 
              padding: "20px 22px 0", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "flex-start",
              background: c.bg
            }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 400, letterSpacing: "0.06em" }}>{salonData.name}</div>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${accent}18`, color: accent, border: `1px solid ${accent}33`, letterSpacing: "0.1em", textTransform: "uppercase" }}>{lang === "nl" ? "eigenaar" : "owner"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
                  {navItems.find(([k]) => k === view)?.[2] || t.dashboard}
                </h1>
                <div style={{ fontSize: 12, color: c.textLabel }}>
                  {view === "dashboard" ? t.welcomeBack : view === "agenda" ? t.manageAppts : view === "analytics" ? (lang === "nl" ? "Inzicht in je salon" : "Insight into your salon") : view === "facturen" ? t.completedTreatments : view === "instellingen" ? t.manageSalon : t.welcomeBack}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button 
                  className="btn-ghost" 
                  style={{ fontSize: 11, borderColor: `${accent}33`, color: accent, display: "flex", alignItems: "center", gap: 6 }} 
                  onClick={() => setShowPreview(true)}
                >
                  <NavIcon name="eye" size={14} color={accent} /> {lang === "nl" ? "Preview" : "Preview"}
                </button>
                <button 
                  className="btn-ghost" 
                  style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }} 
                  onClick={copyLink}
                >
                  <NavIcon name="link" size={14} color={copied ? "#86efac" : c.textSub} /> {copied ? "✓ " + t.copied : t.copyLink}
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Content (settings has its own scroll -- see below) */}
          {view !== "instellingen" ? (
          <div style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            WebkitOverflowScrolling: "touch",
            padding: isMobile ? "14px 22px 80px" : "32px 40px",
            backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}08 0%, transparent 55%)`
          }}>

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.welcomeBack}>{t.dashboard}</PTitle>}
              
              {/* 4 Stat Cards */}
              {(() => {
                const now = new Date();
                const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
                const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);
                const prevWeekStart = new Date(now); prevWeekStart.setDate(now.getDate() - 14);
                const weekRevenue = appts.filter(a => a.status === "completed" && new Date(a.date) >= weekAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const prevWeekRevenue = appts.filter(a => a.status === "completed" && new Date(a.date) >= prevWeekStart && new Date(a.date) < weekAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const monthRevenue = appts.filter(a => a.status === "completed" && new Date(a.date) >= monthAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                const weekChange = prevWeekRevenue > 0 ? Math.round(((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100) : 0;
                const avgRating = salonData.reviews?.length > 0 ? (salonData.reviews.reduce((s, r) => s + r.rating, 0) / salonData.reviews.length).toFixed(1) : "—";
                return (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 22 }}>
                    <div className="stat-card">
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.today}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300, color: accent }}>{todayAppts.length}</div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{t.appts}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.weeklyRevenue}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300, color: accent }}>€{weekRevenue.toFixed(0)}</div>
                      {weekChange !== 0 && <div style={{ fontSize: 10, color: weekChange > 0 ? "#86efac" : "#f87171", marginTop: 4 }}>{weekChange > 0 ? "+" : ""}{weekChange}% {lang === "nl" ? "vs vorige week" : "vs last week"}</div>}
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.monthlyRevenue}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300, color: accent }}>€{monthRevenue.toFixed(0)}</div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{t.total.toLowerCase()}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.avgRating}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300, color: c.text }}>{avgRating} ★</div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{salonData.reviews?.length || 0} {t.reviews?.toLowerCase?.() || "reviews"}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Quick Actions */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 22 }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: "12px 14px", borderStyle: "dashed", borderColor: `${accent}33`, color: accent, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}
                  onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ service_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "", staff_id: "" }); setClientSearch(""); setClientMode("existing"); setShowClientDropdown(false); }}>
                  <NavIcon name="plus" size={14} color={accent} /> {t.addAppointment}
                </button>
                <button className="btn-ghost" style={{ fontSize: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => setShowPreview(true)}>
                  <NavIcon name="eye" size={14} color={c.textSub} /> {lang === "nl" ? "Bekijk pagina" : "Preview page"}
                </button>
                {appts.length > 0 && (
                  <button className="btn-ghost" style={{ fontSize: 11, padding: "12px 14px", borderColor: `${accent}22`, color: accent, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => {
                    const upcoming = appts.filter(a => a.status === "confirmed");
                    if (upcoming.length === 0) return;
                    exportCalendar(upcoming);
                  }}>
                    <NavIcon name="download" size={14} color={accent} /> {lang === "nl" ? "Exporteer agenda" : "Export calendar"}
                  </button>
                )}
                <button className="btn-ghost" style={{ fontSize: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center", color: copied ? "#86efac" : undefined, borderColor: copied ? "rgba(134,239,172,0.3)" : undefined }} onClick={copyLink}>
                  <NavIcon name="link" size={14} color={copied ? "#86efac" : c.textSub} /> {copied ? t.copied : t.copyLink}
                </button>
              </div>

              {/* Revenue Chart + Popular Services */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: 14, marginBottom: 22 }}>
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <SL style={{ marginBottom: 0 }}>{t.revenueOverTime}</SL>
                    <span style={{ fontSize: 10, color: accent, cursor: "pointer" }} onClick={() => setView("analytics")}>{lang === "nl" ? "Bekijk meer →" : "View more →"}</span>
                  </div>
                  {(() => {
                    const weeks = [];
                    const now = new Date();
                    for (let w = 7; w >= 0; w--) {
                      const weekStart = new Date(now);
                      weekStart.setDate(now.getDate() - (w * 7 + now.getDay()));
                      weekStart.setHours(0,0,0,0);
                      const weekEnd = new Date(weekStart);
                      weekEnd.setDate(weekStart.getDate() + 7);
                      const rev = appts
                        .filter(a => a.status === "completed" && new Date(a.date) >= weekStart && new Date(a.date) < weekEnd)
                        .reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
                      weeks.push({ label, revenue: rev });
                    }
                    const maxRev = Math.max(...weeks.map(w => w.revenue), 1);
                    const chartH = 100;
                    const barW = 100 / weeks.length;
                    return (
                      <div>
                        <div style={{ position: "relative", height: chartH + 30 }}>
                          <svg width="100%" height={chartH} viewBox={`0 0 100 ${chartH}`} preserveAspectRatio="none" style={{ display: "block" }}>
                            {weeks.map((w, i) => {
                              const barH = Math.max((w.revenue / maxRev) * (chartH - 10), 2);
                              const x = i * barW + barW * 0.15;
                              const bw = barW * 0.7;
                              return <rect key={i} x={x} y={chartH - barH} width={bw} height={barH} rx="2" fill={i === weeks.length - 1 ? accent : `${accent}66`} />;
                            })}
                          </svg>
                          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 6 }}>
                            {weeks.map((w, i) => <div key={i} style={{ fontSize: 9, color: c.textMuted, textAlign: "center", flex: 1 }}>{w.label}</div>)}
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
                          {weeks.map((w, i) => <div key={i} style={{ fontSize: 9, color: i === weeks.length - 1 ? accent : c.textLabel, textAlign: "center", flex: 1, fontWeight: i === weeks.length - 1 ? 600 : 400 }}>{w.revenue > 0 ? `€${w.revenue.toFixed(0)}` : "—"}</div>)}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16 }}>
                  <SL>{t.popularServices}</SL>
                  {(() => {
                    const svcCount = {};
                    appts.forEach(a => { const n = a.service_name?.split(" — ")[0] || "?"; svcCount[n] = (svcCount[n] || 0) + 1; });
                    const sorted = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
                    if (sorted.length === 0) return <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noAppts}</div>;
                    const max = sorted[0][1];
                    return sorted.map(([name, count]) => (
                      <div key={name} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{name}</span>
                          <span style={{ fontSize: 11, color: c.textLabel }}>{count} {t.bookings}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 4, background: c.bgCardHover }}>
                          <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(count / max) * 100}%`, transition: "width 0.4s" }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <SL>{t.todayAppts}</SL>
              {todayAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "30px 0", color: c.textMuted, fontSize: 12 }}>{t.noTodayAppts}</div>
                : todayAppts.map(a => <ApptCard key={a.id} a={a} />)
              }
            </div>
          )}

          {/* AGENDA */}
          {view === "agenda" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.manageAppts}>{t.agenda}</PTitle>}
              
              {/* View mode toggle + navigation */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {["week", "month", "year"].map(mode => (
                    <div key={mode} onClick={() => { setCalViewMode(mode); setCalWeekOffset(0); }} style={{
                      padding: "6px 14px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      letterSpacing: "0.04em", transition: "all 0.2s",
                      background: calViewMode === mode ? `${accent}18` : "transparent",
                      color: calViewMode === mode ? accent : c.textSub,
                      border: `1px solid ${calViewMode === mode ? `${accent}44` : c.inputBorder}`
                    }}>{mode === "week" ? t.weekView : mode === "month" ? t.monthView : t.yearView}</div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {calWeekOffset !== 0 && (
                    <div onClick={() => { setCalWeekOffset(0); setCalDate(fmt(getToday())); }} style={{
                      padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      background: `${accent}12`, color: accent, border: `1px solid ${accent}33`
                    }}>{t.backToToday}</div>
                  )}
                  <div onClick={() => setCalWeekOffset(o => o - 1)} style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "1px solid " + c.inputBorder, color: c.textSub, fontSize: 14 }}>←</div>
                  <div onClick={() => setCalWeekOffset(o => o + 1)} style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "1px solid " + c.inputBorder, color: c.textSub, fontSize: 14 }}>→</div>
                </div>
              </div>

              {/* Staff filter */}
              {(salonData.staff || []).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  <div onClick={() => setAgendaStaff(null)} style={{
                    padding: "5px 12px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                    letterSpacing: "0.04em", transition: "all 0.2s",
                    background: !agendaStaff ? accent : "transparent",
                    color: !agendaStaff ? c.btnOnDark : c.textSub,
                    border: `1px solid ${!agendaStaff ? accent : c.inputBorder}`
                  }}>{lang === "nl" ? "Iedereen" : "Everyone"}</div>
                  {(salonData.staff || []).map(m => (
                    <div key={m.id} onClick={() => setAgendaStaff(agendaStaff === m.id ? null : m.id)} style={{
                      padding: "5px 12px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      letterSpacing: "0.04em", transition: "all 0.2s",
                      background: agendaStaff === m.id ? accent : "transparent",
                      color: agendaStaff === m.id ? c.btnOnDark : c.textSub,
                      border: `1px solid ${agendaStaff === m.id ? accent : c.inputBorder}`
                    }}>{m.name}</div>
                  ))}
                </div>
              )}

              {/* WEEK VIEW */}
              {calViewMode === "week" && (<>
                {(() => {
                  const base = getToday();
                  base.setDate(base.getDate() + calWeekOffset * 7);
                  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d; });
                  const MON = lang === "nl" ? MON_NL : MON_EN;
                  const firstDay = weekDays[0];
                  const lastDay = weekDays[weekDays.length - 1];
                  const monthLabel = firstDay.getMonth() === lastDay.getMonth()
                    ? `${MON[firstDay.getMonth()]} ${firstDay.getFullYear()}`
                    : `${MON[firstDay.getMonth()]} — ${MON[lastDay.getMonth()]} ${lastDay.getFullYear()}`;
                  return (<>
                    <div style={{ fontSize: 12, fontWeight: 500, color: c.textSub, marginBottom: 10, textTransform: "capitalize" }}>{monthLabel}</div>
                    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                      {weekDays.map((d, i) => {
                        const ds = fmt(d); const isSel = calDate === ds;
                        const isToday = ds === fmt(getToday());
                        const has = filteredAgendaAppts.filter(a => a.date === ds).length > 0;
                        return (
                          <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} onClick={() => setCalDate(ds)} style={isToday && !isSel ? { border: `1px solid ${accent}66` } : undefined}>
                            <span style={{ fontSize: 10, color: isSel ? c.btnOnDark : c.textLabel }}>{DAY[d.getDay()]}</span>
                            <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? c.btnOnDark : c.text, marginTop: 2 }}>{d.getDate()}</span>
                            {has && !isSel && <div style={{ width: 4, height: 4, borderRadius: "50%", background: accent, marginTop: 2 }} />}
                          </div>
                        );
                      })}
                    </div>
                  </>);
                })()}
              </>)}

              {/* MONTH VIEW */}
              {calViewMode === "month" && (() => {
                const base = getToday();
                const targetMonth = new Date(base.getFullYear(), base.getMonth() + calWeekOffset, 1);
                const year = targetMonth.getFullYear();
                const month = targetMonth.getMonth();
                const MON_FULL_NL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
                const MON_FULL_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                const MON_FULL = lang === "nl" ? MON_FULL_NL : MON_FULL_EN;
                const firstOfMonth = new Date(year, month, 1);
                const lastOfMonth = new Date(year, month + 1, 0);
                const startDay = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
                const daysInMonth = lastOfMonth.getDate();
                const cells = [];
                for (let i = 0; i < startDay; i++) cells.push(null);
                for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                const DAY_HEADERS = lang === "nl" ? ["Ma","Di","Wo","Do","Vr","Za","Zo"] : ["Mo","Tu","We","Th","Fr","Sa","Su"];
                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 12, textAlign: "center" }}>{MON_FULL[month]} {year}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                      {DAY_HEADERS.map(dh => (
                        <div key={dh} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: c.textLabel, padding: "4px 0", letterSpacing: "0.08em", textTransform: "uppercase" }}>{dh}</div>
                      ))}
                      {cells.map((day, i) => {
                        if (day === null) return <div key={`e${i}`} />;
                        const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const isSel = calDate === ds;
                        const isToday = ds === fmt(getToday());
                        const count = filteredAgendaAppts.filter(a => a.date === ds).length;
                        return (
                          <div key={ds} onClick={() => { 
                            setCalDate(ds); 
                            setCalViewMode("week"); 
                            // Calculate correct week offset so the clicked date is visible
                            const clickedDate = new Date(ds);
                            const today = getToday();
                            const diffDays = Math.floor((clickedDate - today) / (1000 * 60 * 60 * 24));
                            setCalWeekOffset(Math.floor(diffDays / 7));
                          }} style={{
                            textAlign: "center", padding: "8px 2px", borderRadius: 10, cursor: "pointer", position: "relative",
                            background: isSel ? accent : isToday ? `${accent}12` : "transparent",
                            border: `1px solid ${isSel ? accent : isToday ? `${accent}44` : "transparent"}`,
                            transition: "all 0.15s"
                          }}>
                            <div style={{ fontSize: 12, fontWeight: isSel || isToday ? 600 : 400, color: isSel ? c.btnOnDark : c.text }}>{day}</div>
                            {count > 0 && (
                              <div style={{ fontSize: 8, fontWeight: 700, color: isSel ? c.btnOnDark : accent, marginTop: 2 }}>{count}</div>
                            )}
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
                const MON_FULL_NL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
                const MON_FULL_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                const MON_LABELS = lang === "nl" ? MON_FULL_NL : MON_FULL_EN;
                const currentMonth = getToday().getMonth();
                const currentYear = getToday().getFullYear();
                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 12, textAlign: "center" }}>{baseYear}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {Array.from({ length: 12 }, (_, mi) => {
                        const monthPrefix = `${baseYear}-${String(mi + 1).padStart(2, "0")}`;
                        const monthApptCount = filteredAgendaAppts.filter(a => a.date?.startsWith(monthPrefix)).length;
                        const isCurrent = baseYear === currentYear && mi === currentMonth;
                        return (
                          <div key={mi} onClick={() => {
                            setCalViewMode("month");
                            const now = getToday();
                            setCalWeekOffset((baseYear - now.getFullYear()) * 12 + mi - now.getMonth());
                          }} style={{
                            textAlign: "center", padding: "18px 10px", borderRadius: 10, cursor: "pointer",
                            background: isCurrent ? accent : "transparent",
                            border: `1px solid ${isCurrent ? accent : "transparent"}`,
                            transition: "all 0.15s"
                          }}>
                            <div style={{ fontSize: 13, fontWeight: isCurrent ? 600 : 400, color: isCurrent ? c.btnOnDark : c.text }}>{MON_LABELS[mi]}</div>
                            {monthApptCount > 0 && (
                              <div style={{ fontSize: 10, fontWeight: 700, color: isCurrent ? c.btnOnDark : accent, marginTop: 4 }}>{monthApptCount} {t.appts}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {calViewMode !== "year" && (<>
              {calAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: c.textMuted, fontSize: 12 }}>{t.noTodayAppts}</div>
                : calAppts.map(a => <ApptCard key={a.id} a={a} />)
              }
              {calAppts.length > 0 && (
                <button className="btn-ghost" style={{ width: "100%", marginTop: 12, fontSize: 10, borderColor: `${accent}22`, color: accent }} onClick={() => exportCalendar(calAppts)}>
                  <NavIcon name="calendar" size={13} color="currentColor" /> {lang === "nl" ? `Exporteer ${calAppts.length} afspraak(en) naar agenda` : `Export ${calAppts.length} appointment(s) to calendar`}
                </button>
              )}
              </>)}
            </div>
          )}

          {/* FACTUREN */}
          {view === "facturen" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.completedTreatments}>{t.invoices}</PTitle>}

              {completedAppts.length > 0 && (<>
                {/* Search and filter bar */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <input className="input-field" placeholder={lang === "nl" ? "Zoek op naam of dienst..." : "Search by name or service..."} value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
                    style={{ flex: 1, minWidth: 180, fontSize: 12, padding: "10px 14px" }} />
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["all", lang === "nl" ? "Alles" : "All"], ["unsent", lang === "nl" ? "Te versturen" : "Unsent"], ["sent", lang === "nl" ? "Verstuurd" : "Sent"]].map(([key, label]) => (
                      <div key={key} onClick={() => setInvoiceFilter(key)} style={{
                        padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 11, fontWeight: 500, transition: "all 0.2s",
                        background: invoiceFilter === key ? `${accent}18` : "transparent",
                        color: invoiceFilter === key ? accent : c.textSub,
                        border: `1px solid ${invoiceFilter === key ? `${accent}44` : c.inputBorder}`
                      }}>{label}</div>
                    ))}
                  </div>
                </div>

                {/* Summary card */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <div className="stat-card" style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>{t.totalEarnings}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent }}>€{totalEarnings.toFixed(2)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{completedAppts.length} {t.treatments}</div>
                  </div>
                  <div className="stat-card" style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>{lang === "nl" ? "Te versturen" : "Unsent"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: "#f59e0b" }}>{completedAppts.filter(a => !a.invoice_sent).length}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{lang === "nl" ? "facturen" : "invoices"}</div>
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
                if (completedAppts.length === 0) return <div style={{ textAlign: "center", padding: "40px 0", color: c.textMuted, fontSize: 12 }}>{t.noCompleted}</div>;
                if (filtered.length === 0) return <div style={{ textAlign: "center", padding: "40px 0", color: c.textMuted, fontSize: 12 }}>{lang === "nl" ? "Geen resultaten" : "No results"}</div>;
                return filtered.map(a => (
                  <div key={a.id} className="appt-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{a.client_name}</div>
                      <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3 }}>{a.date} · {a.service_name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>€{parseFloat(a.service_price || 0).toFixed(2)}</div>
                      <div style={{ marginTop: 5 }}>
                        {a.invoice_sent
                          ? <span style={{ fontSize: 10, color: "#86efac", display: "inline-flex", alignItems: "center", gap: 3 }}><NavIcon name="check" size={10} color="#86efac" /> {t.sent}</span>
                          : <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 10px", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => sendInvoice(a.id)}>{processingApptId === a.id ? "..." : t.send}</button>
                        }
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* ANALYTICS */}
          {view === "analytics" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={lang === "nl" ? "Inzicht in je salon" : "Insight into your salon"}>{t.analytics}</PTitle>}

              {/* Key metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {(() => {
                  const now = new Date();
                  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
                  const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);
                  const weekRevenue = appts.filter(a => a.status === "completed" && new Date(a.date) >= weekAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                  const monthRevenue = appts.filter(a => a.status === "completed" && new Date(a.date) >= monthAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                  const avgRating = salonData.reviews?.length > 0 ? (salonData.reviews.reduce((s, r) => s + r.rating, 0) / salonData.reviews.length).toFixed(1) : "—";
                  return <>
                    <div className="stat-card">
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.weeklyRevenue}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>€{weekRevenue.toFixed(0)}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.monthlyRevenue}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>€{monthRevenue.toFixed(0)}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.totalAppts}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: c.text, marginTop: 4 }}>{appts.length}</div>
                      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{completedAppts.length} {t.treatments}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.avgRating}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>{avgRating} ★</div>
                      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{salonData.reviews?.length || 0} {t.reviews.toLowerCase()}</div>
                    </div>
                  </>;
                })()}
              </div>

              {/* Revenue chart */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <SL style={{ marginBottom: 0 }}>{t.revenueOverTime}</SL>
                </div>
                {(() => {
                  // Build last 8 weeks of revenue data
                  const weeks = [];
                  const now = new Date();
                  for (let w = 7; w >= 0; w--) {
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - (w * 7 + now.getDay()));
                    weekStart.setHours(0,0,0,0);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 7);
                    const rev = appts
                      .filter(a => a.status === "completed" && new Date(a.date) >= weekStart && new Date(a.date) < weekEnd)
                      .reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                    const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
                    weeks.push({ label, revenue: rev });
                  }
                  const maxRev = Math.max(...weeks.map(w => w.revenue), 1);
                  const chartH = 120;
                  const barW = 100 / weeks.length;
                  
                  return (
                    <div>
                      {/* SVG Bar Chart */}
                      <div style={{ position: "relative", height: chartH + 30 }}>
                        <svg width="100%" height={chartH} viewBox={`0 0 100 ${chartH}`} preserveAspectRatio="none" style={{ display: "block" }}>
                          {weeks.map((w, i) => {
                            const barH = Math.max((w.revenue / maxRev) * (chartH - 10), 2);
                            const x = i * barW + barW * 0.15;
                            const bw = barW * 0.7;
                            return (
                              <rect key={i} x={x} y={chartH - barH} width={bw} height={barH} rx="2" 
                                fill={i === weeks.length - 1 ? accent : `${accent}66`}
                              />
                            );
                          })}
                        </svg>
                        {/* Labels */}
                        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 6 }}>
                          {weeks.map((w, i) => (
                            <div key={i} style={{ fontSize: 9, color: c.textMuted, textAlign: "center", flex: 1 }}>
                              {w.label}
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Revenue labels on hover area */}
                      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
                        {weeks.map((w, i) => (
                          <div key={i} style={{ fontSize: 9, color: i === weeks.length - 1 ? accent : c.textLabel, textAlign: "center", flex: 1, fontWeight: i === weeks.length - 1 ? 600 : 400 }}>
                            {w.revenue > 0 ? `€${w.revenue.toFixed(0)}` : "—"}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Popular services */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.popularServices}</SL>
                {(() => {
                  const svcCount = {};
                  appts.forEach(a => { const n = a.service_name?.split(" — ")[0] || "?"; svcCount[n] = (svcCount[n] || 0) + 1; });
                  const sorted = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
                  if (sorted.length === 0) return <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noAppts}</div>;
                  const max = sorted[0][1];
                  return sorted.map(([name, count]) => (
                    <div key={name} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{name}</span>
                        <span style={{ fontSize: 11, color: c.textLabel }}>{count} {t.bookings}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 4, background: c.bgCardHover }}>
                        <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(count / max) * 100}%`, transition: "width 0.4s" }} />
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Busiest days */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.busiestDays}</SL>
                {(() => {
                  const dayNames = lang === "nl" ? ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"] : ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                  const dayCounts = [0,0,0,0,0,0,0];
                  appts.forEach(a => { const d = new Date(a.date); dayCounts[d.getDay()]++; });
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
                          <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div style={{ width: "100%", borderRadius: 4, background: count > 0 ? `${accent}${Math.max(Math.round(pct * 0.8 + 20), 20).toString(16).padStart(2,"0")}` : c.bgCardHover, height: Math.max(pct * 0.7, 2), transition: "height 0.3s" }} />
                            <span style={{ fontSize: 8, color: c.textMuted }}>{h}:00</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Client retention */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16 }}>
                <SL>{t.reviews} ({salonData.reviews?.length || 0})</SL>
                {(!salonData.reviews || salonData.reviews.length === 0)
                  ? <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noReviews}</div>
                  : salonData.reviews.map(r => (
                    <div key={r.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid " + c.border }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{r.client_name}</span>
                        <span style={{ color: accent, fontSize: 13 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                      </div>
                      {r.comment && <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.5 }}>{r.comment}</div>}
                      <div style={{ fontSize: 9, color: c.textMuted, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          </div>
          ) : (
          /* INSTELLINGEN -- own scroll area with pinned save button */
          <>
          <div style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            WebkitOverflowScrolling: "touch",
            padding: isMobile ? "14px 22px 20px" : "32px 40px 20px",
            backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}08 0%, transparent 55%)`
          }}>
            <div className="fade-up">
              {isMobile && <PTitle sub={t.manageSalon}>{t.settings}</PTitle>}

              {/* Settings tabs */}
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, marginBottom: 16, borderBottom: "1px solid " + c.border }}>
                {[
                  ["salon", "salon", lang === "nl" ? "Salon" : "Salon"],
                  ["diensten", "diensten", lang === "nl" ? "Diensten" : "Services"],
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

              {/* ═══ SALON TAB ═══ */}
              {settingsTab === "salon" && <>

              {/* Billing / Subscription */}
              <div style={{ background: `${accent}06`, border: `1px solid ${accent}22`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.billing}</SL>
                {salonData.plan ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 100, letterSpacing: "0.08em", textTransform: "uppercase", background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}>
                        {salonData.plan === "starter" ? t.planStarter : t.planProfessional}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: "rgba(134,239,172,0.1)", color: "#86efac", border: "1px solid rgba(134,239,172,0.2)" }}>
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
                        onClick={() => alert(lang === "nl" ? "Neem contact op via info@vellu.cc om te upgraden." : "Contact info@vellu.cc to upgrade.")}>
                        {t.upgradePlan} → {t.planProfessional}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: c.textLabel }}>{t.noPlan}</div>
                )}
              </div>

              {/* Profile */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.profile}</SL>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <input className="input-field" placeholder={t.businessName} value={salonData.name} onChange={e => update(d => { d.name = e.target.value; return d; })} />
                  <input className="input-field" placeholder={t.city} value={salonData.city} onChange={e => update(d => { d.city = e.target.value; return d; })} />
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

              {/* Salon Contact Details */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.salonContact}</SL>
                <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 10 }}>{t.salonContactDesc}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <input className="input-field" placeholder={t.salonPhone} value={salonData.salon_phone || ""} onChange={e => update(d => { d.salon_phone = e.target.value; return d; })} />
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><NavIcon name="chat" size={16} color={c.textMuted} /></div>
                    <input className="input-field" placeholder={t.whatsappNumber} value={salonData.whatsapp_number || ""} onChange={e => update(d => { d.whatsapp_number = e.target.value; return d; })} style={{ paddingLeft: 38 }} />
                  </div>
                  <input className="input-field" placeholder={t.salonInstagram} value={salonData.salon_instagram || ""} onChange={e => update(d => { d.salon_instagram = e.target.value; return d; })} />
                  <input className="input-field" placeholder={t.salonEmail} value={salonData.salon_email || ""} onChange={e => update(d => { d.salon_email = e.target.value; return d; })} />
                </div>
              </div>

              {/* Invoice details */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.invoiceDetails}</SL>
                <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 10 }}>{t.invoiceSettings}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <input className="input-field" placeholder={t.address} value={salonData.address || ""} onChange={e => update(d => { d.address = e.target.value; return d; })} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                    <input className="input-field" placeholder={t.kvkNumber} value={salonData.kvk_number || ""} onChange={e => update(d => { d.kvk_number = e.target.value; return d; })} />
                    <input className="input-field" placeholder={t.btwId} value={salonData.btw_id || ""} onChange={e => update(d => { d.btw_id = e.target.value; return d; })} />
                  </div>
                  <input className="input-field" placeholder={t.ibanNumber} value={salonData.iban || ""} onChange={e => update(d => { d.iban = e.target.value; return d; })} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                    <input className="input-field" placeholder={t.invoicePrefix + " (bijv. INV)"} value={salonData.invoice_prefix || "INV"} onChange={e => update(d => { d.invoice_prefix = e.target.value; return d; })} />
                    <input className="input-field" placeholder="Volgend nr" type="number" value={salonData.next_invoice_number || 1} onChange={e => update(d => { d.next_invoice_number = parseInt(e.target.value) || 1; return d; })} />
                  </div>
                </div>
              </div>
              </>}

              {/* ═══ DIENSTEN TAB ═══ */}
              {settingsTab === "diensten" && <>

              {/* Services + photos */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.services}</SL>
                {salonData.services.length === 0 && (
                  <div style={{ fontSize: 12, color: c.textMuted, textAlign: "center", padding: "16px 0" }}>{lang === "nl" ? "Nog geen diensten" : "No services yet"}</div>
                )}
                {salonData.services.map(s => (
                  <div key={s.id} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 14, padding: 14, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editingService === s.id ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              <input className="input-field" value={editSvcForm.name_nl} onChange={e => setEditSvcForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} placeholder="Naam (NL)" />
                              <input className="input-field" value={editSvcForm.name_en} onChange={e => setEditSvcForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} placeholder="Name (EN)" />
                              <input className="input-field" type="number" value={editSvcForm.price} onChange={e => setEditSvcForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} placeholder="€" />
                              <input className="input-field" type="number" value={editSvcForm.duration} onChange={e => setEditSvcForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} placeholder="min" />
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "6px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                await supabase.from("services").update({ name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, name: editSvcForm.name_nl, price: parseFloat(editSvcForm.price), duration: parseInt(editSvcForm.duration) }).eq("id", s.id);
                                update(d => { d.services = d.services.map(sv => sv.id === s.id ? {...sv, name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, price: editSvcForm.price, duration: editSvcForm.duration} : sv); return d; });
                                setEditingService(null);
                              }}><NavIcon name="check" size={11} /> {t.saveChanges}</button>
                              <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px" }} onClick={() => setEditingService(null)}><NavIcon name="xmark" size={12} /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{lang === "nl" ? s.name_nl : s.name_en}</div>
                            <div style={{ fontSize: 11, color: c.textLabel, marginTop: 2 }}>€{s.price} · {s.duration} {t.min}</div>
                          </>
                        )}
                      </div>
                      {editingService !== s.id && (
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: accent, borderColor: `${accent}33` }} onClick={() => { setEditingService(s.id); setEditSvcForm({ name_nl: s.name_nl, name_en: s.name_en || "", price: s.price, duration: s.duration }); }}><NavIcon name="edit" size={10} color={accent} /> {lang === "nl" ? "Bewerk" : "Edit"}</button>
                          <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }} onClick={async () => { if (await showConfirm(lang === "nl" ? "Dienst verwijderen?" : "Delete service?")) deleteService(s.id); }}>×</button>
                        </div>
                      )}
                    </div>

                    {/* Variants */}
                    <div style={{ marginTop: 10, marginLeft: 8, paddingLeft: 10, borderLeft: `2px solid ${accent}22` }}>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.variants}</div>
                      {(s.variants || []).map(v => (
                        <div key={v.id} style={{ marginBottom: 5, padding: "6px 0" }}>
                          {editingVariant === v.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                                <input className="input-field" value={editVariantForm.name_nl} onChange={e => setEditVariantForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder="Naam (NL)" />
                                <input className="input-field" value={editVariantForm.name_en} onChange={e => setEditVariantForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder="Name (EN)" />
                                <input className="input-field" type="number" value={editVariantForm.price} onChange={e => setEditVariantForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder="€" />
                                <input className="input-field" type="number" value={editVariantForm.duration} onChange={e => setEditVariantForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder="min" />
                              </div>
                              <input className="input-field" value={editVariantForm.description_nl} onChange={e => setEditVariantForm(f => ({...f, description_nl: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder={lang === "nl" ? "Omschrijving" : "Description"} />
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn-ghost" style={{ flex: 1, fontSize: 9, padding: "4px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                  await supabase.from("service_variants").update({ name_nl: editVariantForm.name_nl, name_en: editVariantForm.name_en || null, price: parseFloat(editVariantForm.price), duration: parseInt(editVariantForm.duration), description_nl: editVariantForm.description_nl || null }).eq("id", v.id);
                                  update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: svc.variants.map(vr => vr.id === v.id ? {...vr, ...editVariantForm, price: parseFloat(editVariantForm.price), duration: parseInt(editVariantForm.duration)} : vr)} : svc); return d; });
                                  setEditingVariant(null);
                                }}><NavIcon name="check" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => setEditingVariant(null)}><NavIcon name="xmark" size={12} /></button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 500 }}>{v.name_nl}</div>
                                {v.description_nl && <div style={{ fontSize: 9, color: c.textMuted }}>{v.description_nl}</div>}
                                <div style={{ fontSize: 10, color: c.textLabel }}>€{v.price} · {v.duration} {t.min}</div>
                              </div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: accent, borderColor: `${accent}33` }}
                                  onClick={() => { setEditingVariant(v.id); setEditVariantForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "" }); }}><NavIcon name="edit" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                                  onClick={async () => {
                                    await supabase.from("service_variants").delete().eq("id", v.id);
                                    update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: (svc.variants||[]).filter(x => x.id !== v.id)} : svc); return d; });
                                  }}>×</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <VariantAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(variant) => {
                        update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: [...(svc.variants||[]), variant]} : svc); return d; });
                      }} />
                    </div>

                    {/* Extras */}
                    <div style={{ marginTop: 8, marginLeft: 8, paddingLeft: 10, borderLeft: `2px solid ${accent}22` }}>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.extras}</div>
                      {(s.extras || []).map(e => (
                        <div key={e.id} style={{ marginBottom: 5, padding: "4px 0" }}>
                          {editingExtra === e.id ? (
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <input className="input-field" value={editExtraForm.name_nl} onChange={ev => setEditExtraForm(f => ({...f, name_nl: ev.target.value}))} style={{ fontSize: 10, padding: "6px 8px", flex: 2 }} placeholder="Naam" />
                              <input className="input-field" type="number" value={editExtraForm.price} onChange={ev => setEditExtraForm(f => ({...f, price: ev.target.value}))} style={{ fontSize: 10, padding: "6px 8px", flex: 1 }} placeholder="€" />
                              <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 8px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                await supabase.from("service_extras").update({ name_nl: editExtraForm.name_nl, name_en: editExtraForm.name_en || null, price: parseFloat(editExtraForm.price) }).eq("id", e.id);
                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: svc.extras.map(ex => ex.id === e.id ? {...ex, name_nl: editExtraForm.name_nl, price: editExtraForm.price} : ex)} : svc); return d; });
                                setEditingExtra(null);
                              }}><NavIcon name="check" size={12} /></button>
                              <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => setEditingExtra(null)}><NavIcon name="xmark" size={12} /></button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontSize: 11, fontWeight: 500 }}>{e.name_nl} <span style={{ color: c.textLabel }}>+€{e.price}</span></div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: accent, borderColor: `${accent}33` }}
                                  onClick={() => { setEditingExtra(e.id); setEditExtraForm({ name_nl: e.name_nl, name_en: e.name_en || "", price: e.price }); }}><NavIcon name="edit" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                                  onClick={async () => {
                                    await supabase.from("service_extras").delete().eq("id", e.id);
                                    update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: (svc.extras||[]).filter(x => x.id !== e.id)} : svc); return d; });
                                  }}>×</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <ExtraAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(extra) => {
                        update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: [...(svc.extras||[]), extra]} : svc); return d; });
                      }} />
                    </div>

                    {/* Photo management */}
                    <div className="photo-grid">
                      {(s.photos || []).map((p, i) => (
                        <div key={p.id || i} style={{ position: "relative", flexShrink: 0 }}>
                          <img src={p.url || p} className="photo-thumb" onClick={() => setGallery({ photos: s.photos, idx: i })} />
                          <div onClick={() => deletePhoto(s.id, p.id, p.url || p)} style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer", fontWeight: 700, lineHeight: 1 }}>×</div>
                        </div>
                      ))}
                      <label className="photo-add" style={{ flexShrink: 0, opacity: photoUploading === s.id ? 0.5 : 1 }}>
                        {photoUploading === s.id ? (
                          <span style={{ fontSize: 12, color: accent, animation: "spin 1s linear infinite" }}>⏳</span>
                        ) : (
                          <>
                            <span style={{ fontSize: 18, color: `${accent}88` }}>+</span>
                            <span style={{ fontSize: 9, color: `${accent}66`, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.addPhoto}</span>
                          </>
                        )}
                        <input type="file" accept="image/*" multiple style={{ display: "none" }}
                          onChange={e => Array.from(e.target.files).forEach(f => addPhoto(s.id, f))} />
                      </label>
                    </div>
                  </div>
                ))}

                {/* Add new service */}
                <div style={{ marginTop: 4 }}>
                  <SL>{lang === "nl" ? "Nieuwe dienst" : "New service"}</SL>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <input className="input-field" placeholder={t.serviceName} value={newSvc.name_nl} onChange={e => setNewSvc(s => ({...s, name_nl: e.target.value}))} style={{ fontSize: 12, padding: "11px 13px" }} />
                    <input className="input-field" placeholder={t.serviceNameEn} value={newSvc.name_en} onChange={e => setNewSvc(s => ({...s, name_en: e.target.value}))} style={{ fontSize: 12, padding: "11px 13px" }} />
                    <input className="input-field" placeholder={t.price} type="number" value={newSvc.price} onChange={e => setNewSvc(s => ({...s, price: e.target.value}))} style={{ fontSize: 12, padding: "11px 13px" }} />
                    <input className="input-field" placeholder={t.duration} type="number" value={newSvc.duration} onChange={e => setNewSvc(s => ({...s, duration: e.target.value}))} style={{ fontSize: 12, padding: "11px 13px" }} />
                  </div>
                  {svcError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{svcError}</div>}
                  <button className="btn-ghost" style={{ width: "100%", borderStyle: "dashed", borderColor: `${accent}33`, color: accent, fontSize: 11 }} onClick={addService}>{t.addService}</button>
                </div>
              </div>
              </>}

              {/* ═══ TEAM TAB ═══ */}
              {settingsTab === "team" && <>

              {/* Staff / Team */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
                  <div key={m.id} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 10 }}>
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
                              }} style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, cursor: "pointer" }}>×</div>
                            )}
                          </div>
                        ) : (
                          editingStaff === m.id ? (
                            <label style={{ width: 52, height: 52, borderRadius: "50%", border: `1.5px dashed ${accent}44`, background: `${accent}06`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 2 }}>
                              <NavIcon name="camera" size={16} color={`${accent}88`} />
                              <span style={{ fontSize: 7, color: `${accent}66` }}>FOTO</span>
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
                            <textarea className="input-field" value={editStaffForm.bio} onChange={e => setEditStaffForm(f => ({...f, bio: e.target.value}))} placeholder={t.staffBio} rows={2} style={{ fontSize: 12, padding: "7px 10px", resize: "vertical" }} />
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
                            {m.role && <div style={{ fontSize: 11, color: c.textLabel, marginTop: 2 }}>{m.role}</div>}
                            {m.bio && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4, lineHeight: 1.5 }}>{m.bio}</div>}
                          </>
                        )}
                        {editingStaff !== m.id && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
                            {(m.service_ids?.length > 0) ? m.service_ids.map(sid => {
                              const svc = salonData.services.find(s => s.id === sid);
                              return svc ? <span key={sid} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 100, background: `${accent}12`, color: accent, border: `1px solid ${accent}22` }}>{svc.name_nl || svc.name}</span> : null;
                            }) : (
                              <span style={{ fontSize: 9, color: c.textMuted, fontStyle: "italic" }}>{lang === "nl" ? "Alle diensten" : "All services"}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Buttons */}
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {editingStaff === m.id ? (
                          <>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: accent, borderColor: `${accent}33` }} onClick={async () => {
                              await supabase.from("staff_members").update({ name: editStaffForm.name, role: editStaffForm.role || null, bio: editStaffForm.bio || null, working_hours: editStaffForm.working_hours }).eq("id", m.id);
                              await supabase.from("staff_services").delete().eq("staff_id", m.id);
                              if (editStaffForm.service_ids.length > 0) {
                                await supabase.from("staff_services").insert(editStaffForm.service_ids.map(sid => ({ staff_id: m.id, service_id: sid })));
                              }
                              update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, name: editStaffForm.name, role: editStaffForm.role, bio: editStaffForm.bio, working_hours: editStaffForm.working_hours, service_ids: editStaffForm.service_ids} : s); return d; });
                              setEditingStaff(null);
                            }}><NavIcon name="check" size={12} /> {lang === "nl" ? "Opslaan" : "Save"}</button>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px" }} onClick={() => setEditingStaff(null)}><NavIcon name="xmark" size={12} /></button>
                          </>
                        ) : (
                          <>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: accent, borderColor: `${accent}33` }} onClick={() => { setEditingStaff(m.id); setEditStaffForm({ name: m.name, role: m.role || "", bio: m.bio || "", working_hours: m.working_hours || {}, service_ids: m.service_ids || [] }); }}><NavIcon name="edit" size={10} color={accent} /> {lang === "nl" ? "Bewerk" : "Edit"}</button>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }} onClick={async () => {
                              if (!await showConfirm(lang === "nl" ? `${m.name} verwijderen?` : `Delete ${m.name}?`)) return;
                              await supabase.from("staff_services").delete().eq("staff_id", m.id);
                              await supabase.from("appointments").update({ staff_id: null }).eq("staff_id", m.id);
                              await supabase.from("staff_members").delete().eq("id", m.id);
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
                        <div style={{ fontSize: 9, color: c.textMuted, marginTop: 4, marginBottom: 14 }}>{lang === "nl" ? "Leeg/alles aan = volgt salon openingstijden" : "Empty/all on = follows salon hours"}</div>
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
                            <div style={{ fontSize: 9, color: c.textMuted, marginTop: 4 }}>{lang === "nl" ? "Leeg = alle diensten" : "Empty = all services"}</div>
                          </div>
                        )}
                        {salonData.account_type === "team" && !m.user_id && (
                          <div style={{ padding: "12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: accent, marginBottom: 6 }}><NavIcon name="key" size={10} color={accent} /> {t.inviteStaffDesc}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input className="input-field" placeholder={t.staffEmail} type="email" value={staffInvite[m.id]?.email || ""} onChange={e => setStaffInvite(prev => ({...prev, [m.id]: {...(prev[m.id] || {}), email: e.target.value}}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                              <input className="input-field" placeholder={t.staffPassword} type="text" value={staffInvite[m.id]?.password || ""} onChange={e => setStaffInvite(prev => ({...prev, [m.id]: {...(prev[m.id] || {}), password: e.target.value}}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                              <button className="btn-ghost" style={{ fontSize: 10, color: accent, borderColor: `${accent}44` }}
                                onClick={async () => {
                                  const staffEmail = staffInvite[m.id]?.email;
                                  const staffPass = staffInvite[m.id]?.password;
                                  if (!staffEmail || !staffPass || staffPass.length < 6) return;
                                  const { data: result, error } = await supabase.functions.invoke("create-staff-account", {
                                    body: { staff_id: m.id, email: staffEmail, password: staffPass, owner_id: salonData.owner_id }
                                  });
                                  if (error) { alert(error.message || "Error"); return; }
                                  if (result?.success) {
                                    update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, user_id: result.user_id, email: staffEmail} : s); return d; });
                                    setStaffInvite(prev => { const next = {...prev}; delete next[m.id]; return next; });
                                    alert(t.inviteSent + "\n" + staffEmail + " → " + t.staffLoginInfo);
                                  } else { alert(result?.error === "email_taken" ? t.emailTaken : (result?.error || "Error")); }
                                }}>{t.inviteStaff}</button>
                            </div>
                          </div>
                        )}
                        {salonData.account_type === "team" && m.user_id && (
                          <div style={{ fontSize: 10, color: "#86efac", display: "flex", alignItems: "center", gap: 3 }}><NavIcon name="check" size={10} color="#86efac" /> {m.email || t.staffLoginInfo}</div>
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

              {/* Locations */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.locations}</SL>
                {(salonData.locations || []).length === 0 && (
                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noLocations}</div>
                )}
                {(salonData.locations || []).map(loc => (
                  <div key={loc.id} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 14, padding: 14, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{loc.name}</div>
                        {loc.address && <div style={{ fontSize: 10, color: c.textLabel }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 10px", color: accent, borderColor: `${accent}33` }}
                          onClick={() => {
                            const newName = prompt(lang === "nl" ? "Locatienaam:" : "Location name:", loc.name);
                            if (newName && newName !== loc.name) {
                              const newAddr = prompt(lang === "nl" ? "Adres:" : "Address:", loc.address || "");
                              supabase.from("locations").update({ name: newName, address: newAddr || null }).eq("id", loc.id);
                              update(d => { d.locations = d.locations.map(l => l.id === loc.id ? {...l, name: newName, address: newAddr} : l); return d; });
                            }
                          }}><NavIcon name="edit" size={12} /></button>
                        <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                          onClick={async () => {
                            if (!await showConfirm(lang === "nl" ? "Locatie verwijderen?" : "Delete location?")) return;
                            await supabase.from("locations").delete().eq("id", loc.id);
                            update(d => { d.locations = (d.locations || []).filter(l => l.id !== loc.id); return d; });
                          }}>×</button>
                      </div>
                    </div>
                  </div>
                ))}
                <LocationAdder ownerId={salonData.owner_id} lang={lang} t={t} accent={accent} onAdd={(loc) => {
                  update(d => { d.locations = [...(d.locations || []), loc]; return d; });
                }} />
              </div>

              {/* Business Hours */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.exceptionDays}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.exceptionDesc}</div>
                {Object.entries(salonData.day_overrides || {}).filter(([_, v]) => v.type === "exception").map(([date, v]) => (
                  <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 14, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })}</div>
                      <div style={{ fontSize: 10, color: c.textLabel }}>{v.open} — {v.close}</div>
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                      onClick={() => update(d => { const o = {...(d.day_overrides || {})}; delete o[date]; d.day_overrides = o; return d; })}>×</button>
                  </div>
                ))}
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
                <button className="btn-ghost" style={{ width: "100%", marginTop: 8, fontSize: 10, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
                  onClick={() => {
                    if (!newException.date) return;
                    update(d => { d.day_overrides = {...(d.day_overrides || {}), [newException.date]: { type: "exception", open: newException.open, close: newException.close }}; return d; });
                    setNewException({ date: "", open: "09:00", close: "17:30" });
                  }}>{t.addException}</button>
              </div>

              {/* Blocked Days */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.blockedDays}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.blockedDesc}</div>
                {Object.entries(salonData.day_overrides || {}).filter(([date, v]) => v.type === "blocked" && (!v.from || date === v.from || v.block_time_start)).map(([date, v]) => (
                  <div key={date + (v.block_time_start || "")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 14, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{date}{v.to && v.to !== date ? ` → ${v.to}` : ""}</div>
                      {v.block_time_start && v.block_time_end && (
                        <div style={{ fontSize: 10, color: accent, fontWeight: 500 }}>{v.block_time_start} — {v.block_time_end}</div>
                      )}
                      {v.reason && <div style={{ fontSize: 10, color: c.textLabel }}>{v.reason}</div>}
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
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
                {/* Block mode toggle: whole day or time slot */}
                <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 10 }}>
                  <div onClick={() => setNewBlocked(f => ({...f, mode: "day"}))} style={{
                    padding: "6px 14px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 600,
                    background: (newBlocked.mode || "day") === "day" ? "rgba(248,113,113,0.12)" : "transparent",
                    color: (newBlocked.mode || "day") === "day" ? "#f87171" : c.textSub,
                    border: `1px solid ${(newBlocked.mode || "day") === "day" ? "rgba(248,113,113,0.3)" : c.inputBorder}`
                  }}>{t.blockWholeDay}</div>
                  <div onClick={() => setNewBlocked(f => ({...f, mode: "time"}))} style={{
                    padding: "6px 14px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 600,
                    background: newBlocked.mode === "time" ? "rgba(248,113,113,0.12)" : "transparent",
                    color: newBlocked.mode === "time" ? "#f87171" : c.textSub,
                    border: `1px solid ${newBlocked.mode === "time" ? "rgba(248,113,113,0.3)" : c.inputBorder}`
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
                <button className="btn-ghost" style={{ width: "100%", marginTop: 8, fontSize: 10, borderStyle: "dashed", borderColor: "rgba(248,113,113,0.2)", color: "#f87171" }}
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
                  }}>{t.addBlocked}</button>
              </div>

              {/* Google Calendar Sync */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.googleCalendar}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.googleCalendarDesc}</div>
                {salonData.google_calendar_connected ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: `${accent}12`, border: `1px solid ${accent}33`, borderRadius: 12, marginBottom: 10 }}>
                      <NavIcon name="calendar" size={16} color={accent} />
                      <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>{t.googleCalendarConnected}</span>
                    </div>
                    <button className="btn-ghost" style={{ width: "100%", fontSize: 10, color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }}
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
              </>}

              {/* ═══ FACTURATIE TAB ═══ */}
              {settingsTab === "facturatie" && <>

              {/* Appearance Section */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.appearance}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 12 }}>{t.logoDesc}</div>
                
                {/* Logo upload */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  {salonData.logo_url ? (
                    <div style={{ position: "relative" }}>
                      <img src={salonData.logo_url} style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover", border: "1px solid " + c.inputBorder }} />
                      <div onClick={() => update(d => { d.logo_url = ""; return d; })} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer" }}>×</div>
                    </div>
                  ) : (
                    <label style={{ width: 60, height: 60, borderRadius: 12, border: `1.5px dashed ${accent}44`, background: `${accent}06`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4 }}>
                      <NavIcon name="camera" size={18} color={`${accent}88`} />
                      <span style={{ fontSize: 8, color: `${accent}66`, textTransform: "uppercase" }}>{t.logo}</span>
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
                  <span style={{ fontSize: 12, color: c.textSub }}>{t.logo}</span>
                </div>

                {/* Cover image upload */}
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 8 }}>{t.coverDesc}</div>
                {salonData.cover_image_url ? (
                  <div style={{ position: "relative", marginBottom: 16 }}>
                    <img src={salonData.cover_image_url} style={{ width: "100%", height: 80, borderRadius: 12, objectFit: "cover", border: "1px solid " + c.inputBorder }} />
                    <div onClick={() => update(d => { d.cover_image_url = ""; return d; })} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer" }}>×</div>
                  </div>
                ) : (
                  <label style={{ width: "100%", height: 80, borderRadius: 12, border: `1.5px dashed ${accent}44`, background: `${accent}06`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4, marginBottom: 16 }}>
                    <NavIcon name="image" size={18} color={`${accent}88`} />
                    <span style={{ fontSize: 9, color: `${accent}66`, textTransform: "uppercase" }}>{t.uploadCover}</span>
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

              {/* Booking Policy Section */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <SL>{t.discountCodes}</SL>
                
                {/* Existing codes */}
                {(salonData.discount_codes || []).map((code, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "10px 12px", background: c.bg, borderRadius: 14, border: "1px solid " + c.border }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: accent, fontFamily: "monospace" }}>{code.code}</div>
                      <div style={{ fontSize: 11, color: c.textSub }}>
                        {code.type === "percent" ? `${code.amount}%` : `€${code.amount}`} {t.discount.toLowerCase()}
                      </div>
                    </div>
                    <div 
                      onClick={() => update(d => { d.discount_codes[idx].active = !d.discount_codes[idx].active; return d; })}
                      style={{ 
                        width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                        background: code.active ? "#4ade80" : c.toggleInactive,
                        position: "relative", transition: "background 0.2s"
                      }}
                    >
                      <div style={{ position: "absolute", top: 2, left: code.active ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                    </div>
                    <div onClick={() => update(d => { d.discount_codes = d.discount_codes.filter((_, i) => i !== idx); return d; })} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,71,87,0.1)", color: "#ff4757", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14 }}>×</div>
                  </div>
                ))}

                {/* Add new code form */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <input className="input-field" placeholder={t.discountCode} value={newDiscount.code} onChange={e => setNewDiscount(d => ({...d, code: e.target.value.toUpperCase()}))} style={{ flex: 1, minWidth: 100, fontSize: 12 }} />
                  <input className="input-field" placeholder={t.discountAmount} type="number" value={newDiscount.amount} onChange={e => setNewDiscount(d => ({...d, amount: e.target.value}))} style={{ width: 70, fontSize: 12 }} />
                  <select value={newDiscount.type} onChange={e => setNewDiscount(d => ({...d, type: e.target.value}))} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 10, padding: "8px 12px", color: c.text, fontSize: 12, fontFamily: "'Jost',sans-serif" }}>
                    <option value="percent" style={{ background: c.selectBg }}>%</option>
                    <option value="fixed" style={{ background: c.selectBg }}>€</option>
                  </select>
                </div>
                <button className="btn-ghost" style={{ marginTop: 10, width: "100%", fontSize: 12 }} onClick={() => {
                  if (!newDiscount.code || !newDiscount.amount) return;
                  update(d => { 
                    d.discount_codes = [...(d.discount_codes || []), { ...newDiscount, amount: parseFloat(newDiscount.amount) }]; 
                    return d; 
                  });
                  setNewDiscount({ code: "", amount: "", type: "percent", active: true });
                }}>{t.addDiscountCode}</button>
              </div>
              </>}

            </div>
          </div>
          </>
          )}

        </main>

        {/* Floating save button -- position:fixed OUTSIDE main, like cookie banner */}
        {view === "instellingen" && (
          <div style={{ position: "fixed", bottom: isMobile ? 70 : 24, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 99, pointerEvents: "none" }}>
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
                  next_invoice_number: salonData.next_invoice_number || 1,
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
                  discount_codes: salonData.discount_codes || [],
                  day_overrides: salonData.day_overrides || {},
                  account_type: salonData.account_type || "joint",
                  min_advance_hours: salonData.min_advance_hours || 0,
                  max_advance_days: salonData.max_advance_days || 60,
                  reminder_hours: salonData.reminder_hours ?? 24,
                  rebook_nudge_days: salonData.rebook_nudge_days ?? 28
                };
                const { data: updatedRows, error } = await supabase.from("profiles").update(updateData).eq("id", salonData.owner_id).select();
                if (error) {
                  console.error("Save error:", error);
                  alert(lang === "nl" ? `Opslaan mislukt: ${error.message}` : `Save failed: ${error.message}`);
                } else if (!updatedRows || updatedRows.length === 0) {
                  console.error("Save: no rows updated. owner_id:", salonData.owner_id, "updateData:", updateData);
                  toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
                } else {
                  console.log("Save success:", updatedRows[0]?.address, updatedRows[0]?.kvk_number);
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
            padding: "12px 4px 8px",
            paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) + 4px))",
            zIndex: 100
          }}>
            {navItems.filter(([k]) => k !== "analytics").map(([k, icon, label]) => (
              <div key={k} className="nav-item" onClick={() => setView(k)} style={{ gap: 3 }}>
                <NavIcon name={icon} size={18} color={view === k ? accent : c.textMuted} />
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: view === k ? accent : c.textMuted, transition: "color 0.2s", whiteSpace: "nowrap" }}>{label}</span>
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
                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                      <div onClick={() => { setClientMode("existing"); setClientSearch(""); }} style={{
                        padding: "6px 14px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 600,
                        background: clientMode === "existing" ? `${accent}18` : "transparent",
                        color: clientMode === "existing" ? accent : c.textSub,
                        border: `1px solid ${clientMode === "existing" ? `${accent}44` : c.inputBorder}`
                      }}>{t.selectClient}</div>
                      <div onClick={() => setClientMode("new")} style={{
                        padding: "6px 14px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 600,
                        background: clientMode === "new" ? `${accent}18` : "transparent",
                        color: clientMode === "new" ? accent : c.textSub,
                        border: `1px solid ${clientMode === "new" ? `${accent}44` : c.inputBorder}`
                      }}>{t.newClient}</div>
                    </div>
                    
                    {clientMode === "existing" ? (
                      <div style={{ position: "relative" }}>
                        <input className="input-field" placeholder={t.searchClients} value={clientSearch}
                          onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                          onFocus={() => setShowClientDropdown(true)}
                          onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                          style={{ fontSize: 12, marginBottom: 4 }} />
                        {showClientDropdown && clientList.length > 0 && (
                          <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 50, background: c.bg, border: "1px solid " + c.border, borderRadius: 12, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                            {clientList
                              .filter(cl => {
                                if (!clientSearch) return true;
                                const q = clientSearch.toLowerCase();
                                return (cl.first_name || "").toLowerCase().includes(q) || (cl.last_name || "").toLowerCase().includes(q) || (cl.email || "").toLowerCase().includes(q) || (cl.phone || "").includes(q);
                              })
                              .slice(0, 15)
                              .map((cl, idx) => (
                                <div key={cl.id || cl.email || idx} onClick={() => {
                                  setAddApptForm(f => ({
                                    ...f,
                                    client_name: `${cl.first_name || ""} ${cl.last_name || ""}`.trim(),
                                    client_email: cl.email || "",
                                    client_phone: cl.phone || ""
                                  }));
                                  setClientSearch(`${cl.first_name || ""} ${cl.last_name || ""}`.trim());
                                  setShowClientDropdown(false);
                                }} style={{
                                  padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid " + c.border,
                                  transition: "background 0.15s"
                                }} onMouseOver={e => e.currentTarget.style.background = c.bgCardHover} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{cl.first_name} {cl.last_name}</div>
                                  <div style={{ fontSize: 10, color: c.textLabel }}>{cl.email}{cl.phone ? ` · ${cl.phone}` : ""}</div>
                                </div>
                              ))}
                            {clientList.filter(cl => {
                              if (!clientSearch) return true;
                              const q = clientSearch.toLowerCase();
                              return (cl.first_name || "").toLowerCase().includes(q) || (cl.last_name || "").toLowerCase().includes(q) || (cl.email || "").toLowerCase().includes(q);
                            }).length === 0 && (
                              <div style={{ padding: "14px", textAlign: "center", fontSize: 11, color: c.textMuted }}>
                                {lang === "nl" ? "Geen klanten gevonden" : "No clients found"}
                                <div style={{ marginTop: 6 }}>
                                  <span onClick={() => setClientMode("new")} style={{ color: accent, cursor: "pointer", fontWeight: 600 }}>{t.newClient} →</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {addApptForm.client_email && (
                          <div style={{ background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 10, padding: "8px 12px", marginTop: 6, fontSize: 11 }}>
                            <div style={{ fontWeight: 500, color: c.text }}>{addApptForm.client_name}</div>
                            <div style={{ color: c.textLabel, fontSize: 10 }}>{addApptForm.client_email}{addApptForm.client_phone ? ` · ${addApptForm.client_phone}` : ""}</div>
                          </div>
                        )}
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
                    // Save client
                    const email = addApptForm.client_email.toLowerCase();
                    let clientId = null;
                    const { data: existing } = await supabase.from("clients").select("id").eq("email", email).single();
                    if (existing) { clientId = existing.id; }
                    else {
                      const nameParts = addApptForm.client_name.split(" ");
                      const { data: nc } = await supabase.from("clients").insert({ email, first_name: nameParts[0], last_name: nameParts.slice(1).join(" ") || "", phone: addApptForm.client_phone || null }).select("id").single();
                      if (nc) clientId = nc.id;
                    }
                    // Insert appointment
                    const apptData = {
                      owner_id: salonData.owner_id, service_id: svc?.id, client_id: clientId,
                      service_name: svcLabel || addApptForm.client_name,
                      service_price: price, service_duration: duration,
                      date: addApptForm.date, time: addApptForm.time,
                      client_name: addApptForm.client_name, client_email: email, client_phone: addApptForm.client_phone || null,
                      payment_method: "on-arrival", status: "confirmed", invoice_sent: false,
                      staff_id: staffMember?.id || null, staff_name: staffMember?.name || null
                    };
                    const { data: appt } = await supabase.from("appointments").insert(apptData).select("*").single();
                    if (appt) {
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
                    }
                    setAddApptDone(true);
                    setAddApptLoading(false);
                  }}>
                  {addApptLoading ? "..." : t.confirm}
                </button>
                <button className="btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => setShowAddAppt(false)}>{t.cancelEdit}</button>
              </>) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ marginBottom: 16 }}><NavIcon name="check" size={48} color="#86efac" /></div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 8 }}>{t.appointmentAdded}</div>
                  <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddAppt(false)}>{lang === "nl" ? "Sluiten" : "Close"}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Photo gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)}>
            <img src={gallery.photos[gallery.idx]?.url || gallery.photos[gallery.idx]} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {gallery.photos.map((p, i) => (
                <img key={p.id || i} src={p.url || p} onClick={e => { e.stopPropagation(); setGallery(g => ({...g, idx: i})); }}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `2px solid ${i === gallery.idx ? accent : "transparent"}`, opacity: i === gallery.idx ? 1 : 0.5, transition: "all 0.2s" }} />
              ))}
            </div>
          </div>
        )}

        {/* Client preview modal */}
        {showPreview && (
          <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(12px)", zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "20px 16px", overflowY: "auto" }}>
            <div style={{ width: "100%", maxWidth: 390, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: c.text, fontWeight: 300 }}>
                  {lang === "nl" ? "Zo zien klanten jouw pagina" : "This is what clients see"}
                </div>
                <div style={{ fontSize: 10, color: c.textLabel, marginTop: 3, letterSpacing: "0.06em" }}>vellu.cc/{salonData.id}</div>
              </div>
              <button className="btn-ghost" style={{ padding: "7px 14px", fontSize: 12 }} onClick={() => setShowPreview(false)}><NavIcon name="xmark" size={12} /> {lang === "nl" ? "Sluiten" : "Close"}</button>
            </div>
            <div style={{ width: "100%", maxWidth: 390, background: c.bg, borderRadius: 28, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
              <div style={{ background: c.bg, backgroundImage: `radial-gradient(ellipse 70% 35% at 50% -5%, ${accent}12 0%, transparent 55%)`, padding: "24px 22px 0", fontFamily: "'Jost',sans-serif", color: c.text }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 400, letterSpacing: "0.06em" }}>{salonData.name}</div>
                    <div style={{ fontSize: 10, color: c.textLabel, marginTop: 3 }}>{salonData.city}</div>
                  </div>
                  <div style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 100, padding: "5px 10px", fontSize: 10, color: c.textLabel }}>NL / EN</div>
                </div>
                <div style={{ display: "flex", gap: 5, marginBottom: 22 }}>
                  {[1,2,3,4].map(s => <div key={s} style={{ flex: 1, height: 2, borderRadius: 4, background: s === 1 ? accent : c.border }} />)}
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: 24, color: c.text, marginBottom: 6 }}>
                  {lang === "nl" ? "Kies een Behandeling" : "Select a Service"}
                </div>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 20 }}>
                  {lang === "nl" ? "Kies de behandeling die je wilt" : "Choose the treatment you'd like"}
                </div>
              </div>
              <div style={{ padding: "0 22px 28px", background: c.bg, fontFamily: "'Jost',sans-serif" }}>
                {salonData.services.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: c.textMuted, fontSize: 13 }}>
                    {lang === "nl" ? "Nog geen diensten toegevoegd" : "No services added yet"}
                  </div>
                ) : salonData.services.map(s => (
                  <div key={s.id} style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "17px 19px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14, color: c.text }}>{lang === "nl" ? s.name_nl : (s.name_en || s.name_nl)}</div>
                        <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3 }}>
                          {s.duration} min
                          {(s.photos || []).length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} foto's</span>}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>€{s.price}</div>
                    </div>
                    {(s.photos || []).length > 0 && (
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginTop: 12 }}>
                        {s.photos.map((p, i) => (
                          <img key={p.id || i} src={p.url || p} style={{ width: 68, height: 68, borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid " + c.border }} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ background: accent, color: c.btnOnDark, borderRadius: 100, padding: "15px", textAlign: "center", fontFamily: "'Jost',sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 6, opacity: 0.4 }}>
                  {lang === "nl" ? "Volgende →" : "Next →"}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: c.textMuted, textAlign: "center", letterSpacing: "0.04em" }}>
              {lang === "nl" ? "Dit is een preview — klanten kunnen hier niet boeken" : "This is a preview — clients cannot book here"}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── STAFF APP (team member view) ─────────────────────────────
function StaffApp({ staffUser, lang, setLang, onLogout }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const DAY = lang === "nl" ? DAY_NL : DAY_EN;
  const { staffMember, profile: salonProfile } = staffUser;
  const accent = salonProfile.accent_color || ACCENT;
  const { confirmState, confirm: showConfirm, handleYes: confirmYes, handleNo: confirmNo } = useConfirm();

  const [view, setView] = useState("dashboard");
  const [calDate, setCalDate] = useState(fmt(getToday()));
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [myStaff, setMyStaff] = useState(staffMember);
  const [saved, setSaved] = useState(false);
  const [editingWH, setEditingWH] = useState(false);
  const [whForm, setWhForm] = useState(staffMember.working_hours || {});
  const [invoiceForm, setInvoiceForm] = useState({
    address: staffMember.address || "",
    kvk_number: staffMember.kvk_number || "",
    btw_id: staffMember.btw_id || "",
    iban: staffMember.iban || "",
    invoice_prefix: staffMember.invoice_prefix || "INV",
    next_invoice_number: staffMember.next_invoice_number || 1
  });
  const [invoiceSaved, setInvoiceSaved] = useState(false);
  const [editingSvc, setEditingSvc] = useState(null);
  const [editSvcForm, setEditSvcForm] = useState({ name_nl: "", name_en: "", price: "", duration: "" });
  const [editingVar, setEditingVar] = useState(null);
  const [editVarForm, setEditVarForm] = useState({ name_nl: "", name_en: "", price: "", duration: "", description_nl: "" });
  const [gallery, setGallery] = useState(null);
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [addApptForm, setAddApptForm] = useState({ service_id: "", variant_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "" });
  const [addApptLoading, setAddApptLoading] = useState(false);
  const [addApptDone, setAddApptDone] = useState(false);
  const [newSvc, setNewSvc] = useState({ name_nl: "", name_en: "", price: "", duration: "60" });
  const [svcError, setSvcError] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: appts }, { data: svcs }] = await Promise.all([
          supabase.from("appointments").select("*").eq("owner_id", salonProfile.id).eq("staff_id", staffMember.id).gte("date", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]).order("date", { ascending: false }),
          supabase.from("services").select("*, service_variants(*), service_extras(*), service_photos(*)").eq("owner_id", salonProfile.id)
        ]);
        setAppointments(appts || []);
        const mySvcIds = staffMember.service_ids || [];
        const filtered = (svcs || []).filter(s => mySvcIds.length === 0 || mySvcIds.includes(s.id));
        setServices(filtered.map(s => ({
          ...s, name_nl: s.name_nl || s.name || "", name_en: s.name_en || "",
          variants: (s.service_variants || []).sort((a,b) => (a.position||0) - (b.position||0)),
          extras: s.service_extras || [],
          photos: (s.service_photos || []).map(p => ({ id: p.id, url: p.storage_path }))
        })));
      } catch (e) {
        console.error("Staff dashboard load error:", e);
      }
    };
    load();
  }, []);

  const activeAppts = appointments.filter(a => a.status !== "cancelled" && a.status !== "no_show");
  const todayAppts = activeAppts.filter(a => a.date === fmt(getToday()));
  const completedAppts = appointments.filter(a => a.status === "completed");
  const totalEarnings = completedAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
  const calAppts = appointments.filter(a => a.status !== "cancelled" && a.date === calDate);
  const days = getDays();

  const [processingApptId, setProcessingApptId] = useState(null);
  const markComplete = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
      setAppointments(a => a.map(x => x.id === id ? {...x, status: "completed"} : x));
    } finally { setProcessingApptId(null); }
  };
  const markNoShow = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      await supabase.from("appointments").update({ status: "no_show" }).eq("id", id);
      setAppointments(a => a.map(x => x.id === id ? {...x, status: "no_show"} : x));
    } finally { setProcessingApptId(null); }
  };
  const saveWorkingHours = async () => {
    await supabase.from("staff_members").update({ working_hours: whForm }).eq("id", staffMember.id);
    setMyStaff(s => ({...s, working_hours: whForm}));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const [staffPhotoUploading, setStaffPhotoUploading] = useState(null);

  const staffAddPhoto = async (serviceId, file) => {
    setStaffPhotoUploading(serviceId);
    const uploadFile = await compressImage(file);
    const fileName = `${salonProfile.id}/${serviceId}/${Date.now()}_${uploadFile.name}`;
    const { error: uploadError } = await supabase.storage.from("service-photos").upload(fileName, uploadFile, { cacheControl: "3600", upsert: false });
    if (uploadError) { console.error("Upload error:", uploadError); setStaffPhotoUploading(null); return; }
    const { data: { publicUrl } } = supabase.storage.from("service-photos").getPublicUrl(fileName);
    const { data: photoData, error: dbError } = await supabase.from("service_photos").insert({
      service_id: serviceId, owner_id: salonProfile.id, storage_path: publicUrl
    }).select().single();
    if (dbError) { console.error("DB error:", dbError); return; }
    setServices(svcs => svcs.map(s => s.id === serviceId ? {...s, photos: [...(s.photos || []), { id: photoData.id, url: publicUrl }]} : s));
    setStaffPhotoUploading(null);
  };

  const staffDeletePhoto = async (serviceId, photoId, photoUrl) => {
    await supabase.from("service_photos").delete().eq("id", photoId);
    const urlParts = photoUrl.split("/service-photos/");
    if (urlParts[1]) await supabase.storage.from("service-photos").remove([urlParts[1]]);
    setServices(svcs => svcs.map(s => s.id === serviceId ? {...s, photos: (s.photos||[]).filter(p => p.id !== photoId)} : s));
  };

  const staffSendInvoice = async (id) => {
    const a = appointments.find(x => x.id === id);
    if (a) {
      const invoiceNumber = `${invoiceForm.invoice_prefix || "INV"}-${String(invoiceForm.next_invoice_number || 1).padStart(4, "0")}`;
      await sendEmails("invoice", {
        client_name: a.client_name, client_email: a.client_email,
        service_name: a.service_name, date: a.date, price: a.service_price,
        salon_name: `${salonProfile.business_name} — ${myStaff.name}`,
        invoice_number: invoiceNumber,
        salon_address: invoiceForm.address || salonProfile.address || "",
        salon_kvk: invoiceForm.kvk_number || salonProfile.kvk_number || "",
        salon_btw: invoiceForm.btw_id || salonProfile.btw_id || "",
        salon_iban: invoiceForm.iban || salonProfile.iban || ""
      });
      await supabase.from("appointments").update({ invoice_sent: true }).eq("id", id);
      // Auto-increment invoice number
      const nextNum = (invoiceForm.next_invoice_number || 1) + 1;
      await supabase.from("staff_members").update({ next_invoice_number: nextNum }).eq("id", staffMember.id);
      setInvoiceForm(f => ({ ...f, next_invoice_number: nextNum }));
      setAppointments(prev => prev.map(ap => ap.id === id ? {...ap, invoice_sent: true} : ap));
    }
  };

  const ApptCard = ({ a }) => (
    <div className="appt-card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{a.client_name}</div>
          <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3 }}>{a.time} · {a.service_name}</div>
          <div style={{ fontSize: 10, color: c.textMuted }}>{a.client_email}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className={`badge badge-${a.status}`}>{a.status === "confirmed" ? (lang === "nl" ? "Bevestigd" : "Confirmed") : a.status === "completed" ? (lang === "nl" ? "Voltooid" : "Done") : a.status}</span>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent, marginTop: 2 }}>€{parseFloat(a.service_price || 0).toFixed(2)}</div>
        </div>
      </div>
      {a.status === "confirmed" && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "8px", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markComplete(a.id)}>{processingApptId === a.id ? "..." : <><NavIcon name="check" size={12} /> {lang === "nl" ? "Voltooid" : "Complete"}</>}</button>
          <button className="btn-ghost" style={{ fontSize: 10, padding: "8px 12px", color: "#f87171", borderColor: "rgba(248,113,113,0.2)", opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markNoShow(a.id)}>{processingApptId === a.id ? "..." : <><NavIcon name="xmark" size={10} color="#f87171" /> No-show</>}</button>
        </div>
      )}
    </div>
  );

  const navItems = [
    ["dashboard", "dashboard", t.dashboard],
    ["agenda", "agenda", t.agenda],
    ["facturen", "facturen", t.invoices],
    ["instellingen", "instellingen", t.settings]
  ];

  return (
    <Layout>
      <style>{makeCSS(accent, c)}</style>
      <ConfirmModal state={confirmState} onYes={confirmYes} onNo={confirmNo} lang={lang} />
      <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: c.bg, fontFamily: "'Jost',sans-serif", color: c.text }}>
        {/* Desktop sidebar */}
        {!isMobile && (
          <div style={{ width: 240, padding: "28px 20px", borderRight: "1px solid " + c.border, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, background: c.bg, zIndex: 50 }}>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.18em", marginBottom: 4 }}>vellu</div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: c.textMuted, marginBottom: 8 }}>{salonProfile.business_name}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: accent, marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: accent }}>{myStaff.name?.[0] || "?"}</div>
              {myStaff.name}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              {navItems.map(([k, icon, label]) => (
                <div key={k} className="nav-item" onClick={() => setView(k)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12,
                  background: view === k ? `${accent}12` : "transparent",
                  border: `1px solid ${view === k ? `${accent}22` : "transparent"}`,
                  cursor: "pointer", transition: "all 0.2s"
                }}>
                  <NavIcon name={icon} size={18} color={view === k ? accent : c.textLabel} />
                  <span style={{ fontSize: 13, fontWeight: view === k ? 600 : 400, color: view === k ? accent : c.textSub }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 20, borderTop: "1px solid " + c.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ThemeToggle /><LangToggle lang={lang} setLang={setLang} />
              </div>
              <button className="btn-ghost" style={{ width: "100%", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={onLogout}><NavIcon name="logout" size={14} color={c.textLabel} />{t.logout}</button>
            </div>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, marginLeft: isMobile ? 0 : 240, padding: isMobile ? "16px 18px 100px" : "30px 40px", maxWidth: isMobile ? "100%" : 800, overflow: "auto", WebkitOverflowScrolling: "touch" }}>
          {!isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300 }}>{view === "dashboard" ? t.dashboard : view === "agenda" ? t.agenda : view === "facturen" ? t.invoices : t.settings}</div>
                <div style={{ fontSize: 12, color: c.textSub }}>{t.staffWelcome}, {myStaff.name}</div>
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={`${t.staffWelcome}, ${myStaff.name}`}>{t.dashboard}</PTitle>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                <div className="stat-card">
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.today}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300, color: accent }}>{todayAppts.length}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{lang === "nl" ? "afspraken" : "appointments"}</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.totalEarnings}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300, color: accent }}>€{appointments.filter(a => a.status === "completed").reduce((s,a) => s + parseFloat(a.service_price||0), 0).toFixed(0)}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{lang === "nl" ? "totaal" : "total"}</div>
                </div>
              </div>
              <button className="btn-ghost" style={{ width: "100%", marginBottom: 16, fontSize: 11, borderStyle: "dashed", borderColor: `${accent}33`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ service_id: "", variant_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "" }); }}>
                <NavIcon name="plus" size={14} color={accent} /> {t.addAppointment}
              </button>
              <SL>{t.todayAppts}</SL>
              {todayAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "30px 0", color: c.textMuted, fontSize: 12 }}>{t.noTodayAppts}</div>
                : todayAppts.map(a => <ApptCard key={a.id} a={a} />)
              }
            </div>
          )}

          {/* AGENDA */}
          {view === "agenda" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.myAgenda}>{t.agenda}</PTitle>}
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                {days.slice(0,7).map((d, i) => {
                  const ds = fmt(d); const isSel = calDate === ds;
                  const has = appointments.filter(a => a.status !== "cancelled" && a.date === ds).length > 0;
                  return (
                    <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} onClick={() => setCalDate(ds)}>
                      <span style={{ fontSize: 10, color: isSel ? c.btnOnDark : c.textLabel }}>{DAY[d.getDay()]}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? c.btnOnDark : c.text, marginTop: 2 }}>{d.getDate()}</span>
                      {has && !isSel && <div style={{ width: 4, height: 4, borderRadius: "50%", background: accent, marginTop: 2 }} />}
                    </div>
                  );
                })}
              </div>
              {calAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: c.textMuted, fontSize: 12 }}>{t.noTodayAppts}</div>
                : calAppts.map(a => <ApptCard key={a.id} a={a} />)
              }
            </div>
          )}

          {/* FACTUREN */}
          {view === "facturen" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.completedTreatments}>{t.invoices}</PTitle>}
              {completedAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: c.textMuted, fontSize: 12 }}>{lang === "nl" ? "Nog geen voltooide afspraken" : "No completed appointments yet"}</div>
                : completedAppts.map(a => (
                  <div key={a.id} className="appt-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{a.client_name}</div>
                      <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3 }}>{a.date} · {a.service_name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>€{parseFloat(a.service_price || 0).toFixed(2)}</div>
                      <div style={{ marginTop: 5 }}>
                        {a.invoice_sent
                          ? <span style={{ fontSize: 10, color: "#86efac", display: "inline-flex", alignItems: "center", gap: 3 }}><NavIcon name="check" size={10} color="#86efac" /> {t.sent}</span>
                          : <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => staffSendInvoice(a.id)}>{t.send}</button>
                        }
                      </div>
                    </div>
                  </div>
                ))
              }
              {completedAppts.length > 0 && (
                <div style={{ marginTop: 14, background: `${accent}08`, border: `1px solid ${accent}1a`, borderRadius: 20, padding: "18px 22px" }}>
                  <SL>{t.totalEarnings}</SL>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 38, fontWeight: 300, color: accent }}>€{totalEarnings.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{completedAppts.length} {t.treatments}</div>
                </div>
              )}
            </div>
          )}

          {/* SETTINGS */}
          {view === "instellingen" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.mySettings}>{t.settings}</PTitle>}
              
              {/* Working hours */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 14 }}>
                <SL>{t.myWorkingHours}</SL>
                {[0,1,2,3,4,5,6].map(day => {
                  const DAY_FULL = lang === "nl" ? DAY_FULL_NL : DAY_FULL_EN;
                  const staffDay = whForm[day];
                  const isOn = staffDay ? !staffDay.closed : true;
                  const openTime = staffDay?.open || "09:00";
                  const closeTime = staffDay?.close || "17:30";
                  return (
                    <div key={day} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "4px 0" }}>
                      <div style={{ width: 28, fontSize: 10, fontWeight: 500, color: c.textSub, flexShrink: 0 }}>{DAY_FULL[day].slice(0,2)}</div>
                      <div onClick={() => {
                        setWhForm(wh => {
                          const next = {...wh};
                          if (isOn) next[day] = { closed: true };
                          else next[day] = { closed: false, open: openTime, close: closeTime };
                          return next;
                        });
                      }} style={{ width: 28, height: 16, borderRadius: 8, background: isOn ? accent : c.toggleInactive, cursor: "pointer", position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
                        <div style={{ position: "absolute", top: 2, left: isOn ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                      </div>
                      {isOn ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <select value={openTime} onChange={e => setWhForm(wh => ({...wh, [day]: {...wh[day], closed: false, open: e.target.value}}))} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 6, padding: "3px 4px", color: c.text, fontSize: 10, fontFamily: "'Jost',sans-serif" }}>
                            {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                          </select>
                          <span style={{ fontSize: 9, color: c.textMuted }}>—</span>
                          <select value={closeTime} onChange={e => setWhForm(wh => ({...wh, [day]: {...wh[day], closed: false, close: e.target.value}}))} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 6, padding: "3px 4px", color: c.text, fontSize: 10, fontFamily: "'Jost',sans-serif" }}>
                            {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                          </select>
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, color: c.textMuted, fontStyle: "italic" }}>{t.closed}</span>
                      )}
                    </div>
                  );
                })}
                <button className="btn-primary" style={{ marginTop: 12 }} onClick={saveWorkingHours}>{saved ? <NavIcon name="check" size={12} /> : t.saveChanges}</button>
              </div>

              {/* Invoice details */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18, marginBottom: 14 }}>
                <SL>{t.invoiceDetails}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 10 }}>{t.invoiceSettings}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input className="input-field" placeholder={t.address} value={invoiceForm.address} onChange={e => setInvoiceForm(f => ({...f, address: e.target.value}))} style={{ fontSize: 12 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input className="input-field" placeholder={t.kvkNumber} value={invoiceForm.kvk_number} onChange={e => setInvoiceForm(f => ({...f, kvk_number: e.target.value}))} style={{ fontSize: 12 }} />
                    <input className="input-field" placeholder={t.btwId} value={invoiceForm.btw_id} onChange={e => setInvoiceForm(f => ({...f, btw_id: e.target.value}))} style={{ fontSize: 12 }} />
                  </div>
                  <input className="input-field" placeholder={t.ibanNumber} value={invoiceForm.iban} onChange={e => setInvoiceForm(f => ({...f, iban: e.target.value}))} style={{ fontSize: 12 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input className="input-field" placeholder={t.invoicePrefix} value={invoiceForm.invoice_prefix} onChange={e => setInvoiceForm(f => ({...f, invoice_prefix: e.target.value}))} style={{ fontSize: 12 }} />
                    <div style={{ fontSize: 11, color: c.textMuted, display: "flex", alignItems: "center" }}>
                      {lang === "nl" ? "Volgende" : "Next"}: {invoiceForm.invoice_prefix}-{String(invoiceForm.next_invoice_number || 1).padStart(4, "0")}
                    </div>
                  </div>
                </div>
                <button className="btn-primary" style={{ marginTop: 12 }} onClick={async () => {
                  await supabase.from("staff_members").update({
                    address: invoiceForm.address || null,
                    kvk_number: invoiceForm.kvk_number || null,
                    btw_id: invoiceForm.btw_id || null,
                    iban: invoiceForm.iban || null,
                    invoice_prefix: invoiceForm.invoice_prefix || "INV",
                    next_invoice_number: invoiceForm.next_invoice_number || 1
                  }).eq("id", staffMember.id);
                  setInvoiceSaved(true); setTimeout(() => setInvoiceSaved(false), 2000);
                }}>{invoiceSaved ? <NavIcon name="check" size={12} /> : t.saveChanges}</button>
              </div>

              {/* My services (full editing) */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18 }}>
                <SL>{t.myServices}</SL>
                {services.length === 0 && <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noServices}</div>}
                {services.map(s => (
                  <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid " + c.border }}>
                    {/* Service header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editingSvc === s.id ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                              <input className="input-field" value={editSvcForm.name_nl} onChange={e => setEditSvcForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder="Naam (NL)" />
                              <input className="input-field" value={editSvcForm.name_en} onChange={e => setEditSvcForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder="Name (EN)" />
                              <input className="input-field" type="number" value={editSvcForm.price} onChange={e => setEditSvcForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder="€" />
                              <input className="input-field" type="number" value={editSvcForm.duration} onChange={e => setEditSvcForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 10, padding: "6px 8px" }} placeholder="min" />
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="btn-ghost" style={{ flex: 1, fontSize: 9, padding: "4px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                await supabase.from("services").update({ name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, name: editSvcForm.name_nl, price: parseFloat(editSvcForm.price), duration: parseInt(editSvcForm.duration) }).eq("id", s.id);
                                setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, price: editSvcForm.price, duration: editSvcForm.duration} : sv));
                                setEditingSvc(null);
                              }}><NavIcon name="check" size={12} /></button>
                              <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => setEditingSvc(null)}><NavIcon name="xmark" size={12} /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{lang === "nl" ? s.name_nl : s.name_en}</div>
                            <div style={{ fontSize: 11, color: c.textLabel }}>€{s.price} · {s.duration} {t.min}</div>
                          </>
                        )}
                      </div>
                      {editingSvc !== s.id && (
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: accent, borderColor: `${accent}33` }}
                            onClick={() => { setEditingSvc(s.id); setEditSvcForm({ name_nl: s.name_nl, name_en: s.name_en || "", price: s.price, duration: s.duration }); }}><NavIcon name="edit" size={12} /></button>
                          <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                            onClick={async () => { if (!await showConfirm(lang === "nl" ? "Dienst verwijderen?" : "Delete service?")) return; await supabase.from("services").delete().eq("id", s.id); setServices(svcs => svcs.filter(sv => sv.id !== s.id)); }}><NavIcon name="xmark" size={12} /></button>
                        </div>
                      )}
                    </div>

                    {/* Variants */}
                    <div style={{ marginTop: 6, marginLeft: 10, paddingLeft: 8, borderLeft: `2px solid ${accent}22` }}>
                      {(s.variants || []).map(v => (
                        <div key={v.id} style={{ marginBottom: 3, fontSize: 10 }}>
                          {editingVar === v.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                                <input className="input-field" value={editVarForm.name_nl} onChange={e => setEditVarForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 9, padding: "4px 6px" }} />
                                <input className="input-field" type="number" value={editVarForm.price} onChange={e => setEditVarForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 9, padding: "4px 6px" }} placeholder="€" />
                              </div>
                              <div style={{ display: "flex", gap: 3 }}>
                                <button className="btn-ghost" style={{ flex: 1, fontSize: 8, padding: "3px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                  await supabase.from("service_variants").update({ name_nl: editVarForm.name_nl, name_en: editVarForm.name_en || null, price: parseFloat(editVarForm.price), duration: parseInt(editVarForm.duration) }).eq("id", v.id);
                                  setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, variants: sv.variants.map(vr => vr.id === v.id ? {...vr, ...editVarForm, price: parseFloat(editVarForm.price), duration: parseInt(editVarForm.duration)} : vr)} : sv));
                                  setEditingVar(null);
                                }}><NavIcon name="check" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 8, padding: "3px 6px" }} onClick={() => setEditingVar(null)}><NavIcon name="xmark" size={12} /></button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ color: c.textMuted }}>{v.name_nl} — €{v.price} · {v.duration} min</span>
                              <div style={{ display: "flex", gap: 3 }}>
                                <button className="btn-ghost" style={{ fontSize: 8, padding: "2px 6px", color: accent, borderColor: `${accent}33` }}
                                  onClick={() => { setEditingVar(v.id); setEditVarForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "" }); }}><NavIcon name="edit" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 8, padding: "2px 6px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                                  onClick={async () => { await supabase.from("service_variants").delete().eq("id", v.id); setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, variants: sv.variants.filter(vr => vr.id !== v.id)} : sv)); }}>×</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <VariantAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(variant) => {
                        setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, variants: [...(sv.variants||[]), variant]} : sv));
                      }} />
                    </div>

                    {/* Extras */}
                    <div style={{ marginTop: 4, marginLeft: 10, paddingLeft: 8, borderLeft: `2px solid ${accent}22` }}>
                      {(s.extras || []).map(e => (
                        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2, fontSize: 10 }}>
                          <span style={{ color: c.textMuted }}>{e.name_nl} +€{e.price}</span>
                          <button className="btn-ghost" style={{ fontSize: 8, padding: "2px 6px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                            onClick={async () => { await supabase.from("service_extras").delete().eq("id", e.id); setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, extras: sv.extras.filter(ex => ex.id !== e.id)} : sv)); }}>×</button>
                        </div>
                      ))}
                      <ExtraAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(extra) => {
                        setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, extras: [...(sv.extras||[]), extra]} : sv));
                      }} />
                    </div>

                    {/* Photos */}
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {(s.photos || []).map(p => (
                        <div key={p.id} style={{ position: "relative", width: 50, height: 50, borderRadius: 8, overflow: "hidden" }}>
                          <img src={p.url} alt={lang === "nl" ? "Service foto" : "Service photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <button onClick={() => staffDeletePhoto(s.id, p.id, p.url)} style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      ))}
                      <label style={{ width: 50, height: 50, borderRadius: 8, border: `1px dashed ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                        <span style={{ fontSize: 16, color: `${accent}66` }}>+</span>
                        <input accept="image/*" multiple type="file" style={{ display: "none" }}
                          onChange={e => Array.from(e.target.files).forEach(f => staffAddPhoto(s.id, f))} />
                      </label>
                    </div>
                  </div>
                ))}

                {/* Add new service */}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + c.border }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textMuted, marginBottom: 8 }}>{lang === "nl" ? "Nieuwe dienst" : "New service"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <input className="input-field" placeholder={lang === "nl" ? "Dienst naam (NL)" : "Service name (NL)"} value={newSvc.name_nl} onChange={e => setNewSvc(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                    <input className="input-field" placeholder={lang === "nl" ? "Dienst naam (EN)" : "Service name (EN)"} value={newSvc.name_en} onChange={e => setNewSvc(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                    <input className="input-field" placeholder={`${lang === "nl" ? "Prijs" : "Price"} (€)`} type="number" value={newSvc.price} onChange={e => setNewSvc(f => ({...f, price: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                    <input className="input-field" placeholder={`${lang === "nl" ? "Duur" : "Duration"} (min)`} type="number" value={newSvc.duration} onChange={e => setNewSvc(f => ({...f, duration: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                  </div>
                  {svcError && <div style={{ fontSize: 10, color: "#f87171", marginTop: 4 }}>{svcError}</div>}
                  <button className="btn-ghost" style={{ width: "100%", marginTop: 8, fontSize: 10, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
                    onClick={async () => {
                      if (!newSvc.name_nl || !newSvc.price) { setSvcError(lang === "nl" ? "Vul naam en prijs in" : "Fill in name and price"); return; }
                      setSvcError("");
                      const { data, error } = await supabase.from("services").insert({
                        owner_id: salonProfile.id, name: newSvc.name_nl, name_nl: newSvc.name_nl,
                        name_en: newSvc.name_en || null, price: parseFloat(newSvc.price), duration: parseInt(newSvc.duration)
                      }).select().single();
                      if (!error && data) {
                        setServices(svcs => [...svcs, { ...data, name_nl: data.name_nl || data.name, name_en: data.name_en || "", variants: [], extras: [], photos: [] }]);
                        setNewSvc({ name_nl: "", name_en: "", price: "", duration: "60" });
                      }
                    }}>+ {lang === "nl" ? "Behandeling toevoegen" : "Add service"}</button>
                </div>
              </div>

              <button className="btn-ghost" style={{ width: "100%", marginTop: 16, display: isMobile ? "block" : "none" }} onClick={onLogout}>{t.logout}</button>
            </div>
          )}
        </div>

        {/* Add Appointment Modal */}
        {showAddAppt && (
          <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(12px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowAddAppt(false)}>
            <div style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 24, padding: 28, maxWidth: 460, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              {!addApptDone ? (<>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ marginBottom: 10 }}><NavIcon name="calendar" size={32} color={accent} /></div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300 }}>{t.addAppointment}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <SL>{t.selectServiceFor}</SL>
                    <select className="input-field" value={addApptForm.service_id} onChange={e => setAddApptForm(f => ({...f, service_id: e.target.value, variant_id: ""}))} style={{ fontSize: 12 }}>
                      <option value="" style={{ background: c.selectBg }}>—</option>
                      {services.map(s => <option key={s.id} value={s.id} style={{ background: c.selectBg }}>{lang === "nl" ? s.name_nl : s.name_en} — €{s.price}</option>)}
                    </select>
                  </div>
                  {(() => {
                    const selSvc = services.find(s => s.id === addApptForm.service_id);
                    if (!selSvc?.variants?.length) return null;
                    return (
                      <div>
                        <SL>{lang === "nl" ? "Variant" : "Variant"}</SL>
                        <select className="input-field" value={addApptForm.variant_id || ""} onChange={e => setAddApptForm(f => ({...f, variant_id: e.target.value}))} style={{ fontSize: 12 }}>
                          <option value="" style={{ background: c.selectBg }}>—</option>
                          {selSvc.variants.map(v => <option key={v.id} value={v.id} style={{ background: c.selectBg }}>{v.name_nl} — €{v.price}</option>)}
                        </select>
                      </div>
                    );
                  })()}
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input className="input-field" placeholder={t.name} value={addApptForm.client_name} onChange={e => setAddApptForm(f => ({...f, client_name: e.target.value}))} style={{ fontSize: 12 }} />
                      <input className="input-field" placeholder={t.email} type="email" value={addApptForm.client_email} onChange={e => setAddApptForm(f => ({...f, client_email: e.target.value}))} style={{ fontSize: 12 }} />
                      <input className="input-field" placeholder={`${t.phone} (${t.optional})`} value={addApptForm.client_phone} onChange={e => setAddApptForm(f => ({...f, client_phone: e.target.value}))} style={{ fontSize: 12 }} />
                    </div>
                  </div>
                </div>
                <button className="btn-primary" style={{ marginTop: 16 }} disabled={addApptLoading || !addApptForm.service_id || !addApptForm.date || !addApptForm.time || !addApptForm.client_name || !addApptForm.client_email}
                  onClick={async () => {
                    setAddApptLoading(true);
                    const svc = services.find(s => s.id === addApptForm.service_id);
                    const variant = svc?.variants?.find(v => v.id === addApptForm.variant_id);
                    const svcLabel = svc ? (lang === "nl" ? svc.name_nl : svc.name_en) + (variant ? " — " + variant.name_nl : "") + ` (${myStaff.name})` : "";
                    const price = variant ? variant.price : (svc?.price || 0);
                    const duration = variant ? variant.duration : (svc?.duration || 60);
                    const email = addApptForm.client_email.toLowerCase();
                    let clientId = null;
                    const { data: existing } = await supabase.from("clients").select("id").eq("email", email).single();
                    if (existing) clientId = existing.id;
                    else {
                      const nameParts = addApptForm.client_name.split(" ");
                      const { data: nc } = await supabase.from("clients").insert({ email, first_name: nameParts[0], last_name: nameParts.slice(1).join(" ") || "", phone: addApptForm.client_phone || null }).select("id").single();
                      if (nc) clientId = nc.id;
                    }
                    const apptData = {
                      owner_id: salonProfile.id, service_id: svc?.id, client_id: clientId,
                      service_name: svcLabel, service_price: price, service_duration: duration,
                      date: addApptForm.date, time: addApptForm.time,
                      client_name: addApptForm.client_name, client_email: email, client_phone: addApptForm.client_phone || null,
                      payment_method: "on-arrival", status: "confirmed", invoice_sent: false,
                      staff_id: staffMember.id, staff_name: myStaff.name
                    };
                    const { data: appt } = await supabase.from("appointments").insert(apptData).select("*").single();
                    if (appt) {
                      setAppointments(a => [appt, ...a]);
                      await sendEmails("booking_confirmation", {
                        client_name: addApptForm.client_name, client_email: email,
                        service_name: svcLabel, date: addApptForm.date, time: addApptForm.time,
                        payment: "on-arrival", price, salon_name: salonProfile.business_name, owner_email: null
                      });
                      // Notify owner about new booking
                      await sendEmails("booking_notification", {
                        owner_email: salonProfile.email || null, staff_emails: [],
                        client_name: addApptForm.client_name, client_phone: addApptForm.client_phone || null,
                        service_name: svcLabel, date: addApptForm.date, time: addApptForm.time,
                        price, salon_name: salonProfile.business_name
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
                  <div style={{ marginBottom: 16 }}><NavIcon name="check" size={48} color="#86efac" /></div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 8 }}>{t.appointmentAdded}</div>
                  <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddAppt(false)}>{lang === "nl" ? "Sluiten" : "Close"}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile bottom nav */}
        {isMobile && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: c.bg, borderTop: "1px solid " + c.border, display: "flex", justifyContent: "space-around", paddingTop: 8, paddingBottom: "max(8px, env(safe-area-inset-bottom))", zIndex: 100 }}>
            {navItems.map(([k, icon, label]) => (
              <div key={k} className="nav-item" onClick={() => setView(k)} style={{ gap: 3 }}>
                <NavIcon name={icon} size={18} color={view === k ? accent : c.textMuted} />
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: view === k ? accent : c.textMuted, transition: "color 0.2s", whiteSpace: "nowrap" }}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── OWNER ENTRY PAGE (vellu.cc/owner) ───────────────────────
function OwnerEntryPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const [owner, setOwner] = useState(null);
  const [staffUser, setStaffUser] = useState(null); // { staffMember, salonData }
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // FIRST check if user is a staff member (before profile check)
        const { data: staffMember } = await supabase.from("staff_members").select("*").eq("user_id", session.user.id).single();
        if (staffMember) {
          const { data: salonProfile } = await supabase.from("profiles").select("*").eq("id", staffMember.owner_id).single();
          if (salonProfile) {
            setStaffUser({ staffMember, profile: salonProfile, email: session.user.email });
            setLoading(false);
            return;
          }
        }
        // Then check if user is an owner
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
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
      setLoading(false);
    };
    checkSession();
  }, []);

  const handleLogin = async (u) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Check staff FIRST
      const { data: staffMember } = await supabase.from("staff_members").select("*").eq("user_id", session.user.id).single();
      if (staffMember) {
        const { data: salonProfile } = await supabase.from("profiles").select("*").eq("id", staffMember.owner_id).single();
        if (salonProfile) {
          setStaffUser({ staffMember, profile: salonProfile, email: session.user.email });
          return;
        }
      }
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

  // Staff member view
  if (staffUser) {
    return <StaffApp staffUser={staffUser} lang={lang} setLang={setLang} onLogout={handleLogout} />;
  }

  // Check if plan is active
  const hasPlan = owner?.plan && (!owner.plan_expires_at || new Date(owner.plan_expires_at) > new Date());

  if (owner && !hasPlan) {
    return <PlanSelection user={owner} lang={lang} setLang={setLang} onLogout={handleLogout} />;
  }

  if (owner) {
    return <OwnerApp user={owner} lang={lang} setLang={setLang} salons={{}} onSalonUpdate={() => {}} onLogout={handleLogout} />;
  }

  return <OwnerAuth lang={lang} setLang={setLang} onBack={() => navigate("/")} onLogin={handleLogin} />;
}

// ─── SALON ROUTE WRAPPER ─────────────────────────────────────
function SalonRouteWrapper({ lang, setLang }) {
  const { colors: c } = useTheme();
  const { slug } = useParams();
  // Reserved routes go to main app
  if (slug === "owner" || slug === "login" || slug === "admin" || slug === "privacy" || slug === "terms" || slug === "contact" || slug === "dpa") {
    return <AppInner />;
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
        accent: data.accent_color || "#c9a96e",
        owner_email: data.email,
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
        discount_codes: data.discount_codes || [],
        day_overrides: data.day_overrides || {},
        min_advance_hours: data.min_advance_hours || 0,
        max_advance_days: data.max_advance_days || 60,
        address: data.address || "",
        kvk_number: data.kvk_number || "",
        btw_id: data.btw_id || "",
        iban: data.iban || "",
        services: (data.services || []).map(s => ({
          ...s,
          name_nl: s.name_nl || s.name || "",
          name_en: s.name_en || s.name || "",
          photos: (s.service_photos || []).map(p => ({ id: p.id, url: p.storage_path })),
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
      <style>{makeCSS(ACCENT, c)}</style>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>{lang === "nl" ? "Salon niet gevonden" : "Salon not found"}</div>
      <div style={{ fontSize: 12, color: c.textLabel }}>vellu.cc/{slug} {lang === "nl" ? "bestaat niet" : "does not exist"}</div>
      <button className="btn-ghost" onClick={() => navigate("/")}>← {lang === "nl" ? "Terug naar home" : "Back to home"}</button>
    </div>
  );

  return <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => navigate("/")} reviewMode={new URLSearchParams(window.location.search).get("review") === "true"} reviewEmail={new URLSearchParams(window.location.search).get("email") || ""} />;
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
      const { data: tokenData, error } = await supabase
        .from("cancellation_tokens")
        .select("*, appointments(*)")
        .eq("token", token)
        .single();
      
      if (error || !tokenData) {
        setStatus("error");
        return;
      }
      
      if (tokenData.used) {
        setStatus("cancelled");
        return;
      }
      
      if (new Date(tokenData.expires_at) < new Date()) {
        setStatus("expired");
        return;
      }
      
      if (tokenData.appointments?.status === "cancelled") {
        setStatus("cancelled");
        return;
      }
      
      setAppointment(tokenData.appointments);
      setStatus("confirm");
    };
    checkToken();
  }, [token]);

  const handleCancel = async () => {
    try {
      const { error: apptError } = await supabase.from("appointments").update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || null
      }).eq("id", appointment.id);

      if (apptError) throw apptError;

      await supabase.from("cancellation_tokens").update({ used: true }).eq("token", token);

      await sendEmails("booking_cancelled", {
        client_name: appointment.client_name,
        client_email: appointment.client_email,
        service_name: appointment.service_name,
        date: appointment.date,
        time: appointment.time
      });

      // Notify owner + staff about cancellation
      const notifyEmails = [];
      let salonName = "";
      if (appointment.owner_id) {
        const { data: ownerProfile } = await supabase.from("profiles").select("email, business_name").eq("id", appointment.owner_id).single();
        if (ownerProfile?.email) notifyEmails.push(ownerProfile.email);
        if (ownerProfile?.business_name) salonName = ownerProfile.business_name;
      }
      if (appointment.staff_id) {
        const { data: staffData } = await supabase.from("staff_members").select("email").eq("id", appointment.staff_id).single();
        if (staffData?.email) notifyEmails.push(staffData.email);
      }
      if (notifyEmails.length > 0) {
        await sendEmails("booking_notification", {
          owner_email: notifyEmails[0] || null,
          staff_emails: notifyEmails.slice(1),
          client_name: appointment.client_name, client_phone: null,
          service_name: `GEANNULEERD: ${appointment.service_name}`,
          date: appointment.date, time: appointment.time,
          price: appointment.service_price || 0, salon_name: salonName
        });
      }

      // Delete Google Calendar event if it exists
      if (appointment.google_event_id && appointment.owner_id) {
        supabase.functions.invoke("google-calendar", {
          body: { action: "delete", owner_id: appointment.owner_id, event_id: appointment.google_event_id }
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
      <style>{makeCSS(ACCENT, c)}</style>
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
              {lang === "nl" ? "Terug" : "Back"}
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
        const hasPlan = owner?.plan && (!owner.plan_expires_at || new Date(owner.plan_expires_at) > new Date());
        if (!hasPlan) return <PlanSelection user={owner} lang={lang} setLang={setLang} onLogout={async () => { await supabase.auth.signOut(); setOwner(null); setScreen("landing"); }} />;
        return <OwnerApp user={owner} lang={lang} setLang={setLang} salons={salons} onSalonUpdate={updateSalon} onLogout={async () => { await supabase.auth.signOut(); setOwner(null); setScreen("landing"); }} />;
      })()}
    </>
  );
}

// ─── PRIVACY POLICY ──────────────────────────────────────────
function PrivacyPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const content = lang === "nl" ? {
    title: "Privacybeleid",
    updated: "Laatst bijgewerkt: maart 2026",
    sections: [
      ["Wie zijn wij?", "Vellu is een online boekingsplatform voor beautysalons. Wij verwerken persoonsgegevens namens de salons die ons platform gebruiken."],
      ["Welke gegevens verzamelen wij?", "Bij het boeken van een afspraak: naam, e-mailadres, telefoonnummer (optioneel). Bij het aanmaken van een salonaccount: bedrijfsnaam, e-mailadres, wachtwoord, vestigingsgegevens."],
      ["Waarvoor gebruiken wij je gegevens?", "Het verwerken en bevestigen van boekingen, het versturen van herinneringen en follow-up emails, het beheren van je salonaccount en het verbeteren van onze dienstverlening."],
      ["Hoe lang bewaren wij je gegevens?", "Boekingsgegevens worden bewaard zolang het salonaccount actief is. Je kunt op elk moment verzoeken om verwijdering van je gegevens door contact met ons op te nemen."],
      ["Delen wij je gegevens?", "Wij delen je gegevens alleen met: Supabase (database hosting), Resend (email verzending), Vercel (website hosting). Wij verkopen nooit je gegevens aan derden."],
      ["Cookies", "Wij gebruiken alleen functionele cookies die noodzakelijk zijn voor het functioneren van het platform (inlogsessie, taalvoorkeur, thema). Wij gebruiken geen tracking cookies of analytics van derden."],
      ["Je rechten", "Je hebt het recht op inzage, correctie en verwijdering van je persoonsgegevens. Neem contact op via het e-mailadres van je salon of via ons platform."],
      ["Contact", "Voor vragen over dit privacybeleid kun je contact opnemen via het platform."]
    ]
  } : {
    title: "Privacy Policy",
    updated: "Last updated: March 2026",
    sections: [
      ["Who are we?", "Vellu is an online booking platform for beauty salons. We process personal data on behalf of the salons that use our platform."],
      ["What data do we collect?", "When booking an appointment: name, email address, phone number (optional). When creating a salon account: business name, email address, password, location details."],
      ["What do we use your data for?", "Processing and confirming bookings, sending reminders and follow-up emails, managing your salon account, and improving our services."],
      ["How long do we store your data?", "Booking data is stored as long as the salon account is active. You can request deletion of your data at any time by contacting us."],
      ["Do we share your data?", "We only share your data with: Supabase (database hosting), Resend (email delivery), Vercel (website hosting). We never sell your data to third parties."],
      ["Cookies", "We only use functional cookies necessary for the platform to work (login session, language preference, theme). We do not use tracking cookies or third-party analytics."],
      ["Your rights", "You have the right to access, correct, and delete your personal data. Contact us via your salon's email address or through our platform."],
      ["Contact", "For questions about this privacy policy, you can reach us through the platform."]
    ]
  };

  return (
    <Layout>
      <style>{makeCSS(ACCENT, c)}</style>
      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate(-1)}>← {lang === "nl" ? "Terug" : "Back"}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{content.title}</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 32 }}>{content.updated}</div>
          {content.sections.map(([title, body], i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

// ─── TERMS OF SERVICE ────────────────────────────────────────
function TermsPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const content = lang === "nl" ? {
    title: "Algemene Voorwaarden",
    updated: "Laatst bijgewerkt: maart 2026",
    sections: [
      ["1. Aanvaarding van de voorwaarden", "Door gebruik te maken van het Vellu-platform (vellu.cc) ga je akkoord met deze Algemene Voorwaarden. Als je niet akkoord gaat, verzoeken wij je het platform niet te gebruiken. Vellu behoudt zich het recht voor deze voorwaarden op elk moment te wijzigen. Wijzigingen worden via het platform gecommuniceerd."],
      ["2. Beschrijving van de dienst", "Vellu is een online boekingsplatform voor beautyprofessionals in Nederland, waaronder nagelsalons, wimperspecialisten, kappers en schoonheidsspecialisten. Het platform biedt saloneigenaren een eigen boekingspagina (vellu.cc/jouw-naam), agendabeheer, teamaccounts, e-mailnotificaties en een klantbeheersysteem. Vellu werkt met een vast maandelijks abonnement zonder commissie op boekingen."],
      ["3. Accountregistratie", "Om het platform te gebruiken als saloneigenaar dien je een account aan te maken met een geldig e-mailadres en wachtwoord. Je bent verantwoordelijk voor het vertrouwelijk houden van je inloggegevens en voor alle activiteiten die onder je account plaatsvinden. Vellu mag accounts opschorten of beëindigen bij vermoeden van misbruik of schending van deze voorwaarden."],
      ["4. Abonnementen en betaling", "Vellu biedt twee abonnementsvormen: Starter (€19/maand) en Professional (€39/maand). Beide plannen hanteren 0% commissie op boekingen — je betaalt uitsluitend het vaste maandbedrag. Abonnementen worden maandelijks gefactureerd. Je kunt je abonnement op elk moment opzeggen; het blijft actief tot het einde van de betaalde periode. Vellu behoudt zich het recht voor prijzen te wijzigen, met een kennisgeving van minimaal 30 dagen."],
      ["5. Verplichtingen van de saloneigenaar", "Als saloneigenaar ben je verantwoordelijk voor: het correct en actueel houden van je salongegevens, diensten en prijzen; het nakomen van afspraken die via het platform worden geboekt; het voldoen aan alle toepasselijke wet- en regelgeving met betrekking tot je bedrijfsvoering, waaronder de AVG (GDPR) voor het verwerken van klantgegevens; het correct vermelden van je KVK-nummer, BTW-id en overige bedrijfsgegevens indien van toepassing."],
      ["6. Klanten en eindgebruikers", "Klanten die een afspraak boeken via Vellu gaan een overeenkomst aan met de betreffende salon, niet met Vellu. Vellu treedt uitsluitend op als bemiddelaar en is geen partij bij de behandelovereenkomst. Klanten ontvangen een bevestigingsmail met de mogelijkheid om de afspraak te annuleren via een unieke link. Het annuleringsbeleid wordt bepaald door de individuele salon."],
      ["7. Intellectueel eigendom", "Alle rechten op het Vellu-platform, inclusief de software, het ontwerp, de logo's en de content, berusten bij Vellu. Saloneigenaren behouden de rechten op hun eigen content, zoals foto's, beschrijvingen en logo's die zij uploaden. Door content te uploaden verleen je Vellu een beperkte licentie om deze content weer te geven op jouw boekingspagina."],
      ["8. Privacy en gegevensverwerking", "Vellu verwerkt persoonsgegevens in overeenstemming met de Algemene Verordening Gegevensbescherming (AVG). Zie ons Privacybeleid op vellu.cc/privacy voor volledige informatie over hoe wij gegevens verzamelen, gebruiken en beschermen. Vellu treedt op als verwerker namens de saloneigenaar, die de verwerkingsverantwoordelijke is voor de gegevens van zijn of haar klanten."],
      ["9. Beschikbaarheid", "Vellu streeft naar een zo hoog mogelijke beschikbaarheid van het platform, maar kan geen 100% uptime garanderen. Vellu is niet aansprakelijk voor schade als gevolg van tijdelijke onbeschikbaarheid, storingen of onderhoud. Gepland onderhoud wordt waar mogelijk vooraf gecommuniceerd."],
      ["10. Aansprakelijkheid", "Vellu is niet aansprakelijk voor: schade voortvloeiend uit het gebruik van het platform of de onmogelijkheid daarvan; gemiste afspraken, no-shows of geschillen tussen salons en klanten; indirecte schade, gevolgschade of gederfde winst. De totale aansprakelijkheid van Vellu is beperkt tot het bedrag dat je in de afgelopen 3 maanden aan abonnementskosten hebt betaald."],
      ["11. Beëindiging", "Je kunt je account op elk moment beëindigen door contact op te nemen met Vellu. Na beëindiging wordt je boekingspagina gedeactiveerd en worden je gegevens verwijderd conform ons Privacybeleid. Vellu kan je account beëindigen bij schending van deze voorwaarden, met een kennisgeving per e-mail."],
      ["12. Toepasselijk recht", "Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in Den Haag, Nederland."],
      ["13. Contact", "Voor vragen over deze Algemene Voorwaarden kun je contact opnemen via info@vellu.cc."]
    ]
  } : {
    title: "Terms of Service",
    updated: "Last updated: March 2026",
    sections: [
      ["1. Acceptance of terms", "By using the Vellu platform (vellu.cc), you agree to these Terms of Service. If you do not agree, please do not use the platform. Vellu reserves the right to modify these terms at any time. Changes will be communicated through the platform."],
      ["2. Description of service", "Vellu is an online booking platform for beauty professionals in the Netherlands, including nail technicians, lash artists, hairdressers, and beauticians. The platform offers salon owners their own booking page (vellu.cc/your-name), calendar management, team accounts, email notifications, and a client management system. Vellu operates on a flat monthly subscription with no commission on bookings."],
      ["3. Account registration", "To use the platform as a salon owner, you must create an account with a valid email address and password. You are responsible for keeping your login credentials confidential and for all activities that occur under your account. Vellu may suspend or terminate accounts if abuse or violation of these terms is suspected."],
      ["4. Subscriptions and payment", "Vellu offers two subscription plans: Starter (€19/month) and Professional (€39/month). Both plans charge 0% commission on bookings — you only pay the flat monthly fee. Subscriptions are billed monthly. You may cancel your subscription at any time; it remains active until the end of the paid period. Vellu reserves the right to change prices with at least 30 days' notice."],
      ["5. Salon owner obligations", "As a salon owner, you are responsible for: keeping your salon details, services, and prices accurate and up to date; honoring appointments booked through the platform; complying with all applicable laws and regulations regarding your business operations, including GDPR for processing client data; correctly listing your Chamber of Commerce number, VAT ID, and other business details where applicable."],
      ["6. Clients and end users", "Clients who book an appointment through Vellu enter into an agreement with the respective salon, not with Vellu. Vellu acts solely as an intermediary and is not a party to the treatment agreement. Clients receive a confirmation email with the option to cancel via a unique link. Cancellation policies are determined by each individual salon."],
      ["7. Intellectual property", "All rights to the Vellu platform, including the software, design, logos, and content, belong to Vellu. Salon owners retain the rights to their own content, such as photos, descriptions, and logos they upload. By uploading content, you grant Vellu a limited license to display this content on your booking page."],
      ["8. Privacy and data processing", "Vellu processes personal data in accordance with the General Data Protection Regulation (GDPR). See our Privacy Policy at vellu.cc/privacy for full information on how we collect, use, and protect data. Vellu acts as a processor on behalf of the salon owner, who is the data controller for their clients' data."],
      ["9. Availability", "Vellu strives for the highest possible platform availability but cannot guarantee 100% uptime. Vellu is not liable for damages resulting from temporary unavailability, outages, or maintenance. Planned maintenance will be communicated in advance where possible."],
      ["10. Liability", "Vellu is not liable for: damages arising from the use of the platform or the inability to use it; missed appointments, no-shows, or disputes between salons and clients; indirect damages, consequential damages, or lost profits. Vellu's total liability is limited to the amount you have paid in subscription fees over the past 3 months."],
      ["11. Termination", "You may terminate your account at any time by contacting Vellu. Upon termination, your booking page will be deactivated and your data will be deleted in accordance with our Privacy Policy. Vellu may terminate your account for violation of these terms, with notification by email."],
      ["12. Governing law", "These terms are governed by Dutch law. Disputes shall be submitted to the competent court in The Hague, the Netherlands."],
      ["13. Contact", "For questions about these Terms of Service, please contact us at info@vellu.cc."]
    ]
  };

  return (
    <Layout>
      <style>{makeCSS(ACCENT, c)}</style>
      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate(-1)}>← {lang === "nl" ? "Terug" : "Back"}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{content.title}</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 32 }}>{content.updated}</div>
          {content.sections.map(([title, body], i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{body}</div>
            </div>
          ))}
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid " + c.border, display: "flex", gap: 16, fontSize: 11, color: c.textMuted }}>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Privacybeleid" : "Privacy Policy"}</a>
            <a href="/" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Terug naar home" : "Back to home"}</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── CONTACT / ABOUT PAGE ────────────────────────────────────
function ContactPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const content = lang === "nl" ? {
    title: "Over Vellu", subtitle: "Het verhaal achter het platform",
    mission: "Vellu is gebouwd met één missie: beauty professionals hun eigen online boekingsplatform geven, zonder commissie en zonder gedoe. Geen 10% per boeking, geen dure abonnementen met verborgen kosten. Gewoon een vast tarief en jouw merk voorop.",
    why: "Waarom Vellu?", whyText: "Te veel nagelsalons, kappers en wimperspecialisten zijn afhankelijk van platforms die een flink percentage van elke boeking pakken. Of ze werken met WhatsApp en DM's — prima, maar niet schaalbaar. Vellu geeft je je eigen professionele boekingspagina met jouw naam, jouw kleuren en jouw diensten. Klanten boeken direct, jij houdt 100% van je omzet.",
    who: "Wie zit erachter?", whoText: "Vellu is gebouwd door een solo developer uit Nederland met een passie voor technologie en ondernemerschap. Het platform is van de grond af opgebouwd met de focus op wat beauty professionals echt nodig hebben — niet meer, niet minder.",
    contact: "Contact", contactText: "Heb je vragen, feedback of wil je samenwerken? Neem gerust contact op.",
    emailLabel: "E-mail", responseTime: "We reageren meestal binnen 24 uur.",
    cta: "Klaar om te beginnen?", ctaText: "Maak gratis je eigen boekingspagina aan.", ctaBtn: "Gratis beginnen →"
  } : {
    title: "About Vellu", subtitle: "The story behind the platform",
    mission: "Vellu was built with one mission: give beauty professionals their own online booking platform, without commission and without hassle. No 10% per booking, no expensive subscriptions with hidden costs. Just a flat rate and your brand front and center.",
    why: "Why Vellu?", whyText: "Too many nail salons, hairdressers, and lash artists depend on platforms that take a significant percentage of every booking. Or they work with WhatsApp and DMs — fine, but not scalable. Vellu gives you your own professional booking page with your name, your colors, and your services. Clients book directly, you keep 100% of your revenue.",
    who: "Who's behind it?", whoText: "Vellu is built by a solo developer from the Netherlands with a passion for technology and entrepreneurship. The platform is built from the ground up with a focus on what beauty professionals actually need — nothing more, nothing less.",
    contact: "Contact", contactText: "Got questions, feedback, or want to collaborate? Don't hesitate to reach out.",
    emailLabel: "Email", responseTime: "We usually respond within 24 hours.",
    cta: "Ready to get started?", ctaText: "Create your free booking page.", ctaBtn: "Get started free →"
  };
  return (
    <Layout>
      <style>{makeCSS(ACCENT, c)}</style>
      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate(-1)}>← {lang === "nl" ? "Terug" : "Back"}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 28, fontWeight: 300, letterSpacing: "0.18em", marginBottom: 8 }}>vellu</div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{content.title}</div>
          <div style={{ fontSize: 13, color: c.textSub, marginBottom: 40 }}>{content.subtitle}</div>
          <div style={{ fontSize: 14, color: c.textSub, lineHeight: 1.8, marginBottom: 32, padding: "20px", background: `${ACCENT}08`, border: `1px solid ${ACCENT}1a`, borderRadius: 16 }}>{content.mission}</div>
          <div style={{ marginBottom: 32 }}><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.why}</div><div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{content.whyText}</div></div>
          <div style={{ marginBottom: 32 }}><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.who}</div><div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{content.whoText}</div></div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.contact}</div>
            <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, marginBottom: 16 }}>{content.contactText}</div>
            <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: "20px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{content.emailLabel}</div>
              <a href="mailto:info@vellu.cc" style={{ fontSize: 15, color: ACCENT, textDecoration: "none", fontWeight: 500 }}>info@vellu.cc</a>
              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8 }}>{content.responseTime}</div>
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "28px 20px", background: `${ACCENT}08`, border: `1px solid ${ACCENT}1a`, borderRadius: 20, marginBottom: 32 }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 8 }}>{content.cta}</div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 16 }}>{content.ctaText}</div>
            <button className="btn-primary" onClick={() => navigate("/owner")}>{content.ctaBtn}</button>
          </div>
          <div style={{ paddingTop: 20, borderTop: "1px solid " + c.border, display: "flex", gap: 16, fontSize: 11, color: c.textMuted }}>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Privacybeleid" : "Privacy Policy"}</a>
            <a href="/terms" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Voorwaarden" : "Terms"}</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── DATA PROCESSING AGREEMENT (VERWERKINGSOVEREENKOMST) ─────
function DpaPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const content = lang === "nl" ? {
    title: "Verwerkingsovereenkomst",
    updated: "Laatst bijgewerkt: maart 2026",
    intro: "Deze verwerkingsovereenkomst (\"Overeenkomst\") is van toepassing op de verwerking van persoonsgegevens door Vellu (\"Verwerker\") namens de saloneigenaar die het Vellu-platform gebruikt (\"Verwerkingsverantwoordelijke\"). Deze overeenkomst maakt integraal onderdeel uit van de Algemene Voorwaarden van Vellu en wordt automatisch geaccepteerd bij het aanmaken van een account.",
    sections: [
      ["1. Definities", "Persoonsgegevens: alle gegevens die betrekking hebben op een geïdentificeerde of identificeerbare natuurlijke persoon. Verwerking: elke bewerking of geheel van bewerkingen met betrekking tot persoonsgegevens, waaronder het verzamelen, vastleggen, ordenen, structureren, opslaan, bijwerken, wijzigen, opvragen, raadplegen, gebruiken, verstrekken, verspreiden, wissen of vernietigen van gegevens. AVG: de Algemene Verordening Gegevensbescherming (EU) 2016/679."],
      ["2. Onderwerp en duur", "De Verwerker verwerkt persoonsgegevens ten behoeve van het aanbieden van het online boekingsplatform Vellu. De verwerking vindt plaats gedurende de looptijd van het abonnement van de Verwerkingsverantwoordelijke. Na beëindiging van het abonnement worden de gegevens verwijderd conform artikel 12 van deze overeenkomst."],
      ["3. Aard en doel van de verwerking", "De verwerking omvat: het opslaan en beheren van afspraken en boekingen; het versturen van e-mailbevestigingen, herinneringen en follow-ups; het beheren van klantgegevens namens de salon; het genereren van facturen en omzetoverzichten; het faciliteren van reviews en beoordelingen. Het doel is het aanbieden van een volledig boekings- en beheersysteem voor beautyprofessionals."],
      ["4. Soorten persoonsgegevens", "De volgende categorieën persoonsgegevens worden verwerkt: naam (voor- en achternaam) van klanten; e-mailadres van klanten; telefoonnummer (indien verstrekt); afspraakgegevens (datum, tijd, behandeling, prijs); allergie-informatie (indien verstrekt door de klant); reviewteksten en beoordelingen; bedrijfsgegevens van de saloneigenaar (naam, adres, KVK, BTW-id, IBAN)."],
      ["5. Categorieën betrokkenen", "De persoonsgegevens hebben betrekking op: klanten die een afspraak boeken via het Vellu-platform; saloneigenaren en hun medewerkers die het platform gebruiken."],
      ["6. Verplichtingen van de Verwerker", "De Verwerker verbindt zich ertoe: persoonsgegevens uitsluitend te verwerken in opdracht van en volgens de instructies van de Verwerkingsverantwoordelijke, tenzij een wettelijke verplichting anders vereist; te waarborgen dat personen die toegang hebben tot de persoonsgegevens zich tot geheimhouding hebben verbonden; passende technische en organisatorische maatregelen te nemen om een op het risico afgestemd beveiligingsniveau te waarborgen; geen persoonsgegevens te verwerken voor eigen commerciële doeleinden; de Verwerkingsverantwoordelijke onverwijld te informeren indien een instructie naar het oordeel van de Verwerker in strijd is met de AVG."],
      ["7. Sub-verwerkers", "De Verwerkingsverantwoordelijke geeft de Verwerker algemene toestemming om sub-verwerkers in te schakelen. De huidige sub-verwerkers zijn:\n\n• Supabase Inc. (San Francisco, VS) — database hosting en opslag. Data wordt verwerkt in de EU (Frankfurt). Supabase is SOC2 Type II gecertificeerd.\n• Resend Inc. (San Francisco, VS) — e-mailverzending voor bevestigingen, herinneringen en facturen. Verwerkt via Amazon SES (EU-West-1, Ierland).\n• Vercel Inc. (San Francisco, VS) — website hosting en content delivery. Edge netwerk met nodes in de EU.\n\nDe Verwerker informeert de Verwerkingsverantwoordelijke over wijzigingen in sub-verwerkers. De Verwerkingsverantwoordelijke kan bezwaar maken tegen een nieuwe sub-verwerker."],
      ["8. Beveiligingsmaatregelen", "De Verwerker heeft de volgende technische en organisatorische maatregelen getroffen: versleuteling van gegevens in transit (TLS/SSL) en at rest; toegangscontrole op basis van Row Level Security (RLS) in de database; authenticatie via Supabase Auth met veilige wachtwoordopslag (bcrypt); geen opslag van betaalgegevens — betalingen worden afgehandeld door derden; regelmatige back-ups van de database; beperkte toegang tot productiedata."],
      ["9. Meldplicht datalekken", "De Verwerker informeert de Verwerkingsverantwoordelijke zonder onredelijke vertraging, en waar mogelijk binnen 48 uur, nadat hij kennis heeft genomen van een inbreuk in verband met persoonsgegevens (datalek). De melding bevat ten minste: de aard van het datalek; de categorieën en het aantal betrokkenen; de waarschijnlijke gevolgen; de maatregelen die zijn genomen of voorgesteld om het datalek aan te pakken."],
      ["10. Bijstand", "De Verwerker verleent de Verwerkingsverantwoordelijke bijstand bij: het nakomen van verzoeken van betrokkenen (inzage, correctie, verwijdering); het uitvoeren van een gegevensbeschermingseffectbeoordeling (DPIA) indien nodig; het melden van datalekken aan de Autoriteit Persoonsgegevens."],
      ["11. Controle en audit", "De Verwerkingsverantwoordelijke heeft het recht om audits uit te voeren of te laten uitvoeren om de naleving van deze overeenkomst te controleren. De Verwerker verleent hieraan medewerking en stelt alle relevante informatie beschikbaar. De kosten van een audit zijn voor rekening van de Verwerkingsverantwoordelijke, tenzij uit de audit blijkt dat de Verwerker zijn verplichtingen niet nakomt."],
      ["12. Teruggave en verwijdering", "Na beëindiging van het abonnement verwijdert de Verwerker alle persoonsgegevens binnen 30 dagen, tenzij bewaring wettelijk verplicht is. De Verwerkingsverantwoordelijke kan voorafgaand aan de verwijdering een kopie van de gegevens opvragen. Reeds geanonimiseerde of geaggregeerde gegevens (zoals omzetstatistieken) vallen buiten deze verplichting."],
      ["13. Aansprakelijkheid", "De aansprakelijkheid van de Verwerker is beperkt overeenkomstig de bepalingen in de Algemene Voorwaarden van Vellu. Beide partijen vrijwaren elkaar voor claims van derden die voortvloeien uit het niet nakomen van de verplichtingen uit deze overeenkomst."],
      ["14. Toepasselijk recht", "Op deze verwerkingsovereenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in Den Haag, Nederland."],
      ["15. Contact", "Voor vragen over deze verwerkingsovereenkomst kun je contact opnemen via info@vellu.cc."]
    ]
  } : {
    title: "Data Processing Agreement",
    updated: "Last updated: March 2026",
    intro: "This Data Processing Agreement (\"Agreement\") applies to the processing of personal data by Vellu (\"Processor\") on behalf of the salon owner using the Vellu platform (\"Controller\"). This agreement is an integral part of the Vellu Terms of Service and is automatically accepted upon account creation.",
    sections: [
      ["1. Definitions", "Personal data: any data relating to an identified or identifiable natural person. Processing: any operation or set of operations performed on personal data, including collecting, recording, organizing, structuring, storing, adapting, altering, retrieving, consulting, using, disclosing, disseminating, erasing, or destroying data. GDPR: the General Data Protection Regulation (EU) 2016/679."],
      ["2. Subject matter and duration", "The Processor processes personal data for the purpose of providing the Vellu online booking platform. Processing takes place for the duration of the Controller's subscription. After termination of the subscription, data will be deleted in accordance with Article 12 of this agreement."],
      ["3. Nature and purpose of processing", "Processing includes: storing and managing appointments and bookings; sending email confirmations, reminders, and follow-ups; managing client data on behalf of the salon; generating invoices and revenue overviews; facilitating reviews and ratings. The purpose is to provide a complete booking and management system for beauty professionals."],
      ["4. Types of personal data", "The following categories of personal data are processed: name (first and last name) of clients; email address of clients; phone number (if provided); appointment data (date, time, treatment, price); allergy information (if provided by the client); review texts and ratings; business data of the salon owner (name, address, CoC, VAT ID, IBAN)."],
      ["5. Categories of data subjects", "The personal data relates to: clients who book an appointment through the Vellu platform; salon owners and their staff who use the platform."],
      ["6. Obligations of the Processor", "The Processor commits to: processing personal data solely on behalf of and in accordance with the instructions of the Controller, unless required otherwise by law; ensuring that persons authorized to process personal data have committed to confidentiality; implementing appropriate technical and organizational measures to ensure a level of security appropriate to the risk; not processing personal data for its own commercial purposes; informing the Controller without delay if an instruction, in the Processor's opinion, violates the GDPR."],
      ["7. Sub-processors", "The Controller grants the Processor general authorization to engage sub-processors. The current sub-processors are:\n\n• Supabase Inc. (San Francisco, US) — database hosting and storage. Data is processed in the EU (Frankfurt). Supabase is SOC2 Type II certified.\n• Resend Inc. (San Francisco, US) — email delivery for confirmations, reminders, and invoices. Processed via Amazon SES (EU-West-1, Ireland).\n• Vercel Inc. (San Francisco, US) — website hosting and content delivery. Edge network with nodes in the EU.\n\nThe Processor will inform the Controller of changes to sub-processors. The Controller may object to a new sub-processor."],
      ["8. Security measures", "The Processor has implemented the following technical and organizational measures: encryption of data in transit (TLS/SSL) and at rest; access control based on Row Level Security (RLS) in the database; authentication via Supabase Auth with secure password storage (bcrypt); no storage of payment data — payments are handled by third parties; regular database backups; limited access to production data."],
      ["9. Data breach notification", "The Processor will inform the Controller without undue delay, and where possible within 48 hours, after becoming aware of a personal data breach. The notification will include at minimum: the nature of the breach; the categories and number of data subjects affected; the likely consequences; the measures taken or proposed to address the breach."],
      ["10. Assistance", "The Processor will assist the Controller with: fulfilling data subject requests (access, correction, deletion); conducting a Data Protection Impact Assessment (DPIA) if necessary; reporting data breaches to the Data Protection Authority."],
      ["11. Audit and inspection", "The Controller has the right to conduct or commission audits to verify compliance with this agreement. The Processor will cooperate and make all relevant information available. Audit costs are borne by the Controller, unless the audit reveals non-compliance by the Processor."],
      ["12. Return and deletion", "After termination of the subscription, the Processor will delete all personal data within 30 days, unless retention is legally required. The Controller may request a copy of the data prior to deletion. Already anonymized or aggregated data (such as revenue statistics) is excluded from this obligation."],
      ["13. Liability", "The Processor's liability is limited in accordance with the provisions in the Vellu Terms of Service. Both parties indemnify each other against third-party claims arising from non-compliance with the obligations under this agreement."],
      ["14. Governing law", "This data processing agreement is governed by Dutch law. Disputes shall be submitted to the competent court in The Hague, the Netherlands."],
      ["15. Contact", "For questions about this data processing agreement, please contact us at info@vellu.cc."]
    ]
  };
  return (
    <Layout>
      <style>{makeCSS(ACCENT, c)}</style>
      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate(-1)}>← {lang === "nl" ? "Terug" : "Back"}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{content.title}</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 20 }}>{content.updated}</div>
          <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, marginBottom: 32, padding: "16px 20px", background: `${ACCENT}08`, border: `1px solid ${ACCENT}1a`, borderRadius: 14 }}>{content.intro}</div>
          {content.sections.map(([title, body], i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{body}</div>
            </div>
          ))}
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid " + c.border, display: "flex", gap: 16, fontSize: 11, color: c.textMuted }}>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Privacybeleid" : "Privacy Policy"}</a>
            <a href="/terms" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Voorwaarden" : "Terms"}</a>
            <a href="/" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Terug naar home" : "Back to home"}</a>
          </div>
        </div>
      </div>
    </Layout>
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

  // Don't show on owner dashboard or cancel pages
  if (!visible || location.pathname.startsWith("/owner") || location.pathname.startsWith("/cancel")) return null;

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
        style={{ background: ACCENT, color: c.btnOnDark, border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Jost',sans-serif", flexShrink: 0 }}>
        OK
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
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<AppInner lang={lang} setLang={setLang} />} />
              <Route path="/owner" element={<OwnerEntryPage lang={lang} setLang={setLang} />} />
              <Route path="/cancel/:token" element={<CancelRoute lang={lang} />} />
              <Route path="/privacy" element={<PrivacyPage lang={lang} setLang={setLang} />} />
              <Route path="/terms" element={<TermsPage lang={lang} setLang={setLang} />} />
              <Route path="/contact" element={<ContactPage lang={lang} setLang={setLang} />} />
              <Route path="/dpa" element={<DpaPage lang={lang} setLang={setLang} />} />
              <Route path="/:slug" element={<SalonRouteWrapper lang={lang} setLang={setLang} />} />
            </Routes>
          </Suspense>
            <CookieConsent lang={lang} />
          </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
