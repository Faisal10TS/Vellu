// supabase/functions/check-translations/index.ts
//
// Owner-only proofreader. Reads the salon's own service names (Dutch + English)
// and asks Claude to flag GENUINE typos / NL-EN mismatches, each with a
// suggested correction. The owner reviews and applies fixes in the dashboard —
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

const SYSTEM = `You are a meticulous proofreader for a beauty, nail and lash salon booking app. Each service has a Dutch name (name_nl) and an English name (name_en), typed by the salon owner. Find GENUINE mistakes only:
- clear spelling typos (e.g. "Removel" -> "Removal", "lascher" -> "lashes")
- a Dutch and English name that clearly do NOT mean the same thing
- obviously broken or machine-mangled wording

DO NOT flag (these are correct, never report them):
- beauty-industry terms and lash/brow styles: wispy, PMU, foreign fill, infill, refill, fill, volume, mega volume, hybrid, classic, russian, lash lift, lamination, tint, tinting, brow lamination, cat eye, wet set, full set, lash, brow, set, one-by-one
- brand names, deliberate short labels, stylistic capitalisation
- differences that are still both correct or a fair paraphrase

For each real problem return: the service id, which field ("name_nl" or "name_en"), a corrected suggestion for that field, and a short reason (max 12 words). If everything is fine, return an empty list. Be conservative: only flag what a careful native speaker would clearly call a mistake.`;

interface Svc { id: string; name_nl: string | null; name_en: string | null }

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

  const { data: services, error } = await supabase
    .from("services")
    .select("id, name_nl, name_en")
    .eq("owner_id", userId);
  if (error) return json(500, { error: "fetch_failed" }, origin);

  const items: Svc[] = (services || []).filter((s: Svc) => (s.name_nl || s.name_en));
  if (!items.length) return json(200, { issues: [] }, origin);

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const tool = {
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
                field: { type: "string", enum: ["name_nl", "name_en"] },
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
      max_tokens: 1500,
      system: SYSTEM,
      tools: [tool],
      tool_choice: { type: "tool", name: "report_issues" },
      messages: [
        { role: "user", content: `Proofread these ${items.length} services and report only genuine mistakes:\n${JSON.stringify(items)}` },
      ],
    });

    const block = (msg.content || []).find((b: any) => b.type === "tool_use");
    const raw = Array.isArray(block?.input?.issues) ? block.input.issues : [];

    // Keep only issues that point at a real service and actually change the
    // current value — drop hallucinated ids or no-op "fixes".
    const byId = new Map(items.map((s) => [s.id, s]));
    const issues = raw
      .filter((i: any) => i && byId.has(i.id) && (i.field === "name_nl" || i.field === "name_en") && typeof i.suggestion === "string")
      .map((i: any) => {
        const s = byId.get(i.id)!;
        const current = (i.field === "name_nl" ? s.name_nl : s.name_en) || "";
        const other = (i.field === "name_nl" ? s.name_en : s.name_nl) || "";
        return {
          id: i.id,
          field: i.field,
          current,
          other,
          suggestion: String(i.suggestion).trim(),
          reason: String(i.reason || "").slice(0, 140),
        };
      })
      .filter((i: any) => i.suggestion && i.suggestion !== (i.current || "").trim());

    return json(200, { issues, checked: items.length }, origin);
  } catch (e) {
    console.error("check-translations error:", e);
    return json(500, { error: "check_failed" }, origin);
  }
});
