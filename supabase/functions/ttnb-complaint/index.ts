// Public student-complaint endpoint for the Tammy Taylor Bonaire site.
// No JWT: protected by a strict CORS allowlist, input validation, length
// caps and a honeypot. Only ever emails the fixed academy inbox.
// Reuses the shared Resend key (verified vellu.cc sender) — see mirah-contact.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const TO = "info@tammytaylorbonairebes.com";
const FROM = "Bonaire Beauty Academy <noreply@vellu.cc>";
const ALLOWED_ORIGINS = [
  "https://tammytaylorbonairebes.com",
  "https://www.tammytaylorbonairebes.com",
  "https://tammytaylor-bonaire.vercel.app",
  "http://localhost:4173",
];

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
  const studentId = String(body.studentId ?? "").trim().slice(0, 150);
  const phone = String(body.phone ?? "").trim().slice(0, 60);
  const date = String(body.date ?? "").trim().slice(0, 40);
  const subject = String(body.subject ?? "").trim().slice(0, 200);
  const description = String(body.description ?? "").trim().slice(0, 5000);
  const resolution = String(body.resolution ?? "").trim().slice(0, 3000);
  const declaration = body.declaration ? "Confirmed true and complete" : "Not confirmed";

  if (!name || name.length < 2) return json({ error: "invalid_name" }, 400, headers);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "invalid_email" }, 400, headers);
  if (!subject) return json({ error: "invalid_subject" }, 400, headers);
  if (description.length < 10) return json({ error: "description_too_short" }, 400, headers);
  if (!RESEND_KEY) return json({ error: "not_configured" }, 500, headers);

  const row = (label: string, value: string) =>
    value ? `<tr><td style="padding:6px 0;color:#888;width:150px;vertical-align:top;">${label}</td><td style="padding:6px 0;">${esc(value)}</td></tr>` : "";

  const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#1a1a1a;">
    <h2 style="font-weight:400;font-size:20px;margin:0 0 4px;">New student complaint — Bonaire Beauty Academy</h2>
    <p style="color:#888;font-size:13px;margin:0 0 24px;">Submitted via tammytaylorbonairebes.com</p>
    <div style="background:#fbe9ee;border-radius:12px;padding:20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${row("Full name", name)}
        ${row("Student ID / Training", studentId)}
        ${row("Email", email)}
        ${row("Phone", phone)}
        ${row("Date", date)}
        ${row("Subject", subject)}
      </table>
    </div>
    <p style="color:#888;font-size:13px;margin:0 0 6px;">Description of concern</p>
    <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:14px;line-height:1.6;margin-bottom:16px;">${esc(description)}</div>
    ${resolution ? `<p style="color:#888;font-size:13px;margin:0 0 6px;">Suggested resolution</p><div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:14px;line-height:1.6;margin-bottom:16px;">${esc(resolution)}</div>` : ""}
    <p style="color:#aaa;font-size:12px;">Declaration: ${esc(declaration)}</p>
    <p style="color:#aaa;font-size:11px;margin-top:20px;">Reply to this email to answer ${esc(name)} directly.</p>
  </div>`;

  const text = `New student complaint — Bonaire Beauty Academy\n\n` +
    `Full name: ${name}\nStudent ID / Training: ${studentId}\nEmail: ${email}\nPhone: ${phone}\nDate: ${date}\nSubject: ${subject}\n\n` +
    `Description of concern:\n${description}\n\n` +
    (resolution ? `Suggested resolution:\n${resolution}\n\n` : "") +
    `Declaration: ${declaration}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        reply_to: email,
        subject: `Student complaint - ${subject} - ${name}`.slice(0, 150),
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
    console.error("ttnb-complaint error:", e);
    return json({ error: "send_failed" }, 500, headers);
  }
});
