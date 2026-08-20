// send-renewal-reminder — herinnert een jaarabonnee dat zijn abonnement bijna
// afloopt.
//
// WAAROM DIT BESTAAT
// Een jaarabonnement is een EENMALIGE betaling (zie create-subscription): er is
// geen doorlopende machtiging en dus geen automatische incasso. Toegang loopt
// puur op profiles.plan_expires_at, en de app rekent daar live mee. Zonder
// herinnering zou een salon op de vervaldag stilzwijgend zijn toegang verliezen
// zonder ooit de kans te hebben gehad om te verlengen. Deze functie stuurt een
// week van tevoren een mail met een knop om opnieuw te betalen.
//
// Maandabonnees raakt dit niet: die hebben een Mollie-abonnement dat zichzelf
// int (mollie_subscription_id is gevuld). We filteren daar expliciet op.
//
// DEDUPE: draait dagelijks, maar mag per aflopende periode maar één keer
// mailen. renewal_reminder_log houdt bij welke (owner, plan_expires_at) al een
// herinnering kreeg — insert on conflict do nothing, zelfde patroon als
// salon_digest_log.
//
// TOEGANG: verify_jwt=false (cron), geen geheim nodig.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Een week van tevoren waarschuwen geeft ruimte om te betalen — en bij een
// weigering (het hele punt van deze exercitie) om de bank te bellen of een
// andere methode te proberen vóór de toegang stopt.
const DAGEN_VOORAF = 7;

async function recordHealth(status: string, ms: number, processed: number, err: string | null) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "send-renewal-reminder",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* logtabel mag de run nooit laten falen */ }
}

serve(async () => {
  const t0 = Date.now();
  try {
    // Het venster: abonnementen die tussen vandaag en over DAGEN_VOORAF dagen
    // verlopen. Een venster in plaats van exact één dag, zodat een gemiste
    // cron-run (of een salon die net buiten de dag valt) niet meteen betekent
    // dat er nooit meer een herinnering komt.
    const nu = new Date();
    const grens = new Date(nu.getTime() + DAGEN_VOORAF * 24 * 60 * 60 * 1000);

    const { data: salons, error } = await supabase
      .from("profiles")
      .select("id, business_name, email, country_code, plan, billing_interval, plan_expires_at, subscription_status, mollie_subscription_id, cancel_at_period_end")
      .eq("billing_interval", "yearly")
      .eq("subscription_status", "active")
      .is("mollie_subscription_id", null)   // alleen eenmalige jaarbetalers, geen machtiging
      .not("plan_expires_at", "is", null)
      .lte("plan_expires_at", grens.toISOString())
      .gt("plan_expires_at", nu.toISOString());
    if (error) throw error;

    let verstuurd = 0;
    for (const s of salons || []) {
      // Wie zelf al heeft opgezegd, hoeft geen "verleng nu"-mail.
      if (s.cancel_at_period_end) continue;
      if (!s.email) continue;

      // Dedupe op (owner, deze vervaldatum). Slaagt de insert, dan is dit de
      // eerste herinnering voor deze periode; botst hij, dan is er al een
      // gestuurd en slaan we over.
      const { error: dupeErr } = await supabase
        .from("renewal_reminder_log")
        .insert({ owner_id: s.id, plan_expires_at: s.plan_expires_at });
      if (dupeErr) continue; // conflict = al gemaild

      const lang = ["NL", "BE", "AW", "CW", "BQ", "SX"].includes(String(s.country_code || "NL")) ? "nl" : "en";
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "renewal_reminder",
            booking: {
              owner_email: s.email,
              owner_id: s.id,
              owner_lang: lang,
              business_name: s.business_name,
              salon_name: s.business_name,
              plan: s.plan || "professional",
              plan_expires_at: s.plan_expires_at,
            },
          }),
        });
        verstuurd++;
      } catch (e) {
        console.error("renewal reminder email error for", s.id, e);
      }
    }

    await recordHealth("success", Date.now() - t0, verstuurd, null);
    return new Response(JSON.stringify({ ok: true, verstuurd }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    await recordHealth("error", Date.now() - t0, 0, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
