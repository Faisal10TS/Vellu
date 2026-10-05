// Mollie webhook receiver. Re-fetches payment from Mollie API for security.
// Idempotent on (mollie_payment_id, event_type): one payment_events row per
// event, marked processed_at only after every side effect succeeded (since
// 05-10-2026; see claimEvent). Deployed verify_jwt=false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOLLIE_API_KEY = Deno.env.get("MOLLIE_API_KEY")!;
const MOLLIE_BASE_URL = "https://api.mollie.com/v2";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") || "mirahventures@vellu.cc";
// Owner-facing mail gaat in de taal van de SALON, niet van de klant. Zelfde
// verzameling als in cancel-appointment en send-reminders; hier gekopieerd
// omdat edge functions geen gedeelde module hebben.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function plain(status: number, body: string) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

// Elke Mollie-aanroep krijgt een tijdslimiet. Een hangende aanroep gooit dan een
// fout: de claim gaat vrij en Mollie / check-pending-payments proberen het
// opnieuw, in plaats van dat een tweede aanroep de verlopen claim overneemt
// terwijl de eerste nog loopt (en ze allebei een abonnement aanmaken).
const MOLLIE_TIMEOUT_MS = 20_000;

async function mollieFetch(path: string, init?: RequestInit) {
  const r = await fetch(`${MOLLIE_BASE_URL}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(MOLLIE_TIMEOUT_MS),
    headers: {
      "Authorization": `Bearer ${MOLLIE_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: r.status, ok: r.ok, data, raw: text };
}

interface MolliePayment {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  description?: string;
  customerId?: string;
  mandateId?: string;
  subscriptionId?: string;
  sequenceType?: string;
  createdAt?: string;
  paidAt?: string;
  amountRefunded?: { value: string; currency: string };
  amountChargedBack?: { value: string; currency: string };
  metadata?: Record<string, unknown> | null;
  _links?: Record<string, { href?: string }>;
}

function addInterval(from: Date, interval: "monthly" | "yearly", n = 1): Date {
  const d = new Date(from);
  if (interval === "monthly") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}

function classifyEvent(p: MolliePayment): string {
  const seq = p.sequenceType || "oneoff";
  return `${seq}.${p.status}`;
}

// Eindstanden van een betaling. Alleen een gebeurtenis met zo'n status wordt als
// verwerkt gemarkeerd; "open" of "pending" komt later nog een keer langs (via
// Mollie zelf of via check-pending-payments) en mag dan opnieuw.
const TERMINAL_STATUSES = ["paid", "failed", "expired", "canceled"];

// Een nieuwe betaalde periode begint NIET bij de betaling maar pas als de toegang
// die de salon al heeft (proef, opgezegde maar betaalde periode, lopend jaar)
// voorbij is. Tot 05-10-2026 begon hij altijd "nu": wie tijdens de proef of na
// opzeggen opnieuw abonneerde, betaalde de resterende dagen dubbel.
function paidPeriodStart(planExpiresAt: unknown): Date {
  const now = new Date();
  const exp = planExpiresAt ? new Date(String(planExpiresAt)) : null;
  return exp && !isNaN(exp.getTime()) && exp.getTime() > now.getTime() ? exp : now;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]);
}

// Seintje aan de beheerder bij alles rond geld dat niet vanzelf herstelt
// (zelfde afzender als de melding in notifyPaymentFailed hieronder).
async function alertAdmin(subject: string, lines: string[]): Promise<void> {
  try {
    if (!RESEND_API_KEY) {
      console.error("ADMIN ALERT (geen RESEND_API_KEY):", subject, lines.join(" | "));
      return;
    }
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Vellu Monitoring <noreply@vellu.cc>",
        to: [ADMIN_ALERT_EMAIL],
        subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;">
          <h2 style="margin:0 0 12px;">${esc(subject)}</h2>
          <p style="font-size:13px;line-height:1.7;">${lines.filter(Boolean).map(esc).join("<br/>")}</p></div>`,
      }),
    });
  } catch (e) { console.error("admin alert error:", e); }
}

// ── Mollie-abonnementen opruimen ──────────────────────────────────────────
// Een salon mag bij Mollie nooit twee lopende abonnementen hebben. Tot
// 05-10-2026 kon dat wel: wie vanuit past_due (of na opzeggen) opnieuw betaalde
// kreeg bij first.paid een NIEUW abonnement terwijl het oude gewoon bleef
// afschrijven, en een jaarbetaling liet het oude maandabonnement doorlopen.
// Daarom stopt first.paid eerst het vorige abonnement en daarna alles wat er
// verder nog loopt, en stopt een jaarbetaling ze allemaal.
const LIVE_SUB_STATUSES = ["pending", "active", "suspended"];

async function cancelMollieSubscription(customerId: string, subId: string): Promise<boolean> {
  const r = await mollieFetch(`/customers/${customerId}/subscriptions/${subId}`, { method: "DELETE" });
  if (r.ok || r.status === 404 || r.status === 410) return true;
  // Een al opgezegd abonnement geeft bij Mollie een foutcode; kijk dan wat de
  // stand is. Loopt hij niet meer, dan is het doel bereikt.
  const g = await mollieFetch(`/customers/${customerId}/subscriptions/${subId}`);
  const st = g.ok && g.data && typeof g.data === "object" ? String((g.data as { status?: string }).status || "") : "";
  if (st && !LIVE_SUB_STATUSES.includes(st)) return true;
  console.error("mollie subscription cancel failed:", subId, r.status, r.raw);
  return false;
}

// Stopt elk lopend abonnement van deze Mollie-klant behalve keepId. Geeft terug
// wat NIET gestopt kon worden (leeg = in orde). Een Mollie-klant hoort bij
// precies één salon (create-subscription maakt hem per eigenaar aan).
async function cancelOtherSubscriptions(customerId: string, keepId: string | null): Promise<string[]> {
  const list = await mollieFetch(`/customers/${customerId}/subscriptions?limit=250`);
  if (!list.ok || !list.data || typeof list.data !== "object") {
    console.error("mollie subscription list failed:", list.status, list.raw);
    return ["(lijst met abonnementen niet op te halen)"];
  }
  type SubList = { _embedded?: { subscriptions?: Array<{ id?: string; status?: string }> } };
  const subs = (list.data as SubList)._embedded?.subscriptions || [];
  const failed: string[] = [];
  for (const s of subs) {
    if (!s?.id || s.id === keepId || !LIVE_SUB_STATUSES.includes(String(s.status || ""))) continue;
    if (!(await cancelMollieSubscription(customerId, s.id))) failed.push(s.id);
  }
  return failed;
}

// Een verlenging die Mollie al had aangemaakt toen de salon opzegde. Opzeggen
// (cancel-subscription, standaard "aan het einde van de periode") stopt het
// abonnement bij Mollie en wist profiles.mollie_subscription_id, maar een
// SEPA-incasso die toen al liep, wordt 2 tot 5 dagen later gewoon betaald. Die
// betaling hoort bij het abonnement dat de salon op dat moment had, dus:
// verlengen en factureren. Herkenbaar aan: geen abonnement meer in het profiel,
// opgezegd aan het einde van de periode, betaling aangemaakt vóór het opzeggen,
// en het abonnement van de betaling is van deze salon en is bij dat opzeggen
// gestopt (canceledAt bij Mollie rond cancelled_at). Die laatste controle houdt
// abonnementen buiten die de webhook zelf stopte bij een nieuwe eerste betaling
// of jaarbetaling; die betalingen blijven genegeerd. "retry" = Mollie kon het
// abonnement nu niet laten zien.
const SOFT_CANCEL_MATCH_MS = 15 * 60 * 1000;

async function paidBeforeSoftCancel(p: MolliePayment, profile: Record<string, unknown>, ownerId: string): Promise<boolean | "retry"> {
  if (profile.mollie_subscription_id || profile.cancel_at_period_end !== true) return false;
  const subId = p.subscriptionId || "";
  const customerId = p.customerId || String(profile.mollie_customer_id || "");
  const createdMs = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
  const cancelledMs = profile.cancelled_at ? new Date(String(profile.cancelled_at)).getTime() : NaN;
  if (!subId || !customerId || isNaN(createdMs) || isNaN(cancelledMs) || createdMs > cancelledMs) return false;
  let r: Awaited<ReturnType<typeof mollieFetch>>;
  try {
    r = await mollieFetch(`/customers/${customerId}/subscriptions/${subId}`);
  } catch (e) {
    console.error("subscription lookup error:", subId, e);
    return "retry";
  }
  if (!r.ok || !r.data || typeof r.data !== "object") {
    console.error("subscription lookup failed:", subId, r.status, r.raw);
    return r.status >= 500 ? "retry" : false;
  }
  const sub = r.data as { status?: string; canceledAt?: string; metadata?: { owner_id?: string } | null };
  const canceledMs = sub.canceledAt ? new Date(sub.canceledAt).getTime() : NaN;
  return sub.metadata?.owner_id === ownerId
    && sub.status === "canceled"
    && !isNaN(canceledMs)
    && Math.abs(canceledMs - cancelledMs) <= SOFT_CANCEL_MATCH_MS;
}

// Regel voor elke beheerdersmelding over een abonnement dat met de hand moet
// worden (her)aangemaakt: zonder het id in het profiel negeert de webhook de
// afschrijvingen ervan (zie de recurring-tak).
const MANUAL_SUB_ID_NOTE = "Zet daarna het nieuwe abonnement-id (sub_...) in profiles.mollie_subscription_id, anders worden de afschrijvingen ervan genegeerd.";

// Referral (sinds 05-10-2026): de uitnodigende salon krijgt haar tegoed pas als
// de nieuwe salon voor het eerst betaalt, niet meer bij het aanmelden. De rpc is
// idempotent (hooguit één keer per uitnodiging); een fout mag een betaling nooit
// tegenhouden.
async function grantReferralCredit(ownerId: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("grant_referral_credit", { p_new_profile_id: ownerId });
    if (error) console.error("grant_referral_credit error:", ownerId, error);
    else if (Number(data) > 0) console.log("referral credit granted for", ownerId, "days:", data);
  } catch (e) { console.error("grant_referral_credit error:", ownerId, e); }
}

// Een eerste- of jaarbetaling die niet doorging. HIER GING EERDER NIETS UIT —
// alleen een console.log. Gevolg: een salon die wilde betalen zag een
// laadscherm, kreeg daarna niets te horen, en moest zelf navragen of er nu wel
// of geen geld was afgeschreven. Precies dat gebeurde op 19 augustus bij een
// salon op Bonaire: haar RBC-kaart werd door de bank geweigerd (3-D Secure was
// wél geslaagd), de betaling verliep, en niemand kreeg een seintje.
//
// Uitgefactoreerd zodat het maandpad (first) en het jaarpad (oneoff) exact
// hetzelfde doen: een mail naar de salon met wat er aan de hand is en wat te
// doen, plus een waarschuwing naar de beheerder.
async function notifyPaymentFailed(
  payment: MolliePayment,
  profile: Record<string, unknown>,
  meta: { plan?: string; billing_interval?: string } | null,
  ownerId: string,
): Promise<void> {
  console.log("payment did not complete:", payment.id, payment.status);

  // Mollie zet de reden in details.failureReason bij een weigering. Bij een
  // verlopen betaling is er geen failureReason; dan is de status zelf de reden
  // ("expired" = niet op tijd afgerond).
  const det = (payment as unknown as { details?: Record<string, unknown> }).details || {};
  const reasonCode = String(det.failureReason || payment.status || "");
  const reasonMessage = String(det.failureMessage || "");
  const p = profile;

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
      method: "POST",
      headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "payment_failed",
        booking: {
          owner_email: p.email,
          owner_id: ownerId,
          // Salon-taal, niet klant-taal: dit is een bericht aan de eigenaar.
          owner_lang: DUTCH_COUNTRIES.has(String(p.country_code || "NL")) ? "nl" : "en",
          // Zodat send-emails datums in de tijdzone van de salon schrijft.
          country_code: p.country_code || "NL",
          business_name: p.business_name,
          salon_name: p.business_name,
          plan: meta?.plan || p.plan || "starter",
          billing_interval: meta?.billing_interval || p.billing_interval || "monthly",
          amount: parseFloat(payment.amount.value),
          trial_ends_at: p.trial_ends_at || null,
          reason_code: reasonCode,
          reason_message: reasonMessage,
        },
      }),
    });
  } catch (e) { console.error("payment_failed email error:", e); }

  // En een seintje naar onszelf. Een mislukte betaling is een klant die op het
  // punt stond te betalen en nu vastloopt; dat wil je dezelfde dag weten, niet
  // pas als hij eruit valt.
  try {
    if (RESEND_API_KEY) {
      const detail = [
        `Salon: ${p.business_name || "?"} (${p.email || "?"})`,
        `Bedrag: EUR ${payment.amount.value}`,
        `Plan: ${meta?.plan || "?"} (${meta?.billing_interval || "?"})`,
        `Status: ${payment.status}`,
        `Reden: ${reasonCode}${reasonMessage ? ` — ${reasonMessage}` : ""}`,
        det.cardIssuer ? `Kaart: ${det.cardLabel || "?"} van ${det.cardIssuer} (${det.cardIssuerCountry || "?"})` : "",
        `Mollie: ${payment.id}`,
      ].filter(Boolean).join("<br/>");
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Vellu Monitoring <noreply@vellu.cc>",
          to: [ADMIN_ALERT_EMAIL],
          subject: `Betaling mislukt: ${p.business_name || ownerId}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:640px;">
            <h2 style="margin:0 0 12px;">Een salon kon niet betalen</h2>
            <p style="color:#666;margin:0 0 16px;">De salon heeft hier zelf een mail over gekregen met wat te doen.</p>
            <p style="font-size:13px;line-height:1.7;">${detail}</p></div>`,
        }),
      });
    }
  } catch (e) { console.error("admin alert error:", e); }
}

// ── Verwerkt pas als alles gelukt is ──────────────────────────────────────
// Tot 05-10-2026 gold een gebeurtenis als afgehandeld zodra de rij er stond,
// dus vóór het werk. Mislukte daarna iets (abonnement aanmaken, profiel
// bijwerken, time-out), dan gaf elke herhaling "ok (duplicate)" en herstelde
// niets het: de salon had betaald en liep een maand later stil uit. Nu:
//   - de rij wordt bij binnenkomst geclaimd (claimed_at), zodat twee
//     gelijktijdige aanroepen voor dezelfde gebeurtenis niet allebei werken;
//   - processed_at komt er pas op als alle bijwerkingen gelukt zijn;
//   - mislukt er iets, dan geven we de claim vrij en antwoorden met een
//     foutcode, zodat Mollie (of check-pending-payments) het opnieuw probeert;
//   - outcome bewaart wat er bij de eerste poging is berekend (periode,
//     profielwijziging, abonnement), zodat een herhaling exact hetzelfde
//     toepast en nooit twee keer verlengt of twee abonnementen aanmaakt.
// Een rij zonder claimed_at komt van de versie van vóór deze wijziging en is
// toen al afgehandeld.
// Langer dan een aanroep kan duren: elke Mollie-aanroep stopt na 20 s en een
// edge function mag hooguit 400 s lopen.
const CLAIM_STALE_MS = 7 * 60 * 1000;
const CLAIM_RELEASED = "1970-01-01T00:00:00Z";  // vrijgegeven: een herhaling mag meteen
type Outcome = Record<string, unknown>;
type Claim =
  | { state: "go"; id: string; outcome: Outcome | null }
  | { state: "done" }
  | { state: "busy" };

async function claimEvent(ownerId: string | null, p: MolliePayment, eventType: string): Promise<Claim> {
  const nowIso = new Date().toISOString();
  const { data: ins, error } = await supabase.from("payment_events").insert({
    owner_id: ownerId,
    mollie_payment_id: p.id,
    mollie_customer_id: p.customerId || null,
    mollie_subscription_id: p.subscriptionId || null,
    event_type: eventType,
    status: p.status,
    amount_eur: parseFloat(p.amount.value),
    currency: p.amount.currency,
    description: p.description || null,
    raw_payload: p as unknown as Record<string, unknown>,
    claimed_at: nowIso,
  }).select("id").maybeSingle();
  if (!error && ins) return { state: "go", id: (ins as { id: string }).id, outcome: null };
  const code = (error as { code?: string } | null)?.code;
  const msg = (error as { message?: string } | null)?.message || "";
  if (!(code === "23505" || msg.includes("payment_events_mollie_payment_event_type_uniq"))) {
    console.error("payment_events insert error:", error);
    throw error || new Error("payment_events insert returned no row");
  }
  // De gebeurtenis bestaat al: klaar, bezig, of blijven hangen na een fout.
  const { data: row, error: rErr } = await supabase.from("payment_events")
    .select("id, created_at, processed_at, claimed_at, outcome")
    .eq("mollie_payment_id", p.id)
    .eq("event_type", eventType)
    .maybeSingle();
  if (rErr || !row) {
    console.error("payment_events lookup error:", rErr);
    return { state: "done" };
  }
  const r = row as { id: string; created_at: string; processed_at: string | null; claimed_at: string | null; outcome: Outcome | null };
  if (r.processed_at) return { state: "done" };
  if (!r.claimed_at) {
    await supabase.from("payment_events").update({ processed_at: r.created_at }).eq("id", r.id).is("processed_at", null);
    return { state: "done" };
  }
  if (Date.now() - new Date(r.claimed_at).getTime() < CLAIM_STALE_MS) return { state: "busy" };
  // Vrijgegeven of verlaten claim (fout, crash of time-out): overnemen, maar
  // alleen als niemand ons net voor was.
  const { data: taken } = await supabase.from("payment_events")
    .update({ claimed_at: nowIso })
    .eq("id", r.id)
    .eq("claimed_at", r.claimed_at)
    .is("processed_at", null)
    .select("id")
    .maybeSingle();
  if (!taken) return { state: "busy" };
  return { state: "go", id: r.id, outcome: r.outcome || null };
}

async function markProcessed(id: string): Promise<void> {
  const { error } = await supabase.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("payment_events processed_at update error:", id, error);
}

async function releaseClaim(id: string): Promise<void> {
  const { error } = await supabase.from("payment_events").update({ claimed_at: CLAIM_RELEASED }).eq("id", id).is("processed_at", null);
  if (error) console.error("payment_events claim release error:", id, error);
}

async function saveOutcome(id: string, outcome: Outcome): Promise<boolean> {
  const { error } = await supabase.from("payment_events").update({ outcome }).eq("id", id);
  if (error) { console.error("payment_events outcome update error:", id, error); return false; }
  return true;
}

// ── Terugboekingen en terugbetalingen ─────────────────────────────────────
// Een storno (chargeback) of een terugbetaling laat de status van de betaling op
// "paid" staan. Tot 05-10-2026 viel zo'n webhook-aanroep daardoor als duplicaat
// weg en merkte niemand iets. Nu krijgt elk soort een eigen gebeurtenis
// ("<soort>.chargeback" / "<soort>.refund", één keer per betaling), een seintje
// aan de beheerder, en bij een storno gaat een actief abonnement op past_due
// (geen verlengingscoulance meer; de beheerder beslist over de toegang).
async function handleReversals(p: MolliePayment, ownerId: string | null): Promise<void> {
  const seq = p.sequenceType || "oneoff";
  const chargedBack = parseFloat(p.amountChargedBack?.value || "0") || 0;
  const refunded = parseFloat(p.amountRefunded?.value || "0") || 0;
  const kinds: Array<{ eventType: string; amount: number; chargeback: boolean }> = [];
  if (chargedBack > 0) kinds.push({ eventType: `${seq}.chargeback`, amount: chargedBack, chargeback: true });
  if (refunded > 0) kinds.push({ eventType: `${seq}.refund`, amount: refunded, chargeback: false });
  for (const k of kinds) {
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("payment_events").insert({
      owner_id: ownerId,
      mollie_payment_id: p.id,
      mollie_customer_id: p.customerId || null,
      mollie_subscription_id: p.subscriptionId || null,
      event_type: k.eventType,
      status: p.status,
      amount_eur: k.amount,
      currency: p.amount.currency,
      description: p.description || null,
      raw_payload: p as unknown as Record<string, unknown>,
      claimed_at: nowIso,
      processed_at: nowIso,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code !== "23505") console.error("payment_events reversal insert error:", error);
      continue; // al eerder gemeld (of niet vast te leggen): niet opnieuw alarmeren
    }
    let salon = "?";
    if (ownerId) {
      const { data: prof } = await supabase.from("profiles").select("business_name, email").eq("id", ownerId).maybeSingle();
      if (prof) salon = `${(prof as Record<string, unknown>).business_name || "?"} (${(prof as Record<string, unknown>).email || "?"})`;
      if (k.chargeback) {
        const { error: updErr } = await supabase.from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("id", ownerId)
          .eq("subscription_status", "active");
        if (updErr) console.error("chargeback past_due update error:", ownerId, updErr);
      }
    }
    await alertAdmin(
      k.chargeback ? `Storno (chargeback): ${salon}` : `Terugbetaling: ${salon}`,
      [
        `Salon: ${salon}`,
        `Betaling: ${p.id} (${p.sequenceType || "oneoff"}, EUR ${p.amount.value})`,
        `${k.chargeback ? "Teruggeboekt" : "Terugbetaald"}: EUR ${k.amount.toFixed(2)}`,
        p.subscriptionId ? `Abonnement: ${p.subscriptionId}` : "",
        k.chargeback
          ? "Een actief abonnement staat nu op past_due. De toegang (plan_expires_at) is NIET ingekort: beslis zelf of het abonnement bij Mollie moet stoppen."
          : "Toegang en abonnement zijn niet aangepast.",
      ],
    );
  }
}

// \u2500\u2500 BTW op Vellu's EIGEN abonnementsfactuur \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Let op: dit gaat NIET over de belasting die een salon aan haar klanten
// rekent (dat is src/taxEngine.js), maar over wat Vellu aan de salon factureert.
//
// Vellu is in Nederland gevestigd en levert een langs elektronische weg
// verrichte dienst. Voor een afnemer in Nederland is dat 21%. De Caribische
// delen van het Koninkrijk vallen BUITEN het EU-BTW-gebied \u2014 ook Bonaire,
// Saba en Sint Eustatius, die staatsrechtelijk w\u00e9l Nederland zijn. Dat
// onderscheid is precies waar het misgaat, en het stond hier hardgecodeerd op
// 21% voor iedereen.
const NL_VAT = 0.21;
// Buiten het EU-BTW-gebied. De BES-eilanden zijn staatsrechtelijk Nederland
// maar EU-rechtelijk LGO (art. 355 lid 2 VWEU): de BTW-richtlijn geldt er niet.
// Aruba, Curacao en Sint Maarten zijn zelfstandige landen met een eigen stelsel.
const OUTSIDE_EU_VAT = ["BQ", "AW", "CW", "SX"];
// NULL, niet 0. "0%" is een TARIEF en suggereert een in Nederland belaste
// nultarief-prestatie; hier is de dienst helemaal niet in Nederland belastbaar
// omdat de plaats van dienst bij de afnemer ligt (art. 6 lid 1 Wet OB voor een
// ondernemer, art. 6h voor een elektronische dienst aan een particulier).
// Zet daarom ook nooit een BTW-BEDRAG op zo'n factuur, ook geen 0,00: op grond
// van art. 37 Wet OB wordt elke op een factuur vermelde omzetbelasting
// verschuldigd, ook als ze niet verschuldigd was.
//
// Sinds 05-10-2026 (RISICO: laten bevestigen door de boekhouder):
//  - een salon in een ANDERE EU-lidstaat (bijv. Belgie) met een btw-nummer is
//    een ondernemer: plaats van dienst is haar land en de btw wordt verlegd
//    (art. 6 lid 1 Wet OB, art. 196 Btw-richtlijn). Geen Nederlandse btw op de
//    factuur, wel de vermelding "btw verlegd" met haar btw-nummer
//    (vat_reverse_charge + customer_btw_id in de factuurmail);
//  - zonder btw-nummer blijft het 21% Nederlandse btw (zoals altijd);
//  - elk land BUITEN de EU (de Caribische delen hierboven, maar ook bijv. het
//    Verenigd Koninkrijk) valt buiten de Nederlandse btw: null.
//
// Verleggen staat nog UIT: een factuur met verlegde btw moet "btw verlegd" en
// het btw-nummer van de afnemer vermelden (art. 35a Wet OB), en de factuurmail
// (send-emails, subscription_invoice) toont vat_reverse_charge/customer_btw_id
// nog niet: bij vat_rate null drukt hij de Caribische "buiten de EU"-tekst af.
// Tot dat sjabloon het toont en de boekhouder akkoord is, krijgt zo'n salon de
// 21% van vroeger. Daarna REVERSE_CHARGE_READY op true. (Er is nu geen salon
// buiten NL/BQ/CW, dus niemand merkt het verschil.)
const REVERSE_CHARGE_READY = false;
const EU_COUNTRIES = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
function vatForCustomer(countryCode: unknown, btwId: unknown): { rate: number | null; reverseCharge: boolean; btwId: string } {
  const cc = String(countryCode || "NL").toUpperCase();
  if (cc === "NL") return { rate: NL_VAT, reverseCharge: false, btwId: "" };
  if (OUTSIDE_EU_VAT.includes(cc) || !EU_COUNTRIES.includes(cc)) return { rate: null, reverseCharge: false, btwId: "" };
  // Btw-nummers beginnen met de landcode (Griekenland: EL). Een nummer zonder
  // letters vooraan (bijv. Belgisch "0123.456.789") krijgt die erbij.
  const prefix = cc === "GR" ? "EL" : cc;
  let id = String(btwId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[0-9]/.test(id)) id = prefix + id;
  if (REVERSE_CHARGE_READY && id.length >= 8 && id.startsWith(prefix)) return { rate: null, reverseCharge: true, btwId: id };
  return { rate: NL_VAT, reverseCharge: false, btwId: "" };
}

// Velden voor de factuurmail (subscription_invoice) bij een factuurrij.
function invoiceFieldsOf(invoiceRow: Record<string, unknown> | null, periodStart: Date, countryCode: unknown, btwId: unknown): Record<string, unknown> {
  if (!invoiceRow) return {};
  const vat = vatForCustomer(countryCode, btwId);
  return {
    invoice_number: invoiceRow.invoice_number,
    amount_excl_vat: invoiceRow.amount_excl_vat,
    vat_amount: invoiceRow.vat_amount,
    vat_rate: invoiceRow.vat_rate,
    period_start: periodStart.toISOString(),
    ...(vat.reverseCharge ? { vat_reverse_charge: true, customer_btw_id: vat.btwId } : {}),
  };
}

async function createInvoice(ownerId: string, eventId: string | null, p: MolliePayment, plan: string, interval: "monthly" | "yearly", customerCountry: string | null, customerBtwId: string | null, periodStart: Date, periodEnd: Date) {
  // Een herhaalde verwerking (na een fout verderop) maakt geen tweede factuur
  // met een nieuw nummer: per betaalgebeurtenis bestaat er hooguit een.
  if (eventId) {
    const { data: existing } = await supabase
      .from("payment_invoices")
      .select("id, invoice_number, amount_excl_vat, vat_amount, vat_rate")
      .eq("payment_event_id", eventId)
      .limit(1)
      .maybeSingle();
    if (existing) return existing as Record<string, unknown>;
  }
  const total = parseFloat(p.amount.value);
  // Het BEDRAG dat de klant betaalt verandert niet; alleen of er Nederlandse
  // BTW in verwerkt zit. Bij 0% is het hele bedrag de vergoeding.
  const vatRate = vatForCustomer(customerCountry, customerBtwId).rate;
  // Buiten het toepassingsgebied: het hele bedrag is de vergoeding en er is
  // geen BTW-bedrag — niet 0,00 maar helemaal geen.
  const exclVat = vatRate === null ? total : +(total / (1 + vatRate)).toFixed(2);
  const vatAmount = vatRate === null ? null : +(total - exclVat).toFixed(2);
  const { data: numRow, error: numErr } = await supabase.rpc("get_next_vellu_invoice_number");
  if (numErr) {
    console.error("get_next_vellu_invoice_number error:", numErr);
    return null;
  }
  const invoiceNumber = numRow as unknown as string;
  const { data: inv, error: invErr } = await supabase
    .from("payment_invoices")
    .insert({
      owner_id: ownerId,
      payment_event_id: eventId,
      invoice_number: invoiceNumber,
      issued_at: new Date().toISOString(),
      period_start: periodStart.toISOString().slice(0, 10),
      period_end: periodEnd.toISOString().slice(0, 10),
      plan,
      billing_interval: interval,
      amount_excl_vat: exclVat,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total_eur: total,
    })
    .select("id, invoice_number")
    .maybeSingle();
  // De bedragen meegeven zodat de factuurmail ze niet nog een keer zelf
  // uitrekent \u2014 dat stond op twee plekken los gekopieerd met /1.21 erin en
  // dreef daardoor af zodra het tarief per land ging verschillen.
  const amounts = { amount_excl_vat: exclVat, vat_amount: vatAmount, vat_rate: vatRate };
  if (invErr) {
    console.error("payment_invoices insert error:", invErr);
    return null;
  }
  return inv ? { ...(inv as Record<string, unknown>), ...amounts } : null;
}

serve(async (req) => {
  if (req.method !== "POST") return plain(405, "method not allowed");
  const ct = req.headers.get("content-type") || "";
  let paymentId = "";
  try {
    if (ct.includes("application/json")) {
      const j = await req.json();
      paymentId = (j as { id?: string }).id || "";
    } else {
      const form = await req.formData();
      paymentId = (form.get("id") as string) || "";
    }
  } catch (e) {
    console.error("webhook body parse error:", e);
    return plain(400, "bad body");
  }
  if (!paymentId || !/^tr_[A-Za-z0-9]+$/.test(paymentId)) {
    if (!/^sub_[A-Za-z0-9]+$/.test(paymentId)) return plain(400, "bad id");
  }
  const isSub = paymentId.startsWith("sub_");
  if (isSub) {
    console.log("Subscription event received:", paymentId);
    return plain(200, "ok");
  }
  let fetched: Awaited<ReturnType<typeof mollieFetch>>;
  try {
    fetched = await mollieFetch(`/payments/${paymentId}`);
  } catch (e) {
    // Time-out of netwerkfout: Mollie probeert het later opnieuw.
    console.error("mollie payment fetch error:", paymentId, e);
    return plain(503, "mollie unavailable");
  }
  if (!fetched.ok || !fetched.data) {
    console.error("mollie payment fetch failed:", fetched.status, fetched.raw);
    // Mollie zelf even onbereikbaar: een foutcode laat Mollie het later opnieuw
    // proberen. Een 4xx (onbekend id) blijft gewoon "ok".
    if (fetched.status >= 500) return plain(503, "mollie unavailable");
    return plain(200, "ok");
  }
  const payment = fetched.data as MolliePayment;
  const ownerId = (payment.metadata as { owner_id?: string } | null)?.owner_id || null;
  // Storno's en terugbetalingen laten de status op "paid" staan en vallen dus
  // buiten de gewone gebeurtenis hieronder; die worden hier apart bekeken.
  await handleReversals(payment, ownerId);
  const eventType = classifyEvent(payment);
  let claim: Claim;
  try {
    claim = await claimEvent(ownerId, payment, eventType);
  } catch (e) {
    console.error("logEvent error:", e);
    return plain(500, "log error");
  }
  if (claim.state === "done") return plain(200, "ok (duplicate)");
  // Een andere aanroep is er nu mee bezig. Een foutcode, zodat Mollie het later
  // nog eens probeert als die andere aanroep onverhoopt mislukt.
  if (claim.state === "busy") return plain(503, "busy (in progress)");
  let res: Result;
  try {
    res = await processEvent(payment, ownerId, claim.id, claim.outcome);
  } catch (e) {
    console.error("mollie-webhook processing error:", payment.id, e);
    if (payment.status === "paid") {
      await alertAdmin(`Betaling niet verwerkt: ${payment.id}`, [
        `Betaling: ${payment.id} (${payment.sequenceType || "oneoff"}, EUR ${payment.amount.value})`,
        `Salon (owner_id): ${ownerId || "?"}`,
        `Fout: ${String(e).slice(0, 300)}`,
        "Mollie en check-pending-payments proberen het opnieuw; controleer of het daarna gelukt is.",
      ]);
    }
    res = { status: 500, body: "processing error", done: false };
  }
  if (res.done) await markProcessed(claim.id);
  else await releaseClaim(claim.id);
  return plain(res.status, res.body);
});

// Uitkomst van een verwerking. done = alles gelukt (of er valt niets meer te
// doen): processed_at erop. Anders wordt de claim vrijgegeven en mag een
// herhaling het opnieuw proberen.
type Result = { status: number; body: string; done: boolean };
const handled = (done = true): Result => ({ status: 200, body: "ok", done });
const retryLater = (body: string): Result => ({ status: 500, body, done: false });

async function processEvent(
  payment: MolliePayment,
  ownerId: string | null,
  eventId: string,
  savedOutcome: Outcome | null,
): Promise<Result> {
  const terminal = TERMINAL_STATUSES.includes(payment.status);
  if (!ownerId) {
    console.warn("payment has no owner_id metadata:", payment.id);
    return { status: 200, body: "ok (no owner)", done: true };
  }
  const meta = payment.metadata as { plan?: string; billing_interval?: string; kind?: string } | null;
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, plan, billing_interval, mollie_customer_id, mollie_mandate_id, mollie_subscription_id, plan_expires_at, subscription_status, cancel_at_period_end, cancelled_at, referral_credit_days, referral_credit_days_redeemed, email, business_name, country_code, btw_id, trial_ends_at")
    .eq("id", ownerId)
    .maybeSingle();
  if (profErr) {
    console.error("profile lookup error:", ownerId, profErr);
    return retryLater("profile lookup error");
  }
  if (!profile) {
    console.warn("payment owner has no profile row:", ownerId);
    return { status: 200, body: "ok (no profile)", done: true };
  }
  const country = (profile as Record<string, unknown>).country_code as string | null;
  const btwId = (profile as Record<string, unknown>).btw_id as string | null;
  const salonLabel = `${profile.business_name || "?"} (${profile.email || ownerId})`;

  // ── JAARBETALING (eenmalig, GEEN machtiging) ──────────────────────────
  // create-subscription stuurt jaarabonnementen als sequenceType "oneoff" met
  // kind "yearly_oneoff": een gewone aankoop, geen doorlopende incasso. Reden
  // staat daar uitgelegd — een machtiging wordt door veel niet-Europese banken
  // geweigerd, een eenmalige betaling niet.
  //
  // Deze tak lijkt op first.paid hieronder, maar mist bewust de subscription-
  // creatie bij Mollie: er is geen mandaat en er hoeft niets automatisch te
  // verlengen. Toegang loopt puur op plan_expires_at; de app rekent daar live
  // mee (src/App.jsx ~195), dus als die datum verstrijkt vervalt de toegang
  // vanzelf. send-renewal-reminder herinnert de salon een week van tevoren.
  if (payment.sequenceType === "oneoff" && meta?.kind === "yearly_oneoff") {
    if (payment.status === "paid") {
      const plan = meta?.plan || profile.plan || "professional";
      let out = savedOutcome;
      if (!out) {
        // Verlengen vóór de einddatum: het nieuwe jaar sluit aan op het lopende.
        const periodStart = paidPeriodStart(profile.plan_expires_at);
        const periodEnd = addInterval(periodStart, "yearly");

        // Referral-krediet uit de proefperiode wordt ook hier verzilverd: de
        // eerste betaalde periode wordt met de gespaarde dagen verlengd. Zelfde
        // regel als bij het maandpad, zodat "2 weken gratis" echt gratis is.
        let creditsUsed = 0;
        let periodEndWithCredit = periodEnd;
        if ((profile.referral_credit_days || 0) > 0) {
          creditsUsed = profile.referral_credit_days || 0;
          periodEndWithCredit = new Date(periodEnd);
          periodEndWithCredit.setDate(periodEndWithCredit.getDate() + creditsUsed);
        }

        const yearUpdates: Record<string, unknown> = {
          plan,
          billing_interval: "yearly",
          subscription_status: "active",
          // GEEN mollie_subscription_id: er is bewust geen doorlopend abonnement
          // bij Mollie. Een eventueel oud abonnement-id wissen we (en het
          // abonnement zelf wordt hieronder bij Mollie gestopt), zodat de
          // recurring-takken deze salon niet als abonnee behandelen.
          mollie_subscription_id: null,
          mollie_mandate_id: null,
          current_period_start: periodStart.toISOString(),
          plan_expires_at: periodEndWithCredit.toISOString(),
          cancel_at_period_end: false,
          cancelled_at: null,
        };
        if (creditsUsed > 0) {
          yearUpdates.referral_credit_days = 0;
          yearUpdates.referral_credit_days_redeemed =
            ((profile as { referral_credit_days_redeemed?: number }).referral_credit_days_redeemed || 0) + creditsUsed;
        }
        out = {
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          access_end: periodEndWithCredit.toISOString(),
          credits_used: creditsUsed,
          updates: yearUpdates,
        };
        if (!(await saveOutcome(eventId, out))) return retryLater("outcome save error");
      }
      const periodStart = new Date(String(out.period_start));
      const periodEnd = new Date(String(out.period_end));
      const accessEnd = new Date(String(out.access_end));
      const creditsUsed = Number(out.credits_used || 0);

      // Een jaarbetaling heeft geen doorlopend abonnement: stop alles wat er bij
      // Mollie nog loopt (bijv. het maandabonnement van een salon die vanuit
      // past_due of na opzeggen naar jaarlijks overstapt). Lukt dat niet, dan
      // gaat de toegang toch open en krijgt de beheerder een seintje.
      const customerId = payment.customerId || String(profile.mollie_customer_id || "");
      if (customerId) {
        const failed: string[] = [];
        const oldSub = String(profile.mollie_subscription_id || "");
        if (oldSub && !(await cancelMollieSubscription(customerId, oldSub))) failed.push(oldSub);
        for (const id of await cancelOtherSubscriptions(customerId, null)) if (id !== oldSub) failed.push(id);
        if (failed.length) {
          await alertAdmin(`Oud Mollie-abonnement niet gestopt: ${profile.business_name || ownerId}`, [
            `Salon: ${salonLabel}`,
            `Jaarbetaling: ${payment.id} (EUR ${payment.amount.value})`,
            `Mollie-klant: ${customerId}`,
            `Niet gestopt: ${failed.join(", ")}`,
            "Stop deze abonnementen met de hand in Mollie, anders wordt er naast het jaar ook nog maandelijks afgeschreven.",
          ]);
        }
      }

      const { error: updErr } = await supabase.from("profiles").update(out.updates as Record<string, unknown>).eq("id", ownerId);
      if (updErr) {
        console.error("yearly profile update error:", ownerId, updErr);
        await alertAdmin(`Jaarbetaling niet verwerkt: ${profile.business_name || ownerId}`, [
          `Salon: ${salonLabel}`,
          `Betaling: ${payment.id} (EUR ${payment.amount.value})`,
          `Profiel bijwerken mislukt: ${updErr.message || String(updErr)}`,
          "Mollie probeert het opnieuw; controleer of de toegang daarna open staat.",
        ]);
        return retryLater("profile update error");
      }
      await grantReferralCredit(ownerId);

      const invoiceRow = await createInvoice(ownerId, eventId, payment, plan, "yearly", country, btwId, periodStart, periodEnd);
      const invoiceFields = invoiceFieldsOf(invoiceRow, periodStart, country, btwId);

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: (profile as Record<string, unknown>).email,
              owner_id: ownerId,
              plan,
              billing_interval: "yearly",
              amount: parseFloat(payment.amount.value),
              period_end: accessEnd.toISOString(),
              business_name: (profile as Record<string, unknown>).business_name,
              credits_used: creditsUsed || 0,
              ...invoiceFields,
            },
          }),
        });
      } catch (e) { console.error("yearly subscription_invoice email error:", e); }
      return handled();
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      // Zelfde mislukte-betaling-afhandeling als bij het maandpad: een mail
      // naar de salon en een seintje naar de beheerder. Uitgefactoreerd zodat
      // beide takken exact hetzelfde doen.
      await notifyPaymentFailed(payment, profile, meta, ownerId);
      return handled();
    }
    return handled(terminal);
  }

  if (payment.sequenceType === "first") {
    if (payment.status === "paid") {
      const plan = meta?.plan || profile.plan || "starter";
      const interval = (meta?.billing_interval || profile.billing_interval || "monthly") as "monthly" | "yearly";
      const mandateId = payment.mandateId || profile.mollie_mandate_id || "";
      let out = savedOutcome;
      if (!out) {
        // Abonneren tijdens de proef of vóór het einde van een opgezegde
        // periode: de betaalde periode begint pas als die toegang afloopt.
        const periodStart = paidPeriodStart(profile.plan_expires_at);
        const periodEnd = addInterval(periodStart, interval);
        // Referral credit earned during the trial is honored at conversion:
        // the first paid period is extended by the credited days AND the
        // subscription only starts charging after them — so "2 weeks free"
        // are genuinely free, not just a drifting expiry date.
        let firstCreditsUsed = 0;
        let firstEnd = periodEnd;
        if ((profile.referral_credit_days || 0) > 0) {
          firstCreditsUsed = profile.referral_credit_days || 0;
          firstEnd = new Date(periodEnd);
          firstEnd.setDate(firstEnd.getDate() + firstCreditsUsed);
        }
        const firstUpdates: Record<string, unknown> = {
          plan,
          billing_interval: interval,
          subscription_status: "active",
          mollie_mandate_id: mandateId,
          current_period_start: periodStart.toISOString(),
          plan_expires_at: firstEnd.toISOString(),
          cancel_at_period_end: false,
          cancelled_at: null,
        };
        if (firstCreditsUsed > 0) {
          firstUpdates.referral_credit_days = 0;
          firstUpdates.referral_credit_days_redeemed =
            ((profile as { referral_credit_days_redeemed?: number }).referral_credit_days_redeemed || 0) + firstCreditsUsed;
        }
        out = {
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          access_end: firstEnd.toISOString(),
          credits_used: firstCreditsUsed,
          updates: firstUpdates,
          // Het abonnement van vóór deze betaling; bij een herhaling is het
          // profiel misschien al bijgewerkt.
          old_subscription_id: profile.mollie_subscription_id || null,
        };
        if (!(await saveOutcome(eventId, out))) return retryLater("outcome save error");
      }
      const periodStart = new Date(String(out.period_start));
      const periodEnd = new Date(String(out.period_end));
      const firstEnd = new Date(String(out.access_end));
      const firstCreditsUsed = Number(out.credits_used || 0);

      const customerId = payment.customerId || "";
      let subscriptionId = String(out.subscription_id || "");
      let subFailed = false;
      if (customerId && mandateId) {
        const oldSub = String(("old_subscription_id" in out ? out.old_subscription_id : profile.mollie_subscription_id) || "");
        // 0. Handmatig herstel: mislukte het abonnement eerder (seintje
        //    "Abonnement niet aangemaakt") en staat er nu een ander id in het
        //    profiel dan vóór deze betaling, dan maakte de beheerder het met de
        //    hand aan (of wisselde de salon intussen van plan). Dat abonnement
        //    overnemen; anders zou deze herhaling er nog een aanmaken en het
        //    hare in stap 3 stoppen.
        const profileSub = String(profile.mollie_subscription_id || "");
        if (!subscriptionId && out.subscription_alerted && profileSub && profileSub !== oldSub) {
          subscriptionId = profileSub;
          out = { ...out, subscription_id: subscriptionId, subscription_adopted: true };
          await saveOutcome(eventId, out);
        }
        // 1. Het vorige abonnement eerst stoppen (salon kwam uit past_due, of
        //    betaalt opnieuw na opzeggen). Zonder dit bleef het oude naast het
        //    nieuwe afschrijven.
        if (oldSub && oldSub !== subscriptionId && !(await cancelMollieSubscription(customerId, oldSub))) {
          await alertAdmin(`Oud Mollie-abonnement niet gestopt: ${profile.business_name || ownerId}`, [
            `Salon: ${salonLabel}`,
            `Eerste betaling: ${payment.id} (EUR ${payment.amount.value})`,
            `Mollie-klant: ${customerId}`,
            `Niet gestopt: ${oldSub}`,
            "Stop dit abonnement met de hand in Mollie, anders wordt er dubbel afgeschreven.",
          ]);
        }
        // 2. Het nieuwe abonnement, één keer per betaling: een herhaling vindt
        //    het id in outcome terug en maakt er geen tweede aan.
        if (!subscriptionId) {
          const intervalStr = interval === "yearly" ? "12 months" : "1 month";
          // Eerste automatische afschrijving = einde van de zojuist betaalde periode.
          const startDate = firstEnd.toISOString().slice(0, 10);
          const subRes = await mollieFetch(`/customers/${customerId}/subscriptions`, {
            method: "POST",
            body: JSON.stringify({
              amount: payment.amount,
              interval: intervalStr,
              startDate,
              description: payment.description?.replace(" — first payment", "") || `Vellu ${plan}`,
              mandateId,
              webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
              metadata: { owner_id: ownerId, plan, billing_interval: interval, first_payment_id: payment.id },
            }),
          });
          if (subRes.ok && subRes.data && typeof subRes.data === "object") {
            subscriptionId = (subRes.data as { id: string }).id;
            out = { ...out, subscription_id: subscriptionId };
            await saveOutcome(eventId, out);
          } else {
            console.error("subscription create failed:", subRes.status, subRes.raw);
            subFailed = true;
            // Eén seintje per betaling; herhalingen blijven het stil proberen.
            if (!out.subscription_alerted) {
              out = { ...out, subscription_alerted: true };
              await saveOutcome(eventId, out);
              await alertAdmin(`Abonnement niet aangemaakt: ${profile.business_name || ownerId}`, [
                `Salon: ${salonLabel}`,
                `Eerste betaling: ${payment.id} (EUR ${payment.amount.value}) is betaald.`,
                `Mollie antwoordde ${subRes.status}: ${String(subRes.raw || "").slice(0, 300)}`,
                "De toegang staat open, maar er loopt (nog) geen automatische verlenging. Mollie en check-pending-payments proberen het opnieuw; lukt het niet, maak het abonnement dan met de hand aan (startdatum " + startDate + ").",
                MANUAL_SUB_ID_NOTE + " De volgende herhaling neemt het dan over (maakt er geen tweede aan) en stuurt de factuur.",
              ]);
            }
          }
        }
        // 3. Alles wat er bij deze klant verder nog loopt stoppen.
        if (subscriptionId) {
          const failed = await cancelOtherSubscriptions(customerId, subscriptionId);
          if (failed.length) {
            await alertAdmin(`Oud Mollie-abonnement niet gestopt: ${profile.business_name || ownerId}`, [
              `Salon: ${salonLabel}`,
              `Nieuw abonnement: ${subscriptionId}`,
              `Niet gestopt: ${failed.join(", ")}`,
              "Stop deze abonnementen met de hand in Mollie, anders wordt er dubbel afgeschreven.",
            ]);
          }
        }
      } else {
        // Een betaalde eerste betaling zonder klant of machtiging hoort niet
        // voor te komen; zonder machtiging kan er geen abonnement komen. De
        // toegang gaat wel open; de verlenging moet de beheerder regelen.
        console.error("first.paid without customer/mandate:", payment.id, customerId, mandateId);
        if (!out.subscription_alerted) {
          out = { ...out, subscription_alerted: true };
          await saveOutcome(eventId, out);
          await alertAdmin(`Geen machtiging bij eerste betaling: ${profile.business_name || ownerId}`, [
            `Salon: ${salonLabel}`,
            `Betaling: ${payment.id} (EUR ${payment.amount.value})`,
            "Er is geen Mollie-machtiging, dus geen automatische verlenging. Regel het abonnement met de hand.",
            MANUAL_SUB_ID_NOTE,
          ]);
        }
      }

      const firstUpdates: Record<string, unknown> = {
        ...(out.updates as Record<string, unknown>),
        // Het oude abonnement is hierboven gestopt; zonder nieuw abonnement
        // (mislukt) blijft het veld leeg tot een herhaling het wel aanmaakt.
        mollie_subscription_id: customerId && mandateId
          ? (subscriptionId || null)
          : (profile.mollie_subscription_id || null),
      };
      const { error: updErr } = await supabase.from("profiles").update(firstUpdates).eq("id", ownerId);
      if (updErr) {
        console.error("first.paid profile update error:", ownerId, updErr);
        await alertAdmin(`Eerste betaling niet verwerkt: ${profile.business_name || ownerId}`, [
          `Salon: ${salonLabel}`,
          `Betaling: ${payment.id} (EUR ${payment.amount.value})`,
          `Profiel bijwerken mislukt: ${updErr.message || String(updErr)}`,
          "Mollie probeert het opnieuw; controleer of de toegang daarna open staat.",
        ]);
        return retryLater("profile update error");
      }
      // Toegang staat open. Zonder abonnement nog niet afronden: een herhaling
      // probeert het abonnement opnieuw en stuurt dan pas de factuur.
      if (subFailed) return retryLater("subscription create failed");
      await grantReferralCredit(ownerId);

      const invoiceRow = await createInvoice(ownerId, eventId, payment, plan, interval, country, btwId, periodStart, periodEnd);
      const invoiceFields = invoiceFieldsOf(invoiceRow, periodStart, country, btwId);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: (profile as Record<string, unknown>).email,
              owner_id: ownerId,
              plan,
              billing_interval: interval,
              amount: parseFloat(payment.amount.value),
              period_end: firstEnd.toISOString(),
              business_name: (profile as Record<string, unknown>).business_name,
              credits_used: firstCreditsUsed || 0,
              ...invoiceFields,
            },
          }),
        });
      } catch (e) { console.error("subscription_invoice email error:", e); }
      return handled();
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      await notifyPaymentFailed(payment, profile, meta, ownerId);
      return handled();
    }
    return handled(terminal);
  }
  // ── PRO-RATA UPGRADE CHARGE (one-off, NOT a renewal) ──────────────────
  // A recurring mandate payment created by change-plan for a mid-period
  // upgrade. It must NOT move plan_expires_at, NOT touch current_period_start,
  // NOT consume referral_credit_days, and NOT flip the account to past_due:
  // the subscription itself is untouched. It only records + emails the invoice
  // for the difference. On failure the upgrade is already applied server-side,
  // so we just log it for manual follow-up.
  if (payment.sequenceType === "recurring" && meta?.kind === "upgrade_proration") {
    if (payment.status === "paid") {
      const plan = meta?.plan || profile.plan || "professional";
      const interval = (meta?.billing_interval || profile.billing_interval || "monthly") as "monthly" | "yearly";
      const metaP = payment.metadata as { period_start?: string; period_end?: string } | null;
      const periodStart = metaP?.period_start ? new Date(metaP.period_start) : new Date();
      const periodEnd = metaP?.period_end
        ? new Date(metaP.period_end)
        : (profile.plan_expires_at ? new Date(profile.plan_expires_at) : addInterval(periodStart, interval));
      const invoiceRow = await createInvoice(ownerId, eventId, payment, plan, interval, country, btwId, periodStart, periodEnd);
      const invoiceFields = invoiceFieldsOf(invoiceRow, periodStart, country, btwId);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: (profile as Record<string, unknown>).email,
              owner_id: ownerId,
              plan,
              billing_interval: interval,
              amount: parseFloat(payment.amount.value),
              period_end: periodEnd.toISOString(),
              business_name: (profile as Record<string, unknown>).business_name,
              ...invoiceFields,
            },
          }),
        });
      } catch (e) { console.error("proration invoice email error:", e); }
      return handled();
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      // Upgrade already applied; we simply didn't collect the small
      // difference. Log loudly for manual follow-up — do NOT flip the
      // account to past_due (the subscription itself is fine).
      console.error("upgrade proration charge did not settle:", payment.id, payment.status, "owner", ownerId);
      return handled();
    }
    return handled(terminal);
  }
  if (payment.sequenceType === "recurring") {
    // Alleen afschrijvingen van HET abonnement van deze salon tellen. Een
    // betaling van een ander abonnement (een oud dat toch nog liep, of van vóór
    // een jaarbetaling) verlengt niets en zet ook niets op past_due: alleen een
    // seintje, zodat de beheerder het abonnement stopt en zo nodig terugbetaalt.
    // Tot 05-10-2026 verlengde zo'n betaling de toegang gewoon nog een keer.
    // (Heeft deze gebeurtenis al een outcome, dan is de controle bij de eerste
    // poging al gedaan; een herschikking door tegoed kan het id sindsdien
    // veranderd hebben.)
    // Uitzondering: een betaalde verlenging die al liep toen de salon opzegde
    // (paidBeforeSoftCancel). Die verlengt wel, maar raakt het (gestopte)
    // abonnement verder niet aan. Mislukt zo'n laatste incasso, dan blijft het
    // bij de melding: de salon had al opgezegd en houdt gewoon de toegang tot
    // plan_expires_at.
    const currentSub = String(profile.mollie_subscription_id || "");
    let cancelledInFlight = false;
    if (!savedOutcome && (!payment.subscriptionId || payment.subscriptionId !== currentSub)) {
      if (payment.status === "paid") {
        const inFlight = await paidBeforeSoftCancel(payment, profile as Record<string, unknown>, ownerId);
        if (inFlight === "retry") return retryLater("subscription lookup failed");
        cancelledInFlight = inFlight;
      }
    }
    if (!savedOutcome && !cancelledInFlight && (!payment.subscriptionId || payment.subscriptionId !== currentSub)) {
      if (terminal) {
        await alertAdmin(`Betaling van een ander abonnement genegeerd: ${profile.business_name || ownerId}`, [
          `Salon: ${salonLabel}`,
          `Betaling: ${payment.id} (${payment.status}, EUR ${payment.amount.value})`,
          `Abonnement van deze betaling: ${payment.subscriptionId || "geen"}`,
          `Huidig abonnement in Vellu: ${currentSub || "geen"}`,
          payment.status === "paid"
            ? "Er is geld afgeschreven, maar de toegang is NIET verlengd. Stop dit abonnement in Mollie en betaal zo nodig terug."
            : "De abonnementsstatus is niet aangepast.",
          payment.status === "paid"
            ? "Hoort dit abonnement wel bij de salon (bijv. met de hand aangemaakt)? Zet het id in profiles.mollie_subscription_id, maak processed_at van deze gebeurtenis in payment_events leeg (claimed_at laten staan) en stuur de webhook na 7 minuten opnieuw aan met dit betaling-id."
            : "",
        ]);
      }
      return { status: 200, body: "ok (other subscription)", done: terminal };
    }
    if (payment.status === "paid") {
      const plan = profile.plan || "starter";
      const interval = (profile.billing_interval || "monthly") as "monthly" | "yearly";
      let out = savedOutcome;
      if (!out) {
        // Normaal sluit de nieuwe periode aan op de vorige. Is de afschrijving
        // pas (veel) later aangemaakt dan die einddatum, bijvoorbeeld omdat een
        // maand mislukte en Mollie het pas bij de volgende termijn opnieuw
        // probeerde, dan begint de betaalde periode bij die afschrijving. Tot
        // 05-10-2026 bleef plan_expires_at dan in het verleden en stond een
        // salon die net betaald had na de coulance alsnog op slot.
        const prevEnd = profile.plan_expires_at ? new Date(profile.plan_expires_at) : new Date();
        const chargedRaw = payment.createdAt || payment.paidAt || "";
        const chargedAt = chargedRaw ? new Date(chargedRaw) : null;
        const periodStart = chargedAt && !isNaN(chargedAt.getTime()) && chargedAt.getTime() > prevEnd.getTime()
          ? chargedAt
          : prevEnd;
        const periodEnd = addInterval(periodStart, interval);
        // Referral credit is stored in DAYS (3 weeks = 21 per referral) and
        // extends the paid period on top, at no charge.
        let extraEnd = periodEnd;
        let creditsUsed = 0;
        if ((profile.referral_credit_days || 0) > 0) {
          creditsUsed = profile.referral_credit_days || 0;
          extraEnd = new Date(periodEnd);
          extraEnd.setDate(extraEnd.getDate() + creditsUsed);
        }
        const updates: Record<string, unknown> = {
          subscription_status: "active",
          current_period_start: periodStart.toISOString(),
          plan_expires_at: extraEnd.toISOString(),
        };
        if (creditsUsed > 0) {
          updates.referral_credit_days = 0;
          // Lifetime redeemed counter — the dashboard shows open balance vs
          // redeemed; with the reward rate change (21 → 14 days) history can
          // only be tracked, not reconstructed.
          updates.referral_credit_days_redeemed =
            ((profile as { referral_credit_days_redeemed?: number }).referral_credit_days_redeemed || 0) + creditsUsed;
        }
        out = {
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          access_end: extraEnd.toISOString(),
          credits_used: creditsUsed,
          updates,
          // Laatste verlenging van een opgezegd abonnement: niet herplannen.
          ...(cancelledInFlight ? { cancelled_in_flight: true } : {}),
        };
        if (!(await saveOutcome(eventId, out))) return retryLater("outcome save error");
      }
      const periodStart = new Date(String(out.period_start));
      const periodEnd = new Date(String(out.period_end));
      const extraEnd = new Date(String(out.access_end));
      const creditsUsed = Number(out.credits_used || 0);
      // Make the free days REAL: Mollie charges on its own fixed schedule,
      // so extending plan_expires_at alone would keep collecting every
      // interval and the credit would never become skipped payments.
      // Reschedule: cancel the running subscription and recreate it starting
      // when the credited period ends. Cancel-FIRST on purpose — if the
      // recreate fails the customer keeps access until extraEnd and we miss
      // at most one renewal (alert to the admin for manual repair); the reverse
      // order could double-charge them, which is worse. Done once per event
      // (outcome.reschedule_done), so a retry never reschedules twice. Never
      // for the last renewal of a cancelled subscription (cancelled_in_flight):
      // the salon cancelled, so nothing may be recreated; the credit only
      // extends the expiry.
      if (creditsUsed > 0 && payment.customerId && !out.reschedule_done && !out.cancelled_in_flight) {
        const oldSubId = payment.subscriptionId || profile.mollie_subscription_id || "";
        const mandateId = payment.mandateId || profile.mollie_mandate_id || "";
        let reschedule: Outcome = { reschedule_done: true };
        if (oldSubId && mandateId) {
          const del = await mollieFetch(`/customers/${payment.customerId}/subscriptions/${oldSubId}`, { method: "DELETE" });
          if (!del.ok) {
            console.error("credit reschedule: cancel of", oldSubId, "failed:", del.status, del.raw, "— owner", ownerId, "keeps old schedule; credit only extends expiry this cycle");
          } else {
            const intervalStr = interval === "yearly" ? "12 months" : "1 month";
            const subRes = await mollieFetch(`/customers/${payment.customerId}/subscriptions`, {
              method: "POST",
              body: JSON.stringify({
                amount: payment.amount,
                interval: intervalStr,
                startDate: extraEnd.toISOString().slice(0, 10),
                description: payment.description || `Vellu ${plan}`,
                mandateId,
                webhookUrl: `${SUPABASE_URL}/functions/v1/mollie-webhook`,
                metadata: { owner_id: ownerId, plan, billing_interval: interval },
              }),
            });
            if (subRes.ok && subRes.data && typeof subRes.data === "object") {
              reschedule = { ...reschedule, new_subscription_id: (subRes.data as { id: string }).id };
            } else {
              // Old subscription is cancelled and the new one failed: the
              // customer keeps access until extraEnd, but nothing will renew
              // after that. Log + alert with everything needed for manual repair.
              console.error("credit reschedule: RECREATE FAILED after cancel — restore subscription manually! owner", ownerId, "customer", payment.customerId, "mandate", mandateId, "startDate", extraEnd.toISOString().slice(0, 10), "resp:", subRes.status, subRes.raw);
              await alertAdmin(`Abonnement herstellen: ${profile.business_name || ownerId}`, [
                `Salon: ${salonLabel}`,
                `Oud abonnement ${oldSubId} is gestopt om referral-tegoed te verrekenen, maar het nieuwe kon niet worden aangemaakt.`,
                `Mollie-klant: ${payment.customerId}, machtiging: ${mandateId}, startdatum: ${extraEnd.toISOString().slice(0, 10)}`,
                `Mollie antwoordde ${subRes.status}: ${String(subRes.raw || "").slice(0, 300)}`,
                "Maak het abonnement met de hand aan; de toegang loopt tot de startdatum.",
                MANUAL_SUB_ID_NOTE,
              ]);
              reschedule = { ...reschedule, new_subscription_id: null };
            }
          }
        }
        out = { ...out, ...reschedule };
        await saveOutcome(eventId, out);
      }
      const updates: Record<string, unknown> = {
        ...(out.updates as Record<string, unknown>),
        ...("new_subscription_id" in out ? { mollie_subscription_id: out.new_subscription_id } : {}),
      };
      const { error: updErr } = await supabase.from("profiles").update(updates).eq("id", ownerId);
      if (updErr) {
        console.error("recurring.paid profile update error:", ownerId, updErr);
        await alertAdmin(`Verlenging niet verwerkt: ${profile.business_name || ownerId}`, [
          `Salon: ${salonLabel}`,
          `Betaling: ${payment.id} (EUR ${payment.amount.value})`,
          `Profiel bijwerken mislukt: ${updErr.message || String(updErr)}`,
          "Mollie probeert het opnieuw; controleer of plan_expires_at daarna is opgeschoven.",
        ]);
        return retryLater("profile update error");
      }
      const invoiceRow = await createInvoice(ownerId, eventId, payment, plan, interval, country, btwId, periodStart, periodEnd);
      const invoiceFields = invoiceFieldsOf(invoiceRow, periodStart, country, btwId);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
          method: "POST",
          headers: { "x-internal-secret": SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "subscription_invoice",
            booking: {
              owner_email: (profile as Record<string, unknown>).email,
              owner_id: ownerId,
              plan,
              billing_interval: interval,
              amount: parseFloat(payment.amount.value),
              period_end: extraEnd.toISOString(),
              business_name: (profile as Record<string, unknown>).business_name,
              credits_used: creditsUsed || 0,
              ...invoiceFields,
            },
          }),
        });
      } catch (e) { console.error("subscription_invoice email error:", e); }
      return handled();
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ subscription_status: "past_due" })
        .eq("id", ownerId);
      if (updErr) {
        console.error("past_due update error:", ownerId, updErr);
        return retryLater("profile update error");
      }
      // Een mislukte verlenging: zelfde mail aan de salon en seintje aan de
      // beheerder als bij een mislukte eerste betaling. Hier ging tot
      // 05-10-2026 niets uit; de salon stond zonder uitleg voor de plan-muur.
      await notifyPaymentFailed(payment, profile, meta, ownerId);
      return handled();
    }
    return handled(terminal);
  }
  return handled(terminal);
}
