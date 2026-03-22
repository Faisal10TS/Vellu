import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "./supabase.js";
import { BrowserRouter, Routes, Route, useParams, useNavigate } from "react-router-dom";

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
    navBg: "rgba(13,11,10,0.97)",
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
    navBg: "rgba(250,249,247,0.97)",
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
  return (
    <ThemeContext.Provider value={{ theme, colors: THEMES[theme], toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() { return useContext(ThemeContext); }


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
    noShow:"Niet verschenen", markNoShow:"✗ No-show", noShowWarning:"Let op: deze klant is eerder niet verschenen",
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
    // Follow-up
    followupRate:"Follow-up response rate",
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
    noShow:"No-show", markNoShow:"✗ No-show", noShowWarning:"Note: this client has missed appointments before",
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
    // Follow-up
    followupRate:"Follow-up response rate",
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
  }
};

// ─── NO DEMO SALONS (removed) ────────────────────────────────
const DEMO_SALONS = {};

// ─── CSS ─────────────────────────────────────────────────────
const makeCSS = (accent, c = THEMES.dark) => `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=Jost:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  input, textarea, select { outline: none; font-family: 'Jost', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
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
      {[["light","☀"], ["dark","☾"]].map(([m, icon]) => (
        <button key={m} className={`lang-btn ${theme === m ? "active" : "inactive"}`} onClick={toggle} style={{ fontSize: 12, padding: "5px 9px" }}>{icon}</button>
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
  const t = T[lang];
  const [slugInput, setSlugInput] = useState("");
  const [error, setError] = useState("");
  const [faqOpen, setFaqOpen] = useState(null);

  const goToSlug = (slug) => {
    let clean = slug.toLowerCase().trim()
      .replace(/^https?:\/\//, "")
      .replace(/^(www\.)?vellu\.cc\//, "");
    if (!clean) return;
    window.location.href = "/" + clean;
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
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => window.location.href = "/owner"}>
              👑 {lang === "nl" ? "Inloggen" : "Sign in"}
            </button>
          </div>
        </nav>

        {/* ─── HERO ─── */}
        <div style={{ padding: "80px 24px 60px", textAlign: "center", position: "relative", zIndex: 10, maxWidth: 700, margin: "0 auto" }}>
          <div className="fade-up">
            <div style={{ display: "inline-block", background: `${ACCENT}15`, border: `1px solid ${ACCENT}33`, borderRadius: 100, padding: "6px 18px", fontSize: 11, fontWeight: 500, color: ACCENT, letterSpacing: "0.04em", marginBottom: 28 }}>
              ✦ {lang === "nl" ? "Voor nail techs, lash artists, kappers & meer" : "For nail techs, lash artists, hairdressers & more"}
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
              <button className="btn-primary" style={{ width: "auto", padding: "16px 36px", fontSize: 13 }} onClick={() => window.location.href = "/owner"}>
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
                { num: "01", icon: "✦", nl: ["Maak je pagina", "Voeg je behandelingen toe, stel je team in, kies je kleuren. Je eigen link: vellu.cc/jouw-naam."], en: ["Create your page", "Add your treatments, set up your team, choose your colors. Your own link: vellu.cc/your-name."] },
                { num: "02", icon: "◎", nl: ["Deel je link", "Zet je link in je Instagram bio, WhatsApp status of visitekaartje. Klanten boeken direct, zonder tussenpartij."], en: ["Share your link", "Put your link in your Instagram bio, WhatsApp status or business card. Clients book directly, no middleman."] },
                { num: "03", icon: "◈", nl: ["Ontvang boekingen", "Automatische bevestigingen, 24u herinneringen en follow-up emails. Jij focust op je vak, Vellu regelt de rest."], en: ["Receive bookings", "Automatic confirmations, 24h reminders and follow-up emails. You focus on your craft, Vellu handles the rest."] }
              ].map((item, i) => (
                <div key={i} style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 24, padding: "32px 28px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 16, right: 20, fontFamily: "'Cormorant Garamond',serif", fontSize: 48, fontWeight: 300, color: `${ACCENT}12` }}>{item.num}</div>
                  <div style={{ fontSize: 28, marginBottom: 16, color: ACCENT }}>{item.icon}</div>
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
                { icon: "📅", nl: "Eigen boekingspagina", en: "Your own booking page", sub: { nl: "vellu.cc/jouw-naam — jouw merk, jouw link", en: "vellu.cc/your-name — your brand, your link" } },
                { icon: "👥", nl: "Team accounts", en: "Team accounts", sub: { nl: "Elke medewerker een eigen login, agenda en diensten", en: "Each staff member gets their own login, schedule and services" } },
                { icon: "📧", nl: "Automatische emails", en: "Automatic emails", sub: { nl: "Bevestigingen, herinneringen en follow-ups", en: "Confirmations, reminders and follow-ups" } },
                { icon: "📊", nl: "0% commissie", en: "0% commission", sub: { nl: "Vast maandtarief. Geen verborgen kosten, geen commissie per boeking", en: "Fixed monthly price. No hidden fees, no commission per booking" } },
                { icon: "⭐", nl: "Reviews", en: "Reviews", sub: { nl: "Automatisch reviews verzamelen na bezoek", en: "Automatically collect reviews after visits" } },
                { icon: "🎨", nl: "Eigen branding", en: "Custom branding", sub: { nl: "Jouw logo, kleuren en stijl", en: "Your logo, colors and style" } },
                { icon: "📸", nl: "Portfolio", en: "Portfolio", sub: { nl: "Foto's per behandeling tonen", en: "Show photos per treatment" } },
                { icon: "🏷️", nl: "Kortingscodes", en: "Discount codes", sub: { nl: "Maak en deel korting met je klanten", en: "Create and share discounts with clients" } },
              ].map((f, i) => (
                <div key={i} style={{ padding: "20px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 18 }}>
                  <span style={{ fontSize: 24 }}>{f.icon}</span>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{lang === "nl" ? f.nl : f.en}</div>
                  <div style={{ fontSize: 11, color: c.textLabel, lineHeight: 1.5 }}>{lang === "nl" ? f.sub.nl : f.sub.en}</div>
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
                        <span style={{ color: ACCENT, fontSize: 14 }}>✓</span>{f}
                      </div>
                    ))}
                  </div>
                  <button className={plan.popular ? "btn-primary" : "btn-ghost"} style={{ width: "100%", ...(plan.popular ? {} : { borderColor: `${ACCENT}44`, color: ACCENT }) }}
                    onClick={() => window.location.href = "/owner"}>
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
            <button className="btn-primary" style={{ width: "auto", padding: "16px 44px", fontSize: 14 }} onClick={() => window.location.href = "/owner"}>
              {lang === "nl" ? "Gratis beginnen →" : "Start for free →"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ padding: "24px 32px", textAlign: "center", borderTop: "1px solid " + c.border, position: "relative", zIndex: 10 }}>
          <div style={{ fontSize: 11, color: c.textMuted }}>© {new Date().getFullYear()} vellu · <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Privacy" : "Privacy"}</a> · {lang === "nl" ? "Gemaakt voor beauty professionals" : "Made for beauty professionals"}</div>
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
            <div style={{ fontSize: 36, marginBottom: 12 }}>👑</div>
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
                    {[["joint", "👤", t.jointAccount, t.jointDesc], ["team", "👥", t.teamAccount, t.teamDesc]].map(([type, icon, label, desc]) => (
                      <div key={type} onClick={() => setForm(f => ({...f, accountType: type}))} style={{
                        flex: 1, padding: "14px 12px", borderRadius: 14, cursor: "pointer", textAlign: "center", transition: "all 0.2s",
                        background: form.accountType === type ? `${ACCENT}12` : c.inputBg,
                        border: `1.5px solid ${form.accountType === type ? ACCENT : c.inputBorder}`
                      }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
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
            {resetSent && <div style={{ fontSize: 12, color: "#86efac", marginBottom: 16, textAlign: "center" }}>{lang === "nl" ? "✓ Reset link verstuurd! Check je inbox." : "✓ Reset link sent! Check your inbox."}</div>}
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
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", textAlign: "left" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 10 }}>{t.writeReview}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[1,2,3,4,5].map(s => (
          <span key={s} onClick={() => setRating(s)} style={{ fontSize: 26, cursor: "pointer", color: s <= rating ? accent : c.textMuted, transition: "all 0.15s", transform: s <= rating ? "scale(1.1)" : "none" }}>★</span>
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
  const isDayBlocked = (dateStr) => dayOverrides[dateStr]?.type === "blocked";
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
  
  // Find first available (non-closed) day
  const getFirstAvailableDate = () => {
    const now = getToday();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const dateStr = fmt(d);
      const hours = getEffectiveHours(dateStr);
      if (!hours.closed) return dateStr;
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
  const activeCodes = (initialSalon.discount_codes || []).filter(c => c.active);
  
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

  const reset = () => { setStep(hasLocations ? 0 : 1); setSelectedServices([]); setTime(null); setDone(false); setSubmitting(false); setSlotsRefreshKey(k => k + 1); setClientNoShows(0); setForm({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival", allergies: "" }); setPolicyAgreed(false); setAppliedDiscount(null); setDiscountCode(""); if (hasLocations) setSelectedLocation(null); };

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
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("clients").select("*").eq("email", form.email.toLowerCase()).single();
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

  // Load booked time slots for selected date
  useEffect(() => {
    if (!date || !initialSalon.owner_id) return;
    const loadSlots = async () => {
      const { data } = await supabase
        .from("appointments")
        .select("time, service_duration")
        .eq("owner_id", initialSalon.owner_id)
        .eq("date", date)
        .in("status", ["confirmed", "completed"]);
      setBookedSlots(data || []);
    };
    loadSlots();
  }, [date, initialSalon.owner_id, slotsRefreshKey]);

  // Check if a time slot overlaps with existing bookings (including break time)
  const breakBuffer = activeBreakMinutes;
  
  const isTimeSlotBooked = (slotTime) => {
    const slotMinutes = parseInt(slotTime.split(":")[0]) * 60 + parseInt(slotTime.split(":")[1]);
    const myDuration = Math.max(getDuration(), 30); // Minimum 30 min block
    for (const booked of bookedSlots) {
      if (!booked.time) continue;
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

  // Generate random cancellation token
  const generateToken = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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
    
    if (form.payment === "online") {
      await sendEmails("invoice", { client_name: `${form.firstName} ${form.lastName}`, client_email: clientEmail, service_name: combinedServiceName,
        date, time, price: getPrice(), salon_name: initialSalon.name });
    }
    } catch (err) {
      console.error("Booking error:", err);
      setErrorToast(lang === "nl" ? "Er ging iets mis bij het boeken. Probeer het opnieuw." : "Something went wrong while booking. Please try again.");
      setTimeout(() => setErrorToast(""), 5000);
      setSubmitting(false);
    }
  };

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
          <div style={{ fontSize: 11, color: c.textSub }}>📍 {selectedLocation.name}</div>
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
                🏷️ {appliedDiscount.code} ({appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`})
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
          <div style={{ display: "flex", minHeight: "100vh" }}>
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
                        {step > s ? "✓" : (hasLocations ? s : s)}
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
                      {loc.phone && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>📞 {loc.phone}</div>}
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
                      ✓ {selectedServices.length} {selectedServices.length === 1 ? t.serviceSelected : t.servicesSelected}
                    </span>
                    <span style={{ fontSize: 12, color: c.textSub }}>{getDuration()} {t.min} · €{getOriginalPrice().toFixed(2)}</span>
                  </div>
                )}

                {filteredServices.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: c.textMuted }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>💇</div>
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
                            {isSel && <span style={{ color: c.btnOnDark, fontSize: 13, fontWeight: 700 }}>✓</span>}
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
                      ⚠️ {lang === "nl" ? "Kies een variant voor: " : "Choose a variant for: "}{missingVariants.map(item => svcName(item.service)).join(", ")}
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
                          <span style={{ fontWeight: 500, fontSize: 12 }}>{r.client_name.split(" ")[0]}</span>
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
                      <span style={{ fontSize: 18 }}>👋</span>
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
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#f87171" }}>{t.noShowWarning}</div>
                      <div style={{ fontSize: 10, color: "rgba(248,113,113,0.6)" }}>{clientNoShows}x {t.noShowCount}</div>
                    </div>
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
                      <div style={{ fontSize: 11, color: c.textSub }}>{appliedDiscount.code}: {appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`}</div>
                    </div>
                    <div onClick={() => setAppliedDiscount(null)} style={{ cursor: "pointer", fontSize: 12, color: c.textLabel }}>✕</div>
                  </div>
                )}

                {/* Booking Policy */}
                {initialSalon.booking_policy && (
                  <div style={{ marginBottom: 20, padding: "16px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14 }}>
                    <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.bookingPolicy}</div>
                    <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6, marginBottom: 14, whiteSpace: "pre-wrap" }}>{initialSalon.booking_policy}</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <div onClick={() => setPolicyAgreed(!policyAgreed)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${policyAgreed ? accent : c.textMuted}`, background: policyAgreed ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                        {policyAgreed && <span style={{ color: c.btnOnDark, fontSize: 14, fontWeight: 700 }}>✓</span>}
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
                      <span style={{ fontSize: 11, color: "#4ade80", letterSpacing: "0.04em" }}>🏷️ {t.discount}</span>
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
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: `${accent}18`, border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", fontSize: 28 }}>💅</div>
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
                  <button onClick={done ? reset : (step > 1 ? () => setStep(s => s-1) : onBack)} style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "none", borderRadius: 100, padding: "8px 14px", color: "#fff", fontSize: 12, cursor: "pointer" }}>
                    ←
                  </button>
                )}
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
                onBack={done ? reset : (step > 1 ? () => setStep(s => s-1) : onBack)}
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
                            {loc.phone && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>📞 {loc.phone}</div>}
                          </div>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selectedLocation?.id === loc.id ? accent : c.textMuted}`, background: selectedLocation?.id === loc.id ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                            {selectedLocation?.id === loc.id && <span style={{ color: c.btnOnDark, fontSize: 10, fontWeight: 700 }}>✓</span>}
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
                          ✓ {selectedServices.length} {selectedServices.length === 1 ? t.serviceSelected : t.servicesSelected}
                        </span>
                        <span style={{ fontSize: 11, color: c.textSub }}>{getDuration()} {t.min}</span>
                      </div>
                    )}

                    {filteredServices.length === 0 && (
                      <div style={{ textAlign: "center", padding: "30px 16px", color: c.textMuted }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>💇</div>
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
                                {isSel && <span style={{ color: c.btnOnDark, fontSize: 12, fontWeight: 700 }}>✓</span>}
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
                          ⚠️ {lang === "nl" ? "Kies een variant voor: " : "Choose a variant for: "}{missingVariants.map(item => svcName(item.service)).join(", ")}
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
                          <span style={{ fontSize: 18 }}>👋</span>
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
                        <span style={{ fontSize: 16 }}>⚠️</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 500, color: "#f87171" }}>{t.noShowWarning}</div>
                          <div style={{ fontSize: 10, color: "rgba(248,113,113,0.6)" }}>{clientNoShows}x {t.noShowCount}</div>
                        </div>
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
                          <div style={{ fontSize: 10, color: c.textSub }}>{appliedDiscount.code}: {appliedDiscount.type === "percent" ? `-${appliedDiscount.amount}%` : `-€${appliedDiscount.amount}`}</div>
                        </div>
                        <div onClick={() => setAppliedDiscount(null)} style={{ cursor: "pointer", fontSize: 12, color: c.textLabel }}>✕</div>
                      </div>
                    )}

                    {/* Booking Policy (mobile) */}
                    {initialSalon.booking_policy && (
                      <div style={{ marginBottom: 20, padding: "14px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14 }}>
                        <div style={{ fontSize: 10, color: c.textLabel, marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.bookingPolicy}</div>
                        <div style={{ fontSize: 11, color: c.textSub, lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{initialSalon.booking_policy}</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <div onClick={() => setPolicyAgreed(!policyAgreed)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${policyAgreed ? accent : c.textMuted}`, background: policyAgreed ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                            {policyAgreed && <span style={{ color: c.btnOnDark, fontSize: 12, fontWeight: 700 }}>✓</span>}
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
                          <span style={{ fontSize: 11, color: "#4ade80", letterSpacing: "0.04em" }}>🏷️ {t.discount}</span>
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
                            <span style={{ fontWeight: 500, fontSize: 12 }}>{r.client_name.split(" ")[0]}</span>
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

            {/* Mobile bottom bar with action button */}
            {!done && selectedServices.length > 0 && (
              <div style={{ 
                position: "fixed", bottom: 0, left: 0, right: 0, 
                background: c.navBg, backdropFilter: "blur(24px)", 
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "✓ Toevoegen" : "✓ Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}>✕</button>
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "✓ Toevoegen" : "✓ Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}>✕</button>
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "✓ Toevoegen" : "✓ Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}>✕</button>
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{lang === "nl" ? "✓ Toevoegen" : "✓ Add"}</button>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px" }} onClick={() => setOpen(false)}>✕</button>
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
            <div style={{ fontSize: 36, marginBottom: 16 }}>👑</div>
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
                      <span style={{ color: accent, fontSize: 14 }}>✓</span>
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

// ─── OWNER DASHBOARD ─────────────────────────────────────────
function OwnerApp({ user, onLogout, lang, setLang, salons = DEMO_SALONS, onSalonUpdate }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const DAY = lang === "nl" ? DAY_NL : DAY_EN;

  const [view, setView] = useState("dashboard");
  const [calDate, setCalDate] = useState(fmt(getToday()));
  const [agendaStaff, setAgendaStaff] = useState(null); // null = all, or staff member id
  const [salonData, setSalonData] = useState(() => {
    return { 
      id: user.slug, name: user.name, city: user.city || "Nederland", accent: ACCENT, 
      services: [], appointments: [], business_hours: DEFAULT_HOURS,
      booking_policy: "", phone_required: false, logo_url: "", cover_image_url: "", discount_codes: [],
      locations: [], day_overrides: {}, account_type: user.account_type || "joint",
      min_advance_hours: 0, max_advance_days: 60
    };
  });
  const [saved, setSaved] = useState(false);
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
  const [editStaffForm, setEditStaffForm] = useState({ name: "", role: "", working_hours: {} });
  // Manual appointment
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [addApptForm, setAddApptForm] = useState({ service_id: "", variant_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "", staff_id: "" });
  const [addApptLoading, setAddApptLoading] = useState(false);
  const [addApptDone, setAddApptDone] = useState(false);
  // Exception/blocked days
  const [newException, setNewException] = useState({ date: "", open: "09:00", close: "17:30" });
  const [newBlocked, setNewBlocked] = useState({ from: "", to: "", reason: "" });
  const [editingVariant, setEditingVariant] = useState(null);
  const [editVariantForm, setEditVariantForm] = useState({ name_nl: "", name_en: "", price: "", duration: "", description_nl: "" });
  const [editingExtra, setEditingExtra] = useState(null);
  const [editExtraForm, setEditExtraForm] = useState({ name_nl: "", name_en: "", price: "" });
  const [settingsTab, setSettingsTab] = useState("salon");

  // Load salon data from Supabase
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("profiles").select("*, services(*, service_variants(*), service_extras(*), service_photos(*))").eq("slug", user.slug).single();
      if (data) {
        // Load appointments
        const { data: appts } = await supabase.from("appointments").select("*").eq("owner_id", data.id).order("date", { ascending: false });
        // Load reviews
        const { data: reviews } = await supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false });
        // Load staff
        const { data: staffData } = await supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).order("position");
        // Load categories
        const { data: catData } = await supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position");
        // Load locations
        const { data: locData } = await supabase.from("locations").select("*").eq("owner_id", data.id).order("position");
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
          break_minutes: data.break_minutes || 0,
          logo_url: data.logo_url || "",
          cover_image_url: data.cover_image_url || "",
          discount_codes: data.discount_codes || [],
          day_overrides: data.day_overrides || {},
          account_type: data.account_type || "joint",
          min_advance_hours: data.min_advance_hours || 0,
          max_advance_days: data.max_advance_days || 60,
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
      }
    };
    load();
  }, [user.slug]);

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
  const markComplete = async (id) => {
    await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
    update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, status:"completed"} : a); return d; });
  };
  const markNoShow = async (id) => {
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
  };
  const sendInvoice = async (id) => {
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
    // Compress image if > 1MB
    let uploadFile = file;
    if (file.size > 1024 * 1024) {
      try {
        const img = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        const maxDim = 1600;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
        uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
      } catch(e) { /* fallback to original */ }
    }
    // Upload to Supabase Storage
    const fileName = `${salonData.owner_id}/${serviceId}/${Date.now()}_${uploadFile.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("service-photos")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });
    
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
          <button className="btn-ghost" style={{ flex: 1, fontSize:10 }} onClick={() => markComplete(a.id)}>{t.markComplete}</button>
          <button className="btn-ghost" style={{ fontSize:10, padding: "0 14px", color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }} onClick={() => markNoShow(a.id)}>{t.markNoShow}</button>
        </div>
      )}
      {a.status === "completed" && !a.invoice_sent && <button className="btn-primary" style={{ fontSize:11, marginTop:4 }} onClick={() => sendInvoice(a.id)}>{t.sendInvoice}</button>}
      {a.status === "completed" && a.invoice_sent && <div style={{ fontSize:11, color:"#86efac", marginTop:6 }}>{t.invoiceSent}</div>}
      {a.status === "no_show" && <div style={{ fontSize:11, color:"#f87171", marginTop:6 }}>✗ {t.noShow}</div>}
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
            position: "sticky",
            top: 0,
            height: "100vh",
            flexShrink: 0
          }}>
            {/* Sidebar Header */}
            <div style={{ padding: "28px 24px", borderBottom: "1px solid " + c.border }}>
              <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 24, fontWeight: 300, letterSpacing: "0.18em", marginBottom: 4 }}>vellu</div>
              <div style={{ fontSize: 10, color: c.textLabel, letterSpacing: "0.08em" }}>OWNER DASHBOARD</div>
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
                  <span style={{ fontSize: 18, color: view === k ? accent : c.textLabel }}>{icon}</span>
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
                style={{ width: "100%", marginTop: 12, fontSize: 11, color: c.textLabel }} 
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
            padding: isMobile ? "14px 22px 140px" : "32px 40px",
            backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}08 0%, transparent 55%)`
          }}>

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.welcomeBack}>{t.dashboard}</PTitle>}
              <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                <div className="stat-card">
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.today}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, fontWeight: 300, color: accent }}>{todayAppts.length}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{t.appts}</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.earnings}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, fontWeight: 300, color: accent }}>€{totalEarnings.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{t.total.toLowerCase()}</div>
                </div>
              </div>

              {/* Salon link */}
              <SL>{t.salonLink}</SL>
              <div className="slug-box" style={{ marginBottom: 22 }}>
                <div>
                  <div style={{ fontSize: 11, color: c.textLabel, letterSpacing: "0.03em" }}>vellu.cc/</div>
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
                  <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "10px 12px" }} onClick={copyLink}>
                    🔗 {copied ? (lang === "nl" ? "Gekopieerd!" : "Copied!") : (lang === "nl" ? "Kopieer link" : "Copy link")}
                  </button>
                </div>
              )}

              {/* Add appointment manually */}
              <button className="btn-ghost" style={{ width: "100%", marginBottom: 16, fontSize: 11, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
                onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ service_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "", staff_id: "" }); }}>
                {t.addAppointment}
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
              {isMobile && <PTitle sub={t.manageAppts}>{t.agenda}</PTitle>}
              
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

              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
                {days.slice(0,10).map((d, i) => {
                  const ds = fmt(d); const isSel = calDate === ds;
                  const has = filteredAgendaAppts.filter(a => a.date === ds).length > 0;
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
              {isMobile && <PTitle sub={t.completedTreatments}>{t.invoices}</PTitle>}
              {completedAppts.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: c.textMuted, fontSize: 12 }}>{t.noCompleted}</div>
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
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 38, fontWeight: 300, color: accent }}>€{totalEarnings.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{completedAppts.length} {t.treatments}</div>
                </div>
              )}
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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

              {/* Reviews */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px" }}>
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

          {/* INSTELLINGEN */}
          {view === "instellingen" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.manageSalon}>{t.settings}</PTitle>}

              {/* Settings tabs */}
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, marginBottom: 16, borderBottom: "1px solid " + c.border }}>
                {[
                  ["salon", "✦", lang === "nl" ? "Salon" : "Salon"],
                  ["diensten", "◈", lang === "nl" ? "Diensten" : "Services"],
                  ["team", "👥", lang === "nl" ? "Team" : "Team"],
                  ["planning", "📅", lang === "nl" ? "Planning" : "Schedule"],
                  ["facturatie", "⚙️", lang === "nl" ? "Overig" : "Other"],
                ].map(([key, icon, label]) => (
                  <div key={key} onClick={() => setSettingsTab(key)} style={{
                    padding: "8px 16px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap",
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", transition: "all 0.2s",
                    background: settingsTab === key ? `${accent}15` : "transparent",
                    color: settingsTab === key ? accent : c.textSub,
                    border: `1px solid ${settingsTab === key ? `${accent}33` : "transparent"}`
                  }}>{icon} {label}</div>
                ))}
              </div>

              {/* ═══ SALON TAB ═══ */}
              {settingsTab === "salon" && <>

              {/* Billing / Subscription */}
              <div style={{ background: `${accent}06`, border: `1px solid ${accent}22`, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.profile}</SL>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <input className="input-field" placeholder={t.businessName} value={salonData.name} onChange={e => update(d => { d.name = e.target.value; return d; })} />
                  <input className="input-field" placeholder={t.city} value={salonData.city} onChange={e => update(d => { d.city = e.target.value; return d; })} />
                </div>
                <div style={{ marginTop: 16 }}>
                  <SL>{t.brandColor}</SL>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {["#c9a96e","#e8a598","#a8c5a0","#9bb5d6","#c4a8d4","#d4756a","#6abfb8","#e8c547"].map(clr => (
                      <div key={clr} onClick={() => update(d => { d.accent = clr; return d; })} style={{ width: 26, height: 26, borderRadius: "50%", background: clr, cursor: "pointer", outline: salonData.accent === clr ? "2px solid " + c.text : "none", outlineOffset: 2, transform: salonData.accent === clr ? "scale(1.18)" : "none", transition: "all 0.2s" }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Invoice details */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.services}</SL>
                {salonData.services.length === 0 && (
                  <div style={{ fontSize: 12, color: c.textMuted, textAlign: "center", padding: "16px 0" }}>{t.noAppts}</div>
                )}
                {salonData.services.map(s => (
                  <div key={s.id} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid " + c.border }}>
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
                              }}>✓ {t.saveChanges}</button>
                              <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px" }} onClick={() => setEditingService(null)}>✕</button>
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
                          <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 10px", color: accent, borderColor: `${accent}33` }} onClick={() => { setEditingService(s.id); setEditSvcForm({ name_nl: s.name_nl, name_en: s.name_en || "", price: s.price, duration: s.duration }); }}>✎</button>
                          <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 10px", color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }} onClick={() => { if (confirm(lang === "nl" ? "Dienst verwijderen?" : "Delete service?")) deleteService(s.id); }}>✕</button>
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
                                }}>✓</button>
                                <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => setEditingVariant(null)}>✕</button>
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
                                  onClick={() => { setEditingVariant(v.id); setEditVariantForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "" }); }}>✎</button>
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
                              }}>✓</button>
                              <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => setEditingExtra(null)}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontSize: 11, fontWeight: 500 }}>{e.name_nl} <span style={{ color: c.textLabel }}>+€{e.price}</span></div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: accent, borderColor: `${accent}33` }}
                                  onClick={() => { setEditingExtra(e.id); setEditExtraForm({ name_nl: e.name_nl, name_en: e.name_en || "", price: e.price }); }}>✎</button>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.staff}</SL>
                {/* Account type toggle */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {[["joint", "👤", t.jointAccount], ["team", "👥", t.teamAccount]].map(([type, icon, label]) => (
                    <div key={type} onClick={() => update(d => { d.account_type = type; return d; })} style={{
                      flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center", transition: "all 0.2s",
                      background: salonData.account_type === type ? `${accent}12` : "transparent",
                      border: `1px solid ${salonData.account_type === type ? accent : c.inputBorder}`
                    }}>
                      <span style={{ fontSize: 14 }}>{icon}</span>
                      <div style={{ fontSize: 10, fontWeight: 600, color: salonData.account_type === type ? accent : c.textSub, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                {(salonData.staff || []).length === 0 && (
                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noStaff}</div>
                )}
                {(salonData.staff || []).map(m => (
                  <div key={m.id} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid " + c.border }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${accent}22`, border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: accent }}>{m.name[0]}</div>
                        <div>
                          {editingStaff === m.id ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <input className="input-field" value={editStaffForm.name} onChange={e => setEditStaffForm(f => ({...f, name: e.target.value}))} style={{ fontSize: 11, padding: "6px 8px", width: 100 }} />
                              <input className="input-field" value={editStaffForm.role} onChange={e => setEditStaffForm(f => ({...f, role: e.target.value}))} style={{ fontSize: 11, padding: "6px 8px", width: 120 }} placeholder={t.staffRole} />
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                              {m.role && <div style={{ fontSize: 10, color: c.textLabel }}>{m.role}</div>}
                              {(m.service_ids?.length > 0) && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                                  {m.service_ids.map(sid => {
                                    const svc = salonData.services.find(s => s.id === sid);
                                    return svc ? <span key={sid} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 100, background: `${accent}12`, color: accent, border: `1px solid ${accent}22` }}>{svc.name_nl || svc.name}</span> : null;
                                  })}
                                </div>
                              )}
                              {(!m.service_ids || m.service_ids.length === 0) && (
                                <div style={{ fontSize: 8, color: c.textMuted, marginTop: 3, fontStyle: "italic" }}>{lang === "nl" ? "Alle diensten" : "All services"}</div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {editingStaff === m.id ? (
                          <>
                            <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: accent, borderColor: `${accent}33` }} onClick={async () => {
                              await supabase.from("staff_members").update({ name: editStaffForm.name, role: editStaffForm.role || null, working_hours: editStaffForm.working_hours }).eq("id", m.id);
                              update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, name: editStaffForm.name, role: editStaffForm.role, working_hours: editStaffForm.working_hours} : s); return d; });
                              setEditingStaff(null);
                            }}>✓</button>
                            <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px" }} onClick={() => setEditingStaff(null)}>✕</button>
                          </>
                        ) : (
                          <>
                            <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: accent, borderColor: `${accent}33` }} onClick={() => { setEditingStaff(m.id); setEditStaffForm({ name: m.name, role: m.role || "", working_hours: m.working_hours || {} }); }}>✎</button>
                            <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }} onClick={async () => {
                              if (!confirm(lang === "nl" ? `${m.name} verwijderen?` : `Delete ${m.name}?`)) return;
                              await supabase.from("staff_services").delete().eq("staff_id", m.id);
                              await supabase.from("appointments").update({ staff_id: null }).eq("staff_id", m.id);
                              await supabase.from("staff_members").delete().eq("id", m.id);
                              update(d => { d.staff = (d.staff || []).filter(s => s.id !== m.id); return d; });
                            }}>×</button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Per-staff working days + times */}
                    {editingStaff === m.id && (
                      <div style={{ marginTop: 8, marginLeft: 36 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.staffDays}</div>
                        {[0,1,2,3,4,5,6].map(day => {
                          const DAY_FULL = lang === "nl" ? DAY_FULL_NL : DAY_FULL_EN;
                          const staffDay = editStaffForm.working_hours?.[day];
                          const isOn = staffDay ? !staffDay.closed : true;
                          const openTime = staffDay?.open || "09:00";
                          const closeTime = staffDay?.close || "17:30";
                          return (
                            <div key={day} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "4px 0" }}>
                              <div style={{ width: 28, fontSize: 10, fontWeight: 500, color: c.textSub, flexShrink: 0 }}>{DAY_FULL[day].slice(0,2)}</div>
                              <div 
                                onClick={() => {
                                  setEditStaffForm(f => {
                                    const wh = {...(f.working_hours || {})};
                                    if (isOn) wh[day] = { closed: true };
                                    else wh[day] = { closed: false, open: openTime, close: closeTime };
                                    return {...f, working_hours: wh};
                                  });
                                }}
                                style={{ width: 28, height: 16, borderRadius: 8, background: isOn ? accent : c.toggleInactive, cursor: "pointer", position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
                                <div style={{ position: "absolute", top: 2, left: isOn ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                              </div>
                              {isOn ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <select value={openTime} onChange={e => {
                                    setEditStaffForm(f => {
                                      const wh = {...(f.working_hours || {})};
                                      wh[day] = { ...wh[day], closed: false, open: e.target.value };
                                      return {...f, working_hours: wh};
                                    });
                                  }} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 6, padding: "3px 4px", color: c.text, fontSize: 10, fontFamily: "'Jost',sans-serif" }}>
                                    {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                                  </select>
                                  <span style={{ fontSize: 9, color: c.textMuted }}>—</span>
                                  <select value={closeTime} onChange={e => {
                                    setEditStaffForm(f => {
                                      const wh = {...(f.working_hours || {})};
                                      wh[day] = { ...wh[day], closed: false, close: e.target.value };
                                      return {...f, working_hours: wh};
                                    });
                                  }} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 6, padding: "3px 4px", color: c.text, fontSize: 10, fontFamily: "'Jost',sans-serif" }}>
                                    {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                                  </select>
                                </div>
                              ) : (
                                <span style={{ fontSize: 10, color: c.textMuted, fontStyle: "italic" }}>{t.closed}</span>
                              )}
                            </div>
                          );
                        })}
                        <div style={{ fontSize: 9, color: c.textMuted, marginTop: 4 }}>{lang === "nl" ? "Leeg/alles aan = volgt salon openingstijden" : "Empty/all on = follows salon hours"}</div>
                        
                        {/* Invite staff (team accounts only) */}
                        {salonData.account_type === "team" && !m.user_id && (
                          <div style={{ marginTop: 12, padding: "12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: accent, marginBottom: 6 }}>🔑 {t.inviteStaffDesc}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input className="input-field" placeholder={t.staffEmail} type="email" id={`staff-email-${m.id}`} style={{ fontSize: 11, padding: "8px 10px" }} />
                              <input className="input-field" placeholder={t.staffPassword} type="text" id={`staff-pass-${m.id}`} style={{ fontSize: 11, padding: "8px 10px" }} />
                              <button className="btn-ghost" style={{ fontSize: 10, color: accent, borderColor: `${accent}44` }}
                                onClick={async () => {
                                  const emailEl = document.getElementById(`staff-email-${m.id}`);
                                  const passEl = document.getElementById(`staff-pass-${m.id}`);
                                  const staffEmail = emailEl?.value;
                                  const staffPass = passEl?.value;
                                  if (!staffEmail || !staffPass || staffPass.length < 6) return;
                                  const res = await fetch(`https://pqvovkwqkapmpibktpwb.supabase.co/functions/v1/create-staff-account`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ staff_id: m.id, email: staffEmail, password: staffPass, owner_id: salonData.owner_id })
                                  });
                                  const result = await res.json();
                                  if (result.success) {
                                    update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, user_id: result.user_id, email: staffEmail} : s); return d; });
                                    alert(t.inviteSent + "\n" + staffEmail + " → " + t.staffLoginInfo);
                                  } else {
                                    alert(result.error === "email_taken" ? t.emailTaken : (result.error || "Error"));
                                  }
                                }}>{t.inviteStaff}</button>
                            </div>
                          </div>
                        )}
                        {salonData.account_type === "team" && m.user_id && (
                          <div style={{ marginTop: 8, fontSize: 10, color: "#86efac" }}>✓ {m.email || t.staffLoginInfo}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <StaffAdder ownerId={salonData.owner_id} services={salonData.services} lang={lang} t={t} accent={accent} onAdd={(member) => {
                  update(d => { d.staff = [...(d.staff || []), member]; return d; });
                }} />
              </div>
              </>}

              {/* ═══ PLANNING TAB ═══ */}
              {settingsTab === "planning" && <>

              {/* Locations */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.locations}</SL>
                {(salonData.locations || []).length === 0 && (
                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noLocations}</div>
                )}
                {(salonData.locations || []).map(loc => (
                  <div key={loc.id} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid " + c.border }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{loc.name}</div>
                        {loc.address && <div style={{ fontSize: 10, color: c.textLabel }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: accent, borderColor: `${accent}33` }}
                          onClick={() => {
                            const newName = prompt(lang === "nl" ? "Locatienaam:" : "Location name:", loc.name);
                            if (newName && newName !== loc.name) {
                              const newAddr = prompt(lang === "nl" ? "Adres:" : "Address:", loc.address || "");
                              supabase.from("locations").update({ name: newName, address: newAddr || null }).eq("id", loc.id);
                              update(d => { d.locations = d.locations.map(l => l.id === loc.id ? {...l, name: newName, address: newAddr} : l); return d; });
                            }
                          }}>✎</button>
                        <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                          onClick={async () => {
                            if (!confirm(lang === "nl" ? "Locatie verwijderen?" : "Delete location?")) return;
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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

              {/* Exception Days */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.exceptionDays}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.exceptionDesc}</div>
                {Object.entries(salonData.day_overrides || {}).filter(([_, v]) => v.type === "exception").map(([date, v]) => (
                  <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 10, marginBottom: 6 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.blockedDays}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.blockedDesc}</div>
                {Object.entries(salonData.day_overrides || {}).filter(([_, v]) => v.type === "blocked").map(([date, v]) => (
                  <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{date}{v.to && v.to !== date ? ` → ${v.to}` : ""}</div>
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
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <input type="date" className="input-field" value={newBlocked.from} onChange={e => setNewBlocked(f => ({...f, from: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px", flex: 1, minWidth: 110 }} placeholder={t.dateFrom} />
                  <input type="date" className="input-field" value={newBlocked.to} onChange={e => setNewBlocked(f => ({...f, to: e.target.value}))} style={{ fontSize: 11, padding: "8px 10px", flex: 1, minWidth: 110 }} placeholder={t.dateTo} />
                  <input className="input-field" value={newBlocked.reason} onChange={e => setNewBlocked(f => ({...f, reason: e.target.value}))} placeholder={t.blockedReason} style={{ fontSize: 11, padding: "8px 10px", flex: 2, minWidth: 120 }} />
                </div>
                <button className="btn-ghost" style={{ width: "100%", marginTop: 8, fontSize: 10, borderStyle: "dashed", borderColor: "rgba(248,113,113,0.2)", color: "#f87171" }}
                  onClick={() => {
                    if (!newBlocked.from) return;
                    const endDate = newBlocked.to || newBlocked.from;
                    update(d => {
                      const o = {...(d.day_overrides || {})};
                      let cur = new Date(newBlocked.from);
                      const end = new Date(endDate);
                      const first = fmt(cur);
                      while (cur <= end) {
                        o[fmt(cur)] = { type: "blocked", reason: newBlocked.reason || t.blocked, from: first, to: endDate };
                        cur.setDate(cur.getDate() + 1);
                      }
                      d.day_overrides = o; return d;
                    });
                    setNewBlocked({ from: "", to: "", reason: "" });
                  }}>{t.addBlocked}</button>
              </div>
              </>}

              {/* ═══ FACTURATIE TAB ═══ */}
              {settingsTab === "facturatie" && <>

              {/* Appearance Section */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "18px", marginBottom: 14 }}>
                <SL>{t.discountCodes}</SL>
                
                {/* Existing codes */}
                {(salonData.discount_codes || []).map((code, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "10px 12px", background: c.bgCard, borderRadius: 10, border: "1px solid " + c.border }}>
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

              {/* Save button (always visible) */}
              <button className="btn-primary" style={{ marginTop: 16 }} onClick={async () => {
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
                  break_minutes: salonData.break_minutes || 0,
                  logo_url: salonData.logo_url || null,
                  cover_image_url: salonData.cover_image_url || null,
                  discount_codes: salonData.discount_codes || [],
                  day_overrides: salonData.day_overrides || {},
                  account_type: salonData.account_type || "joint",
                  min_advance_hours: salonData.min_advance_hours || 0,
                  max_advance_days: salonData.max_advance_days || 60
                }).eq("id", salonData.owner_id);
                setSaved(true); setTimeout(() => setSaved(false), 2000);
              }}>{saved ? t.saved : t.save}</button>
              <button className="btn-ghost" style={{ width: "100%", marginTop: 10, color: c.textLabel, display: isMobile ? "block" : "none" }} onClick={onLogout}>{t.logout}</button>
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
            background: c.navBg, 
            backdropFilter: "blur(24px)", 
            WebkitBackdropFilter: "blur(24px)",
            borderTop: "1px solid " + c.border, 
            display: "flex", 
            padding: "12px 4px 8px", 
            paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) + 4px))",
            zIndex: 100
          }}>
            {navItems.map(([k, icon, label]) => (
              <div key={k} className="nav-item" onClick={() => setView(k)} style={{ gap: 3 }}>
                <span style={{ fontSize: 18, color: view === k ? accent : c.textMuted, transition: "color 0.2s" }}>{icon}</span>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: view === k ? accent : c.textMuted, transition: "color 0.2s", whiteSpace: "nowrap" }}>{label}</span>
              </div>
            ))}
          </div>
        )}
        </main>

        {/* Add Appointment Modal */}
        {showAddAppt && (
          <div style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(12px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowAddAppt(false)}>
            <div style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 24, padding: 28, maxWidth: 460, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              {!addApptDone ? (<>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
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
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
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
              <button className="btn-ghost" style={{ padding: "7px 14px", fontSize: 12 }} onClick={() => setShowPreview(false)}>✕ {lang === "nl" ? "Sluiten" : "Close"}</button>
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
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // Load data
  useEffect(() => {
    const load = async () => {
      const { data: appts } = await supabase.from("appointments").select("*").eq("owner_id", salonProfile.id).eq("staff_id", staffMember.id).order("date", { ascending: false });
      setAppointments(appts || []);
      const { data: svcs } = await supabase.from("services").select("*, service_variants(*), service_extras(*), service_photos(*)").eq("owner_id", salonProfile.id);
      const mySvcIds = staffMember.service_ids || [];
      const filtered = (svcs || []).filter(s => mySvcIds.length === 0 || mySvcIds.includes(s.id));
      setServices(filtered.map(s => ({
        ...s, name_nl: s.name_nl || s.name || "", name_en: s.name_en || "",
        variants: (s.service_variants || []).sort((a,b) => (a.position||0) - (b.position||0)),
        extras: s.service_extras || [],
        photos: (s.service_photos || []).map(p => ({ id: p.id, url: p.storage_path }))
      })));
    };
    load();
  }, []);

  const activeAppts = appointments.filter(a => a.status !== "cancelled" && a.status !== "no_show");
  const todayAppts = activeAppts.filter(a => a.date === fmt(getToday()));
  const completedAppts = appointments.filter(a => a.status === "completed");
  const totalEarnings = completedAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
  const calAppts = appointments.filter(a => a.status !== "cancelled" && a.date === calDate);
  const days = getDays();

  const markComplete = async (id) => {
    await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
    setAppointments(a => a.map(x => x.id === id ? {...x, status: "completed"} : x));
  };
  const markNoShow = async (id) => {
    await supabase.from("appointments").update({ status: "no_show" }).eq("id", id);
    setAppointments(a => a.map(x => x.id === id ? {...x, status: "no_show"} : x));
  };
  const saveWorkingHours = async () => {
    await supabase.from("staff_members").update({ working_hours: whForm }).eq("id", staffMember.id);
    setMyStaff(s => ({...s, working_hours: whForm}));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const [staffPhotoUploading, setStaffPhotoUploading] = useState(null);

  const staffAddPhoto = async (serviceId, file) => {
    setStaffPhotoUploading(serviceId);
    // Compress image if > 1MB
    let uploadFile = file;
    if (file.size > 1024 * 1024) {
      try {
        const img = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        const maxDim = 1600;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
        uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
      } catch(e) { /* fallback */ }
    }
    const fileName = `${salonProfile.id}/${serviceId}/${Date.now()}_${uploadFile.name}`;
    const { error: uploadError } = await supabase.storage.from("service-photos").upload(fileName, file, { cacheControl: "3600", upsert: false });
    if (uploadError) { console.error("Upload error:", uploadError); return; }
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
          <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "8px" }} onClick={() => markComplete(a.id)}>✓ {lang === "nl" ? "Voltooid" : "Complete"}</button>
          <button className="btn-ghost" style={{ fontSize: 10, padding: "8px 12px", color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }} onClick={() => markNoShow(a.id)}>✕ No-show</button>
        </div>
      )}
    </div>
  );

  const navItems = [
    ["dashboard", "◆", t.dashboard],
    ["agenda", "◎", t.agenda],
    ["facturen", "✦", t.invoices],
    ["instellingen", "◯", t.settings]
  ];

  return (
    <Layout>
      <style>{makeCSS(accent, c)}</style>
      <div style={{ display: "flex", minHeight: "100dvh", background: c.bg, fontFamily: "'Jost',sans-serif", color: c.text }}>
        {/* Desktop sidebar */}
        {!isMobile && (
          <div style={{ width: 220, padding: "30px 20px", borderRight: "1px solid " + c.border, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, background: c.bg, zIndex: 50 }}>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.18em", marginBottom: 4 }}>vellu</div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: c.textMuted, marginBottom: 24 }}>{salonProfile.business_name}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: accent, marginBottom: 20 }}>👤 {myStaff.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              {navItems.map(([k, icon, label]) => (
                <div key={k} className="nav-item" onClick={() => setView(k)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12,
                  background: view === k ? `${accent}12` : "transparent",
                  border: `1px solid ${view === k ? `${accent}22` : "transparent"}`,
                  cursor: "pointer", transition: "all 0.2s"
                }}>
                  <span style={{ fontSize: 18, color: view === k ? accent : c.textLabel }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: view === k ? 600 : 400, color: view === k ? accent : c.textSub }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ThemeToggle /><LangToggle lang={lang} setLang={setLang} />
              </div>
              <button className="btn-ghost" style={{ width: "100%", fontSize: 11 }} onClick={onLogout}>{t.logout}</button>
            </div>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, marginLeft: isMobile ? 0 : 220, padding: isMobile ? "16px 18px 100px" : "30px 40px", maxWidth: isMobile ? "100%" : 800 }}>
          {!isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300 }}>{view === "dashboard" ? t.dashboard : view === "agenda" ? t.agenda : view === "facturen" ? t.invoices : t.settings}</div>
                <div style={{ fontSize: 12, color: c.textSub }}>{t.staffWelcome}, {myStaff.name} 👋</div>
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={`${t.staffWelcome}, ${myStaff.name} 👋`}>{t.dashboard}</PTitle>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.today}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, color: accent, marginTop: 4 }}>{todayAppts.length}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{lang === "nl" ? "afspraken" : "appointments"}</div>
                </div>
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.totalEarnings}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, color: accent, marginTop: 4 }}>€{appointments.filter(a => a.status === "completed").reduce((s,a) => s + parseFloat(a.service_price||0), 0).toFixed(0)}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{lang === "nl" ? "totaal" : "total"}</div>
                </div>
              </div>
              <button className="btn-ghost" style={{ width: "100%", marginBottom: 16, fontSize: 11, borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
                onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ service_id: "", variant_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "" }); }}>
                {t.addAppointment}
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
                {days.slice(0,10).map((d, i) => {
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
                          ? <span style={{ fontSize: 10, color: "#86efac" }}>✓ {t.sent}</span>
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
                <button className="btn-primary" style={{ marginTop: 12 }} onClick={saveWorkingHours}>{saved ? "✓" : t.saveChanges}</button>
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
                }}>{invoiceSaved ? "✓" : t.saveChanges}</button>
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
                              }}>✓</button>
                              <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => setEditingSvc(null)}>✕</button>
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
                            onClick={() => { setEditingSvc(s.id); setEditSvcForm({ name_nl: s.name_nl, name_en: s.name_en || "", price: s.price, duration: s.duration }); }}>✎</button>
                          <button className="btn-ghost" style={{ fontSize: 9, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
                            onClick={async () => { if (!confirm(lang === "nl" ? "Dienst verwijderen?" : "Delete service?")) return; await supabase.from("services").delete().eq("id", s.id); setServices(svcs => svcs.filter(sv => sv.id !== s.id)); }}>✕</button>
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
                                }}>✓</button>
                                <button className="btn-ghost" style={{ fontSize: 8, padding: "3px 6px" }} onClick={() => setEditingVar(null)}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ color: c.textMuted }}>{v.name_nl} — €{v.price} · {v.duration} min</span>
                              <div style={{ display: "flex", gap: 3 }}>
                                <button className="btn-ghost" style={{ fontSize: 8, padding: "2px 6px", color: accent, borderColor: `${accent}33` }}
                                  onClick={() => { setEditingVar(v.id); setEditVarForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "" }); }}>✎</button>
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
                          <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
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
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 8 }}>{t.appointmentAdded}</div>
                  <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddAppt(false)}>{lang === "nl" ? "Sluiten" : "Close"}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile bottom nav */}
        {isMobile && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: c.navBg, backdropFilter: "blur(24px)", borderTop: "1px solid " + c.border, display: "flex", justifyContent: "space-around", paddingTop: 8, paddingBottom: "max(8px, env(safe-area-inset-bottom))", zIndex: 100 }}>
            {navItems.map(([k, icon, label]) => (
              <div key={k} className="nav-item" onClick={() => setView(k)} style={{ gap: 3 }}>
                <span style={{ fontSize: 18, color: view === k ? accent : c.textMuted, transition: "color 0.2s" }}>{icon}</span>
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: c.bg, color: c.textLabel, fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      vellu...
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
  if (slug === "owner" || slug === "login" || slug === "admin" || slug === "privacy") {
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
      // Load reviews
      const { data: reviews } = await supabase.from("reviews").select("*").eq("owner_id", data.id).order("created_at", { ascending: false });
      // Load staff
      const { data: staffData } = await supabase.from("staff_members").select("*, staff_services(service_id)").eq("owner_id", data.id).eq("active", true).order("position");
      // Load categories
      const { data: categories } = await supabase.from("service_categories").select("*").eq("owner_id", data.id).order("position");
      // Load locations
      const { data: locData } = await supabase.from("locations").select("*").eq("owner_id", data.id).eq("active", true).order("position");
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
        break_minutes: data.break_minutes || 0,
        logo_url: data.logo_url || "",
        cover_image_url: data.cover_image_url || "",
        discount_codes: data.discount_codes || [],
        day_overrides: data.day_overrides || {},
        min_advance_hours: data.min_advance_hours || 0,
        max_advance_days: data.max_advance_days || 60,
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
        categories: (categories || []).map(cat => ({ ...cat, name: lang === 'nl' ? (cat.name_nl || cat.name) : (cat.name_en || cat.name_nl || cat.name) })),
        locations: locData || []
      });
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: c.bg, color: c.textLabel, fontFamily: "'Jost',sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
      vellu...
    </div>
  );

  if (notFound) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "'Jost',sans-serif", gap: 16 }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300 }}>Salon niet gevonden</div>
      <div style={{ fontSize: 12, color: c.textLabel }}>vellu.cc/{slug} bestaat niet</div>
      <button className="btn-ghost" onClick={() => navigate("/")}>← Terug naar home</button>
    </div>
  );

  return <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => navigate("/")} reviewMode={new URLSearchParams(window.location.search).get("review") === "true"} reviewEmail={new URLSearchParams(window.location.search).get("email") || ""} />;
}

// ─── CANCEL ROUTE (vellu.cc/cancel/TOKEN) ─────────────────────
function CancelRoute({ lang }) {
  const { colors: c } = useTheme();
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

    // Notify owner + staff about cancellation
    const notifyEmails = [];
    if (appointment.owner_id) {
      const { data: ownerProfile } = await supabase.from("profiles").select("email").eq("id", appointment.owner_id).single();
      if (ownerProfile?.email) notifyEmails.push(ownerProfile.email);
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
        service_name: `❌ GEANNULEERD: ${appointment.service_name}`,
        date: appointment.date, time: appointment.time,
        price: appointment.service_price || 0, salon_name: ""
      });
    }
    
    setStatus("cancelled");
  };

  return (
    <div style={{ minHeight: "100dvh", background: c.bg, fontFamily: "'Jost',sans-serif", color: c.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{makeCSS(ACCENT, c)}</style>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        {status === "loading" && (
          <div style={{ color: c.textLabel }}>laden...</div>
        )}
        
        {status === "confirm" && appointment && (
          <div className="fade-up">
            <div style={{ fontSize: 48, marginBottom: 20 }}>📅</div>
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
            <p style={{ color: c.textSub, marginBottom: 30 }}>
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
            <p style={{ color: c.textSub, marginBottom: 30 }}>{t.cancelBeforeTime}</p>
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
            <p style={{ color: c.textSub, marginBottom: 30 }}>
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

// ─── ROOT ─────────────────────────────────────────────────────
function AppInner() {
  const { colors: c } = useTheme();
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
      {screen === "owner" && (() => {
        const hasPlan = owner?.plan && (!owner.plan_expires_at || new Date(owner.plan_expires_at) > new Date());
        if (!hasPlan) return <PlanSelection user={owner} lang={lang} setLang={setLang} onLogout={() => { setOwner(null); setScreen("landing"); }} />;
        return <OwnerApp user={owner} lang={lang} setLang={setLang} salons={salons} onSalonUpdate={updateSalon} onLogout={() => { setOwner(null); setScreen("landing"); }} />;
      })()}
    </>
  );
}

// ─── PRIVACY POLICY ──────────────────────────────────────────
function PrivacyPage({ lang, setLang }) {
  const { colors: c } = useTheme();
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
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => window.location.href = "/"}>← {lang === "nl" ? "Terug" : "Back"}</button>
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

// ─── COOKIE CONSENT ──────────────────────────────────────────
function CookieConsent({ lang }) {
  const { colors: c } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("vellu_cookies_accepted")) {
      setTimeout(() => setVisible(true), 1500);
    }
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", bottom: 20, left: 20, right: 20, maxWidth: 420, margin: "0 auto",
      background: c.bg, border: "1px solid " + c.border, borderRadius: 18,
      padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 9999,
      fontFamily: "'Jost',sans-serif", animation: "fadeUp 0.4s ease"
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: c.text, fontWeight: 500, marginBottom: 3 }}>🍪 Cookies</div>
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

export default function VelluApp() {
  const [lang, setLang] = useState("nl");
  return (
    <ThemeProvider>
      <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppInner />} />
            <Route path="/owner" element={<OwnerEntryPage lang={lang} setLang={setLang} />} />
            <Route path="/cancel/:token" element={<CancelRoute lang={lang} />} />
            <Route path="/privacy" element={<PrivacyPage lang={lang} setLang={setLang} />} />
                <Route path="/:slug" element={<SalonRouteWrapper lang={lang} setLang={setLang} />} />
          </Routes>
          <CookieConsent lang={lang} />
        </BrowserRouter>
    </ThemeProvider>
  );
}
