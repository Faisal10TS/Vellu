import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";
import { BrowserRouter, Routes, Route, useParams, useNavigate } from "react-router-dom";

// ─── EMAIL HELPER ─────────────────────────────────────────────
async function sendEmails(type, booking) {
  try {
    await fetch("https://pqvovkwqkapmpibktpwb.supabase.co/functions/v1/send-emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k"
      },
      body: JSON.stringify({ type, booking })
    });
  } catch (e) {
    console.error("Email error:", e);
  }
}

const ACCENT = "#c9a96e";
const today = new Date();
const fmt = (d) => d.toISOString().split("T")[0];
const getDays = (n = 14) => Array.from({ length: n }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
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
    welcomeBack:"Welkom terug 👋", todayAppts:"Afspraken vandaag",
    noTodayAppts:"Geen afspraken vandaag", markComplete:"✓ Markeer Voltooid",
    sendInvoice:"📄 Factuur Sturen", invoiceSent:"✓ Factuur verstuurd",
    completedTreatments:"Voltooide behandelingen", totalEarnings:"Totale inkomsten",
    noCompleted:"Nog geen voltooide afspraken", manageSalon:"Beheer je bedrijf",
    profile:"Profiel", brandColor:"Merkkleur", services:"Diensten", save:"Opslaan",
    saved:"Opgeslagen ✓", logout:"Uitloggen", businessName:"Bedrijfsnaam", city:"Stad",
    addService:"+ Dienst Toevoegen", deleteService:"Verwijder",
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
    staff:"Team", addStaff:"+ Medewerker toevoegen", staffName:"Naam medewerker",
    staffRole:"Functie (bijv. Nagelstyliste)", selectStaff:"Kies een medewerker",
    anyStaff:"Geen voorkeur", noStaff:"Nog geen medewerkers",
    businessHours:"Openingstijden", openTime:"Open", closeTime:"Sluit", closed:"Gesloten",
    businessHoursDesc:"Stel je werkdagen en -uren in", closedOnDay:"Gesloten op deze dag",
    // New customization translations
    bookingPolicy:"Boekingsvoorwaarden", bookingPolicyDesc:"Voorwaarden waar klanten mee akkoord moeten gaan",
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
    welcomeBack:"Welcome back 👋", todayAppts:"Today's appointments",
    noTodayAppts:"No appointments today", markComplete:"✓ Mark Complete",
    sendInvoice:"📄 Send Invoice", invoiceSent:"✓ Invoice sent",
    completedTreatments:"Completed treatments", totalEarnings:"Total earnings",
    noCompleted:"No completed appointments yet", manageSalon:"Manage your business",
    profile:"Profile", brandColor:"Brand color", services:"Services", save:"Save",
    saved:"Saved ✓", logout:"Log out", businessName:"Business name", city:"City",
    addService:"+ Add Service", deleteService:"Delete",
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
    staff:"Team", addStaff:"+ Add staff member", staffName:"Staff name",
    staffRole:"Role (e.g. Nail technician)", selectStaff:"Choose a staff member",
    anyStaff:"No preference", noStaff:"No staff members yet",
    businessHours:"Business Hours", openTime:"Open", closeTime:"Close", closed:"Closed",
    businessHoursDesc:"Set your working days and hours", closedOnDay:"Closed on this day",
    // New customization translations
    bookingPolicy:"Booking Policy", bookingPolicyDesc:"Terms clients must agree to before booking",
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
  }
};

// ─── NO DEMO SALONS (removed) ────────────────────────────────
const DEMO_SALONS = {};

// ─── CSS ─────────────────────────────────────────────────────
const makeCSS = (accent) => `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=Jost:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  input { outline: none; font-family: 'Jost', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
  .fade-up { animation: fadeUp 0.38s cubic-bezier(0.16,1,0.3,1) both; }
  .scale-in { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both; }

  .btn-primary {
    background: ${accent}; color: #0d0b0a; border: none; border-radius: 100px;
    padding: 15px 28px; font-family: 'Jost',sans-serif; font-size: 13px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; width: 100%;
    transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
  }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 32px ${accent}55; }
  .btn-primary:disabled { opacity: 0.28; cursor: not-allowed; transform: none; box-shadow: none; }

  .btn-ghost {
    background: transparent; color: rgba(237,232,224,0.55);
    border: 1px solid rgba(237,232,224,0.13); border-radius: 100px;
    padding: 11px 20px; font-family: 'Jost',sans-serif; font-size: 11px; font-weight: 500;
    letter-spacing: 0.07em; text-transform: uppercase; cursor: pointer; transition: all 0.2s;
  }
  .btn-ghost:hover { background: rgba(237,232,224,0.06); color: #ede8e0; border-color: rgba(237,232,224,0.24); }

  .input-field {
    background: rgba(237,232,224,0.04); border: 1px solid rgba(237,232,224,0.1);
    border-radius: 14px; padding: 14px 17px; color: #ede8e0;
    font-family: 'Jost',sans-serif; font-size: 13px; width: 100%; transition: all 0.2s;
  }
  .input-field:focus { border-color: ${accent}88; background: rgba(237,232,224,0.06); box-shadow: 0 0 0 3px ${accent}18; }
  .input-field::placeholder { color: rgba(237,232,224,0.22); }

  .service-card {
    background: rgba(237,232,224,0.03); border: 1px solid rgba(237,232,224,0.08);
    border-radius: 20px; padding: 17px 19px; cursor: pointer; margin-bottom: 10px;
    transition: all 0.22s cubic-bezier(0.16,1,0.3,1);
  }
  .service-card:hover { border-color: ${accent}44; background: ${accent}08; transform: translateY(-1px); }
  .service-card.sel { border-color: ${accent}99; background: ${accent}14; box-shadow: 0 0 0 1px ${accent}33; }

  .time-chip {
    background: rgba(237,232,224,0.03); border: 1px solid rgba(237,232,224,0.1);
    border-radius: 11px; padding: 10px 4px; font-size: 11px; font-weight: 500;
    cursor: pointer; transition: all 0.18s; text-align: center; color: rgba(237,232,224,0.6);
  }
  .time-chip:hover { border-color: ${accent}55; color: ${accent}; background: ${accent}09; }
  .time-chip.sel { background: ${accent}; border-color: ${accent}; color: #0d0b0a; font-weight: 600; }

  .day-chip {
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 12px; border-radius: 15px; cursor: pointer; min-width: 44px;
    border: 1px solid transparent; flex-shrink: 0; transition: all 0.2s;
  }
  .day-chip:hover { background: ${accent}18; border-color: ${accent}44; }
  .day-chip.sel { background: ${accent}; border-color: ${accent}; }
  .day-chip.sel span { color: #0d0b0a !important; }

  .appt-card {
    background: rgba(237,232,224,0.03); border: 1px solid rgba(237,232,224,0.07);
    border-radius: 20px; padding: 17px 19px; margin-bottom: 10px; transition: all 0.2s;
  }
  .appt-card:hover { border-color: rgba(237,232,224,0.13); }

  .nav-item {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    cursor: pointer; padding: 7px 8px; border-radius: 14px; flex: 1; transition: all 0.2s;
  }
  .nav-item:hover { background: rgba(237,232,224,0.04); }

  .pay-opt {
    border: 1px solid rgba(237,232,224,0.1); border-radius: 15px; padding: 13px 16px;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 12px;
  }
  .pay-opt:hover { border-color: ${accent}44; background: ${accent}06; }
  .pay-opt.sel { border-color: ${accent}88; background: ${accent}12; }

  .radio { width: 17px; height: 17px; border-radius: 50%; border: 1.5px solid rgba(237,232,224,0.22); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s; }
  .radio.on { border-color: ${accent}; box-shadow: 0 0 0 3px ${accent}22; }
  .radio.on::after { content:''; width:7px; height:7px; border-radius:50%; background:${accent}; display:block; }

  .badge { font-size: 10px; font-weight: 600; padding: 3px 10px; border-radius: 100px; letter-spacing: 0.08em; text-transform: uppercase; }
  .badge-confirmed { background: rgba(147,197,253,0.1); color: #93c5fd; border: 1px solid rgba(147,197,253,0.2); }
  .badge-completed { background: rgba(134,239,172,0.1); color: #86efac; border: 1px solid rgba(134,239,172,0.2); }

  .confirm-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(237,232,224,0.06); }
  .confirm-row:last-child { border-bottom: none; }
  .stat-card { background: rgba(237,232,224,0.03); border: 1px solid rgba(237,232,224,0.07); border-radius: 20px; padding: 18px 20px; flex: 1; }

  .lang-toggle { background: rgba(237,232,224,0.06); border: 1px solid rgba(237,232,224,0.1); border-radius: 100px; padding: 5px; display: flex; gap: 2px; }
  .lang-btn { padding: 5px 10px; border-radius: 100px; font-family: 'Jost',sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; cursor: pointer; border: none; transition: all 0.2s; text-transform: uppercase; }
  .lang-btn.active { background: ${accent}; color: #0d0b0a; }
  .lang-btn.inactive { background: transparent; color: rgba(237,232,224,0.35); }

  .photo-grid { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-top: 12px; }
  .photo-thumb { width: 68px; height: 68px; border-radius: 12px; object-fit: cover; cursor: pointer; border: 1px solid rgba(237,232,224,0.08); flex-shrink: 0; transition: all 0.2s; position: relative; }
  .photo-thumb:hover { transform: scale(1.04); border-color: ${accent}55; }
  .photo-add { width: 68px; height: 68px; border-radius: 12px; border: 1.5px dashed ${accent}44; background: ${accent}06; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all 0.2s; gap: 4px; }
  .photo-add:hover { background: ${accent}12; border-color: ${accent}88; }

  .slug-box { background: rgba(237,232,224,0.04); border: 1px solid rgba(237,232,224,0.1); border-radius: 14px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .salon-pill { background: ${accent}12; border: 1px solid ${accent}33; border-radius: 14px; padding: 14px 18px; cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .salon-pill:hover { background: ${accent}20; border-color: ${accent}66; transform: translateY(-1px); }

  .gallery-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.95); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 200; padding: 24px; }

  @media (max-width: 520px) {
    .service-card { border-radius: 16px; padding: 15px 16px; }
    .btn-primary { padding: 16px 28px; font-size: 14px; }
    .btn-ghost { font-size: 12px; }
    .input-field { padding: 15px 17px; font-size: 14px; }
    .nav-item { padding: 8px 4px; }
  }
`;

// ─── SHARED ───────────────────────────────────────────────────
// Layout wrapper - full-screen responsive (replaces old Phone component)
function Layout({ children, accent = ACCENT, maxWidth = "100%" }) {
  return (
    <div style={{ width: "100%", maxWidth, margin: "0 auto", background: "#0d0b0a", minHeight: "100dvh" }}>
      <style>{makeCSS(accent)}</style>
      {children}
    </div>
  );
}

// For client booking flow - centered card on desktop, full screen on mobile
function BookingLayout({ children, accent = ACCENT }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  
  return (
    <div style={{ 
      width: "100%", 
      maxWidth: isMobile ? "100%" : 520, 
      margin: isMobile ? 0 : "40px auto",
      background: "#0d0b0a", 
      borderRadius: isMobile ? 0 : 32,
      boxShadow: isMobile ? "none" : "0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
      minHeight: isMobile ? "100dvh" : "auto",
      overflow: "hidden"
    }}>
      <style>{makeCSS(accent)}</style>
      {children}
    </div>
  );
}

const SLabel = ({ c }) => (s) => <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(237,232,224,0.32)", marginBottom: 12 }}>{s}</div>;

function PTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: 26, color: "#ede8e0" }}>{children}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", letterSpacing: "0.04em", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function SL({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(237,232,224,0.32)", marginBottom: 12 }}>{children}</div>;
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
  return (
    <div style={{ padding: "20px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && <button className="btn-ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={onBack}>←</button>}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 400, letterSpacing: "0.06em" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: "rgba(237,232,224,0.3)", marginTop: 3, letterSpacing: "0.08em" }}>{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

// ─── LANDING ─────────────────────────────────────────────────
function LandingScreen({ onSelectSalon, onOwnerEnter, lang, setLang, salons = {} }) {
  const t = T[lang];
  const [slugInput, setSlugInput] = useState("");
  const [error, setError] = useState("");

  const goToSlug = (slug) => {
    // Strip vellu.cc/ or www.vellu.cc/ prefix if user pasted full link
    let clean = slug.toLowerCase().trim()
      .replace(/^https?:\/\//, "")
      .replace(/^(www\.)?vellu\.cc\//, "");
    if (!clean) return;
    window.location.href = "/" + clean;
  };

  return (
    <Layout>
      <div style={{ 
        background: "#0d0b0a", 
        minHeight: "100dvh", 
        display: "flex", 
        flexDirection: "column",
        fontFamily: "'Jost',sans-serif", 
        color: "#ede8e0",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Background decorations */}
        <div style={{ 
          position: "absolute", 
          top: "-30%", 
          left: "-10%", 
          width: "70%", 
          height: "80%", 
          background: `radial-gradient(ellipse at center, ${ACCENT}08 0%, transparent 70%)`,
          pointerEvents: "none"
        }} />
        <div style={{ 
          position: "absolute", 
          bottom: "-20%", 
          right: "-20%", 
          width: "60%", 
          height: "60%", 
          background: `radial-gradient(ellipse at center, ${ACCENT}06 0%, transparent 60%)`,
          pointerEvents: "none"
        }} />

        {/* Navigation */}
        <nav style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          padding: "24px 32px",
          position: "relative",
          zIndex: 10
        }}>
          <div style={{ 
            fontFamily: "'Cormorant Garamond',serif", 
            fontSize: 28, 
            fontWeight: 300, 
            letterSpacing: "0.1em" 
          }}>vellu</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LangToggle lang={lang} setLang={setLang} />
            <button 
              className="btn-ghost" 
              style={{ fontSize: 11 }} 
              onClick={() => window.location.href = "/owner"}
            >
              👑 {lang === "nl" ? "Eigenaar" : "Owner"}
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <div style={{ 
          flex: 1, 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center", 
          justifyContent: "center",
          padding: "40px 24px 60px",
          textAlign: "center",
          position: "relative",
          zIndex: 10
        }}>
          <div className="fade-up" style={{ maxWidth: 600 }}>
            {/* Main heading */}
            <h1 style={{ 
              fontFamily: "'Cormorant Garamond',serif", 
              fontSize: "clamp(48px, 10vw, 80px)", 
              fontWeight: 300, 
              letterSpacing: "0.08em", 
              lineHeight: 1,
              marginBottom: 20
            }}>
              {lang === "nl" ? "Beauty booking" : "Beauty booking"}
              <br />
              <span style={{ color: ACCENT }}>{lang === "nl" ? "simpel gemaakt" : "made simple"}</span>
            </h1>
            
            <p style={{ 
              fontSize: "clamp(14px, 2vw, 18px)", 
              color: "rgba(237,232,224,0.5)", 
              marginBottom: 48,
              letterSpacing: "0.02em",
              lineHeight: 1.6,
              maxWidth: 450,
              margin: "0 auto 48px"
            }}>
              {lang === "nl" 
                ? "Het premium platform voor beauty ondernemers. Jouw eigen boekingspagina in minuten." 
                : "The premium platform for beauty entrepreneurs. Your own booking page in minutes."}
            </p>

            {/* Decorative line */}
            <div style={{ 
              width: 60, 
              height: 1, 
              background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, 
              margin: "0 auto 40px" 
            }} />

            {/* Search box */}
            <div style={{ 
              background: "rgba(237,232,224,0.03)", 
              border: "1px solid rgba(237,232,224,0.1)",
              borderRadius: 20,
              padding: 24,
              maxWidth: 420,
              margin: "0 auto"
            }}>
              <SL style={{ textAlign: "left" }}>{lang === "nl" ? "Naar een studio" : "Go to studio"}</SL>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <div style={{ 
                    position: "absolute", 
                    left: 16, 
                    top: "50%", 
                    transform: "translateY(-50%)", 
                    fontSize: 13, 
                    color: "rgba(237,232,224,0.25)",
                    pointerEvents: "none"
                  }}>vellu.cc/</div>
                  <input 
                    className="input-field" 
                    placeholder={lang === "nl" ? "studio-naam" : "studio-name"} 
                    value={slugInput} 
                    onChange={e => setSlugInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && goToSlug(slugInput)}
                    style={{ paddingLeft: 85, borderRadius: 12 }} 
                  />
                </div>
                <button 
                  className="btn-primary" 
                  style={{ width: "auto", padding: "14px 24px", flexShrink: 0 }} 
                  onClick={() => goToSlug(slugInput)}
                >→</button>
              </div>
              {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 12 }}>{error}</div>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ 
          padding: "24px 32px", 
          textAlign: "center",
          borderTop: "1px solid rgba(237,232,224,0.05)"
        }}>
          <div style={{ 
            fontSize: 11, 
            color: "rgba(237,232,224,0.2)", 
            letterSpacing: "0.1em" 
          }}>
            © {new Date().getFullYear()} VELLU · {lang === "nl" ? "BEAUTY BOOKING PLATFORM" : "BEAUTY BOOKING PLATFORM"}
          </div>
        </footer>
      </div>
    </Layout>
  );
}

// ─── OWNER AUTH ───────────────────────────────────────────────
function OwnerAuth({ onLogin, onBack, lang, setLang }) {
  const t = T[lang];
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ email: "", password: "", businessName: "", slug: "", city: "" });
  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!form.email || !form.password) { setError(lang === "nl" ? "Vul alle velden in" : "Fill in all fields"); return; }
    if (mode === "signup" && !form.businessName) { setError(lang === "nl" ? "Vul je bedrijfsnaam in" : "Enter your business name"); return; }
    setLoading(true);
    setError("");

    if (mode === "signup") {
      const slug = form.slug || form.businessName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "mijn-studio";
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
        accent_color: "#c9a96e"
      });
      onLogin({ name: form.businessName, email: form.email, slug, city: form.city || "Nederland", id: data.user.id });
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) { setError(lang === "nl" ? "Verkeerd e-mail of wachtwoord" : "Incorrect email or password"); setLoading(false); return; }
      // Load profile
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      const slug = profile?.slug || data.user.email.split("@")[0];
      onLogin({ name: profile?.business_name || "Mijn Studio", email: form.email, slug, city: profile?.city || "Nederland", id: data.user.id, accent: profile?.accent_color });
    }
    setLoading(false);
  };

  return (
    <Layout>
      <div style={{ 
        background: "#0d0b0a", 
        minHeight: "100dvh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        padding: "40px 24px", 
        fontFamily: "'Jost',sans-serif", 
        color: "#ede8e0", 
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
        <div style={{ position: "absolute", top: 32, right: 32 }}>
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        <div style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 10 }} className="fade-up">
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👑</div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>{t.ownerLogin}</div>
            <div style={{ fontSize: 13, color: "rgba(237,232,224,0.4)", marginTop: 8, letterSpacing: "0.02em" }}>{t.ownerSub}</div>
          </div>

          <div style={{ 
            background: "rgba(237,232,224,0.02)", 
            border: "1px solid rgba(237,232,224,0.08)",
            borderRadius: 24,
            padding: 28
          }}>
            <div style={{ display: "flex", marginBottom: 24, borderBottom: "1px solid rgba(237,232,224,0.08)" }}>
              {[["signin", t.signIn], ["signup", t.signUp]].map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                  flex: 1, padding: "12px", border: "none", background: "transparent",
                  fontFamily: "'Jost',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: mode === m ? ACCENT : "rgba(237,232,224,0.25)",
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
                  <div style={{ position: "absolute", left: 17, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "rgba(237,232,224,0.3)", fontFamily: "'Jost',sans-serif", pointerEvents: "none" }}>vellu.cc/</div>
                  <input className="input-field" placeholder={lang === "nl" ? "jouw-salon-naam" : "your-salon-name"} value={form.slug} onChange={e => setForm(f => ({...f, slug: e.target.value.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")}))} style={{ paddingLeft: 85 }} />
                </div>
              </>}
              <input className="input-field" placeholder={t.emailField} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              <input className="input-field" placeholder={t.passwordField} type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
            </div>
            {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 16, textAlign: "center" }}>{error}</div>}
            <button className="btn-primary" onClick={handle} disabled={loading}>{loading ? "..." : (mode === "signin" ? t.login : t.createAccount)}</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── REVIEW FORM ────────────────────────────────────────────
function ReviewForm({ salon, clientName, clientEmail, lang, t, accent }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (rating === 0) return;
    await supabase.from("reviews").insert({
      owner_id: salon.owner_id,
      client_name: clientName,
      client_email: clientEmail,
      rating,
      comment: comment || null
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: 13, color: "#86efac" }}>{t.reviewSubmitted}</div>
      </div>
    );
  }

  return (
    <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px", textAlign: "left" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(237,232,224,0.3)", marginBottom: 10 }}>{t.writeReview}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[1,2,3,4,5].map(s => (
          <span key={s} onClick={() => setRating(s)} style={{ fontSize: 26, cursor: "pointer", color: s <= rating ? accent : "rgba(237,232,224,0.15)", transition: "all 0.15s", transform: s <= rating ? "scale(1.1)" : "none" }}>★</span>
        ))}
      </div>
      <textarea className="input-field" placeholder={t.reviewComment} value={comment} onChange={e => setComment(e.target.value)}
        style={{ minHeight: 70, resize: "vertical", marginBottom: 10, fontSize: 12 }} />
      <button className="btn-ghost" style={{ width: "100%", color: rating > 0 ? accent : undefined, borderColor: rating > 0 ? `${accent}44` : undefined }}
        onClick={submit} disabled={rating === 0}>{t.submitReview}</button>
    </div>
  );
}

// ─── CLIENT BOOKING ───────────────────────────────────────────
function ClientApp({ salon: initialSalon, onBack, lang, setLang }) {
  const accent = initialSalon.accent || ACCENT;
  const t = T[lang];
  const DAY = lang === "nl" ? DAY_NL : DAY_EN;
  const MON = lang === "nl" ? MON_NL : MON_EN;
  const svcName = (s) => lang === "nl" ? s.name_nl : s.name_en;

  const [step, setStep] = useState(1);
  const [sel, setSel] = useState(null);
  const [selVariant, setSelVariant] = useState(null);
  const [selExtras, setSelExtras] = useState([]);
  const [selStaff, setSelStaff] = useState(null);
  
  // Find first available (non-closed) day
  const getFirstAvailableDate = () => {
    const businessHours = initialSalon.business_hours || DEFAULT_HOURS;
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayOfWeek = d.getDay();
      if (!businessHours[dayOfWeek]?.closed) {
        return fmt(d);
      }
    }
    return fmt(today); // Fallback
  };
  
  const [date, setDate] = useState(getFirstAvailableDate);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival" });
  const [done, setDone] = useState(false);
  const [gallery, setGallery] = useState(null);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState("");
  const days = getDays();
  
  // Check if form is complete
  const phoneValid = !initialSalon.phone_required || form.phone.length >= 6;
  const policyValid = !initialSalon.booking_policy || policyAgreed;
  const canConfirm = form.firstName && form.lastName && form.email && phoneValid && policyValid;

  // Filter staff members who can do the selected service
  const availableStaff = (initialSalon.staff || []).filter(m =>
    m.service_ids?.length === 0 || m.service_ids?.includes(sel?.id)
  );

  // Get active discount codes
  const activeCodes = (initialSalon.discount_codes || []).filter(c => c.active);
  console.log("ClientApp discount codes:", { raw: initialSalon.discount_codes, active: activeCodes });
  
  // Apply discount code - called on input change for instant feedback
  const applyDiscountCode = (code = discountCode) => {
    setDiscountError("");
    if (!code.trim()) return;
    const found = activeCodes.find(c => c.code.toUpperCase() === code.toUpperCase());
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
    const found = activeCodes.find(c => c.code === upperVal);
    if (found) {
      setAppliedDiscount(found);
      setDiscountCode("");
    }
  };

  const getPrice = () => {
    const base = selVariant ? parseFloat(selVariant.price) : parseFloat(sel?.price || 0);
    const extrasTotal = selExtras.reduce((s, e) => s + parseFloat(e.price || 0), 0);
    let total = base + extrasTotal;
    
    // Apply discount
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
    const base = selVariant ? parseFloat(selVariant.price) : parseFloat(sel?.price || 0);
    const extrasTotal = selExtras.reduce((s, e) => s + parseFloat(e.price || 0), 0);
    return base + extrasTotal;
  };
  const getDuration = () => selVariant ? selVariant.duration : (sel?.duration || 0);
  const getServiceLabel = () => {
    let label = svcName(sel);
    if (selVariant) label += " — " + (lang === "nl" ? selVariant.name_nl : (selVariant.name_en || selVariant.name_nl));
    return label;
  };

  const toggleExtra = (extra) => {
    setSelExtras(prev => prev.find(e => e.id === extra.id) ? prev.filter(e => e.id !== extra.id) : [...prev, extra]);
  };

  const reset = () => { setStep(1); setSel(null); setSelVariant(null); setSelExtras([]); setSelStaff(null); setTime(null); setDone(false); setForm({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival" }); setPolicyAgreed(false); setAppliedDiscount(null); setDiscountCode(""); };

  // Responsive hook
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Step titles
  const stepTitles = [t.selectService, t.selectDate, t.yourDetails, t.confirmBooking];

  // Summary component
  const Summary = () => (
    <div style={{ 
      background: "rgba(237,232,224,0.03)", 
      border: "1px solid rgba(237,232,224,0.08)", 
      borderRadius: 16, 
      padding: 20,
      marginTop: isMobile ? 0 : 20
    }}>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(237,232,224,0.35)", marginBottom: 12 }}>
        {lang === "nl" ? "Jouw boeking" : "Your booking"}
      </div>
      {sel && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#ede8e0" }}>{getServiceLabel()}</div>
          <div style={{ fontSize: 12, color: "rgba(237,232,224,0.4)", marginTop: 4 }}>{getDuration()} {t.min}</div>
          {selExtras.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(237,232,224,0.06)" }}>
              {selExtras.map(e => (
                <div key={e.id} style={{ fontSize: 11, color: "rgba(237,232,224,0.5)", display: "flex", justifyContent: "space-between" }}>
                  <span>+ {lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)}</span>
                  <span>€{e.price}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {date && time && (
        <div style={{ marginBottom: 16, paddingTop: sel ? 16 : 0, borderTop: sel ? "1px solid rgba(237,232,224,0.06)" : "none" }}>
          <div style={{ fontSize: 12, color: "rgba(237,232,224,0.5)" }}>
            {new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: accent, marginTop: 4 }}>{time}</div>
        </div>
      )}
      {sel && (
        <div style={{ paddingTop: 16, borderTop: "1px solid rgba(237,232,224,0.06)" }}>
          {appliedDiscount && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#4ade80" }}>
                🏷️ {appliedDiscount.code} ({appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`})
              </span>
              <span style={{ fontSize: 12, color: "rgba(237,232,224,0.4)", textDecoration: "line-through" }}>€{getOriginalPrice().toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "rgba(237,232,224,0.5)" }}>{t.total}</span>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, color: accent }}>€{getPrice().toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Layout>
      <style>{makeCSS(accent)}</style>
      <div style={{ 
        minHeight: "100dvh", 
        background: "#0d0b0a",
        backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -10%, ${accent}08 0%, transparent 60%)`,
        fontFamily: "'Jost',sans-serif", 
        color: "#ede8e0"
      }}>
        
        {/* Desktop Layout */}
        {!isMobile ? (
          <div style={{ display: "flex", minHeight: "100vh" }}>
            {/* Left Sidebar */}
            <div style={{ 
              width: 340, 
              background: "rgba(237,232,224,0.02)", 
              borderRight: "1px solid rgba(237,232,224,0.06)",
              padding: "0",
              display: "flex",
              flexDirection: "column",
              position: "sticky",
              top: 0,
              height: "100vh",
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
                  {onBack && (
                    <button onClick={done ? reset : onBack} className="btn-ghost" style={{ marginBottom: 20, padding: "8px 14px", fontSize: 11 }}>
                      ← {lang === "nl" ? "Terug" : "Back"}
                    </button>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {initialSalon.logo_url && (
                      <img src={initialSalon.logo_url} style={{ width: 50, height: 50, borderRadius: 12, objectFit: "cover", border: "1px solid rgba(237,232,224,0.1)" }} />
                    )}
                    <div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: initialSalon.logo_url ? 22 : 28, fontWeight: 300, color: "#ede8e0", lineHeight: 1.2 }}>
                        {initialSalon.name}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(237,232,224,0.35)", marginTop: 4, letterSpacing: "0.04em" }}>
                        {initialSalon.city}
                      </div>
                    </div>
                  </div>
                </div>

              {/* Progress Steps */}
              {!done && (
                <div style={{ marginBottom: 30 }}>
                  {[1,2,3,4].map(s => (
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
                        border: `2px solid ${step >= s ? accent : "rgba(237,232,224,0.2)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                        color: step >= s ? "#0d0b0a" : "rgba(237,232,224,0.3)",
                        transition: "all 0.3s"
                      }}>
                        {step > s ? "✓" : s}
                      </div>
                      <span style={{ fontSize: 13, color: step >= s ? "#ede8e0" : "rgba(237,232,224,0.3)" }}>
                        {stepTitles[s-1]}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              <Summary />

              {/* Lang Toggle */}
              <div style={{ marginTop: "auto", paddingTop: 20 }}>
                <LangToggle lang={lang} setLang={setLang} />
              </div>
              </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, padding: "50px 60px", maxWidth: 700 }}>
              {!done ? (
                <div key={step} className="fade-up">

              {/* Step 1 — Service selection */}
              {step === 1 && <>
                <PTitle sub={t.selectServiceSub}>{t.selectService}</PTitle>
                {initialSalon.services.map(s => (
                  <div key={s.id}>
                    <div className={`service-card ${sel?.id === s.id ? "sel" : ""}`} onClick={() => { setSel(s); setSelVariant(null); setSelExtras([]); }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{svcName(s)}</div>
                          <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginTop: 3 }}>
                            {s.duration} {t.min}
                            {(s.photos || []).length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} {t.photos.toLowerCase()}</span>}
                            {(s.variants?.length > 0) && <span style={{ color: accent, marginLeft: 8 }}>· {s.variants.length} {t.variants.toLowerCase()}</span>}
                          </div>
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>
                          {s.variants?.length > 0 ? `€${Math.min(...s.variants.map(v => parseFloat(v.price)))}+` : `€${s.price}`}
                        </div>
                      </div>
                      {(s.photos || []).length > 0 && (
                        <div className="photo-grid">
                          {s.photos.map((p, i) => (
                            <img key={p.id || i} src={p.url || p} className="photo-thumb" onClick={e => { e.stopPropagation(); setGallery({ photos: s.photos, idx: i }); }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Variants */}
                    {sel?.id === s.id && s.variants?.length > 0 && (
                      <div style={{ marginLeft: 12, marginBottom: 10 }}>
                        <SL>{t.selectVariant}</SL>
                        {s.variants.map(v => (
                          <div key={v.id} className={`service-card ${selVariant?.id === v.id ? "sel" : ""}`} style={{ padding: "12px 14px", marginBottom: 6 }} onClick={() => setSelVariant(v)}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{lang === "nl" ? v.name_nl : (v.name_en || v.name_nl)}</div>
                                {v.description_nl && <div style={{ fontSize: 10, color: "rgba(237,232,224,0.35)", marginTop: 2 }}>{lang === "nl" ? v.description_nl : (v.description_en || v.description_nl)}</div>}
                                <div style={{ fontSize: 10, color: "rgba(237,232,224,0.35)", marginTop: 2 }}>{v.duration} {t.min}</div>
                              </div>
                              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{v.price}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Extras */}
                    {sel?.id === s.id && s.extras?.length > 0 && (
                      <div style={{ marginLeft: 12, marginBottom: 10 }}>
                        <SL>{t.selectExtras}</SL>
                        {s.extras.map(e => (
                          <div key={e.id} className={`service-card ${selExtras.find(x => x.id === e.id) ? "sel" : ""}`} style={{ padding: "10px 14px", marginBottom: 4 }} onClick={() => toggleExtra(e)}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontWeight: 500, fontSize: 12 }}>+ {lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)}</div>
                              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: accent }}>+€{e.price}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Staff selection */}
                    {sel?.id === s.id && availableStaff.length > 0 && (
                      <div style={{ marginLeft: 12, marginBottom: 10 }}>
                        <SL>{t.selectStaff}</SL>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <div className={`service-card ${!selStaff ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => setSelStaff(null)}>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{t.anyStaff}</div>
                          </div>
                          {availableStaff.map(m => (
                            <div key={m.id} className={`service-card ${selStaff?.id === m.id ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => setSelStaff(m)}>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</div>
                              {m.role && <div style={{ fontSize: 9, color: "rgba(237,232,224,0.3)" }}>{m.role}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ marginTop: 14 }}>
                  <button className="btn-primary" disabled={!sel || (sel.variants?.length > 0 && !selVariant)} onClick={() => setStep(2)}>{t.next}</button>
                </div>
                
                {/* Reviews */}
                {initialSalon.reviews?.length > 0 && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(237,232,224,0.06)" }}>
                    <SL>{t.reviews} ({initialSalon.reviews.length}) · {(initialSalon.reviews.reduce((s,r) => s + r.rating, 0) / initialSalon.reviews.length).toFixed(1)} ★</SL>
                    {initialSalon.reviews.slice(0, 3).map(r => (
                      <div key={r.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(237,232,224,0.04)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontWeight: 500, fontSize: 12 }}>{r.client_name.split(" ")[0]}</span>
                          <span style={{ color: accent, fontSize: 12 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                        </div>
                        {r.comment && <div style={{ fontSize: 11, color: "rgba(237,232,224,0.45)", lineHeight: 1.5 }}>{r.comment}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </>}

              {/* Step 2 — Date & Time */}
              {step === 2 && <>
                <PTitle sub={t.selectDateSub}>{t.selectDate}</PTitle>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                  {days.slice(0,10).map((d, i) => {
                    const ds = fmt(d); 
                    const isSel = date === ds;
                    const dayOfWeek = d.getDay();
                    const dayHours = initialSalon.business_hours?.[dayOfWeek] || DEFAULT_HOURS[dayOfWeek];
                    const isClosed = dayHours.closed;
                    return (
                      <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} onClick={() => { if (!isClosed) { setDate(ds); setTime(null); } }} style={isClosed ? { opacity: 0.35, cursor: "not-allowed" } : {}}>
                        <span style={{ fontSize: 10, color: isSel ? "#0d0b0a" : "rgba(237,232,224,0.35)" }}>{DAY[d.getDay()]}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? "#0d0b0a" : "#ede8e0", marginTop: 2 }}>{d.getDate()}</span>
                        <span style={{ fontSize: 9, color: isSel ? "#0d0b0a" : "rgba(237,232,224,0.25)" }}>{isClosed ? (lang === "nl" ? "gesloten" : "closed") : MON[d.getMonth()]}</span>
                      </div>
                    );
                  })}
                </div>
                <SL>{t.selectTime}</SL>
                {(() => {
                  const selectedDate = new Date(date);
                  const dayOfWeek = selectedDate.getDay();
                  const dayHours = initialSalon.business_hours?.[dayOfWeek] || DEFAULT_HOURS[dayOfWeek];
                  const availableTimes = TIMES.filter(tt => !dayHours.closed && tt >= dayHours.open && tt < dayHours.close);
                  return availableTimes.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 20 }}>
                      {availableTimes.map(tt => <div key={tt} className={`time-chip ${time === tt ? "sel" : ""}`} onClick={() => setTime(tt)}>{tt}</div>)}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "30px 20px", color: "rgba(237,232,224,0.35)", fontSize: 13, marginBottom: 20 }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input className="input-field" placeholder={t.firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                    <input className="input-field" placeholder={t.lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                  </div>
                  <input className="input-field" placeholder={t.email} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
                  <input className="input-field" placeholder={`${t.phone}${initialSalon.phone_required ? ` (${t.required})` : ` (${t.optional})`}`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={initialSalon.phone_required && !form.phone ? { borderColor: "rgba(248,113,113,0.3)" } : {}} />
                </div>
                <SL>{t.payMethod}</SL>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {[["on-arrival","🏠",t.payArrival],["online","💳",t.payOnline]].map(([v,icon,label]) => (
                    <div key={v} className={`pay-opt ${form.payment === v ? "sel" : ""}`} onClick={() => setForm(f => ({...f, payment: v}))}>
                      <div className={`radio ${form.payment === v ? "on" : ""}`} />
                      <span style={{ fontSize: 15 }}>{icon}</span>
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
                      <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 500 }}>🏷️ {t.codeApplied}</div>
                      <div style={{ fontSize: 11, color: "rgba(237,232,224,0.5)" }}>{appliedDiscount.code}: {appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`}</div>
                    </div>
                    <div onClick={() => setAppliedDiscount(null)} style={{ cursor: "pointer", fontSize: 12, color: "rgba(237,232,224,0.4)" }}>✕</div>
                  </div>
                )}

                {/* Booking Policy */}
                {initialSalon.booking_policy && (
                  <div style={{ marginBottom: 20, padding: "16px", background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.08)", borderRadius: 14 }}>
                    <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.bookingPolicy}</div>
                    <div style={{ fontSize: 12, color: "rgba(237,232,224,0.6)", lineHeight: 1.6, marginBottom: 14, whiteSpace: "pre-wrap" }}>{initialSalon.booking_policy}</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <div onClick={() => setPolicyAgreed(!policyAgreed)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${policyAgreed ? accent : "rgba(237,232,224,0.2)"}`, background: policyAgreed ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                        {policyAgreed && <span style={{ color: "#0d0b0a", fontSize: 14, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: policyAgreed ? "#ede8e0" : "rgba(237,232,224,0.5)" }}>{t.agreeToPolicy}</span>
                    </label>
                  </div>
                )}

                <button className="btn-primary" disabled={!canConfirm} onClick={() => setStep(4)}>{t.next}</button>
              </>}

              {/* Step 4 — Confirm */}
              {step === 4 && <>
                <PTitle sub={t.confirmSub}>{t.confirmBooking}</PTitle>
                <div style={{ background: `${accent}09`, border: `1px solid ${accent}22`, borderRadius: 20, padding: "4px 18px", marginBottom: 20 }}>
                  {[[t.treatment, getServiceLabel()],[t.date, date],[t.time, time],[t.name, `${form.firstName} ${form.lastName}`],
                    ...(selStaff ? [[t.staff, selStaff.name]] : []),
                    [t.payment, form.payment === "online" ? t.payOnline : t.payArrival]].map(([l,v]) => (
                    <div key={l} className="confirm-row">
                      <span style={{ fontSize: 11, color: "rgba(237,232,224,0.38)", letterSpacing: "0.04em" }}>{l}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                  {selExtras.length > 0 && (
                    <div className="confirm-row">
                      <span style={{ fontSize: 11, color: "rgba(237,232,224,0.38)", letterSpacing: "0.04em" }}>{t.extras}</span>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{selExtras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ")}</span>
                    </div>
                  )}
                  {appliedDiscount && (
                    <div className="confirm-row">
                      <span style={{ fontSize: 11, color: "#4ade80", letterSpacing: "0.04em" }}>🏷️ {t.discount}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#4ade80" }}>{appliedDiscount.code} ({appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`})</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: accent }}>{t.total}</span>
                    <div>
                      {appliedDiscount && <span style={{ fontSize: 14, color: "rgba(237,232,224,0.4)", textDecoration: "line-through", marginRight: 10 }}>€{getOriginalPrice().toFixed(2)}</span>}
                      <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: accent }}>€{getPrice().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <button className="btn-primary" onClick={async () => {
                  const apptData = {
                    owner_id: initialSalon.owner_id, service_id: sel?.id || null,
                    service_name: getServiceLabel() + (selExtras.length > 0 ? " + " + selExtras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ") : "") + (appliedDiscount ? ` [${appliedDiscount.code}]` : ""),
                    service_price: getPrice(), service_duration: getDuration(), date, time,
                    client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, client_phone: form.phone || null,
                    payment_method: form.payment, status: "confirmed", invoice_sent: false,
                    staff_id: selStaff?.id || null, staff_name: selStaff?.name || null
                  };
                  await supabase.from("appointments").insert(apptData);
                  setDone(true);
                  await sendEmails("booking_confirmation", {
                    client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, service_name: apptData.service_name,
                    date, time, payment: form.payment, price: getPrice(), salon_name: initialSalon.name, owner_email: initialSalon.owner_email || "info@vellu.cc"
                  });
                  if (form.payment === "online") {
                    await sendEmails("invoice", { client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, service_name: apptData.service_name,
                      date, time, price: getPrice(), salon_name: initialSalon.name });
                  }
                }}>{t.confirm}</button>
              </>}
            </div>
          ) : (
            <div className="fade-up" style={{ textAlign: "center", paddingTop: 60 }}>
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: `${accent}18`, border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", fontSize: 28 }}>💅</div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>{t.confirmed}</div>
              <div style={{ fontSize: 12, color: "rgba(237,232,224,0.42)", marginBottom: 6 }}>{t.confirmedSub} <strong style={{ color: accent }}>{date}</strong> {t.at} <strong style={{ color: accent }}>{time}</strong></div>
              <div style={{ fontSize: 11, color: "rgba(237,232,224,0.22)", marginBottom: 28 }}>{t.confirmationSent} {form.email}</div>

              {/* Calendar sync buttons */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(237,232,224,0.25)", marginBottom: 10 }}>{t.addToCalendar}</div>
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
                  }}>📅 {t.googleCalendar}</button>
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
                  }}>🗓 {t.appleCalendar}</button>
                </div>
              </div>

              <button className="btn-primary" style={{ maxWidth: 200, margin: "0 auto", marginBottom: 28 }} onClick={reset}>{t.newBooking}</button>

              {/* Write a review */}
              <ReviewForm salon={initialSalon} clientName={`${form.firstName} ${form.lastName}`} clientEmail={form.email} lang={lang} t={t} accent={accent} />
            </div>
          )}

          {/* Reviews section - always visible at bottom when not in booking flow */}
          {!done && step === 1 && initialSalon.reviews?.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(237,232,224,0.06)" }}>
              <SL>{t.reviews} ({initialSalon.reviews.length}) · {(initialSalon.reviews.reduce((s,r) => s + r.rating, 0) / initialSalon.reviews.length).toFixed(1)} ★</SL>
              {initialSalon.reviews.slice(0, 3).map(r => (
                <div key={r.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(237,232,224,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontWeight: 500, fontSize: 12 }}>{(() => { const parts = r.client_name.split(" "); return parts[0] + (parts[1] ? " " + parts[1][0] + "." : ""); })()}</span>
                    <span style={{ color: accent, fontSize: 12 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  </div>
                  {r.comment && <div style={{ fontSize: 11, color: "rgba(237,232,224,0.45)", lineHeight: 1.5 }}>{r.comment}</div>}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      ) : (
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
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
                {onBack && (
                  <button onClick={done ? reset : (step > 1 ? () => { if (step === 2 && sel?.variants?.length > 0) { setSelVariant(null); setSelExtras([]); } setStep(s => s-1); } : onBack)} style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "none", borderRadius: 100, padding: "8px 14px", color: "#fff", fontSize: 12, cursor: "pointer" }}>
                    ←
                  </button>
                )}
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <LangToggle lang={lang} setLang={setLang} />
                </div>
              </div>
            )}

            {/* Mobile Header with Logo */}
            {!initialSalon.cover_image_url ? (
              <Header
                title={initialSalon.name}
                subtitle={initialSalon.city}
                onBack={done ? reset : (step > 1 ? () => { if (step === 2 && sel?.variants?.length > 0) { setSelVariant(null); setSelExtras([]); } setStep(s => s-1); } : onBack)}
                right={<LangToggle lang={lang} setLang={setLang} />}
                accent={accent}
              />
            ) : (
              <div style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(237,232,224,0.06)" }}>
                {initialSalon.logo_url && (
                  <img src={initialSalon.logo_url} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(237,232,224,0.1)" }} />
                )}
                <div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 400, color: "#ede8e0" }}>{initialSalon.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)" }}>{initialSalon.city}</div>
                </div>
              </div>
            )}

            {/* Mobile Content */}
            <div style={{ flex: 1, overflow: "auto", padding: "14px 22px 120px" }}>
              {!done ? (
                <div key={step} className="fade-up">
                  {/* Progress bar */}
                  <div style={{ display: "flex", gap: 5, margin: "12px 0 22px" }}>
                    {[1,2,3,4].map(s => <div key={s} style={{ flex:1, height:2, borderRadius:4, background: step >= s ? accent : "rgba(237,232,224,0.08)", transition:"background 0.4s" }} />)}
                  </div>

                  {/* Step 1 — Service selection */}
                  {step === 1 && <>
                    <PTitle sub={t.selectServiceSub}>{t.selectService}</PTitle>
                    {initialSalon.services.map(s => (
                      <div key={s.id}>
                        <div className={`service-card ${sel?.id === s.id ? "sel" : ""}`} onClick={() => { setSel(s); setSelVariant(null); setSelExtras([]); }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 14 }}>{svcName(s)}</div>
                              <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginTop: 3 }}>
                                {s.duration} {t.min}
                                {(s.photos || []).length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} {t.photos.toLowerCase()}</span>}
                                {(s.variants?.length > 0) && <span style={{ color: accent, marginLeft: 8 }}>· {s.variants.length} {t.variants.toLowerCase()}</span>}
                              </div>
                            </div>
                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>
                              {s.variants?.length > 0 ? `€${Math.min(...s.variants.map(v => parseFloat(v.price)))}+` : `€${s.price}`}
                            </div>
                          </div>
                          {(s.photos || []).length > 0 && (
                            <div className="photo-grid">
                              {s.photos.map((p, i) => (
                                <img key={p.id || i} src={p.url || p} className="photo-thumb" onClick={e => { e.stopPropagation(); setGallery({ photos: s.photos, idx: i }); }} />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Variants */}
                        {sel?.id === s.id && s.variants?.length > 0 && (
                          <div style={{ marginLeft: 12, marginBottom: 10 }}>
                            <SL>{t.selectVariant}</SL>
                            {s.variants.map(v => (
                              <div key={v.id} className={`service-card ${selVariant?.id === v.id ? "sel" : ""}`} style={{ padding: "12px 14px", marginBottom: 6 }} onClick={() => setSelVariant(v)}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div>
                                    <div style={{ fontWeight: 500, fontSize: 13 }}>{lang === "nl" ? v.name_nl : (v.name_en || v.name_nl)}</div>
                                    {v.description_nl && <div style={{ fontSize: 10, color: "rgba(237,232,224,0.35)", marginTop: 2 }}>{lang === "nl" ? v.description_nl : (v.description_en || v.description_nl)}</div>}
                                    <div style={{ fontSize: 10, color: "rgba(237,232,224,0.35)", marginTop: 2 }}>{v.duration} {t.min}</div>
                                  </div>
                                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{v.price}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Extras */}
                        {sel?.id === s.id && s.extras?.length > 0 && (
                          <div style={{ marginLeft: 12, marginBottom: 10 }}>
                            <SL>{t.selectExtras}</SL>
                            {s.extras.map(e => (
                              <div key={e.id} className={`service-card ${selExtras.find(x => x.id === e.id) ? "sel" : ""}`} style={{ padding: "10px 14px", marginBottom: 4 }} onClick={() => toggleExtra(e)}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ fontWeight: 500, fontSize: 12 }}>+ {lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)}</div>
                                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: accent }}>+€{e.price}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Staff selection */}
                        {sel?.id === s.id && availableStaff.length > 0 && (
                          <div style={{ marginLeft: 12, marginBottom: 10 }}>
                            <SL>{t.selectStaff}</SL>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <div className={`service-card ${!selStaff ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => setSelStaff(null)}>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{t.anyStaff}</div>
                              </div>
                              {availableStaff.map(m => (
                                <div key={m.id} className={`service-card ${selStaff?.id === m.id ? "sel" : ""}`} style={{ padding: "10px 14px", flex: "0 0 auto" }} onClick={() => setSelStaff(m)}>
                                  <div style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</div>
                                  {m.role && <div style={{ fontSize: 9, color: "rgba(237,232,224,0.3)" }}>{m.role}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{ marginTop: 14 }}>
                      <button className="btn-primary" disabled={!sel || (sel.variants?.length > 0 && !selVariant)} onClick={() => setStep(2)}>{t.next}</button>
                    </div>
                  </>}

                  {/* Step 2 — Date & Time (mobile) */}
                  {step === 2 && <>
                    <PTitle sub={t.selectDateSub}>{t.selectDate}</PTitle>
                    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                      {days.slice(0,10).map((d, i) => {
                        const ds = fmt(d); 
                        const isSel = date === ds;
                        const dayOfWeek = d.getDay();
                        const dayHours = initialSalon.business_hours?.[dayOfWeek] || DEFAULT_HOURS[dayOfWeek];
                        const isClosed = dayHours.closed;
                        return (
                          <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} onClick={() => { if (!isClosed) { setDate(ds); setTime(null); } }} style={isClosed ? { opacity: 0.35, cursor: "not-allowed" } : {}}>
                            <span style={{ fontSize: 10, color: isSel ? "#0d0b0a" : "rgba(237,232,224,0.35)" }}>{DAY[d.getDay()]}</span>
                            <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? "#0d0b0a" : "#ede8e0", marginTop: 2 }}>{d.getDate()}</span>
                            <span style={{ fontSize: 9, color: isSel ? "#0d0b0a" : "rgba(237,232,224,0.25)" }}>{isClosed ? (lang === "nl" ? "gesloten" : "closed") : MON[d.getMonth()]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <SL>{t.selectTime}</SL>
                    {(() => {
                      const selectedDate = new Date(date);
                      const dayOfWeek = selectedDate.getDay();
                      const dayHours = initialSalon.business_hours?.[dayOfWeek] || DEFAULT_HOURS[dayOfWeek];
                      const availableTimes = TIMES.filter(tt => !dayHours.closed && tt >= dayHours.open && tt < dayHours.close);
                      return availableTimes.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 20 }}>
                          {availableTimes.map(tt => <div key={tt} className={`time-chip ${time === tt ? "sel" : ""}`} onClick={() => setTime(tt)}>{tt}</div>)}
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", padding: "30px 20px", color: "rgba(237,232,224,0.35)", fontSize: 13, marginBottom: 20 }}>
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
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <input className="input-field" placeholder={t.firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                        <input className="input-field" placeholder={t.lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                      </div>
                      <input className="input-field" placeholder={t.email} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
                      <input className="input-field" placeholder={`${t.phone}${initialSalon.phone_required ? ` (${t.required})` : ` (${t.optional})`}`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={initialSalon.phone_required && !form.phone ? { borderColor: "rgba(248,113,113,0.3)" } : {}} />
                    </div>
                    <SL>{t.payMethod}</SL>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                      {[["on-arrival","🏠",t.payArrival],["online","💳",t.payOnline]].map(([v,icon,label]) => (
                        <div key={v} className={`pay-opt ${form.payment === v ? "sel" : ""}`} onClick={() => setForm(f => ({...f, payment: v}))}>
                          <div className={`radio ${form.payment === v ? "on" : ""}`} />
                          <span style={{ fontSize: 15 }}>{icon}</span>
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
                          <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 500 }}>🏷️ {t.codeApplied}</div>
                          <div style={{ fontSize: 10, color: "rgba(237,232,224,0.5)" }}>{appliedDiscount.code}: {appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`}</div>
                        </div>
                        <div onClick={() => setAppliedDiscount(null)} style={{ cursor: "pointer", fontSize: 12, color: "rgba(237,232,224,0.4)" }}>✕</div>
                      </div>
                    )}

                    {/* Booking Policy (mobile) */}
                    {initialSalon.booking_policy && (
                      <div style={{ marginBottom: 20, padding: "14px", background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.08)", borderRadius: 14 }}>
                        <div style={{ fontSize: 10, color: "rgba(237,232,224,0.35)", marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.bookingPolicy}</div>
                        <div style={{ fontSize: 11, color: "rgba(237,232,224,0.6)", lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{initialSalon.booking_policy}</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <div onClick={() => setPolicyAgreed(!policyAgreed)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${policyAgreed ? accent : "rgba(237,232,224,0.2)"}`, background: policyAgreed ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                            {policyAgreed && <span style={{ color: "#0d0b0a", fontSize: 12, fontWeight: 700 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 12, color: policyAgreed ? "#ede8e0" : "rgba(237,232,224,0.5)" }}>{t.agreeToPolicy}</span>
                        </label>
                      </div>
                    )}

                    <button className="btn-primary" disabled={!canConfirm} onClick={() => setStep(4)}>{t.next}</button>
                  </>}

                  {/* Step 4 — Confirm (mobile) */}
                  {step === 4 && <>
                    <PTitle sub={t.confirmSub}>{t.confirmBooking}</PTitle>
                    <div style={{ background: `${accent}09`, border: `1px solid ${accent}22`, borderRadius: 20, padding: "4px 18px", marginBottom: 20 }}>
                      {[[t.treatment, getServiceLabel()],[t.date, date],[t.time, time],[t.name, `${form.firstName} ${form.lastName}`],
                        ...(selStaff ? [[t.staff, selStaff.name]] : []),
                        [t.payment, form.payment === "online" ? t.payOnline : t.payArrival]].map(([l,v]) => (
                        <div key={l} className="confirm-row">
                          <span style={{ fontSize: 11, color: "rgba(237,232,224,0.38)", letterSpacing: "0.04em" }}>{l}</span>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                        </div>
                      ))}
                      {selExtras.length > 0 && (
                        <div className="confirm-row">
                          <span style={{ fontSize: 11, color: "rgba(237,232,224,0.38)", letterSpacing: "0.04em" }}>{t.extras}</span>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{selExtras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ")}</span>
                        </div>
                      )}
                      {appliedDiscount && (
                        <div className="confirm-row">
                          <span style={{ fontSize: 11, color: "#4ade80", letterSpacing: "0.04em" }}>🏷️ {t.discount}</span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "#4ade80" }}>{appliedDiscount.code} ({appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`})</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: accent }}>{t.total}</span>
                        <div>
                          {appliedDiscount && <span style={{ fontSize: 14, color: "rgba(237,232,224,0.4)", textDecoration: "line-through", marginRight: 8 }}>€{getOriginalPrice().toFixed(2)}</span>}
                          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: accent }}>€{getPrice().toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <button className="btn-primary" onClick={async () => {
                      const apptData = {
                        owner_id: initialSalon.owner_id, service_id: sel?.id || null,
                        service_name: getServiceLabel() + (selExtras.length > 0 ? " + " + selExtras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ") : "") + (appliedDiscount ? ` [${appliedDiscount.code}]` : ""),
                        service_price: getPrice(), service_duration: getDuration(), date, time,
                        client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, client_phone: form.phone || null,
                        payment_method: form.payment, status: "confirmed", invoice_sent: false,
                        staff_id: selStaff?.id || null, staff_name: selStaff?.name || null
                      };
                      await supabase.from("appointments").insert(apptData);
                      setDone(true);
                      await sendEmails("booking_confirmation", {
                        client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, service_name: apptData.service_name,
                        date, time, payment: form.payment, price: getPrice(), salon_name: initialSalon.name, owner_email: initialSalon.owner_email || "info@vellu.cc"
                      });
                      if (form.payment === "online") {
                        await sendEmails("invoice", { client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, service_name: apptData.service_name,
                          date, time, price: getPrice(), salon_name: initialSalon.name });
                      }
                    }}>{t.confirm}</button>
                  </>}

                  {/* Reviews on mobile step 1 */}
                  {step === 1 && initialSalon.reviews?.length > 0 && (
                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(237,232,224,0.06)" }}>
                      <SL>{t.reviews} ({initialSalon.reviews.length}) · {(initialSalon.reviews.reduce((s,r) => s + r.rating, 0) / initialSalon.reviews.length).toFixed(1)} ★</SL>
                      {initialSalon.reviews.slice(0, 3).map(r => (
                        <div key={r.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(237,232,224,0.04)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <span style={{ fontWeight: 500, fontSize: 12 }}>{r.client_name.split(" ")[0]}</span>
                            <span style={{ color: accent, fontSize: 12 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                          </div>
                          {r.comment && <div style={{ fontSize: 11, color: "rgba(237,232,224,0.45)", lineHeight: 1.5 }}>{r.comment}</div>}
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
                  <p style={{ color: "rgba(237,232,224,0.5)", fontSize: 14, marginBottom: 30 }}>
                    {t.confirmedSub} {new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })} {t.at} {time}
                  </p>
                  <p style={{ fontSize: 12, color: "rgba(237,232,224,0.35)", marginBottom: 30 }}>{t.confirmationSent} {form.email}</p>
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(237,232,224,0.25)", marginBottom: 10 }}>{t.addToCalendar}</div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: "10px 16px" }} onClick={() => {
                        const dur = getDuration(); const start = new Date(date + "T" + time + ":00"); const end = new Date(start.getTime() + dur * 60000);
                        const fmt2 = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                        const title = encodeURIComponent(getServiceLabel() + " @ " + initialSalon.name);
                        window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt2(start)}/${fmt2(end)}`, "_blank");
                      }}>📅 {t.googleCalendar}</button>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: "10px 16px" }} onClick={() => {
                        const dur = getDuration(); const start = new Date(date + "T" + time + ":00"); const end = new Date(start.getTime() + dur * 60000);
                        const fmt2 = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                        const ics = ["BEGIN:VCALENDAR","VERSION:2.0","BEGIN:VEVENT",`DTSTART:${fmt2(start)}`,`DTEND:${fmt2(end)}`,`SUMMARY:${getServiceLabel()} @ ${initialSalon.name}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
                        const blob = new Blob([ics], { type: "text/calendar" }); const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `booking.ics`; a.click();
                      }}>🗓 {t.appleCalendar}</button>
                    </div>
                  </div>
                  <button className="btn-primary" style={{ maxWidth: 200, margin: "0 auto", marginBottom: 28 }} onClick={reset}>{t.newBooking}</button>
                  <ReviewForm salon={initialSalon} clientName={`${form.firstName} ${form.lastName}`} clientEmail={form.email} lang={lang} t={t} accent={accent} />
                </div>
              )}
            </div>

            {/* Mobile bottom summary bar */}
            {!done && sel && (
              <div style={{ 
                position: "fixed", bottom: 0, left: 0, right: 0, 
                background: "rgba(13,11,10,0.97)", backdropFilter: "blur(24px)", 
                borderTop: "1px solid rgba(237,232,224,0.08)", padding: "12px 22px",
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(237,232,224,0.5)" }}>{svcName(sel)}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: accent }}>€{getPrice()}</div>
                </div>
                {time && <div style={{ fontSize: 14, fontWeight: 600, color: accent }}>{time}</div>}
              </div>
            )}
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
      </div>
    </Layout>
  );
}

// ─── VARIANT & EXTRA ADDERS ─────────────────────────────────
function VariantAdder({ serviceId, lang, t, accent, onAdd }) {
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
    <div style={{ background: "rgba(237,232,224,0.02)", border: "1px solid rgba(237,232,224,0.06)", borderRadius: 12, padding: 10, marginTop: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
        <input className="input-field" placeholder="Naam (NL) *" value={form.name_nl} onChange={e => setForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Name (EN)" value={form.name_en} onChange={e => setForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Omschrijving (NL)" value={form.description_nl} onChange={e => setForm(f => ({...f, description_nl: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Description (EN)" value={form.description_en} onChange={e => setForm(f => ({...f, description_en: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="€ Prijs *" type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Duur (min)" type="number" value={form.duration} onChange={e => setForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
      </div>
      {(!form.name_nl || !form.price) && <div style={{ fontSize: 9, color: "rgba(237,232,224,0.2)", marginBottom: 4 }}>* {lang === "nl" ? "Vul naam en prijs in" : "Fill in name and price"}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "✓ Toevoegen" : "✓ Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}>✕</button>
      </div>
    </div>
  );
}

function ExtraAdder({ serviceId, lang, t, accent, onAdd }) {
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
    <div style={{ background: "rgba(237,232,224,0.02)", border: "1px solid rgba(237,232,224,0.06)", borderRadius: 12, padding: 10, marginTop: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
        <input className="input-field" placeholder="Naam (NL) *" value={form.name_nl} onChange={e => setForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="Name (EN)" value={form.name_en} onChange={e => setForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
        <input className="input-field" placeholder="€ Prijs *" type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px" }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "✓ Toevoegen" : "✓ Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}>✕</button>
      </div>
    </div>
  );
}

// ─── STAFF ADDER ────────────────────────────────────────────
function StaffAdder({ ownerId, services, lang, t, accent, onAdd }) {
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
    <div style={{ background: "rgba(237,232,224,0.02)", border: "1px solid rgba(237,232,224,0.06)", borderRadius: 12, padding: 12, marginTop: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        <input className="input-field" placeholder={t.staffName + " *"} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
        <input className="input-field" placeholder={t.staffRole} value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} style={{ fontSize: 12, padding: "10px 12px" }} />
      </div>
      {services.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,232,224,0.25)", marginBottom: 6 }}>{t.services}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {services.map(s => {
              const isOn = selServices.includes(s.id);
              return (
                <div key={s.id} onClick={() => setSelServices(prev => isOn ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                  style={{ fontSize: 10, padding: "5px 10px", borderRadius: 100, cursor: "pointer", border: `1px solid ${isOn ? accent : "rgba(237,232,224,0.12)"}`, background: isOn ? `${accent}18` : "transparent", color: isOn ? accent : "rgba(237,232,224,0.5)", transition: "all 0.2s" }}>
                  {s.name_nl || s.name}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "✓ Toevoegen" : "✓ Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}>✕</button>
      </div>
    </div>
  );
}

// ─── OWNER DASHBOARD ─────────────────────────────────────────
function OwnerApp({ user, onLogout, lang, setLang, salons = DEMO_SALONS, onSalonUpdate }) {
  const t = T[lang];
  const DAY = lang === "nl" ? DAY_NL : DAY_EN;

  const [view, setView] = useState("dashboard");
  const [calDate, setCalDate] = useState(fmt(today));
  const [salonData, setSalonData] = useState(() => {
    return { 
      id: user.slug, name: user.name, city: user.city || "Nederland", accent: ACCENT, 
      services: [], appointments: [], business_hours: DEFAULT_HOURS,
      booking_policy: "", phone_required: false, logo_url: "", cover_image_url: "", discount_codes: []
    };
  });
  const [saved, setSaved] = useState(false);
  const [newSvc, setNewSvc] = useState({ name_nl: "", name_en: "", price: "", duration: "60" });
  const [svcError, setSvcError] = useState("");
  const [gallery, setGallery] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [newDiscount, setNewDiscount] = useState({ code: "", amount: "", type: "percent", active: true });
  const fileRefs = useRef({});

  // Load salon data from Supabase
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("profiles").select("*, services(*, service_variants(*), service_extras(*), service_photos(*))").eq("slug", user.slug).single();
      console.log("OwnerApp loaded data:", { discount_codes: data?.discount_codes, error });
      if (data) {
        // Load appointments
        const { data: appts } = await supabase.from("appointments").select("*").eq("owner_id", data.id).order("date", { ascending: false });
        // Load reviews
        const { data: reviews } = await supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false });
        // Load staff
        const { data: staffData } = await supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).order("position");
        
        // Parse discount_codes - handle both string and array formats
        let parsedDiscountCodes = [];
        if (data.discount_codes) {
          if (typeof data.discount_codes === "string") {
            try { parsedDiscountCodes = JSON.parse(data.discount_codes); } catch (e) { parsedDiscountCodes = []; }
          } else if (Array.isArray(data.discount_codes)) {
            parsedDiscountCodes = data.discount_codes;
          }
        }
        
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
          phone_required: data.phone_required || false,
          logo_url: data.logo_url || "",
          cover_image_url: data.cover_image_url || "",
          discount_codes: parsedDiscountCodes,
          services: (data.services || []).map(s => ({
            ...s,
            name_nl: s.name_nl || s.name || "",
            name_en: s.name_en || s.name || "",
            photos: (s.service_photos || []).map(p => ({ id: p.id, url: p.photo_url })),
            variants: (s.service_variants || []).sort((a,b) => (a.position||0) - (b.position||0)),
            extras: s.service_extras || []
          })),
          appointments: appts || [],
          reviews: reviews || [],
          staff: (staffData || []).map(s => ({ ...s, service_ids: (s.staff_services || []).map(ss => ss.service_id) }))
        }));
      }
    };
    load();
  }, [user.slug]);

  const accent = salonData.accent;
  const appts = salonData.appointments;
  const completedAppts = appts.filter(a => a.status === "completed");
  const todayAppts = appts.filter(a => a.date === fmt(today));
  const calAppts = appts.filter(a => a.date === calDate);
  const totalEarnings = completedAppts.reduce((s, a) => s + a.service_price, 0);
  const days = getDays();

  const update = (fn) => setSalonData(d => {
    const updated = fn({...d});
    if (onSalonUpdate) onSalonUpdate(updated);
    return updated;
  });
  const markComplete = async (id) => {
    await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
    update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, status:"completed"} : a); return d; });
  };
  const sendInvoice = async (id) => {
    const a = salonData.appointments.find(x => x.id === id);
    if (a) {
      await sendEmails("invoice", {
        client_name: a.client_name,
        client_email: a.client_email,
        service_name: a.service_name,
        date: a.date,
        price: a.service_price,
        salon_name: salonData.name
      });
      await supabase.from("appointments").update({ invoice_sent: true }).eq("id", id);
    }
    update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, invoice_sent:true} : a); return d; });
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

  const addPhoto = async (serviceId, file) => {
    console.log("addPhoto called:", { serviceId, fileName: file.name, ownerId: salonData.owner_id });
    
    // Upload to Supabase Storage
    const fileName = `${salonData.owner_id}/${serviceId}/${Date.now()}_${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("service-photos")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });
    
    if (uploadError) {
      console.error("Upload error:", uploadError);
      alert("Foto upload mislukt: " + uploadError.message);
      return;
    }
    console.log("Upload success:", uploadData);
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("service-photos")
      .getPublicUrl(fileName);
    console.log("Public URL:", publicUrl);
    
    // Save to database
    const { data: photoData, error: dbError } = await supabase.from("service_photos").insert({
      service_id: serviceId,
      photo_url: publicUrl,
      position: 0
    }).select().single();
    
    if (dbError) {
      console.error("DB error:", dbError);
      alert("Database fout: " + dbError.message);
      return;
    }
    console.log("Photo saved to DB:", photoData);
    
    // Update local state
    update(d => { 
      d.services = d.services.map(s => s.id === serviceId ? {...s, photos: [...(s.photos || []), { id: photoData.id, url: publicUrl }]} : s); 
      return d; 
    });
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
      const fmt2 = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
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
    <div className="appt-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{a.client_name}</div>
          <div style={{ fontSize: 11, color: "rgba(237,232,224,0.38)", marginTop: 3 }}>{a.time} · {a.service_name}</div>
          <div style={{ fontSize: 10, color: "rgba(237,232,224,0.22)", marginTop: 2 }}>{a.client_email}{a.staff_name ? ` · ${a.staff_name}` : ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span className={`badge badge-${a.status}`}>{a.status === "confirmed" ? (lang === "nl" ? "Bevestigd" : "Confirmed") : (lang === "nl" ? "Voltooid" : "Completed")}</span>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{a.service_price}</span>
        </div>
      </div>
      {a.status === "confirmed" && <button className="btn-ghost" style={{ width:"100%", fontSize:10 }} onClick={() => markComplete(a.id)}>{t.markComplete}</button>}
      {a.status === "completed" && !a.invoice_sent && <button className="btn-primary" style={{ fontSize:11, marginTop:4 }} onClick={() => sendInvoice(a.id)}>{t.sendInvoice}</button>}
      {a.status === "completed" && a.invoice_sent && <div style={{ fontSize:11, color:"#86efac", marginTop:6 }}>{t.invoiceSent}</div>}
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
    ["dashboard", "◈", t.dashboard],
    ["agenda", "◎", t.agenda],
    ["analytics", "◇", t.analytics],
    ["facturen", "✦", t.invoices],
    ["instellingen", "⊙", t.settings]
  ];

  return (
    <Layout accent={accent}>
      <div style={{ 
        background: "#0d0b0a", 
        minHeight: "100dvh", 
        display: "flex", 
        fontFamily: "'Jost',sans-serif", 
        color: "#ede8e0" 
      }}>
        
        {/* Desktop Sidebar */}
        {!isMobile && (
          <aside style={{ 
            width: 260, 
            borderRight: "1px solid rgba(237,232,224,0.06)",
            display: "flex",
            flexDirection: "column",
            position: "sticky",
            top: 0,
            height: "100vh",
            flexShrink: 0
          }}>
            {/* Sidebar Header */}
            <div style={{ padding: "28px 24px", borderBottom: "1px solid rgba(237,232,224,0.06)" }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, letterSpacing: "0.1em", marginBottom: 4 }}>vellu</div>
              <div style={{ fontSize: 10, color: "rgba(237,232,224,0.3)", letterSpacing: "0.08em" }}>OWNER DASHBOARD</div>
            </div>

            {/* Salon Info */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(237,232,224,0.06)" }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4 }}>{salonData.name}</div>
              <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)" }}>{salonData.city}</div>
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
                  <span style={{ fontSize: 18, color: view === k ? accent : "rgba(237,232,224,0.35)" }}>{icon}</span>
                  <span style={{ 
                    fontSize: 13, 
                    fontWeight: view === k ? 600 : 400,
                    color: view === k ? accent : "rgba(237,232,224,0.6)",
                    letterSpacing: "0.02em"
                  }}>{label}</span>
                </div>
              ))}
            </nav>

            {/* Sidebar Footer */}
            <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(237,232,224,0.06)" }}>
              <LangToggle lang={lang} setLang={setLang} />
              <button 
                className="btn-ghost" 
                style={{ width: "100%", marginTop: 12, fontSize: 11, color: "rgba(237,232,224,0.35)" }} 
                onClick={onLogout}
              >
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
          minHeight: "100dvh",
          overflow: "hidden"
        }}>
          {/* Mobile Header */}
          {isMobile && (
            <div style={{ 
              padding: "20px 22px 0", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "flex-start",
              background: "#0d0b0a"
            }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 400, letterSpacing: "0.06em" }}>{salonData.name}</div>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${accent}18`, color: accent, border: `1px solid ${accent}33`, letterSpacing: "0.1em", textTransform: "uppercase" }}>{lang === "nl" ? "eigenaar" : "owner"}</span>
              </div>
              <LangToggle lang={lang} setLang={setLang} />
            </div>
          )}

          {/* Desktop Header */}
          {!isMobile && (
            <div style={{ 
              padding: "24px 40px", 
              borderBottom: "1px solid rgba(237,232,224,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
                  {navItems.find(([k]) => k === view)?.[2] || t.dashboard}
                </h1>
                <div style={{ fontSize: 12, color: "rgba(237,232,224,0.35)" }}>{t.welcomeBack}</div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button 
                  className="btn-ghost" 
                  style={{ fontSize: 11, borderColor: `${accent}33`, color: accent }} 
                  onClick={() => setShowPreview(true)}
                >
                  👁 {lang === "nl" ? "Preview" : "Preview"}
                </button>
                <button 
                  className="btn-ghost" 
                  style={{ fontSize: 11 }} 
                  onClick={copyLink}
                >
                  {copied ? "✓ " + t.copied : "🔗 " + t.copyLink}
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div style={{ 
            flex: 1, 
            overflow: "auto", 
            padding: isMobile ? "14px 22px 100px" : "32px 40px",
            backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}08 0%, transparent 55%)`
          }}>

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="fade-up">
              <PTitle sub={t.welcomeBack}>{t.dashboard}</PTitle>
              <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                <div className="stat-card">
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(237,232,224,0.3)", marginBottom: 8 }}>{t.today}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, fontWeight: 300, color: accent }}>{todayAppts.length}</div>
                  <div style={{ fontSize: 11, color: "rgba(237,232,224,0.28)", marginTop: 2 }}>{t.appts}</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(237,232,224,0.3)", marginBottom: 8 }}>{t.earnings}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, fontWeight: 300, color: accent }}>€{totalEarnings}</div>
                  <div style={{ fontSize: 11, color: "rgba(237,232,224,0.28)", marginTop: 2 }}>{t.total.toLowerCase()}</div>
                </div>
              </div>

              {/* Salon link */}
              <SL>{t.salonLink}</SL>
              <div className="slug-box" style={{ marginBottom: 22 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(237,232,224,0.4)", letterSpacing: "0.03em" }}>vellu.cc/</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: accent, marginTop: 2 }}>{salonData.id}</div>
                </div>
                <button className="btn-ghost" style={{ padding: "7px 14px", fontSize: 11, color: copied ? "#86efac" : undefined, borderColor: copied ? "rgba(134,239,172,0.3)" : undefined }} onClick={copyLink}>
                  {copied ? t.copied : t.copyLink}
                </button>
              </div>

              {/* Preview button */}
              <button className="btn-ghost" style={{ width: "100%", marginBottom: 10, borderColor: `${accent}33`, color: accent, fontSize: 11 }} onClick={() => setShowPreview(true)}>
                👁 {lang === "nl" ? "Bekijk klanten pagina" : "Preview client page"}
              </button>

              {/* Calendar export */}
              {appts.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
                  <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "10px 12px", borderColor: `${accent}22`, color: accent }} onClick={() => {
                    const upcoming = appts.filter(a => a.status === "confirmed");
                    if (upcoming.length === 0) return;
                    exportCalendar(upcoming);
                  }}>
                    📅 {lang === "nl" ? "Exporteer naar agenda" : "Export to calendar"}
                  </button>
                  <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "10px 12px" }} onClick={() => {
                    const upcoming = appts.filter(a => a.status === "confirmed");
                    if (upcoming.length === 0) return;
                    const a = upcoming[0];
                    const start = new Date(a.date + "T" + a.time + ":00");
                    const end = new Date(start.getTime() + (a.service_duration || 60) * 60000);
                    const fmt2 = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                    const title = encodeURIComponent(a.client_name + " — " + a.service_name);
                    const details = encodeURIComponent(`${a.client_name}\n${a.client_email}\n€${a.service_price}`);
                    const loc = encodeURIComponent(salonData.name + ", " + salonData.city);
                    // Export all to Google Calendar (opens for first, rest via .ics)
                    exportCalendar(upcoming);
                  }}>
                    🗓 {lang === "nl" ? "Sync met telefoon" : "Sync with phone"}
                  </button>
                </div>
              )}

              <SL>{t.todayAppts}</SL>
              {todayAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(237,232,224,0.18)", fontSize: 12 }}>{t.noTodayAppts}</div>
                : todayAppts.map(a => <ApptCard key={a.id} a={a} />)
              }
            </div>
          )}

          {/* AGENDA */}
          {view === "agenda" && (
            <div className="fade-up">
              <PTitle sub={t.manageAppts}>{t.agenda}</PTitle>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                {days.slice(0,10).map((d, i) => {
                  const ds = fmt(d); const isSel = calDate === ds;
                  const has = appts.filter(a => a.date === ds).length > 0;
                  return (
                    <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} onClick={() => setCalDate(ds)}>
                      <span style={{ fontSize: 10, color: isSel ? "#0d0b0a" : "rgba(237,232,224,0.35)" }}>{DAY[d.getDay()]}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? "#0d0b0a" : "#ede8e0", marginTop: 2 }}>{d.getDate()}</span>
                      {has && !isSel && <div style={{ width: 4, height: 4, borderRadius: "50%", background: accent, marginTop: 2 }} />}
                    </div>
                  );
                })}
              </div>
              {calAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(237,232,224,0.18)", fontSize: 12 }}>{t.noTodayAppts}</div>
                : calAppts.map(a => <ApptCard key={a.id} a={a} />)
              }
              {calAppts.length > 0 && (
                <button className="btn-ghost" style={{ width: "100%", marginTop: 12, fontSize: 10, borderColor: `${accent}22`, color: accent }} onClick={() => exportCalendar(calAppts)}>
                  📅 {lang === "nl" ? `Exporteer ${calAppts.length} afspraak(en) naar agenda` : `Export ${calAppts.length} appointment(s) to calendar`}
                </button>
              )}
            </div>
          )}

          {/* FACTUREN */}
          {view === "facturen" && (
            <div className="fade-up">
              <PTitle sub={t.completedTreatments}>{t.invoices}</PTitle>
              {completedAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(237,232,224,0.18)", fontSize: 12 }}>{t.noCompleted}</div>
                : completedAppts.map(a => (
                  <div key={a.id} className="appt-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{a.client_name}</div>
                      <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginTop: 3 }}>{a.date} · {a.service_name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>€{a.service_price}</div>
                      <div style={{ marginTop: 5 }}>
                        {a.invoice_sent
                          ? <span style={{ fontSize: 10, color: "#86efac" }}>✓ {t.sent}</span>
                          : <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => sendInvoice(a.id)}>{t.send}</button>
                        }
                      </div>
                    </div>
                  </div>
                ))
              }
              {completedAppts.length > 0 && (
                <div style={{ marginTop: 14, background: `${accent}08`, border: `1px solid ${accent}1a`, borderRadius: 20, padding: "18px 22px" }}>
                  <SL>{t.totalEarnings}</SL>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 38, fontWeight: 300, color: accent }}>€{totalEarnings}</div>
                  <div style={{ fontSize: 11, color: "rgba(237,232,224,0.25)", marginTop: 4 }}>{completedAppts.length} {t.treatments}</div>
                </div>
              )}
            </div>
          )}

          {/* ANALYTICS */}
          {view === "analytics" && (
            <div className="fade-up">
              <PTitle sub={lang === "nl" ? "Inzicht in je salon" : "Insight into your salon"}>{t.analytics}</PTitle>

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
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,232,224,0.3)" }}>{t.weeklyRevenue}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>€{weekRevenue.toFixed(0)}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,232,224,0.3)" }}>{t.monthlyRevenue}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>€{monthRevenue.toFixed(0)}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,232,224,0.3)" }}>{t.totalAppts}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: "#ede8e0", marginTop: 4 }}>{appts.length}</div>
                      <div style={{ fontSize: 10, color: "rgba(237,232,224,0.2)", marginTop: 2 }}>{completedAppts.length} {t.treatments}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,232,224,0.3)" }}>{t.avgRating}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>{avgRating} ★</div>
                      <div style={{ fontSize: 10, color: "rgba(237,232,224,0.2)", marginTop: 2 }}>{salonData.reviews?.length || 0} {t.reviews.toLowerCase()}</div>
                    </div>
                  </>;
                })()}
              </div>

              {/* Popular services */}
              <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.popularServices}</SL>
                {(() => {
                  const svcCount = {};
                  appts.forEach(a => { const n = a.service_name?.split(" — ")[0] || "?"; svcCount[n] = (svcCount[n] || 0) + 1; });
                  const sorted = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
                  if (sorted.length === 0) return <div style={{ fontSize: 11, color: "rgba(237,232,224,0.2)", textAlign: "center", padding: "12px 0" }}>{t.noAppts}</div>;
                  const max = sorted[0][1];
                  return sorted.map(([name, count]) => (
                    <div key={name} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{name}</span>
                        <span style={{ fontSize: 11, color: "rgba(237,232,224,0.4)" }}>{count} {t.bookings}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 4, background: "rgba(237,232,224,0.06)" }}>
                        <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(count / max) * 100}%`, transition: "width 0.4s" }} />
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Busiest days */}
              <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.busiestDays}</SL>
                {(() => {
                  const dayNames = lang === "nl" ? ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"] : ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                  const dayCounts = [0,0,0,0,0,0,0];
                  appts.forEach(a => { const d = new Date(a.date); dayCounts[d.getDay()]++; });
                  const max = Math.max(...dayCounts, 1);
                  return dayNames.map((name, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, width: 70, flexShrink: 0, color: "rgba(237,232,224,0.5)" }}>{name.slice(0,3)}</span>
                      <div style={{ flex: 1, height: 4, borderRadius: 4, background: "rgba(237,232,224,0.06)" }}>
                        <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(dayCounts[i] / max) * 100}%`, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: 10, color: "rgba(237,232,224,0.3)", width: 20, textAlign: "right" }}>{dayCounts[i]}</span>
                    </div>
                  ));
                })()}
              </div>

              {/* Reviews */}
              <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px" }}>
                <SL>{t.reviews} ({salonData.reviews?.length || 0})</SL>
                {(!salonData.reviews || salonData.reviews.length === 0)
                  ? <div style={{ fontSize: 11, color: "rgba(237,232,224,0.2)", textAlign: "center", padding: "12px 0" }}>{t.noReviews}</div>
                  : salonData.reviews.map(r => (
                    <div key={r.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(237,232,224,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{r.client_name}</span>
                        <span style={{ color: accent, fontSize: 13 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                      </div>
                      {r.comment && <div style={{ fontSize: 12, color: "rgba(237,232,224,0.5)", lineHeight: 1.5 }}>{r.comment}</div>}
                      <div style={{ fontSize: 9, color: "rgba(237,232,224,0.2)", marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* INSTELLINGEN */}
          {view === "instellingen" && (
            <div className="fade-up">
              <PTitle sub={t.manageSalon}>{t.settings}</PTitle>

              {/* Profile */}
              <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.profile}</SL>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <input className="input-field" placeholder={t.businessName} value={salonData.name} onChange={e => update(d => { d.name = e.target.value; return d; })} />
                  <input className="input-field" placeholder={t.city} value={salonData.city} onChange={e => update(d => { d.city = e.target.value; return d; })} />
                </div>
                <div style={{ marginTop: 16 }}>
                  <SL>{t.brandColor}</SL>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {["#c9a96e","#e8a598","#a8c5a0","#9bb5d6","#c4a8d4","#d4756a","#6abfb8","#e8c547"].map(c => (
                      <div key={c} onClick={() => update(d => { d.accent = c; return d; })} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", outline: salonData.accent === c ? "2px solid rgba(237,232,224,0.7)" : "none", outlineOffset: 2, transform: salonData.accent === c ? "scale(1.18)" : "none", transition: "all 0.2s" }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Invoice details */}
              <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.invoiceDetails}</SL>
                <div style={{ fontSize: 10, color: "rgba(237,232,224,0.2)", marginBottom: 10 }}>{t.invoiceSettings}</div>
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

              {/* Services + photos */}
              <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.services}</SL>
                {salonData.services.length === 0 && (
                  <div style={{ fontSize: 12, color: "rgba(237,232,224,0.2)", textAlign: "center", padding: "16px 0" }}>{t.noAppts}</div>
                )}
                {salonData.services.map(s => (
                  <div key={s.id} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid rgba(237,232,224,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{lang === "nl" ? s.name_nl : s.name_en}</div>
                        <div style={{ fontSize: 11, color: "rgba(237,232,224,0.32)", marginTop: 2 }}>€{s.price} · {s.duration} {t.min}</div>
                      </div>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 10px", color: "#f87171", borderColor: "rgba(248,113,113,0.2)", flexShrink: 0 }} onClick={() => deleteService(s.id)}>{t.deleteService}</button>
                    </div>

                    {/* Variants */}
                    <div style={{ marginTop: 10, marginLeft: 8, paddingLeft: 10, borderLeft: `2px solid ${accent}22` }}>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(237,232,224,0.25)", marginBottom: 6 }}>{t.variants}</div>
                      {(s.variants || []).map(v => (
                        <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, padding: "6px 0" }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 500 }}>{v.name_nl}</div>
                            {v.description_nl && <div style={{ fontSize: 9, color: "rgba(237,232,224,0.25)" }}>{v.description_nl}</div>}
                            <div style={{ fontSize: 10, color: "rgba(237,232,224,0.3)" }}>€{v.price} · {v.duration} {t.min}</div>
                          </div>
                          <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                            onClick={async () => {
                              await supabase.from("service_variants").delete().eq("id", v.id);
                              update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: (svc.variants||[]).filter(x => x.id !== v.id)} : svc); return d; });
                            }}>×</button>
                        </div>
                      ))}
                      <VariantAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(variant) => {
                        update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: [...(svc.variants||[]), variant]} : svc); return d; });
                      }} />
                    </div>

                    {/* Extras */}
                    <div style={{ marginTop: 8, marginLeft: 8, paddingLeft: 10, borderLeft: `2px solid ${accent}22` }}>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(237,232,224,0.25)", marginBottom: 6 }}>{t.extras}</div>
                      {(s.extras || []).map(e => (
                        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, padding: "4px 0" }}>
                          <div style={{ fontSize: 11, fontWeight: 500 }}>{e.name_nl} <span style={{ color: "rgba(237,232,224,0.3)" }}>+€{e.price}</span></div>
                          <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                            onClick={async () => {
                              await supabase.from("service_extras").delete().eq("id", e.id);
                              update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: (svc.extras||[]).filter(x => x.id !== e.id)} : svc); return d; });
                            }}>×</button>
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
                      <label className="photo-add" style={{ flexShrink: 0 }}>
                        <span style={{ fontSize: 18, color: `${accent}88` }}>+</span>
                        <span style={{ fontSize: 9, color: `${accent}66`, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.addPhoto}</span>
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

              {/* Staff / Team */}
              <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.staff}</SL>
                {(salonData.staff || []).length === 0 && (
                  <div style={{ fontSize: 11, color: "rgba(237,232,224,0.2)", textAlign: "center", padding: "12px 0" }}>{t.noStaff}</div>
                )}
                {(salonData.staff || []).map(m => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid rgba(237,232,224,0.06)" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${accent}22`, border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: accent }}>{m.name[0]}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                          {m.role && <div style={{ fontSize: 10, color: "rgba(237,232,224,0.3)" }}>{m.role}</div>}
                        </div>
                      </div>
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                      onClick={async () => {
                        await supabase.from("staff_members").delete().eq("id", m.id);
                        update(d => { d.staff = (d.staff || []).filter(s => s.id !== m.id); return d; });
                      }}>×</button>
                  </div>
                ))}
                <StaffAdder ownerId={salonData.owner_id} services={salonData.services} lang={lang} t={t} accent={accent} onAdd={(member) => {
                  update(d => { d.staff = [...(d.staff || []), member]; return d; });
                }} />
              </div>

              {/* Business Hours */}
              <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.07)", borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.businessHours}</SL>
                <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginBottom: 14 }}>{t.businessHoursDesc}</div>
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
                      background: isClosed ? "rgba(237,232,224,0.02)" : `${accent}08`,
                      border: `1px solid ${isClosed ? "rgba(237,232,224,0.06)" : `${accent}22`}`,
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
                          background: isClosed ? "rgba(237,232,224,0.1)" : accent,
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
                              background: "rgba(237,232,224,0.06)", 
                              border: "1px solid rgba(237,232,224,0.12)", 
                              borderRadius: 8, 
                              padding: "6px 8px", 
                              color: "#ede8e0", 
                              fontSize: 11,
                              fontFamily: "'Jost',sans-serif",
                              cursor: "pointer"
                            }}
                          >
                            {TIMES.map(t => <option key={t} value={t} style={{ background: "#1a1a1a" }}>{t}</option>)}
                          </select>
                          <span style={{ fontSize: 11, color: "rgba(237,232,224,0.3)" }}>—</span>
                          <select 
                            value={hours.close}
                            onChange={e => update(d => {
                              if (!d.business_hours) d.business_hours = {...DEFAULT_HOURS};
                              d.business_hours[day] = { ...d.business_hours[day], close: e.target.value };
                              return d;
                            })}
                            style={{ 
                              background: "rgba(237,232,224,0.06)", 
                              border: "1px solid rgba(237,232,224,0.12)", 
                              borderRadius: 8, 
                              padding: "6px 8px", 
                              color: "#ede8e0", 
                              fontSize: 11,
                              fontFamily: "'Jost',sans-serif",
                              cursor: "pointer"
                            }}
                          >
                            {TIMES.map(t => <option key={t} value={t} style={{ background: "#1a1a1a" }}>{t}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "rgba(237,232,224,0.3)", fontStyle: "italic" }}>{t.closed}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Appearance Section */}
              <div style={{ marginTop: 28 }}>
                <SL>{t.appearance}</SL>
                <div style={{ fontSize: 11, color: "rgba(237,232,224,0.3)", marginBottom: 12 }}>{t.logoDesc}</div>
                
                {/* Logo upload */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  {salonData.logo_url ? (
                    <div style={{ position: "relative" }}>
                      <img src={salonData.logo_url} style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover", border: "1px solid rgba(237,232,224,0.1)" }} />
                      <div onClick={() => update(d => { d.logo_url = ""; return d; })} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer" }}>×</div>
                    </div>
                  ) : (
                    <label style={{ width: 60, height: 60, borderRadius: 12, border: `1.5px dashed ${accent}44`, background: `${accent}06`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4 }}>
                      <span style={{ fontSize: 18, color: `${accent}88` }}>📷</span>
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
                  <span style={{ fontSize: 12, color: "rgba(237,232,224,0.5)" }}>{t.logo}</span>
                </div>

                {/* Cover image upload */}
                <div style={{ fontSize: 11, color: "rgba(237,232,224,0.3)", marginBottom: 8 }}>{t.coverDesc}</div>
                {salonData.cover_image_url ? (
                  <div style={{ position: "relative", marginBottom: 16 }}>
                    <img src={salonData.cover_image_url} style={{ width: "100%", height: 80, borderRadius: 12, objectFit: "cover", border: "1px solid rgba(237,232,224,0.1)" }} />
                    <div onClick={() => update(d => { d.cover_image_url = ""; return d; })} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer" }}>×</div>
                  </div>
                ) : (
                  <label style={{ width: "100%", height: 80, borderRadius: 12, border: `1.5px dashed ${accent}44`, background: `${accent}06`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4, marginBottom: 16 }}>
                    <span style={{ fontSize: 18, color: `${accent}88` }}>🖼️</span>
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
              <div style={{ marginTop: 28 }}>
                <SL>{t.bookingPolicy}</SL>
                <div style={{ fontSize: 11, color: "rgba(237,232,224,0.3)", marginBottom: 8 }}>{t.bookingPolicyDesc}</div>
                <textarea 
                  className="input-field" 
                  placeholder={t.bookingPolicyPlaceholder}
                  value={salonData.booking_policy || ""}
                  onChange={e => update(d => { d.booking_policy = e.target.value; return d; })}
                  style={{ minHeight: 80, resize: "vertical", fontSize: 12 }}
                />
              </div>

              {/* Phone Required Toggle */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#ede8e0" }}>{t.phoneRequired}</div>
                    <div style={{ fontSize: 11, color: "rgba(237,232,224,0.3)" }}>{t.phoneRequiredDesc}</div>
                  </div>
                  <div 
                    onClick={() => update(d => { d.phone_required = !d.phone_required; return d; })}
                    style={{ 
                      width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                      background: salonData.phone_required ? accent : "rgba(237,232,224,0.15)",
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

              {/* Discount Codes Section */}
              <div style={{ marginTop: 28 }}>
                <SL>{t.discountCodes}</SL>
                
                {/* Existing codes */}
                {(salonData.discount_codes || []).map((code, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "10px 12px", background: "rgba(237,232,224,0.03)", borderRadius: 10, border: "1px solid rgba(237,232,224,0.08)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: accent, fontFamily: "monospace" }}>{code.code}</div>
                      <div style={{ fontSize: 11, color: "rgba(237,232,224,0.5)" }}>
                        {code.type === "percent" ? `${code.amount}%` : `€${code.amount}`} {t.discount.toLowerCase()}
                      </div>
                    </div>
                    <div 
                      onClick={() => update(d => { d.discount_codes[idx].active = !d.discount_codes[idx].active; return d; })}
                      style={{ 
                        width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                        background: code.active ? "#4ade80" : "rgba(237,232,224,0.15)",
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
                  <select value={newDiscount.type} onChange={e => setNewDiscount(d => ({...d, type: e.target.value}))} style={{ background: "rgba(237,232,224,0.06)", border: "1px solid rgba(237,232,224,0.12)", borderRadius: 10, padding: "8px 12px", color: "#ede8e0", fontSize: 12, fontFamily: "'Jost',sans-serif" }}>
                    <option value="percent" style={{ background: "#1a1a1a" }}>%</option>
                    <option value="fixed" style={{ background: "#1a1a1a" }}>€</option>
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

              <button className="btn-primary" onClick={async () => {
                await supabase.from("profiles").update({
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
                  phone_required: salonData.phone_required || false,
                  logo_url: salonData.logo_url || null,
                  cover_image_url: salonData.cover_image_url || null,
                  discount_codes: salonData.discount_codes || []
                }).eq("id", salonData.owner_id);
                setSaved(true); setTimeout(() => setSaved(false), 2000);
              }}>{saved ? t.saved : t.save}</button>
              <button className="btn-ghost" style={{ width: "100%", marginTop: 10, color: "rgba(237,232,224,0.3)", display: isMobile ? "block" : "none" }} onClick={onLogout}>{t.logout}</button>
            </div>
          )}
        </div>

        {/* Mobile Bottom Nav */}
        {isMobile && (
          <div style={{ 
            position: "fixed", 
            bottom: 0, 
            left: 0, 
            right: 0, 
            background: "rgba(13,11,10,0.97)", 
            backdropFilter: "blur(24px)", 
            borderTop: "1px solid rgba(237,232,224,0.08)", 
            display: "flex", 
            padding: "10px 4px", 
            paddingBottom: "max(10px, env(safe-area-inset-bottom))",
            zIndex: 100
          }}>
            {navItems.map(([k, icon, label]) => (
              <div key={k} className="nav-item" onClick={() => setView(k)} style={{ gap: 3 }}>
                <span style={{ fontSize: 18, color: view === k ? accent : "rgba(237,232,224,0.25)", transition: "color 0.2s" }}>{icon}</span>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: view === k ? accent : "rgba(237,232,224,0.25)", transition: "color 0.2s", whiteSpace: "nowrap" }}>{label}</span>
              </div>
            ))}
          </div>
        )}
        </main>

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
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)", zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "20px 16px", overflowY: "auto" }}>
            <div style={{ width: "100%", maxWidth: 390, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: "#ede8e0", fontWeight: 300 }}>
                  {lang === "nl" ? "Zo zien klanten jouw pagina" : "This is what clients see"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(237,232,224,0.3)", marginTop: 3, letterSpacing: "0.06em" }}>vellu.cc/{salonData.id}</div>
              </div>
              <button className="btn-ghost" style={{ padding: "7px 14px", fontSize: 12 }} onClick={() => setShowPreview(false)}>✕ {lang === "nl" ? "Sluiten" : "Close"}</button>
            </div>
            <div style={{ width: "100%", maxWidth: 390, background: "#0d0b0a", borderRadius: 28, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
              <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 70% 35% at 50% -5%, ${accent}12 0%, transparent 55%)`, padding: "24px 22px 0", fontFamily: "'Jost',sans-serif", color: "#ede8e0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 400, letterSpacing: "0.06em" }}>{salonData.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(237,232,224,0.3)", marginTop: 3 }}>{salonData.city}</div>
                  </div>
                  <div style={{ background: "rgba(237,232,224,0.06)", border: "1px solid rgba(237,232,224,0.1)", borderRadius: 100, padding: "5px 10px", fontSize: 10, color: "rgba(237,232,224,0.4)" }}>NL / EN</div>
                </div>
                <div style={{ display: "flex", gap: 5, marginBottom: 22 }}>
                  {[1,2,3,4].map(s => <div key={s} style={{ flex: 1, height: 2, borderRadius: 4, background: s === 1 ? accent : "rgba(237,232,224,0.08)" }} />)}
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: 24, color: "#ede8e0", marginBottom: 6 }}>
                  {lang === "nl" ? "Kies een Behandeling" : "Select a Service"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginBottom: 20 }}>
                  {lang === "nl" ? "Kies de behandeling die je wilt" : "Choose the treatment you'd like"}
                </div>
              </div>
              <div style={{ padding: "0 22px 28px", background: "#0d0b0a", fontFamily: "'Jost',sans-serif" }}>
                {salonData.services.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(237,232,224,0.18)", fontSize: 13 }}>
                    {lang === "nl" ? "Nog geen diensten toegevoegd" : "No services added yet"}
                  </div>
                ) : salonData.services.map(s => (
                  <div key={s.id} style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.08)", borderRadius: 20, padding: "17px 19px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14, color: "#ede8e0" }}>{lang === "nl" ? s.name_nl : (s.name_en || s.name_nl)}</div>
                        <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginTop: 3 }}>
                          {s.duration} min
                          {(s.photos || []).length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} foto's</span>}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>€{s.price}</div>
                    </div>
                    {(s.photos || []).length > 0 && (
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginTop: 12 }}>
                        {s.photos.map((p, i) => (
                          <img key={p.id || i} src={p.url || p} style={{ width: 68, height: 68, borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid rgba(237,232,224,0.08)" }} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ background: accent, color: "#0d0b0a", borderRadius: 100, padding: "15px", textAlign: "center", fontFamily: "'Jost',sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 6, opacity: 0.4 }}>
                  {lang === "nl" ? "Volgende →" : "Next →"}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: "rgba(237,232,224,0.2)", textAlign: "center", letterSpacing: "0.04em" }}>
              {lang === "nl" ? "Dit is een preview — klanten kunnen hier niet boeken" : "This is a preview — clients cannot book here"}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── OWNER ENTRY PAGE (vellu.cc/owner) ───────────────────────
function OwnerEntryPage({ lang, setLang }) {
  const navigate = useNavigate();
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (profile) {
          setOwner({
            name: profile.business_name || "Mijn Salon",
            email: session.user.email,
            slug: profile.slug || session.user.email.split("@")[0],
            city: profile.city || "Nederland",
            id: session.user.id,
            accent: profile.accent_color
          });
        }
      }
      setLoading(false);
    };
    checkSession();
  }, []);

  const handleLogin = (u) => setOwner(u);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setOwner(null);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0d0b0a", color: "rgba(237,232,224,0.3)", fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      vellu...
    </div>
  );

  if (owner) {
    return <OwnerApp user={owner} lang={lang} setLang={setLang} salons={{}} onSalonUpdate={() => {}} onLogout={handleLogout} />;
  }

  return <OwnerAuth lang={lang} setLang={setLang} onBack={() => navigate("/")} onLogin={handleLogin} />;
}

// ─── SALON ROUTE WRAPPER ─────────────────────────────────────
function SalonRouteWrapper({ lang, setLang }) {
  const { slug } = useParams();
  // Reserved routes go to main app
  if (slug === "owner" || slug === "login" || slug === "admin") {
    return <AppInner />;
  }
  return <SalonRoute lang={lang} setLang={setLang} />;
}

// ─── SALON ROUTE (vellu.cc/salon-naam) ───────────────────────
function SalonRoute({ lang, setLang }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [salon, setSalon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Check Supabase
      const { data, error } = await supabase.from("profiles").select("*, services(*, service_variants(*), service_extras(*), service_photos(*))").eq("slug", slug).single();
      console.log("SalonRoute loaded data:", { discount_codes: data?.discount_codes, booking_policy: data?.booking_policy, error });
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      // Load reviews
      const { data: reviews } = await supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false });
      // Load staff
      const { data: staffData } = await supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).eq("active", true).order("position");
      
      // Parse discount_codes - handle both string and array formats
      let parsedDiscountCodes = [];
      if (data.discount_codes) {
        if (typeof data.discount_codes === "string") {
          try { parsedDiscountCodes = JSON.parse(data.discount_codes); } catch (e) { parsedDiscountCodes = []; }
        } else if (Array.isArray(data.discount_codes)) {
          parsedDiscountCodes = data.discount_codes;
        }
      }
      console.log("Parsed discount codes:", parsedDiscountCodes);
      
      setSalon({
        id: data.slug,
        owner_id: data.id,
        name: data.business_name || data.owner_name || "Studio",
        city: data.city || "Nederland",
        accent: data.accent_color || "#c9a96e",
        owner_email: data.email,
        business_hours: data.business_hours || DEFAULT_HOURS,
        booking_policy: data.booking_policy || "",
        phone_required: data.phone_required || false,
        logo_url: data.logo_url || "",
        cover_image_url: data.cover_image_url || "",
        discount_codes: parsedDiscountCodes,
        services: (data.services || []).map(s => ({
          ...s,
          name_nl: s.name_nl || s.name || "",
          name_en: s.name_en || s.name || "",
          photos: (s.service_photos || []).map(p => ({ id: p.id, url: p.photo_url })),
          variants: (s.service_variants || []).sort((a,b) => (a.position||0) - (b.position||0)),
          extras: s.service_extras || []
        })),
        appointments: [],
        reviews: reviews || [],
        staff: (staffData || []).map(s => ({ ...s, service_ids: (s.staff_services || []).map(ss => ss.service_id) }))
      });
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0d0b0a", color: "rgba(237,232,224,0.3)", fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      vellu...
    </div>
  );

  if (notFound) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0d0b0a", color: "#ede8e0", fontFamily: "'Jost',sans-serif", gap: 16 }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>Salon niet gevonden</div>
      <div style={{ fontSize: 12, color: "rgba(237,232,224,0.35)" }}>vellu.cc/{slug} bestaat niet</div>
      <button className="btn-ghost" onClick={() => navigate("/")}>← Terug naar home</button>
    </div>
  );

  return <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => navigate("/")} />;
}

// ─── ROOT ─────────────────────────────────────────────────────
function AppInner() {
  const [screen, setScreen] = useState("landing");
  const [salon, setSalon] = useState(null);
  const [owner, setOwner] = useState(null);
  const [lang, setLang] = useState("nl");
  const [salons, setSalons] = useState(DEMO_SALONS);

  const updateSalon = (updated) => setSalons(prev => ({ ...prev, [updated.id]: updated }));
  const handleSelectSalon = (s) => { setSalon(salons[s.id] || s); setScreen("client"); };

  return (
    <>
      {screen === "landing" && <LandingScreen lang={lang} setLang={setLang} salons={salons} onSelectSalon={handleSelectSalon} onOwnerEnter={() => setScreen("ownerAuth")} />}
      {screen === "client" && <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => setScreen("landing")} />}
      {screen === "ownerAuth" && <OwnerAuth lang={lang} setLang={setLang} onBack={() => setScreen("landing")} onLogin={u => { setOwner(u); setScreen("owner"); }} />}
      {screen === "owner" && <OwnerApp user={owner} lang={lang} setLang={setLang} salons={salons} onSalonUpdate={updateSalon} onLogout={() => { setOwner(null); setScreen("landing"); }} />}
    </>
  );
}

export default function VelluApp() {
  const [lang, setLang] = useState("nl");
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppInner />} />
        <Route path="/owner" element={<OwnerEntryPage lang={lang} setLang={setLang} />} />
        <Route path="/:slug" element={<SalonRouteWrapper lang={lang} setLang={setLang} />} />
      </Routes>
    </BrowserRouter>
  );
}
