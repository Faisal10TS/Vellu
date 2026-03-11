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
const TIMES = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];
const DAY_NL = ["zo","ma","di","wo","do","vr","za"];
const DAY_EN = ["su","mo","tu","we","th","fr","sa"];
const MON_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const MON_EN = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

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
    noCompleted:"Nog geen voltooide afspraken", manageSalon:"Beheer je salon",
    profile:"Profiel", brandColor:"Merkkleur", services:"Diensten", save:"Opslaan",
    saved:"Opgeslagen ✓", logout:"Uitloggen", businessName:"Bedrijfsnaam", city:"Stad",
    addService:"+ Dienst Toevoegen", deleteService:"Verwijder",
    ownerLogin:"Eigenaar Login", ownerSub:"Inloggen als salon eigenaar",
    emailField:"E-mailadres", passwordField:"Wachtwoord", login:"Inloggen",
    signUp:"Registreren", signUpTitle:"Account Aanmaken",
    businessNameField:"Bedrijfsnaam (bijv. Studio Rosa)",
    slugField:"Jouw link (bijv. studio-rosa)",
    createAccount:"Account Aanmaken", signIn:"Inloggen",
    manageAppts:"Beheer je afspraken", today:"Vandaag", earnings:"Inkomsten",
    appts:"afspraken", treatments:"behandelingen", sent:"Verstuurd", send:"Sturen",
    min:"min", photos:"Foto's", addPhoto:"Foto toevoegen", noPhotos:"Nog geen foto's",
    deletePhoto:"Verwijder", salonLink:"Jouw salon link", copyLink:"Kopieer",
    copied:"Gekopieerd!", serviceName:"Dienst naam (NL)", serviceNameEn:"Dienst naam (EN)",
    price:"Prijs (€)", duration:"Duur (min)", fillRequired:"Vul naam en prijs in",
    bookAt:"Boek bij", enterSalon:"Voer salon-link in", goToSalon:"Ga naar salon",
    salonNotFound:"Salon niet gevonden. Probeer een andere naam.",
    orEnterSlug:"Of voer een salon-link in:",
    availableSalons:"Beschikbare salons (demo)",
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
    todaySchedule:"Schema vandaag", nextUp:"Volgende", inProgress:"Nu bezig", upcoming:"Straks",
    noMoreToday:"Geen afspraken meer vandaag", freeDay:"Vrije dag! Geen afspraken gepland.",
    startsIn:"Start over", minutesShort:"min", hoursShort:"u",
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
    // Pagination
    showMore:"Meer laden", showing:"Getoond", of:"van",
    // Discount codes
    discountCode:"Kortingscode", applyCode:"Toepassen", invalidCode:"Ongeldige code",
    codeApplied:"Kortingscode toegepast!", discount:"Korting", enterDiscountCode:"Kortingscode invoeren",
    // Booking policy
    required:"verplicht", agreeToPolicy:"Ik ga akkoord met het annuleringsbeleid",
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
    noCompleted:"No completed appointments yet", manageSalon:"Manage your salon",
    profile:"Profile", brandColor:"Brand color", services:"Services", save:"Save",
    saved:"Saved ✓", logout:"Log out", businessName:"Business name", city:"City",
    addService:"+ Add Service", deleteService:"Delete",
    ownerLogin:"Owner Login", ownerSub:"Sign in as salon owner",
    emailField:"Email address", passwordField:"Password", login:"Sign In",
    signUp:"Sign Up", signUpTitle:"Create Account",
    businessNameField:"Business name (e.g. Studio Rosa)",
    slugField:"Your link (e.g. studio-rosa)",
    createAccount:"Create Account", signIn:"Sign In",
    manageAppts:"Manage your appointments", today:"Today", earnings:"Earnings",
    appts:"appointments", treatments:"treatments", sent:"Sent", send:"Send",
    min:"min", photos:"Photos", addPhoto:"Add photo", noPhotos:"No photos yet",
    deletePhoto:"Delete", salonLink:"Your salon link", copyLink:"Copy",
    copied:"Copied!", serviceName:"Service name (NL)", serviceNameEn:"Service name (EN)",
    price:"Price (€)", duration:"Duration (min)", fillRequired:"Fill in name and price",
    bookAt:"Book at", enterSalon:"Enter salon link", goToSalon:"Go to salon",
    salonNotFound:"Salon not found. Try a different name.",
    orEnterSlug:"Or enter a salon link:",
    availableSalons:"Available salons (demo)",
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
    todaySchedule:"Today's schedule", nextUp:"Next up", inProgress:"In progress", upcoming:"Upcoming",
    noMoreToday:"No more appointments today", freeDay:"Day off! No appointments scheduled.",
    startsIn:"Starts in", minutesShort:"min", hoursShort:"h",
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
    // Pagination
    showMore:"Load more", showing:"Showing", of:"of",
    // Discount codes
    discountCode:"Discount code", applyCode:"Apply", invalidCode:"Invalid code",
    codeApplied:"Discount applied!", discount:"Discount", enterDiscountCode:"Enter discount code",
    // Booking policy
    required:"required", agreeToPolicy:"I agree to the cancellation policy",
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
  @keyframes pulse { 0%, 100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.15); } }
  @keyframes pulse { 0%, 100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.15); } }
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
function Phone({ children, accent = ACCENT }) {
  return (
    <div style={{ width: "100%", maxWidth: 480, background: "#0d0b0a", borderRadius: window.innerWidth > 520 ? 32 : 0, overflow: "hidden", boxShadow: window.innerWidth > 520 ? "0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.07)" : "none", flexShrink: 0 }}>
      <style>{makeCSS(accent)}</style>
      {children}
      {window.innerWidth > 520 && (
        <div style={{ height: 20, background: "#0d0b0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 110, height: 4, background: "rgba(237,232,224,0.18)", borderRadius: 10 }} />
        </div>
      )}
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
    <Phone>
      <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 80% 40% at 50% -10%, ${ACCENT}12 0%, transparent 60%)`, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 28px", fontFamily: "'Jost',sans-serif", color: "#ede8e0", position: "relative" }}>
        <div style={{ position: "absolute", top: 24, right: 24 }}><LangToggle lang={lang} setLang={setLang} /></div>

        <div className="fade-up" style={{ width: "100%" }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 52, fontWeight: 300, letterSpacing: "0.14em", lineHeight: 1 }}>vellu</div>
            <div style={{ width: 40, height: 1, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, margin: "16px auto" }} />
            <div style={{ fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(237,232,224,0.28)" }}>Beauty booking</div>
          </div>

          {/* Slug input */}
          <SL>{t.orEnterSlug}</SL>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input className="input-field" placeholder={lang === "nl" ? "bijv. studio-rosa" : "e.g. studio-rosa"} value={slugInput} onChange={e => setSlugInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && goToSlug(slugInput)}
              style={{ borderRadius: 14 }} />
            <button className="btn-ghost" style={{ flexShrink: 0, padding: "0 18px", whiteSpace: "nowrap" }} onClick={() => goToSlug(slugInput)}>{t.goToSalon}</button>
          </div>
          {error && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 12 }}>{error}</div>}

          {/* Owner link */}
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => window.location.href = "/owner"}>👑 {lang === "nl" ? "Eigenaar inloggen" : "Owner login"}</button>
          </div>
        </div>
      </div>
    </Phone>
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
      const slug = form.slug || form.businessName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "mijn-salon";
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
      onLogin({ name: profile?.business_name || "Mijn Salon", email: form.email, slug, city: profile?.city || "Nederland", id: data.user.id, accent: profile?.accent_color });
    }
    setLoading(false);
  };

  return (
    <Phone>
      <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 80% 40% at 50% -10%, ${ACCENT}10 0%, transparent 60%)`, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 28px", fontFamily: "'Jost',sans-serif", color: "#ede8e0", position: "relative" }}>
        <div style={{ position: "absolute", top: 60, right: 24 }}><LangToggle lang={lang} setLang={setLang} /></div>
        <div style={{ position: "absolute", top: 60, left: 24 }}>
          <button className="btn-ghost" style={{ padding: "7px 13px", fontSize: 12 }} onClick={onBack}>←</button>
        </div>
        <div style={{ width: "100%" }} className="fade-up">
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>👑</div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300 }}>{t.ownerLogin}</div>
            <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginTop: 6, letterSpacing: "0.04em" }}>{t.ownerSub}</div>
          </div>

          <div style={{ display: "flex", marginBottom: 26, borderBottom: "1px solid rgba(237,232,224,0.08)" }}>
            {[["signin", t.signIn], ["signup", t.signUp]].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                flex: 1, padding: "11px", border: "none", background: "transparent",
                fontFamily: "'Jost',sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer",
                letterSpacing: "0.1em", textTransform: "uppercase",
                color: mode === m ? ACCENT : "rgba(237,232,224,0.25)",
                borderBottom: `2px solid ${mode === m ? ACCENT : "transparent"}`,
                marginBottom: -1, transition: "all 0.2s"
              }}>{label}</button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {mode === "signup" && <>
              <input className="input-field" placeholder={t.businessNameField} value={form.businessName} onChange={e => setForm(f => ({...f, businessName: e.target.value}))} />
              <input className="input-field" placeholder={t.city} value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 17, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "rgba(237,232,224,0.3)", fontFamily: "'Jost',sans-serif", pointerEvents: "none" }}>vellu.cc/</div>
                <input className="input-field" placeholder={lang === "nl" ? "jouw-salon-naam" : "your-salon-name"} value={form.slug} onChange={e => setForm(f => ({...f, slug: e.target.value.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")}))} style={{ paddingLeft: 80 }} />
              </div>
            </>}
            <input className="input-field" placeholder={t.emailField} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
            <input className="input-field" placeholder={t.passwordField} type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
          </div>
          {error && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 14, textAlign: "center" }}>{error}</div>}
          <button className="btn-primary" onClick={handle} disabled={loading}>{loading ? "..." : (mode === "signin" ? t.login : t.createAccount)}</button>
        </div>
      </div>
    </Phone>
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
  const catName = (c) => lang === "nl" ? c.name_nl : (c.name_en || c.name_nl);

  const [step, setStep] = useState(1);
  const [sel, setSel] = useState(null);
  const [selVariant, setSelVariant] = useState(null);
  const [selExtras, setSelExtras] = useState([]);
  const [selStaff, setSelStaff] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [date, setDate] = useState(fmt(today));
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival" });
  const [done, setDone] = useState(false);
  const [gallery, setGallery] = useState(null);
  const [clientFound, setClientFound] = useState(false);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const days = getDays();

  // Get categories
  const categories = initialSalon.categories || [];
  const servicesWithCategory = (initialSalon.services || []).map(s => ({
    ...s,
    category: categories.find(c => c.id === s.category_id)
  }));
  
  // Filter services by selected category
  const filteredServices = selectedCategory 
    ? servicesWithCategory.filter(s => s.category_id === selectedCategory)
    : servicesWithCategory;

  // Form validation
  const phoneValid = !initialSalon.phone_required || form.phone.length >= 6;
  const policyValid = !initialSalon.booking_policy || policyAgreed;
  const canConfirm = form.firstName && form.lastName && form.email && phoneValid && policyValid;

  // Filter staff members who can do the selected service
  const availableStaff = (initialSalon.staff || []).filter(m =>
    m.service_ids?.length === 0 || m.service_ids?.includes(sel?.id)
  );

  // Client lookup (debounced)
  useEffect(() => {
    if (!form.email || form.email.length < 5 || !form.email.includes("@")) {
      setClientFound(false);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("clients").select("*").eq("email", form.email.toLowerCase()).single();
      if (data) {
        setForm(f => ({ ...f, firstName: data.first_name || f.firstName, lastName: data.last_name || f.lastName, phone: data.phone || f.phone }));
        setClientFound(true);
      } else {
        setClientFound(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.email]);

  const getPrice = () => {
    const base = selVariant ? parseFloat(selVariant.price) : parseFloat(sel?.price || 0);
    const extrasTotal = selExtras.reduce((s, e) => s + parseFloat(e.price || 0), 0);
    let total = base + extrasTotal;
    if (appliedDiscount) {
      if (appliedDiscount.discount_type === "percentage") {
        total = total * (1 - appliedDiscount.discount_value / 100);
      } else {
        total = Math.max(0, total - appliedDiscount.discount_value);
      }
    }
    return total;
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

  const reset = () => { setStep(1); setSel(null); setSelVariant(null); setSelExtras([]); setSelStaff(null); setTime(null); setDone(false); setForm({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival" }); setPolicyAgreed(false); setAppliedDiscount(null); setDiscountCode(""); setBookingId(null); setSelectedCategory(null); };

  // Generate random cancellation token
  const generateToken = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  // Apply discount code
  const applyDiscount = async () => {
    if (!discountCode.trim()) return;
    const codes = initialSalon.discount_codes || [];
    const found = codes.find(c => c.code.toLowerCase() === discountCode.toLowerCase() && c.active);
    if (found) {
      setAppliedDiscount(found);
    } else {
      alert(t.invalidCode);
    }
  };

  // Confirm booking - handles client save, appointment insert, cancellation token
  const confirmBooking = async () => {
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
        last_visit: new Date().toISOString()
      }).eq("id", clientId);
    } else {
      const { data: newClient } = await supabase.from("clients").insert({
        email: clientEmail,
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone || null,
        last_visit: new Date().toISOString()
      }).select("id").single();
      if (newClient) clientId = newClient.id;
    }

    // 2. Create appointment
    const apptData = {
      owner_id: initialSalon.owner_id, service_id: sel?.id || null, client_id: clientId,
      service_name: getServiceLabel() + (selExtras.length > 0 ? " + " + selExtras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ") : "") + (appliedDiscount ? ` [${appliedDiscount.code}]` : ""),
      service_price: getPrice(), service_duration: getDuration(), date, time,
      client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, client_phone: form.phone || null,
      payment_method: form.payment, status: "confirmed", invoice_sent: false,
      staff_id: selStaff?.id || null, staff_name: selStaff?.name || null
    };
    const { data: appt } = await supabase.from("appointments").insert(apptData).select("id").single();
    
    // 3. Generate cancellation token (expires 24h before appointment)
    let cancelToken = null;
    if (appt) {
      setBookingId(appt.id);
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
    
    // 4. Send confirmation email with cancellation link
    await sendEmails("booking_confirmation", {
      client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, service_name: apptData.service_name,
      date, time, payment: form.payment, price: getPrice(), salon_name: initialSalon.name, owner_email: initialSalon.owner_email || "info@vellu.cc",
      cancel_url: cancelToken ? `https://vellu.cc/cancel/${cancelToken}` : null
    });
    
    if (form.payment === "online") {
      await sendEmails("invoice", { client_name: `${form.firstName} ${form.lastName}`, client_email: form.email, service_name: apptData.service_name,
        date, time, price: getPrice(), salon_name: initialSalon.name });
    }
  };

  return (
    <Phone accent={accent}>
      <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 70% 35% at 50% -5%, ${accent}12 0%, transparent 55%)`, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "'Jost',sans-serif", color: "#ede8e0", position: "relative" }}>

        <Header
          title={initialSalon.name}
          subtitle={initialSalon.city}
          onBack={done ? reset : (step > 1 ? () => { if (step === 2 && sel?.variants?.length > 0) { setSelVariant(null); setSelExtras([]); } setStep(s => s-1); } : onBack)}
          right={<LangToggle lang={lang} setLang={setLang} />}
          accent={accent}
        />

        <div style={{ flex: 1, overflow: "auto", padding: "14px 22px 40px" }}>
          {!done ? (
            <div key={step} className="fade-up">
              {/* Progress */}
              <div style={{ display: "flex", gap: 5, margin: "12px 0 22px" }}>
                {[1,2,3,4].map(s => <div key={s} style={{ flex:1, height:2, borderRadius:4, background: step >= s ? accent : "rgba(237,232,224,0.08)", transition:"background 0.4s" }} />)}
              </div>

              {/* Step 1 — Service selection */}
              {step === 1 && <>
                <PTitle sub={t.selectServiceSub}>{t.selectService}</PTitle>
                
                {/* Category tabs */}
                {categories.length > 0 && (
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 16 }}>
                    <button
                      className={`btn-ghost ${selectedCategory === null ? "active" : ""}`}
                      style={{ 
                        padding: "8px 16px", 
                        fontSize: 11, 
                        whiteSpace: "nowrap",
                        background: selectedCategory === null ? `${accent}15` : "transparent",
                        borderColor: selectedCategory === null ? accent : "rgba(237,232,224,0.12)",
                        color: selectedCategory === null ? accent : "rgba(237,232,224,0.6)"
                      }}
                      onClick={() => setSelectedCategory(null)}
                    >
                      {t.allCategories}
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        className={`btn-ghost ${selectedCategory === cat.id ? "active" : ""}`}
                        style={{ 
                          padding: "8px 16px", 
                          fontSize: 11, 
                          whiteSpace: "nowrap",
                          background: selectedCategory === cat.id ? `${accent}15` : "transparent",
                          borderColor: selectedCategory === cat.id ? accent : "rgba(237,232,224,0.12)",
                          color: selectedCategory === cat.id ? accent : "rgba(237,232,224,0.6)"
                        }}
                        onClick={() => setSelectedCategory(cat.id)}
                      >
                        {catName(cat)}
                      </button>
                    ))}
                  </div>
                )}
                
                {filteredServices.map(s => (
                  <div key={s.id}>
                    <div className={`service-card ${sel?.id === s.id ? "sel" : ""}`} onClick={() => { setSel(s); setSelVariant(null); setSelExtras([]); }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{svcName(s)}</div>
                          <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginTop: 3 }}>
                            {s.duration} {t.min}
                            {s.category && <span style={{ color: accent, marginLeft: 8 }}>· {catName(s.category)}</span>}
                            {s.photos?.length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} {t.photos.toLowerCase()}</span>}
                            {(s.variants?.length > 0) && <span style={{ color: accent, marginLeft: 8 }}>· {s.variants.length} {t.variants.toLowerCase()}</span>}
                          </div>
                        </div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>
                          {s.variants?.length > 0 ? `€${Math.min(...s.variants.map(v => parseFloat(v.price)))}+` : `€${s.price}`}
                        </div>
                      </div>
                      {s.photos.length > 0 && (
                        <div className="photo-grid">
                          {s.photos.map((p, i) => (
                            <img key={i} src={p} className="photo-thumb" onClick={e => { e.stopPropagation(); setGallery({ photos: s.photos, idx: i }); }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Variants inline when selected */}
                    {sel?.id === s.id && s.variants?.length > 0 && (
                      <div style={{ marginLeft: 12, marginBottom: 10 }}>
                        <SL>{t.selectVariant}</SL>
                        {s.variants.map(v => (
                          <div key={v.id} className={`service-card ${selVariant?.id === v.id ? "sel" : ""}`}
                            onClick={() => setSelVariant(selVariant?.id === v.id ? null : v)}
                            style={{ padding: "12px 15px", marginBottom: 7 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{lang === "nl" ? v.name_nl : (v.name_en || v.name_nl)}</div>
                                {(v.description_nl || v.description_en) && (
                                  <div style={{ fontSize: 10, color: "rgba(237,232,224,0.3)", marginTop: 2 }}>
                                    {lang === "nl" ? v.description_nl : (v.description_en || v.description_nl)}
                                  </div>
                                )}
                                <div style={{ fontSize: 10, color: "rgba(237,232,224,0.25)", marginTop: 2 }}>{v.duration} {t.min}</div>
                              </div>
                              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17, color: accent }}>€{v.price}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Extras inline when selected */}
                    {sel?.id === s.id && s.extras?.length > 0 && (
                      <div style={{ marginLeft: 12, marginBottom: 10 }}>
                        <SL>{t.selectExtras}</SL>
                        {s.extras.map(e => {
                          const isOn = selExtras.find(x => x.id === e.id);
                          return (
                            <div key={e.id} className={`service-card ${isOn ? "sel" : ""}`}
                              onClick={() => toggleExtra(e)}
                              style={{ padding: "11px 15px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${isOn ? accent : "rgba(237,232,224,0.18)"}`, background: isOn ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#0d0b0a", transition: "all 0.2s" }}>
                                  {isOn && "✓"}
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>{lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)}</span>
                              </div>
                              <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: accent }}>+€{e.price}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}

                {/* Staff selection */}
                {sel && availableStaff.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <SL>{t.selectStaff}</SL>
                    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                      <div className={`service-card ${selStaff === null ? "sel" : ""}`}
                        onClick={() => setSelStaff(null)}
                        style={{ padding: "10px 14px", minWidth: "fit-content", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(237,232,224,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{t.anyStaff}</div>
                      </div>
                      {availableStaff.map(m => (
                        <div key={m.id} className={`service-card ${selStaff?.id === m.id ? "sel" : ""}`}
                          onClick={() => setSelStaff(selStaff?.id === m.id ? null : m)}
                          style={{ padding: "10px 14px", minWidth: "fit-content", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${accent}22`, border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: accent }}>{m.name[0]}</div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</div>
                            {m.role && <div style={{ fontSize: 9, color: "rgba(237,232,224,0.3)" }}>{m.role}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 14 }}>
                  <button className="btn-primary" disabled={!sel || (sel.variants?.length > 0 && !selVariant)} onClick={() => setStep(2)}>{t.next}</button>
                </div>
              </>}

              {/* Step 2 — Date & Time */}
              {step === 2 && <>
                <PTitle sub={t.selectDateSub}>{t.selectDate}</PTitle>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                  {days.slice(0,10).map((d, i) => {
                    const ds = fmt(d); const isSel = date === ds;
                    return (
                      <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} onClick={() => { setDate(ds); setTime(null); }}>
                        <span style={{ fontSize: 10, color: isSel ? "#0d0b0a" : "rgba(237,232,224,0.35)" }}>{DAY[d.getDay()]}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? "#0d0b0a" : "#ede8e0", marginTop: 2 }}>{d.getDate()}</span>
                        <span style={{ fontSize: 9, color: isSel ? "#0d0b0a" : "rgba(237,232,224,0.25)" }}>{MON[d.getMonth()]}</span>
                      </div>
                    );
                  })}
                </div>
                <SL>{t.selectTime}</SL>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 20 }}>
                  {TIMES.map(tt => <div key={tt} className={`time-chip ${time === tt ? "sel" : ""}`} onClick={() => setTime(tt)}>{tt}</div>)}
                </div>
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
                      <span style={{ fontSize: 18 }}>👋</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: accent }}>{t.welcomeBackClient}!</div>
                        <div style={{ fontSize: 10, color: "rgba(237,232,224,0.5)" }}>{t.foundYourDetails}</div>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input className="input-field" placeholder={t.firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                    <input className="input-field" placeholder={t.lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                  </div>
                  <input className="input-field" placeholder={`${t.phone}${initialSalon.phone_required ? ` (${t.required})` : ` (${t.optional})`}`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
                </div>
                
                {/* Discount code */}
                {initialSalon.discount_codes?.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <SL>{t.discountCode}</SL>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input 
                        className="input-field" 
                        placeholder={t.enterDiscountCode}
                        value={discountCode}
                        onChange={e => setDiscountCode(e.target.value)}
                        disabled={!!appliedDiscount}
                        style={{ flex: 1 }}
                      />
                      {!appliedDiscount ? (
                        <button className="btn-ghost" style={{ padding: "12px 20px", color: accent, borderColor: `${accent}40` }} onClick={applyDiscount}>{t.applyCode}</button>
                      ) : (
                        <div style={{ padding: "12px 16px", background: `${accent}15`, borderRadius: 12, color: accent, fontSize: 11, display: "flex", alignItems: "center" }}>✓</div>
                      )}
                    </div>
                    {appliedDiscount && (
                      <div style={{ fontSize: 11, color: "#86efac", marginTop: 6 }}>{t.codeApplied} -{appliedDiscount.discount_type === "percentage" ? `${appliedDiscount.discount_value}%` : `€${appliedDiscount.discount_value}`}</div>
                    )}
                  </div>
                )}
                
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
                
                {/* Booking policy checkbox */}
                {initialSalon.booking_policy && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                      <input 
                        type="checkbox" 
                        checked={policyAgreed} 
                        onChange={e => setPolicyAgreed(e.target.checked)}
                        style={{ marginTop: 2, accentColor: accent }}
                      />
                      <span style={{ fontSize: 11, color: "rgba(237,232,224,0.6)", lineHeight: 1.5 }}>
                        {t.agreeToPolicy}
                      </span>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: accent }}>{t.total}</span>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: accent }}>€{getPrice().toFixed(2)}</span>
                  </div>
                  {appliedDiscount && (
                    <div style={{ fontSize: 10, color: "#86efac", textAlign: "right", marginTop: -4 }}>{t.discount}: -{appliedDiscount.discount_type === "percentage" ? `${appliedDiscount.discount_value}%` : `€${appliedDiscount.discount_value}`}</div>
                  )}
                </div>
                <button className="btn-primary" onClick={confirmBooking}>{t.confirm}</button>
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

        {/* Gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)}>
            <img src={gallery.photos[gallery.idx]} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {gallery.photos.map((p, i) => (
                <img key={i} src={p} onClick={e => { e.stopPropagation(); setGallery(g => ({...g, idx: i})); }}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `2px solid ${i === gallery.idx ? accent : "transparent"}`, opacity: i === gallery.idx ? 1 : 0.5, transition: "all 0.2s" }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Phone>
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
    return { id: user.slug, name: user.name, city: user.city || "Nederland", accent: ACCENT, services: [], appointments: [] };
  });
  const [saved, setSaved] = useState(false);
  const [newSvc, setNewSvc] = useState({ name_nl: "", name_en: "", price: "", duration: "60" });
  const [svcError, setSvcError] = useState("");
  const [gallery, setGallery] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileRefs = useRef({});

  // Load salon data from Supabase
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("profiles").select("*, services(*, service_variants(*), service_extras(*))").eq("slug", user.slug).single();
      if (data) {
        // Load appointments
        const { data: appts } = await supabase.from("appointments").select("*").eq("owner_id", data.id).order("date", { ascending: false });
        // Load reviews
        const { data: reviews } = await supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false });
        // Load staff
        const { data: staffData } = await supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).order("position");
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
          services: (data.services || []).map(s => ({
            ...s,
            name_nl: s.name_nl || s.name || "",
            name_en: s.name_en || s.name || "",
            photos: [],
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

  const addPhoto = (serviceId, file) => {
    const url = URL.createObjectURL(file);
    update(d => { d.services = d.services.map(s => s.id === serviceId ? {...s, photos: [...s.photos, url]} : s); return d; });
  };

  const deletePhoto = (serviceId, idx) => update(d => { d.services = d.services.map(s => s.id === serviceId ? {...s, photos: s.photos.filter((_,i) => i !== idx)} : s); return d; });

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

  return (
    <Phone accent={accent}>
      <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}10 0%, transparent 55%)`, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "'Jost',sans-serif", color: "#ede8e0" }}>

        <div style={{ padding: "20px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 400, letterSpacing: "0.06em" }}>{salonData.name}</div>
            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${accent}18`, color: accent, border: `1px solid ${accent}33`, letterSpacing: "0.1em", textTransform: "uppercase" }}>{lang === "nl" ? "eigenaar" : "owner"}</span>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "14px 22px 20px" }}>

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
                ? <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(237,232,224,0.18)", fontSize: 12 }}>{t.freeDay}</div>
                : (() => {
                    const now = new Date();
                    const currentMinutes = now.getHours() * 60 + now.getMinutes();
                    const sorted = [...todayAppts].sort((a, b) => {
                      const [ah, am] = a.time.split(":").map(Number);
                      const [bh, bm] = b.time.split(":").map(Number);
                      return (ah * 60 + am) - (bh * 60 + bm);
                    });
                    
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {sorted.map((a, idx) => {
                          const [h, m] = a.time.split(":").map(Number);
                          const apptMinutes = h * 60 + m;
                          const endMinutes = apptMinutes + (a.service_duration || 60);
                          const isNow = currentMinutes >= apptMinutes && currentMinutes < endMinutes;
                          const isPast = currentMinutes >= endMinutes;
                          const isNext = !isPast && !isNow && sorted.slice(0, idx).every(prev => {
                            const [ph, pm] = prev.time.split(":").map(Number);
                            return currentMinutes >= (ph * 60 + pm) + (prev.service_duration || 60);
                          });
                          const minutesUntil = apptMinutes - currentMinutes;
                          const hoursUntil = Math.floor(minutesUntil / 60);
                          const minsUntil = minutesUntil % 60;
                          
                          return (
                            <div key={a.id} style={{ display: "flex", gap: 12, opacity: isPast ? 0.4 : 1 }}>
                              {/* Timeline */}
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
                                <div style={{ 
                                  width: isNow ? 14 : 10, 
                                  height: isNow ? 14 : 10, 
                                  borderRadius: "50%", 
                                  background: isNow ? accent : isPast ? "rgba(237,232,224,0.15)" : `${accent}40`,
                                  border: isNow ? `2px solid ${accent}` : "none",
                                  boxShadow: isNow ? `0 0 12px ${accent}60` : "none",
                                  animation: isNow ? "pulse 2s infinite" : "none"
                                }} />
                                {idx < sorted.length - 1 && (
                                  <div style={{ width: 2, flex: 1, minHeight: 50, background: isPast ? "rgba(237,232,224,0.08)" : `${accent}20` }} />
                                )}
                              </div>
                              
                              {/* Card */}
                              <div style={{ 
                                flex: 1, 
                                background: isNow ? `${accent}12` : "rgba(237,232,224,0.03)", 
                                border: isNow ? `1px solid ${accent}40` : "1px solid rgba(237,232,224,0.06)",
                                borderRadius: 12, 
                                padding: "14px 16px", 
                                marginBottom: 12,
                                position: "relative"
                              }}>
                                {isNow && (
                                  <div style={{ 
                                    position: "absolute", 
                                    top: 10, 
                                    right: 10, 
                                    fontSize: 8, 
                                    fontWeight: 600, 
                                    padding: "3px 8px", 
                                    borderRadius: 10, 
                                    background: accent, 
                                    color: "#0d0b0a",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase"
                                  }}>{t.inProgress}</div>
                                )}
                                {isNext && !isNow && minutesUntil > 0 && (
                                  <div style={{ 
                                    position: "absolute", 
                                    top: 10, 
                                    right: 10, 
                                    fontSize: 8, 
                                    fontWeight: 500, 
                                    padding: "3px 8px", 
                                    borderRadius: 10, 
                                    background: `${accent}20`, 
                                    color: accent,
                                    letterSpacing: "0.05em"
                                  }}>
                                    {t.startsIn} {hoursUntil > 0 ? `${hoursUntil}${t.hoursShort} ` : ""}{minsUntil}{t.minutesShort}
                                  </div>
                                )}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                  <div>
                                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400, color: isNow ? accent : "#ede8e0" }}>{a.time}</div>
                                    <div style={{ fontWeight: 500, fontSize: 13, marginTop: 4 }}>{a.client_name}</div>
                                    <div style={{ fontSize: 11, color: "rgba(237,232,224,0.4)", marginTop: 2 }}>{a.service_name}</div>
                                    {a.staff_name && <div style={{ fontSize: 10, color: "rgba(237,232,224,0.25)", marginTop: 2 }}>👤 {a.staff_name}</div>}
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{a.service_price}</div>
                                    <div style={{ fontSize: 9, color: "rgba(237,232,224,0.3)", marginTop: 2 }}>{a.service_duration || 60} {t.min}</div>
                                  </div>
                                </div>
                                {a.status === "confirmed" && !isPast && (
                                  <button 
                                    className="btn-ghost" 
                                    style={{ width: "100%", fontSize: 10, marginTop: 10, padding: "8px 12px" }} 
                                    onClick={() => markComplete(a.id)}
                                  >
                                    {t.markComplete}
                                  </button>
                                )}
                                {a.status === "completed" && !a.invoice_sent && (
                                  <button className="btn-primary" style={{ width: "100%", fontSize: 10, marginTop: 10 }} onClick={() => sendInvoice(a.id)}>
                                    {t.sendInvoice}
                                  </button>
                                )}
                                {a.status === "completed" && a.invoice_sent && (
                                  <div style={{ fontSize: 10, color: "#86efac", marginTop: 8, textAlign: "center" }}>{t.invoiceSent}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
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
                      {s.photos.map((p, i) => (
                        <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                          <img src={p} className="photo-thumb" onClick={() => setGallery({ photos: s.photos, idx: i })} />
                          <div onClick={() => deletePhoto(s.id, i)} style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer", fontWeight: 700, lineHeight: 1 }}>×</div>
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
                  next_invoice_number: salonData.next_invoice_number || 1
                }).eq("id", salonData.owner_id);
                setSaved(true); setTimeout(() => setSaved(false), 2000);
              }}>{saved ? t.saved : t.save}</button>
              <button className="btn-ghost" style={{ width: "100%", marginTop: 10, color: "rgba(237,232,224,0.3)" }} onClick={onLogout}>{t.logout}</button>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <div style={{ position: "sticky", bottom: 0, left: 0, right: 0, background: "rgba(13,11,10,0.97)", backdropFilter: "blur(24px)", borderTop: "1px solid rgba(237,232,224,0.08)", display: "flex", padding: "10px 4px", paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
          {[["dashboard","◈",t.dashboard],["agenda","◎",t.agenda],["analytics","◇",t.analytics],["facturen","✦",t.invoices],["instellingen","⊙",t.settings]].map(([k,icon,label]) => (
            <div key={k} className="nav-item" onClick={() => setView(k)} style={{ gap: 3 }}>
              <span style={{ fontSize: 18, color: view === k ? accent : "rgba(237,232,224,0.25)", transition: "color 0.2s" }}>{icon}</span>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: view === k ? accent : "rgba(237,232,224,0.25)", transition: "color 0.2s", whiteSpace: "nowrap" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Photo gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)}>
            <img src={gallery.photos[gallery.idx]} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {gallery.photos.map((p, i) => (
                <img key={i} src={p} onClick={e => { e.stopPropagation(); setGallery(g => ({...g, idx: i})); }}
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
                          {s.photos.length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} foto's</span>}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent }}>€{s.price}</div>
                    </div>
                    {s.photos.length > 0 && (
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginTop: 12 }}>
                        {s.photos.map((p, i) => (
                          <img key={i} src={p} style={{ width: 68, height: 68, borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid rgba(237,232,224,0.08)" }} />
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
    </Phone>
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
    return (
      <div style={{ background: "#0d0b0a", minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: window.innerWidth > 520 ? "32px 16px" : "0" }}>
        <OwnerApp user={owner} lang={lang} setLang={setLang} salons={{}} onSalonUpdate={() => {}} onLogout={handleLogout} />
      </div>
    );
  }

  return (
    <div style={{ background: "#0d0b0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: window.innerWidth > 520 ? "32px 16px" : "0" }}>
      <OwnerAuth lang={lang} setLang={setLang} onBack={() => navigate("/")} onLogin={handleLogin} />
    </div>
  );
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
      const { data, error } = await supabase.from("profiles").select("*, services(*, service_variants(*), service_extras(*))").eq("slug", slug).single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      // Load reviews
      const { data: reviews } = await supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false });
      // Load staff
      const { data: staffData } = await supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).eq("active", true).order("position");
      // Load categories
      const { data: categoriesData } = await supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position");
      setSalon({
        id: data.slug,
        owner_id: data.id,
        name: data.business_name || data.owner_name || "Salon",
        city: data.city || "Nederland",
        accent: data.accent_color || "#c9a96e",
        owner_email: data.email,
        booking_policy: data.booking_policy || null,
        phone_required: data.phone_required || false,
        discount_codes: data.discount_codes || [],
        services: (data.services || []).map(s => ({
          ...s,
          name_nl: s.name_nl || s.name || "",
          name_en: s.name_en || s.name || "",
          photos: [],
          variants: (s.service_variants || []).sort((a,b) => (a.position||0) - (b.position||0)),
          extras: s.service_extras || []
        })),
        appointments: [],
        reviews: reviews || [],
        staff: (staffData || []).map(s => ({ ...s, service_ids: (s.staff_services || []).map(ss => ss.service_id) })),
        categories: categoriesData || []
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
    <div style={{ background: "#0d0b0a", minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: window.innerWidth > 520 ? "32px 16px" : "0" }}>
      {screen === "landing" && <LandingScreen lang={lang} setLang={setLang} salons={salons} onSelectSalon={handleSelectSalon} onOwnerEnter={() => setScreen("ownerAuth")} />}
      {screen === "client" && <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => setScreen("landing")} />}
      {screen === "ownerAuth" && <OwnerAuth lang={lang} setLang={setLang} onBack={() => setScreen("landing")} onLogin={u => { setOwner(u); setScreen("owner"); }} />}
      {screen === "owner" && <OwnerApp user={owner} lang={lang} setLang={setLang} salons={salons} onSalonUpdate={updateSalon} onLogout={() => { setOwner(null); setScreen("landing"); }} />}
    </div>
  );
}

// ─── CANCEL ROUTE (vellu.cc/cancel/TOKEN) ─────────────────────
function CancelRoute({ lang }) {
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
    await supabase.from("appointments").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null
    }).eq("id", appointment.id);
    
    await supabase.from("cancellation_tokens").update({ used: true }).eq("token", token);
    
    await sendEmails("booking_cancelled", {
      client_name: appointment.client_name,
      client_email: appointment.client_email,
      service_name: appointment.service_name,
      date: appointment.date,
      time: appointment.time
    });
    
    setStatus("cancelled");
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#0d0b0a", fontFamily: "'Jost',sans-serif", color: "#ede8e0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{makeCSS(ACCENT)}</style>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        {status === "loading" && (
          <div style={{ color: "rgba(237,232,224,0.4)" }}>laden...</div>
        )}
        
        {status === "confirm" && appointment && (
          <div className="fade-up">
            <div style={{ fontSize: 48, marginBottom: 20 }}>📅</div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {t.cancelBooking}
            </h1>
            <p style={{ color: "rgba(237,232,224,0.5)", marginBottom: 30 }}>{t.cancelBookingDesc}</p>
            
            <div style={{ background: "rgba(237,232,224,0.03)", border: "1px solid rgba(237,232,224,0.08)", borderRadius: 16, padding: 20, marginBottom: 24, textAlign: "left" }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,232,224,0.35)" }}>{t.treatment}</div>
                <div style={{ fontWeight: 500 }}>{appointment.service_name}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,232,224,0.35)" }}>{t.date}</div>
                <div style={{ fontWeight: 500 }}>{appointment.date} {lang === "nl" ? "om" : "at"} {appointment.time}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,232,224,0.35)" }}>{t.total}</div>
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
            
            <button className="btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => window.location.href = "/"}>
              {lang === "nl" ? "Terug" : "Back"}
            </button>
          </div>
        )}
        
        {status === "cancelled" && (
          <div className="fade-up">
            <div style={{ fontSize: 48, marginBottom: 20 }}>✓</div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {t.bookingCancelled}
            </h1>
            <p style={{ color: "rgba(237,232,224,0.5)", marginBottom: 30 }}>
              {lang === "nl" ? "Je ontvangt een bevestiging per e-mail." : "You will receive a confirmation email."}
            </p>
            <button className="btn-ghost" onClick={() => window.location.href = "/"}>
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
            <p style={{ color: "rgba(237,232,224,0.5)", marginBottom: 30 }}>{t.cancelBeforeTime}</p>
            <button className="btn-ghost" onClick={() => window.location.href = "/"}>
              {lang === "nl" ? "Terug naar home" : "Back to home"}
            </button>
          </div>
        )}
        
        {status === "error" && (
          <div className="fade-up">
            <div style={{ fontSize: 48, marginBottom: 20 }}>❌</div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>
              {lang === "nl" ? "Link ongeldig" : "Invalid link"}
            </h1>
            <p style={{ color: "rgba(237,232,224,0.5)", marginBottom: 30 }}>
              {lang === "nl" ? "Deze annuleringslink is niet geldig." : "This cancellation link is not valid."}
            </p>
            <button className="btn-ghost" onClick={() => window.location.href = "/"}>
              {lang === "nl" ? "Terug naar home" : "Back to home"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VelluApp() {
  const [lang, setLang] = useState("nl");
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppInner />} />
        <Route path="/owner" element={<OwnerEntryPage lang={lang} setLang={setLang} />} />
        <Route path="/cancel/:token" element={<CancelRoute lang={lang} />} />
        <Route path="/:slug" element={<SalonRouteWrapper lang={lang} setLang={setLang} />} />
      </Routes>
    </BrowserRouter>
  );
}
