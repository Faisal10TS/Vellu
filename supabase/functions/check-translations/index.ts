// supabase/functions/check-translations/index.ts
//
// Owner-only proofreader. Reads the salon's own service names (Dutch, English
// and — since 12-11-2026 — Spanish) and asks Claude to flag GENUINE typos and
// translations that don't mean the same thing, each with a suggested
// correction. Spanish was never checked before, and that is exactly where the
// old context-free machine translations went wrong ("Remove nails" → "quitar
// clavos", "Refill" → "Recambio", "Under arms" → "A las armas"). The owner reviews and applies fixes in the dashboard —
// nothing is auto-changed here. Beauty-industry jargon (wispy, PMU, foreign
// fill, refill, volume, hybrid, lamination, lash lift, …) is explicitly NOT
// flagged, so real style/term names are left alone.
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

// Fast + cheap is plenty for proofreading a short list of names.
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

const SYSTEM = `You are a meticulous proofreader for a beauty, nail and lash salon booking app. Each service has a Dutch name (name_nl), an English name (name_en) and a Spanish name (name_es). The owner typed one of them; the others were often machine-translated without context. Find GENUINE mistakes only:
- clear spelling typos (e.g. "Removel" -> "Removal", "lascher" -> "lashes")
- names in different languages that clearly do NOT mean the same thing
- obviously broken or machine-mangled wording, typically a word translated in its non-beauty sense. Real examples: "Remove nails" -> NL "Spijkers verwijderen" / ES "Quitar clavos" (hardware nails; must be "nagels" / "uñas"); "Under arms" -> "Onder de wapens" / "A las armas" (weapons; must be "Oksels" / "Axilas"); "Refill" -> ES "Recambio" (must be "Relleno"); "Plump" -> "Mollig" (it is a strengthening manicure)
- a field that is still in the wrong language (e.g. English text in name_nl or name_es)

DO NOT flag (these are correct, never report them):
- beauty-industry terms and lash/brow styles, in any of the three languages: wispy, PMU, foreign fill, infill, refill, fill, volume, mega volume, hybrid, classic, russian, lash lift, lamination, tint, tinting, brow lamination, cat eye, wet set, full set, lash, brow, set, one-by-one, BIAB, gel-x, polygel, sculpt, french, ombre, nail art, soak off
- loanwords salons really use: NL keeps many English terms (full set, refill, lash lift, nail art); ES may keep them too ("Lash lift", "BIAB", "Polygel")
- brand names, deliberate short labels, stylistic capitalisation
- an empty field (that is a missing translation, not a mistake)
- differences that are still both correct or a fair paraphrase

For each real problem return: the service id, which field ("name_nl", "name_en" or "name_es"), a corrected suggestion for that field, and a short reason (max 12 words) written in the language given in the user message. Fix the translated field, not the one the owner most likely typed: when the English name is fine and the Spanish one is wrong, report name_es. If everything is fine, return an empty list. Be conservative: only flag what a careful native speaker would clearly call a mistake.`;

const FIELDS = ["name_nl", "name_en", "name_es"] as const;
type Field = typeof FIELDS[number];
const REASON_LANG: Record<string, string> = { nl: "Dutch", en: "English", es: "Spanish" };

interface Svc { id: string; name_nl: string | null; name_en: string | null; name_es: string | null }

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

  // Interfacetaal van de eigenaar, alleen voor de korte uitleg per fout.
  let uiLang = "en";
  try {
    const body = await req.json();
    if (typeof body?.lang === "string" && REASON_LANG[body.lang]) uiLang = body.lang;
  } catch { /* lege body: Engels */ }

  const { data: services, error } = await supabase
    .from("services")
    .select("id, name_nl, name_en, name_es")
    .eq("owner_id", userId);
  if (error) return json(500, { error: "fetch_failed" }, origin);

  const items: Svc[] = (services || []).filter((s: Svc) => (s.name_nl || s.name_en || s.name_es));
  if (!items.length) return json(200, { issues: [] }, origin);

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const tool: Anthropic.Tool = {
      name: "report_issues",
      description: "Report genuine spelling or translation mistakes found in the service names.",
      input_schema: {
        type: "object",
        properties: {
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "the service id" },
                field: { type: "string", enum: [...FIELDS] },
                suggestion: { type: "string", description: "the corrected value for that field" },
                reason: { type: "string", description: "short reason, max 12 words" },
              },
              required: ["id", "field", "suggestion", "reason"],
            },
          },
        },
        required: ["issues"],
      },
    };

    const msg: any = await anthropic.messages.create({
      model: MODEL,
      // Drie talen = meer uitvoer; 1500 kon een lange lijst afkappen.
      max_tokens: 4000,
      system: SYSTEM,
      tools: [tool],
      tool_choice: { type: "tool", name: "report_issues" },
      messages: [
        { role: "user", content: `Write each reason in ${REASON_LANG[uiLang]}. Proofread these ${items.length} services and report only genuine mistakes:\n${JSON.stringify(items)}` },
      ],
    });

    const block = (msg.content || []).find((b: any) => b.type === "tool_use");
    const raw = Array.isArray(block?.input?.issues) ? block.input.issues : [];

    // Keep only issues that point at a real service and actually change the
    // current value — drop hallucinated ids or no-op "fixes".
    const byId = new Map(items.map((s) => [s.id, s]));
    // Ter vergelijking toont het scherm de naam in een andere taal: bij NL en
    // ES de Engelse, bij EN de Nederlandse (met terugval op wat er is).
    const otherOf = (s: Svc, f: Field) => {
      const order: Field[] = f === "name_en" ? ["name_nl", "name_es"] : ["name_en", f === "name_nl" ? "name_es" : "name_nl"];
      for (const o of order) if ((s[o] || "").trim()) return s[o] as string;
      return "";
    };
    const seen = new Set<string>();
    const issues = raw
      .filter((i: any) => i && byId.has(i.id) && FIELDS.includes(i.field) && typeof i.suggestion === "string")
      .map((i: any) => {
        const s = byId.get(i.id)!;
        const field = i.field as Field;
        return {
          id: i.id,
          field,
          current: s[field] || "",
          other: otherOf(s, field),
          suggestion: String(i.suggestion).trim(),
          reason: String(i.reason || "").slice(0, 140),
        };
      })
      // Leeg veld = ontbrekende vertaling, geen fout (zie SYSTEM); en geen
      // dubbele melding voor hetzelfde veld.
      .filter((i: any) => i.current.trim() && i.suggestion && i.suggestion !== i.current.trim())
      .filter((i: any) => { const k = i.id + i.field; if (seen.has(k)) return false; seen.add(k); return true; });

    return json(200, { issues, checked: items.length }, origin);
  } catch (e) {
    console.error("check-translations error:", e);
    return json(500, { error: "check_failed" }, origin);
  }
});
