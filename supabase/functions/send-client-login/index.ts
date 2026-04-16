// supabase/functions/send-client-login/index.ts
// Sends a 6-digit login code to a client's email for the client dashboard.
//
// Security-hardened:
//   - CORS locked to known origins
//   - Always returns 200 on valid email format (prevents email enumeration)
//   - Rate limited per IP + per email
//   - Escapes client first_name in HTML
//   - Generic error messages — no internal details leaked

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Rate limit per IP: max 10 login code sends per hour
// Rate limit per email: max 3 login code sends per hour (prevent spamming a victim)
const IP_LIMIT: Map<string, { count: number; resetAt: number }> = new Map();
const EMAIL_LIMIT: Map<string, { count: number; resetAt: number }> = new Map();
const HOUR_MS = 60 * 60 * 1000;

function checkLimit(map: Map<string, { count: number; resetAt: number }>, key: string, max: number): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || entry.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + HOUR_MS });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkLimit(IP_LIMIT, ip, 10)) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const raw = String(body.email || "").trim().toLowerCase();

    // Validate email format but ALWAYS return success if format is valid —
    // otherwise an attacker can enumerate which emails are in our DB.
    if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return new Response(
        JSON.stringify({ error: "invalid_email_format" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Per-email rate limit
    if (!checkLimit(EMAIL_LIMIT, raw, 3)) {
      // Still return success to prevent timing-based enumeration
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Find client — but don't reveal whether they exist via status code
    const { data: client } = await supabase
      .from("clients")
      .select("id, first_name")
      .eq("email", raw)
      .maybeSingle();

    if (!client) {
      // Pretend we sent an email. Take roughly the same time as the real path
      // would (a few ms) so timing doesn't leak.
      await new Promise((r) => setTimeout(r, 150));
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Generate 6-digit code
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const code = String(100000 + (randomBytes[0] % 900000));

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: tokenError } = await supabase
      .from("client_tokens")
      .insert({
        client_id: client.id,
        email: raw,
        token: code,
        expires_at: expiresAt,
        used: false,
      });

    if (tokenError) {
      console.error("Token insert error:", tokenError);
      // Still pretend success externally
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const greetingName = client.first_name ? ` ${esc(client.first_name)}` : "";

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vellu <noreply@vellu.cc>",
        to: [raw],
        subject: `Je inlogcode: ${code}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 32px 24px; color: #1a1714;">
            <div style="text-align: center; margin-bottom: 28px;">
              <div style="font-size: 24px; font-weight: 300; letter-spacing: 0.18em; color: #c9a96e;">vellu</div>
            </div>
            <p style="font-size: 15px; margin-bottom: 8px;">Hoi${greetingName},</p>
            <p style="font-size: 14px; color: #555; line-height: 1.5; margin-bottom: 24px;">
              Gebruik onderstaande code om je afspraken te bekijken:
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <div style="display: inline-block; background: #f8f7f5; border: 2px solid #c9a96e; border-radius: 16px; padding: 20px 40px;">
                <div style="font-size: 36px; font-weight: 600; letter-spacing: 0.4em; color: #1a1714; font-family: monospace;">
                  ${code}
                </div>
              </div>
            </div>
            <p style="font-size: 12px; color: #999; text-align: center; margin-top: 20px;">
              Deze code is 5 minuten geldig.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />
            <p style="font-size: 11px; color: #bbb; text-align: center;">
              Heb je dit niet aangevraagd? Je kunt deze email veilig negeren.
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      console.error("Resend error:", await emailRes.text().catch(() => ""));
      // Still return success to avoid leaking which branch we took
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});
