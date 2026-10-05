// supabase/functions/translate-text/index.ts
// Owner-only translation proxy via DeepL free API.
//
// REPO-SYNC 2026-08-22: dit bestand stond alleen gedeployd (v7, 29-07-2026)
// en ontbrak in de repo — opgehaald met get_edge_function en hier vastgelegd,
// zodat de repo weer de bron van waarheid is (zie memory
// "edge_function_source_drift"). Inhoud identiek aan v7; alleen deze
// toelichting is toegevoegd. Wordt aangeroepen vanuit OwnerApp (vertaalknop
// bij dienstnamen/-beschrijvingen) met de sessie-JWT; verify_jwt staat AAN
// (config.toml).
//
// 05-10-2026: verify_jwt alleen is GEEN inlogcontrole: de publieke anon-sleutel
// is zelf ook een geldige JWT. Daarom controleert de functie nu zelf de
// gebruiker (auth.getUser) en laat alleen door: een eigenaar met een lopend
// plan of proef, of een actief teamlid van zo'n salon die diensten mag
// bewerken (staff_can_edit_services). Daarbovenop een dagbudget in tekens per
// gebruiker en voor alle salons samen (rpc consume_translate_budget), zodat
// niemand het DeepL-tegoed van de maand kan opmaken.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEEPL_KEY = Deno.env.get("DEEPL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
// Tekens per gebruiker per (UTC-)dag en voor alle salons samen. Een complete
// menukaart van ~80 diensten met omschrijving naar twee talen past ruim.
const USER_DAILY_CHARS = Number(Deno.env.get("TRANSLATE_USER_DAILY_CHARS") || "40000");
const GLOBAL_DAILY_CHARS = Number(Deno.env.get("TRANSLATE_GLOBAL_DAILY_CHARS") || "150000");
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

function deeplEndpoint() {
  return (DEEPL_KEY || "").endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
}

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
const RATE_MAX = 30;
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const e = RATE_LIMIT.get(ip);
  if (!e || e.resetAt < now) { RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (e.count >= RATE_MAX) return false;
  e.count++;
  return true;
}

// IP zoals het platform het doorgeeft (zie ook create-staff-account).
function clientIp(req: Request): string {
  const h = req.headers;
  const ip = (h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0] || "").trim();
  return ip ? ip.slice(0, 64) : "unknown";
}

// Zelfde regel als planIsActive in src/App.jsx: een plan, en plan_expires_at
// leeg of in de toekomst (een datum zonder tijd telt tot het eind van die dag),
// plus 3 dagen coulance voor een lopend Mollie-abonnement.
function planActive(p: Record<string, unknown> | null): boolean {
  if (!p?.plan) return false;
  const raw = p.plan_expires_at as string | null;
  if (!raw) return true;
  const exp = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? `${raw}T23:59:59` : String(raw));
  const now = Date.now();
  if (exp.getTime() > now) return true;
  const renewing = p.subscription_status === "active" && !!p.mollie_subscription_id;
  return renewing && now - exp.getTime() < 3 * 24 * 60 * 60 * 1000;
}

// Mag deze gebruiker vertalen? Eigenaar met lopend plan, of actief teamlid van
// zo'n salon dat diensten mag bewerken.
async function mayTranslate(userId: string): Promise<boolean> {
  const cols = "plan, plan_expires_at, subscription_status, mollie_subscription_id, staff_can_edit_services";
  const { data: own } = await supabase.from("profiles").select(cols).eq("id", userId).maybeSingle();
  if (own) return planActive(own as Record<string, unknown>);
  const { data: st } = await supabase.from("staff_members")
    .select("owner_id")
    .eq("user_id", userId)
    .or("active.is.null,active.eq.true")
    .limit(1)
    .maybeSingle();
  if (!st?.owner_id) return false;
  const { data: salon } = await supabase.from("profiles").select(cols).eq("id", st.owner_id).maybeSingle();
  if (!salon || (salon as Record<string, unknown>).staff_can_edit_services === false) return false;
  return planActive(salon as Record<string, unknown>);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);
  if (!DEEPL_KEY) return json(500, { error: "deepl_not_configured" }, origin);

  const ip = clientIp(req);
  if (!rateLimit(ip)) return json(429, { error: "rate_limited" }, origin);

  // Echte gebruiker? De anon-sleutel komt door verify_jwt heen maar is geen gebruiker.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "unauthorized" }, origin);
  let userId = "";
  try {
    const { data: u } = await supabase.auth.getUser(jwt);
    userId = u?.user?.id || "";
  } catch { /* geen gebruikerstoken */ }
  if (!userId) return json(401, { error: "unauthorized" }, origin);
  try {
    if (!(await mayTranslate(userId))) return json(403, { error: "forbidden" }, origin);
  } catch (e) {
    console.error("translate-text auth lookup error", e);
    return json(500, { error: "translate_failed" }, origin);
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }, origin); }

  const { texts, source_lang, target_lang } = payload || {};
  if (!Array.isArray(texts) || texts.length === 0) return json(400, { error: "missing_texts" }, origin);
  if (texts.length > 20) return json(400, { error: "too_many_texts" }, origin);
  if (!source_lang || !target_lang) return json(400, { error: "missing_lang" }, origin);

  const src = String(source_lang).toUpperCase();
  const tgt = String(target_lang).toUpperCase();
  const supported = ["NL", "EN", "EN-US", "EN-GB", "ES"];
  if (!supported.includes(src) || !supported.includes(tgt)) return json(400, { error: "unsupported_lang" }, origin);

  const jobs: { idx: number; text: string }[] = [];
  let totalChars = 0;
  for (let i = 0; i < texts.length; i++) {
    const t = String(texts[i] ?? "").trim();
    if (!t) continue;
    if (t.length > 5000) return json(400, { error: "text_too_long" }, origin);
    totalChars += t.length;
    if (totalChars > 20000) return json(400, { error: "batch_too_long" }, origin);
    jobs.push({ idx: i, text: t });
  }
  if (jobs.length === 0) return json(200, { translations: texts.map(() => "") }, origin);

  // Dagbudget (DB, geldt over alle functie-instanties heen). Weet de teller het
  // niet zeker, dan niet vertalen: de eigenaar kan de tekst altijd zelf typen.
  {
    const { data: okBudget, error: budgetErr } = await supabase.rpc("consume_translate_budget", {
      p_user_id: userId,
      p_chars: totalChars,
      p_user_cap: USER_DAILY_CHARS,
      p_global_cap: GLOBAL_DAILY_CHARS,
    });
    if (budgetErr) {
      console.error("consume_translate_budget error", budgetErr);
      return json(503, { error: "budget_unavailable" }, origin);
    }
    if (okBudget !== true) return json(429, { error: "daily_limit" }, origin);
  }

  const form = new URLSearchParams();
  form.set("source_lang", src === "EN-US" || src === "EN-GB" ? "EN" : src);
  form.set("target_lang", tgt);
  for (const j of jobs) form.append("text", j.text);

  try {
    const res = await fetch(deeplEndpoint(), {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${DEEPL_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("deepl error", res.status, t);
      return json(502, { error: "deepl_error", status: res.status }, origin);
    }
    const data = await res.json();
    const translations: string[] = new Array(texts.length).fill("");
    for (let i = 0; i < jobs.length; i++) {
      translations[jobs[i].idx] = data.translations?.[i]?.text || "";
    }
    return json(200, { translations }, origin);
  } catch (e) {
    console.error("translate-text error", e);
    return json(500, { error: "translate_failed" }, origin);
  }
});
