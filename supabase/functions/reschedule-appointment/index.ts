// reschedule-appointment — owner moves an existing appointment to a new
// date/time (optionally new staff). verify_jwt:false + in-function Bearer
// validation. Rate limited at 30 requests/min per IP — owner-only action
// that's expensive (conflict check + email + optional GCal sync).
//
// v7: availability is no longer judged on the salon's business_hours alone.
// Team salons keep those mostly "closed" and schedule per STAFF member
// (working_hours), so v6 rejected e.g. a Monday 12:00 slot with
// outside_hours even though the stylist works Mondays. Now mirrors the
// booking flow: staff_day_overrides blocks reject the slot, exception rows
// replace the weekly schedule, and team accounts validate against the
// assigned stylist's working hours (union of active staff when unassigned).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || SUPABASE_SERVICE_KEY;

const ALLOWED = [
  "https://vellu.cc",
  "https://www.vellu.cc",
  "https://vellu.io",
  "https://www.vellu.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

function cors(origin: string | null) {
  const a = origin && ALLOWED.includes(origin) ? origin : "https://vellu.cc";
  return {
    "Access-Control-Allow-Origin": a,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function err(status: number, code: string, origin: string | null, detail?: unknown) {
  return new Response(JSON.stringify({ error: code, detail: detail ?? null }), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
function ok(body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), { status: 200, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
// Midday break (middagpauze): optional break_start/break_end on a weekday
// split the day into two segments; the whole appointment must fit inside one.
// Days without the keys always pass. Mirrors book-appointment.
function fitsMiddayBreak(day: { break_start?: string; break_end?: string } | null | undefined, startMin: number, endMin: number) {
  if (!day?.break_start || !day?.break_end) return true;
  const bs = toMinutes(day.break_start);
  const be = toMinutes(day.break_end);
  return endMin <= bs || startMin >= be;
}

const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 30;
function rateLimit(ip: string) {
  const now = Date.now();
  const e = RATE_LIMIT.get(ip);
  if (!e || e.resetAt < now) { RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (e.count >= RATE_MAX) return false;
  e.count++;
  return true;
}

// IP voor de rate limit: eerst de headers die de gateway zelf zet, pas daarna
// het eerste x-forwarded-for-veld (zelfde helper als book-appointment).
function clientIp(req: Request): string {
  const h = req.headers;
  const ip = h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0];
  return String(ip || "").trim() || "unknown";
}

// Vensters die een bestaande afspraak bezet; een teamboeking per stylist
// alleen haar eigen deel. Letterlijk dezelfde regel als book-appointment.
function vensterVanBestaande(e: any, breakMin: number): { staffId: string | null; start: number; end: number }[] {
  const start = toMinutes(String(e.time || "00:00"));
  const parts = Array.isArray(e.service_breakdown) ? e.service_breakdown.filter((p: any) => p && typeof p === "object") : [];
  if (parts.some((p: any) => p.staff_id)) {
    return parts.map((p: any) => {
      const s = start + (parseInt(p.offset_min) || 0);
      const raw = parseInt(p.duration);
      const dur = Number.isFinite(raw) ? raw : parseInt(e.service_duration);
      return { staffId: p.staff_id || null, start: s, end: s + (dur || 60) + breakMin };
    });
  }
  return [{ staffId: e.staff_id || null, start, end: start + (parseInt(e.service_duration || 60) || 60) + breakMin }];
}

// Kassaverkopen bezetten geen tijdslot (oude rijen zonder is_sale-vlag
// structureel herkend), zelfde als book-appointment.
const isVerkoopRij = (e: any) =>
  e?.is_sale === true ||
  (!e?.service_id && (parseInt(e?.service_duration) || 0) === 0 && Array.isArray(e?.products) && e.products.length > 0);

// ── Salontijd → UTC ─────────────────────────────────────────────────────────
// Letterlijk dezelfde helpers als in book-/cancel-appointment: datum en tijd
// staan in de tijdzone van de SALON. Nodig om de annuleerlink en de
// betaaltermijn mee te verplaatsen.
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

// Salons in deze landen krijgen Nederlandstalige mails (zelfde set als
// cancel-appointment); de klant zelf krijgt de taal waarin ze boekte.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
// Spiegelt shared.jsx CURRENCIES (zelfde tabel als book-appointment).
const CUR: Record<string, string> = { BQ: "$", AW: "Afl. ", CW: "XCG ", SX: "XCG ", GB: "£" };

async function verifyUser(tok: string): Promise<string | null> {
  if (!tok) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${tok}`, "apikey": ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id || null;
  } catch { return null; }
}

// De klantmail ("je afspraak is verplaatst") gaat sinds 05-10-2026 via
// send-emails type appointment_updated: in de taal waarin de klant boekte, met
// het logo en de kleur van de salon en ge-escapete waarden. De eigen,
// alleen-Nederlandse Resend-sjabloon die hier stond is weg.
async function sendRescheduleMail(booking: Record<string, unknown>) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY },
      body: JSON.stringify({ type: "appointment_updated", booking }),
    });
    if (!r.ok) console.error("reschedule mail failed:", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) { console.error("reschedule mail failed:", e); return false; }
}

// google-calendar neemt sinds 05-10-2026 alleen nog interne aanroepen aan
// (x-internal-secret); zonder die header weigert hij met 401.
async function updateGCal(supabase: any, ownerId: string, apptId: string, appt: any) {
  try {
    const gHeaders = { "Content-Type": "application/json", "x-internal-secret": SUPABASE_SERVICE_KEY };
    await fetch(`${SUPABASE_URL}/functions/v1/google-calendar`, {
      method: "POST",
      headers: gHeaders,
      body: JSON.stringify({ action: "delete", owner_id: ownerId, appointment_id: apptId }),
    });
    const res2 = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar`, {
      method: "POST",
      headers: gHeaders,
      body: JSON.stringify({
        action: "create", owner_id: ownerId,
        booking: {
          appointment_id: apptId,
          date: appt.date, time: appt.time, duration: appt.service_duration,
          service_name: appt.service_name,
          client_name: appt.client_name, client_email: appt.client_email, client_phone: appt.client_phone,
          staff_name: appt.staff_name, price: appt.service_price,
        },
      }),
    });
    const data = await res2.json().catch(() => ({}));
    return data?.event_id || null;
  } catch { return null; }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return err(405, "method_not_allowed", origin);

  const ip = clientIp(req);
  if (!rateLimit(ip)) return err(429, "rate_limited", origin);

  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const callerId = await verifyUser(tok);
  if (!callerId) return err(401, "unauthorized", origin);

  let payload: any;
  try { payload = await req.json(); } catch { return err(400, "invalid_json", origin); }

  const { appointment_id, new_date, new_time, new_staff_id } = payload || {};
  if (!appointment_id) return err(400, "missing_appointment_id", origin);
  if (!new_date || !/^\d{4}-\d{2}-\d{2}$/.test(new_date)) return err(400, "invalid_date", origin);
  if (!new_time || !/^\d{2}:\d{2}$/.test(new_time)) return err(400, "invalid_time", origin);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: appt, error: aErr } = await supabase
    .from("appointments").select("*").eq("id", appointment_id).maybeSingle();
  if (aErr || !appt) return err(404, "appointment_not_found", origin);
  if (appt.owner_id !== callerId) return err(403, "forbidden", origin);
  if (appt.status === "cancelled") return err(400, "already_cancelled", origin);

  const { data: salon } = await supabase
    .from("profiles")
    .select("business_hours, day_overrides, break_minutes, business_name, account_type, country_code, logo_url, accent_color, salon_email, email, slug, prepay_term_hours")
    .eq("id", callerId).maybeSingle();
  if (!salon) return err(404, "salon_not_found", origin);

  // Andere stylist gekozen? Die moet van deze salon zijn — de naam hebben we
  // straks ook nodig voor staff_name en de "(naam)" in service_name.
  const oudeStylist: string | null = appt.staff_id || null;
  const nieuweStylist: string | null = new_staff_id !== undefined ? (new_staff_id || null) : oudeStylist;
  const stylistWissel = new_staff_id !== undefined && nieuweStylist !== oudeStylist;
  if (stylistWissel && nieuweStylist) {
    const { data: ns } = await supabase
      .from("staff_members").select("id").eq("id", nieuweStylist).eq("owner_id", callerId).maybeSingle();
    if (!ns) return err(400, "invalid_staff", origin);
  }

  const duration = parseInt(appt.service_duration || 60);
  const startMin = toMinutes(new_time);
  const endMin = startMin + duration;

  const dow = new Date(`${new_date}T12:00:00`).getDay();
  const staffId = new_staff_id !== undefined ? new_staff_id : appt.staff_id;

  // Legacy salon-wide override stored as JSON on the profile.
  const override = salon.day_overrides?.[new_date];
  if (override?.type === "blocked") {
    if (override.block_time_start && override.block_time_end) {
      const bs = toMinutes(override.block_time_start);
      const be = toMinutes(override.block_time_end);
      if (startMin < be && endMin > bs) return err(400, "slot_blocked", origin);
    } else {
      return err(400, "day_blocked", origin);
    }
  }

  // ── Deelvensters ────────────────────────────────────────────────────────
  // Een gecombineerde afspraak heeft per dienst een eigen stylist, duur en
  // startverschuiving (service_breakdown). Elke per-stylist-toets hoort tegen
  // HAAR deel te gaan — hetzelfde model als book-appointment (vensterVoorStaff).
  // Verzetten deed dat niet: het keek alleen naar de PRIMAIRE stylist en het
  // hele venster. Dat was twee kanten op fout — te streng voor haar (haar deel
  // is korter dan de afspraak), en te soepel voor de tweede stylist: haar
  // blokkades, werktijden en bestaande afspraken werden volledig genegeerd, dus
  // je kon een teamboeking verzetten naar een moment waarop zij niet kan.
  // Zonder breakdown (enkelvoudige of oude afspraak) is er precies één deel.
  const breakdown = Array.isArray(appt.service_breakdown) ? appt.service_breakdown : [];
  const delen: { staffId: string | null; serviceId: string | null; start: number; end: number }[] =
    breakdown
      .map((p: any) => {
        const off = parseInt(p.offset_min) || 0;
        const dur = parseInt(p.duration) || 0;
        return {
          // Wisselt de eigenaar van stylist, dan verhuizen alleen de delen van
          // de vórige primaire stylist mee; de rest blijft bij haar eigen.
          staffId: (new_staff_id !== undefined && (p.staff_id || null) === (appt.staff_id || null))
            ? (new_staff_id || null)
            : (p.staff_id || null),
          serviceId: p.service_id || null,
          start: startMin + off,
          end: startMin + off + dur,
        };
      })
      .filter((d: any) => d.end > d.start);
  if (delen.length === 0) delen.push({ staffId: staffId || null, serviceId: appt.service_id || null, start: startMin, end: endMin });
  const betrokkenStaff = [...new Set(delen.map((d) => d.staffId).filter(Boolean))] as string[];
  const delenVan = (sid: string | null) => delen.filter((d) => d.staffId === sid);

  // staff_day_overrides rows for this date: kind='block' makes a stylist (or
  // the whole salon when staff_id is null) unavailable; kind='exception' is
  // an EXTRA open window that replaces the weekly schedule for that date.
  // Same semantics as the public booking flow — inclusief de terugkerende
  // weekdag-blokkades ("elke zondag"), die bij verzetten helemaal niet golden
  // omdat er alleen op `date` werd gezocht.
  const { data: sdoRows } = await supabase
    .from("staff_day_overrides")
    .select("staff_id, service_id, kind, weekday, date, block_time_start, block_time_end")
    .eq("owner_id", callerId)
    .or(`date.eq.${new_date},weekday.eq.${dow}`);
  const geldtOpDezeDag = (r: any) =>
    r.weekday == null ? r.date === new_date : (r.weekday === dow && new_date >= r.date);
  const sdo = (sdoRows || []).filter(geldtOpDezeDag);
  const blocks = sdo.filter((r) => (r.kind || "block") !== "exception");
  for (const b of blocks) {
    // Salonbreed (geen stylist) = niemand werkt dan, dus tegen álle delen.
    // Van een stylist = alleen tegen haar eigen delen. Een dienst-blokkade
    // ("maandag geen brows") raakt alleen het deel met die dienst.
    const raakt = b.staff_id ? delenVan(b.staff_id) : delen;
    const relevant = b.service_id ? raakt.filter((d) => d.serviceId === b.service_id) : raakt;
    if (relevant.length === 0) continue;
    if (!b.block_time_start || !b.block_time_end) return err(400, "day_blocked", origin);
    const bs = toMinutes(b.block_time_start);
    const be = toMinutes(b.block_time_end);
    if (relevant.some((d) => d.start < be && d.end > bs)) return err(400, "slot_blocked", origin);
  }
  const exceptions = sdo.filter((r) => r.kind === "exception");

  // Determine the open window for this date. Team salons keep business_hours
  // mostly "closed" and schedule per staff member, so validate against the
  // assigned stylist's working_hours there — that's what the client-facing
  // booking flow does too.
  const salonDay = salon.business_hours?.[dow];
  const fbOpen = salonDay?.open || "09:00";
  const fbClose = salonDay?.close || "17:30";

  // De legacy salonbrede uitzondering uit day_overrides meedoen alsof het een
  // rij is, zodat hij voor iedere stylist geldt — net als in book-appointment.
  const alleExc: any[] = [...exceptions];
  if (override?.type === "exception") {
    alleExc.push({ staff_id: null, block_time_start: override.open || fbOpen, block_time_end: override.close || fbClose });
  }
  const excVoor = (sid: string | null) => alleExc.filter((e) => !e.staff_id || (sid && e.staff_id === sid));

  // Per betrokken stylist: haar eigen delen moeten passen in haar uitzondering
  // (die vervangt het weekrooster) óf in haar weekrooster. Delen zonder stylist
  // — en stylisten zonder eigen rooster — vallen terug op de salon-/teamuren.
  const restDelen: typeof delen = [...delenVan(null)];
  if (betrokkenStaff.length > 0) {
    const { data: stRows } = await supabase
      .from("staff_members").select("id, working_hours").in("id", betrokkenStaff);
    for (const sid of betrokkenStaff) {
      const eigen = delenVan(sid);
      const exc = excVoor(sid);
      if (exc.length > 0) {
        const past = eigen.every((d) => exc.some((e) =>
          d.start >= toMinutes(e.block_time_start || fbOpen) && d.end <= toMinutes(e.block_time_end || fbClose)));
        if (!past) return err(400, "outside_hours", origin);
        continue;
      }
      const wh = (stRows || []).find((s: any) => s.id === sid)?.working_hours?.[dow];
      if (wh) {
        if (wh.closed) return err(400, "closed", origin);
        const o = toMinutes(wh.open || fbOpen);
        const c = toMinutes(wh.close || fbClose);
        if (eigen.some((d) => d.start < o || d.end > c)) return err(400, "outside_hours", origin);
        continue;
      }
      // Geen eigen rooster → deze delen tegen de salon-/teamuren hieronder.
      restDelen.push(...eigen);
    }
  }

  if (restDelen.length > 0) {
    const rs = Math.min(...restDelen.map((d) => d.start));
    const re = Math.max(...restDelen.map((d) => d.end));
    const excAlgemeen = alleExc.filter((e) => !e.staff_id);
    if (excAlgemeen.length > 0) {
      // Exception windows replace the weekly schedule: the slot must fit
      // entirely inside one of them.
      const fits = excAlgemeen.some((e) =>
        rs >= toMinutes(e.block_time_start || fbOpen) && re <= toMinutes(e.block_time_end || fbClose));
      if (!fits) return err(400, "outside_hours", origin);
    } else if (salon.account_type === "team") {
      // Geen stylist toegewezen: elke actieve stylist die die dag werkt maakt
      // het slot mogelijk — de vereniging (vroegste open, laatste sluit).
      const { data: allStaff } = await supabase
        .from("staff_members").select("working_hours").eq("owner_id", callerId).eq("active", true);
      const wins = (allStaff || [])
        .map((s) => s.working_hours?.[dow])
        .filter((w) => w && !w.closed);
      let win: { open: string; close: string } | null = null;
      if (wins.length > 0) {
        let open = "23:59", close = "00:00";
        for (const w of wins) {
          if ((w.open || fbOpen) < open) open = w.open || fbOpen;
          if ((w.close || fbClose) > close) close = w.close || fbClose;
        }
        win = { open, close };
      } else if ((allStaff || []).some((s) => s.working_hours)) {
        // Staff schedules exist but nobody works this day.
        return err(400, "closed", origin);
      }
      if (win) {
        if (rs < toMinutes(win.open) || re > toMinutes(win.close)) return err(400, "outside_hours", origin);
      } else {
        // No staff schedules at all → fall through to salon hours.
        if (!salonDay || salonDay.closed) return err(400, "closed", origin);
        if (rs < toMinutes(fbOpen) || re > toMinutes(fbClose)) return err(400, "outside_hours", origin);
        if (!fitsMiddayBreak(salonDay, rs, re)) return err(400, "outside_hours", origin);
      }
    } else {
      if (!salonDay || salonDay.closed) return err(400, "closed", origin);
      if (rs < toMinutes(salonDay.open) || re > toMinutes(salonDay.close)) return err(400, "outside_hours", origin);
      if (!fitsMiddayBreak(salonDay, rs, re)) return err(400, "outside_hours", origin);
    }
  }

  const breakMin = parseInt(salon.break_minutes || 0);
  const { data: existing, error: exErr } = await supabase
    .from("appointments")
    .select("id, time, service_duration, staff_id, status, service_breakdown, is_sale, service_id, products")
    .eq("owner_id", callerId).eq("date", new_date)
    .not("id", "eq", appointment_id)
    .not("status", "in", "(\"cancelled\",\"no_show\")")
    .or("is_sale.is.null,is_sale.eq.false");
  if (exErr) return err(500, "db_error_conflict_check", origin, exErr.message);
  // Per deel toetsen, net als book-appointment stap 10: afspraken van de TWEEDE
  // stylist werden hiervoor overgeslagen (haar staff_id ≠ de primaire), dus je
  // kon haar met een verzetting dubbelboeken. Ook de BESTAANDE afspraken tellen
  // nu per deel (vensterVanBestaande): het deel van de tweede stylist van een
  // andere teamboeking is ook bezet. Kassaverkopen bezetten niets.
  const bestaandeVensters = (existing || [])
    .filter((e: any) => !isVerkoopRij(e))
    .flatMap((e: any) => vensterVanBestaande(e, breakMin));
  for (const d of delen) {
    for (const w of bestaandeVensters) {
      // Alleen overslaan als beide kanten een (verschillende) stylist hebben.
      if (d.staffId && w.staffId && w.staffId !== d.staffId) continue;
      if (d.start < w.end && d.end + breakMin > w.start) return err(409, "slot_conflict", origin);
    }
  }

  const oldDate = appt.date;
  const oldTime = String(appt.time || "").slice(0, 5);
  const datumOfTijdAnders = new_date !== oldDate || new_time !== oldTime;
  const nieuweStart = localToUtc(new_date, new_time, tzFor(salon.country_code));

  const updatePayload: any = { date: new_date, time: new_time, rescheduled_at: new Date().toISOString() };
  if (new_staff_id !== undefined) updatePayload.staff_id = nieuweStylist;

  // Nieuw moment = de herinnering moet opnieuw (anders krijgt de klant er
  // geen voor de nieuwe tijd, of een op de oude dag).
  if (datumOfTijdAnders) updatePayload.reminder_sent = false;

  // Reservering (Vooruitbetalen): de betaaltermijn schuift mee, met dezelfde
  // regel als book-appointment stap 12b — de termijn van de salon vanaf nu,
  // uiterlijk 2 uur vóór de nieuwe start, nooit korter dan 2 uur vanaf nu
  // (behalve als de afspraak zelf eerder begint). De herinnering mag dan
  // opnieuw.
  if (appt.status === "pending_payment" && datumOfTijdAnders && nieuweStart) {
    const nowMs = Date.now();
    const startMs = nieuweStart.getTime();
    const termHours = Math.min(336, Math.max(1, Number(salon.prepay_term_hours) || 24));
    let due = nowMs + termHours * 3600000;
    due = Math.min(due, startMs - 2 * 3600000);
    due = Math.max(due, Math.min(nowMs + 2 * 3600000, startMs));
    updatePayload.payment_due_at = new Date(due).toISOString();
    updatePayload.prepay_reminded_at = null;
  }

  // Andere stylist: alles wat bij de vorige (primaire) stylist hoorde, gaat
  // mee naar de nieuwe — precies de delen die de toets hierboven al verhuisde
  // (zie `delen`). Hiervoor werd alleen staff_id geschreven, waardoor
  // staff_name, staff_assignments, service_breakdown en de "(naam)" in
  // service_name bij de oude stylist bleven: zij zag de afspraak nog in haar
  // app en kreeg de omzet, de nieuwe ook.
  if (stylistWissel) {
    const vanOude = (sid: unknown) => ((sid as string) || null) === oudeStylist;
    const nieuweBreakdown = breakdown.map((p: any) => (p && vanOude(p.staff_id)) ? { ...p, staff_id: nieuweStylist } : p);
    const toewijzing: Record<string, string> = {};
    for (const [svc, sid] of Object.entries(appt.staff_assignments || {})) {
      const m = vanOude(sid) ? nieuweStylist : ((sid as string) || null);
      if (m) toewijzing[svc] = m;
    }
    for (const p of breakdown) {
      if (!p?.service_id || !vanOude(p.staff_id)) continue;
      if (nieuweStylist) toewijzing[p.service_id] = nieuweStylist;
      else delete toewijzing[p.service_id];
    }
    // Namen in de volgorde van de delen, elke stylist één keer.
    const ids = [...new Set([...nieuweBreakdown.map((p: any) => p?.staff_id), nieuweStylist, ...Object.values(toewijzing)].filter(Boolean))] as string[];
    const opzoeken = [...new Set([...ids, ...(oudeStylist ? [oudeStylist] : [])])];
    const { data: namen } = opzoeken.length > 0
      ? await supabase.from("staff_members").select("id, name").eq("owner_id", callerId).in("id", opzoeken)
      : { data: [] as any[] };
    const naamVan = new Map((namen || []).map((s: any) => [s.id, s.name]));
    const staffNamen = [...new Set(ids.map((id) => naamVan.get(id)).filter(Boolean))];
    updatePayload.staff_name = staffNamen.length > 0 ? staffNamen.join(", ") : null;
    updatePayload.staff_assignments = toewijzing;
    if (breakdown.length > 0) updatePayload.service_breakdown = nieuweBreakdown;
    const oudeNaam = oudeStylist ? naamVan.get(oudeStylist) : null;
    const nieuweNaam = nieuweStylist ? naamVan.get(nieuweStylist) : null;
    if (oudeNaam && appt.service_name) {
      updatePayload.service_name = String(appt.service_name).split(` (${oudeNaam})`).join(nieuweNaam ? ` (${nieuweNaam})` : "");
    } else if (!oudeStylist && nieuweNaam && appt.service_name) {
      // Had de afspraak nog geen stylist, dan staat er ook geen "(naam)" in.
      // Bij één dienst (geen " · ", geen kortingscode achteraan) hoort die
      // achteraan, zoals bij boeken; bij meerdere delen is de plek niet
      // eenduidig en laten we de naam staan (staff_name klopt wel).
      const sn = String(appt.service_name);
      if (!sn.includes(" · ") && !/\]\s*$/.test(sn) && !sn.endsWith(` (${nieuweNaam})`)) {
        updatePayload.service_name = `${sn} (${nieuweNaam})`;
      }
    }
    // De prijs (service_price en de bedragen in service_breakdown) blijft de
    // geboekte prijs: verzetten herprijst niet. Een andere teamprijs zet de
    // eigenaar zelf via Bewerken.
  }

  const { data: updated, error: uErr } = await supabase
    .from("appointments").update(updatePayload)
    .eq("id", appointment_id).eq("owner_id", callerId)
    .select("*").single();
  if (uErr || !updated) return err(500, "update_failed", origin, uErr?.message);

  // De annuleerlink verloopt op het startmoment van de afspraak (zie
  // book-appointment stap 14). Verplaatst = dat moment schuift mee; anders zei
  // de link van een naar later verplaatste afspraak al "verlopen", en bleef hij
  // bij een naar voren verplaatste afspraak na afloop nog geldig.
  if (nieuweStart) {
    const { error: tokErr } = await supabase.from("cancellation_tokens")
      .update({ expires_at: nieuweStart.toISOString() })
      .eq("appointment_id", appointment_id)
      .not("used", "is", true);
    if (tokErr) console.error("cancel token expiry update failed:", tokErr);
  }

  if (appt.google_event_id) {
    await updateGCal(supabase, callerId, appointment_id, updated).catch(() => {});
  }

  let emailed = false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(updated.client_email || "").trim())) {
    // Annuleerlink meesturen als er nog een open token is.
    let cancelUrl: string | null = null;
    const { data: tok } = await supabase.from("cancellation_tokens")
      .select("token")
      .eq("appointment_id", appointment_id)
      .not("used", "is", true)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (tok?.token) cancelUrl = `https://vellu.cc/cancel/${tok.token}`;
    const cc = salon.country_code || "NL";
    emailed = await sendRescheduleMail({
      appointment_id: updated.id,
      client_name: updated.client_name,
      client_email: String(updated.client_email).trim(),
      client_phone: updated.client_phone || null,
      service_name: updated.service_name,
      date: new_date,
      time: new_time,
      old_date: oldDate !== new_date ? oldDate : null,
      old_time: oldTime !== new_time ? oldTime : null,
      price: updated.service_price,
      salon_name: salon.business_name || "",
      salon_logo: salon.logo_url || "",
      salon_accent: salon.accent_color || "",
      salon_email: salon.salon_email || salon.email || "",
      salon_slug: salon.slug || "",
      owner_id: callerId,
      currency: CUR[cc] || "€",
      // De taal waarin de klant boekte; oude rijen zonder taal: de markttaal.
      lang: ["nl", "en", "es"].includes(updated.lang) ? updated.lang : (DUTCH_COUNTRIES.has(cc) ? "nl" : "en"),
      cancel_url: cancelUrl,
    });
  }

  return ok({ success: true, appointment: updated, emailed }, origin);
});
