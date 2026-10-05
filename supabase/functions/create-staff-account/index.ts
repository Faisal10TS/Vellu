// create-staff-account
// verify_jwt:false because Supabase's gateway rejects ES256 user tokens.
// Custom auth happens inside: validate Bearer via Supabase Auth API + check
// that the caller actually owns the profile they're attaching staff to.
//
// Rate limited at 5 requests/min per IP — creating auth users + sending
// emails is expensive, so we don't want a runaway script (or attacker)
// burning quota.
//
// REPO-SYNC 2026-08-22: dit bestand is gelijkgetrokken met de DEPLOYDE v17
// (21-04-2026). De repo-kopie was blijven steken op de versie van 16-04 —
// zonder rate limit, zonder JWT-controle, zonder naam-fallback — en had bij
// een herdeploy die beveiliging stilletjes weggehaald. Zie memory
// "edge_function_source_drift": altijd eerst get_edge_function vergelijken.
//
// 05-10-2026, twee acties:
//  - body { action: "invite", staff_id, lang }: mailt het teamlid een
//    uitnodigingslink (https://vellu.cc/owner?invite=<token>, 7 dagen geldig).
//    In de database staat alleen de sha256 van het token; claim_staff_invite
//    koppelt het account dat die link opent. Zo bewijst het teamlid dat ze de
//    mailbox heeft; koppelen op alleen een gelijk e-mailadres bestaat niet meer.
//    Hooguit INVITES_PER_DAY uitnodigingen per salon per dag (429 too_many_invites).
//  - zonder action (knop "Uitnodigen" bij "Maak een login aan"): de eigenaar
//    maakt zelf een login met wachtwoord. Vereist nu staff_id, controleert de
//    rij VOOR het aanmaken, en ruimt het account weer op als koppelen mislukt.
//    user_metadata.staff_invite = true laat handle_new_user geen eigen
//    salonprofiel voor dit account aanmaken.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || SERVICE_KEY;

const AO = [
  "https://vellu.cc",
  "https://www.vellu.cc",
  "https://vellu.io",
  "https://www.vellu.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

function corsHeaders(origin: string | null) {
  const a = origin && AO.includes(origin) ? origin : "https://vellu.cc";
  return {
    "Access-Control-Allow-Origin": a,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 5;
function rateLimit(ip: string) {
  const now = Date.now();
  const e = RATE_LIMIT.get(ip);
  if (!e || e.resetAt < now) { RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (e.count >= RATE_MAX) return false;
  e.count++;
  return true;
}

// IP van de bezoeker zoals het platform het doorgeeft. Niet de rechtse hop uit
// X-Forwarded-For raden: dan kan iedereen in dezelfde emmer belanden.
function clientIp(req: Request): string {
  const h = req.headers;
  const ip = (h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0] || "").trim();
  return ip ? ip.slice(0, 64) : "unknown";
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const INVITE_DAYS = 7;
// Uitnodigingsmails per salon per (UTC-)dag, geteld in de database
// (bump_staff_invite_usage). Ruim genoeg voor een heel team plus opnieuw mailen.
const INVITES_PER_DAY = 20;

async function verifyUserToken(tok: string): Promise<string | null> {
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

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders(origin) });

  const jh = { ...corsHeaders(origin), "Content-Type": "application/json" };

  const ip = clientIp(req);
  if (!rateLimit(ip)) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: jh });
  const reply = (status: number, obj: Record<string, unknown>) =>
    new Response(JSON.stringify(obj), { status, headers: jh });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const tok = authHeader.replace(/^Bearer\s+/i, "");
    const callerId = await verifyUserToken(tok);
    if (!callerId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jh });

    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Uitnodiging per mail (R-02) ─────────────────────────────────────
    if (body?.action === "invite") {
      const staffId = body.staff_id;
      const lang = ["nl", "en", "es"].includes(body.lang) ? body.lang : "nl";
      if (!staffId) return reply(400, { error: "missing_fields" });
      const { data: row, error: rowErr } = await supabase.from("staff_members")
        .select("id, owner_id, name, email, user_id, active")
        .eq("id", staffId)
        .maybeSingle();
      if (rowErr) return reply(500, { error: "lookup_failed" });
      if (!row || row.owner_id !== callerId) return reply(403, { error: "forbidden" });
      const inviteEmail = String(row.email || "").trim().toLowerCase();
      // Een inactief teamlid krijgt geen uitnodiging: inactief = geen toegang.
      if (!inviteEmail || row.user_id || row.active === false) return reply(400, { error: "not_invitable" });

      // Daglimiet per salon: elke uitnodiging is een Vellu-mail met de salonnaam
      // erin, naar een adres dat de eigenaar zelf invult.
      const { data: sentToday, error: capErr } = await supabase.rpc("bump_staff_invite_usage", { p_owner_id: callerId });
      if (capErr) {
        console.error("staff invite counter error:", capErr);
        return reply(500, { error: "invite_failed" });
      }
      if (Number(sentToday) > INVITES_PER_DAY) return reply(429, { error: "too_many_invites" });

      // 32 willekeurige bytes als hex; in de database alleen de sha256 ervan.
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const { data: saved, error: saveErr } = await supabase.from("staff_members")
        .update({
          invite_token_hash: await sha256Hex(token),
          invite_expires_at: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", row.id)
        .eq("owner_id", callerId)
        .is("user_id", null)
        .select("id")
        .maybeSingle();
      if (saveErr || !saved) {
        console.error("staff invite token save failed:", saveErr);
        return reply(500, { error: "invite_failed" });
      }

      const { data: prof } = await supabase.from("profiles")
        .select("business_name, logo_url, accent_color, salon_email, email")
        .eq("id", callerId)
        .maybeSingle();
      let mailOk = false;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "staff_invite",
            booking: {
              client_email: inviteEmail,
              staff_name: row.name,
              salon_name: prof?.business_name || "",
              salon_logo: prof?.logo_url || null,
              salon_accent: prof?.accent_color || null,
              salon_email: prof?.salon_email || prof?.email || null,
              invite_url: `https://vellu.cc/owner?invite=${token}`,
              lang,
            },
          }),
        });
        mailOk = r.ok;
        if (!r.ok) console.error("staff_invite mail failed:", r.status, await r.text().catch(() => ""));
      } catch (e) { console.error("staff_invite mail error:", e); }
      return mailOk ? reply(200, { success: true }) : reply(502, { error: "mail_failed" });
    }

    // ── Login met wachtwoord, aangemaakt door de eigenaar ────────────────
    const { staff_id, email, password, owner_id } = body || {};
    if (!email || !owner_id || !staff_id) return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers: jh });
    if (callerId !== owner_id) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: jh });

    // De rij moet van deze salon zijn en nog geen login hebben, VOORDAT er een
    // account komt. Tot 05-10-2026 werd het account eerst aangemaakt en bleef
    // het bij een verkeerde staff_id als wees achter (e-mailadres "bezet").
    const { data: staffRow, error: staffErr } = await supabase.from("staff_members")
      .select("id, user_id, active")
      .eq("id", staff_id)
      .eq("owner_id", owner_id)
      .maybeSingle();
    if (staffErr) return reply(500, { error: "lookup_failed" });
    if (!staffRow) return reply(403, { error: "forbidden" });
    if (staffRow.user_id) return reply(409, { error: "already_linked" });
    // Geen login voor een inactief teamlid (zelfde regel als de uitnodiging).
    if (staffRow.active === false) return reply(400, { error: "not_invitable" });
    // Professional-functie; de app toont dit blok niet aan Starter-salons.
    const { data: ownerProfile } = await supabase.from("profiles").select("plan").eq("id", owner_id).maybeSingle();
    if (ownerProfile?.plan === "starter") return reply(403, { error: "plan_required" });

    const cleanEmail = String(email).toLowerCase().trim();
    const userPassword = password || Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: userPassword,
      email_confirm: true,
      // handle_new_user maakt voor dit account geen eigen salonprofiel aan.
      user_metadata: { staff_invite: true },
    });

    if (authError) {
      if (authError.message?.includes("already been registered")) {
        return new Response(JSON.stringify({ error: "email_taken" }), { status: 409, headers: jh });
      }
      return new Response(JSON.stringify({ error: authError.message }), { status: 500, headers: jh });
    }

    const userId = authUser.user.id;
    const { data: linked, error: linkErr } = await supabase.from("staff_members")
      .update({ user_id: userId, email: cleanEmail, invite_token_hash: null, invite_expires_at: null })
      .eq("id", staff_id)
      .eq("owner_id", owner_id)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    if (linkErr || !linked) {
      // Koppelen mislukt: het nieuwe account weer weghalen, anders blijft het
      // e-mailadres bezet door een account zonder salon.
      console.error("staff link failed, removing new auth user:", userId, linkErr);
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) console.error("orphan auth user cleanup failed:", userId, delErr);
      return reply(500, { error: linkErr?.message || "link_failed" });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), { headers: jh });
  } catch (err) {
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: jh });
  }
});
