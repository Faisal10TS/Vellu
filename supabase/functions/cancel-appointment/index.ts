// supabase/functions/cancel-appointment/index.ts
// Server-side appointment cancellation via token. Returns metadata (incl.
// salon accent/logo) needed for brand-coloured email notifications.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = [
  "https://vellu.cc",
  "https://www.vellu.cc",
  "https://vellu.io",
  "https://www.vellu.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Salons in these countries get Dutch-language emails, everyone else English.
// Keep in sync with COUNTRIES (defaultLang: "nl") in SRC/shared.jsx — Aruba,
// Curacao and Bonaire are Dutch-language markets too.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

const RATE_LIMIT: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT.get(ip);
  if (!entry || entry.resetAt < now) {
    RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

// IP voor de rate limit: eerst de headers die de gateway zelf zet, pas daarna
// het eerste x-forwarded-for-veld (zelfde helper als book-appointment).
function clientIp(req: Request): string {
  const h = req.headers;
  const ip = h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0];
  return String(ip || "").trim() || "unknown";
}

// ── Salontijd → UTC, voor de annuleringstermijn ─────────────────────────────
// Zelfde helpers als in send-reminders: de grens "48 uur voor aanvang" moet in
// de tijdzone van de SALON liggen — een afspraak "morgen 10:00" op Bonaire is
// een ander UTC-moment dan in Den Haag. Via Intl en niet met een vaste
// offset-tabel, want Amsterdam wisselt tussen +1 en +2 en die grens ligt elk
// jaar ergens anders.
const TZ_BY_COUNTRY: Record<string, string> = {
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  GB: "Europe/London",
  AW: "America/Curacao",
  CW: "America/Curacao",
  BQ: "America/Curacao",
  SX: "America/Curacao",
};
const tzFor = (code?: string | null) => TZ_BY_COUNTRY[code || ""] || "Europe/Amsterdam";

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

// Alle stylisten op een afspraak: de primaire, de toewijzingen per dienst en
// de delen van een teamboeking.
function stylistenVan(a: any): string[] {
  const ids = [
    a?.staff_id,
    ...Object.values(a?.staff_assignments || {}),
    ...(Array.isArray(a?.service_breakdown) ? a.service_breakdown.map((p: any) => p?.staff_id) : []),
  ].filter((x) => typeof x === "string" && x);
  return [...new Set(ids as string[])];
}

// Notify the first waiting waitlist entry for this owner+date. Best-effort:
// runs after the cancel succeeded, and swallows its own errors so a failure
// here never makes the cancel appear to fail to the client.
// Alleen een wachtende die in het vrijgekomen gat PAST: geen stylist of een
// stylist van deze afspraak, en haar behandelingen (duur uit de catalogus van
// de salon) niet langer dan de geannuleerde afspraak. Past niemand, dan krijgt
// niemand een mail — "er is een plek vrij" voor iets wat er niet in past, of
// bij een andere stylist, stuurt de klant voor niets naar de boekingspagina.
// Zelfde regel als OwnerApp.notifyWaitlistSpot en prepay-watch.
async function notifyWaitlist(appt: any, salonMeta: { name?: string; accent?: string; logo?: string; slug?: string; lang?: string }) {
  try {
    const ownerId = appt.owner_id;
    const date = appt.date;
    const { data: entries } = await supabase
      .from("waitlist")
      .select("id, client_name, client_email, staff_id, service_ids, lang, created_at")
      .eq("owner_id", ownerId)
      .eq("date", date)
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(50);
    if (!entries || entries.length === 0) return;
    const svcIds = [...new Set(entries.flatMap((e: any) => Array.isArray(e.service_ids) ? e.service_ids : []))];
    const duurVan = new Map<string, number>();
    if (svcIds.length > 0) {
      const { data: svcs } = await supabase.from("services").select("id, duration").eq("owner_id", ownerId).in("id", svcIds);
      for (const s of svcs || []) duurVan.set(s.id, parseInt(s.duration) || 0);
    }
    const vrij = parseInt(appt.service_duration) || 60;
    const stylisten = stylistenVan(appt);
    const passend = entries.filter((e: any) => {
      if (!e.client_email) return false;
      if (e.staff_id && !stylisten.includes(e.staff_id)) return false;
      const nodig = (Array.isArray(e.service_ids) ? e.service_ids : []).reduce((s: number, id: string) => s + (duurVan.get(id) || 0), 0);
      return nodig <= vrij;
    });
    let entry: any = null;
    for (const kandidaat of passend) {
      const { data: claimed, error: updErr } = await supabase
        .from("waitlist")
        .update({ status: "notified", notified_at: new Date().toISOString() })
        .eq("id", kandidaat.id)
        .eq("status", "waiting")
        .select("id");
      if (!updErr && claimed && claimed.length > 0) { entry = kandidaat; break; }
    }
    if (!entry) return;
    await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        type: "waitlist_spot_open",
        booking: {
          waitlist_id: entry.id,
          client_name: entry.client_name,
          client_email: entry.client_email,
          salon_name: salonMeta.name || "",
          salon_accent: salonMeta.accent || "",
          salon_logo: salonMeta.logo || "",
          salon_slug: salonMeta.slug || "",
          date,
          // De taal waarin de klant zich aanmeldde (waitlist.lang, sinds
          // 05-10-2026); oude rijen zonder taal: de markttaal van de salon.
          lang: ["nl", "en", "es"].includes(entry.lang) ? entry.lang : (salonMeta.lang || "nl"),
        },
      }),
    }).catch((e) => console.error("waitlist notify email failed:", e));
  } catch (e) {
    console.error("notifyWaitlist error:", e);
  }
}

// Notify the owner + assigned staff that a CLIENT cancelled. Fired SERVER-SIDE
// (not from the client browser) so it lands reliably even when the client
// closes the tab immediately after confirming the cancellation. Best-effort:
// swallows its own errors so it never makes the cancel appear to fail.
async function notifyOwnerCancellation(b: {
  owner_email?: string; staff_emails?: string[]; salon_name?: string;
  salon_accent?: string; salon_logo?: string; lang?: string;
  client_name?: string; client_phone?: string | null; service_name?: string;
  client_email?: string | null;
  date?: string; time?: string; reason?: string | null;
  staff_view_revenue?: boolean; staff_view_client_contact?: boolean;
  owner_id?: string;
}) {
  // Push-melding naar de eigenaar (sinds 2026-08-22, zie send-push-notification).
  // Los van de mail: geen abonnement = niets; een mislukte push raakt de
  // annulering niet. Bewust vóór de e-mail-check, want de push werkt ook
  // zonder owner_email.
  if (b.owner_id) {
    const nl = (b.lang || "nl") === "nl";
    fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY },
      body: JSON.stringify({
        user_id: b.owner_id,
        title: nl ? "Afspraak geannuleerd" : "Appointment cancelled",
        body: `${b.client_name || ""} · ${b.date || ""} ${b.time || ""} · ${b.service_name || ""}`.trim(),
        url: "/owner",
        tag: `cancel-${b.owner_id}-${b.date}-${b.time}`,
      }),
    }).catch((e) => console.error("owner cancellation push failed:", e));
  }
  try {
    if (!b.owner_email) return;
    await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        type: "owner_cancellation",
        booking: {
          owner_email: b.owner_email,
          staff_emails: b.staff_emails || [],
          staff_view_revenue: b.staff_view_revenue,
          staff_view_client_contact: b.staff_view_client_contact,
          client_name: b.client_name,
          // Reply-To van deze melding: een antwoord van de salon is voor de
          // klant bedoeld (send-emails ownerReplyFor), niet voor haar eigen adres.
          client_email: b.client_email || "",
          client_phone: b.client_phone || null,
          service_name: b.service_name,
          date: b.date,
          time: b.time,
          reason: b.reason || "",
          salon_name: b.salon_name || "",
          salon_accent: b.salon_accent || "",
          salon_logo: b.salon_logo || "",
          lang: b.lang || "nl",
          // send-emails renders owner-facing mails from owner_lang; keep lang
          // too so older send-emails versions stay compatible.
          owner_lang: b.lang || "nl",
        },
      }),
    }).catch((e) => console.error("owner cancellation email failed:", e));
  } catch (e) {
    console.error("notifyOwnerCancellation error:", e);
  }
}

// Client-facing "your appointment is cancelled" email + SMS. The cancel page
// is used by the anonymous customer, so their browser can't call send-emails /
// send-sms (it 401s) — these MUST be sent server-side. send-sms silently
// no-ops for non-Pro salons / invalid phones. Best-effort, fire-and-forget.
async function notifyClientCancellation(b: {
  client_email?: string; client_phone?: string | null; owner_id?: string;
  salon_name?: string; salon_accent?: string; salon_logo?: string; lang?: string;
  salon_email?: string; service_name?: string; date?: string; time?: string;
}) {
  const internalHeaders = { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY };
  const base = {
    client_name: undefined as unknown,
    service_name: b.service_name,
    date: b.date,
    time: b.time,
    salon_name: b.salon_name || "",
    salon_accent: b.salon_accent || "",
    salon_logo: b.salon_logo || "",
    // Reply-To so the client's cancellation email routes to the salon.
    salon_email: b.salon_email || "",
    // De klant zegt hier zelf af: de mail bevestigt dat. Annuleert de salon
    // (OwnerApp.cancelAppt), dan stuurt die "salon" en krijgt de klant een
    // andere tekst.
    cancelled_by: "client",
    lang: b.lang || "nl",
  };
  try {
    if (b.client_email) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({ type: "booking_cancelled", booking: { ...base, client_email: b.client_email } }),
      }).catch((e) => console.error("client cancellation email failed:", e));
    }
    if (b.client_phone && b.owner_id) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({
          type: "booking_cancelled",
          booking: {
            client_phone: b.client_phone,
            service_name: b.service_name,
            date: b.date,
            time: b.time,
            salon_name: b.salon_name || "",
            owner_id: b.owner_id,
            lang: b.lang || "nl",
          },
        }),
      }).catch((e) => console.error("client cancellation SMS failed:", e));
    }
  } catch (e) {
    console.error("notifyClientCancellation error:", e);
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  const ip = clientIp(req);
  if (!rateLimit(ip)) return json(429, { error: "rate_limited" }, origin);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" }, origin);
  }

  const { action, token, reason } = payload || {};
  if (!token || typeof token !== "string") return json(400, { error: "missing_token" }, origin);
  if (token.length < 16 || token.length > 128) return json(400, { error: "invalid_token_format" }, origin);

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("cancellation_tokens")
    .select("*, appointments(*)")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr || !tokenRow) return json(404, { error: "token_not_found" }, origin);

  const appt = tokenRow.appointments;
  if (!appt) return json(404, { error: "appointment_not_found" }, origin);

  // Profiel altijd ophalen (was: alleen op het check-pad, voor het valutasymbool).
  // De annuleringstermijn moet op BEIDE paden gelden: wie de pagina al open had
  // staan vóór de grens, mag hem niet alsnog passeren met de knop.
  let cc = "NL";
  let deadlineHours = 0;
  let salonPhone: string | null = null;
  let salonNaam = "";
  let salonSlugPub = "";
  if (appt.owner_id) {
    const { data: o } = await supabase.from("profiles")
      .select("country_code, cancel_deadline_hours, salon_phone, business_name, slug")
      .eq("id", appt.owner_id).maybeSingle();
    cc = o?.country_code || "NL";
    deadlineHours = parseInt(String(o?.cancel_deadline_hours ?? 0)) || 0;
    salonPhone = o?.salon_phone || null;
    salonNaam = o?.business_name || "";
    salonSlugPub = o?.slug || "";
  }
  // Naam en slug van de salon (publiek, geen e-mailadressen) zodat de
  // annuleerpagina de salon kan noemen en terug kan linken.
  const salonBits = { salon_name: salonNaam, salon_slug: salonSlugPub };

  if (tokenRow.used === true || appt.status === "cancelled") {
    // Ook op het annuleerpad een gewoon "al geannuleerd" in plaats van een
    // foutcode: een tweede tik of een pagina die nog openstond is geen fout.
    // Er gaat dan niets meer de deur uit.
    return json(200, { status: "already_cancelled", appointment: sanitize(appt), country_code: cc, ...salonBits }, origin);
  }

  // Afgerond of no-show: de afspraak is geweest. Annuleren zou hem uit de omzet
  // en de no-show-telling halen. De pagina toont dan hetzelfde als een
  // verlopen link ("de afspraak is inmiddels geweest").
  if (appt.status !== "confirmed" && appt.status !== "pending_payment") {
    if (action === "check") {
      return json(200, { status: "expired", appointment: sanitize(appt), country_code: cc, ...salonBits }, origin);
    }
    return json(410, { error: "not_cancellable" }, origin);
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    if (action === "check") {
      return json(200, { status: "expired", appointment: sanitize(appt), country_code: cc, ...salonBits }, origin);
    }
    return json(410, { error: "expired" }, origin);
  }

  // Annuleringstermijn van de salon (0 = altijd annuleerbaar, het oude gedrag).
  // Binnen de termijn kan de klant alleen nog telefonisch annuleren; daarom gaan
  // telefoonnummer en salonnaam mee terug, zodat de pagina een belknop kan
  // tonen in plaats van een kale weigering. Ontbreekt datum of tijd op de
  // afspraak, dan blokkeren we bewust NIET: liever een annulering te veel dan
  // een klant die een geldige annulering nergens kwijt kan.
  if (deadlineHours > 0 && appt.date && appt.time) {
    const startUtc = localToUtc(String(appt.date), String(appt.time), tzFor(cc));
    if (startUtc && Date.now() > startUtc.getTime() - deadlineHours * 3_600_000) {
      if (action === "check") {
        return json(200, {
          status: "too_late", appointment: sanitize(appt), country_code: cc,
          deadline_hours: deadlineHours, salon_phone: salonPhone, ...salonBits,
        }, origin);
      }
      return json(403, { error: "too_late_to_cancel", deadline_hours: deadlineHours, salon_phone: salonPhone, ...salonBits }, origin);
    }
  }

  if (action === "check") {
    return json(200, { status: "valid", appointment: sanitize(appt), country_code: cc, ...salonBits }, origin);
  }

  const cleanReason = reason ? String(reason).trim().slice(0, 500) : null;

  // Atomisch claimen: alleen een afspraak die NU nog bevestigd of gereserveerd
  // is, gaat naar 'cancelled'. Twee keer snel op de knop (of de salon die
  // tegelijk annuleert) gaf eerst twee keer alle mails, SMS en push; nu raakt
  // alleen de eerste update een rij en meldt alleen die iets.
  const { data: hit, error: upErr } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: cleanReason,
    })
    .eq("id", appt.id)
    .in("status", ["confirmed", "pending_payment"])
    .select("id");
  if (upErr) return json(500, { error: "cancel_failed" }, origin);

  // Token in dezelfde stap dicht, ook als een ander ons voor was.
  await supabase.from("cancellation_tokens").update({ used: true }).eq("token", token);

  if (!hit || hit.length === 0) {
    const { data: nu } = await supabase.from("appointments").select("status").eq("id", appt.id).maybeSingle();
    if (nu?.status === "cancelled") {
      return json(200, { status: "already_cancelled", appointment: sanitize({ ...appt, status: "cancelled" }), country_code: cc, ...salonBits }, origin);
    }
    return json(410, { error: "not_cancellable" }, origin);
  }

  const notify: { owner_email?: string; staff_emails?: string[]; salon_name?: string; salon_accent?: string; salon_logo?: string; owner_id?: string; lang?: string; staff_view_revenue?: boolean; staff_view_client_contact?: boolean } = {};
  let salonSlug = "";
  let waitlistEnabled = true;
  if (appt.owner_id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("email, salon_email, business_name, accent_color, logo_url, slug, waitlist_enabled, country_code, staff_view_revenue, staff_view_client_contact")
      .eq("id", appt.owner_id)
      .maybeSingle();
    if (owner) {
      notify.owner_email = owner.salon_email || owner.email || undefined;
      notify.salon_name = owner.business_name;
      notify.salon_accent = owner.accent_color || "";
      notify.salon_logo = owner.logo_url || "";
      notify.owner_id = appt.owner_id;
      notify.staff_view_revenue = owner.staff_view_revenue;
      notify.staff_view_client_contact = owner.staff_view_client_contact;
      // Dutch for the Dutch-language markets, English elsewhere. Falls back to
      // Dutch when country_code is unset (old rows), matching send-reminders.
      notify.lang = DUTCH_COUNTRIES.has(owner.country_code || "NL") ? "nl" : "en";
      salonSlug = owner.slug || "";
      waitlistEnabled = owner.waitlist_enabled !== false;
    }
  }
  // Elke stylist op de afspraak krijgt de melding, niet alleen de primaire: bij
  // een teamboeking hoorde de tweede stylist anders nooit dat haar deel vrijkwam.
  const stylisten = stylistenVan(appt);
  if (stylisten.length > 0 && appt.owner_id) {
    const { data: staffRows } = await supabase
      .from("staff_members")
      .select("email, active")
      .eq("owner_id", appt.owner_id)
      .in("id", stylisten);
    notify.staff_emails = [...new Set((staffRows || [])
      .filter((s: any) => s.active !== false && String(s.email || "").trim())
      .map((s: any) => String(s.email).trim()))];
  }

  // Fire all cancellation notifications and AWAIT them before returning.
  // Supabase's edge runtime tears the isolate down as soon as the HTTP
  // response is returned, so anything left fire-and-forget here (the owner's
  // "client cancelled" email, the client's confirmation email + SMS, the
  // waitlist ping) was being killed mid-flight — which is why salons stopped
  // receiving the cancellation email even though this code path existed.
  // book-appointment already awaits its sends, which is why NEW-booking
  // notifications arrive reliably but cancellations did not. Each helper
  // swallows its own errors, so Promise.all never rejects and a slow/failed
  // email can't make the cancel itself appear to fail.
  await Promise.all([
    // Owner + assigned staff: "your client cancelled".
    notifyOwnerCancellation({
      owner_id: appt.owner_id,
      owner_email: notify.owner_email,
      staff_emails: notify.staff_emails,
      staff_view_revenue: notify.staff_view_revenue,
      staff_view_client_contact: notify.staff_view_client_contact,
      salon_name: notify.salon_name,
      salon_accent: notify.salon_accent,
      salon_logo: notify.salon_logo,
      lang: notify.lang,
      client_name: appt.client_name,
      client_email: appt.client_email || null,
      client_phone: appt.client_phone || null,
      service_name: appt.service_name,
      date: appt.date,
      time: appt.time,
      reason: cleanReason,
    }),
    // Client-facing cancellation confirmation (email + SMS) — in the language
    // the CLIENT booked in (stored on the appointment row), falling back to
    // the salon's market language for old rows without one.
    notifyClientCancellation({
      client_email: appt.client_email,
      client_phone: appt.client_phone || null,
      owner_id: appt.owner_id,
      salon_name: notify.salon_name,
      salon_accent: notify.salon_accent,
      salon_logo: notify.salon_logo,
      salon_email: notify.owner_email,
      lang: ["nl", "en", "es"].includes(appt.lang) ? appt.lang : notify.lang,
      service_name: appt.service_name,
      date: appt.date,
      time: appt.time,
    }),
    // Waitlist notify — skipped when the salon disabled the feature.
    (waitlistEnabled && appt.owner_id && appt.date)
      ? notifyWaitlist(appt, {
          name: notify.salon_name,
          accent: notify.salon_accent,
          logo: notify.salon_logo,
          slug: salonSlug,
          lang: notify.lang,
        })
      : Promise.resolve(),
  ]);

  // Geen `notify` meer in het antwoord: dat bevatte het adres van de eigenaar
  // en de stylist, en deze pagina is anoniem. Alle meldingen gingen hierboven
  // al server-side.
  return json(200, {
    status: "cancelled",
    appointment: sanitize(appt),
    country_code: cc,
    ...salonBits,
  }, origin);
});

function sanitize(a: any) {
  return {
    id: a.id,
    date: a.date,
    time: a.time,
    service_name: a.service_name,
    service_price: a.service_price,
    client_name: a.client_name,
    client_email: a.client_email,
    status: a.status,
    owner_id: a.owner_id,
    staff_id: a.staff_id,
  };
}
