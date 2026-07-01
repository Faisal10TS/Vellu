// supabase/functions/send-newsletter/index.ts
//
// Lets a salon owner send a newsletter to their own clients.
//
// "Clients of this salon" = every distinct client_email that has an
// appointment with this owner (same definition the CSV export uses). The
// recipient list is derived SERVER-SIDE from the owner's appointments — the
// client never sends a recipient list, so an owner can only ever email their
// own clients.
//
// Each recipient gets an INDIVIDUAL email (no BCC) so client addresses are
// never exposed to each other. Sent in batches via Resend's batch endpoint.
//
// Auth: requires a valid Supabase JWT (the owner).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_ADDRESS = "noreply@vellu.cc";

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

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeImg(url: unknown): string | null {
  if (!url || typeof url !== "string") return null;
  try { const u = new URL(url); return (u.protocol === "https:" || u.protocol === "http:") ? u.toString() : null; }
  catch { return null; }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);
  if (!RESEND_API_KEY) return json(500, { error: "email_not_configured" }, origin);

  // Auth — owner JWT
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "no_auth" }, origin);
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json(401, { error: "invalid_auth" }, origin);
  const ownerId = userData.user.id;

  // Parse + validate
  let body: { subject?: string; message?: string; segment?: string; preview_only?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }, origin); }
  const subject = String(body.subject || "").trim().slice(0, 200);
  const message = String(body.message || "").trim().slice(0, 5000);
  const segment = String(body.segment || "all").toLowerCase();
  const previewOnly = body.preview_only === true;
  if (!["all", "loyal", "new", "dormant"].includes(segment)) return json(400, { error: "invalid_segment" }, origin);
  // Subject + message are only required when actually sending; a preview
  // just needs the segment so the client can display an accurate count.
  if (!previewOnly) {
    if (!subject) return json(400, { error: "missing_subject" }, origin);
    if (!message) return json(400, { error: "missing_message" }, origin);
  }

  // Owner profile (for branding + reply-to)
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, email, salon_email, logo_url, slug")
    .eq("id", ownerId)
    .maybeSingle();
  if (!profile) return json(404, { error: "no_profile" }, origin);

  const salonName = profile.business_name || "Vellu";
  const replyTo = profile.salon_email || profile.email || undefined;

  // Recipients = distinct client emails from this owner's appointments.
  // We now also fetch date + status because segments key off appointment
  // history (visit count, first-seen, last-seen).
  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select("client_email, date, status")
    .eq("owner_id", ownerId);
  if (apptErr) return json(500, { error: "db_error" }, origin);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Aggregate per client: first seen, last seen, and how many completed visits
  // count toward "loyal". Cancelled / no-show rows still contribute to the
  // "ever booked" set (so a dormant client with 3 cancellations still shows
  // up in dormant), but only completed visits count for loyalty tier.
  type Agg = { first: string; last: string; completed: number };
  const byEmail: Record<string, Agg> = {};
  for (const a of appts || []) {
    const em = String(a.client_email || "").trim().toLowerCase();
    if (!em || !validEmail.test(em)) continue;
    const d = String(a.date || "");
    if (!d) continue;
    const agg = byEmail[em] || { first: d, last: d, completed: 0 };
    if (d < agg.first) agg.first = d;
    if (d > agg.last) agg.last = d;
    if (a.status === "completed") agg.completed++;
    byEmail[em] = agg;
  }

  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const cutoffLoyal = 5; // completed visits
  const cutoffNewDays = 30; // first-seen within last N days
  const cutoffDormantDays = 60; // last-seen more than N days ago
  const newCutoff = daysAgo(cutoffNewDays);
  const dormantCutoff = daysAgo(cutoffDormantDays);

  const passes = (agg: Agg) => {
    if (segment === "all") return true;
    if (segment === "loyal") return agg.completed >= cutoffLoyal;
    if (segment === "new") return agg.first >= newCutoff;
    if (segment === "dormant") return agg.last < dormantCutoff && agg.last <= today;
    return false;
  };

  const emails = Object.entries(byEmail)
    .filter(([, agg]) => passes(agg))
    .map(([em]) => em);

  // Preview mode: just return the count without touching Resend. The client
  // uses this to update the recipient badge next to the segment selector.
  if (previewOnly) {
    return json(200, {
      sent: 0,
      total: emails.length,
      segment,
      preview: true,
    }, origin);
  }

  if (emails.length === 0) return json(200, { sent: 0, total: 0, segment }, origin);

  // Build the branded HTML body.
  const logo = safeImg(profile.logo_url);
  const header = logo
    ? `<div style="text-align:center;margin-bottom:28px;"><img src="${esc(logo)}" alt="${esc(salonName)}" style="max-height:56px;max-width:200px;" /></div>`
    : `<div style="text-align:center;margin-bottom:28px;"><div style="font-size:26px;font-weight:600;color:#1a1a1a;">${esc(salonName)}</div></div>`;
  const bodyHtml = esc(message).replace(/\r?\n/g, "<br>");
  const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1a1a1a;background:#ffffff;">
    ${header}
    <div style="width:40px;height:1px;background:#c9a96e;margin:0 auto 28px;"></div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 18px;color:#1a1a1a;">${esc(subject)}</h1>
    <div style="font-size:15px;line-height:1.7;color:#333;">${bodyHtml}</div>
    <div style="margin-top:36px;padding-top:18px;border-top:1px solid #eee;font-size:11px;color:#999;line-height:1.6;">
      ${esc(salonName)}${profile.slug ? ` &middot; <a href="https://vellu.cc/${esc(profile.slug)}" style="color:#c9a96e;text-decoration:none;">vellu.cc/${esc(profile.slug)}</a>` : ""}<br>
      Je ontvangt deze e-mail omdat je klant bent bij ${esc(salonName)}. Reageer op deze mail om je af te melden.<br>
      <span style="color:#bbb;">You're receiving this because you're a client of ${esc(salonName)}. Reply to unsubscribe.</span>
    </div>
  </div>`;

  // Send in batches of 100 via Resend's batch endpoint. Each entry is an
  // individual email (single recipient) so addresses stay private.
  let sent = 0;
  const CHUNK = 100;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunk = emails.slice(i, i + CHUNK);
    const payload = chunk.map((to) => ({
      from: `${salonName} <${FROM_ADDRESS}>`,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        sent += chunk.length;
      } else {
        const errText = await res.text();
        console.error("Resend batch error:", res.status, errText);
      }
    } catch (e) {
      console.error("Resend batch exception:", e);
    }
  }

  return json(200, { sent, total: emails.length, segment }, origin);
});
