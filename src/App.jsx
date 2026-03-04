import { useState, useEffect, useCallback } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// SUPABASE CONFIG — replace with your own if needed
// ============================================
const SUPABASE_URL = "https://pqvovkwqkapmpibktpwb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// CONSTANTS
// ============================================
const TIMES = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30",
               "13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];

const today = new Date();
const formatDate = (d) => d.toISOString().split("T")[0];
const getDays = () => {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
};

const T = {
  en: {
    selectService: "Select a Service", selectDate: "Select Date", selectTime: "Select Time",
    yourDetails: "Your Details", name: "Full Name", email: "Email", phone: "Phone",
    paymentMethod: "Payment Method", payOnline: "Pay Online", payArrival: "Pay at Appointment",
    confirm: "Confirm Booking", duration: "min", confirmed: "Confirmed", completed: "Completed",
    sendInvoice: "Send Invoice", invoiceSent: "Invoice Sent ✓", markComplete: "Mark Complete",
    noAppointments: "No appointments today", total: "Total", invoice: "Invoice", invoiceFor: "Invoice for",
    bookingConfirmed: "Booking Confirmed!", bookingMsg: "We'll see you on",
    nav1: "Book", nav2: "Calendar", nav3: "Invoices",
    photos: "photos", tapToAdd: "Tap + to add work photos", loading: "Loading...",
    signIn: "Sign In", signUp: "Sign Up", email2: "Email address", password: "Password",
    businessName: "Business name", logout: "Log out", settings: "Settings",
    saveSettings: "Save Settings", saved: "Saved ✓", earnings: "Total earnings", treatments: "treatments",
    noServices: "No services yet — add one in Settings", addService: "Add Service",
    serviceName: "Service name (EN)", serviceNameNL: "Service name (NL)", servicePrice: "Price (€)",
    serviceDuration: "Duration (min)", deleteService: "Delete", ownerMode: "Owner mode",
    accentColor: "Brand color", cityLabel: "City",
  },
  nl: {
    selectService: "Kies een Behandeling", selectDate: "Kies een Datum", selectTime: "Kies een Tijd",
    yourDetails: "Jouw Gegevens", name: "Volledige Naam", email: "E-mail", phone: "Telefoonnummer",
    paymentMethod: "Betaalmethode", payOnline: "Online Betalen", payArrival: "Betalen bij Afspraak",
    confirm: "Afspraak Bevestigen", duration: "min", confirmed: "Bevestigd", completed: "Voltooid",
    sendInvoice: "Factuur Sturen", invoiceSent: "Factuur Verstuurd ✓", markComplete: "Markeer Voltooid",
    noAppointments: "Geen afspraken vandaag", total: "Totaal", invoice: "Factuur", invoiceFor: "Factuur voor",
    bookingConfirmed: "Afspraak Bevestigd!", bookingMsg: "We zien je op",
    nav1: "Boeken", nav2: "Agenda", nav3: "Facturen",
    photos: "foto's", tapToAdd: "Tik + om foto's toe te voegen", loading: "Laden...",
    signIn: "Inloggen", signUp: "Registreren", email2: "E-mailadres", password: "Wachtwoord",
    businessName: "Bedrijfsnaam", logout: "Uitloggen", settings: "Instellingen",
    saveSettings: "Opslaan", saved: "Opgeslagen ✓", earnings: "Totale inkomsten", treatments: "behandelingen",
    noServices: "Nog geen diensten — voeg er een toe bij Instellingen", addService: "Dienst Toevoegen",
    serviceName: "Dienst naam (EN)", serviceNameNL: "Dienst naam (NL)", servicePrice: "Prijs (€)",
    serviceDuration: "Duur (min)", deleteService: "Verwijderen", ownerMode: "Eigenaar modus",
    accentColor: "Merkkleur", cityLabel: "Stad",
  }
};

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [lang, setLang] = useState("nl");
  const [view, setView] = useState("book");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [servicePhotos, setServicePhotos] = useState({});
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "", businessName: "" });
  const [authError, setAuthError] = useState("");

  // Booking flow
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(formatDate(today));
  const [selectedTime, setSelectedTime] = useState(null);
  const [bookForm, setBookForm] = useState({ name: "", email: "", phone: "", payment: "on-arrival" });
  const [bookingDone, setBookingDone] = useState(false);

  // Calendar
  const [calendarDate, setCalendarDate] = useState(formatDate(today));

  // UI
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [photoGallery, setPhotoGallery] = useState(null);
  const [isOwnerMode, setIsOwnerMode] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [newService, setNewService] = useState({ name: "", name_nl: "", price: "", duration: "60" });

  const t = T[lang];
  const accent = profile?.accent_color || "#c9a96e";

  // ============================================
  // AUTH
  // ============================================
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchProfile();
      fetchServices();
      fetchAppointments();
    }
  }, [session]);

  // ============================================
  // DATA FETCHING
  // ============================================
  const fetchProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (data) setProfile(data);
  };

  const fetchServices = async () => {
    const { data } = await supabase.from("services").select("*, service_photos(*)").eq("owner_id", session.user.id).order("position");
    if (data) {
      setServices(data);
      const photos = {};
      data.forEach(s => { photos[s.id] = s.service_photos || []; });
      setServicePhotos(photos);
    }
  };

  const fetchAppointments = async () => {
    const { data } = await supabase.from("appointments").select("*").eq("owner_id", session.user.id).order("date", { ascending: true }).order("time", { ascending: true });
    if (data) setAppointments(data);
  };

  // ============================================
  // AUTH HANDLERS
  // ============================================
  const handleSignUp = async () => {
    setAuthError("");
    const { error } = await supabase.auth.signUp({ email: authForm.email, password: authForm.password });
    if (error) { setAuthError(error.message); return; }
    // Update business name after signup
    setTimeout(async () => {
      await supabase.from("profiles").update({ business_name: authForm.businessName || "My Beauty Studio" }).eq("id", (await supabase.auth.getUser()).data.user.id);
      fetchProfile();
    }, 1000);
  };

  const handleSignIn = async () => {
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
    if (error) setAuthError(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setServices([]);
    setAppointments([]);
    setIsOwnerMode(false);
  };

  // ============================================
  // BOOKING
  // ============================================
  const handleBook = async () => {
    const svc = services.find(s => s.id === selectedService?.id);
    const { error } = await supabase.from("appointments").insert({
      owner_id: session.user.id,
      service_id: svc?.id,
      service_name: svc?.name,
      service_price: svc?.price,
      service_duration: svc?.duration,
      date: selectedDate,
      time: selectedTime,
      client_name: bookForm.name,
      client_email: bookForm.email,
      client_phone: bookForm.phone,
      payment_method: bookForm.payment,
      status: "confirmed",
    });
    if (!error) { fetchAppointments(); setBookingDone(true); }
  };

  const handleMarkComplete = async (id) => {
    await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
    fetchAppointments();
  };

  const handleSendInvoice = async (id) => {
    const appt = appointments.find(a => a.id === id);
    if (!appt) return;
    try {
      await supabase.functions.invoke("send-invoice", {
        body: {
          clientName: appt.client_name,
          clientEmail: appt.client_email,
          serviceName: appt.service_name,
          servicePrice: appt.service_price,
          serviceDuration: appt.service_duration,
          date: appt.date,
          time: appt.time,
          businessName: profile?.business_name || "Vellu",
          invoiceId: appt.id?.slice(-6),
        },
      });
    } catch (e) {
      console.error("Email error:", e);
    }
    await supabase.from("appointments").update({ invoice_sent: true }).eq("id", id);
    fetchAppointments();
    setPreviewInvoice(appt);
  };

  const resetBooking = () => {
    setStep(1); setSelectedService(null); setSelectedDate(formatDate(today));
    setSelectedTime(null); setBookForm({ name: "", email: "", phone: "", payment: "on-arrival" });
    setBookingDone(false);
  };

  // ============================================
  // SERVICES MANAGEMENT
  // ============================================
  const handleAddService = async () => {
    if (!newService.name || !newService.price) return;
    await supabase.from("services").insert({
      owner_id: session.user.id,
      name: newService.name,
      name_nl: newService.name_nl || newService.name,
      price: parseFloat(newService.price),
      duration: parseInt(newService.duration),
      position: services.length,
    });
    setNewService({ name: "", name_nl: "", price: "", duration: "60" });
    fetchServices();
  };

  const handleDeleteService = async (id) => {
    await supabase.from("services").delete().eq("id", id);
    fetchServices();
  };

  // ============================================
  // PHOTOS
  // ============================================
  const handleAddPhoto = async (serviceId, file) => {
    const ext = file.name.split(".").pop();
    const path = `${session.user.id}/${serviceId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("service-photos").upload(path, file);
    if (upErr) return;
    await supabase.from("service_photos").insert({ service_id: serviceId, owner_id: session.user.id, storage_path: path });
    fetchServices();
  };

  const handleDeletePhoto = async (photoId, storagePath) => {
    await supabase.storage.from("service-photos").remove([storagePath]);
    await supabase.from("service_photos").delete().eq("id", photoId);
    fetchServices();
  };

  const getPhotoUrl = (path) => supabase.storage.from("service-photos").getPublicUrl(path).data.publicUrl;

  // ============================================
  // PROFILE SETTINGS
  // ============================================
  const handleSaveProfile = async () => {
    await supabase.from("profiles").update(profile).eq("id", session.user.id);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  // ============================================
  // DERIVED DATA
  // ============================================
  const bookedTimes = appointments.filter(a => a.date === selectedDate).map(a => a.time);
  const calendarAppts = appointments.filter(a => a.date === calendarDate);
  const invoiceAppts = appointments.filter(a => a.status === "completed");
  const days = getDays();
  const dayNames = lang === "nl" ? ["zo","ma","di","wo","do","vr","za"] : ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const monthNames = lang === "nl" ? ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"] : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // ============================================
  // STYLES
  // ============================================
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 0; }
    input, select { outline: none; }
    .fade-in { animation: fadeIn 0.35s ease forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .btn-primary {
      background: linear-gradient(135deg, ${accent}, ${accent}cc);
      color: #0f0e0e; border: none; border-radius: 14px;
      padding: 16px 24px; font-family: 'DM Sans', sans-serif;
      font-size: 15px; font-weight: 600; cursor: pointer; width: 100%;
      transition: all 0.2s; letter-spacing: 0.3px;
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px ${accent}55; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .btn-ghost {
      background: rgba(255,255,255,0.06); color: #f0ece6;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
      padding: 10px 18px; font-family: 'DM Sans', sans-serif;
      font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s;
    }
    .btn-ghost:hover { background: rgba(255,255,255,0.1); }
    .service-card {
      background: rgba(255,255,255,0.04); border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 16px; padding: 16px; cursor: pointer; transition: all 0.2s;
      display: flex; justify-content: space-between; align-items: center;
    }
    .service-card:hover { border-color: ${accent}66; background: ${accent}0f; }
    .service-card.selected { border-color: ${accent}; background: ${accent}1e; }
    .time-chip {
      background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.1);
      border-radius: 10px; padding: 10px 6px; font-size: 13px; font-weight: 500;
      cursor: pointer; transition: all 0.2s; text-align: center;
    }
    .time-chip:hover:not(.booked) { border-color: ${accent}; color: ${accent}; }
    .time-chip.selected { background: ${accent}; border-color: ${accent}; color: #0f0e0e; font-weight: 600; }
    .time-chip.booked { opacity: 0.2; cursor: not-allowed; text-decoration: line-through; }
    .input-field {
      background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 14px 16px; color: #f0ece6;
      font-family: 'DM Sans', sans-serif; font-size: 14px; width: 100%; transition: border-color 0.2s;
    }
    .input-field:focus { border-color: ${accent}; }
    .input-field::placeholder { color: rgba(240,236,230,0.3); }
    .appt-card {
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px; padding: 16px; margin-bottom: 12px;
    }
    .day-chip {
      display: flex; flex-direction: column; align-items: center;
      padding: 10px 12px; border-radius: 12px; cursor: pointer;
      transition: all 0.2s; min-width: 44px; border: 1.5px solid transparent; flex-shrink: 0;
    }
    .day-chip:hover { background: ${accent}1a; }
    .day-chip.selected { background: ${accent}; }
    .day-chip.selected span { color: #0f0e0e !important; }
    .nav-item {
      display: flex; flex-direction: column; align-items: center;
      gap: 4px; cursor: pointer; padding: 8px 16px; border-radius: 12px;
      transition: all 0.2s; flex: 1;
    }
    .status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.5px; text-transform: uppercase; }
    .badge-confirmed { background: rgba(99,179,237,0.15); color: #63b3ed; }
    .badge-completed { background: rgba(104,211,145,0.15); color: #68d391; }
    .photo-thumb { width: 70px; height: 70px; border-radius: 10px; object-fit: cover; cursor: pointer; transition: transform 0.2s; border: 1.5px solid rgba(255,255,255,0.08); flex-shrink: 0; }
    .photo-thumb:hover { transform: scale(1.05); }
    .photo-add-btn { width: 70px; height: 70px; border-radius: 10px; border: 1.5px dashed ${accent}66; background: ${accent}0a; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 22px; color: ${accent}; transition: all 0.2s; flex-shrink: 0; }
    .photo-add-btn:hover { background: ${accent}1e; border-color: ${accent}; }
    .service-photos-row { display: flex; gap: 8px; overflow-x: auto; padding: 10px 0 4px; margin-top: 8px; }
    .payment-option { border: 1.5px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 12px; }
    .payment-option.selected { border-color: ${accent}; background: ${accent}14; }
    .radio-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .radio-dot.checked { border-color: ${accent}; }
    .radio-dot.checked::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: ${accent}; display: block; }
    .invoice-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.88); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }
    .invoice-paper { background: #faf8f5; color: #1a1a1a; border-radius: 20px; padding: 32px; width: 100%; max-width: 400px; font-family: 'DM Sans', sans-serif; }
    .gallery-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.95); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 200; padding: 24px; }
    .color-swatch { width: 32px; height: 32px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; flex-shrink: 0; }
    .color-swatch.active { border-color: #fff; transform: scale(1.2); }
  `;

  // ============================================
  // LOADING
  // ============================================
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0f0e0e", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", color: "#c9a96e", fontSize: 14 }}>
      <style>{css}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, marginBottom: 8 }}>Vellu</div>
        <div style={{ opacity: 0.5 }}>{t.loading}</div>
      </div>
    </div>
  );

  // ============================================
  // AUTH SCREEN
  // ============================================
  if (!session) return (
    <div style={{ minHeight: "100vh", background: "#0f0e0e", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", color: "#f0ece6", padding: 24 }}>
      <style>{css}</style>
      <div style={{ width: "100%", maxWidth: 380 }} className="fade-in">
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: "#c9a96e", letterSpacing: "-1px" }}>Vellu</div>
          <div style={{ fontSize: 13, color: "rgba(240,236,230,0.4)", marginTop: 6 }}>Beauty booking, beautifully simple</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4 }}>
          {["signin","signup"].map(m => (
            <button key={m} onClick={() => setAuthMode(m)} style={{
              flex: 1, padding: "10px", border: "none", borderRadius: 10, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
              background: authMode === m ? "#c9a96e" : "transparent",
              color: authMode === m ? "#0f0e0e" : "rgba(240,236,230,0.5)",
              transition: "all 0.2s"
            }}>
              {m === "signin" ? t.signIn : t.signUp}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {authMode === "signup" && (
            <input className="input-field" placeholder={t.businessName} value={authForm.businessName}
              onChange={e => setAuthForm(f => ({...f, businessName: e.target.value}))} />
          )}
          <input className="input-field" placeholder={t.email2} type="email" value={authForm.email}
            onChange={e => setAuthForm(f => ({...f, email: e.target.value}))} />
          <input className="input-field" placeholder={t.password} type="password" value={authForm.password}
            onChange={e => setAuthForm(f => ({...f, password: e.target.value}))} />
        </div>

        {authError && <div style={{ fontSize: 13, color: "#ff6b6b", marginBottom: 16, textAlign: "center" }}>{authError}</div>}

        <button className="btn-primary" onClick={authMode === "signin" ? handleSignIn : handleSignUp}>
          {authMode === "signin" ? t.signIn : t.signUp}
        </button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "rgba(240,236,230,0.3)" }}>
          {lang === "nl" ? "Door in te loggen ga je akkoord met onze voorwaarden" : "By signing in you agree to our terms"}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setLang(l => l === "nl" ? "en" : "nl")}>
            {lang === "nl" ? "🇬🇧 English" : "🇳🇱 Nederlands"}
          </button>
        </div>
      </div>
    </div>
  );

  // ============================================
  // MAIN APP (logged in)
  // ============================================
  return (
    <div style={{ minHeight: "100vh", background: "#0f0e0e", fontFamily: "'DM Sans', sans-serif", color: "#f0ece6", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ padding: "24px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 600 }}>
            {profile?.business_name || "Vellu"}
          </div>
          <div style={{ fontSize: 12, color: "rgba(240,236,230,0.4)", marginTop: 2 }}>
            {profile?.city || ""}
            {isOwnerMode && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}>✦ OWNER</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setIsOwnerMode(m => !m)} className="btn-ghost"
            style={{ padding: "8px 12px", fontSize: 14, background: isOwnerMode ? `${accent}22` : undefined, borderColor: isOwnerMode ? `${accent}66` : undefined, color: isOwnerMode ? accent : undefined }}>
            {isOwnerMode ? "👑" : "🔒"}
          </button>
          <button onClick={() => setLang(l => l === "nl" ? "en" : "nl")} className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}>
            {lang === "nl" ? "🇬🇧" : "🇳🇱"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 100px" }}>

        {/* ===== BOOK VIEW ===== */}
        {view === "book" && (
          <div className="fade-in">
            {!bookingDone ? (
              <>
                {/* Progress bar */}
                <div style={{ display: "flex", gap: 6, marginBottom: 28, marginTop: 8 }}>
                  {[1,2,3,4].map(s => (
                    <div key={s} style={{ flex: 1, height: 3, borderRadius: 4, background: step >= s ? accent : "rgba(255,255,255,0.1)", transition: "background 0.3s" }} />
                  ))}
                </div>

                {/* Step 1: Services */}
                {step === 1 && (
                  <div className="fade-in">
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 4 }}>{t.selectService}</div>
                    <div style={{ fontSize: 13, color: "rgba(240,236,230,0.4)", marginBottom: 20 }}>
                      {lang === "nl" ? "Kies de behandeling die je wilt" : "Choose the treatment you'd like"}
                    </div>
                    {services.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(240,236,230,0.3)", fontSize: 14 }}>{t.noServices}</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {services.map(s => {
                          const photos = servicePhotos[s.id] || [];
                          return (
                            <div key={s.id}>
                              <div className={`service-card ${selectedService?.id === s.id ? "selected" : ""}`} onClick={() => setSelectedService(s)}>
                                <div>
                                  <div style={{ fontWeight: 500, fontSize: 15 }}>{lang === "nl" ? (s.name_nl || s.name) : s.name}</div>
                                  <div style={{ fontSize: 12, color: "rgba(240,236,230,0.45)", marginTop: 3 }}>
                                    ⏱ {s.duration} {t.duration}
                                    {photos.length > 0 && <span style={{ marginLeft: 8, color: accent }}>📷 {photos.length}</span>}
                                  </div>
                                </div>
                                <div style={{ color: accent, fontWeight: 700, fontSize: 18 }}>€{parseFloat(s.price).toFixed(0)}</div>
                              </div>
                              {(photos.length > 0 || isOwnerMode) && (
                                <div className="service-photos-row">
                                  {photos.map((p, idx) => (
                                    <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
                                      <img src={getPhotoUrl(p.storage_path)} className="photo-thumb"
                                        onClick={() => setPhotoGallery({ serviceId: s.id, photoIndex: idx })} />
                                      {isOwnerMode && (
                                        <div onClick={() => handleDeletePhoto(p.id, p.storage_path)}
                                          style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>×</div>
                                      )}
                                    </div>
                                  ))}
                                  {isOwnerMode && (
                                    <label className="photo-add-btn">
                                      +
                                      <input type="file" accept="image/*" multiple style={{ display: "none" }}
                                        onChange={e => Array.from(e.target.files).forEach(f => handleAddPhoto(s.id, f))} />
                                    </label>
                                  )}
                                </div>
                              )}
                              {isOwnerMode && photos.length === 0 && (
                                <div style={{ fontSize: 11, color: "rgba(240,236,230,0.25)", marginTop: 4, marginLeft: 4 }}>{t.tapToAdd}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ marginTop: 24 }}>
                      <button className="btn-primary" disabled={!selectedService} onClick={() => setStep(2)}>
                        {lang === "nl" ? "Volgende →" : "Next →"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Date & Time */}
                {step === 2 && (
                  <div className="fade-in">
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 4 }}>{t.selectDate}</div>
                    <div style={{ fontSize: 13, color: "rgba(240,236,230,0.4)", marginBottom: 20 }}>
                      {lang === "nl" ? "Kies een datum en tijd" : "Pick a date and time"}
                    </div>
                    <div style={{ overflowX: "auto", display: "flex", gap: 8, paddingBottom: 8, marginBottom: 24 }}>
                      {days.map((d, i) => {
                        const ds = formatDate(d);
                        const isSel = selectedDate === ds;
                        return (
                          <div key={i} className={`day-chip ${isSel ? "selected" : ""}`} onClick={() => { setSelectedDate(ds); setSelectedTime(null); }}>
                            <span style={{ fontSize: 11, color: isSel ? "#0f0e0e" : "rgba(240,236,230,0.4)" }}>{dayNames[d.getDay()]}</span>
                            <span style={{ fontSize: 16, fontWeight: 600, color: isSel ? "#0f0e0e" : "#f0ece6", marginTop: 2 }}>{d.getDate()}</span>
                            <span style={{ fontSize: 10, color: isSel ? "#0f0e0e" : "rgba(240,236,230,0.3)" }}>{monthNames[d.getMonth()]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12, color: "rgba(240,236,230,0.7)" }}>{t.selectTime}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 24 }}>
                      {TIMES.map(time => {
                        const isBooked = bookedTimes.includes(time);
                        return (
                          <div key={time} className={`time-chip ${selectedTime === time ? "selected" : ""} ${isBooked ? "booked" : ""}`}
                            onClick={() => !isBooked && setSelectedTime(time)}>{time}</div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn-ghost" onClick={() => setStep(1)}>←</button>
                      <button className="btn-primary" disabled={!selectedTime} onClick={() => setStep(3)}>
                        {lang === "nl" ? "Volgende →" : "Next →"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Details */}
                {step === 3 && (
                  <div className="fade-in">
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 4 }}>{t.yourDetails}</div>
                    <div style={{ fontSize: 13, color: "rgba(240,236,230,0.4)", marginBottom: 20 }}>
                      {lang === "nl" ? "Vul je gegevens in" : "Fill in your details"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                      <input className="input-field" placeholder={t.name} value={bookForm.name} onChange={e => setBookForm(f => ({...f, name: e.target.value}))} />
                      <input className="input-field" placeholder={t.email} type="email" value={bookForm.email} onChange={e => setBookForm(f => ({...f, email: e.target.value}))} />
                      <input className="input-field" placeholder={t.phone} type="tel" value={bookForm.phone} onChange={e => setBookForm(f => ({...f, phone: e.target.value}))} />
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12, color: "rgba(240,236,230,0.7)" }}>{t.paymentMethod}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                      {[{ val: "online", label: t.payOnline, icon: "💳" }, { val: "on-arrival", label: t.payArrival, icon: "🏠" }].map(opt => (
                        <div key={opt.val} className={`payment-option ${bookForm.payment === opt.val ? "selected" : ""}`}
                          onClick={() => setBookForm(f => ({...f, payment: opt.val}))}>
                          <div className={`radio-dot ${bookForm.payment === opt.val ? "checked" : ""}`} />
                          <span style={{ fontSize: 16 }}>{opt.icon}</span>
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn-ghost" onClick={() => setStep(2)}>←</button>
                      <button className="btn-primary" disabled={!bookForm.name || !bookForm.email} onClick={() => setStep(4)}>
                        {lang === "nl" ? "Volgende →" : "Next →"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 4: Confirm */}
                {step === 4 && (
                  <div className="fade-in">
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 4 }}>
                      {lang === "nl" ? "Bevestig je afspraak" : "Confirm your booking"}
                    </div>
                    <div style={{ background: `${accent}12`, border: `1px solid ${accent}33`, borderRadius: 16, padding: 20, marginBottom: 24, marginTop: 20 }}>
                      {[
                        { label: lang === "nl" ? "Behandeling" : "Service", val: lang === "nl" ? (selectedService?.name_nl || selectedService?.name) : selectedService?.name },
                        { label: lang === "nl" ? "Datum" : "Date", val: selectedDate },
                        { label: lang === "nl" ? "Tijd" : "Time", val: selectedTime },
                        { label: lang === "nl" ? "Naam" : "Name", val: bookForm.name },
                        { label: lang === "nl" ? "Betaling" : "Payment", val: bookForm.payment === "online" ? t.payOnline : t.payArrival },
                      ].map(row => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ fontSize: 13, color: "rgba(240,236,230,0.5)" }}>{row.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{row.val}</span>
                        </div>
                      ))}
                      <div style={{ borderTop: `1px solid ${accent}22`, paddingTop: 14, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 600, color: accent }}>{t.total}</span>
                        <span style={{ fontWeight: 700, fontSize: 18, color: accent }}>€{parseFloat(selectedService?.price || 0).toFixed(2)}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn-ghost" onClick={() => setStep(3)}>←</button>
                      <button className="btn-primary" onClick={handleBook}>{t.confirm}</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="fade-in" style={{ textAlign: "center", paddingTop: 40 }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>💅</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, marginBottom: 8 }}>{t.bookingConfirmed}</div>
                <div style={{ fontSize: 14, color: "rgba(240,236,230,0.5)", marginBottom: 8 }}>
                  {t.bookingMsg} <strong style={{ color: accent }}>{selectedDate}</strong> {lang === "nl" ? "om" : "at"} <strong style={{ color: accent }}>{selectedTime}</strong>
                </div>
                <div style={{ fontSize: 13, color: "rgba(240,236,230,0.35)", marginBottom: 36 }}>
                  {lang === "nl" ? `Bevestiging verstuurd naar ${bookForm.email}` : `Confirmation sent to ${bookForm.email}`}
                </div>
                <button className="btn-primary" style={{ maxWidth: 220, margin: "0 auto" }} onClick={resetBooking}>
                  {lang === "nl" ? "Nieuwe Afspraak" : "New Booking"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== CALENDAR VIEW ===== */}
        {view === "calendar" && (
          <div className="fade-in">
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 4 }}>{t.calendar}</div>
            <div style={{ fontSize: 13, color: "rgba(240,236,230,0.4)", marginBottom: 20 }}>
              {lang === "nl" ? "Beheer je afspraken" : "Manage your appointments"}
            </div>
            <div style={{ overflowX: "auto", display: "flex", gap: 8, paddingBottom: 8, marginBottom: 24 }}>
              {days.map((d, i) => {
                const ds = formatDate(d);
                const isSel = calendarDate === ds;
                const hasAppts = appointments.filter(a => a.date === ds).length > 0;
                return (
                  <div key={i} className={`day-chip ${isSel ? "selected" : ""}`} onClick={() => setCalendarDate(ds)}>
                    <span style={{ fontSize: 11, color: isSel ? "#0f0e0e" : "rgba(240,236,230,0.4)" }}>{dayNames[d.getDay()]}</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: isSel ? "#0f0e0e" : "#f0ece6", marginTop: 2 }}>{d.getDate()}</span>
                    {hasAppts && !isSel && <div style={{ width: 5, height: 5, borderRadius: "50%", background: accent, margin: "2px auto 0" }} />}
                  </div>
                );
              })}
            </div>
            {calendarAppts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(240,236,230,0.3)", fontSize: 14 }}>{t.noAppointments}</div>
            ) : (
              calendarAppts.map(appt => (
                <div key={appt.id} className="appt-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{appt.client_name}</div>
                      <div style={{ fontSize: 13, color: "rgba(240,236,230,0.5)", marginTop: 2 }}>{appt.time} · {appt.service_name}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <span className={`status-badge badge-${appt.status}`}>{appt.status === "confirmed" ? t.confirmed : t.completed}</span>
                      <span style={{ color: accent, fontWeight: 700, fontSize: 16 }}>€{parseFloat(appt.service_price || 0).toFixed(0)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(240,236,230,0.35)", marginBottom: 12 }}>
                    📧 {appt.client_email} · {appt.payment_method === "online" ? (lang === "nl" ? "Online" : "Online") : (lang === "nl" ? "Bij afspraak" : "At arrival")}
                  </div>
                  {appt.status === "confirmed" && (
                    <button className="btn-ghost" style={{ width: "100%", fontSize: 13 }} onClick={() => handleMarkComplete(appt.id)}>
                      ✓ {t.markComplete}
                    </button>
                  )}
                  {appt.status === "completed" && (
                    <button className={appt.invoice_sent ? "btn-ghost" : "btn-primary"} style={{ fontSize: 13, opacity: appt.invoice_sent ? 0.5 : 1 }}
                      onClick={() => !appt.invoice_sent && handleSendInvoice(appt.id)} disabled={appt.invoice_sent}>
                      {appt.invoice_sent ? t.invoiceSent : `📄 ${t.sendInvoice}`}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== INVOICES VIEW ===== */}
        {view === "invoices" && (
          <div className="fade-in">
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 4 }}>{t.invoices}</div>
            <div style={{ fontSize: 13, color: "rgba(240,236,230,0.4)", marginBottom: 20 }}>
              {lang === "nl" ? "Voltooide behandelingen" : "Completed treatments"}
            </div>
            {invoiceAppts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(240,236,230,0.3)", fontSize: 14 }}>
                {lang === "nl" ? "Nog geen voltooide afspraken" : "No completed appointments yet"}
              </div>
            ) : (
              invoiceAppts.map(appt => (
                <div key={appt.id} className="appt-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{appt.client_name}</div>
                    <div style={{ fontSize: 12, color: "rgba(240,236,230,0.4)", marginTop: 3 }}>{appt.date} · {appt.service_name}</div>
                    <div style={{ fontSize: 11, color: "rgba(240,236,230,0.25)", marginTop: 2 }}>{appt.client_email}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: accent, fontWeight: 700, fontSize: 17 }}>€{parseFloat(appt.service_price || 0).toFixed(0)}</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      {appt.invoice_sent
                        ? <span style={{ color: "#68d391" }}>✓ {lang === "nl" ? "Verstuurd" : "Sent"}</span>
                        : <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => handleSendInvoice(appt.id)}>{t.sendInvoice}</button>
                      }
                    </div>
                  </div>
                </div>
              ))
            )}
            {invoiceAppts.length > 0 && (
              <div style={{ marginTop: 20, background: `${accent}0f`, border: `1px solid ${accent}2a`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 13, color: "rgba(240,236,230,0.5)", marginBottom: 6 }}>{t.earnings}</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: accent }}>
                  €{invoiceAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0).toFixed(0)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(240,236,230,0.3)", marginTop: 4 }}>
                  {invoiceAppts.length} {t.treatments}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== SETTINGS VIEW ===== */}
        {view === "settings" && (
          <div className="fade-in">
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 4 }}>{t.settings}</div>
            <div style={{ fontSize: 13, color: "rgba(240,236,230,0.4)", marginBottom: 24 }}>
              {lang === "nl" ? "Pas je profiel en diensten aan" : "Customize your profile and services"}
            </div>

            {/* Profile settings */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                {lang === "nl" ? "Profiel" : "Profile"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input className="input-field" placeholder={t.businessName}
                  value={profile?.business_name || ""} onChange={e => setProfile(p => ({...p, business_name: e.target.value}))} />
                <input className="input-field" placeholder={t.cityLabel}
                  value={profile?.city || ""} onChange={e => setProfile(p => ({...p, city: e.target.value}))} />
                <input className="input-field" placeholder={t.phone}
                  value={profile?.phone || ""} onChange={e => setProfile(p => ({...p, phone: e.target.value}))} />
              </div>

              {/* Brand color */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "rgba(240,236,230,0.5)", marginBottom: 10 }}>{t.accentColor}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {["#c9a96e","#e8a598","#a8c5a0","#9bb5d6","#c4a8d4","#e8c547","#d4756a","#6abfb8"].map(color => (
                    <div key={color} className={`color-swatch ${profile?.accent_color === color ? "active" : ""}`}
                      style={{ background: color }} onClick={() => setProfile(p => ({...p, accent_color: color}))} />
                  ))}
                </div>
              </div>
            </div>

            {/* Services management */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                {lang === "nl" ? "Diensten" : "Services"}
              </div>
              {services.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(240,236,230,0.4)" }}>€{parseFloat(s.price).toFixed(0)} · {s.duration} min</div>
                  </div>
                  <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px", color: "#ff6b6b", borderColor: "rgba(255,107,107,0.3)" }}
                    onClick={() => handleDeleteService(s.id)}>{t.deleteService}</button>
                </div>
              ))}
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input className="input-field" placeholder={t.serviceName} value={newService.name} onChange={e => setNewService(s => ({...s, name: e.target.value}))} />
                  <input className="input-field" placeholder={t.serviceNameNL} value={newService.name_nl} onChange={e => setNewService(s => ({...s, name_nl: e.target.value}))} />
                  <input className="input-field" placeholder={t.servicePrice} type="number" value={newService.price} onChange={e => setNewService(s => ({...s, price: e.target.value}))} />
                  <input className="input-field" placeholder={t.serviceDuration} type="number" value={newService.duration} onChange={e => setNewService(s => ({...s, duration: e.target.value}))} />
                </div>
                <button className="btn-ghost" style={{ width: "100%", borderStyle: "dashed", borderColor: `${accent}44`, color: accent }}
                  onClick={handleAddService}>+ {t.addService}</button>
              </div>
            </div>

            <button className="btn-primary" onClick={handleSaveProfile}>
              {settingsSaved ? t.saved : t.saveSettings}
            </button>

            <button className="btn-ghost" style={{ width: "100%", marginTop: 12, color: "rgba(240,236,230,0.4)" }} onClick={handleLogout}>
              {t.logout}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "rgba(15,14,14,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", padding: "12px 8px 20px" }}>
        {[
          { key: "book", icon: "✦", label: t.nav1 },
          { key: "calendar", icon: "◈", label: t.nav2 },
          { key: "invoices", icon: "◎", label: t.nav3 },
          { key: "settings", icon: "⊙", label: t.settings },
        ].map(item => (
          <div key={item.key} className="nav-item" onClick={() => setView(item.key)}>
            <span style={{ fontSize: 20, color: view === item.key ? accent : "rgba(240,236,230,0.3)", transition: "color 0.2s" }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: view === item.key ? accent : "rgba(240,236,230,0.3)", transition: "color 0.2s" }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Invoice Modal */}
      {previewInvoice && (
        <div className="invoice-modal" onClick={() => setPreviewInvoice(null)}>
          <div className="invoice-paper fade-in" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20 }}>{profile?.business_name || "Vellu"}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{profile?.city || "Netherlands"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#888" }}>{t.invoice} #{previewInvoice.id?.slice(-6)}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{previewInvoice.date}</div>
              </div>
            </div>
            <div style={{ background: "#f5f2ee", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{t.invoiceFor}</div>
              <div style={{ fontWeight: 600 }}>{previewInvoice.client_name}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{previewInvoice.client_email}</div>
            </div>
            <div style={{ borderBottom: "1px solid #e8e4de", paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{previewInvoice.service_name}</span>
                <span style={{ fontWeight: 600 }}>€{parseFloat(previewInvoice.service_price || 0).toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{previewInvoice.time} · {previewInvoice.service_duration} min</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 4 }}>
              <span>BTW (21%)</span><span>€{(parseFloat(previewInvoice.service_price || 0) * 0.21).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginBottom: 24 }}>
              <span>{t.total}</span><span style={{ color: accent }}>€{(parseFloat(previewInvoice.service_price || 0) * 1.21).toFixed(2)}</span>
            </div>
            <div style={{ background: "#e8f5e9", borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: "#2e7d32", textAlign: "center" }}>
              ✓ {lang === "nl" ? `Factuur verstuurd naar ${previewInvoice.client_email}` : `Invoice sent to ${previewInvoice.client_email}`}
            </div>
            <button onClick={() => setPreviewInvoice(null)} style={{ width: "100%", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 12, padding: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {lang === "nl" ? "Sluiten" : "Close"}
            </button>
          </div>
        </div>
      )}

      {/* Photo Gallery Modal */}
      {photoGallery && (() => {
        const photos = servicePhotos[photoGallery.serviceId] || [];
        const photo = photos[photoGallery.photoIndex];
        if (!photo) return null;
        return (
          <div className="gallery-overlay" onClick={() => setPhotoGallery(null)}>
            <div style={{ position: "absolute", top: 20, right: 20 }}>
              <button className="btn-ghost" style={{ fontSize: 18, padding: "8px 14px" }} onClick={() => setPhotoGallery(null)}>×</button>
            </div>
            <img src={getPhotoUrl(photo.storage_path)} style={{ maxWidth: "100%", maxHeight: "75vh", borderRadius: 16, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {photos.map((p, i) => (
                <img key={i} src={getPhotoUrl(p.storage_path)} onClick={e => { e.stopPropagation(); setPhotoGallery({ serviceId: photoGallery.serviceId, photoIndex: i }); }}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `2px solid ${i === photoGallery.photoIndex ? accent : "transparent"}`, opacity: i === photoGallery.photoIndex ? 1 : 0.5, transition: "all 0.2s" }} />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
