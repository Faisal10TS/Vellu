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
  const toast = useToast();

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
  const [staffSettingsTab, setStaffSettingsTab] = useState("werktijden");
  const [calViewMode, setCalViewMode] = useState("week");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [invoicesExpanded, setInvoicesExpanded] = useState(false);
  const [expandedStaffSvc, setExpandedStaffSvc] = useState(null);
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
      if (error) { toast.show(lang === "nl" ? "Fout bij voltooien" : "Error completing", "error"); return; }
      setAppointments(a => a.map(x => x.id === id ? {...x, status: "completed"} : x));
      toast.show(lang === "nl" ? "Afspraak voltooid" : "Appointment completed");
    } finally { setProcessingApptId(null); }
  };
  const markNoShow = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      const { error } = await supabase.from("appointments").update({ status: "no_show" }).eq("id", id).eq("owner_id", salonProfile.id);
      if (error) { toast.show(lang === "nl" ? "Fout bij markeren" : "Error marking no-show", "error"); return; }
      setAppointments(a => a.map(x => x.id === id ? {...x, status: "no_show"} : x));
    } finally { setProcessingApptId(null); }
  };
  const saveWorkingHours = async () => {
    const { error } = await supabase.from("staff_members").update({ working_hours: whForm }).eq("id", staffMember.id);
    if (error) return;
    setMyStaff(s => ({...s, working_hours: whForm}));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
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
        `LOCATION:${salonProfile.business_name}`,
        `STATUS:${a.status === "confirmed" ? "CONFIRMED" : "COMPLETED"}`,
        `UID:${a.id}@vellu.cc`,
        "END:VEVENT"
      ].join("\r\n");
    });
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Vellu//Beauty Booking//EN",
      "X-WR-CALNAME:Vellu - " + myStaff.name,
      ...events,
      "END:VCALENDAR"
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vellu-${myStaff.name.toLowerCase().replace(/\s+/g, "-")}-agenda.ics`;
    a.click(); URL.revokeObjectURL(url);
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
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
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
      toast.show(lang === "nl" ? "Factuur verstuurd" : "Invoice sent");
    }
    } finally { setProcessingApptId(null); }
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
          <button className="btn-ghost" style={{ fontSize: 10, padding: "8px 12px", color: c.textLabel }} onClick={() => {
            const dur = parseInt(a.service_duration || a.duration || 60);
            window.open(getGoogleCalUrl({
              title: `${a.client_name} — ${a.service_name}`,
              date: a.date, time: a.time, duration: dur,
              description: `${a.service_name}\n${a.client_name}\n€${a.service_price}`,
              location: salonProfile.business_name || ""
            }), "_blank");
          }}>{t.addToGoogleCal}</button>
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
    <Layout accent={accent}>

      <ToastContainer toasts={toast.toasts} />
      <ConfirmModal state={confirmState} onYes={confirmYes} onNo={confirmNo} lang={lang} />
      <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: c.bg, fontFamily: "'Jost',sans-serif", color: c.text }}>
        {/* Desktop Sidebar */}
        {!isMobile && (
          <aside style={{
            width: 260,
            borderRight: "1px solid " + c.border,
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            top: 0, left: 0, bottom: 0,
            background: c.bg,
            zIndex: 50,
            flexShrink: 0
          }}>
            {/* Sidebar Header */}
            <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.18em" }}>vellu</div>
            </div>

            {/* Staff Info */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{salonProfile.business_name}</div>
              <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 10 }}>{myStaff.name}</div>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, minHeight: 0, padding: "12px 12px", overflowY: "auto" }}>
              {navItems.map(([k, icon, label]) => (
                <div key={k} className="nav-item" role="tab" tabIndex={0} aria-selected={view === k} onClick={() => setView(k)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(k); } }} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "11px 16px", borderRadius: 12,
                  cursor: "pointer", marginBottom: 3,
                  background: view === k ? `${accent}12` : "transparent",
                  border: `1px solid ${view === k ? `${accent}22` : "transparent"}`,
                  transition: "all 0.2s"
                }}>
                  <NavIcon name={icon} size={18} color={view === k ? accent : c.textLabel} />
                  <span style={{ fontSize: 13, fontWeight: view === k ? 600 : 400, color: view === k ? accent : c.textSub, letterSpacing: "0.02em" }}>{label}</span>
                </div>
              ))}
            </nav>

            {/* Sidebar Footer */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <ThemeToggle /><LangToggle lang={lang} setLang={setLang} />
              </div>
              <button className="btn-ghost" style={{ width: "100%", marginTop: 4, fontSize: 11, color: c.textLabel, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={onLogout}>
                <NavIcon name="logout" size={14} color={c.textLabel} />{t.logout}
              </button>
            </div>
          </aside>
        )}

        {/* Main content */}
        <div style={{ flex: 1, marginLeft: isMobile ? 0 : 260, padding: isMobile ? "16px 18px 100px" : "30px 40px", overflowX: "hidden", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
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
            const prevWeekStart = new Date(now); prevWeekStart.setDate(now.getDate() - 14);
            const weekRevenue = completedAppts.filter(a => new Date(a.date) >= weekAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const prevWeekRevenue = completedAppts.filter(a => new Date(a.date) >= prevWeekStart && new Date(a.date) < weekAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const monthRevenue = completedAppts.filter(a => new Date(a.date) >= monthAgo).reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const weekChange = prevWeekRevenue > 0 ? Math.round(((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100) : 0;
            const todayRevenue = todayAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const todayDate = now.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" });

            // Daily revenue for sparklines
            const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const revByDay = {};
            completedAppts.forEach(a => {
              const d = new Date(a.date);
              revByDay[dayKey(d)] = (revByDay[dayKey(d)] || 0) + parseFloat(a.service_price || 0);
            });
            const weekDaily = [];
            for (let i = 6; i >= 0; i--) {
              const d = new Date(now); d.setDate(now.getDate() - i);
              weekDaily.push(revByDay[dayKey(d)] || 0);
            }
            const monthDaily = [];
            for (let i = 29; i >= 0; i--) {
              const d = new Date(now); d.setDate(now.getDate() - i);
              monthDaily.push(revByDay[dayKey(d)] || 0);
            }
            const sparkline = (data, color) => {
              if (!data || data.length < 2) return null;
              const W = 200, H = 80, pad = 4;
              const max = Math.max(...data, 1);
              const min = Math.min(...data);
              const range = max - min || 1;
              const pts = data.map((v, i) => {
                const x = pad + (i / (data.length - 1)) * (W - pad * 2);
                const y = pad + (H - pad * 2) - ((v - min) / range) * (H - pad * 2);
                return { x, y };
              });
              const linePath = pts.reduce((acc, p, i) => {
                if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                const prev = pts[i - 1];
                const cx1 = prev.x + (p.x - prev.x) / 2;
                const cy1 = prev.y;
                const cx2 = prev.x + (p.x - prev.x) / 2;
                const cy2 = p.y;
                return `${acc} C${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              }, "");
              const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${H - pad} L${pts[0].x.toFixed(1)},${H - pad} Z`;
              const lastPt = pts[pts.length - 1];
              const gradId = "staff-spark-" + color.replace(/[^a-z0-9]/gi, "") + "-" + data.length;
              return (
                <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath} fill={`url(#${gradId})`} />
                  <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={color} vectorEffect="non-scaling-stroke" />
                </svg>
              );
            };

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

                {/* KPI cards stacked — with sparklines */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "1fr", gap: 10, gridAutoRows: isMobile ? "auto" : "1fr" }}>
                  {/* WEEK REVENUE */}
                  <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: "16px 18px", minHeight: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{lang === "nl" ? "Deze week" : "This week"}</div>
                      <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "7 dagen" : "7 days"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1 }}>€{weekRevenue.toFixed(0)}</div>
                      {weekChange !== 0 && (
                        <div style={{ fontSize: 10, color: weekChange > 0 ? c.success : c.danger, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 100, background: weekChange > 0 ? `${c.success}18` : `${c.danger}18`, border: `1px solid ${weekChange > 0 ? c.success : c.danger}33`, whiteSpace: "nowrap" }}>
                          {weekChange > 0 ? "↑" : "↓"} {Math.abs(weekChange)}%
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minHeight: 40, marginTop: 12 }}>
                      {sparkline(weekDaily, accent)}
                    </div>
                  </div>

                  {/* MONTH REVENUE */}
                  <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: "16px 18px", minHeight: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{lang === "nl" ? "Deze maand" : "This month"}</div>
                      <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "30 dagen" : "30 days"}</div>
                    </div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, lineHeight: 1, marginTop: 6 }}>€{monthRevenue.toFixed(0)}</div>
                    <div style={{ flex: 1, minHeight: 40, marginTop: 12 }}>
                      {sparkline(monthDaily, accent)}
                    </div>
                  </div>

                  {/* TOTAL EARNINGS */}
                  <div className="stat-card" style={{ display: "flex", flexDirection: "column", padding: "16px 18px", minHeight: 0 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.totalEarnings}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: c.text, lineHeight: 1, marginTop: 6 }}>€{totalEarnings.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{completedAppts.length} {lang === "nl" ? "behandelingen" : "treatments"}</div>
                  </div>
                </div>
              </div>

              {/* Primary CTA */}
              <button className="btn-primary" style={{ width: "100%", marginBottom: 16, padding: "14px 24px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={() => { setShowAddAppt(true); setAddApptDone(false); setAddApptForm({ service_id: "", variant_id: "", date: fmt(getToday()), time: "", client_name: "", client_email: "", client_phone: "" }); }}>
                <NavIcon name="plus" size={14} color={c.btnOnDark} /> {t.addAppointment}
              </button>

              {/* Revenue Chart + Popular Services */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: 14, marginBottom: 22, alignItems: "stretch" }}>
                {/* Revenue area chart — 8 weeks */}
                {(() => {
                  const weeks = [];
                  for (let w = 7; w >= 0; w--) {
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - (w * 7 + now.getDay()));
                    weekStart.setHours(0,0,0,0);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 7);
                    const rev = completedAppts
                      .filter(a => new Date(a.date) >= weekStart && new Date(a.date) < weekEnd)
                      .reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
                    const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
                    weeks.push({ label, revenue: rev });
                  }
                  const total8w = weeks.reduce((s, w) => s + w.revenue, 0);
                  const maxRev = Math.max(...weeks.map(w => w.revenue), 1);
                  const avgWeek = total8w / weeks.length;
                  const peakIdx = weeks.reduce((best, w, i) => w.revenue > weeks[best].revenue ? i : best, 0);
                  const firstHalfAvg = weeks.slice(0, 4).reduce((s, w) => s + w.revenue, 0) / 4;
                  const secondHalfAvg = weeks.slice(4).reduce((s, w) => s + w.revenue, 0) / 4;
                  const trendPct = firstHalfAvg > 0 ? Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100) : 0;
                  const W = 560, H = 220, PAD_L = 16, PAD_R = 16, PAD_TOP = 32, PAD_BOT = 30;
                  const innerW = W - PAD_L - PAD_R;
                  const innerH = H - PAD_TOP - PAD_BOT;
                  const pts = weeks.map((w, i) => {
                    const x = PAD_L + (i / (weeks.length - 1)) * innerW;
                    const y = PAD_TOP + innerH - (w.revenue / maxRev) * innerH;
                    return { x, y, ...w };
                  });
                  const smoothPath = pts.reduce((acc, p, i) => {
                    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                    const prev = pts[i - 1];
                    const cx1 = prev.x + (p.x - prev.x) / 2;
                    const cy1 = prev.y;
                    const cx2 = prev.x + (p.x - prev.x) / 2;
                    const cy2 = p.y;
                    return `${acc} C${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  }, "");
                  const areaPath = `${smoothPath} L${pts[pts.length - 1].x.toFixed(1)},${PAD_TOP + innerH} L${pts[0].x.toFixed(1)},${PAD_TOP + innerH} Z`;
                  const gradId = "staff-rev-grad-" + Math.abs(accent.charCodeAt(1) * 7).toString(16);
                  return (
                    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "20px 22px", display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>{t.revenueOverTime || (lang === "nl" ? "Omzet over tijd" : "Revenue over time")}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: c.text, lineHeight: 1 }}>€{total8w.toFixed(0)}</div>
                          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{lang === "nl" ? "afgelopen 8 weken" : "last 8 weeks"}</div>
                        </div>
                      </div>
                      <div style={{ flex: 1, display: "flex", alignItems: "stretch", marginTop: 14, minHeight: 180 }}>
                        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", overflow: "visible" }}>
                          <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                              <stop offset="100%" stopColor={accent} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {[0.25, 0.5, 0.75].map(pct => (
                            <line key={pct} x1={PAD_L} y1={PAD_TOP + innerH * pct} x2={W - PAD_R} y2={PAD_TOP + innerH * pct} stroke={c.border} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
                          ))}
                          <line x1={PAD_L} y1={PAD_TOP + innerH} x2={W - PAD_R} y2={PAD_TOP + innerH} stroke={c.border} strokeWidth="1" />
                          {maxRev > 0 && <path d={areaPath} fill={`url(#${gradId})`} />}
                          {maxRev > 0 && <path d={smoothPath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                          {pts[peakIdx].revenue > 0 && (
                            <g>
                              <rect x={pts[peakIdx].x - 28} y={pts[peakIdx].y - 26} width="56" height="18" rx="9" fill={c.bg} stroke={accent} strokeWidth="1" />
                              <text x={pts[peakIdx].x} y={pts[peakIdx].y - 13} fontSize="11" fill={accent} textAnchor="middle" fontFamily="'Jost',sans-serif" fontWeight="600">
                                €{pts[peakIdx].revenue.toFixed(0)}
                              </text>
                            </g>
                          )}
                          {pts.map((p, i) => (
                            <g key={i}>
                              <circle cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3} fill={c.bg} stroke={accent} strokeWidth={i === pts.length - 1 ? 2.5 : 1.8}>
                                <title>{p.label} · €{p.revenue.toFixed(0)}</title>
                              </circle>
                              {i === pts.length - 1 && (
                                <circle cx={p.x} cy={p.y} r="10" fill={accent} opacity="0.15">
                                  <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
                                  <animate attributeName="opacity" values="0.25;0;0.25" dur="2s" repeatCount="indefinite" />
                                </circle>
                              )}
                            </g>
                          ))}
                          {[0, Math.floor(pts.length / 2), pts.length - 1].map(i => (
                            <text key={i} x={pts[i].x} y={H - 10} fontSize="11" fill={c.textMuted} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} fontFamily="'Jost',sans-serif">
                              {pts[i].label}
                            </text>
                          ))}
                        </svg>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>{lang === "nl" ? "Beste week" : "Best week"}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: c.text }}>€{pts[peakIdx].revenue.toFixed(0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>{lang === "nl" ? "Gemiddeld" : "Average"}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: c.text }}>€{avgWeek.toFixed(0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 3 }}>Trend</div>
                          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: trendPct > 0 ? c.success : trendPct < 0 ? c.danger : c.text }}>
                            {trendPct > 0 ? "↑" : trendPct < 0 ? "↓" : "—"} {Math.abs(trendPct)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Popular services — thumbnails + revenue */}
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: "20px 22px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{t.popularServices || (lang === "nl" ? "Populaire diensten" : "Popular services")}</div>
                    <div style={{ fontSize: 9, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Top 5</div>
                  </div>
                  {(() => {
                    const svcStats = {};
                    completedAppts.forEach(a => {
                      const n = a.service_name?.split(" — ")[0] || "?";
                      if (!svcStats[n]) svcStats[n] = { count: 0, revenue: 0, serviceId: a.service_id };
                      svcStats[n].count += 1;
                      svcStats[n].revenue += parseFloat(a.service_price || 0);
                    });
                    const sorted = Object.entries(svcStats).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
                    if (sorted.length === 0) return (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: c.textMuted, gap: 10 }}>
                        <div style={{ opacity: 0.4 }}><NavIcon name="chart" size={32} color={c.textMuted} /></div>
                        <div style={{ fontSize: 12 }}>{t.noAppts}</div>
                      </div>
                    );
                    const max = sorted[0][1].count;
                    return (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        {sorted.map(([name, stats]) => {
                          const svc = services.find(s => s.id === stats.serviceId || (lang === "nl" ? s.name_nl : (s.name_en || s.name_nl)) === name);
                          const thumb = svc?.photos?.[0]?.url;
                          return (
                            <div key={name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{ width: 40, height: 40, borderRadius: 10, background: c.inputBg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                                {thumb ? (
                                  <img src={thumb} alt="" loading="lazy" onError={e => { e.target.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", position: "relative", zIndex: 1 }} />
                                ) : null}
                                <NavIcon name="scissors" size={16} color={c.textMuted} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: accent, flexShrink: 0, lineHeight: 1 }}>€{stats.revenue.toFixed(0)}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ flex: 1, height: 5, borderRadius: 4, background: c.inputBg, overflow: "hidden" }}>
                                    <div style={{ height: "100%", borderRadius: 4, background: accent, width: `${(stats.count / max) * 100}%`, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                                  </div>
                                  <span style={{ fontSize: 10, color: c.textMuted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{stats.count}×</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            );
          })()}

          {/* AGENDA */}
          {view === "agenda" && (() => {
            const MON_SHORT = lang === "nl" ? MON_NL : MON_EN;
            const MON_FULL_NL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
            const MON_FULL_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            const MON_FULL = lang === "nl" ? MON_FULL_NL : MON_FULL_EN;
            const DAY_HEADERS = lang === "nl" ? ["Ma","Di","Wo","Do","Vr","Za","Zo"] : ["Mo","Tu","We","Th","Fr","Sa","Su"];
            const todayFmt = fmt(getToday());
            const todayDate = getToday();

            const filteredAppts = appointments.filter(a => a.status !== "cancelled" && a.status !== "no_show");

            let periodAppts = [];
            let periodLabel = "";

            if (calViewMode === "week") {
              const base = new Date(todayDate);
              base.setDate(base.getDate() + staffWeekOffset * 7);
              const weekStart = new Date(base);
              weekStart.setDate(base.getDate() - ((base.getDay() + 6) % 7));
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekStart.getDate() + 6);
              const ws = fmt(weekStart);
              const we = fmt(weekEnd);
              periodAppts = filteredAppts.filter(a => a.date >= ws && a.date <= we);
              const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
              periodLabel = sameMonth
                ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MON_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
                : `${weekStart.getDate()} ${MON_SHORT[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MON_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
            } else if (calViewMode === "month") {
              const target = new Date(todayDate.getFullYear(), todayDate.getMonth() + staffWeekOffset, 1);
              const prefix = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
              periodAppts = filteredAppts.filter(a => a.date?.startsWith(prefix));
              periodLabel = `${MON_FULL[target.getMonth()]} ${target.getFullYear()}`;
            } else {
              const yr = todayDate.getFullYear() + staffWeekOffset;
              periodAppts = filteredAppts.filter(a => a.date?.startsWith(String(yr)));
              periodLabel = String(yr);
            }
            const periodRevenue = periodAppts.filter(a => a.status === "completed").reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const periodDone = periodAppts.filter(a => a.status === "completed").length;

            return (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.myAgenda}>{t.agenda}</PTitle>}

              {/* Top toolbar — view toggle + export + period navigator */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4, padding: 3, background: c.inputBg, borderRadius: 100, border: `1px solid ${c.inputBorder}` }}>
                    {["week", "month", "year"].map(mode => (
                      <div key={mode} onClick={() => { setCalViewMode(mode); setStaffWeekOffset(0); }} style={{
                        padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                        letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
                        background: calViewMode === mode ? accent : "transparent",
                        color: calViewMode === mode ? c.btnOnDark : c.textSub,
                      }}>{mode === "week" ? (lang === "nl" ? "Week" : "Week") : mode === "month" ? (lang === "nl" ? "Maand" : "Month") : (lang === "nl" ? "Jaar" : "Year")}</div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {staffWeekOffset !== 0 && (
                    <div onClick={() => { setStaffWeekOffset(0); setCalDate(todayFmt); }} style={{
                      padding: "7px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      background: `${accent}14`, color: accent, border: `1px solid ${accent}33`
                    }}>{lang === "nl" ? "Vandaag" : "Today"}</div>
                  )}
                  <div onClick={() => setStaffWeekOffset(o => o - 1)} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${c.inputBorder}`, color: c.textSub, background: c.bgCard }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text, padding: "0 8px", minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>{periodLabel}</div>
                  <div onClick={() => setStaffWeekOffset(o => o + 1)} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${c.inputBorder}`, color: c.textSub, background: c.bgCard }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                </div>
              </div>

              {/* Period summary strip */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "14px 18px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16 }}>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Totaal" : "Total"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: c.text, lineHeight: 1 }}>{periodAppts.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Bevestigd" : "Confirmed"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: c.text, lineHeight: 1 }}>{periodAppts.filter(a => a.status === "confirmed").length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Voltooid" : "Completed"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: c.text, lineHeight: 1 }}>{periodDone}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{lang === "nl" ? "Omzet" : "Revenue"}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, color: accent, lineHeight: 1 }}>€{periodRevenue.toFixed(0)}</div>
                </div>
              </div>

              {/* WEEK VIEW */}
              {calViewMode === "week" && (() => {
                const base = getToday();
                base.setDate(base.getDate() + staffWeekOffset * 7);
                const dayOfWeek = (base.getDay() + 6) % 7;
                const weekStart = new Date(base);
                weekStart.setDate(base.getDate() - dayOfWeek);
                const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
                return (
                  <div style={{ marginBottom: 20, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                    {/* Header + body in one grid */}
                    {weekDays.map((d, i) => {
                      const ds = fmt(d);
                      const isToday = ds === todayFmt;
                      const isSel = calDate === ds;
                      const dayAppts = filteredAppts.filter(a => a.date === ds).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
                      const visibleAppts = dayAppts.slice(0, isMobile ? 2 : 4);
                      const moreCount = dayAppts.length - visibleAppts.length;
                      return (
                        <div key={i} onClick={() => setCalDate(ds)} style={{
                          borderRight: i < 6 ? `1px solid ${c.border}` : "none",
                          cursor: "pointer", display: "flex", flexDirection: "column",
                          background: isSel ? `${accent}22` : isToday ? `${accent}08` : "transparent"
                        }}>
                          {/* Day header */}
                          <div style={{ textAlign: "center", padding: isMobile ? "8px 2px 6px" : "10px 4px", background: c.inputBg, borderBottom: `1px solid ${c.border}` }}>
                            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: isToday ? accent : c.textLabel, marginBottom: 4 }}>{DAY_HEADERS[i]}</div>
                            <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? c.btnOnDark : c.text, width: isToday ? 24 : "auto", height: isToday ? 24 : "auto", borderRadius: isToday ? "50%" : 0, background: isToday ? accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: isToday ? 24 : "auto" }}>{d.getDate()}</div>
                          </div>
                          {/* Day content */}
                          <div style={{ flex: 1, minHeight: isMobile ? 80 : 120, padding: isMobile ? "6px 3px 8px" : "8px 6px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
                            {dayAppts.length === 0 ? (
                              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: 11, color: c.textMuted }}>—</div>
                            ) : (
                              <>
                                {visibleAppts.map((a, ai) => {
                                  const statusColor = a.status === "completed" ? c.success : accent;
                                  return (
                                    <div key={ai} style={{ padding: isMobile ? "2px 3px" : "3px 5px", borderRadius: 4, background: `${statusColor}14`, borderLeft: `2.5px solid ${statusColor}`, overflow: "hidden" }}>
                                      <div style={{ fontSize: isMobile ? 8 : 9, fontWeight: 600, color: statusColor, fontVariantNumeric: "tabular-nums" }}>{a.time}</div>
                                      <div style={{ fontSize: isMobile ? 8 : 9, color: c.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.client_name?.split(" ")[0] || ""}</div>
                                    </div>
                                  );
                                })}
                                {moreCount > 0 && <div style={{ fontSize: 8, color: accent, fontWeight: 600, textAlign: "center" }}>+{moreCount}</div>}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* MONTH VIEW */}
              {calViewMode === "month" && (() => {
                const base = getToday();
                const targetMonth = new Date(base.getFullYear(), base.getMonth() + staffWeekOffset, 1);
                const year = targetMonth.getFullYear();
                const month = targetMonth.getMonth();
                const firstOfMonth = new Date(year, month, 1);
                const lastOfMonth = new Date(year, month + 1, 0);
                const startDay = (firstOfMonth.getDay() + 6) % 7;
                const daysInMonth = lastOfMonth.getDate();
                const cells = [];
                const prevMonthLast = new Date(year, month, 0).getDate();
                for (let i = startDay - 1; i >= 0; i--) {
                  const d = prevMonthLast - i;
                  const prevMonth = month === 0 ? 11 : month - 1;
                  const prevYear = month === 0 ? year - 1 : year;
                  cells.push({ day: d, month: prevMonth, year: prevYear, muted: true });
                }
                for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, month, year, muted: false });
                const totalCells = Math.ceil(cells.length / 7) * 7;
                const needed = totalCells - cells.length;
                for (let d = 1; d <= needed; d++) {
                  const nextMonth = month === 11 ? 0 : month + 1;
                  const nextYear = month === 11 ? year + 1 : year;
                  cells.push({ day: d, month: nextMonth, year: nextYear, muted: true });
                }
                const rows = cells.length / 7;
                return (
                  <div style={{ marginBottom: 20, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${c.border}`, background: c.inputBg }}>
                      {DAY_HEADERS.map((dh, i) => (
                        <div key={dh} style={{ textAlign: "center", fontSize: isMobile ? 9 : 10, fontWeight: 600, color: c.textLabel, padding: isMobile ? "8px 0" : "10px 0", letterSpacing: "0.12em", textTransform: "uppercase", borderRight: i < 6 ? `1px solid ${c.border}` : "none" }}>{dh}</div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                      {cells.map((cell, i) => {
                        const ds = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
                        const isSel = calDate === ds;
                        const isToday = ds === todayFmt;
                        const count = filteredAppts.filter(a => a.date === ds).length;
                        const dayAppts = filteredAppts.filter(a => a.date === ds).slice(0, isMobile ? 1 : 3);
                        const col = i % 7;
                        const row = Math.floor(i / 7);
                        return (
                          <div key={i} onClick={() => {
                            setCalDate(ds);
                            setCalViewMode("week");
                            const clickedDate = new Date(ds);
                            const today = getToday();
                            const diffDays = Math.floor((clickedDate - today) / (1000 * 60 * 60 * 24));
                            setStaffWeekOffset(Math.floor(diffDays / 7));
                          }} style={{
                            minHeight: isMobile ? 48 : 92, padding: isMobile ? "6px 4px" : "8px 8px 6px", cursor: "pointer", position: "relative",
                            background: isSel ? `${accent}22` : isToday ? `${accent}10` : "transparent",
                            borderRight: col < 6 ? `1px solid ${c.border}` : "none",
                            borderBottom: row < rows - 1 ? `1px solid ${c.border}` : "none",
                            transition: "background 0.15s",
                            opacity: cell.muted ? 0.35 : 1,
                            display: "flex", flexDirection: "column", gap: 3, alignItems: isMobile ? "center" : "stretch"
                          }}>
                            <div style={{
                              fontSize: isMobile ? 12 : 12, fontWeight: isToday ? 700 : 500,
                              color: isToday ? c.btnOnDark : isSel ? accent : c.text,
                              width: isToday ? 24 : "auto", height: isToday ? 24 : "auto",
                              borderRadius: isToday ? "50%" : 0,
                              background: isToday ? accent : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center"
                            }}>{cell.day}</div>
                            {!cell.muted && count > 0 && isMobile && (
                              <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                                {Array.from({ length: Math.min(count, 3) }).map((_, di) => (
                                  <div key={di} style={{ width: 5, height: 5, borderRadius: "50%", background: accent }} />
                                ))}
                                {count > 3 && <div style={{ fontSize: 8, color: accent, fontWeight: 700, lineHeight: "5px" }}>+</div>}
                              </div>
                            )}
                            {!cell.muted && !isMobile && (<>
                              {dayAppts.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                                  {dayAppts.map((a, ai) => (
                                    <div key={ai} style={{
                                      fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                      background: `${accent}1a`, color: c.textSub,
                                      borderLeft: `2px solid ${accent}`,
                                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                    }}>
                                      {a.time} {a.client_name?.split(" ")[0] || ""}
                                    </div>
                                  ))}
                                  {count > 3 && <div style={{ fontSize: 9, color: c.textMuted, paddingLeft: 2 }}>+{count - 3}</div>}
                                </div>
                              )}
                              {count > 0 && (
                                <div style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 100, background: `${accent}22`, color: accent, alignSelf: "flex-end" }}>{count}</div>
                              )}
                            </>)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* YEAR VIEW */}
              {calViewMode === "year" && (() => {
                const baseYear = getToday().getFullYear() + staffWeekOffset;
                const currentMonth = getToday().getMonth();
                const currentYear = getToday().getFullYear();
                const monthCounts = Array.from({ length: 12 }, (_, mi) => {
                  const monthPrefix = `${baseYear}-${String(mi + 1).padStart(2, "0")}`;
                  return filteredAppts.filter(a => a.date?.startsWith(monthPrefix)).length;
                });
                const maxMonthCount = Math.max(...monthCounts, 1);
                return (
                  <div style={{ marginBottom: 20, display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10 }}>
                    {MON_FULL.map((monthName, mi) => {
                      const isCurrent = baseYear === currentYear && mi === currentMonth;
                      const count = monthCounts[mi];
                      const pct = (count / maxMonthCount) * 100;
                      return (
                        <div key={mi} onClick={() => {
                          setCalViewMode("month");
                          const now = getToday();
                          setStaffWeekOffset((baseYear - now.getFullYear()) * 12 + mi - now.getMonth());
                        }} style={{
                          padding: "16px 18px", borderRadius: 14, cursor: "pointer",
                          background: isCurrent ? `${accent}12` : c.bgCard,
                          border: `1px solid ${isCurrent ? `${accent}55` : c.border}`,
                          transition: "all 0.2s",
                          display: "flex", flexDirection: "column", gap: 10
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 400, color: c.text }}>{monthName}</div>
                            {isCurrent && <div style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: `${accent}22`, color: accent, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Nu" : "Now"}</div>}
                          </div>
                          <div>
                            <div style={{ height: 4, borderRadius: 3, background: c.inputBg, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: accent, borderRadius: 3, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                            </div>
                            <div style={{ fontSize: 10, color: count > 0 ? c.textSub : c.textMuted, marginTop: 6 }}>
                              {count > 0 ? `${count} ${lang === "nl" ? "afspraken" : "appointments"}` : (lang === "nl" ? "Geen afspraken" : "No appointments")}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Appointments list + export (week/month views) */}
              {calViewMode !== "year" && (<>
                {calAppts.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "36px 20px", background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 16 }}>
                    <div style={{ opacity: 0.4 }}><NavIcon name="calendar" size={32} color={c.textMuted} /></div>
                    <div style={{ fontSize: 12, color: c.textSub }}>{calDate === todayFmt ? t.noTodayAppts : (lang === "nl" ? "Geen afspraken op deze dag" : "No appointments on this day")}</div>
                  </div>
                ) : (
                  calAppts.map(a => <ApptCard key={a.id} a={a} />)
                )}
              </>)}
            </div>
            );
          })()}

          {/* FACTUREN */}
          {view === "facturen" && (() => {
            const unsent = completedAppts.filter(a => !a.invoice_sent);
            const sent = completedAppts.filter(a => a.invoice_sent);
            const unsentTotal = unsent.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);
            const thisMonthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
            const thisMonthAppts = completedAppts.filter(a => a.date?.startsWith(thisMonthPrefix));
            const thisMonthTotal = thisMonthAppts.reduce((s, a) => s + parseFloat(a.service_price || 0), 0);

            const formatDate = (ds) => {
              if (!ds) return "";
              const d = new Date(ds);
              const MON = lang === "nl" ? MON_NL : MON_EN;
              return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
            };
            const initials = (name) => {
              if (!name) return "?";
              const parts = name.trim().split(/\s+/);
              return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
            };

            return (
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto" }}>
              {isMobile && <PTitle sub={t.completedTreatments}>{t.invoices}</PTitle>}

              {completedAppts.length > 0 && (<>
                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14, gridAutoRows: "1fr" }}>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{t.totalEarnings}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: accent, lineHeight: 1 }}>€{totalEarnings.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{completedAppts.length} {t.treatments}</div>
                  </div>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Deze maand" : "This month"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.text, lineHeight: 1 }}>€{thisMonthTotal.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{thisMonthAppts.length} {t.treatments}</div>
                  </div>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Te versturen" : "Unsent"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: unsent.length > 0 ? c.warning : c.text, lineHeight: 1 }}>{unsent.length}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>€{unsentTotal.toFixed(0)}</div>
                  </div>
                  <div className="stat-card" style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{lang === "nl" ? "Verstuurd" : "Sent"}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 300, color: c.success, lineHeight: 1 }}>{sent.length}</div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 6 }}>{completedAppts.length > 0 ? Math.round((sent.length / completedAppts.length) * 100) : 0}%</div>
                  </div>
                </div>

                {/* Search + filter toolbar */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: c.textMuted, pointerEvents: "none", display: "flex" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    </div>
                    <input className="input-field" placeholder={t.searchPlaceholder || (lang === "nl" ? "Zoek op naam of dienst..." : "Search by name or service...")} value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
                      style={{ width: "100%", fontSize: 12, padding: "11px 14px 11px 38px" }} />
                    {invoiceSearch && (
                      <button onClick={() => setInvoiceSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", background: c.inputBorder, border: "none", color: c.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, padding: 3, background: c.inputBg, borderRadius: 100, border: `1px solid ${c.inputBorder}` }}>
                    {[
                      ["all", lang === "nl" ? "Alles" : "All", completedAppts.length],
                      ["unsent", lang === "nl" ? "Open" : "Unsent", unsent.length],
                      ["sent", lang === "nl" ? "Verstuurd" : "Sent", sent.length]
                    ].map(([key, label, count]) => (
                      <div key={key} onClick={() => setInvoiceFilter(key)} style={{
                        padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontSize: 10, fontWeight: 600,
                        letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
                        background: invoiceFilter === key ? accent : "transparent",
                        color: invoiceFilter === key ? c.btnOnDark : c.textSub,
                        display: "inline-flex", alignItems: "center", gap: 6
                      }}>
                        {label}
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 100, background: invoiceFilter === key ? `${c.btnOnDark}22` : c.inputBorder, color: invoiceFilter === key ? c.btnOnDark : c.textMuted, fontWeight: 700 }}>{count}</span>
                      </div>
                    ))}
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
                if (completedAppts.length === 0) return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "60px 20px", background: c.bgCard, border: `1px dashed ${c.border}`, borderRadius: 16 }}>
                    <div style={{ opacity: 0.4 }}><NavIcon name="facturen" size={36} color={c.textMuted} /></div>
                    <div style={{ fontSize: 13, color: c.textSub, textAlign: "center" }}>{lang === "nl" ? "Nog geen voltooide afspraken" : "No completed appointments yet"}</div>
                    <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", maxWidth: 320 }}>{lang === "nl" ? "Facturen verschijnen hier zodra je een afspraak als voltooid markeert." : "Invoices appear here once you mark an appointment as completed."}</div>
                  </div>
                );
                if (filtered.length === 0) return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 20px", background: c.bgCard, border: `1px dashed ${c.border}`, borderRadius: 16 }}>
                    <div style={{ opacity: 0.4 }}><NavIcon name="eye" size={30} color={c.textMuted} /></div>
                    <div style={{ fontSize: 12, color: c.textSub }}>{lang === "nl" ? "Geen resultaten voor deze filter" : "No results for this filter"}</div>
                    {(invoiceSearch || invoiceFilter !== "all") && (
                      <button className="btn-ghost" style={{ padding: "8px 16px" }} onClick={() => { setInvoiceSearch(""); setInvoiceFilter("all"); }}>
                        {lang === "nl" ? "Filter wissen" : "Clear filter"}
                      </button>
                    )}
                  </div>
                );
                const visible = invoicesExpanded ? filtered : filtered.slice(0, 10);
                return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {visible.map(a => {
                    const isSending = processingApptId === a.id;
                    return (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "14px 18px", background: c.bgCard,
                        border: `1px solid ${a.invoice_sent ? c.border : `${c.warning}33`}`,
                        borderRadius: 14, transition: "border-color 0.15s"
                      }}>
                        {/* Avatar */}
                        <div style={{
                          width: 42, height: 42, borderRadius: "50%",
                          background: `${accent}14`, border: `1px solid ${accent}22`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 600, color: accent, flexShrink: 0,
                          letterSpacing: "0.04em"
                        }}>{initials(a.client_name)}</div>

                        {/* Client + service */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.client_name}</span>
                            {!a.invoice_sent && (
                              <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 7px", borderRadius: 100, background: `${c.warning}1f`, color: c.warning, border: `1px solid ${c.warning}44`, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                                {lang === "nl" ? "Open" : "Unsent"}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: c.textMuted, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span>{formatDate(a.date)}</span>
                            <span>·</span>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.service_name}</span>
                          </div>
                        </div>

                        {/* Price */}
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: accent, flexShrink: 0, lineHeight: 1 }}>€{parseFloat(a.service_price || 0).toFixed(2)}</div>

                        {/* Action */}
                        <div style={{ flexShrink: 0, minWidth: 90, display: "flex", justifyContent: "flex-end" }}>
                          {a.invoice_sent ? (
                            <span style={{ fontSize: 10, color: c.success, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 100, background: `${c.success}14`, border: `1px solid ${c.success}33`, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                              <NavIcon name="check" size={10} color={c.success} /> {t.sent}
                            </span>
                          ) : (
                            <button className="btn-ghost" style={{ padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 6, opacity: processingApptId ? 0.5 : 1 }} disabled={!!processingApptId} onClick={() => staffSendInvoice(a.id)}>
                              {isSending ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                                </svg>
                              ) : (
                                <NavIcon name="send" size={11} color="currentColor" />
                              )}
                              {isSending ? "..." : t.send}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length > 10 && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
                      <button className="btn-ghost" onClick={() => setInvoicesExpanded(v => !v)} style={{ padding: "10px 22px", display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {invoicesExpanded ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                            {t.showLess || (lang === "nl" ? "Minder tonen" : "Show less")}
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                            {t.showMore || (lang === "nl" ? "Meer laden" : "Show more")} ({filtered.length - 10})
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>;
              })()}
            </div>
            );
          })()}

          {/* SETTINGS — tabbed like owner dashboard */}
          {view === "instellingen" && (
            <div className="fade-up">
              {isMobile && <PTitle sub={t.mySettings}>{t.settings}</PTitle>}

              {/* Tab bar */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 4, padding: 3, background: c.inputBg, borderRadius: 100, border: `1px solid ${c.inputBorder}`, maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  {[
                    ["werktijden", "planning", lang === "nl" ? "Werktijden" : "Hours"],
                    ["facturatie", "facturen", lang === "nl" ? "Facturatie" : "Invoicing"],
                    ["diensten", "diensten", lang === "nl" ? "Diensten" : "Services"],
                  ].map(([key, icon, label]) => (
                    <div key={key} onClick={() => setStaffSettingsTab(key)} style={{
                      padding: isMobile ? "8px 12px" : "8px 18px", borderRadius: 100, cursor: "pointer", fontSize: isMobile ? 10 : 11, fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.2s",
                      background: staffSettingsTab === key ? accent : "transparent",
                      color: staffSettingsTab === key ? c.btnOnDark : c.textSub,
                      display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", flexShrink: 0
                    }}>
                      <NavIcon name={icon} size={13} color={staffSettingsTab === key ? c.btnOnDark : c.textSub} /> {label}
                    </div>
                  ))}
                </div>
              </div>

              {/* WERKTIJDEN TAB */}
              {staffSettingsTab === "werktijden" && (
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 14 }}>{t.myWorkingHours}</div>
                  {[0,1,2,3,4,5,6].map(day => {
                    const DAY_FULL = lang === "nl" ? DAY_FULL_NL : DAY_FULL_EN;
                    const staffDay = whForm[day];
                    const isOn = staffDay ? !staffDay.closed : true;
                    const openTime = staffDay?.open || "09:00";
                    const closeTime = staffDay?.close || "17:30";
                    return (
                      <div key={day} style={{
                        display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "10px 12px",
                        background: isOn ? `${accent}08` : c.bgCard,
                        border: `1px solid ${isOn ? `${accent}22` : c.border}`,
                        borderRadius: 12, opacity: isOn ? 1 : 0.6, transition: "all 0.2s"
                      }}>
                        <div style={{ width: 85, fontSize: 12, fontWeight: 500 }}>{DAY_FULL[day]}</div>
                        <div onClick={() => {
                          setWhForm(wh => {
                            const next = {...wh};
                            if (isOn) next[day] = { closed: true };
                            else next[day] = { closed: false, open: openTime, close: closeTime };
                            return next;
                          });
                        }} style={{ width: 36, height: 20, borderRadius: 10, background: isOn ? accent : c.toggleInactive, cursor: "pointer", position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
                          <div style={{ position: "absolute", top: 2, left: isOn ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                        </div>
                        {isOn ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                            <select value={openTime} onChange={e => setWhForm(wh => ({...wh, [day]: {...wh[day], closed: false, open: e.target.value}}))} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, padding: "6px 8px", color: c.text, fontSize: 11, fontFamily: "'Jost',sans-serif", cursor: "pointer" }}>
                              {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                            </select>
                            <span style={{ fontSize: 11, color: c.textLabel }}>—</span>
                            <select value={closeTime} onChange={e => setWhForm(wh => ({...wh, [day]: {...wh[day], closed: false, close: e.target.value}}))} style={{ background: c.bgCardHover, border: "1px solid " + c.inputBorder, borderRadius: 8, padding: "6px 8px", color: c.text, fontSize: 11, fontFamily: "'Jost',sans-serif", cursor: "pointer" }}>
                              {TIMES.map(tt => <option key={tt} value={tt} style={{ background: c.selectBg }}>{tt}</option>)}
                            </select>
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: c.textLabel, fontStyle: "italic" }}>{t.closed}</div>
                        )}
                      </div>
                    );
                  })}
                  <button className="btn-primary" style={{ marginTop: 14, padding: "12px 24px", fontSize: 12 }} onClick={saveWorkingHours}>
                    {saved ? <><NavIcon name="check" size={13} color={c.btnOnDark} /> {lang === "nl" ? "Opgeslagen" : "Saved"}</> : t.saveChanges}
                  </button>
                </div>
              )}

              {/* FACTURATIE TAB */}
              {staffSettingsTab === "facturatie" && (
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 18 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 4 }}>{t.invoiceDetails}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 14 }}>{t.invoiceSettings}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.address}</div>
                      <input className="input-field" placeholder="Haarlemmerdijk 95, Amsterdam" value={invoiceForm.address} onChange={e => setInvoiceForm(f => ({...f, address: e.target.value}))} style={{ width: "100%" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.kvkNumber}</div>
                        <input className="input-field" placeholder="12345678" value={invoiceForm.kvk_number} onChange={e => setInvoiceForm(f => ({...f, kvk_number: e.target.value}))} style={{ width: "100%" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.btwId}</div>
                        <input className="input-field" placeholder="NL123456789B01" value={invoiceForm.btw_id} onChange={e => setInvoiceForm(f => ({...f, btw_id: e.target.value}))} style={{ width: "100%" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.ibanNumber}</div>
                      <input className="input-field" placeholder="NL00 RABO 0000 0000 00" value={invoiceForm.iban} onChange={e => setInvoiceForm(f => ({...f, iban: e.target.value}))} style={{ width: "100%", fontFamily: "monospace", letterSpacing: "0.04em" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.invoicePrefix}</div>
                        <input className="input-field" value={invoiceForm.invoice_prefix} onChange={e => setInvoiceForm(f => ({...f, invoice_prefix: e.target.value}))} style={{ width: "100%", fontFamily: "monospace", textTransform: "uppercase" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Volgend nummer" : "Next number"}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: c.inputBg, borderRadius: 14, border: `1px solid ${c.inputBorder}` }}>
                          <span style={{ fontFamily: "monospace", fontSize: 13, color: accent, fontWeight: 600 }}>{invoiceForm.invoice_prefix}-{String(invoiceForm.next_invoice_number || 1).padStart(4, "0")}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button className="btn-primary" style={{ marginTop: 14, padding: "12px 24px", fontSize: 12 }} onClick={async () => {
                    await supabase.from("staff_members").update({
                      address: invoiceForm.address || null, kvk_number: invoiceForm.kvk_number || null,
                      btw_id: invoiceForm.btw_id || null, iban: invoiceForm.iban || null,
                      invoice_prefix: invoiceForm.invoice_prefix || "INV", next_invoice_number: invoiceForm.next_invoice_number || 1
                    }).eq("id", staffMember.id);
                    setInvoiceSaved(true); setTimeout(() => setInvoiceSaved(false), 2000);
                  }}>{invoiceSaved ? <><NavIcon name="check" size={13} color={c.btnOnDark} /> {lang === "nl" ? "Opgeslagen" : "Saved"}</> : t.saveChanges}</button>
                </div>
              )}

              {/* DIENSTEN TAB — collapsible cards like owner */}
              {staffSettingsTab === "diensten" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel }}>{t.myServices}</div>
                    <div style={{ fontSize: 10, color: c.textMuted }}>{services.length} {lang === "nl" ? "diensten" : "services"}</div>
                  </div>
                  {services.length === 0 && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "36px 20px", background: c.bgCard, border: `1px dashed ${c.border}`, borderRadius: 16 }}>
                      <div style={{ opacity: 0.4 }}><NavIcon name="diensten" size={32} color={c.textMuted} /></div>
                      <div style={{ fontSize: 12, color: c.textSub }}>{t.noServices}</div>
                    </div>
                  )}
                  {services.map(s => {
                    const isExp = expandedStaffSvc === s.id;
                    const isEdit = editingSvc === s.id;
                    const heroPhoto = s.photos?.[0]?.url;
                    const varCount = (s.variants || []).length;
                    const extCount = (s.extras || []).length;
                    const photoCount = (s.photos || []).length;
                    return (
                      <div key={s.id} style={{ background: c.bgCard, border: `1px solid ${isExp ? `${accent}44` : c.border}`, borderRadius: 16, marginBottom: 10, overflow: "hidden", transition: "border-color 0.2s" }}>
                        {isEdit ? (
                          <div style={{ padding: 18 }}>
                            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, marginBottom: 12 }}>{lang === "nl" ? "Dienst bewerken" : "Edit service"}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                              <div>
                                <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Naam (NL)" : "Name (NL)"}</div>
                                <input className="input-field" value={editSvcForm.name_nl} onChange={e => setEditSvcForm(f => ({...f, name_nl: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Naam (EN)" : "Name (EN)"}</div>
                                <input className="input-field" value={editSvcForm.name_en} onChange={e => setEditSvcForm(f => ({...f, name_en: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Prijs (€)" : "Price (€)"}</div>
                                <input className="input-field" type="number" value={editSvcForm.price} onChange={e => setEditSvcForm(f => ({...f, price: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 9, color: c.textLabel, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "nl" ? "Duur (min)" : "Duration (min)"}</div>
                                <input className="input-field" type="number" value={editSvcForm.duration} onChange={e => setEditSvcForm(f => ({...f, duration: e.target.value}))} style={{ fontSize: 13, padding: "10px 12px", width: "100%" }} />
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn-primary" style={{ flex: 1, padding: "11px 18px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={async () => {
                                await supabase.from("services").update({ name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, name: editSvcForm.name_nl, price: parseFloat(editSvcForm.price), duration: parseInt(editSvcForm.duration) }).eq("id", s.id);
                                setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, name_nl: editSvcForm.name_nl, name_en: editSvcForm.name_en, price: editSvcForm.price, duration: editSvcForm.duration} : sv));
                                setEditingSvc(null);
                              }}><NavIcon name="check" size={12} color={c.btnOnDark} /> {t.saveChanges}</button>
                              <button className="btn-ghost" style={{ padding: "11px 18px" }} onClick={() => setEditingSvc(null)}><NavIcon name="xmark" size={12} /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, cursor: "pointer", background: isExp ? `${accent}08` : "transparent", transition: "background 0.15s" }}
                              onClick={() => setExpandedStaffSvc(isExp ? null : s.id)}>
                              <div style={{ width: 48, height: 48, borderRadius: 12, background: heroPhoto ? "transparent" : c.inputBg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                                {heroPhoto ? (
                                  <img src={heroPhoto} alt="" loading="lazy" onError={e => { e.target.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : null}
                                <div style={{ position: heroPhoto ? "absolute" : "static", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: c.inputBg, zIndex: heroPhoto ? -1 : 0 }}>
                                  <NavIcon name="scissors" size={18} color={c.textMuted} />
                                </div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                                <div style={{ fontSize: 14, fontWeight: 500, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lang === "nl" ? s.name_nl : (s.name_en || s.name_nl)}</div>
                                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <span>{s.duration} {t.min}</span>
                                  {varCount > 0 && <><span>·</span><span>{varCount} {lang === "nl" ? "varianten" : "variants"}</span></>}
                                  {extCount > 0 && <><span>·</span><span>{extCount} extras</span></>}
                                  {photoCount > 0 && <><span>·</span><span>{photoCount} {lang === "nl" ? "foto's" : "photos"}</span></>}
                                </div>
                              </div>
                              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400, color: accent, flexShrink: 0, lineHeight: 1, whiteSpace: "nowrap" }}>
                                {varCount > 0 ? `€${Math.min(...s.variants.map(v => parseFloat(v.price)))}+` : `€${s.price}`}
                              </div>
                              <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                <button onClick={() => { setEditingSvc(s.id); setEditSvcForm({ name_nl: s.name_nl, name_en: s.name_en || "", price: s.price, duration: s.duration }); setExpandedStaffSvc(null); }}
                                  style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <NavIcon name="edit" size={13} color="currentColor" />
                                </button>
                                <div style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: c.textMuted, transform: isExp ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                                </div>
                              </div>
                            </div>

                            {isExp && (
                              <div style={{ padding: "0 16px 18px", borderTop: `1px solid ${c.border}` }}>
                                {/* Variants */}
                                <div style={{ marginTop: 18 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, fontWeight: 600 }}>{t.variants}</div>
                                    <div style={{ fontSize: 10, color: c.textMuted }}>{varCount}</div>
                                  </div>
                                  {(s.variants || []).map(v => (
                                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 6 }}>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: c.text }}>{v.name_nl}</div>
                                        <div style={{ fontSize: 10, color: c.textLabel, marginTop: 2 }}>{v.duration} {t.min}</div>
                                      </div>
                                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: accent }}>€{v.price}</div>
                                      <div style={{ display: "flex", gap: 4 }}>
                                        <button onClick={() => { setEditingVar(v.id); setEditVarForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "" }); }}
                                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                          <NavIcon name="edit" size={11} color="currentColor" />
                                        </button>
                                        <button onClick={async () => { await supabase.from("service_variants").delete().eq("id", v.id); setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, variants: sv.variants.filter(vr => vr.id !== v.id)} : sv)); }}
                                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                          <NavIcon name="xmark" size={11} color="currentColor" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  <VariantAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(variant) => {
                                    setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, variants: [...(sv.variants||[]), variant]} : sv));
                                  }} />
                                </div>

                                {/* Extras */}
                                <div style={{ marginTop: 18 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, fontWeight: 600 }}>{t.extras}</div>
                                    <div style={{ fontSize: 10, color: c.textMuted }}>{extCount}</div>
                                  </div>
                                  {(s.extras || []).map(e => (
                                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 6 }}>
                                      <span style={{ fontSize: 16, color: accent, lineHeight: 1 }}>+</span>
                                      <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: c.text }}>{e.name_nl}</div>
                                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: accent }}>+€{e.price}</div>
                                      <button onClick={async () => { await supabase.from("service_extras").delete().eq("id", e.id); setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, extras: sv.extras.filter(ex => ex.id !== e.id)} : sv)); }}
                                        style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.danger}26`, background: "transparent", color: c.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <NavIcon name="xmark" size={11} color="currentColor" />
                                      </button>
                                    </div>
                                  ))}
                                  <ExtraAdder serviceId={s.id} lang={lang} t={t} accent={accent} onAdd={(extra) => {
                                    setServices(svcs => svcs.map(sv => sv.id === s.id ? {...sv, extras: [...(sv.extras||[]), extra]} : sv));
                                  }} />
                                </div>

                                {/* Photos */}
                                <div style={{ marginTop: 18 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textLabel, fontWeight: 600 }}>{lang === "nl" ? "Foto's" : "Photos"}</div>
                                    <div style={{ fontSize: 10, color: c.textMuted }}>{photoCount}</div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {(s.photos || []).map(p => (
                                      <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
                                        <img src={p.url} loading="lazy" style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: `1px solid ${c.border}` }} />
                                        <button onClick={() => staffDeletePhoto(s.id, p.id, p.url)}
                                          style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: c.danger, color: "#fff", border: `2px solid ${c.bgCard}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        </button>
                                      </div>
                                    ))}
                                    <label style={{ width: 72, height: 72, borderRadius: 10, border: `1.5px dashed ${accent}55`, background: `${accent}06`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 2, flexShrink: 0, opacity: staffPhotoUploading === s.id ? 0.5 : 1 }}>
                                      {staffPhotoUploading === s.id ? (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                                          <path d="M21 12a9 9 0 11-6.219-8.56" />
                                        </svg>
                                      ) : (
                                        <>
                                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                                          <span style={{ fontSize: 8, color: accent, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{lang === "nl" ? "Foto" : "Photo"}</span>
                                        </>
                                      )}
                                      <input accept="image/*" multiple type="file" style={{ display: "none" }}
                                        onChange={e => Array.from(e.target.files).forEach(f => staffAddPhoto(s.id, f))} />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: c.textMuted, padding: "12px 0" }}>{t.contactOwnerServices}</div>
                </div>
              )}

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
                      toast.show(lang === "nl" ? "Fout bij het toevoegen van afspraak" : "Error adding appointment", "error");
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
