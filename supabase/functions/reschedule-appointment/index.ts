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
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "noreply@vellu.cc";

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

function fmtDateNL(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const days = ["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"];
    const months = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
    const dt = new Date(y, m - 1, d);
    return `${days[dt.getDay()]} ${d} ${months[m - 1]} ${y}`;
  } catch { return dateStr; }
}

function rescheduleEmailHtml(b: { client_name: string; service_name: string; salon_name: string; old_date: string; old_time: string; new_date: string; new_time: string; }) {
  return `<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1>
      <div style="width:40px;height:1px;background:#c9a96e;margin:12px auto;"></div>
    </div>
    <h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">Je afspraak is verplaatst</h2>
    <p style="color:#666;margin-bottom:28px;">Hoi ${b.client_name.split(" ")[0]}, <strong>${b.salon_name}</strong> heeft je afspraak voor <strong>${b.service_name}</strong> op een ander moment ingepland.</p>
    <div style="background:#fff5f0;border:1px solid #f0dcc0;border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.08em;">Was</div>
      <div style="font-size:14px;color:#aaa;text-decoration:line-through;">${fmtDateNL(b.old_date)} om ${b.old_time}</div>
    </div>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px;margin-bottom:28px;">
      <div style="font-size:11px;color:#0369a1;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Nieuwe tijd</div>
      <div style="font-size:16px;font-weight:600;color:#0369a1;">${fmtDateNL(b.new_date)} om ${b.new_time}</div>
    </div>
    <p style="color:#888;font-size:13px;text-align:center;">Tot dan, ${b.client_name.split(" ")[0]}!</p>
  </div>`;
}

async function sendResend(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    return r.ok;
  } catch { return false; }
}

async function updateGCal(supabase: any, ownerId: string, apptId: string, appt: any) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/google-calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", owner_id: ownerId, appointment_id: apptId }),
    });
    const res2 = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
    .select("business_hours, day_overrides, break_minutes, business_name, account_type")
    .eq("id", callerId).maybeSingle();
  if (!salon) return err(404, "salon_not_found", origin);

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
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, time, service_duration, staff_id, status")
    .eq("owner_id", callerId).eq("date", new_date)
    .not("id", "eq", appointment_id)
    .not("status", "in", "(\"cancelled\",\"no_show\")");
  // Per deel toetsen, net als book-appointment stap 10: afspraken van de TWEEDE
  // stylist werden hiervoor overgeslagen (haar staff_id ≠ de primaire), dus je
  // kon haar met een verzetting dubbelboeken.
  for (const d of delen) {
    for (const e of existing || []) {
      // Alleen overslaan als beide kanten een (verschillende) stylist hebben.
      if (d.staffId && e.staff_id && e.staff_id !== d.staffId) continue;
      const exStart = toMinutes(e.time);
      const exEnd = exStart + parseInt(e.service_duration || 60) + breakMin;
      if (d.start < exEnd && d.end + breakMin > exStart) return err(409, "slot_conflict", origin);
    }
  }

  const oldDate = appt.date;
  const oldTime = appt.time;

  const updatePayload: any = { date: new_date, time: new_time, rescheduled_at: new Date().toISOString() };
  if (new_staff_id !== undefined) updatePayload.staff_id = new_staff_id;
  const { data: updated, error: uErr } = await supabase
    .from("appointments").update(updatePayload)
    .eq("id", appointment_id).eq("owner_id", callerId)
    .select("*").single();
  if (uErr || !updated) return err(500, "update_failed", origin, uErr?.message);

  if (appt.google_event_id) {
    await updateGCal(supabase, callerId, appointment_id, updated).catch(() => {});
  }

  if (updated.client_email) {
    await sendResend(
      updated.client_email,
      `Afspraak verplaatst bij ${salon.business_name || "je salon"}`,
      rescheduleEmailHtml({
        client_name: updated.client_name,
        service_name: updated.service_name,
        salon_name: salon.business_name || "je salon",
        old_date: oldDate, old_time: oldTime,
        new_date, new_time,
      }),
    );
  }

  return ok({ success: true, appointment: updated, emailed: !!updated.client_email }, origin);
});
