// supabase/functions/parse-price-list/index.ts
//
// Prijslijst inlezen (24-10-2026, Faisal: "yes do 2"). De salon uploadt een
// foto (of enkele foto's) of een PDF van haar prijslijst; Claude leest de
// behandelingen, prijzen en tijden en vertaalt de namen naar NL/EN/ES. De app
// toont de lijst ter controle; pas na een klik van de salon komen de diensten
// erin (dat doet de app zelf, niet deze functie).
//
// POST { files: [{ name, type, data (base64) }], lang } met de JWT van de eigenaar.
//  → 202 { import_id, status: "processing" }
// Het lezen loopt daarna op de achtergrond (EdgeRuntime.waitUntil): een lange
// prijslijst duurt langer dan de 150 s die Supabase een antwoord geeft. De app
// vraagt om de paar seconden price_list_import_status(import_id) op; daar
// staat de uitkomst in (result = normalize()).
//
// Elke poging komt in price_list_imports (ook mislukte), de bestanden in de
// privébucket price-lists/<eigenaar>/<poging>/; zo kan de beheerder een foto
// die niet te lezen was bekijken en de salon helpen (admin → Onboarding).
// Maximaal 10 pogingen per salon per 24 uur (price_list_import_begin, met slot).
//
// Model: claude-opus-5-5, gestreamd, met structured outputs
// (output_config.format) en fallbacks: "default" (bij een weigering neemt een
// ander model het over). Lukt de aanroep met die bèta niet (400), dan zonder;
// lukt ook dat niet, dan zonder schema. Geen automatische herhaling: die zou de
// tijd overschrijden en dubbel kosten.
// Auth: verify_jwt=true (config.toml) en hieronder getUser.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { SCHEMA, normalize } from "./normalize.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = "claude-opus-5-5";
const ALLOWED_ORIGINS = ["https://vellu.cc", "https://www.vellu.cc", "http://localhost:5173", "http://localhost:4173", "http://localhost:4175"];
const MAX_FILES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // per foto (limiet van de API)
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const DAILY_LIMIT = 10;
// De functie mag 400 s draaien (betaald plan); ruim daarbinnen stoppen, zodat
// de poging altijd netjes als mislukt wordt vastgelegd.
const AI_DEADLINE_MS = 330_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
const json = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

// base64 → bytes met een gewone lus (Uint8Array.from met een functie kostte
// bij 10 MB al ruim een halve seconde CPU; de limiet is 2 s per aanvraag).
// Gooit bij ongeldige base64 (atob).
function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const COUNTRY: Record<string, string> = { NL: "the Netherlands", BQ: "Bonaire (Caribbean Netherlands)", CW: "Curaçao", AW: "Aruba", SX: "Sint Maarten", BE: "Belgium", SR: "Suriname" };
const OWNER_LANG: Record<string, string> = { nl: "Dutch", en: "English", es: "Spanish" };

function systemPrompt(lang: string) {
  return `You read photos or PDFs of beauty salon price lists (nails, hair, lashes, brows, skin, waxing/sugaring, massage, barber) and turn them into a treatment menu for an online booking system. The salon owner checks your result before anything is saved.

- Include every bookable treatment that has a price. Skip retail products, gift cards, opening hours, policies and contact details.
- Use the headings on the list as categories. Without headings, group sensibly (for example Manicure, Pedicure) or use one category.
- name: as written on the list; only fix obvious typos and ALL-CAPS. name_nl, name_en, name_es: natural salon-menu wording in Dutch, English and Spanish. Keep brand and technique names (BIAB, Gel-X, Shellac, Polygel, balayage) as they are. Category names get the same four fields.
- One treatment with several price options (short/medium/long, per length or area) becomes one service per option, with the option in the name, e.g. "Acrylic full set - Medium".
- price: the number only, in the list's own currency. For "from 30" or a range "30-40", use the lowest number and set price_from to true. No price: null.
- duration_minutes: as shown on the list. If it is not shown, estimate a typical duration for that treatment in a professional salon and set duration_estimated to true.
- description: only when the list itself describes the treatment; otherwise null. Never invent descriptions.
- currency: the ISO 4217 code of the prices (EUR, USD, XCG, ANG, AWG) when the symbols or context show it; otherwise null.
- language: the ISO 639-1 code of the list's main language (nl, en, es, pap).
- Several images are pages of the same price list: combine them and do not repeat a treatment.
- If the file is not a price list or cannot be read, set readable to false, return no categories and give the reason in note.
- note: one short sentence the owner should check (for example a price that was hard to read), or null. Write the note in ${OWNER_LANG[lang] || "English"}.`;
}

type FileIn = { name?: string; type?: string; data?: string };
type Checked = { type: string; data: string; bytes: Uint8Array };

async function finish(importId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("price_list_imports").update(patch).eq("id", importId);
  if (error) console.error("parse-price-list: logboek bijwerken mislukt", importId, error);
}

// Het eigenlijke lezen (op de achtergrond). Legt altijd een eindstand vast.
async function readWithClaude(importId: string, files: Checked[], lang: string, countryCode: string) {
  const content: Array<Record<string, unknown>> = files.map((f) => f.type === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
    : { type: "image", source: { type: "base64", media_type: f.type, data: f.data } });
  content.push({
    type: "text",
    text: `${files.length > 1 ? `These ${files.length} files are pages of one price list.` : "This is my price list."} The salon is in ${COUNTRY[countryCode] || countryCode}.`,
  });

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: AI_DEADLINE_MS, maxRetries: 0 });
  const base = {
    model: MODEL,
    max_tokens: 32000,
    system: systemPrompt(lang),
    messages: [{ role: "user" as const, content }],
    output_config: { effort: "low" as const, format: { type: "json_schema" as const, schema: SCHEMA } },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_DEADLINE_MS);
  const opts = { signal: ctrl.signal };

  // deno-lint-ignore no-explicit-any
  let msg: any = null;
  try {
    try {
      msg = await anthropic.beta.messages.stream({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as never, opts).finalMessage();
    } catch (e) {
      // Bèta niet geaccepteerd (400): nog één keer de gewone aanroep.
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      console.error("parse-price-list: aanroep met fallbacks geweigerd, zonder opnieuw:", e.message);
      try {
        msg = await anthropic.messages.stream(base as never, opts).finalMessage();
      } catch (e2) {
        // Ook dan 400: laatste poging zonder het JSON-schema; het antwoord
        // wordt dan uit de tekst gehaald en normalize() vangt de rest op.
        if (!(e2 instanceof Anthropic.BadRequestError)) throw e2;
        console.error("parse-price-list: ook zonder fallbacks 400, nu zonder schema:", e2.message);
        msg = await anthropic.messages.stream({
          ...base,
          system: `${base.system}\n\nReply with only a JSON object (no other text) that follows this JSON schema:\n${JSON.stringify(SCHEMA)}`,
          output_config: { effort: "low" },
        } as never, opts).finalMessage();
      }
    }
  } catch (e) {
    const code = ctrl.signal.aborted || e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIUserAbortError ? "ai_timeout"
      : e instanceof Anthropic.RateLimitError ? "ai_busy"
      : e instanceof Anthropic.APIError ? `ai_error_${e.status ?? ""}` : "ai_error";
    console.error("parse-price-list: Claude-aanroep mislukt", code, e instanceof Error ? e.message : e);
    await finish(importId, { status: "failed", error: `${code}: ${String(e instanceof Error ? e.message : e).slice(0, 300)}` });
    return;
  } finally {
    clearTimeout(timer);
  }

  const usage = { input_tokens: msg?.usage?.input_tokens ?? null, output_tokens: msg?.usage?.output_tokens ?? null, model: msg?.model || MODEL };
  if (msg?.stop_reason === "refusal" || msg?.stop_reason === "max_tokens") {
    await finish(importId, { status: "failed", error: msg.stop_reason === "refusal" ? "ai_refused" : "too_long", ...usage });
    return;
  }
  const text = (msg?.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  let raw: unknown = null;
  try { raw = JSON.parse(text); } catch {
    const a = text.indexOf("{"), z = text.lastIndexOf("}");
    if (a >= 0 && z > a) { try { raw = JSON.parse(text.slice(a, z + 1)); } catch { /* hieronder */ } }
  }
  if (raw === null) {
    await finish(importId, { status: "failed", error: `bad_json: ${text.slice(0, 200)}`, ...usage });
    return;
  }
  const parsed = normalize(raw);
  await finish(importId, { status: parsed.count > 0 ? "ok" : "empty", services_found: parsed.count, result: parsed, ...usage });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json(401, { error: "no_auth" }, origin);
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json(401, { error: "invalid_auth" }, origin);
  const ownerId = userData.user.id;

  let body: { files?: FileIn[]; lang?: string };
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }, origin); }
  const lang = ["nl", "en", "es"].includes(String(body.lang)) ? String(body.lang) : "en";
  const filesIn = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES + 1) : [];
  if (filesIn.length === 0) return json(400, { error: "no_files" }, origin);
  if (filesIn.length > MAX_FILES) return json(400, { error: "too_many_files" }, origin);
  // Eén keer decoderen: controleert meteen of het geldige base64 is.
  const files: Checked[] = [];
  let total = 0;
  for (const f of filesIn) {
    const type = String(f?.type || "");
    const data = String(f?.data || "");
    if (!data || !(IMAGE_TYPES.includes(type) || type === "application/pdf")) return json(400, { error: "unsupported_type" }, origin);
    if (data.length > Math.ceil(((type === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES) * 4) / 3) + 4) return json(413, { error: "file_too_large" }, origin);
    let bytes: Uint8Array;
    try { bytes = decodeBase64(data); } catch { return json(400, { error: "invalid_data" }, origin); }
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) return json(413, { error: "file_too_large" }, origin);
    files.push({ type, data, bytes });
  }

  const { data: prof, error: profErr } = await supabase.from("profiles")
    .select("id, country_code, deactivated_at").eq("id", ownerId).maybeSingle();
  if (profErr) return json(500, { error: "db_error" }, origin);
  if (!prof) return json(404, { error: "no_profile" }, origin);
  if (prof.deactivated_at) return json(403, { error: "salon_deactivated" }, origin);

  // Daglimiet en nieuwe poging in één stap (met een slot per salon).
  const { data: importId, error: beginErr } = await supabase.rpc("price_list_import_begin", { p_owner: ownerId, p_model: MODEL, p_limit: DAILY_LIMIT });
  if (beginErr) { console.error("parse-price-list: begin mislukt", beginErr); return json(500, { error: "db_error" }, origin); }
  if (!importId) return json(429, { error: "rate_limited" }, origin);

  // Bewaren voor de beheerder (niet fataal: het lezen gaat gewoon door).
  const stored: Array<{ path: string; type: string; size: number }> = [];
  for (let i = 0; i < files.length; i++) {
    const path = `${ownerId}/${importId}/${i + 1}.${EXT[files[i].type]}`;
    const { error } = await supabase.storage.from("price-lists").upload(path, files[i].bytes, { contentType: files[i].type, upsert: true });
    if (error) console.error("parse-price-list: bewaren mislukt", path, error.message);
    else stored.push({ path, type: files[i].type, size: files[i].bytes.length });
  }
  await finish(importId, { files: stored });

  if (!ANTHROPIC_API_KEY) {
    await finish(importId, { status: "failed", error: "not_configured" });
    return json(503, { error: "not_configured", import_id: importId }, origin);
  }

  const work = readWithClaude(importId, files, lang, String(prof.country_code || "NL")).catch(async (e) => {
    console.error("parse-price-list: onverwachte fout", e);
    await finish(importId, { status: "failed", error: `crash: ${String(e instanceof Error ? e.message : e).slice(0, 300)}` });
  });
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
  else await work; // lokaal zonder EdgeRuntime: gewoon wachten
  return json(202, { import_id: importId, status: "processing" }, origin);
});
