// supabase/functions/prepay-watch/index.ts
//
// Vooruitbetalen, de waker. Een klant die bij het boeken "Vooruitbetalen" koos
// staat in de agenda als RESERVERING (appointments.status = 'pending_payment')
// met een betaaltermijn (payment_due_at). De salon zet hem in de app op
// "Betaling ontvangen" zodra het geld er is. Deze functie draait elk uur
// (pg_cron, prepay-watch-hourly) en doet de rest:
//
//   1. HERINNERING — zes uur voor de termijn nog niet betaald? Eén mail met het
//      betaalblok (prepay_reminded_at voorkomt een tweede). Alleen als de
//      termijn ruim was (≥ 12 uur); bij een korte termijn (afspraak morgen) is
//      "over zes uur vervalt hij" geen herinnering meer maar een verrassing.
//   2. VERVALLEN — termijn verstreken? status → cancelled (cancellation_reason
//      'prepay_expired'), annuleerlink dicht, klant krijgt uitleg + boekknop,
//      salon een mail + push, en de eerste wachtende op de wachtlijst hoort dat
//      er een plek vrij is (zelfde claim-en-mail als OwnerApp.notifyWaitlistSpot).
//
// Idempotent: elke stap claimt eerst (update ... where status/stempel nog oud)
// en mailt pas als de claim raak was. Twee keer draaien = niets dubbel.
//
// TOEGANG: verify_jwt=false zoals de andere cron-functies (check-pending-
// payments). Bewust geen geheim: een vreemde kan er hooguit de veegronde mee
// vervroegen, en die doet alleen wat over een uur toch zou gebeuren.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MAX_PER_RUN = 50;
const REMIND_BEFORE_MS = 6 * 3600000;
const MIN_WINDOW_FOR_REMINDER_MS = 12 * 3600000;

const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const TZ_BY_COUNTRY: Record<string, string> = {
  NL: "Europe/Amsterdam", BE: "Europe/Brussels", GB: "Europe/London",
  AW: "America/Curacao", CW: "America/Curacao", BQ: "America/Curacao", SX: "America/Curacao",
};
const tzFor = (code?: string | null) => TZ_BY_COUNTRY[code || ""] || "Europe/Amsterdam";
// Salontijd → UTC, letterlijk dezelfde helpers als book-/cancel-appointment.
function tzOffsetMs(at: Date, tz: string) {
  try {
    const p: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at)) p[part.type] = part.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - at.getTime();
  } catch { return 0; } // onbekende zone: liever de oude UTC-aanname dan crashen
}
function localToUtc(dateStr: string, timeStr: string, tz: string) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  if (isNaN(naive.getTime())) return null;
  // Twee rondes, gelijk aan src/shared.jsx en send-reminders: met één ronde lag
  // 01:00-02:00 op de wisselnacht van de zomertijd een uur verkeerd.
  const guess = new Date(naive.getTime() - tzOffsetMs(naive, tz));
  return new Date(naive.getTime() - tzOffsetMs(guess, tz));
}
// Spiegelt shared.jsx CURRENCIES. CW/SX = Caribische gulden; Vellu toont de
// ISO-code "XCG", niet het CBCS-symbool "Cg" (Faisal, 24-09-2026).
const CUR: Record<string, string> = { BQ: "$", AW: "Afl. ", CW: "XCG ", SX: "XCG ", GB: "£" };
const clientLang = (apptLang: unknown, country: unknown) => {
  const l = String(apptLang || "").toLowerCase();
  if (l === "nl" || l === "en" || l === "es") return l;
  return DUTCH_COUNTRIES.has(String(country || "NL").toUpperCase()) ? "nl" : "en";
};
const ownerLang = (country: unknown) => DUTCH_COUNTRIES.has(String(country || "NL").toUpperCase()) ? "nl" : "en";
const fmtDue = (iso: string, l: string, tz: string) => {
  try {
    return new Date(iso).toLocaleString(l === "es" ? "es-ES" : l === "en" ? "en-GB" : "nl-NL",
      { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

async function recordHealth(status: string, ms: number, processed: number, err: string | null) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "prepay-watch",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* logtabel mag nooit de run laten falen */ }
}

const internalHeaders = { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY };
const sendMail = (type: string, booking: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/functions/v1/send-emails`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ type, booking }) })
    .then(async (r) => { if (!r.ok) console.error(`send-emails ${type} → ${r.status}`, await r.text().catch(() => "")); })
    .catch((e) => console.error(`send-emails ${type} failed:`, e));

const SELECT = "id, owner_id, date, time, service_name, service_price, service_duration, client_name, client_email, client_phone, lang, payment_due_at, created_at, staff_id, staff_assignments, service_breakdown, profiles(business_name, slug, accent_color, logo_url, salon_email, email, country_code, iban, iban_holder, payment_link, staff_view_client_contact, waitlist_enabled)";

// Betaalgegevens van een reservering (Esther/TTNB 25-09-2026): staat er precies
// één teamlid op en heeft zij eigen IBAN/betaallink, dan haar rekening — anders
// die van de salon. Zelfde regel als book-appointment (stap 12a), zodat de
// herinnering dezelfde rekening noemt als de boekingsbevestiging.
async function payDetailsFor(a: any, p: any) {
  const ids = Array.from(new Set([a.staff_id, ...Object.values(a.staff_assignments || {})].filter(Boolean))) as string[];
  if (ids.length === 1) {
    const { data: s } = await supabase.from("staff_members").select("name, iban, iban_holder, payment_link").eq("id", ids[0]).eq("owner_id", a.owner_id).maybeSingle();
    if (s && (String(s.iban || "").trim() || String(s.payment_link || "").trim())) {
      return { payment_link: s.payment_link || "", iban: s.iban || "", iban_holder: s.iban_holder || s.name || "" };
    }
  }
  return { payment_link: p.payment_link || "", iban: p.iban || "", iban_holder: p.iban_holder || "" };
}

// Alles wat de mails nodig hebben, uit één rij (met de salon erbij gejoind).
function baseOf(a: any) {
  const p = a.profiles || {};
  const cc = p.country_code || "NL";
  const lang = clientLang(a.lang, cc);
  return {
    lang,
    oLang: ownerLang(cc),
    tz: tzFor(cc),
    booking: {
      client_name: a.client_name,
      client_email: a.client_email,
      client_phone: a.client_phone,
      service_name: a.service_name,
      date: a.date,
      time: String(a.time || "").slice(0, 5),
      price: a.service_price,
      salon_name: p.business_name,
      salon_accent: p.accent_color || "",
      salon_logo: p.logo_url || "",
      salon_email: p.salon_email || p.email || "",
      salon_slug: p.slug || "",
      currency: CUR[cc] || "€",
      lang,
      owner_lang: ownerLang(cc),
      staff_view_client_contact: p.staff_view_client_contact,
    },
    ownerEmail: p.salon_email || p.email || null,
    ownerId: a.owner_id,
    waitlistOn: p.waitlist_enabled !== false,
  };
}

// Alle stylisten op een reservering: de primaire, de toewijzingen per dienst en
// de delen van een teamboeking (zelfde als cancel-appointment).
function stylistenVan(a: any): string[] {
  const ids = [
    a?.staff_id,
    ...Object.values(a?.staff_assignments || {}),
    ...(Array.isArray(a?.service_breakdown) ? a.service_breakdown.map((p: any) => p?.staff_id) : []),
  ].filter((x) => typeof x === "string" && x);
  return [...new Set(ids as string[])];
}

// Elke (actieve) stylist op de boeking krijgt de salonkopie, niet alleen de
// primaire.
async function staffEmailsFor(a: any) {
  const ids = stylistenVan(a);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("staff_members").select("email, active").in("id", ids).eq("owner_id", a.owner_id);
  return [...new Set((data || [])
    .filter((s: any) => s.active !== false && String(s.email || "").trim())
    .map((s: any) => String(s.email).trim()))];
}

// Eerste wachtende voor die dag die in het vrijgekomen gat PAST (geen stylist
// of een stylist van deze reservering, en haar behandelingen niet langer dan
// de vervallen afspraak): eerst claimen (status → notified), dan mailen. Past
// niemand, dan mailt niemand. Zelfde regel als cancel-appointment en
// OwnerApp.notifyWaitlistSpot.
async function notifyWaitlist(a: any, b: ReturnType<typeof baseOf>) {
  try {
    if (!b.waitlistOn) return;
    const { data: entries } = await supabase.from("waitlist").select("id, client_name, client_email, staff_id, service_ids, lang, created_at")
      .eq("owner_id", a.owner_id).eq("date", a.date).eq("status", "waiting")
      .order("created_at", { ascending: true }).limit(50);
    if (!entries || entries.length === 0) return;
    const svcIds = [...new Set(entries.flatMap((e: any) => Array.isArray(e.service_ids) ? e.service_ids : []))];
    const duurVan = new Map<string, number>();
    if (svcIds.length > 0) {
      const { data: svcs } = await supabase.from("services").select("id, duration").eq("owner_id", a.owner_id).in("id", svcIds);
      for (const s of svcs || []) duurVan.set(s.id, parseInt(s.duration) || 0);
    }
    const vrij = parseInt(a.service_duration) || 60;
    const stylisten = stylistenVan(a);
    const passend = entries.filter((e: any) => {
      if (!e.client_email) return false;
      if (e.staff_id && !stylisten.includes(e.staff_id)) return false;
      const nodig = (Array.isArray(e.service_ids) ? e.service_ids : []).reduce((s: number, id: string) => s + (duurVan.get(id) || 0), 0);
      return nodig <= vrij;
    });
    let entry: any = null;
    for (const kandidaat of passend) {
      const { data: claimed } = await supabase.from("waitlist")
        .update({ status: "notified", notified_at: new Date().toISOString() })
        .eq("id", kandidaat.id).eq("status", "waiting").select("id");
      if (claimed && claimed.length > 0) { entry = kandidaat; break; }
    }
    if (!entry) return;
    // De taal waarin de klant zich aanmeldde (waitlist.lang); oude rijen zonder
    // taal: de markttaal van de salon.
    await sendMail("waitlist_spot_open", {
      ...b.booking,
      waitlist_id: entry.id,
      client_name: entry.client_name, client_email: entry.client_email, client_phone: null,
      lang: ["nl", "en", "es"].includes(entry.lang) ? entry.lang : b.oLang,
    });
  } catch (e) { console.error("waitlist notify failed:", e); }
}

serve(async () => {
  const t0 = Date.now();
  let processed = 0;
  try {
    const nowIso = new Date().toISOString();

    // ── 2. Vervallen ────────────────────────────────────────────────────────
    // Ruimer ophalen dan we verwerken: rijen die we hieronder bewust overslaan
    // (termijn niet vóór de start) mogen de echte vervallers niet verdringen.
    const { data: expiredRaw, error: e1 } = await supabase.from("appointments").select(SELECT)
      .eq("status", "pending_payment").lte("payment_due_at", nowIso)
      .order("payment_due_at", { ascending: true }).limit(MAX_PER_RUN * 4);
    if (e1) throw e1;
    // Nooit een reservering laten vervallen waarvan de termijn pas op of na de
    // start viel (zo kort voor de afspraak geboekt of verplaatst): die klant
    // kon niet op tijd betalen en zit misschien al in de stoel. De salon rondt
    // hem zelf af (betaald, afgerond of no-show).
    const expired = (expiredRaw || []).filter((a: any) => {
      const start = a.date && a.time ? localToUtc(String(a.date), String(a.time).slice(0, 5), tzFor(a.profiles?.country_code)) : null;
      return !(start && new Date(a.payment_due_at).getTime() >= start.getTime());
    }).slice(0, MAX_PER_RUN);
    for (const a of expired) {
      const { data: hit, error } = await supabase.from("appointments")
        .update({ status: "cancelled", cancelled_at: nowIso, cancellation_reason: "prepay_expired" })
        .eq("id", a.id).eq("status", "pending_payment").select("id");
      if (error || !hit || hit.length === 0) continue; // iemand was ons voor (betaald of geannuleerd)
      processed++;
      await supabase.from("cancellation_tokens").update({ used: true }).eq("appointment_id", a.id).not("used", "is", true);
      const b = baseOf(a);
      const staffEmails = await staffEmailsFor(a);
      if (a.client_email) {
        await sendMail("prepay_expired", {
          ...b.booking,
          due_text: fmtDue(a.payment_due_at, b.lang, b.tz),
          due_text_owner: fmtDue(a.payment_due_at, b.oLang, b.tz),
          owner_email: b.ownerEmail, staff_emails: staffEmails,
        });
      }
      await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: "POST", headers: internalHeaders,
        body: JSON.stringify({
          user_id: a.owner_id,
          title: b.oLang === "nl" ? "Reservering vervallen" : "Reservation expired",
          body: `${a.client_name} · ${a.date} ${String(a.time || "").slice(0, 5)} · ${a.service_name}`,
          url: "/owner", tag: `prepay-expired-${a.id}`,
        }),
      }).catch((e) => console.error("push failed:", e));
      await notifyWaitlist(a, b);
    }

    // ── 1. Herinnering ──────────────────────────────────────────────────────
    const soon = new Date(Date.now() + REMIND_BEFORE_MS).toISOString();
    const { data: due, error: e2 } = await supabase.from("appointments").select(SELECT)
      .eq("status", "pending_payment").is("prepay_reminded_at", null)
      .gt("payment_due_at", nowIso).lte("payment_due_at", soon)
      .order("payment_due_at", { ascending: true }).limit(MAX_PER_RUN);
    if (e2) throw e2;
    for (const a of due || []) {
      if (!a.client_email) continue;
      const windowMs = new Date(a.payment_due_at).getTime() - new Date(a.created_at).getTime();
      const patch = { prepay_reminded_at: nowIso };
      const { data: hit } = await supabase.from("appointments").update(patch)
        .eq("id", a.id).eq("status", "pending_payment").is("prepay_reminded_at", null).select("id");
      if (!hit || hit.length === 0) continue;
      if (windowMs < MIN_WINDOW_FOR_REMINDER_MS) continue; // korte termijn: stempel wel, mail niet
      processed++;
      const b = baseOf(a);
      const p = a.profiles || {};
      const pay = await payDetailsFor(a, p);
      await sendMail("prepay_reminder", {
        ...b.booking,
        payment_link: pay.payment_link, salon_iban: pay.iban, iban_holder: pay.iban_holder,
        payment_ref: `${p.business_name} ${a.date} ${String(a.time || "").slice(0, 5)}`.slice(0, 100),
        due_text: fmtDue(a.payment_due_at, b.lang, b.tz),
      });
    }

    await recordHealth("success", Date.now() - t0, processed, null);
    return new Response(JSON.stringify({ ok: true, expired: expired.length, reminders: (due || []).length, processed }),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("prepay-watch failed:", e);
    await recordHealth("error", Date.now() - t0, processed, (e as Error)?.message || String(e));
    return new Response(JSON.stringify({ error: (e as Error)?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
