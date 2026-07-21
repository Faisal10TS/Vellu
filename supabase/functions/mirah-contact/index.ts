// Public contact-form endpoint for the Mirah Ventures site.
// No JWT: protected instead by a strict CORS allowlist, input validation,
// length caps and a honeypot. Only ever emails the fixed internal inbox.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const TO = "mirahventures@vellu.cc";
const FROM = "Mirah Ventures <noreply@vellu.cc>";
const ALLOWED_ORIGINS = [
  "https://mirahventures.com",
  "https://www.mirahventures.com",
  "https://mirah-ventures.vercel.app",
  "http://localhost:4174",
];
const PURPOSES = ["Start a project", "General question", "Something else"];

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, headers);
  }

  // Honeypot: humans never see this field; bots that fill it get a fake success.
  if (String(body.website ?? "").trim() !== "") return json({ success: true }, 200, headers);

  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().slice(0, 200);
  const company = String(body.company ?? "").trim().slice(0, 150);
  const message = String(body.message ?? "").trim().slice(0, 3000);
  const purpose = PURPOSES.includes(String(body.purpose)) ? String(body.purpose) : PURPOSES[1];

  if (!name || name.length < 2) return json({ error: "invalid_name" }, 400, headers);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "invalid_email" }, 400, headers);
  if (message.length < 10) return json({ error: "message_too_short" }, 400, headers);
  if (!RESEND_KEY) return json({ error: "not_configured" }, 500, headers);

  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px 20px;color:#1a1a1a;">
    <h2 style="font-weight:400;font-size:20px;margin:0 0 4px;">New inquiry via mirahventures.com</h2>
    <p style="color:#888;font-size:13px;margin:0 0 24px;">${esc(purpose)}</p>
    <div style="background:#f4f6f9;border-radius:12px;padding:20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#888;width:90px;">Name</td><td style="padding:6px 0;">${esc(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Email</td><td style="padding:6px 0;">${esc(email)}</td></tr>
        ${company ? `<tr><td style=\"padding:6px 0;color:#888;\">Company</td><td style=\"padding:6px 0;\">${esc(company)}</td></tr>` : ""}
      </table>
    </div>
    <div style="background:#fff;border:1px solid #e5e9f0;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:14px;line-height:1.6;">${esc(message)}</div>
    <p style="color:#aaa;font-size:11px;margin-top:20px;">Reply to this email to answer ${esc(name)} directly.</p>
  </div>`;

  const text = `New inquiry via mirahventures.com (${purpose})\n\nName: ${name}\nEmail: ${email}\n${company ? `Company: ${company}\n` : ""}\n${message}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        reply_to: email,
        subject: `New inquiry - ${purpose} - ${name}`.slice(0, 150),
        html,
        text,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Resend error:", data);
      return json({ error: "send_failed" }, 502, headers);
    }
    return json({ success: true }, 200, headers);
  } catch (e) {
    console.error("mirah-contact error:", e);
    return json({ error: "send_failed" }, 500, headers);
  }
});
