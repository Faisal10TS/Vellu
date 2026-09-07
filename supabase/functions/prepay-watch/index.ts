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
const CUR: Record<string, string> = { BQ: "$", AW: "Afl. ", CW: "Cg ", SX: "Cg ", GB: "£" };
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

const SELECT = "id, owner_id, date, time, service_name, service_price, client_name, client_email, client_phone, lang, payment_due_at, created_at, staff_id, profiles(business_name, slug, accent_color, logo_url, salon_email, email, country_code, iban, iban_holder, payment_link, staff_view_client_contact, waitlist_enabled)";

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

async function staffEmailsFor(ownerId: string, staffId: string | null) {
  if (!staffId) return [];
  const { data } = await supabase.from("staff_members").select("email").eq("id", staffId).eq("owner_id", ownerId).maybeSingle();
  return data?.email ? [data.email] : [];
}

// Eerste wachtende voor die dag: eerst claimen (status → notified), dan mailen.
async function notifyWaitlist(a: any, b: ReturnType<typeof baseOf>) {
  try {
    if (!b.waitlistOn) return;
    const { data: entries } = await supabase.from("waitlist").select("id, client_name, client_email")
      .eq("owner_id", a.owner_id).eq("date", a.date).eq("status", "waiting")
      .order("created_at", { ascending: true }).limit(1);
    const entry = entries?.[0];
    if (!entry?.client_email) return;
    const { data: claimed } = await supabase.from("waitlist")
      .update({ status: "notified", notified_at: new Date().toISOString() })
      .eq("id", entry.id).eq("status", "waiting").select("id");
    if (!claimed || claimed.length === 0) return;
    // De wachtlijst slaat geen klanttaal op; de markttaal van de salon is het
    // beste signaal (zelfde keuze als cancel-appointment.notifyWaitlist).
    await sendMail("waitlist_spot_open", {
      ...b.booking,
      client_name: entry.client_name, client_email: entry.client_email, client_phone: null,
      lang: b.oLang,
    });
  } catch (e) { console.error("waitlist notify failed:", e); }
}

serve(async () => {
  const t0 = Date.now();
  let processed = 0;
  try {
    const nowIso = new Date().toISOString();

    // ── 2. Vervallen ────────────────────────────────────────────────────────
    const { data: expired, error: e1 } = await supabase.from("appointments").select(SELECT)
      .eq("status", "pending_payment").lte("payment_due_at", nowIso)
      .order("payment_due_at", { ascending: true }).limit(MAX_PER_RUN);
    if (e1) throw e1;
    for (const a of expired || []) {
      const { data: hit, error } = await supabase.from("appointments")
        .update({ status: "cancelled", cancelled_at: nowIso, cancellation_reason: "prepay_expired" })
        .eq("id", a.id).eq("status", "pending_payment").select("id");
      if (error || !hit || hit.length === 0) continue; // iemand was ons voor (betaald of geannuleerd)
      processed++;
      await supabase.from("cancellation_tokens").update({ used: true }).eq("appointment_id", a.id).not("used", "is", true);
      const b = baseOf(a);
      const staffEmails = await staffEmailsFor(a.owner_id, a.staff_id);
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
      await sendMail("prepay_reminder", {
        ...b.booking,
        payment_link: p.payment_link || "", salon_iban: p.iban || "", iban_holder: p.iban_holder || "",
        payment_ref: `${p.business_name} ${a.date} ${String(a.time || "").slice(0, 5)}`.slice(0, 100),
        due_text: fmtDue(a.payment_due_at, b.lang, b.tz),
      });
    }

    await recordHealth("success", Date.now() - t0, processed, null);
    return new Response(JSON.stringify({ ok: true, expired: (expired || []).length, reminders: (due || []).length, processed }),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("prepay-watch failed:", e);
    await recordHealth("error", Date.now() - t0, processed, (e as Error)?.message || String(e));
    return new Response(JSON.stringify({ error: (e as Error)?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
