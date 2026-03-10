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
`;

// ─── SHARED ───────────────────────────────────────────────────
function Phone({ children, accent = ACCENT }) {
  return (
    <div style={{ width: 390, background: "#0d0b0a", borderRadius: 44, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.07)", flexShrink: 0 }}>
      <style>{makeCSS(accent)}</style>
      <div style={{ height: 44, background: "#0d0b0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 110, height: 30, background: "#000", borderRadius: 20 }} />
      </div>
      {children}
      <div style={{ height: 30, background: "#0d0b0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 110, height: 4, background: "rgba(237,232,224,0.18)", borderRadius: 10 }} />
      </div>
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
      <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 80% 40% at 50% -10%, ${ACCENT}12 0%, transparent 60%)`, minHeight: 780, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 28px", fontFamily: "'Jost',sans-serif", color: "#ede8e0", position: "relative" }}>
        <div style={{ position: "absolute", top: 60, right: 24 }}><LangToggle lang={lang} setLang={setLang} /></div>

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
      <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 80% 40% at 50% -10%, ${ACCENT}10 0%, transparent 60%)`, minHeight: 780, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 28px", fontFamily: "'Jost',sans-serif", color: "#ede8e0", position: "relative" }}>
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
  const [date, setDate] = useState(fmt(today));
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival" });
  const [done, setDone] = useState(false);
  const [gallery, setGallery] = useState(null);
  const days = getDays();
  const canConfirm = form.firstName && form.lastName && form.email;

  const getPrice = () => {
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

  const reset = () => { setStep(1); setSel(null); setSelVariant(null); setSelExtras([]); setTime(null); setDone(false); setForm({ firstName: "", lastName: "", email: "", phone: "", payment: "on-arrival" }); };

  return (
    <Phone accent={accent}>
      <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 70% 35% at 50% -5%, ${accent}12 0%, transparent 55%)`, minHeight: 780, display: "flex", flexDirection: "column", fontFamily: "'Jost',sans-serif", color: "#ede8e0", position: "relative" }}>

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
                {initialSalon.services.map(s => (
                  <div key={s.id}>
                    <div className={`service-card ${sel?.id === s.id ? "sel" : ""}`} onClick={() => { setSel(s); setSelVariant(null); setSelExtras([]); }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{svcName(s)}</div>
                          <div style={{ fontSize: 11, color: "rgba(237,232,224,0.35)", marginTop: 3 }}>
                            {s.duration} {t.min}
                            {s.photos.length > 0 && <span style={{ color: accent, marginLeft: 8 }}>· {s.photos.length} {t.photos.toLowerCase()}</span>}
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input className="input-field" placeholder={t.firstName} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} />
                    <input className="input-field" placeholder={t.lastName} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} />
                  </div>
                  <input className="input-field" placeholder={t.email} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
                  <input className="input-field" placeholder={`${t.phone} (${t.optional})`} value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
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
                <button className="btn-primary" disabled={!canConfirm} onClick={() => setStep(4)}>{t.next}</button>
              </>}

              {/* Step 4 — Confirm */}
              {step === 4 && <>
                <PTitle sub={t.confirmSub}>{t.confirmBooking}</PTitle>
                <div style={{ background: `${accent}09`, border: `1px solid ${accent}22`, borderRadius: 20, padding: "4px 18px", marginBottom: 20 }}>
                  {[[t.treatment, getServiceLabel()],[t.date, date],[t.time, time],[t.name, `${form.firstName} ${form.lastName}`],[t.payment, form.payment === "online" ? t.payOnline : t.payArrival]].map(([l,v]) => (
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
                </div>
                <button className="btn-primary" onClick={async () => {
                  // Save appointment to Supabase
                  const apptData = {
                    owner_id: initialSalon.owner_id,
                    service_id: sel?.id || null,
                    service_name: getServiceLabel() + (selExtras.length > 0 ? " + " + selExtras.map(e => lang === "nl" ? e.name_nl : (e.name_en || e.name_nl)).join(", ") : ""),
                    service_price: getPrice(),
                    service_duration: getDuration(),
                    date, time,
                    client_name: `${form.firstName} ${form.lastName}`,
                    client_email: form.email,
                    client_phone: form.phone || null,
                    payment_method: form.payment,
                    status: "confirmed",
                    invoice_sent: false
                  };
                  await supabase.from("appointments").insert(apptData);
                  setDone(true);
                  await sendEmails("booking_confirmation", {
                    client_name: `${form.firstName} ${form.lastName}`,
                    client_email: form.email,
                    service_name: apptData.service_name,
                    date, time,
                    payment: form.payment,
                    price: getPrice(),
                    salon_name: initialSalon.name,
                    owner_email: initialSalon.owner_email || "info@vellu.cc"
                  });
                  if (form.payment === "online") {
                    await sendEmails("invoice", {
                      client_name: `${form.firstName} ${form.lastName}`,
                      client_email: form.email,
                      service_name: apptData.service_name,
                      date, price: getPrice(),
                      salon_name: initialSalon.name
                    });
                  }
                }}>{t.confirm}</button>
              </>}
            </div>
          ) : (
            <div className="fade-up" style={{ textAlign: "center", paddingTop: 60 }}>
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: `${accent}18`, border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", fontSize: 28 }}>💅</div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 10 }}>{t.confirmed}</div>
              <div style={{ fontSize: 12, color: "rgba(237,232,224,0.42)", marginBottom: 6 }}>{t.confirmedSub} <strong style={{ color: accent }}>{date}</strong> {t.at} <strong style={{ color: accent }}>{time}</strong></div>
              <div style={{ fontSize: 11, color: "rgba(237,232,224,0.22)", marginBottom: 42 }}>{t.confirmationSent} {form.email}</div>
              <button className="btn-primary" style={{ maxWidth: 200, margin: "0 auto" }} onClick={reset}>{t.newBooking}</button>
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
        setSalonData(prev => ({
          ...prev,
          owner_id: data.id,
          name: data.business_name || prev.name,
          city: data.city || prev.city,
          accent: data.accent_color || prev.accent,
          services: (data.services || []).map(s => ({
            ...s,
            name_nl: s.name_nl || s.name || "",
            name_en: s.name_en || s.name || "",
            photos: [],
            variants: (s.service_variants || []).sort((a,b) => (a.position||0) - (b.position||0)),
            extras: s.service_extras || []
          })),
          appointments: appts || []
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

  const addService = () => {
    if (!newSvc.name_nl || !newSvc.price) { setSvcError(t.fillRequired); return; }
    setSvcError("");
    update(d => { d.services = [...d.services, { id: Date.now().toString(), ...newSvc, price: parseFloat(newSvc.price), duration: parseInt(newSvc.duration), photos: [] }]; return d; });
    setNewSvc({ name_nl: "", name_en: "", price: "", duration: "60" });
  };

  const deleteService = (id) => update(d => { d.services = d.services.filter(s => s.id !== id); return d; });

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

  const ApptCard = ({ a }) => (
    <div className="appt-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{a.client_name}</div>
          <div style={{ fontSize: 11, color: "rgba(237,232,224,0.38)", marginTop: 3 }}>{a.time} · {a.service_name}</div>
          <div style={{ fontSize: 10, color: "rgba(237,232,224,0.22)", marginTop: 2 }}>{a.client_email}</div>
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
      <div style={{ background: "#0d0b0a", backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}10 0%, transparent 55%)`, minHeight: 780, display: "flex", flexDirection: "column", fontFamily: "'Jost',sans-serif", color: "#ede8e0", position: "relative" }}>

        <div style={{ padding: "20px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 400, letterSpacing: "0.06em" }}>{salonData.name}</div>
            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${accent}18`, color: accent, border: `1px solid ${accent}33`, letterSpacing: "0.1em", textTransform: "uppercase" }}>eigenaar</span>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "14px 22px 90px" }}>

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
              <button className="btn-ghost" style={{ width: "100%", marginBottom: 22, borderColor: `${accent}33`, color: accent, fontSize: 11 }} onClick={() => setShowPreview(true)}>
                👁 {lang === "nl" ? "Bekijk klanten pagina" : "Preview client page"}
              </button>

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

              <button className="btn-primary" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}>{saved ? t.saved : t.save}</button>
              <button className="btn-ghost" style={{ width: "100%", marginTop: 10, color: "rgba(237,232,224,0.3)" }} onClick={onLogout}>{t.logout}</button>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(13,11,10,0.93)", backdropFilter: "blur(24px)", borderTop: "1px solid rgba(237,232,224,0.06)", display: "flex", padding: "9px 4px 20px" }}>
          {[["dashboard","◈",t.dashboard],["agenda","◎",t.agenda],["facturen","✦",t.invoices],["instellingen","⊙",t.settings]].map(([k,icon,label]) => (
            <div key={k} className="nav-item" onClick={() => setView(k)}>
              <span style={{ fontSize: 17, color: view === k ? accent : "rgba(237,232,224,0.2)", transition: "color 0.2s" }}>{icon}</span>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: view === k ? accent : "rgba(237,232,224,0.2)", transition: "color 0.2s" }}>{label}</span>
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
  const [copied, setCopied] = useState(false);

  const handleLogin = (u) => setOwner(u);

  const copyLink = () => {
    navigator.clipboard.writeText(`vellu.cc/${owner.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (owner) {
    return (
      <div style={{ background: "#111", minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px" }}>
        <OwnerApp user={owner} lang={lang} setLang={setLang} salons={{}} onSalonUpdate={() => {}} onLogout={() => setOwner(null)} />
      </div>
    );
  }

  return (
    <div style={{ background: "#0d0b0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px" }}>
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
      setSalon({
        id: data.slug,
        owner_id: data.id,
        name: data.business_name || data.owner_name || "Salon",
        city: data.city || "Nederland",
        accent: data.accent_color || "#c9a96e",
        owner_email: data.email,
        services: (data.services || []).map(s => ({
          ...s,
          name_nl: s.name_nl || s.name || "",
          name_en: s.name_en || s.name || "",
          photos: [],
          variants: (s.service_variants || []).sort((a,b) => (a.position||0) - (b.position||0)),
          extras: s.service_extras || []
        })),
        appointments: []
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
    <div style={{ background: "#111", minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px" }}>
      {screen === "landing" && <LandingScreen lang={lang} setLang={setLang} salons={salons} onSelectSalon={handleSelectSalon} onOwnerEnter={() => setScreen("ownerAuth")} />}
      {screen === "client" && <ClientApp salon={salon} lang={lang} setLang={setLang} onBack={() => setScreen("landing")} />}
      {screen === "ownerAuth" && <OwnerAuth lang={lang} setLang={setLang} onBack={() => setScreen("landing")} onLogin={u => { setOwner(u); setScreen("owner"); }} />}
      {screen === "owner" && <OwnerApp user={owner} lang={lang} setLang={setLang} salons={salons} onSalonUpdate={updateSalon} onLogout={() => { setOwner(null); setScreen("landing"); }} />}
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
        <Route path="/:slug" element={<SalonRouteWrapper lang={lang} setLang={setLang} />} />
      </Routes>
    </BrowserRouter>
  );
}
