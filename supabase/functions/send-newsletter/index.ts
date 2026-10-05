// supabase/functions/send-newsletter/index.ts
//
// Lets a salon owner send a newsletter to their own clients.
//
// "Clients of this salon" = every distinct client_email that has an
// appointment with this owner, PLUS every imported / manually-added client
// (manual_clients) — so a salon that just imported its list can reach them
// even before they've booked. The recipient list is derived SERVER-SIDE from
// the owner's own data — the client never sends a recipient list, so an owner
// can only ever email their own clients.
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

// Alle rijen, niet de eerste 1000 (E2-03). PostgREST geeft per verzoek hooguit
// 1000 rijen; Tammy Taylor Bonaire heeft er bijna 2000 in manual_clients, dus
// "Alle klanten" bereikte de helft en de teller zei 1000. Pagina voor pagina
// met een vaste volgorde, zoals fetchAllRows in de app. build() levert elke
// keer een NIEUWE query met een .order().
async function fetchAll(build: () => any, pageSize = 1000): Promise<{ data: any[]; error: any }> {
  const out: any[] = [];
  for (let page = 0; page < 200; page++) {
    const { data, error } = await build().range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: out, error: null };
}

// Afmeldtoken: 32 willekeurige bytes, hex. Geen e-mailadres in de link.
function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const UNSUB_URL = (token: string) => `https://vellu.cc/api/unsubscribe?t=${token}`;

// Afmeldingen van deze salon: e-mail (kleine letters) → token + afgemeld-sinds.
async function loadOptOuts(ownerId: string) {
  const { data, error } = await fetchAll(() => supabase
    .from("newsletter_opt_outs")
    .select("email, token, opted_out_at")
    .eq("owner_id", ownerId)
    .order("token"));
  const map = new Map<string, { token: string; opted_out_at: string | null }>();
  for (const r of data || []) {
    const em = String(r.email || "").trim().toLowerCase();
    if (em) map.set(em, { token: String(r.token), opted_out_at: r.opted_out_at || null });
  }
  return { map, error };
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
  const { data: appts, error: apptErr } = await fetchAll(() => supabase
    .from("appointments")
    .select("id, client_email, date, status")
    .eq("owner_id", ownerId)
    .order("id"));
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
    // Also require ASCII: Resend's batch endpoint rejects the ENTIRE batch with
    // a 422 if any single "to" has a non-ASCII char (e.g. an accented import
    // like "guísela@…"), so one bad address would silently sink all recipients.
    if (!em || !validEmail.test(em) || /[^\x00-\x7F]/.test(em)) continue;
    const d = String(a.date || "");
    if (!d) continue;
    const agg = byEmail[em] || { first: d, last: d, completed: 0 };
    if (d < agg.first) agg.first = d;
    if (d > agg.last) agg.last = d;
    if (a.status === "completed") agg.completed++;
    byEmail[em] = agg;
  }

  const today = new Date().toISOString().slice(0, 10);

  // Also include imported / manually-added clients (manual_clients). A salon
  // that just imported its client list — whose clients haven't booked through
  // Vellu yet — must still be able to reach them (e.g. to announce the new
  // booking page). These have no appointment history, so we treat their import
  // date as both first-seen and last-seen, with 0 completed visits. Result:
  // they're always in "all", never in "loyal", and count as "new" when
  // recently imported. Hidden (soft-deleted) rows are skipped.
  const { data: manual, error: manErr } = await fetchAll(() => supabase
    .from("manual_clients")
    .select("id, email, created_at, hidden")
    .eq("owner_id", ownerId)
    .order("id"));
  if (manErr) return json(500, { error: "db_error" }, origin);
  for (const m of manual || []) {
    if (m.hidden) continue;
    const em = String(m.email || "").trim().toLowerCase();
    // Also require ASCII: Resend's batch endpoint rejects the ENTIRE batch with
    // a 422 if any single "to" has a non-ASCII char (e.g. an accented import
    // like "guísela@…"), so one bad address would silently sink all recipients.
    if (!em || !validEmail.test(em) || /[^\x00-\x7F]/.test(em)) continue;
    const d = String(m.created_at || "").slice(0, 10) || today;
    if (byEmail[em]) {
      // Client also booked — keep the richer appointment history, but let an
      // earlier import date widen the "first seen" window.
      if (d && d < byEmail[em].first) byEmail[em].first = d;
    } else {
      byEmail[em] = { first: d, last: d, completed: 0 };
    }
  }

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

  const segmentEmails = Object.entries(byEmail)
    .filter(([, agg]) => passes(agg))
    .map(([em]) => em);

  // AFMELDEN (E2-08). De voettekst beloofde "reageer om je af te melden", maar
  // er bestond nergens een afmeldlijst: wie ooit boekte, kreeg alles opnieuw.
  // Nu krijgt elke ontvanger per salon een eigen token in newsletter_opt_outs;
  // de link in de mail (api/unsubscribe) zet opted_out_at en vanaf dan valt dat
  // adres hier af — ook als het uit een afspraak komt.
  const { map: optOuts, error: optErr } = await loadOptOuts(ownerId);
  if (optErr) {
    console.error("newsletter_opt_outs lezen mislukt:", optErr.message || optErr);
    // Versturen zonder te weten wie zich afmeldde kan niet; alleen de telling
    // mag zonder (dan telt een afgemeld adres nog even mee).
    if (!previewOnly) return json(500, { error: "db_error" }, origin);
  }
  const emails = segmentEmails.filter((em) => !optOuts.get(em)?.opted_out_at);

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

  // Elke ontvanger zonder token krijgt er nu een. Daarna opnieuw lezen: een
  // gelijktijdige verzending kan intussen zelf een token hebben gemaakt (de
  // unieke index op (owner_id, lower(email)) houdt dan de eerste), en iemand kan
  // zich net hebben afgemeld.
  const missing = emails.filter((em) => !optOuts.has(em));
  for (let i = 0; i < missing.length; i += 500) {
    const rows = missing.slice(i, i + 500).map((em) => ({ owner_id: ownerId, email: em, token: newToken() }));
    const { error: insErr } = await supabase.from("newsletter_opt_outs").insert(rows);
    if (insErr) {
      // Eén botsing laat de hele partij vallen; dan per rij, botsingen negeren.
      for (const r of rows) {
        const { error: oneErr } = await supabase.from("newsletter_opt_outs").insert(r);
        if (oneErr && oneErr.code !== "23505") console.error("afmeldtoken aanmaken mislukt:", oneErr.message);
      }
    }
  }
  const { map: tokens, error: tokErr } = await loadOptOuts(ownerId);
  if (tokErr) return json(500, { error: "db_error" }, origin);
  // Zonder token geen afmeldlink, en dan sturen we niet.
  const recipients = emails
    .filter((em) => !tokens.get(em)?.opted_out_at)
    .map((em) => ({ to: em, token: tokens.get(em)?.token || "" }))
    .filter((r) => /^[0-9a-f]{64}$/.test(r.token));
  const optedNow = emails.filter((em) => !!tokens.get(em)?.opted_out_at).length;
  const total = emails.length - optedNow;
  const noToken = total - recipients.length;
  if (noToken > 0) console.error(`newsletter: ${noToken} ontvanger(s) zonder afmeldtoken overgeslagen`);

  // Build the branded HTML body.
  const logo = safeImg(profile.logo_url);
  const header = logo
    // Alleen de breedte begrenzen (max-width én max-height samen plet het logo)
    // en een wit kaartje eronder voor de donkere modus. Zie send-emails.
    ? `<div style="text-align:center;margin-bottom:28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:separate;"><tr><td style="background:#ffffff;border-radius:14px;padding:14px 18px;text-align:center;"><img src="${esc(logo)}" alt="${esc(salonName)}" style="width:auto;height:auto;max-width:180px;display:block;border:0;" /></td></tr></table></div>`
    : `<div style="text-align:center;margin-bottom:28px;"><div style="font-size:26px;font-weight:600;color:#1a1a1a;">${esc(salonName)}</div></div>`;
  const bodyHtml = esc(message).replace(/\r?\n/g, "<br>");
  // Per ontvanger een eigen afmeldlink in de voettekst (nl/en/es).
  const htmlFor = (token: string) => {
    const u = esc(UNSUB_URL(token));
    return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1a1a1a;background:#ffffff;">
    ${header}
    <div style="width:40px;height:1px;background:#c9a96e;margin:0 auto 28px;"></div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 18px;color:#1a1a1a;">${esc(subject)}</h1>
    <div style="font-size:15px;line-height:1.7;color:#333;">${bodyHtml}</div>
    <div style="margin-top:36px;padding-top:18px;border-top:1px solid #eee;font-size:11px;color:#999;line-height:1.6;">
      ${esc(salonName)}${profile.slug ? ` &middot; <a href="https://vellu.cc/${esc(profile.slug)}" style="color:#c9a96e;text-decoration:none;">vellu.cc/${esc(profile.slug)}</a>` : ""}<br>
      Je ontvangt deze e-mail omdat je klant bent bij ${esc(salonName)}. <a href="${u}" style="color:#999;">Afmelden voor deze nieuwsbrief</a><br>
      <span style="color:#bbb;">You're receiving this because you're a client of ${esc(salonName)}. <a href="${u}" style="color:#bbb;">Unsubscribe</a></span><br>
      <span style="color:#bbb;">Recibes este correo porque eres cliente de ${esc(salonName)}. <a href="${u}" style="color:#bbb;">Darse de baja</a></span>
    </div>
  </div>`;
  };
  // List-Unsubscribe met een https-link + One-Click (RFC 8058): Gmail en Yahoo
  // eisen dat sinds 2024 voor bulkmail, en hun "Afmelden"-knop roept dan
  // rechtstreeks api/unsubscribe aan. Daarvoor stond hier een mailto naar de
  // salon, en wie zo afmeldde bleef gewoon mail krijgen.
  const unsubHeaders = (token: string) => ({
    "List-Unsubscribe": `<${UNSUB_URL(token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });

  // Send in batches of 100 via Resend's batch endpoint. Each entry is an
  // individual email (single recipient) so addresses stay private.
  let sent = 0;
  const errors: { status: number; body: string }[] = [];
  const CHUNK = 100;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    const payload = chunk.map(({ to, token }) => ({
      from: `${salonName} <${FROM_ADDRESS}>`,
      to: [to],
      subject,
      html: htmlFor(token),
      ...(replyTo ? { reply_to: replyTo } : {}),
      headers: unsubHeaders(token),
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
        errors.push({ status: res.status, body: errText.slice(0, 400) });
        console.error("Resend batch error:", res.status, errText);
        // Batch is all-or-nothing — a single invalid address rejects the whole
        // batch. Fall back to individual sends so the good addresses still get
        // the email and only the bad one is dropped.
        for (const { to, token } of chunk) {
          try {
            const single = {
              from: `${salonName} <${FROM_ADDRESS}>`,
              to: [to],
              subject,
              html: htmlFor(token),
              ...(replyTo ? { reply_to: replyTo } : {}),
              headers: unsubHeaders(token),
            };
            const r = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify(single),
            });
            if (r.ok) sent++;
          } catch { /* skip this recipient */ }
        }
      }
    } catch (e) {
      errors.push({ status: 0, body: String(e).slice(0, 400) });
      console.error("Resend batch exception:", e);
    }
  }

  // Report the real outcome so the dashboard can show a failure instead of a
  // false "sent!" — a 200 with sent:0 + errors means Resend rejected the batch.
  return json(200, { sent, total, failed: total - sent, segment, errors: errors.slice(0, 3) }, origin);
});
