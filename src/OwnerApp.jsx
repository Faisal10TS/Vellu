import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import {
  useTheme, useSEO, useToast, ToastContainer, useConfirm, ConfirmModal, useFocusTrap,
  Skeleton, DashboardSkeleton,
  compressImage, sendEmails, ACCENT,
  getGoogleCalUrl, getWhatsAppUrl, getWhatsAppBookingMsg, getWhatsAppReminderMsg,
  getToday, fmt, getDays,
  TIMES, DAY_NL, DAY_EN, DAY_FULL_NL, DAY_FULL_EN, MON_NL, MON_EN,
  DEFAULT_HOURS, T, Layout, NavIcon, PTitle, SL, ThemeToggle, LangToggle, Header
} from "./shared.jsx";

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
    <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px", borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
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
      {(!form.name_nl || !form.price) && <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 4 }}>* {lang === "nl" ? "Vul naam en prijs in" : "Fill in name and price"}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{t.add}</button>
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
    <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 12px", borderStyle: "dashed", borderColor: `${accent}33`, color: accent }}
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{t.add}</button>
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
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.services}</div>
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{t.add}</button>
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
        <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 14px", flex: 1, color: accent, borderColor: `${accent}44` }} onClick={add}>{t.add}</button>
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
                  <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: accent, color: c.btnOnDark, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 14px", borderRadius: 100 }}>
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
                    toast.show(lang === "nl"
                      ? `Neem contact op via info@vellu.cc om ${plan.name} te activeren.`
                      : `Contact info@vellu.cc to activate ${plan.name}.`
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
    const { error } = await supabase.from("profiles").update({ business_name: salonName.trim(), city: city.trim() || null }).eq("id", salonData.owner_id);
    if (error) { setSaving(false); return; }
    update(d => { d.name = salonName.trim(); d.city = city.trim(); return d; });
    setSaving(false);
    setStep(1);
  };

  const saveStep2 = async () => {
    if (!svcName.trim() || !svcPrice) return;
    setSaving(true);
    const { data: newSvc, error } = await supabase.from("services").insert({
      owner_id: salonData.owner_id,
      name_nl: svcName.trim(),
      name_en: svcName.trim(),
      price: parseFloat(svcPrice),
      duration: parseInt(svcDuration) || 60,
      position: 0
    }).select().single();
    if (error || !newSvc) { setSaving(false); return; }
    update(d => { d.services = [...d.services, { ...newSvc, photos: [], variants: [], extras: [] }]; return d; });
    setSaving(false);
    setStep(2);
  };

  const saveStep3 = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ business_hours: salonData.business_hours || DEFAULT_HOURS }).eq("id", salonData.owner_id);
    if (error) { setSaving(false); return; }
    setSaving(false);
    setStep(3);
  };

  return (
    <Layout>

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
              <div style={{ fontSize: 26, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingWelcome}</div>
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
              <div style={{ fontSize: 26, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingStep2}</div>
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
              <div style={{ fontSize: 26, marginBottom: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 300 }}>{t.onboardingStep3}</div>
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
  const [invoicesExpanded, setInvoicesExpanded] = useState(false);
  const [analyticsReviewsExpanded, setAnalyticsReviewsExpanded] = useState(false);
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
      const { error } = await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
      if (error) { toast.show(t.errorCompleting, "error"); return; }
      update(d => { d.appointments = d.appointments.map(a => a.id === id ? {...a, status:"completed"} : a); return d; });
      toast.show(t.apptCompleted);
    } finally { setProcessingApptId(null); }
  };
  const markNoShow = async (id) => {
    if (processingApptId) return;
    setProcessingApptId(id);
    try {
      const { error } = await supabase.from("appointments").update({ status: "no_show" }).eq("id", id);
      if (error) return;
      // Increment client no-show count atomically using rpc or direct SQL
      const appt = salonData.appointments.find(a => a.id === id);
      if (appt?.client_id) {
        await supabase.rpc("increment_no_show_count", { client_id_param: appt.client_id }).catch(() => {
          // Fallback to non-atomic increment if RPC doesn't exist
          supabase.from("clients").select("no_show_count").eq("id", appt.client_id).single().then(({ data: client }) => {
            if (client) supabase.from("clients").update({ no_show_count: (client.no_show_count || 0) + 1 }).eq("id", appt.client_id);
          });
        });
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
      toast.show(t.invoiceSent);
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
    // Delete related records first to avoid orphaned data
    await supabase.from("service_photos").delete().eq("service_id", id);
    await supabase.from("service_extras").delete().eq("service_id", id);
    await supabase.from("service_variants").delete().eq("service_id", id);
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
      // Clean up orphaned file from storage
      await supabase.storage.from("service-photos").remove([fileName]);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{a.client_name}</div>
          <div style={{ fontSize: 11, color: c.textLabel, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.time} · {a.service_name}</div>
          <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{a.client_email}{a.staff_name ? ` · ${a.staff_name}` : ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
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
          <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "6px 8px", color: c.textLabel }} onClick={() => {
            const dur = parseInt(a.service_duration || a.duration || 60);
            window.open(getGoogleCalUrl({
              title: `${a.client_name} — ${a.service_name}`,
              date: a.date, time: a.time, duration: dur,
              description: `${t.treatment}: ${a.service_name}\n${t.name}: ${a.client_name}\n€${a.service_price}`,
              location: salonData.name + (salonData.city ? ", " + salonData.city : "")
            }), "_blank");
          }}>{t.addToGoogleCal}</button>
          {salonData.whatsapp_number && a.client_phone && (
            <button className="btn-ghost" style={{ fontSize: 10, padding: "6px 10px", color: "#25d366", borderColor: "rgba(37,211,102,0.2)" }} onClick={() => {
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
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            background: c.bg,
            zIndex: 50,
            flexShrink: 0
          }}>
            {/* Sidebar Header */}
            <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.18em" }}>vellu</div>
            </div>

            {/* Salon Info */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{salonData.name}</div>
              <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 10 }}>{salonData.city}</div>
              <div style={{
                fontSize: 11,
                color: accent,
                background: `${accent}12`,
                border: `1px solid ${accent}22`,
                borderRadius: 8,
                padding: "7px 12px"
              }}>
                vellu.cc/{salonData.id}
              </div>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, minHeight: 0, padding: "12px 12px", overflowY: "auto" }}>
              {navItems.map(([k, icon, label]) => (
                <div
                  key={k}
                  onClick={() => setView(k)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 16px",
                    borderRadius: 12,
                    cursor: "pointer",
                    marginBottom: 3,
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
            <div style={{ padding: "12px 20px", borderTop: "1px solid " + c.border, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <ThemeToggle />
                <LangToggle lang={lang} setLang={setLang} />
              </div>
              <button
                className="btn-ghost"
                style={{ width: "100%", marginTop: 4, fontSize: 11, color: c.textLabel, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
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
          minHeight: 0,
          marginLeft: isMobile ? 0 : 260,
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
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${accent}18`, color: accent, border: `1px solid ${accent}33`, letterSpacing: "0.1em", textTransform: "uppercase" }}>{t.owner}</span>
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
            }}>
              <div style={{
                maxWidth: 960,
                margin: "0 auto",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
                    {navItems.find(([k]) => k === view)?.[2] || t.dashboard}
                  </h1>
                  <div style={{ fontSize: 12, color: c.textLabel }}>
                    {view === "dashboard" ? t.welcomeBack : view === "agenda" ? t.manageAppts : view === "analytics" ? (t.salonInsight) : view === "facturen" ? t.completedTreatments : view === "instellingen" ? t.manageSalon : t.welcomeBack}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11, borderColor: `${accent}33`, color: accent, display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => window.open(`/${salonData.id}`, "_blank", "noopener,noreferrer")}
                  >
                    <NavIcon name="eye" size={14} color={accent} /> {t.preview}
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
            </div>
          )}

          {/* Scrollable Content (settings has its own scroll -- see below) */}
          {view !== "instellingen" ? (
          <div style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            WebkitOverflowScrolling: "touch",
            padding: isMobile ? "14px 22px 80px" : "32px 40px 32px",
            backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}08 0%, transparent 55%)`
          }}>

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto" }}>
              {isMobile && <PTitle sub={t.welcomeBack}>{t.dashboard}</PTitle>}

              {/* Onboarding checklist for new salons */}
              {appts.length === 0 && (
                <div style={{ background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 20, padding: "24px 22px", marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 12 }}>{t.welcomeVellu}</div>
                  <div style={{ fontSize: 12, color: c.textSub, marginBottom: 16, lineHeight: 1.6 }}>{t.followSteps}</div>
                  {[
                    { done: salonData.services?.length > 0, label: t.addServices, action: () => setView("instellingen") },
                    { done: salonData.business_hours && Object.values(salonData.business_hours).some(d => !d.closed), label: t.setHours, action: () => setView("instellingen") },
                    { done: salonData.logo_url, label: t.uploadLogo, action: () => setView("instellingen") },
                    { done: false, label: t.shareLink + "vellu.cc/" + salonData.id, action: () => { navigator.clipboard.writeText("vellu.cc/" + salonData.id).catch(() => {}); } },
                  ].map((step, i) => (
                    <div key={i} onClick={step.action} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, cursor: "pointer", marginBottom: 4, background: step.done ? `${accent}08` : "transparent", border: `1px solid ${step.done ? accent + "22" : c.border}` }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${step.done ? accent : c.textMuted}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {step.done && <NavIcon name="check" size={12} color={accent} />}
                      </div>
                      <div style={{ fontSize: 12, color: step.done ? c.textSub : c.text, textDecoration: step.done ? "line-through" : "none" }}>{step.label}</div>
                    </div>
                  ))}
                </div>
              )}

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
                      {weekChange !== 0 && <div style={{ fontSize: 10, color: weekChange > 0 ? "#86efac" : "#f87171", marginTop: 4 }}>{weekChange > 0 ? "+" : ""}{weekChange}% {t.vsLastWeek}</div>}
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
                <button className="btn-ghost" style={{ fontSize: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => window.open(`/${salonData.id}`, "_blank", "noopener,noreferrer")}>
                  <NavIcon name="eye" size={14} color={c.textSub} /> {t.previewPage}
                </button>
                {appts.length > 0 && (
                  <button className="btn-ghost" style={{ fontSize: 11, padding: "12px 14px", borderColor: `${accent}22`, color: accent, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }} onClick={() => {
                    const upcoming = appts.filter(a => a.status === "confirmed");
                    if (upcoming.length === 0) return;
                    exportCalendar(upcoming);
                  }}>
                    <NavIcon name="download" size={14} color={accent} /> {t.exportCalendar}
                  </button>
                )}
                <button className="btn-ghost" style={{ fontSize: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center", color: copied ? "#86efac" : undefined, borderColor: copied ? "rgba(134,239,172,0.3)" : undefined }} onClick={copyLink}>
                  <NavIcon name="link" size={14} color={copied ? "#86efac" : c.textSub} /> {copied ? t.copied : t.copyLink}
                </button>
              </div>

              {/* Revenue Chart + Popular Services */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: 14, marginBottom: 22 }}>
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <SL style={{ marginBottom: 0 }}>{t.revenueOverTime}</SL>
                    <span style={{ fontSize: 10, color: accent, cursor: "pointer" }} onClick={() => setView("analytics")}>{t.viewMore}</span>
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
                            {weeks.map((w, i) => <div key={i} style={{ fontSize: 10, color: c.textMuted, textAlign: "center", flex: 1 }}>{w.label}</div>)}
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
                          {weeks.map((w, i) => <div key={i} style={{ fontSize: 10, color: i === weeks.length - 1 ? accent : c.textLabel, textAlign: "center", flex: 1, fontWeight: i === weeks.length - 1 ? 600 : 400 }}>{w.revenue > 0 ? `€${w.revenue.toFixed(0)}` : "—"}</div>)}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16 }}>
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
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto" }}>
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
                  }}>{t.everyone}</div>
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
                    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 20, WebkitMaskImage: "linear-gradient(to right, black 88%, transparent)", maskImage: "linear-gradient(to right, black 88%, transparent)" }}>
                      {weekDays.map((d, i) => {
                        const ds = fmt(d); const isSel = calDate === ds;
                        const isToday = ds === fmt(getToday());
                        const has = filteredAgendaAppts.filter(a => a.date === ds).length > 0;
                        return (
                          <div key={i} className={`day-chip ${isSel ? "sel" : ""}`} role="button" tabIndex={0} onClick={() => setCalDate(ds)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCalDate(ds); } }} style={isToday && !isSel ? { border: `1px solid ${accent}66` } : undefined}>
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
                        <div key={dh} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: c.textLabel, padding: "4px 0", letterSpacing: "0.08em", textTransform: "uppercase" }}>{dh}</div>
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
                              <div style={{ fontSize: 10, fontWeight: 700, color: isSel ? c.btnOnDark : accent, marginTop: 2 }}>{count}</div>
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
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto" }}>
              {isMobile && <PTitle sub={t.completedTreatments}>{t.invoices}</PTitle>}

              {completedAppts.length > 0 && (<>
                {/* Search and filter bar */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <input className="input-field" placeholder={t.searchPlaceholder} value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
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
                const visible = invoicesExpanded ? filtered : filtered.slice(0, 10);
                return <>
                  {visible.map(a => (
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
                  ))}
                  {filtered.length > 10 && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                      <button className="btn-ghost" onClick={() => setInvoicesExpanded(v => !v)} style={{ fontSize: 12, padding: "10px 22px" }}>
                        {invoicesExpanded ? t.showLess : `${t.showMore} (${filtered.length - 10})`}
                      </button>
                    </div>
                  )}
                </>;
              })()}
            </div>
          )}

          {/* ANALYTICS */}
          {view === "analytics" && (
            <div className="fade-up" style={{ maxWidth: 960, margin: "0 auto" }}>
              {isMobile && <PTitle sub={t.salonInsight}>{t.analytics}</PTitle>}

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
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.weeklyRevenue}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>€{weekRevenue.toFixed(0)}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.monthlyRevenue}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>€{monthRevenue.toFixed(0)}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.totalAppts}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: c.text, marginTop: 4 }}>{appts.length}</div>
                      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{completedAppts.length} {t.treatments}</div>
                    </div>
                    <div className="stat-card">
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel }}>{t.avgRating}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: accent, marginTop: 4 }}>{avgRating} ★</div>
                      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{salonData.reviews?.length || 0} {t.reviews.toLowerCase()}</div>
                    </div>
                  </>;
                })()}
              </div>

              {/* Revenue chart */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
                            <div key={i} style={{ fontSize: 10, color: c.textMuted, textAlign: "center", flex: 1 }}>
                              {w.label}
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Revenue labels on hover area */}
                      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
                        {weeks.map((w, i) => (
                          <div key={i} style={{ fontSize: 10, color: i === weeks.length - 1 ? accent : c.textLabel, textAlign: "center", flex: 1, fontWeight: i === weeks.length - 1 ? 600 : 400 }}>
                            {w.revenue > 0 ? `€${w.revenue.toFixed(0)}` : "—"}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Popular services */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
                            <span style={{ fontSize: 10, color: c.textMuted }}>{h}:00</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Client retention */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16 }}>
                <SL>{t.reviews} ({salonData.reviews?.length || 0})</SL>
                {(!salonData.reviews || salonData.reviews.length === 0) ? (
                  <div style={{ fontSize: 11, color: c.textMuted, textAlign: "center", padding: "12px 0" }}>{t.noReviews}</div>
                ) : (() => {
                  const visible = analyticsReviewsExpanded ? salonData.reviews : salonData.reviews.slice(0, 5);
                  return <>
                    {visible.map(r => (
                      <div key={r.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid " + c.border }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{r.client_name}</span>
                          <span style={{ color: accent, fontSize: 13 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                        </div>
                        {r.comment && <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.5 }}>{r.comment}</div>}
                        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                    {salonData.reviews.length > 5 && (
                      <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                        <button className="btn-ghost" onClick={() => setAnalyticsReviewsExpanded(v => !v)} style={{ fontSize: 12, padding: "10px 22px" }}>
                          {analyticsReviewsExpanded ? t.showLess : `${t.showMore} (${salonData.reviews.length - 5})`}
                        </button>
                      </div>
                    )}
                  </>;
                })()}
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
            // No horizontal padding on the scroll container — the sticky tab bar
            // spans edge-to-edge so its border-bottom can match the desktop header's
            // full-width line. Content underneath (fade-up) applies its own padding.
            padding: isMobile ? "0 0 160px" : "0 0 100px",
            backgroundImage: `radial-gradient(ellipse 70% 30% at 50% -5%, ${accent}08 0%, transparent 55%)`
          }}>

            {/* Settings tabs — sticky + full-width border to match Instellingen header */}
            <div style={{
              position: "sticky", top: 0, zIndex: 20,
              background: c.bg,
              borderBottom: "1px solid " + c.border,
              paddingTop: isMobile ? 14 : 20, paddingBottom: 12,
              boxShadow: `0 16px 0 0 ${c.bg}`,
              marginBottom: 16
            }}>
              <div style={{
                maxWidth: 960,
                margin: "0 auto",
                padding: isMobile ? "0 22px" : "0 40px",
                display: "flex", gap: 6, overflowX: "auto",
                justifyContent: "center"
              }}>
                {[
                  ["salon", "salon", lang === "nl" ? "Salon" : "Salon"],
                  ["diensten", "diensten", t.services],
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
            </div>

            <div className="fade-up" style={{
              maxWidth: 960,
              margin: "0 auto",
              padding: isMobile ? "0 22px" : "0 40px"
            }}>
              {isMobile && <PTitle sub={t.manageSalon}>{t.settings}</PTitle>}

              {/* ═══ SALON TAB ═══ */}
              {settingsTab === "salon" && <>

              {/* Billing / Subscription */}
              <div style={{ background: `${accent}06`, border: `1px solid ${accent}22`, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.billing}</SL>
                {salonData.plan ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, letterSpacing: "0.08em", textTransform: "uppercase", background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}>
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
                        onClick={() => toast.show(lang === "nl" ? "Neem contact op via info@vellu.cc om te upgraden." : "Contact info@vellu.cc to upgrade.")}>
                        {t.upgradePlan} → {t.planProfessional}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: c.textLabel }}>{t.noPlan}</div>
                )}
              </div>

              {/* Profile */}
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.variants}</div>
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
                                <button className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "4px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                  await supabase.from("service_variants").update({ name_nl: editVariantForm.name_nl, name_en: editVariantForm.name_en || null, price: parseFloat(editVariantForm.price), duration: parseInt(editVariantForm.duration), description_nl: editVariantForm.description_nl || null }).eq("id", v.id);
                                  update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, variants: svc.variants.map(vr => vr.id === v.id ? {...vr, ...editVariantForm, price: parseFloat(editVariantForm.price), duration: parseInt(editVariantForm.duration)} : vr)} : svc); return d; });
                                  setEditingVariant(null);
                                }}><NavIcon name="check" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => setEditingVariant(null)}><NavIcon name="xmark" size={12} /></button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 500 }}>{v.name_nl}</div>
                                {v.description_nl && <div style={{ fontSize: 10, color: c.textMuted }}>{v.description_nl}</div>}
                                <div style={{ fontSize: 10, color: c.textLabel }}>€{v.price} · {v.duration} {t.min}</div>
                              </div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: accent, borderColor: `${accent}33` }}
                                  onClick={() => { setEditingVariant(v.id); setEditVariantForm({ name_nl: v.name_nl, name_en: v.name_en || "", price: v.price, duration: v.duration, description_nl: v.description_nl || "" }); }}><NavIcon name="edit" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
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
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.textMuted, marginBottom: 6 }}>{t.extras}</div>
                      {(s.extras || []).map(e => (
                        <div key={e.id} style={{ marginBottom: 5, padding: "4px 0" }}>
                          {editingExtra === e.id ? (
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <input className="input-field" value={editExtraForm.name_nl} onChange={ev => setEditExtraForm(f => ({...f, name_nl: ev.target.value}))} style={{ fontSize: 10, padding: "6px 8px", flex: 2 }} placeholder="Naam" />
                              <input className="input-field" type="number" value={editExtraForm.price} onChange={ev => setEditExtraForm(f => ({...f, price: ev.target.value}))} style={{ fontSize: 10, padding: "6px 8px", flex: 1 }} placeholder="€" />
                              <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 8px", color: accent, borderColor: `${accent}44` }} onClick={async () => {
                                await supabase.from("service_extras").update({ name_nl: editExtraForm.name_nl, name_en: editExtraForm.name_en || null, price: parseFloat(editExtraForm.price) }).eq("id", e.id);
                                update(d => { d.services = d.services.map(svc => svc.id === s.id ? {...svc, extras: svc.extras.map(ex => ex.id === e.id ? {...ex, name_nl: editExtraForm.name_nl, price: editExtraForm.price} : ex)} : svc); return d; });
                                setEditingExtra(null);
                              }}><NavIcon name="check" size={12} /></button>
                              <button className="btn-ghost" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => setEditingExtra(null)}><NavIcon name="xmark" size={12} /></button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontSize: 11, fontWeight: 500 }}>{e.name_nl} <span style={{ color: c.textLabel }}>+€{e.price}</span></div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: accent, borderColor: `${accent}33` }}
                                  onClick={() => { setEditingExtra(e.id); setEditExtraForm({ name_nl: e.name_nl, name_en: e.name_en || "", price: e.price }); }}><NavIcon name="edit" size={12} /></button>
                                <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
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
                          <img src={p.url || p} className="photo-thumb" loading="lazy" onClick={() => setGallery({ photos: s.photos, idx: i })} />
                          <div onClick={() => deletePhoto(s.id, p.id, p.url || p)} style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "#ff4757", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer", fontWeight: 700, lineHeight: 1 }}>×</div>
                        </div>
                      ))}
                      <label className="photo-add" style={{ flexShrink: 0, opacity: photoUploading === s.id ? 0.5 : 1 }}>
                        {photoUploading === s.id ? (
                          <span style={{ fontSize: 12, color: accent, animation: "spin 1s linear infinite" }}>⏳</span>
                        ) : (
                          <>
                            <span style={{ fontSize: 18, color: `${accent}88` }}>+</span>
                            <span style={{ fontSize: 10, color: `${accent}66`, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.addPhoto}</span>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
                  <div key={m.id} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 10 }}>
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
                              return svc ? <span key={sid} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: `${accent}12`, color: accent, border: `1px solid ${accent}22` }}>{svc.name_nl || svc.name}</span> : null;
                            }) : (
                              <span style={{ fontSize: 10, color: c.textMuted, fontStyle: "italic" }}>{lang === "nl" ? "Alle diensten" : "All services"}</span>
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
                        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, marginBottom: 14 }}>{lang === "nl" ? "Leeg/alles aan = volgt salon openingstijden" : "Empty/all on = follows salon hours"}</div>
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
                            <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{lang === "nl" ? "Leeg = alle diensten" : "Empty = all services"}</div>
                          </div>
                        )}
                        {salonData.account_type === "team" && !m.user_id && (
                          <div style={{ padding: "12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: accent, marginBottom: 6 }}><NavIcon name="key" size={10} color={accent} /> {t.inviteStaffDesc}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input className="input-field" placeholder={t.staffEmail} type="email" value={staffInvite[m.id]?.email || ""} onChange={e => setStaffInvite(prev => ({...prev, [m.id]: {...(prev[m.id] || {}), email: e.target.value}}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                              <input className="input-field" placeholder={t.staffPassword} type="password" value={staffInvite[m.id]?.password || ""} onChange={e => setStaffInvite(prev => ({...prev, [m.id]: {...(prev[m.id] || {}), password: e.target.value}}))} style={{ fontSize: 11, padding: "8px 10px" }} />
                              <button className="btn-ghost" style={{ fontSize: 10, color: accent, borderColor: `${accent}44` }}
                                onClick={async () => {
                                  const staffEmail = staffInvite[m.id]?.email;
                                  const staffPass = staffInvite[m.id]?.password;
                                  if (!staffEmail || !staffPass || staffPass.length < 6) return;
                                  const { data: result, error } = await supabase.functions.invoke("create-staff-account", {
                                    body: { staff_id: m.id, email: staffEmail, password: staffPass, owner_id: salonData.owner_id }
                                  });
                                  if (error) { toast.show(lang === "nl" ? "Fout bij uitnodigen" : "Error inviting staff", "error"); return; }
                                  if (result?.success) {
                                    update(d => { d.staff = d.staff.map(s => s.id === m.id ? {...s, user_id: result.user_id, email: staffEmail} : s); return d; });
                                    setStaffInvite(prev => { const next = {...prev}; delete next[m.id]; return next; });
                                    toast.show(t.inviteSent);
                                  } else { toast.show(result?.error === "email_taken" ? t.emailTaken : (lang === "nl" ? "Fout" : "Error"), "error"); }
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
                        <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
                <SL>{t.exceptionDays}</SL>
                <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 14 }}>{t.exceptionDesc}</div>
                {Object.entries(salonData.day_overrides || {}).filter(([_, v]) => v.type === "exception").map(([date, v]) => (
                  <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 14, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{new Date(date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" })}</div>
                      <div style={{ fontSize: 10, color: c.textLabel }}>{v.open} — {v.close}</div>
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
                    <button className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px", color: "#f87171", borderColor: "rgba(248,113,113,0.15)" }}
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
                      <span style={{ fontSize: 10, color: `${accent}66`, textTransform: "uppercase" }}>{t.logo}</span>
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
                    <span style={{ fontSize: 10, color: `${accent}66`, textTransform: "uppercase" }}>{t.uploadCover}</span>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
              <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
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
          <div style={{ position: "fixed", bottom: isMobile ? 80 : 24, left: isMobile ? 0 : 260, right: 0, display: "flex", justifyContent: "center", zIndex: 99, pointerEvents: "none" }}>
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
                  toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
                } else if (!updatedRows || updatedRows.length === 0) {
                  console.error("Save: no rows updated");
                  toast.show(lang === "nl" ? "Opslaan mislukt" : "Save failed", "error");
                } else {
                  // Settings saved successfully
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
            {navItems.map(([k, icon, label]) => (
              <div key={k} className="nav-item" role="tab" tabIndex={0} aria-selected={view === k} onClick={() => setView(k)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(k); } }} style={{ gap: 3 }}>
                <NavIcon name={icon} size={18} color={view === k ? accent : c.textMuted} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: view === k ? accent : c.textMuted, transition: "color 0.2s", whiteSpace: "nowrap" }}>{label}</span>
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
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      <div onClick={() => { setClientMode("existing"); setClientSearch(""); }} style={{
                        flex: 1, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontSize: 11, fontWeight: 600, textAlign: "center",
                        background: clientMode === "existing" ? `${accent}18` : "transparent",
                        color: clientMode === "existing" ? accent : c.textSub,
                        border: `1px solid ${clientMode === "existing" ? `${accent}44` : c.inputBorder}`
                      }}>{t.selectClient}</div>
                      <div onClick={() => setClientMode("new")} style={{
                        flex: 1, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontSize: 11, fontWeight: 600, textAlign: "center",
                        background: clientMode === "new" ? `${accent}18` : "transparent",
                        color: clientMode === "new" ? accent : c.textSub,
                        border: `1px solid ${clientMode === "new" ? `${accent}44` : c.inputBorder}`
                      }}>{t.newClient}</div>
                    </div>
                    
                    {clientMode === "existing" ? (
                      <div>
                        <input className="input-field" placeholder={t.searchClients} value={clientSearch}
                          onChange={e => setClientSearch(e.target.value)}
                          style={{ fontSize: 13, marginBottom: 12 }} />
                        {/* Client list -- inline, not a dropdown */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                          {(() => {
                            const filtered = clientList.filter(cl => {
                              if (!clientSearch) return true;
                              const q = clientSearch.toLowerCase();
                              return (cl.first_name || "").toLowerCase().includes(q) || (cl.last_name || "").toLowerCase().includes(q) || (cl.email || "").toLowerCase().includes(q) || (cl.phone || "").includes(q);
                            }).slice(0, 10);
                            if (filtered.length === 0) return (
                              <div style={{ textAlign: "center", padding: "20px 0", color: c.textMuted, fontSize: 12 }}>
                                {lang === "nl" ? "Geen klanten gevonden" : "No clients found"}
                                <div style={{ marginTop: 8 }}>
                                  <span onClick={() => setClientMode("new")} style={{ color: accent, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>{t.newClient} →</span>
                                </div>
                              </div>
                            );
                            return filtered.map((cl, idx) => {
                              const isSelected = addApptForm.client_email === cl.email;
                              const initials = ((cl.first_name?.[0] || "") + (cl.last_name?.[0] || "")).toUpperCase();
                              return (
                                <div key={cl.id || cl.email || idx} onClick={() => {
                                  setAddApptForm(f => ({
                                    ...f,
                                    client_name: `${cl.first_name || ""} ${cl.last_name || ""}`.trim(),
                                    client_email: cl.email || "",
                                    client_phone: cl.phone || ""
                                  }));
                                  setClientSearch(`${cl.first_name || ""} ${cl.last_name || ""}`.trim());
                                }} style={{
                                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                                  background: isSelected ? `${accent}12` : c.bgCard,
                                  border: `1px solid ${isSelected ? accent : c.border}`,
                                  borderRadius: 14, cursor: "pointer", transition: "all 0.15s"
                                }}>
                                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: isSelected ? `${accent}22` : c.bgCardHover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: isSelected ? accent : c.textSub, flexShrink: 0 }}>
                                    {initials}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>{cl.first_name} {cl.last_name}</div>
                                    {(cl.email || cl.phone) && <div style={{ fontSize: 11, color: c.textLabel, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl.email}{cl.phone ? ` · ${cl.phone}` : ""}</div>}
                                  </div>
                                  {isSelected && <div style={{ width: 20, height: 20, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: c.btnOnDark, fontSize: 12 }}>✓</span></div>}
                                </div>
                              );
                            });
                          })()}
                        </div>
                        {false && addApptForm.client_email && (
                          <div></div>
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
                    const { data: existing } = await supabase.from("clients").select("id").eq("email", email).maybeSingle();
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
                    const { data: appt, error: apptError } = await supabase.from("appointments").insert(apptData).select("*").single();
                    if (apptError || !appt) {
                      toast.show(lang === "nl" ? "Fout bij het toevoegen van afspraak" : "Error adding appointment", "error");
                      setAddApptLoading(false);
                      return;
                    }
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
                  <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddAppt(false)}>{t.close}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Photo gallery overlay */}
        {gallery && (
          <div className="gallery-overlay" onClick={() => setGallery(null)} onKeyDown={e => e.key === "Escape" && setGallery(null)}>
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

// ─── STAFF APP (team member view) ─────────────────────────────

export { OwnerApp, PlanSelection, OnboardingWizard, VariantAdder, ExtraAdder, StaffAdder, LocationAdder };
export default OwnerApp;
