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
//   oneoff.paid / oneoff.expired / ...  — idem, maar voor het JAARabonnement:
//                             dat loopt sinds 20-08 als eenmalige betaling
//                             (sequenceType "oneoff"), dus de uitkomst heet
//                             "oneoff.*" en niet "first.*".
// Een rij uit de eerste groep zonder tegenhanger in de tweede is blijven hangen.
// De machtigingsbetaling van automatisch betalen na de proef (sinds 10-10-2026,
// kind "trial_autopay_mandate") loopt ook als first_payment.created + first.*,
// dus die valt hier zonder wijziging onder.
//
// TWEEDE RONDE (sinds 10-10-2026): de EERSTE AFSCHRIJVING van automatisch
// betalen na de proef. Die is een recurring-betaling van een Mollie-abonnement
// en heeft dus geen first_payment.created-rij. Een salon die nog op trialing +
// mollie_subscription_id staat terwijl haar proef al 2 dagen voorbij is, heeft
// een uitkomst die nooit binnenkwam (webhook kwijt), een betaling die nog loopt
// (SEPA: dagen), of een abonnement dat nooit afschreef. Per salon vragen we
// Mollie welke betalingen dat abonnement heeft:
//   - een betaling met een eindstand: de webhook ervoor opnieuw aantrappen
//     (idempotent; die zet haar op actief of op past_due en mailt);
//   - een betaling die nog loopt (open/pending/authorized): niets doen;
//   - geen enkele betaling, en het abonnement loopt niet meer of had al moeten
//     afschrijven: het abonnement stoppen, de salon op past_due ZONDER
//     abonnement zetten (dan kan ze gewoon opnieuw betalen en wordt er nooit
//     dubbel afgeschreven) en de beheerder een seintje geven.
// Tot deze ronde zou api/check-trials zo'n salon na 8 dagen blind op past_due
// zetten met het abonnement nog in het profiel en bij Mollie: dan kon ze vanaf
// het plan-scherm volledig betalen terwijl de SEPA-incasso nog binnenkwam
// (dubbel betaald), of schreef het vergeten abonnement een maand later alsnog af.
//
// v2 (22-08): de uitkomst-check keek alleen naar "first.%". Een betaald
// jaarabonnement (oneoff.paid, My Whims 21-08) bleef daardoor voor altijd
// "hangend" en de webhook werd er elk uur opnieuw voor aangetrapt — onschadelijk
// (logEvent ontdubbelt → HTTP 409, niets gebeurt) maar 17 loze aanroepen per
// dag, en elke volgende jaarklant zou er één bij leggen.
//
// TOEGANG: verify_jwt=false, zoals de andere cron-functies. Er is bewust geen
// geheim: de functie geeft alleen aantallen terug, raakt geen klantgegevens aan,
// en het enige wat een vreemde ermee kan is de webhook opnieuw laten draaien
// voor betalingen die toch al vastzaten — dat is idempotent en onschadelijk.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY") || "";
const MOLLIE_BASE_URL = "https://api.mollie.com/v2";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") || "mirahventures@vellu.cc";
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

// ── Tweede ronde: automatisch betalen na de proef ─────────────────────
// Pas 2 dagen na het einde van de proef kijken: de eerste afschrijving valt op
// de eerste Amsterdamse dag die na het einde begint (hooguit een dag later), en
// Mollie maakt de betaling op die dag aan.
const AUTOPAY_NA_DAGEN = 2;
const LIVE_SUB_STATUSES = ["pending", "active", "suspended"];
const PAY_TERMINAL = ["paid", "failed", "expired", "canceled"];
const ymdAms = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function mollieFetch(path: string, init?: RequestInit) {
  const r = await fetch(`${MOLLIE_BASE_URL}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(20_000),
    headers: { "Authorization": `Bearer ${MOLLIE_API_KEY}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: r.status, ok: r.ok, data, raw: text };
}

// Zelfde seintje als alertAdmin in mollie-webhook (kopie: geen gedeelde module).
async function alertAdmin(subject: string, lines: string[]): Promise<void> {
  try {
    if (!RESEND_API_KEY) { console.error("ADMIN ALERT (geen RESEND_API_KEY):", subject, lines.join(" | ")); return; }
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Vellu Monitoring <noreply@vellu.cc>",
        to: [ADMIN_ALERT_EMAIL],
        subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;"><h2 style="margin:0 0 12px;">${esc(subject)}</h2><p style="font-size:13px;line-height:1.7;">${lines.filter(Boolean).map(esc).join("<br/>")}</p></div>`,
      }),
    });
  } catch (e) { console.error("admin alert error:", e); }
}

type AutopayRonde = { bekeken: number; aangetrapt: number; loopt_nog: number; afgesloten: number; fouten: string[] };

async function reconcileAutopayTrials(): Promise<AutopayRonde> {
  const res: AutopayRonde = { bekeken: 0, aangetrapt: 0, loopt_nog: 0, afgesloten: 0, fouten: [] };
  if (!MOLLIE_API_KEY) { res.fouten.push("geen MOLLIE_API_KEY"); return res; }
  const grens = new Date(Date.now() - AUTOPAY_NA_DAGEN * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("profiles")
    .select("id, business_name, email, mollie_customer_id, mollie_subscription_id, trial_ends_at")
    .eq("subscription_status", "trialing")
    .not("mollie_subscription_id", "is", null)
    .lt("trial_ends_at", grens)
    .limit(MAX_PER_RUN);
  if (error) { res.fouten.push(`profielen: ${error.message || String(error)}`); return res; }
  const vandaag = ymdAms(new Date());
  for (const s of rows || []) {
    res.bekeken++;
    const cid = String(s.mollie_customer_id || "");
    const sid = String(s.mollie_subscription_id || "");
    if (!cid) { res.fouten.push(`${s.id}: abonnement ${sid} zonder Mollie-klant`); continue; }
    try {
      const lijst = await mollieFetch(`/customers/${cid}/subscriptions/${sid}/payments?limit=10`);
      if (!lijst.ok || !lijst.data || typeof lijst.data !== "object") {
        res.fouten.push(`${s.id}: betalingen van ${sid} niet op te halen (HTTP ${lijst.status})`);
        continue;
      }
      type PayList = { _embedded?: { payments?: Array<{ id?: string; status?: string }> } };
      const betalingen = (lijst.data as PayList)._embedded?.payments || [];
      if (betalingen.length > 0) {
        let lopend = false;
        for (const b of betalingen) {
          if (!b?.id) continue;
          if (!PAY_TERMINAL.includes(String(b.status || ""))) { lopend = true; continue; }
          // De webhook haalt de status zelf op en is idempotent.
          const r = await fetch(`${SUPABASE_URL}/functions/v1/mollie-webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: b.id }),
          });
          if (r.ok) res.aangetrapt++;
          else res.fouten.push(`${b.id}: webhook HTTP ${r.status}`);
        }
        if (lopend) res.loopt_nog++;
        continue;
      }
      // Geen enkele betaling. Staat het abonnement nog gepland (volgende
      // betaaldatum vandaag of later), dan gewoon wachten.
      const sub = await mollieFetch(`/customers/${cid}/subscriptions/${sid}`);
      if (!sub.ok && sub.status !== 404 && sub.status !== 410) {
        res.fouten.push(`${s.id}: abonnement ${sid} niet op te halen (HTTP ${sub.status})`);
        continue;
      }
      const sd = (sub.ok && sub.data && typeof sub.data === "object" ? sub.data : {}) as { status?: string; nextPaymentDate?: string };
      const live = LIVE_SUB_STATUSES.includes(String(sd.status || ""));
      if (live && sd.nextPaymentDate && String(sd.nextPaymentDate) >= vandaag) continue;
      if (live) {
        const del = await mollieFetch(`/customers/${cid}/subscriptions/${sid}`, { method: "DELETE" });
        if (!del.ok && del.status !== 404 && del.status !== 410) {
          res.fouten.push(`${s.id}: abonnement ${sid} niet te stoppen (HTTP ${del.status})`);
          continue;
        }
      }
      // Alleen de stand waarvoor dit bedoeld is: nog trialing met DIT abonnement.
      const { data: upd, error: updErr } = await supabase
        .from("profiles")
        .update({ subscription_status: "past_due", mollie_subscription_id: null })
        .eq("id", s.id)
        .eq("subscription_status", "trialing")
        .eq("mollie_subscription_id", sid)
        .select("id");
      if (updErr) { res.fouten.push(`${s.id}: profiel niet bij te werken: ${updErr.message || String(updErr)}`); continue; }
      if (upd && upd.length > 0) {
        res.afgesloten++;
        await alertAdmin(`Automatisch betalen schreef niet af: ${s.business_name || s.id}`, [
          `Salon: ${s.business_name || "?"} (${s.email || s.id})`,
          `Proef eindigde: ${String(s.trial_ends_at).slice(0, 16).replace("T", " ")} UTC`,
          `Mollie-abonnement ${sid} (${sd.status || "onbekend"}) heeft geen enkele betaling aangemaakt${live ? " en is nu gestopt" : ""}.`,
          "De salon staat nu op past_due zonder abonnement en ziet het plan-scherm; ze heeft hier geen mail over gekregen. Neem contact met haar op.",
        ]);
      }
    } catch (e) {
      res.fouten.push(`${s.id}: ${String(e).slice(0, 120)}`);
    }
  }
  return res;
}

serve(async () => {
  const t0 = Date.now();
  try {
    // Eerst de eerste afschrijvingen van automatisch betalen (eigen ronde,
    // hierboven); een fout daar mag de gewone ronde niet tegenhouden.
    let autopay: AutopayRonde;
    try { autopay = await reconcileAutopayTrials(); }
    catch (e) { autopay = { bekeken: 0, aangetrapt: 0, loopt_nog: 0, afgesloten: 0, fouten: [String(e).slice(0, 200)] }; }

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
      const apFout = autopay.fouten.length > 0;
      await recordHealth(apFout ? "error" : "success", Date.now() - t0, autopay.aangetrapt + autopay.afgesloten,
        apFout ? `automatisch betalen: ${autopay.fouten.join("; ")}` : null);
      return new Response(JSON.stringify({ ok: !apFout, blijven_hangen: 0, opnieuw_aangetrapt: 0, automatisch_betalen: autopay }),
        { headers: { "Content-Type": "application/json" } });
    }

    // Welke daarvan hebben al een uitkomst? Alles wat met "first." of "oneoff."
    // begint is een eindstand; "first_payment.created" niet (underscore).
    // v3 (05-10-2026): een uitkomst telt pas als hij ook VERWERKT is
    // (processed_at gezet door mollie-webhook ná alle bijwerkingen: profiel,
    // abonnement, factuur). Viel de webhook halverwege om, dan stond first.paid
    // er wel maar was de salon nooit geactiveerd — en dit vangnet keek er nooit
    // meer naar. Nu trapt het zo'n betaling opnieuw aan; de webhook slaat alleen
    // verwerkte gebeurtenissen over als duplicaat.
    const { data: afgerond, error: e2 } = await supabase
      .from("payment_events")
      .select("mollie_payment_id, event_type")
      .in("mollie_payment_id", ids)
      // Alleen echte eindstanden. Een "first.chargeback"/"oneoff.refund"-rij is
      // al verwerkt zodra hij er staat en mag een nog onverwerkte first.paid niet
      // als "klaar" laten gelden.
      .in("event_type", [
        "first.paid", "first.failed", "first.expired", "first.canceled",
        "oneoff.paid", "oneoff.failed", "oneoff.expired", "oneoff.canceled",
      ])
      .not("processed_at", "is", null);
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
    const problemen = mislukt.length > 0 || autopay.fouten.length > 0;
    const meldingen = [
      mislukt.length ? `niet kunnen aantrappen: ${mislukt.join("; ")}` : "",
      autopay.fouten.length ? `automatisch betalen: ${autopay.fouten.join("; ")}` : "",
    ].filter(Boolean).join(" | ");
    await recordHealth(
      problemen ? "error" : "success",
      Date.now() - t0,
      opnieuw + autopay.aangetrapt + autopay.afgesloten,
      problemen ? meldingen : null,
    );

    return new Response(JSON.stringify({
      ok: !problemen,
      gecontroleerd: ids.length,
      blijven_hangen: hangend.length,
      opnieuw_aangetrapt: opnieuw,
      mislukt,
      automatisch_betalen: autopay,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await recordHealth("error", Date.now() - t0, 0, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
