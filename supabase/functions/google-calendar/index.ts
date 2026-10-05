// supabase/functions/google-calendar/index.ts
// Post-booking / post-cancel Google Calendar sync. Never 500s.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", null, 405);

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
    .select("google_refresh_token, google_calendar_connected")
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
    const startDateTime = localIso(booking.date, booking.time, 0);
    const endDateTime = localIso(booking.date, booking.time, duration);

    const descriptionLines = [
      `Klant: ${booking.client_name || ""}`,
      booking.client_email ? `Email: ${booking.client_email}` : "",
      booking.client_phone ? `Tel: ${booking.client_phone}` : "",
      `Behandeling: ${booking.service_name || ""}`,
      booking.price !== undefined ? `Prijs: €${booking.price}` : "",
      booking.staff_name ? `Medewerker: ${booking.staff_name}` : "",
    ].filter(Boolean);

    const event = {
      summary: `${booking.service_name || "Afspraak"} — ${booking.client_name || ""}`.trim(),
      description: descriptionLines.join("\n"),
      start: { dateTime: startDateTime, timeZone: "Europe/Amsterdam" },
      end: { dateTime: endDateTime, timeZone: "Europe/Amsterdam" },
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
