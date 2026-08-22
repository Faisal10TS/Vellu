// supabase/functions/translate-text/index.ts
// Owner-only translation proxy via DeepL free API.
//
// REPO-SYNC 2026-08-22: dit bestand stond alleen gedeployd (v7, 29-07-2026)
// en ontbrak in de repo — opgehaald met get_edge_function en hier vastgelegd,
// zodat de repo weer de bron van waarheid is (zie memory
// "edge_function_source_drift"). Inhoud identiek aan v7; alleen deze
// toelichting is toegevoegd. Wordt aangeroepen vanuit OwnerApp (vertaalknop
// bij dienstnamen/-beschrijvingen) met de sessie-JWT; verify_jwt staat AAN
// (config.toml), dus de gateway weigert anonieme aanroepen al.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const DEEPL_KEY = Deno.env.get("DEEPL_API_KEY");
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

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);
  if (!DEEPL_KEY) return json(500, { error: "deepl_not_configured" }, origin);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) return json(429, { error: "rate_limited" }, origin);

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
