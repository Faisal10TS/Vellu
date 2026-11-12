// supabase/functions/check-translations/index.ts
//
// Owner-only proofreader. Asks Claude to flag GENUINE typos and translations
// that don't say the same thing, each with a suggested correction. The owner
// reviews and applies fixes in the dashboard — nothing is auto-changed here.
// Beauty-industry jargon (wispy, PMU, foreign fill, refill, volume, hybrid,
// lamination, lash lift, …) is explicitly NOT flagged.
//
// What it reads:
// - until 12-11-2026: service names, Dutch + English;
// - 12-11-2026 (7d24900): + Spanish — exactly where the old context-free
//   machine translations went wrong ("Remove nails" → "quitar clavos",
//   "Refill" → "Recambio", "Under arms" → "A las armas");
// - 13-11-2026: with body {scope:"all"} also service descriptions, variants
//   (name + description) and extras (name). The 12-11 description round found
//   78 wrong fields there ("extensions hair" → "Sextensions-haar", "2x per
//   month" → "per week"), none of which the names-only check could see.
//   Names and descriptions go to the model in two parallel calls. Without
//   scope:"all" (an app version from before 13-11 still open in a tab) it
//   answers as before: service names only, in the old issue shape, because
//   that client can only save to the services table.
//
// Auth: a valid owner token is required (we only ever read THAT owner's own
// services, via service_role keyed on their verified uid). Needs the
// ANTHROPIC_API_KEY secret; returns {error:"not_configured"} if unset.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

// Fast + cheap is plenty for proofreading a salon's catalogue.
const MODEL = "claude-haiku-4-5";

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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

const SYSTEM = `You are a meticulous proofreader for a beauty, nail and lash salon booking app. The salon's catalogue has services, variants of a service (sizes, lengths, options) and add-on extras. Each has a name in Dutch (name_nl), English (name_en) and Spanish (name_es); services and variants can also have a description in the same three languages (description_nl, description_en, description_es). The owner typed one language; the others were often machine-translated without context. A missing key means that field is empty. Find GENUINE mistakes only:
- clear spelling typos (e.g. "Removel" -> "Removal", "lascher" -> "lashes", "celaning" -> "cleaning")
- texts in different languages that clearly do NOT say the same thing: a different meaning, or a different number, size, age, price, duration or frequency, or a sentence or condition that one language has and another lacks
- obviously broken or machine-mangled wording, typically a word translated in its non-beauty sense. Real examples: "Remove nails" -> NL "Spijkers verwijderen" / ES "Quitar clavos" (hardware nails; must be "nagels" / "uñas"); "Under arms" -> "Onder de wapens" / "A las armas" (weapons; must be "Oksels" / "Axilas"); "Refill" -> ES "Recambio" (must be "Relleno"); "Plump" -> "Mollig" (it is a strengthening manicure); "with extensions hair" -> "met Sextensions-haar" / "con pelo de Sextensions" (must be "met haarverlenging" / "con extensiones de pelo"); "lash fans" -> ES "mechones" (must be "abanicos"); "2x in one month" -> "twee keer per week" (wrong frequency); "Medium Fulani braids" -> "Grote Fulani-vlechten" (wrong size)
- a field that is still in the wrong language (e.g. English text in name_nl or description_nl)
- a text cut off in one language while the other languages are complete

DO NOT flag (these are correct, never report them):
- beauty-industry terms and lash/brow styles, in any of the three languages: wispy, PMU, foreign fill, infill, refill, fill, volume, mega volume, hybrid, classic, russian, lash lift, lamination, tint, tinting, brow lamination, cat eye, wet set, full set, lash, brow, set, one-by-one, BIAB, gel-x, polygel, sculpt, french, ombre, nail art, soak off, knotless, stitch braids, smedium
- loanwords salons really use: NL keeps many English terms (full set, refill, lash lift, nail art, clean look); ES may keep them too ("Lash lift", "BIAB", "Polygel")
- brand names, deliberate short labels, stylistic capitalisation, emoji
- an empty or missing field (that is a missing translation, not a mistake)
- grammar or style in the text the owner typed themselves, unless it is a clear spelling typo
- differences that are still both correct or a fair paraphrase

For each real problem return: the item ref, which field, the complete corrected text for that field (for a description: the whole description, not only the changed words; keep the owner's tone, line breaks and informal "you" form), and a short reason (max 12 words) written in the language given in the user message. Fix the translated field, not the one the owner most likely typed: when the English is fine and the Spanish is wrong, report the Spanish field. If everything is fine, return an empty list. Be conservative: only flag what a careful native speaker would clearly call a mistake.`;

const NAME_FIELDS = ["name_nl", "name_en", "name_es"] as const;
const DESC_FIELDS = ["description_nl", "description_en", "description_es"] as const;
type Field = typeof NAME_FIELDS[number] | typeof DESC_FIELDS[number];
type Table = "services" | "service_variants" | "service_extras";
type Row = { id: string } & Partial<Record<Field, string | null>>;
const REASON_LANG: Record<string, string> = { nl: "Dutch", en: "English", es: "Spanish" };

// Eén regel uit de catalogus zoals het model hem ziet (korte ref i.p.v. uuid:
// minder tokens en geen verzonnen ids) plus wat we nodig hebben om terug te
// vertalen naar tabel + rij.
interface Item { ref: string; table: Table; kind: "service" | "variant" | "extra"; row: Row; parent: Row | null }

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nameIn = (r: Row | null, lang: string) => {
  if (!r) return "";
  return clean(r[`name_${lang}` as Field]) || clean(r.name_en) || clean(r.name_nl) || clean(r.name_es);
};

// Ter vergelijking toont het scherm hetzelfde veld in een andere taal: bij NL
// en ES de Engelse, bij EN de Nederlandse (met terugval op wat er is).
function otherOf(r: Row, f: Field): { field: Field | null; text: string } {
  const base = f.slice(0, f.lastIndexOf("_"));
  const lg = f.slice(f.lastIndexOf("_") + 1);
  const order = lg === "en" ? ["nl", "es"] : ["en", lg === "nl" ? "es" : "nl"];
  for (const o of order) {
    const k = `${base}_${o}` as Field;
    if (clean(r[k])) return { field: k, text: r[k] as string };
  }
  return { field: null, text: "" };
}

function toolFor(fields: readonly Field[]): Anthropic.Tool {
  return {
    name: "report_issues",
    description: "Report genuine spelling or translation mistakes found in the salon's catalogue.",
    input_schema: {
      type: "object",
      properties: {
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ref: { type: "string", description: "the item ref, e.g. s3 or v12" },
              field: { type: "string", enum: [...fields] },
              suggestion: { type: "string", description: "the complete corrected text for that field" },
              reason: { type: "string", description: "short reason, max 12 words" },
            },
            required: ["ref", "field", "suggestion", "reason"],
          },
        },
      },
      required: ["issues"],
    },
  };
}

// Wat het model per regel te zien krijgt: lege velden weggelaten.
function payload(items: Item[], fields: readonly Field[]) {
  return items.map((it) => {
    const o: Record<string, string> = { ref: it.ref, kind: it.kind };
    if (it.parent) o.service = nameIn(it.parent, "en");
    for (const f of fields) if (clean(it.row[f])) o[f] = it.row[f] as string;
    return o;
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);
  if (!ANTHROPIC_API_KEY) return json(200, { error: "not_configured" }, origin);

  // Require a real owner token; we only ever read this owner's own services.
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  let userId: string | null = null;
  if (jwt) {
    try {
      const { data } = await supabase.auth.getUser(jwt);
      if (data?.user) userId = data.user.id;
    } catch { /* fall through to 401 */ }
  }
  if (!userId) return json(401, { error: "unauthorized" }, origin);

  // lang = interfacetaal (voor de uitleg per fout); scope "all" = nieuwe app
  // die varianten, extra's en omschrijvingen kan opslaan.
  let uiLang = "en";
  let full = false;
  try {
    const body = await req.json();
    if (typeof body?.lang === "string" && REASON_LANG[body.lang]) uiLang = body.lang;
    full = body?.scope === "all";
  } catch { /* lege body: Engels, alleen dienstnamen */ }

  const cols = [...NAME_FIELDS, ...DESC_FIELDS].join(", ");
  const { data: services, error } = await supabase
    .from("services")
    .select(full
      ? `id, ${cols}, service_variants(id, ${cols}), service_extras(id, ${NAME_FIELDS.join(", ")})`
      : `id, ${NAME_FIELDS.join(", ")}`)
    .eq("owner_id", userId);
  if (error) return json(500, { error: "fetch_failed" }, origin);

  const items: Item[] = [];
  let n = 0;
  for (const s of (services || []) as any[]) {
    items.push({ ref: `s${++n}`, table: "services", kind: "service", row: s, parent: null });
    if (!full) continue;
    for (const v of s.service_variants || []) items.push({ ref: `v${++n}`, table: "service_variants", kind: "variant", row: v, parent: s });
    for (const e of s.service_extras || []) items.push({ ref: `e${++n}`, table: "service_extras", kind: "extra", row: e, parent: s });
  }
  const hasAny = (it: Item, fields: readonly Field[]) => fields.some((f) => clean(it.row[f]));
  const nameItems = items.filter((it) => hasAny(it, NAME_FIELDS));
  // Omschrijvingen: alleen regels die er een hebben; de naam gaat mee als context.
  const descItems = full ? items.filter((it) => it.kind !== "extra" && hasAny(it, DESC_FIELDS)) : [];
  if (!nameItems.length && !descItems.length) return json(200, { issues: [], checked: 0 }, origin);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  let truncated = false;
  const ask = async (list: Item[], fields: readonly Field[], context: readonly Field[], what: string, maxTokens: number) => {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: SYSTEM,
      tools: [toolFor(fields)],
      tool_choice: { type: "tool", name: "report_issues" },
      messages: [{
        role: "user",
        content: `Write each reason in ${REASON_LANG[uiLang]}. ${what} Proofread these ${list.length} items and report only genuine mistakes:\n${JSON.stringify(payload(list, [...context, ...fields]))}`,
      }],
    });
    if (msg.stop_reason === "max_tokens") {
      // Afgekapt antwoord: wat binnen is tonen we, maar de lijst is niet compleet.
      truncated = true;
      console.warn("check-translations: max_tokens bereikt", what, list.length);
    }
    const block = msg.content.find((b) => b.type === "tool_use");
    const raw = block && block.type === "tool_use" ? (block.input as any)?.issues : null;
    return (Array.isArray(raw) ? raw : []).map((i: any) => ({ ...i, allowed: fields }));
  };

  // Namen en omschrijvingen tegelijk: samen zou één antwoord bij een grote
  // catalogus te lang worden (afkappen) en twee keer zo lang duren.
  const passes = [];
  if (nameItems.length) passes.push(ask(nameItems, NAME_FIELDS, [], "Check only the name fields.", 4000));
  if (descItems.length) {
    passes.push(ask(descItems, DESC_FIELDS, NAME_FIELDS, "Check only the description fields; the names are there for context, do not report them.", 8000));
  }
  const runs = await Promise.allSettled(passes);
  const failed = runs.filter((r) => r.status === "rejected");
  for (const r of failed) console.error("check-translations error:", (r as PromiseRejectedResult).reason);
  if (failed.length === runs.length) return json(500, { error: "check_failed" }, origin);
  const raw = runs.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Alleen meldingen die naar een bestaande regel en een toegestaan veld
  // wijzen en echt iets veranderen; lege velden zijn geen fout (zie SYSTEM)
  // en per veld maar één melding.
  const byRef = new Map(items.map((it) => [it.ref, it]));
  const seen = new Set<string>();
  const issues = [];
  for (const i of raw) {
    const it = i && typeof i.ref === "string" ? byRef.get(i.ref) : undefined;
    if (!it || !i.allowed.includes(i.field) || typeof i.suggestion !== "string") continue;
    if (it.table === "service_extras" && !NAME_FIELDS.includes(i.field)) continue;
    const field = i.field as Field;
    const current = (it.row[field] as string) || "";
    const suggestion = String(i.suggestion).trim();
    if (!current.trim() || !suggestion || suggestion === current.trim()) continue;
    const key = `${it.table}:${it.row.id}:${field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const other = otherOf(it.row, field);
    issues.push({
      key,
      table: it.table,
      id: it.row.id,
      serviceId: it.parent ? it.parent.id : it.row.id,
      field,
      label: it.parent ? `${nameIn(it.parent, uiLang)} · ${nameIn(it.row, uiLang)}` : nameIn(it.row, uiLang),
      current,
      other: other.text,
      otherField: other.field,
      suggestion,
      reason: String(i.reason || "").slice(0, 140),
    });
  }

  return json(200, { issues, checked: items.length, partial: failed.length > 0 || truncated }, origin);
});
