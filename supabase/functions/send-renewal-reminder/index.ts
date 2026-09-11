// send-renewal-reminder — dagelijkse herinneringen rond aflopende toegang.
//
// 1. JAARABONNEES: een jaarabonnement is een EENMALIGE betaling (zie
//    create-subscription): geen doorlopende machtiging, dus geen automatische
//    incasso. Toegang loopt puur op profiles.plan_expires_at. Een week van
//    tevoren een mail met een knop om opnieuw te betalen. Maandabonnees raakt
//    dit niet: die hebben een Mollie-abonnement (mollie_subscription_id).
//
// 2. PROEFPERIODES (sinds 11-09-2026): hier ging eerder NIETS uit. Een salon
//    zag alleen "nog X dagen" onder Abonnement & account en werd op de dag zelf
//    zonder bericht uit het dashboard gezet (planIsActive kent geen coulance
//    voor proeven). Brilliant Beauty en Honeysets liepen zo op 10-09 blind uit
//    hun proef; de eerste probeerde 's avonds nog vijf keer te betalen.
//    Nu: 3 dagen vóór het einde een mail (trial_ending) en op de dag van
//    aflopen een mail + push + kopie aan de beheerder (trial_expired). De
//    boekingspagina blijft na afloop gewoon werken (book-appointment kijkt niet
//    naar het abonnement); alleen het dashboard staat op pauze.
//
// DEDUPE: renewal_reminder_log (owner_id, plan_expires_at, kind) — insert on
// conflict = al gemaild. Vensters i.p.v. exacte dagen zodat een gemiste run
// niet betekent dat er nooit meer een herinnering komt.
//
// TOEGANG: verify_jwt=false (cron), geen geheim nodig.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") || "mirahventures@vellu.cc";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DAGEN_VOORAF = 7;          // jaarabonnement
const PROEF_DAGEN_VOORAF = 3;    // proef: eerste mail
const PROEF_VENSTER_NA_DAGEN = 7; // proef afgelopen: tot een week terug (gemiste run, of de eerste run na deze uitbreiding)

const DUTCH = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const langOf = (cc: unknown) => DUTCH.has(String(cc || "NL").toUpperCase()) ? "nl" : "en";
const DAY_MS = 24 * 60 * 60 * 1000;

async function recordHealth(status: string, ms: number, processed: number, err: string | null) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "send-renewal-reminder",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* logtabel mag de run nooit laten falen */ }
}

// Claim vóór het mailen: slaagt de insert, dan is dit de eerste keer voor
// (salon, datum, soort); botst hij, dan is er al gemaild.
async function claim(ownerId: string, key: string, kind: string): Promise<boolean> {
  const { error } = await supabase.from("renewal_reminder_log").insert({ owner_id: ownerId, plan_expires_at: key, kind });
  return !error;
}

async function mail(type: string, booking: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
    method: "POST",
    headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type, booking }),
  });
  if (!r.ok) console.error(`send-emails ${type} → ${r.status}`, await r.text().catch(() => ""));
}

serve(async () => {
  const t0 = Date.now();
  let verstuurd = 0;
  try {
    const nu = new Date();

    // ── 1. Jaarabonnees: een week vóór de vervaldatum ────────────────────
    const grens = new Date(nu.getTime() + DAGEN_VOORAF * DAY_MS);
    const { data: jaar, error: e1 } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, billing_interval, plan_expires_at, subscription_status, mollie_subscription_id, cancel_at_period_end")
      .eq("billing_interval", "yearly")
      .eq("subscription_status", "active")
      .is("mollie_subscription_id", null)   // alleen eenmalige jaarbetalers, geen machtiging
      .not("plan_expires_at", "is", null)
      .lte("plan_expires_at", grens.toISOString())
      .gt("plan_expires_at", nu.toISOString());
    if (e1) throw e1;
    for (const s of jaar || []) {
      if (s.cancel_at_period_end || !s.email) continue; // wie zelf opzegde hoeft geen "verleng nu"
      if (!(await claim(s.id, s.plan_expires_at, "renewal"))) continue;
      try {
        await mail("renewal_reminder", {
          owner_email: s.email, owner_id: s.id, owner_lang: langOf(s.country_code),
          business_name: s.business_name, salon_name: s.business_name,
          plan: s.plan || "professional", plan_expires_at: s.plan_expires_at,
        });
        verstuurd++;
      } catch (e) { console.error("renewal reminder email error for", s.id, e); }
    }

    // ── 2. Proef eindigt binnen 3 dagen ──────────────────────────────────
    const proefGrens = new Date(nu.getTime() + PROEF_DAGEN_VOORAF * DAY_MS);
    const { data: bijna, error: e2 } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, trial_ends_at, subscription_status, mollie_subscription_id")
      .eq("subscription_status", "trialing")
      .is("mollie_subscription_id", null)
      .not("trial_ends_at", "is", null)
      .gt("trial_ends_at", nu.toISOString())
      .lte("trial_ends_at", proefGrens.toISOString());
    if (e2) throw e2;
    for (const s of bijna || []) {
      if (!s.email) continue;
      if (!(await claim(s.id, s.trial_ends_at, "trial_ending"))) continue;
      const daysLeft = Math.max(1, Math.ceil((new Date(s.trial_ends_at).getTime() - nu.getTime()) / DAY_MS));
      try {
        await mail("trial_ending", {
          owner_email: s.email, owner_id: s.id, owner_lang: langOf(s.country_code),
          business_name: s.business_name, salon_name: s.business_name,
          plan: s.plan || "starter", trial_ends_at: s.trial_ends_at, days_left: daysLeft,
        });
        verstuurd++;
      } catch (e) { console.error("trial_ending email error for", s.id, e); }
    }

    // ── 3. Proef afgelopen zonder plan: mail + push + kopie aan beheerder ─
    const proefTerug = new Date(nu.getTime() - PROEF_VENSTER_NA_DAGEN * DAY_MS);
    const { data: voorbij, error: e3 } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, trial_ends_at, subscription_status, mollie_subscription_id")
      .eq("subscription_status", "trialing")
      .is("mollie_subscription_id", null)
      .not("trial_ends_at", "is", null)
      .lte("trial_ends_at", nu.toISOString())
      .gte("trial_ends_at", proefTerug.toISOString());
    if (e3) throw e3;
    for (const s of voorbij || []) {
      if (!s.email) continue;
      if (!(await claim(s.id, s.trial_ends_at, "trial_expired"))) continue;
      const lang = langOf(s.country_code);
      try {
        await mail("trial_expired", {
          owner_email: s.email, owner_id: s.id, owner_lang: lang,
          business_name: s.business_name, salon_name: s.business_name,
          plan: s.plan || "starter", trial_ends_at: s.trial_ends_at, days_left: 0,
        });
        verstuurd++;
      } catch (e) { console.error("trial_expired email error for", s.id, e); }
      // Push naar de eigenaar (alleen als ze meldingen aan heeft; anders no-op).
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: s.id,
            title: lang === "nl" ? "Je proefperiode is afgelopen" : "Your trial has ended",
            body: lang === "nl" ? "Kies een plan om je dashboard weer te openen. Je boekingspagina blijft werken." : "Choose a plan to reopen your dashboard. Your booking page keeps working.",
            url: "/owner", tag: `trial-expired-${s.id}`,
          }),
        });
      } catch (e) { console.error("trial push error for", s.id, e); }
      // Kopie aan de beheerder: een afgelopen proef zonder betaling is een
      // salon die je dezelfde dag wilt nabellen, net als bij een mislukte betaling.
      try {
        if (RESEND_API_KEY) {
          const rows = [
            `Salon: ${s.business_name || "?"} (${s.email})`,
            `Land: ${s.country_code || "?"}`,
            `Plan tijdens proef: ${s.plan || "?"}`,
            `Proef eindigde op: ${String(s.trial_ends_at).slice(0, 16).replace("T", " ")} UTC`,
            `Geen Mollie-abonnement; de salon heeft zojuist de "proef afgelopen"-mail gekregen.`,
          ].join("<br/>");
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Vellu Monitoring <noreply@vellu.cc>",
              to: [ADMIN_ALERT_EMAIL],
              subject: `Proef afgelopen zonder betaling: ${s.business_name || s.id}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:640px;"><h2 style="margin:0 0 12px;">Een proefperiode is afgelopen zonder plan</h2><p style="font-size:13px;line-height:1.7;">${rows}</p></div>`,
            }),
          });
        }
      } catch (e) { console.error("admin trial alert error for", s.id, e); }
    }

    await recordHealth("success", Date.now() - t0, verstuurd, null);
    return new Response(JSON.stringify({ ok: true, verstuurd }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await recordHealth("error", Date.now() - t0, verstuurd, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
