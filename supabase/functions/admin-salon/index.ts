// supabase/functions/admin-salon/index.ts
//
// De beheerder (vellu.cc/admin → Salons) deactiveert, heractiveert of
// verwijdert een salon (Faisal 23-10-2026: "there should also be a button where
// i can delete a salon … maybe a salon wants to get deactivated"). Gekozen:
// eerst deactiveren (terug te draaien), daarna pas definitief verwijderen.
//
// POST { action, owner_id, reason?, confirm? } met een beheerders-JWT.
//
//  deactivate — stopt Mollie (alle lopende abonnementen + machtigingen; lukt
//    dat niet, dan verandert er niets), zet profiles.deactivated_at, leegt de
//    agenda-feedtokens, blokkeert de logins van eigenaar en teamleden (ban) en
//    haalt hun pushabonnementen weg. Alle gegevens blijven. De boekingspagina,
//    homepage, mails aan klanten en de app kijken naar deactivated_at. De
//    reden staat in salon_deactivation_notes (alleen service_role). Werkt de
//    eigenaar-login ook als teamlid bij een andere salon, dan blijft die login
//    open (en verwijderen wordt geweigerd).
//  reactivate — wist deactivated_at en heft de blokkade op. Mollie wordt NIET
//    hervat: is de betaalde periode voorbij, dan kiest de salon in de app
//    opnieuw een abonnement.
//  delete — alleen na deactiveren, en confirm moet de salonnaam of slug zijn.
//    Legt de klantgegevens op Vellu's facturen vast (die blijven 7 jaar, zie
//    migratie 20261023095146), schrijft deleted_salons, verwijdert de Mollie-
//    klant, de bestanden in storage, de login van de eigenaar (alles in de
//    database gaat via de cascade mee) en van de teamleden, en tot slot
//    klanten die alleen bij deze salon boekten.
//
// Auth: verify_jwt=false (config.toml); de functie controleert zelf of de
// aanroeper in app_admins staat, zoals send-rating-request.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY") || "";
const MOLLIE_BASE_URL = "https://api.mollie.com/v2";
const ALLOWED_ORIGINS = ["https://vellu.cc", "https://www.vellu.cc", "http://localhost:5173", "http://localhost:4173", "http://localhost:4175"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = "876000h"; // ~100 jaar; "none" heft de blokkade op

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
const json = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

// Ingelogde beheerder? Geeft het user-id terug, anders null.
async function adminId(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt.length < 20) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;
  const { data: adm } = await supabase.from("app_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return adm ? data.user.id : null;
}

async function mollieFetch(path: string, init?: RequestInit) {
  const r = await fetch(`${MOLLIE_BASE_URL}${path}`, {
    ...init,
    headers: { "Authorization": `Bearer ${MOLLIE_API_KEY}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: r.status, ok: r.ok, data, raw: text };
}

// Kopie uit mollie-webhook / cancel-subscription: een abonnement stoppen, en
// een al gestopt abonnement ook als gelukt tellen.
const LIVE_SUB_STATUSES = ["pending", "active", "suspended"];
async function cancelMollieSubscription(customerId: string, subId: string): Promise<boolean> {
  const r = await mollieFetch(`/customers/${customerId}/subscriptions/${subId}`, { method: "DELETE" });
  if (r.ok || r.status === 404 || r.status === 410) return true;
  const g = await mollieFetch(`/customers/${customerId}/subscriptions/${subId}`);
  const st = g.ok && g.data && typeof g.data === "object" ? String((g.data as { status?: string }).status || "") : "";
  if (st && !LIVE_SUB_STATUSES.includes(st)) return true;
  console.error("admin-salon: mollie subscription cancel failed:", subId, r.status, r.raw);
  return false;
}

// Alles bij Mollie stoppen: elk lopend abonnement en elke geldige of nog
// lopende machtiging van deze klant. Geeft de mislukte stappen terug.
async function stopMollie(customerId: string): Promise<string[]> {
  const failed: string[] = [];
  const subs = await mollieFetch(`/customers/${customerId}/subscriptions?limit=250`);
  if (!subs.ok) {
    if (subs.status !== 404 && subs.status !== 410) failed.push(`abonnementen ophalen (${subs.status})`);
  } else {
    type SubList = { _embedded?: { subscriptions?: Array<{ id?: string; status?: string }> } };
    for (const s of ((subs.data as SubList)?._embedded?.subscriptions || [])) {
      if (!s?.id || !LIVE_SUB_STATUSES.includes(String(s.status || ""))) continue;
      if (!(await cancelMollieSubscription(customerId, s.id))) failed.push(`abonnement ${s.id}`);
    }
  }
  const mand = await mollieFetch(`/customers/${customerId}/mandates?limit=250`);
  if (!mand.ok) {
    if (mand.status !== 404 && mand.status !== 410) failed.push(`machtigingen ophalen (${mand.status})`);
  } else {
    type MandList = { _embedded?: { mandates?: Array<{ id?: string; status?: string }> } };
    for (const m of ((mand.data as MandList)?._embedded?.mandates || [])) {
      if (!m?.id || !["valid", "pending"].includes(String(m.status || ""))) continue;
      const d = await mollieFetch(`/customers/${customerId}/mandates/${m.id}`, { method: "DELETE" });
      if (!d.ok && d.status !== 404 && d.status !== 410) failed.push(`machtiging ${m.id} (${d.status})`);
    }
  }
  return failed;
}

// Logins van teamleden die bij deze salon horen: niet de eigenaar zelf, niet
// iemand met een eigen salon, niet iemand die ook bij een andere salon werkt,
// niet een beheerder. null = een opzoeking mislukte: dan liever niets doen dan
// de verkeerde login blokkeren.
async function staffUserIds(ownerId: string): Promise<string[] | null> {
  const { data, error } = await supabase.from("staff_members").select("user_id").eq("owner_id", ownerId).not("user_id", "is", null);
  if (error) { console.error("admin-salon: staff lookup failed:", error); return null; }
  const ids = [...new Set((data || []).map((r: { user_id: string }) => r.user_id).filter((id: string) => id && id !== ownerId))];
  const keep: string[] = [];
  for (const id of ids) {
    const [own, elsewhere, adm] = await Promise.all([
      supabase.from("profiles").select("id").eq("id", id).maybeSingle(),
      supabase.from("staff_members").select("id").eq("user_id", id).neq("owner_id", ownerId).limit(1),
      supabase.from("app_admins").select("user_id").eq("user_id", id).maybeSingle(),
    ]);
    if (own.error || elsewhere.error || adm.error) { console.error("admin-salon: staff check failed:", id, own.error || elsewhere.error || adm.error); return null; }
    if (!own.data && !(elsewhere.data || []).length && !adm.data) keep.push(id);
  }
  return keep;
}

// Werkt de login van de "eigenaar" ook als teamlid bij een ANDERE salon? Dat
// is een stylist met een leeg eigen profiel (aangemeld via het gewone
// formulier, daarna een uitnodiging geclaimd); App.jsx stuurt haar naar die
// andere salon. Die login dan niet blokkeren of verwijderen. null = mislukt.
async function ownerWorksElsewhere(ownerId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from("staff_members").select("id").eq("user_id", ownerId).neq("owner_id", ownerId).limit(1);
  if (error) { console.error("admin-salon: owner staff lookup failed:", error); return null; }
  return (data || []).length > 0;
}

async function setBan(ids: string[], duration: string): Promise<string[]> {
  const warnings: string[] = [];
  for (const id of ids) {
    const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: duration } as never);
    if (error && !/not.?found/i.test(String(error.message))) warnings.push(`login ${id.slice(0, 8)}: ${error.message}`);
  }
  return warnings;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  const admin = await adminId(req);
  if (!admin) return json(401, { error: "unauthorized" }, origin);

  let body: { action?: string; owner_id?: string; reason?: string; confirm?: string };
  try { body = (await req.json()) || {}; } catch { body = {}; }
  const action = String(body.action || "");
  const ownerId = String(body.owner_id || "");
  if (!["deactivate", "reactivate", "delete"].includes(action)) return json(400, { error: "bad_action" }, origin);
  if (!UUID_RE.test(ownerId)) return json(400, { error: "bad_owner_id" }, origin);
  if (ownerId === admin) return json(400, { error: "cannot_target_self" }, origin);

  const { data: p, error: pErr } = await supabase.from("profiles")
    .select("id, slug, business_name, is_demo, deactivated_at, mollie_customer_id, mollie_subscription_id")
    .eq("id", ownerId).maybeSingle();
  if (pErr) return json(500, { error: "db_error", detail: pErr.message }, origin);
  if (!p) return json(404, { error: "not_found" }, origin);
  if (p.is_demo) return json(400, { error: "demo" }, origin);

  // ── Deactiveren ────────────────────────────────────────────────────────
  if (action === "deactivate") {
    if (p.deactivated_at) return json(200, { ok: true, already: true }, origin);
    const reason = String(body.reason || "").trim().slice(0, 300) || null;
    // Wie er geblokkeerd wordt, eerst vaststellen: mislukt dat, dan niets doen.
    const [staff, elsewhere] = await Promise.all([staffUserIds(ownerId), ownerWorksElsewhere(ownerId)]);
    if (staff === null || elsewhere === null) return json(500, { error: "db_error", detail: "team lookup failed" }, origin);
    // Eerst Mollie: lukt dat niet, dan niets veranderen (anders denkt de admin
    // dat het gestopt is terwijl er nog afgeschreven kan worden).
    if (p.mollie_customer_id) {
      if (!MOLLIE_API_KEY) return json(500, { error: "config_error" }, origin);
      const failed = await stopMollie(String(p.mollie_customer_id));
      if (failed.length) return json(502, { error: "mollie_failed", detail: failed }, origin);
    }
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase.from("profiles").update({
      deactivated_at: nowIso,
      mollie_subscription_id: null,
      mollie_mandate_id: null,
      cancel_at_period_end: false,
      cancelled_at: nowIso,
      calendar_feed_token: null,
    }).eq("id", ownerId);
    if (upErr) return json(500, { error: "db_error", detail: upErr.message }, origin);
    const warnings: string[] = [];
    // De reden is alleen voor de beheerder: een eigen tabel, niet op profiles
    // (die rij leest de salon zelf).
    const { error: noteErr } = reason
      ? await supabase.from("salon_deactivation_notes").upsert({ owner_id: ownerId, reason, created_at: nowIso })
      : await supabase.from("salon_deactivation_notes").delete().eq("owner_id", ownerId);
    if (noteErr) warnings.push(`reason not saved: ${noteErr.message}`);
    const { error: stErr } = await supabase.from("staff_members").update({ calendar_feed_token: null }).eq("owner_id", ownerId);
    if (stErr) warnings.push(`staff calendar feeds: ${stErr.message}`);
    const logins = elsewhere ? staff : [ownerId, ...staff];
    if (elsewhere) warnings.push("the owner login is also a team member at another salon, so it stays active there");
    warnings.push(...await setBan(logins, BAN_FOREVER));
    if (logins.length) {
      const { error: pushErr } = await supabase.from("push_subscriptions").delete().in("user_id", logins);
      if (pushErr) warnings.push(`push notifications: ${pushErr.message}`);
    }
    return json(200, { ok: true, logins_blocked: logins.length, warnings }, origin);
  }

  // ── Heractiveren ───────────────────────────────────────────────────────
  if (action === "reactivate") {
    if (!p.deactivated_at) return json(200, { ok: true, already: true }, origin);
    // Eerst de blokkade opheffen, pas daarna de vlag wissen: mislukt het
    // opheffen, dan blijft de salon gedeactiveerd en kan de admin het gewoon
    // opnieuw proberen (anders bleef het team geblokkeerd zonder knop).
    // "none" op een login die nooit geblokkeerd was kan geen kwaad.
    const staff = await staffUserIds(ownerId);
    if (staff === null) return json(500, { error: "db_error", detail: "team lookup failed" }, origin);
    const banErrors = await setBan([ownerId, ...staff], "none");
    if (banErrors.length) return json(502, { error: "unban_failed", detail: banErrors }, origin);
    const { error: upErr } = await supabase.from("profiles").update({ deactivated_at: null }).eq("id", ownerId);
    if (upErr) return json(500, { error: "db_error", detail: upErr.message }, origin);
    const warnings: string[] = [];
    const { error: noteErr } = await supabase.from("salon_deactivation_notes").delete().eq("owner_id", ownerId);
    if (noteErr) warnings.push(`reason not removed: ${noteErr.message}`);
    return json(200, { ok: true, logins_unblocked: 1 + staff.length, warnings }, origin);
  }

  // ── Definitief verwijderen ─────────────────────────────────────────────
  if (!p.deactivated_at) return json(409, { error: "not_deactivated" }, origin);
  const norm = (s: unknown) => String(s || "").trim().toLowerCase();
  const confirm = norm(body.confirm);
  if (!confirm || (confirm !== norm(p.slug) && confirm !== norm(p.business_name))) {
    return json(400, { error: "confirm_mismatch" }, origin);
  }
  // Een login die bij een andere salon in het team staat, nooit verwijderen
  // (admin_salon_delete_prepare weigert het ook).
  const elsewhere = await ownerWorksElsewhere(ownerId);
  if (elsewhere === null) return json(500, { error: "db_error", detail: "team lookup failed" }, origin);
  if (elsewhere) return json(409, { error: "owner_is_staff_elsewhere" }, origin);
  const { data: plan, error: prepErr } = await supabase.rpc("admin_salon_delete_prepare", { p_owner: ownerId, p_by: admin });
  if (prepErr && /owner_is_staff_elsewhere/.test(prepErr.message || "")) return json(409, { error: "owner_is_staff_elsewhere" }, origin);
  if (prepErr || !plan) return json(500, { error: "prepare_failed", detail: prepErr?.message }, origin);
  const warnings: string[] = [];
  const staffIds: string[] = Array.isArray(plan.staff_user_ids) ? plan.staff_user_ids : [];
  const clientIds: string[] = Array.isArray(plan.client_ids) ? plan.client_ids : [];

  // Mollie-klant weg (stopt ook alles wat er nog liep). Niet fataal.
  if (plan.mollie_customer_id && MOLLIE_API_KEY) {
    const r = await mollieFetch(`/customers/${plan.mollie_customer_id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404 && r.status !== 410) warnings.push(`Mollie customer delete (${r.status})`);
  }

  // Bestanden: alleen via de Storage API (SQL-verwijderen is geblokkeerd).
  const files: Array<{ bucket: string; name: string }> = Array.isArray(plan.files) ? plan.files : [];
  let filesRemoved = 0;
  for (const bucket of ["business-images", "service-photos"]) {
    const names = files.filter((f) => f.bucket === bucket).map((f) => f.name);
    for (let i = 0; i < names.length; i += 100) {
      const part = names.slice(i, i + 100);
      const { data: rm, error: rmErr } = await supabase.storage.from(bucket).remove(part);
      if (rmErr) warnings.push(`files ${bucket}: ${rmErr.message}`);
      else filesRemoved += (rm || []).length;
    }
  }

  // De login van de eigenaar: daarmee gaat alles in de database mee (cascade),
  // behalve de facturen (owner_id wordt leeg, gegevens staan erop).
  const { error: delErr } = await supabase.auth.admin.deleteUser(ownerId);
  if (delErr) return json(500, { error: "delete_failed", detail: delErr.message, warnings }, origin);
  for (const id of staffIds) {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error && !/not.?found/i.test(String(error.message))) warnings.push(`staff login ${id.slice(0, 8)}: ${error.message}`);
  }

  const { data: fin, error: finErr } = await supabase.rpc("admin_salon_delete_finish", { p_owner: ownerId, p_user_ids: staffIds, p_client_ids: clientIds });
  if (finErr) warnings.push(`cleanup: ${finErr.message}`);

  return json(200, {
    ok: true,
    business_name: plan.business_name,
    removed: { ...(plan.counts || {}), files: filesRemoved, staff_logins: staffIds.length, clients: fin?.clients_deleted ?? 0 },
    invoices_kept: fin?.invoices_kept ?? plan.counts?.invoices_kept ?? 0,
    warnings,
  }, origin);
});
