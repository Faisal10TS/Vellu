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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: jh });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const tok = authHeader.replace(/^Bearer\s+/i, "");
    const callerId = await verifyUserToken(tok);
    if (!callerId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jh });

    const body = await req.json();
    const { staff_id, email, password, owner_id, name } = body || {};
    if (!email || !owner_id) return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers: jh });
    if (callerId !== owner_id) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: jh });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const cleanEmail = String(email).toLowerCase().trim();
    const userPassword = password || Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: userPassword,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message?.includes("already been registered")) {
        return new Response(JSON.stringify({ error: "email_taken" }), { status: 409, headers: jh });
      }
      return new Response(JSON.stringify({ error: authError.message }), { status: 500, headers: jh });
    }

    const userId = authUser.user.id;
    let updateError: { message: string } | null = null;

    if (staff_id) {
      const r = await supabase.from("staff_members")
        .update({ user_id: userId, email: cleanEmail })
        .eq("id", staff_id)
        .eq("owner_id", owner_id);
      updateError = r.error;
    } else if (name) {
      const r = await supabase.from("staff_members")
        .update({ user_id: userId, email: cleanEmail })
        .eq("owner_id", owner_id)
        .eq("name", name);
      updateError = r.error;
    } else {
      updateError = { message: "no_staff_id_or_name" };
    }

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: jh });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), { headers: jh });
  } catch (err) {
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: jh });
  }
});
