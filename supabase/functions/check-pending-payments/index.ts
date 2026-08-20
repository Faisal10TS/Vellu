// check-pending-payments — het vangnet onder de Mollie-webhook.
//
// WAAROM DIT BESTAAT
// Alles rond betalen hangt aan één draadje: Mollie roept mollie-webhook aan, en
// die verwerkt de uitkomst. Komt die aanroep niet aan — netwerkstoring, functie
// die even omvalt, een deploy op het verkeerde moment — dan gebeurt er
// helemaal niets. Twee gevolgen, allebei slecht:
//
//   1. Een MISLUKTE betaling waar de salon nooit iets over hoort. Dat is precies
//      wat er op 19 augustus gebeurde bij een salon op Bonaire (kaart geweigerd
//      door de bank, betaling verliep, geen bericht) — al kwam dat toen doordat
//      de webhook zelf niets stuurde, niet doordat hij niet aankwam.
//   2. Erger nog: een GESLAAGDE betaling die nooit verwerkt wordt. De salon
//      heeft betaald maar krijgt geen abonnement. Dat merk je pas als zij belt.
//
// HOE
// Deze functie zoekt eerste betalingen die wél zijn gestart maar waarvoor nooit
// een uitkomst is vastgelegd, en trapt de webhook er opnieuw voor aan. Hij
// bouwt de verwerkingslogica BEWUST niet na: mollie-webhook haalt de status
// zelf bij Mollie op en is idempotent (logEvent ontdubbelt op
// mollie_payment_id + event_type). Opnieuw aantrappen is dus veilig, en er kan
// nooit uiteenlopen wat de webhook doet en wat het vangnet doet.
//
// De gebeurtenissen heten:
//   first_payment.created   — gestart, uitkomst nog onbekend
//   first.paid / first.expired / first.failed / first.canceled — de uitkomst
// Een rij uit de eerste groep zonder tegenhanger in de tweede is blijven hangen.
//
// TOEGANG: verify_jwt=false, zoals de andere cron-functies. Er is bewust geen
// geheim: de functie geeft alleen aantallen terug, raakt geen klantgegevens aan,
// en het enige wat een vreemde ermee kan is de webhook opnieuw laten draaien
// voor betalingen die toch al vastzaten — dat is idempotent en onschadelijk.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Mollie laat een openstaande betaling na een kwartier vervallen. Twintig
// minuten geeft dus ruimte voor de normale afhandeling én voor een late
// webhook, zonder dat een salon lang in het ongewisse blijft.
const MINIMAAL_MINUTEN_OUD = 20;
// Ruim boven wat er ooit tegelijk kan vastzitten; puur een noodrem zodat één
// run niet oneindig doorloopt als er iets structureel mis is.
const MAX_PER_RUN = 25;

async function recordHealth(status: string, ms: number, processed: number, err: string | null) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "check-pending-payments",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* logtabel mag nooit de run laten falen */ }
}

serve(async () => {
  const t0 = Date.now();
  try {
    const grens = new Date(Date.now() - MINIMAAL_MINUTEN_OUD * 60_000).toISOString();

    const { data: gestart, error: e1 } = await supabase
      .from("payment_events")
      .select("mollie_payment_id, owner_id, created_at, amount_eur")
      .eq("event_type", "first_payment.created")
      .lt("created_at", grens)
      .order("created_at", { ascending: false })
      .limit(200);
    if (e1) throw e1;

    const ids = [...new Set((gestart || []).map(r => r.mollie_payment_id).filter(Boolean))];
    if (ids.length === 0) {
      await recordHealth("success", Date.now() - t0, 0, null);
      return new Response(JSON.stringify({ ok: true, blijven_hangen: 0, opnieuw_aangetrapt: 0 }),
        { headers: { "Content-Type": "application/json" } });
    }

    // Welke daarvan hebben al een uitkomst? Alles wat met "first." begint is
    // een eindstand; "first_payment.created" niet (die heeft een underscore).
    const { data: afgerond, error: e2 } = await supabase
      .from("payment_events")
      .select("mollie_payment_id, event_type")
      .in("mollie_payment_id", ids)
      .like("event_type", "first.%");
    if (e2) throw e2;

    const klaar = new Set((afgerond || []).map(r => r.mollie_payment_id));
    const hangend = ids.filter(id => !klaar.has(id)).slice(0, MAX_PER_RUN);

    let opnieuw = 0;
    const mislukt: string[] = [];
    for (const id of hangend) {
      try {
        // De webhook aantrappen alsof Mollie het zelf doet. Hij haalt de
        // actuele status op en handelt hem af — betaald, mislukt of verlopen.
        const r = await fetch(`${SUPABASE_URL}/functions/v1/mollie-webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (r.ok) opnieuw++;
        else mislukt.push(`${id}: HTTP ${r.status}`);
      } catch (e) {
        mislukt.push(`${id}: ${String(e).slice(0, 120)}`);
      }
    }

    // Blijft er iets hangen dat we niet konden aantrappen, dan is dat een
    // storing die iemand moet zien — vandaar status "error", zodat
    // cron-watchdog er de volgende ochtend een mail over stuurt.
    const problemen = mislukt.length > 0;
    await recordHealth(
      problemen ? "error" : "success",
      Date.now() - t0,
      opnieuw,
      problemen ? `niet kunnen aantrappen: ${mislukt.join("; ")}` : null,
    );

    return new Response(JSON.stringify({
      ok: !problemen,
      gecontroleerd: ids.length,
      blijven_hangen: hangend.length,
      opnieuw_aangetrapt: opnieuw,
      mislukt,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await recordHealth("error", Date.now() - t0, 0, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
