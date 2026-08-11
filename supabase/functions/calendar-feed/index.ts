// supabase/functions/calendar-feed/index.ts
// Public, token-authenticated iCal (.ics) feed of a salon's appointments so
// the owner/staff can subscribe their phone's native calendar (Apple
// Calendar, Google Calendar, Outlook) to their Vellu agenda. The secret
// token lives in the URL (profiles.calendar_feed_token) — unguessable, and
// rotating it invalidates old subscriptions. Read-only: never mutates data.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Escape a text value per RFC 5545 (backslash, comma, semicolon, newline).
function esc(s: string): string {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold long lines to <=75 octets as ICS requires (naive char-based fold is
// fine for our mostly-ASCII content).
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) { parts.push(" " + rest.slice(0, 72)); rest = rest.slice(72); }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

function dtLocal(date: string, time: string): string {
  // date = YYYY-MM-DD, time = HH:MM (salon local time). Emit as a floating/
  // TZID-qualified local datetime: YYYYMMDDTHHMMSS.
  const [y, m, d] = date.split("-");
  const [hh, mm] = (time || "00:00").split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

function addMinutes(date: string, time: string, mins: number): { date: string; time: string } {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + (mins || 0));
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`, time: `${p(dt.getHours())}:${p(dt.getMinutes())}` };
}

// Europe/Amsterdam == Europe/Brussels offsets (CET/CEST) — covers NL + BE.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Amsterdam",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!token || token.length < 16) return new Response("Missing or invalid token", { status: 400 });

  const { data: salon } = await supabase
    .from("profiles")
    .select("id, business_name")
    .eq("calendar_feed_token", token)
    .maybeSingle();
  if (!salon) return new Response("Not found", { status: 404 });

  // Window: from 30 days ago to 180 days ahead. Skip cancelled/no-show.
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const fmt = (dt: Date) => `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  const from = new Date(now); from.setDate(from.getDate() - 30);
  const to = new Date(now); to.setDate(to.getDate() + 180);

  const { data: appts } = await supabase
    .from("appointments")
    .select("id, date, time, service_name, service_duration, client_name, client_phone, staff_name, status, is_sale, service_id, products")
    .eq("owner_id", salon.id)
    .gte("date", fmt(from))
    .lte("date", fmt(to))
    .not("status", "in", '("cancelled","no_show")')
    // Kassa-verkopen zijn geen afspraken: ze mogen niet in de telefoonagenda
    // van de eigenaar verschijnen (oude rijen missen de vlag, vandaar de
    // structurele check verderop).
    .not("is_sale", "is", true)
    .order("date", { ascending: true });

  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
  const calName = `${salon.business_name || "Vellu"} — Vellu`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vellu//Salon Agenda//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    `NAME:${esc(calName)}`,
    "X-WR-TIMEZONE:Europe/Amsterdam",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
  ];

  for (const a of appts || []) {
    if (!a.date || !a.time) continue;
    // Oude verkoop-rijen (van vóór de is_sale-vlag) structureel herkennen.
    if (!a.service_id && (parseInt(a.service_duration) || 0) === 0 && Array.isArray(a.products) && a.products.length > 0) continue;
    const dur = parseInt(a.service_duration || 60) || 60;
    const end = addMinutes(a.date, a.time, dur);
    const summaryParts = [a.client_name || "Afspraak"];
    if (a.service_name) summaryParts.push(a.service_name);
    const summary = summaryParts.join(" — ");
    const descParts: string[] = [];
    if (a.service_name) descParts.push(a.service_name);
    if (a.staff_name) descParts.push(`Medewerker: ${a.staff_name}`);
    if (a.client_phone) descParts.push(`Tel: ${a.client_phone}`);
    if (a.status === "completed") descParts.push("Status: voltooid");
    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:appt-${a.id}@vellu.cc`),
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Amsterdam:${dtLocal(a.date, a.time)}`,
      `DTEND;TZID=Europe/Amsterdam:${dtLocal(end.date, end.time)}`,
      fold(`SUMMARY:${esc(summary)}`),
      fold(`DESCRIPTION:${esc(descParts.join("\n"))}`),
      `STATUS:${a.status === "completed" ? "CONFIRMED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=vellu-agenda.ics",
      "Cache-Control": "no-cache, max-age=0",
    },
  });
});
