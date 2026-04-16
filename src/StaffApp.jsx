import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import {
  useTheme, useToast, ToastContainer, useConfirm, ConfirmModal,
  Skeleton, DashboardSkeleton,
  compressImage, sendEmails, ACCENT,
  getGoogleCalUrl, getWhatsAppUrl, getWhatsAppBookingMsg, getWhatsAppReminderMsg,
  getToday, fmt, getDays,
  TIMES, DAY_NL, DAY_EN, DAY_FULL_NL, DAY_FULL_EN, MON_NL, MON_EN,
  DEFAULT_HOURS, T, Layout, NavIcon, PTitle, SL, ThemeToggle, LangToggle, Header
} from "./shared.jsx";
import { VariantAdder, ExtraAdder } from "./OwnerApp.jsx";

function StaffApp({ staffUser, lang, setLang, onLogout }) {
  const { colors: c } = useTheme();
  const t = T[lang];
  const DAY = lang === "nl" ? DAY_NL : DAY_EN;
  const { staffMember, profile: salonProfile } = staffUser;
  const accent = salonProfile.accent_color || ACCENT;
  const { confirmState, confirm: showConfirm, handleYes: confirmYes, handleNo: confirmNo } = useConfirm();

  const [view, setView] = useState("dashboard");
  const [calDate, setCalDate] = useState(fmt(getToday()));
  const [staffWeekOffset, setStaffWeekOffset] = useState(0);
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

  // Real-time subscription for staff appointments
  useEffect(() => {
    if (!staffMember.id || !salonProfile.id) return;
    const channel = supabase
      .channel("staff-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `staff_id=eq.${staffMember.id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setAppointments(a => [payload.new, ...a]);
        } else if (payload.eventType === "UPDATE") {
          setAppointments(a => a.map(x => x.id === payload.new.id ? payload.new : x));
        } else if (payload.eventType === "DELETE") {
          setAppointments(a => a.filter(x => x.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [staffMember.id, salonProfile.id]);

  const activeAppts = appointments.filter(a => a.status !== "cancelled" && a.status !== "no_show");
  const todayAppts = activeAppts.filter(a => a.date === fmt(getToday()));
  const completedAppts = appointments.filter(a => a.status === "completed");
  const totalEarnings = completedAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
  const calAppts = appointments.filter(a => a.status !== "cancelled" && a.date === calDate);
  const days = getDays();

  const [processingApptId, setProcessingApptId] = useState(null);
  // Scope all mutations to this salon's owner_id — defense-in-depth on top of
  // the RLS policy that already enforces staff can only update their employer's
  // appointments. Without the .eq("owner_id", ...) a compromised client-side
  // could attempt to flip appointments belonging to other salons.
  const markComplete = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      const { error } = await supabase.from("appointments").update({ status: "completed" }).eq("id", id).eq("owner_id", salonProfile.id);
      if (!error) setAppointments(a => a.map(x => x.id === id ? {...x, status: "completed"} : x));
    } finally { setProcessingApptId(null); }
  };
  const markNoShow = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      const { error } = await supabase.from("appointments").update({ status: "no_show" }).eq("id", id).eq("owner_id", salonProfile.id);
      if (!error) setAppointments(a => a.map(x => x.id === id ? {...x, status: "no_show"} : x));
    } finally { setProcessingApptId(null); }
  };
  const saveWorkingHours = async () => {
    const { error } = await supabase.from("staff_members").update({ working_hours: whForm }).eq("id", staffMember.id);
    if (error) return;
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
    if (dbError) {
      console.error("DB error:", dbError);
      // Clean up orphaned file from storage
      await supabase.storage.from("service-photos").remove([fileName]);
      setStaffPhotoUploading(null);
      return;
    }
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
          <button className="btn-ghost" style={{ fontSize: 10, padding: "8px 12px", color: c.danger, borderColor: `${c.danger}33`, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => markNoShow(a.id)}>{processingApptId === a.id ? "..." : <><NavIcon name="xmark" size={10} color="#f87171" /> No-show</>}</button>
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

      <ConfirmModal state={confirmState} onYes={confirmYes} onNo={confirmNo} lang={lang} />
      <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: c.bg, fontFamily: "'Jost',sans-serif", color: c.text }}>
        {/* Desktop sidebar */}
        {!isMobile && (
          <div style={{ width: 240, borderRight: "1px solid " + c.border, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, background: c.bg, zIndex: 50 }}>
            <div style={{ padding: "18px 20px 14px", flexShrink: 0 }}>
              <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.18em", marginBottom: 4 }}>vellu</div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: c.textMuted, marginBottom: 10 }}>{salonProfile.business_name}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: accent, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: accent }}>{myStaff.name?.[0] || "?"}</div>
                {myStaff.name}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px" }}>
              {navItems.map(([k, icon, label]) => (
                <div key={k} className="nav-item" role="tab" tabIndex={0} aria-selected={view === k} onClick={() => setView(k)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(k); } }} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12,
                  background: view === k ? `${accent}12` : "transparent",
                  border: `1px solid ${view === k ? `${accent}22` : "transparent"}`,
                  cursor: "pointer", transition: "all 0.2s"
                }}>
                  <NavIcon name={icon} size={18} color={view === k ? accent : c.textLabel} />
                  <span style={{ fontSize: 13, fontWeight: view === k ? 600 : 400, color: view === k ? accent : c.textSub }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 20px", borderTop: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ThemeToggle /><LangToggle lang={lang} setLang={setLang} />
              </div>
              <button className="btn-ghost" style={{ width: "100%", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={onLogout}><NavIcon name="logout" size={14} color={c.textLabel} />{t.logout}</button>
            </div>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, marginLeft: isMobile ? 0 : 240, padding: isMobile ? "16px 18px 100px" : "30px 40px", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ maxWidth: isMobile ? "100%" : 800, margin: "0 auto" }}>
          {!isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300 }}>{view === "dashboard" ? t.dashboard : view === "agenda" ? t.agenda : view === "facturen" ? t.invoices : t.settings}</div>
                <div style={{ fontSize: 12, color: c.textSub }}>{t.staffWelcome}, {myStaff.name}</div>
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {view === "dashboard" && (() => {
            const now = new Date();
            const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
            const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);
            const weekRevenue = completedAppts.filter(a => new Date(a.date) >= weekAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const monthRevenue = completedAppts.filter(a => new Date(a.date) >= monthAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const todayRevenue = todayAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const todayDate = now.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" });

            return (
            <div className="fade-up">
              {isMobile && <PTitle sub={`${t.staffWelcome}, ${myStaff.name}`}>{t.dashboard}</PTitle>}

              {/* Today hero + KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr", gap: 14, marginBottom: 20 }}>
                {/* Today hero */}
                <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 22, padding: "22px 24px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 60% 80% at 100% 0%, ${accent}10 0%, transparent 55%)`, pointerEvents: "none" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, position: "relative" }}>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{t.today}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.text, lineHeight: 1.15 }}>
                        {todayAppts.length} {todayAppts.length === 1 ? (lang === "nl" ? "afspraak" : "appointment") : (lang === "nl" ? "afspraken" : "appointments")}
                      </div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, textTransform: "capitalize" }}>{todayDate}</div>
                    </div>
                    {todayAppts.length > 0 && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Verwacht" : "Expected"}</div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: accent }}>€{todayRevenue.toFixed(0)}</div>
                      </div>
                    )}
                  </div>
                  {todayAppts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "18px 0 6px", color: c.textMuted, position: "relative" }}>
                      <div style={{ marginBottom: 10, opacity: 0.5 }}><NavIcon name="calendar" size={28} color={c.textMuted} /></div>
                      <div style={{ fontSize: 12 }}>{t.noTodayAppts}</div>
                      <div style={{ fontSize: 11, color: accent, cursor: "pointer", marginTop: 10 }} onClick={() => setView("agenda")}>{lang === "nl" ? "Bekijk agenda →" : "View agenda →"}</div>
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      {todayAppts.slice(0, 3).map(a => <ApptCard key={a.id} a={a} />)}
                      {todayAppts.length > 3 && (
                        <div style={{ fontSize: 11, color: accent, cursor: "pointer", marginTop: 8, textAlign: "center" }} onClick={() => setView("agenda")}>
                          + {todayAppts.length - 3} {lang === "nl" ? "meer · Bekijk alles →" : "more · View all →"}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* KPI cards stacked */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr", gap: 10 }}>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Deze week" : "This week"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: accent, lineHeight: 1 }}>€{weekRevenue.toFixed(0)}</div>
                  </div>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Deze maand" : "This month"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: accent, lineHeight: 1 }}>€{monthRevenue.toFixed(0)}</div>
                  </div>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.totalEarnings}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.text, lineHeight: 1 }}>€{totalEarnings.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{completedAppts.length} {lang === "nl" ? "behandelingen" : "treatments"}</div>
                  </div>
                </div>
              </div>

              {/* Primary CTA */}
              <button className="btn-primary" style={{ width: "100%", marginBottom: 16, padding: "14px 24px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ service_id: "", variant_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "" }); }}>
                <NavIcon name="plus" size={14} color={c.btnOnDark} /> {t.addAppointment}
              </button>
            </div>
            );
          })()}

          {/* AGENDA */}
          {view === "agenda" && (() => {
            const MON_SHORT = lang === "nl" ? MON_NL : MON_EN;
            const DAY_HEADERS = lang === "nl" ? ["Ma","Di","Wo","Do","Vr","Za","Zo"] : ["Mo","Tu","We","Th","Fr","Sa","Su"];
            const todayFmt = fmt(getToday());
            const base = getToday();
            base.setDate(base.getDate() + staffWeekOffset * 7);
            const dayOfWeek = (base.getDay() + 6) % 7;
            const weekStart = new Date(base);
            weekStart.setDate(base.getDate() - dayOfWeek);
            const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });

            const firstDay = weekDays[0]; const lastDay = weekDays[6];
            const sameMonth = firstDay.getMonth() === lastDay.getMonth();
            const periodLabel = sameMonth
              ? `${firstDay.getDate()} – ${lastDay.getDate()} ${MON_SHORT[lastDay.getMonth()]} ${lastDay.getFullYear()}`
              : `${firstDay.getDate()} ${MON_SHORT[firstDay.getMonth()]} – ${lastDay.getDate()} ${MON_SHORT[lastDay.getMonth()]}`;

            const periodAppts = appointments.filter(a => {
              const ds = a.date;
              return ds >= fmt(weekDays[0]) && ds <= fmt(weekDays[6]) && a.status !== "cancelled" && a.status !== "no_show";
            });
            const periodRevenue = periodAppts.filter(a => a.status === "completed").reduce((s, a) => s + parseFloat(a.service_price || 0), 0);

            return (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.myAgenda}>{t.agenda}</PTitle>}

              {/* Navigation */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {staffWeekOffset !== 0 && (
                    <div onClick={() => { setStaffWeekOffset(0); setCalDate(todayFmt); }} style={{ padding: "7px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", background: `${accent}14`, color: accent, border: `1px solid ${accent}33` }}>
                      {lang === "nl" ? "Vandaag" : "Today"}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div onClick={() => setStaffWeekOffset(w => w - 1)} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${c.inputBorder}`, color: c.textSub, background: c.bgCard }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text, padding: "0 8px", minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>{periodLabel}</div>
                  <div onClick={() => setStaffWeekOffset(w => w + 1)} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${c.inputBorder}`, color: c.textSub, background: c.bgCard }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                </div>
              </div>

              {/* Period summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "14px 18px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16 }}>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Afspraken" : "Appointments"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: c.text, lineHeight: 1 }}>{periodAppts.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Voltooid" : "Completed"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: c.text, lineHeight: 1 }}>{periodAppts.filter(a => a.status === "completed").length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Omzet" : "Revenue"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: accent, lineHeight: 1 }}>€{periodRevenue.toFixed(0)}</div>
                </div>
              </div>

              {/* Week calendar grid with appointment previews */}
              <div style={{ marginBottom: 20, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${c.border}`, background: c.inputBg }}>
                  {weekDays.map((d, i) => {
                    const ds = fmt(d);
                    const isToday = ds === todayFmt;
                    return (
                      <div key={i} style={{ textAlign: "center", padding: "10px 4px", borderRight: i < 6 ? `1px solid ${c.border}` : "none", background: isToday ? `${accent}10` : "transparent" }}>
                        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: isToday ? accent : c.textLabel, marginBottom: 4 }}>{DAY_HEADERS[i]}</div>
                        <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? c.btnOnDark : c.text, width: isToday ? 24 : "auto", height: isToday ? 24 : "auto", borderRadius: isToday ? "50%" : 0, background: isToday ? accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: isToday ? 24 : "auto" }}>{d.getDate()}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {weekDays.map((d, i) => {
                    const ds = fmt(d);
                    const isSel = calDate === ds;
                    const dayAppts = appointments.filter(a => a.date === ds && a.status !== "cancelled" && a.status !== "no_show").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
                    const visibleAppts = dayAppts.slice(0, 4);
                    const moreCount = dayAppts.length - visibleAppts.length;
                    return (
                      <div key={i} onClick={() => setCalDate(ds)} style={{
                        minHeight: 140, padding: "8px 6px 10px", cursor: "pointer",
                        background: isSel ? `${accent}22` : "transparent",
                        borderRight: i < 6 ? `1px solid ${c.border}` : "none",
                        display: "flex", flexDirection: "column", gap: 3
                      }}>
                        {dayAppts.length === 0 ? (
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: 11, color: c.textMuted }}>—</div>
                        ) : (
                          <>
                            {visibleAppts.map((a, ai) => {
                              const isCancelled = a.status === "cancelled" || a.status === "no_show";
                              const statusColor = isCancelled ? c.danger : a.status === "completed" ? c.success : accent;
                              return (
                                <div key={ai} style={{ padding: "3px 5px", borderRadius: 4, background: `${statusColor}14`, borderLeft: `2.5px solid ${statusColor}`, overflow: "hidden", opacity: isCancelled ? 0.5 : 1 }}>
                                  <div style={{ fontSize: 9, fontWeight: 600, color: statusColor, fontVariantNumeric: "tabular-nums" }}>{a.time}</div>
                                  <div style={{ fontSize: 9, color: c.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.client_name?.split(" ")[0] || ""}</div>
                                </div>
                              );
                            })}
                            {moreCount > 0 && <div style={{ fontSize: 9, color: accent, fontWeight: 600, textAlign: "center" }}>+{moreCount}</div>}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected day appointments */}
              {calAppts.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "36px 20px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16 }}>
                  <div style={{ opacity: 0.4 }}><NavIcon name="calendar" size={32} color={c.textMuted} /></div>
                  <div style={{ fontSize: 12, color: c.textSub }}>{calDate === todayFmt ? t.noTodayAppts : (lang === "nl" ? "Geen afspraken op deze dag" : "No appointments on this day")}</div>
                </div>
              ) : (
                calAppts.map(a => <ApptCard key={a.id} a={a} />)
              )}
            </div>
            );
          })()}

          {/* FACTUREN */}
          {view === "facturen" && (
            <div className="fade-up" style={{ maxWidth: 960 }}>
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
                          ? <span style={{ fontSize: 10, color: c.success, display: "inline-flex", alignItems: "center", gap: 3 }}><NavIcon name="check" size={10} color={c.success} /> {t.sent}</span>
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
                          <span style={{ fontSize: 10, color: c.textMuted }}>—</span>
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
                              <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "4px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                await supabase.from("services").update({ name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, name: editSvcForm.name_nl, price: parseFloat(editSvcForm.price), duration: parseInt(editSvcForm.duration) }).eq("id", s.id);
                                setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, price: editSvcForm.price, duration: editSvcForm.duration} : sv));
                                setEditingSvc(null);
                              }}><NavIcon name="check" size={12} /></button>
                              <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => setEditingSvc(null)}><NavIcon name="xmark" size={12} /></button>
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
                          <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: accent, borderColor: `${accent}33` }}
                            onClick={() => { setEditingSvc(s.id); setEditSvcForm({ name_nl: s.name_nl, name_en: s.name_en || "", price: s.price, duration: s.duration }); }}><NavIcon name="edit" size={12} /></button>
                          {/* Service deletion restricted to salon owner */}
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
                                <input className="input-field" value={editVarForm.name_nl} onChange={e => setEditVarForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 10, padding: "4px 6px" }} />
                                <input className="input-field" type="number" value={editVarForm.price} onChange={e => setEditVarForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 10, padding: "4px 6px" }} placeholder="€" />
                              </div>
                              <div style={{ display: "flex", gap: 3 }}>
                                <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "3px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                  await supabase.from("service_variants").update({ name_nl: editVarForm.name_nl, name_en: editVarForm.name_en || null, price: parseFloat(editVarForm.price), duration: parseInt(editVarForm.duration) }).eq("id", v.id);
                                  setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, variants: sv.variants.map(vr => vr.id === v.id ? {...vr, ...editVarForm, price: parseFloat(editVarForm.price), duration: parseInt(editVarForm.duration)} : vr)} : sv));
                                  setEditingVar(null);
                                }}><NavIcon name="check" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 6px" }} onClick={() => setEditingVar(null)}><NavIcon name="xmark" size={12} /></button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ color: c.textMuted }}>{v.name_nl} — €{v.price} · {v.duration} min</span>
                              <div style={{ display: "flex", gap: 3 }}>
                                <button className="btn-ghost" style={{ fontSize: 10, padding: "2px 6px", color: accent, borderColor: `${accent}33` }}
                                  onClick={() => { setEditingVar(v.id); setEditVarForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "" }); }}><NavIcon name="edit" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 10, padding: "2px 6px", color: c.danger, borderColor: `${c.danger}26` }}
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
                          <button className="btn-ghost" style={{ fontSize: 10, padding: "2px 6px", color: c.danger, borderColor: `${c.danger}26` }}
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
                          <button onClick={() => staffDeletePhoto(s.id, p.id, p.url)} style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
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

                {/* Service creation restricted to salon owner */}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + c.border, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{t.contactOwnerServices}</div>
                </div>
              </div>

              <button className="btn-ghost" style={{ width: "100%", marginTop: 16, display: isMobile ? "block" : "none" }} onClick={onLogout}>{t.logout}</button>
            </div>
          )}
          </div>
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
                    const { data: existing } = await supabase.from("clients").select("id").eq("email", email).maybeSingle();
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
                    const { data: appt, error: apptError } = await supabase.from("appointments").insert(apptData).select("*").single();
                    if (apptError || !appt) {
                      setAddApptLoading(false);
                      return;
                    }
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
                    setAddApptDone(true);
                    setAddApptLoading(false);
                  }}>
                  {addApptLoading ? "..." : t.confirm}
                </button>
                <button className="btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => setShowAddAppt(false)}>{t.cancelEdit}</button>
              </>) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ marginBottom: 16 }}><NavIcon name="check" size={48} color={c.success} /></div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 8 }}>{t.appointmentAdded}</div>
                  <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddAppt(false)}>{t.close}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile bottom nav */}
        {isMobile && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: c.bg, borderTop: "1px solid " + c.border, display: "flex", justifyContent: "space-around", paddingTop: 8, paddingBottom: "max(8px, env(safe-area-inset-bottom))", zIndex: 100 }}>
            {navItems.map(([k, icon, label]) => (
              <div key={k} className="nav-item" role="tab" tabIndex={0} aria-selected={view === k} onClick={() => setView(k)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(k); } }} style={{ gap: 3 }}>
                <NavIcon name={icon} size={18} color={view === k ? accent : c.textMuted} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: view === k ? accent : c.textMuted, transition: "color 0.2s", whiteSpace: "nowrap" }}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── OWNER ENTRY PAGE (vellu.cc/owner) ───────────────────────

export { StaffApp };
export default StaffApp;
