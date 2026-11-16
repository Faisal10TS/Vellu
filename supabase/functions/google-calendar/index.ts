// supabase/functions/google-calendar/index.ts
// Post-booking / post-cancel Google Calendar sync. Never 500s.
//
// TOEGANG (sinds 05-10-2026): alleen interne aanroepen met de header
// x-internal-secret = de service-role-sleutel (reschedule-appointment). Hiervoor
// nam hij owner_id gewoon uit de body, zonder enige controle: iedereen kon
// voor elke salon events aanmaken, verwijderen of opruimen (purge_events).
// Er is geen browser-aanroeper meer (boekingspagina en annuleerpagina riepen
// hem aan; die aanroepen zijn weg), dus ook geen CORS-"*" meer. Google Agenda
// koppelen staat uit; wie het weer aanzet, laat book-/cancel-appointment hem
// server-side aanroepen.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Geen Access-Control-Allow-Origin: een browser mag deze functie niet meer
// aanroepen.
const corsHeaders = {
  "Access-Control-Allow-Methods": "POST",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...body }), { status: 200, headers: jsonHeaders });
}
function fail(code: string, detail?: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: false, code, detail: detail ?? null }), { status, headers: jsonHeaders });
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID ?? "",
      client_secret: GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    return { ok: false as const, error: data.error || "token_refresh_failed", description: data.error_description || null };
  }
  return { ok: true as const, access_token: data.access_token as string };
}

function localIso(date: string, time: string, addMinutes = 0) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const total = h * 60 + (mi || 0) + addMinutes;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  let outY = y, outMo = mo, outD = d, outH = eh;
  if (eh >= 24) {
    const roll = new Date(Date.UTC(y, mo - 1, d));
    roll.setUTCDate(roll.getUTCDate() + Math.floor(eh / 24));
    outY = roll.getUTCFullYear();
    outMo = roll.getUTCMonth() + 1;
    outD = roll.getUTCDate();
    outH = eh % 24;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${outY}-${pad(outMo)}-${pad(outD)}T${pad(outH)}:${pad(em)}:00`;
}

// Agenda-tekst in de taal en munt van de salon (fase 3, 16-11-2026). Stond vast
// op Nederlands en "€", ook bij een Engelstalige salon of een salon op Bonaire
// die in dollars werkt. Taal: zelf gekozen (profiles.salon_lang), anders het
// land (zelfde regel als salonLangOf in send-reminders). Munt: zelfde kaart als
// CUR_BY_COUNTRY in send-emails. Bedrag zoals fmtPrice in de app: ronde
// bedragen zonder ",00" (VS ".00").
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const salonLangOf = (p: { salon_lang?: string | null; country_code?: string | null } | null) =>
  (["nl", "en", "es"].includes(String(p?.salon_lang || "")) ? String(p?.salon_lang)
    : DUTCH_COUNTRIES.has(String(p?.country_code || "NL").toUpperCase()) ? "nl" : "en");
const CUR_BY_COUNTRY: Record<string, string> = { BQ: "$", AW: "Afl. ", CW: "XCG ", SX: "XCG ", GB: "£", US: "$" };
const CAL_LABELS: Record<string, Record<string, string>> = {
  nl: { client: "Klant", email: "Email", phone: "Tel", service: "Behandeling", price: "Prijs", staff: "Medewerker", appt: "Afspraak" },
  en: { client: "Client", email: "Email", phone: "Phone", service: "Service", price: "Price", staff: "Staff", appt: "Appointment" },
  es: { client: "Cliente", email: "Correo", phone: "Tel.", service: "Servicio", price: "Precio", staff: "Empleado", appt: "Cita" },
};
const calPrice = (n: unknown, cc?: string | null) => {
  const code = String(cc || "").toUpperCase();
  const s = usAmt(CUR_BY_COUNTRY[code] || "€", n, code);
  return s.endsWith(isUsCc(code) ? ".00" : ",00") ? s.slice(0, -3) : s;
};

// Tijdzone per land, zelfde tabel als TZ_BY_COUNTRY in shared.jsx en de
// andere edge-functies. Onbekend land = Amsterdam.
const TZ_BY_COUNTRY: Record<string, string> = {
  NL: "Europe/Amsterdam", BE: "Europe/Brussels", GB: "Europe/London",
  AW: "America/Curacao", CW: "America/Curacao", BQ: "America/Curacao", SX: "America/Curacao",
  US: "America/New_York",
};
// VS (15-11-2026): meerdere tijdzones, de salon kiest er een
// (profiles.timezone). Telt alleen bij het eigen land; zelfde lijst als
// US_TIMEZONES in shared.jsx en profiles_timezone_check (samen wijzigen).
const SALON_TZS: Record<string, string[]> = {
  US: ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"],
};
const tzFor = (code?: string | null, tz?: string | null) => {
  const cc = String(code || "").toUpperCase();
  if (tz && (SALON_TZS[cc] || []).includes(tz)) return tz;
  return TZ_BY_COUNTRY[cc] || "Europe/Amsterdam";
};

// VS-opmaak (fase 2, 15-11-2026), gelijk aan src/regionFormat.js: alleen een
// salon in de VS (country_code "US") schrijft $1,234.50, 2:30 PM, 11/19/2026
// en de maand eerst. Elk ander land krijgt precies wat hier al stond, ook
// Bonaire met de dollar. Zelfde helpers (isUsCc, usAmt, usTime, usTimesIn,
// usDateLoc, usNumDate) in elke edge-functie; samen wijzigen.
const isUsCc = (cc?: unknown) => String(cc || "").toUpperCase() === "US";
// Bedrag met symbool: VS "$1,234.50" en "-$12.50"; anders "€1.234,50" en "€-12,50".
const usAmt = (sym: string, n: unknown, cc?: unknown) => {
  const v = Number(n) || 0;
  const [i, d] = Math.abs(v).toFixed(2).split(".");
  const neg = v < 0 && Number(Math.abs(v).toFixed(2)) !== 0;
  if (isUsCc(cc)) return (neg ? "-" : "") + (sym || "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + d;
  return (sym || "") + (neg ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d;
};
// Kloktijd "14:30" (of "9:00", "14:30:00") -> VS "2:30 PM"; 12:00 = "12:00 PM",
// 00:00 en 24:00 = "12:00 AM". Buiten de VS, of als het geen kale kloktijd is,
// ongewijzigd terug, zodat dubbel opmaken niets kapotmaakt.
const usTime = (hm: unknown, cc?: unknown) => {
  const s = hm == null ? "" : String(hm);
  if (!isUsCc(cc)) return s;
  const m = /^\s*(\d{1,2})[:.](\d{2})(?::\d{2})?\s*$/.exec(s);
  if (!m) return s;
  const h = Number(m[1]);
  if (h > 24 || Number(m[2]) > 59) return s;
  return `${h % 12 || 12}:${m[2]} ${h >= 12 && h < 24 ? "PM" : "AM"}`;
};
// Kloktijden IN een tekst ("10:00 - 17:30", "om 9:00") -> VS 12-uurs; alleen
// losse HH:MM die nog niet door AM/PM gevolgd worden. Anders ongewijzigd.
const usTimesIn = (text: unknown, cc?: unknown) => {
  const s = text == null ? "" : String(text);
  if (!isUsCc(cc)) return s;
  return s.replace(/(^|[^\d:.,/])([01]?\d|2[0-4]):([0-5]\d)(?![\d:]|\s?[AaPp]\.?\s?[Mm]\b)/g,
    (_all: string, pre: string, h: string, mm: string) => pre + usTime(`${h}:${mm}`, cc));
};
// Locale voor toLocale*String en Intl.DateTimeFormat: VS nl-NL / es-US / en-US,
// anders nl-NL / es-ES / en-GB.
const usDateLoc = (lang: string, cc?: unknown) => isUsCc(cc)
  ? (lang === "nl" ? "nl-NL" : lang === "es" ? "es-US" : "en-US")
  : (lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB");
// Kale datum "2026-11-19" -> VS "11/19/2026". Buiten de VS ongewijzigd terug:
// daar tonen de pushmeldingen al de ISO-datum, en dat blijft zo.
const usNumDate = (ymd: unknown, cc?: unknown) => {
  const s = ymd == null ? "" : String(ymd);
  if (!isUsCc(cc)) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : s;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", null, 405);

  // Alleen interne aanroepers, vóór we ook maar iets uit de body lezen.
  const secret = req.headers.get("x-internal-secret");
  if (!SUPABASE_SERVICE_ROLE_KEY || !secret || secret !== SUPABASE_SERVICE_ROLE_KEY) {
    return fail("unauthorized", null, 401);
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return fail("server_misconfigured");
  }

  let payload: any;
  try { payload = await req.json(); } catch { return fail("invalid_json"); }

  const { action, booking, owner_id, event_id, appointment_id } = payload || {};
  if (!owner_id || typeof owner_id !== "string") return fail("missing_owner_id");
  if (action !== "create" && action !== "delete" && action !== "whoami" && action !== "purge_events") return fail("unknown_action");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("google_refresh_token, google_calendar_connected, country_code, timezone, salon_lang")
    .eq("id", owner_id)
    .maybeSingle();

  if (profileErr) return fail("profile_lookup_failed", profileErr.message);
  if (!profile?.google_calendar_connected || !profile?.google_refresh_token) {
    return ok({ skipped: true, reason: "not_connected" });
  }

  const tok = await refreshAccessToken(profile.google_refresh_token);
  if (!tok.ok) {
    if (tok.error === "invalid_grant") {
      await supabase.from("profiles").update({
        google_calendar_connected: false,
        google_refresh_token: null,
      }).eq("id", owner_id);
      return ok({ skipped: true, reason: "invalid_grant", auto_disconnected: true });
    }
    return fail("token_refresh_failed", { error: tok.error, description: tok.description });
  }

  const accessToken = tok.access_token;

  // ─── WHOAMI ───
  // Reads an existing event from appointments table and returns its organizer.email
  // so we can tell which Google account the events are landing in. Uses only the
  // calendar.events scope we already have.
  if (action === "whoami") {
    const { data: appt } = await supabase
      .from("appointments")
      .select("google_event_id")
      .eq("owner_id", owner_id)
      .not("google_event_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!appt?.google_event_id) return ok({ skipped: true, reason: "no_events_to_inspect" });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(appt.google_event_id)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const ev = await res.json().catch(() => ({}));
    if (!res.ok) return fail("google_api_error", ev.error?.message || `HTTP ${res.status}`);
    return ok({
      organizer_email: ev.organizer?.email,
      creator_email: ev.creator?.email,
      html_link: ev.htmlLink,
    });
  }

  // ─── PURGE ───
  // Deletes every google_event_id we have on this owner's appointments. Used to
  // clean up events that landed in the wrong account before the owner reconnects.
  if (action === "purge_events") {
    const { data: appts } = await supabase
      .from("appointments")
      .select("id, google_event_id")
      .eq("owner_id", owner_id)
      .not("google_event_id", "is", null);
    let deleted = 0, missing = 0, errors = 0;
    for (const a of appts || []) {
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(a.google_event_id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (r.status === 204) deleted++;
      else if (r.status === 404 || r.status === 410) missing++;
      else errors++;
      await supabase.from("appointments").update({ google_event_id: null }).eq("id", a.id).eq("owner_id", owner_id);
    }
    return ok({ deleted, missing, errors, total: (appts || []).length });
  }

  // ─── CREATE ───
  if (action === "create") {
    if (!booking || typeof booking !== "object") return fail("missing_booking");
    if (!booking.date || !booking.time) return fail("missing_datetime");

    const duration = parseInt(booking.duration, 10) || 60;
    // date/time zijn de wandklok van de SALON. Stond vast op Amsterdam, zodat
    // een afspraak van een Caribische of Amerikaanse salon uren verschoof.
    const salonTz = tzFor(profile?.country_code, profile?.timezone);
    const startDateTime = localIso(booking.date, booking.time, 0);
    const endDateTime = localIso(booking.date, booking.time, duration);

    const L = CAL_LABELS[salonLangOf(profile)] || CAL_LABELS.nl;
    const descriptionLines = [
      `${L.client}: ${booking.client_name || ""}`,
      booking.client_email ? `${L.email}: ${booking.client_email}` : "",
      booking.client_phone ? `${L.phone}: ${booking.client_phone}` : "",
      `${L.service}: ${booking.service_name || ""}`,
      booking.price !== undefined ? `${L.price}: ${calPrice(booking.price, profile?.country_code)}` : "",
      booking.staff_name ? `${L.staff}: ${booking.staff_name}` : "",
    ].filter(Boolean);

    const event = {
      summary: `${booking.service_name || L.appt} — ${booking.client_name || ""}`.trim(),
      description: descriptionLines.join("\n"),
      start: { dateTime: startDateTime, timeZone: salonTz },
      end: { dateTime: endDateTime, timeZone: salonTz },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
    };

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    const created = await res.json().catch(() => ({}));

    if (!res.ok || created.error) {
      console.error("Calendar create error:", created.error || res.status);
      return fail("google_api_error", created.error?.message || `HTTP ${res.status}`);
    }

    if (booking.appointment_id && created.id) {
      await supabase.from("appointments")
        .update({ google_event_id: created.id })
        .eq("id", booking.appointment_id)
        .eq("owner_id", owner_id);
    }

    return ok({ event_id: created.id });
  }

  // ─── DELETE ───
  let resolvedEventId: string | null = event_id || null;
  if (!resolvedEventId && appointment_id) {
    const { data: appt } = await supabase
      .from("appointments")
      .select("google_event_id")
      .eq("id", appointment_id)
      .eq("owner_id", owner_id)
      .maybeSingle();
    resolvedEventId = appt?.google_event_id ?? null;
  }
  if (!resolvedEventId) return ok({ skipped: true, reason: "no_event_id" });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(resolvedEventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.status !== 204 && res.status !== 410 && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    return fail("google_delete_failed", `HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }

  if (appointment_id) {
    await supabase.from("appointments")
      .update({ google_event_id: null })
      .eq("id", appointment_id)
      .eq("owner_id", owner_id);
  }

  return ok({ deleted: true });
});
