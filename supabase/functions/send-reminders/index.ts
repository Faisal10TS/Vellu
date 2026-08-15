// send-reminders — hourly cron (pg_cron '0 * * * *', elk uur op :00 UTC) plus
// de Vercel /api/send-reminders-proxy die rond 09:07-09:47 UTC vuurt: reminds
// clients about their upcoming appointment (moment per salon instelbaar, zie
// v13) and sends each salon a digest of tomorrow's agenda (alleen in het
// 09/10-UTC-venster, zie DIGEST_UTC_HOURS).
//
// v12: client emails now go through send-emails (appointment_reminder
// template: salon branding, Reply-To, plain-text part) instead of bare Resend
// HTML; adds the client SMS (send-sms no-ops for non-Professional salons);
// and adds the NEW salon digest email ("Je afspraken voor morgen"). The
// digest only went out in a run that newly reminded ≥1 appointment for that
// owner — bedoeld als bescherming tegen de dubbele planning (Vercel 09:00 +
// pg_cron 10:00), maar die bescherming bleek niet waterdicht: zie v14.
//
// v13: profiles.reminder_hours wordt eindelijk gerespecteerd. Tot nu toe kreeg
// ELKE bevestigde afspraak van morgen een herinnering, ook bij een salon die in
// Instellingen "geen herinnering" had gekozen — de kolom werd nergens gelezen.
// Zie de uitleg bij RUN_TIMES_UTC_MIN / nextRun() hieronder voor hoe een
// instelling van 1 tot 48 uur samengaat met een cron die twee keer per dag draait.
//
// v14: vier problemen die pas zichtbaar werden toen v13 het venster verbreedde.
//   1. De digest ging twee keer per dag uit. Opgelost met een dagelijkse
//      dedupe-check op cron_health (digestAlreadySentToday, inmiddels in v16
//      vervangen door de per-eigenaar-claim in salon_digest_log).
//   2. De digest verdween bij "geen herinnering", omdat de lijst met eigenaren
//      werd gevuld ná de reminder_hours-check. Die instelling gaat over de mail
//      aan de KLANT, niet over de agenda-mail aan de salon zelf; de digest wordt
//      nu volledig los van reminder_hours opgebouwd.
//   3. De begintijd werd als UTC gelezen terwijl het lokale salontijd is. Nu het
//      venster ook afspraken van VANDAAG oppakt (reminder_hours 1, 2, 4, 12) is
//      dat geen afronding meer maar een echte fout: in Nederland ging er een
//      herinnering uit voor een afspraak die al liep. Zie TZ_BY_COUNTRY /
//      localToUtc.
//   4. De mailtekst zei altijd "morgen". Opgelost in send-emails; deze functie
//      geeft daarvoor booking.today mee (de datum van vandaag in SALONTIJD).
//
// v15: het venster koos systematisch de verkeerde run.
//   1. De oude regel ("verstuur als het gewenste moment binnen 24 uur valt")
//      pakte de EERSTE run die eraan voldeed in plaats van de LAATSTE run vóór
//      dat moment. Omdat er twee runs per dag zijn, ging er dan een hele dag te
//      vroeg een herinnering uit — bij reminder_hours=24 tot 47 uur van tevoren,
//      en daarna nooit meer, want reminder_sent stond al op true. Zie
//      RUN_TIMES_UTC_MIN / nextRun() en de afweging bij de skip-regel zelf.
//   2. De SMS zei nog altijd "morgen" (send-sms), terwijl de e-mail sinds v14
//      wél meebeweegt. Die gebruikt nu dezelfde booking.today-vergelijking.
//   3. De digest-dedupe leunde op "er was vandaag een geslaagde run" en blokkeerde
//      daardoor de digest na elke handmatige aanroep. Zie DIGEST_JOB_NAME.
//
// v16: de cron gaat van twee runs per dag naar ELK UUR, en de digest-dedupe
// verhuist van één globale hartslag-rij naar salon_digest_log per eigenaar.
//   1. reminder_hours 1/2/4/12 beloofden uur-precisie, maar met alleen de runs
//      van 09:00/10:00 UTC kon een herinnering tot ~23 uur te vroeg vertrekken.
//      RUN_TIMES_UTC_MIN is nu een uurlijst; zie de toelichting daar voor
//      waarom de Vercel-run daar niet apart in hoeft.
//   2. De hartslag-dedupe ('send-reminders-digest' in cron_health) was
//      alles-of-niets per dag: na de eerste run die ≥1 digest verstuurde kreeg
//      een salon wiens éérste afspraak-van-morgen pas daarna geboekt werd die
//      dag helemaal niets meer. Nu claimt elke eigenaar zijn eigen rij in
//      salon_digest_log (insert, on conflict do nothing) en wordt alleen bij
//      een geslaagde claim verstuurd; de hartslag blijft puur als telemetrie.
//   3. De digest blijft in het vertrouwde venster (UTC-uur 9 of 10) — zonder
//      die grens zou de uurlijkse cron hem om 00:00 UTC versturen, midden in
//      de nacht voor alle markten. Zie DIGEST_UTC_HOURS.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Salons in these countries get Dutch-language emails, everyone else English.
// Keep in sync with COUNTRIES (defaultLang: "nl") in SRC/shared.jsx — Aruba,
// Curacao and Bonaire are Dutch-language markets too. Unset country = Dutch.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
const langFor = (code?: string | null) => (DUTCH_COUNTRIES.has(code || "NL") ? "nl" : "en");

// Currency symbol per country (mirrors shared.jsx CURRENCIES). Unset = €.
// CW = "Cg " (Caribische gulden, XCG): die verving op 31 maart 2025 de
// Antilliaanse gulden (NAf./ANG) op Curaçao en Sint Maarten. Niet terugzetten
// naar "NAf." — dat geld bestaat niet meer.
const CUR_SYM: Record<string, string> = { BQ: "$", AW: "Afl. ", CW: "Cg ", SX: "Cg ", GB: "£" };
const curFor = (code?: string | null) => CUR_SYM[code || ""] || "€";

// Tijdzone per land, zelfde soort tabel als DUTCH_COUNTRIES en CUR_SYM hierboven.
// appointments.date/.time staan zónder offset in de database: dat is de lokale
// klok van de salon. Zonder deze tabel leest Deno die stempel als UTC en zit een
// Nederlandse salon er in de zomer 2 uur naast en Bonaire 4 uur de andere kant op.
// De ABC/BES-eilanden delen America/Curacao — allemaal UTC-4 en géén zomertijd,
// dus dat is voor Aruba en Bonaire exact goed. Onbekend land = Europe/Amsterdam,
// de thuismarkt, net als bij langFor() waar onbekend "nl" oplevert.
const TZ_BY_COUNTRY: Record<string, string> = {
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  GB: "Europe/London",
  AW: "America/Curacao",
  CW: "America/Curacao",
  BQ: "America/Curacao",
  SX: "America/Curacao",
};
const tzFor = (code?: string | null) => TZ_BY_COUNTRY[code || ""] || "Europe/Amsterdam";

// Offset van een tijdzone op een concreet moment, in ms. Bewust via Intl en niet
// via een vaste tabel met uren: Amsterdam is +1 in de winter en +2 in de zomer,
// en die grens ligt elk jaar ergens anders. Intl kent die regels wél.
function tzOffsetMs(at: Date, tz: string) {
  try {
    const p: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at)) p[part.type] = part.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - at.getTime();
  } catch { return 0; } // onbekende zone: liever de oude UTC-aanname dan crashen
}

// "2026-08-13" + "09:30" op de klok van de salon → het echte UTC-moment. We lezen
// de stempel eerst als UTC en trekken er de offset van dát moment vanaf. Alleen
// binnen het uur van een zomertijdovergang kan dat er een uur naast zitten; dat
// is verwaarloosbaar naast de dagelijkse korrel van deze cron.
function localToUtc(dateStr: string, timeStr: string, tz: string) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  if (isNaN(naive.getTime())) return null;
  return new Date(naive.getTime() - tzOffsetMs(naive, tz));
}

// Vandaag volgens de klok van de salon (YYYY-MM-DD). Gaat mee in de payload naar
// send-emails, dat daarmee bepaalt of de mail "vandaag", "morgen" of de datum
// zelf moet zeggen. en-CA levert precies het ISO-formaat.
function localDateStr(at: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(at);
  } catch { return at.toISOString().split("T")[0]; }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// De echte kloktijden waarop deze functie draait, in UTC-minuten na middernacht.
// Sinds v16 draait de pg_cron send-daily-reminders ELK UUR ('0 * * * *'),
// punctueel op :00:0x — vandaar de uurlijst [0, 60, …, 1380]. Het element 540
// (09:00) is daarmee vanzelf terug: de Vercel-cron (vercel.json →
// /api/send-reminders) bestaat namelijk nog steeds en Vercel garandeert alleen
// het uur, niet de minuut — in cron_health staat die run tussen 09:07 en 09:47
// UTC, dus TUSSEN de geplande runs van 09:00 en 10:00 in. Die Vercel-run hoeft
// hier niet apart in de lijst: voor de planning is hij gewoon "een run van
// 09:00 die iets te laat is". nextRun() kijkt vanuit dat moment vooruit naar
// 10:00, dus hij beslist over precies dezelfde afspraken als een punctuele
// 09:xx-run. Dubbel versturen kan niet — de query pakt alleen
// reminder_sent=false en de vlag gaat direct na een geslaagde verzending om,
// dus wat de Vercel-run verstuurt ziet de 10:00-run niet meer (en andersom).
// En er valt ook niets tussen wal en schip: alles wat de Vercel-run
// doorschuift, voldoet aan next.by < start en wordt dus gegarandeerd nog vóór
// de starttijd door de punctuele run van 10:00 opgepakt.
const RUN_TIMES_UTC_MIN = Array.from({ length: 24 }, (_, h) => h * 60);

// Marge waarna de eerstvolgende geplande run er gegarandeerd geweest is. De
// uurlijkse pg_cron is punctueel (elke keer :00:0x), dus "eerstvolgende run +
// 10 minuten" is een veilige harde grens. v15 had hiervoor nog een vast
// 10:10-tijdstip nodig, omdat de enige andere run (Vercel 09:00) tot 09:47 kon
// uitlopen en dus niet als vangnet mocht dienen; met een punctuele run per uur
// is dat onderscheid vervallen.
const RUN_BACKSTOP_MARGIN_MS = 10 * 60 * 1000;

// Hoogste instelbare reminder_hours (48) + ruime marge. Het grootste gat
// tussen twee runs is met de uurlijst nog maar één uur, dus dit MAG krapper —
// maar de query filtert op de LOKALE datumkolom van de salon en die kan tot
// een dag afwijken van onze UTC-klok. Een volle dag slack is goedkoop (het
// scheelt hooguit wat opgehaalde rijen die verderop toch afvallen) en bewezen
// correct, dus die laten we staan.
const REMINDER_MAX_LOOKAHEAD_MS = 48 * 60 * 60 * 1000 + DAY_MS;

// De eerstvolgende geplande run ná `now`, met twee tijdstempels die allebei
// nodig zijn om een afspraak te mogen doorschuiven:
//   at — wanneer die run er volgens de planning is. Hiermee beantwoorden we
//        "komt er nog een run vóór het gewenste moment?" — zo ja, dan ligt die
//        run dichter bij het moment dan deze en is doorschuiven beter.
//   by — wanneer die run er hoe dan ook geweest is: `at` plus
//        RUN_BACKSTOP_MARGIN_MS, want de uurlijkse pg_cron is punctueel. Dit is
//        de harde grens. Doorschuiven mag alleen als zelfs dát moment nog vóór
//        de afspraak ligt; anders zou de klant nooit meer iets horen. Bij
//        reminder_hours ≥ 1 en een uurlijst is die grens in de praktijk altijd
//        gehaald (het gewenste moment ligt minstens een uur vóór de afspraak en
//        de marge is maar 10 minuten), maar hij blijft staan als vangnet voor
//        als de lijst ooit weer grover wordt.
// Een run die op dit moment zelf bezig is telt niet mee (`at <= nu`), anders
// zou een punctuele run werk voor zichzelf parkeren en nooit iets versturen.
// De Vercel-run (09:07-09:47) staat bewust NIET in de lijst: vanuit dat moment
// gezien is de eerstvolgende geplande run gewoon die van 10:00, precies wat we
// willen (zie de toelichting bij RUN_TIMES_UTC_MIN).
function nextRun(now: Date) {
  const t = now.getTime();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let day = 0; day <= 1; day++) {
    for (const min of RUN_TIMES_UTC_MIN) {
      const at = midnight + day * DAY_MS + min * 60000;
      if (at <= t) continue;
      return { at, by: at + RUN_BACKSTOP_MARGIN_MS };
    }
  }
  // Onbereikbaar (het eerste uur van morgen ligt altijd in de toekomst), maar
  // TypeScript wil een uitweg — val terug op "over een etmaal".
  return { at: t + DAY_MS, by: t + DAY_MS };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_HEADERS = {
  "Content-Type": "application/json",
  "x-internal-secret": SUPABASE_SERVICE_KEY!,
};

async function recordHealth(status: string, ms: number, processed: number, err: unknown) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "send-reminders",
      status,
      duration_ms: ms,
      items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch { /* don't let monitoring errors fail the job */ }
}

function esc(s: unknown) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(dateStr: string, lang: string) {
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (lang === "en") {
      const dy = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const mo = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return `${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]}`;
    }
    const dy = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
    const mo = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    return `${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]}`;
  } catch { return dateStr; }
}

// De digest ("Je afspraken voor morgen") vertrekt alléén in runs waarvan het
// UTC-uur 9 of 10 is. Dat is exact het venster waarin hij vóór v16 al verstuurd
// werd (Vercel ±09:07-09:47 + pg_cron 10:00), dus voor de eigenaar verandert er
// niets aan het tijdstip. Zonder deze grens zou de uurlijkse cron de digest in
// de run van 00:00 UTC versturen — midden in de nacht voor Europa én 20:00 de
// avond ervoor op de Cariben, en dat wil niemand in zijn inbox.
const DIGEST_UTC_HOURS = new Set([9, 10]);

// Hartslag-rij voor de digest in cron_health — sinds v16 puur TELEMETRIE, niet
// langer de dedupe. De dedupe zelf leeft nu per eigenaar in salon_digest_log
// (zie de digest-lus in serve): de oude ene-rij-per-dag-aanpak was
// alles-of-niets, waardoor een salon wiens eerste afspraak-van-morgen pas ná de
// eerste digest-run geboekt werd, die dag geen agenda-mail meer kreeg. We
// schrijven deze rij nog wél bij ≥1 verstuurde digest, zodat in cron_health
// zichtbaar blijft wanneer er digests uitgingen; de naam staat niet in de
// MONITORED-lijst van cron-watchdog, dus een dag zonder digests geeft geen
// vals alarm.
const DIGEST_JOB_NAME = "send-reminders-digest";

// Telemetrie-rij wegschrijven, alleen bij minstens één verstuurde digest: een
// ronde zonder digests (niets in de agenda's van morgen) hoeft geen rij.
async function recordDigestSent(count: number) {
  if (count <= 0) return;
  try {
    await supabase.from("cron_health").insert({
      job_name: DIGEST_JOB_NAME,
      status: "success",
      items_processed: count,
    });
  } catch { /* monitoring mag de job nooit laten vallen */ }
}

// Eén regel uit het dagoverzicht van morgen, inclusief de gejoinde salon.
type DigestRow = {
  owner_id: string;
  time: string;
  client_name: string;
  service_name: string;
  staff_name?: string | null;
  profiles?: Record<string, string | null> | null;
};

// Salon-facing digest: tomorrow's agenda in one email. Sent directly via
// Resend (it's Vellu → salon, not salon → client, so no send-emails template).
// `reminded` = kregen de klanten van deze salon in déze run een herinnering? Zo
// niet (reminder_hours=0, of ze gingen al eerder de deur uit bij 48 uur), dan
// laten we de slotzin weg in plaats van iets te beloven wat niet gebeurd is.
async function sendOwnerDigest(owner: {
  email: string; salon_name: string; lang: string; date: string; reminded: boolean;
  appts: { time: string; client_name: string; service_name: string; staff_name?: string | null }[];
}) {
  if (!RESEND_API_KEY || !owner.email || owner.appts.length === 0) return false;
  const nl = owner.lang !== "en";
  const dateLabel = fmtDate(owner.date, owner.lang);
  const rows = owner.appts
    .slice()
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
    .map((a) => `<tr>
      <td style="padding:8px 12px 8px 0;font-weight:600;white-space:nowrap;vertical-align:top;">${esc((a.time || "").slice(0, 5))}</td>
      <td style="padding:8px 0;vertical-align:top;">
        <div style="font-weight:500;">${esc(a.client_name)}</div>
        <div style="color:#888;font-size:12px;">${esc(a.service_name)}${a.staff_name ? " · " + esc(a.staff_name) : ""}</div>
      </td>
    </tr>`).join("");
  const html = `<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
    <div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:#c9a96e;margin:12px auto;"></div></div>
    <h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${nl ? "Je afspraken voor morgen" : "Your appointments for tomorrow"}</h2>
    <p style="color:#666;margin-bottom:24px;">${nl
      ? `${dateLabel} — ${owner.appts.length} ${owner.appts.length === 1 ? "afspraak" : "afspraken"} bij <strong>${esc(owner.salon_name)}</strong>.`
      : `${dateLabel} — ${owner.appts.length} appointment${owner.appts.length === 1 ? "" : "s"} at <strong>${esc(owner.salon_name)}</strong>.`}</p>
    <div style="background:#f9f7f4;border-radius:12px;padding:16px 24px;margin-bottom:28px;"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
    ${owner.reminded ? `<p style="color:#888;font-size:12px;text-align:center;">${nl ? "Alle klanten hebben zojuist automatisch een herinnering ontvangen." : "All clients have just received an automatic reminder."}</p>` : ""}
  </div>`;
  const text = owner.appts.map((a) => `${(a.time || "").slice(0, 5)} — ${a.client_name} — ${a.service_name}${a.staff_name ? " (" + a.staff_name + ")" : ""}`).join("\n");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Vellu <noreply@vellu.cc>",
        to: owner.email,
        subject: nl
          ? `Morgen: ${owner.appts.length} ${owner.appts.length === 1 ? "afspraak" : "afspraken"} (${dateLabel})`
          : `Tomorrow: ${owner.appts.length} appointment${owner.appts.length === 1 ? "" : "s"} (${dateLabel})`,
        html,
        text,
      }),
    });
    return r.ok;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const now = new Date();
    // "Morgen" voor de digest mag in UTC: de digest gaat alleen uit in runs in
    // het DIGEST_UTC_HOURS-venster (09/10 UTC) en op die uren staat elke
    // salontijd die we bedienen (UTC-4 t/m UTC+2) op dezelfde kalenderdag als
    // wij. Alleen de starttijd van een afspraak moet per salon omgerekend
    // worden — daar gaat het om uren, niet om dagen.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Kandidaten zijn niet langer alleen "morgen": met reminder_hours=48 komt een
    // afspraak van overmorgen vandaag al aan de beurt, en met reminder_hours=1 een
    // afspraak van vandaag. We halen dus alles op van vandaag t/m de horizon en
    // beslissen per afspraak — op datum filteren houdt de query wél smal. De
    // ondergrens ligt een dag terug omdat appointments.date de LOKALE datum van de
    // salon is: die kan een dag achterlopen op onze UTC-klok. Rijen die echt voorbij
    // zijn vallen verderop af op de starttijd, dus dat kost alleen wat extra rijen.
    const todayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const horizonStr = new Date(now.getTime() + REMINDER_MAX_LOOKAHEAD_MS).toISOString().split("T")[0];

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("*, profiles!owner_id(business_name, slug, accent_color, logo_url, email, salon_email, country_code, reminder_hours)")
      .gte("date", todayStr)
      .lte("date", horizonStr)
      .eq("status", "confirmed")
      .eq("reminder_sent", false)
      .is("cancelled_at", null);

    if (error) throw error;

    let sentCount = 0;
    // Afspraken die we overslaan omdat de salon "geen herinnering" heeft gekozen —
    // puur voor de logging/health, zodat zichtbaar is dát er bewust niets ging.
    let skippedOff = 0;
    // Eén keer bepalen, niet per afspraak: de planning hangt alleen van `now` af.
    const next = nextRun(now);
    // Owners whose clients we newly reminded in THIS run → digest candidates.
    const remindedOwners = new Set<string>();
    for (const apt of appointments || []) {
      const p = apt.profiles || {};

      // "Geen herinnering" (0) is een echte keuze van de eigenaar, geen lege
      // waarde: die salon hoort niets te versturen. Null behandelen we hetzelfde —
      // liever zwijgen dan een klant mailen namens een salon die er niet om vroeg.
      const reminderHours = Number(p.reminder_hours);
      if (!Number.isFinite(reminderHours) || reminderHours <= 0) { skippedOff++; continue; }

      // De afspraaktijd staat zonder tijdzone in de database: dat is de klok van
      // de salon, niet UTC. Sinds het venster ook afspraken van VANDAAG oppakt
      // (reminder_hours 1, 2, 4 of 12) telt dat verschil echt mee. Nederland,
      // 's zomers UTC+2: een afspraak van 11:00 begint in werkelijkheid om 09:00
      // UTC, maar de oude code las "11:00" als UTC en dacht dus dat hij nog moest
      // komen — de klant kreeg om 10:00 UTC nog een herinnering terwijl hij al in
      // de stoel zat. Op Bonaire (UTC-4) kantelt dezelfde fout de andere kant op:
      // daar leek 08:00 lokaal al voorbij en bleef de herinnering juist uit.
      const tz = tzFor(p.country_code);
      const start = localToUtc(apt.date, String(apt.time || "").slice(0, 5), tz);
      if (!start) continue;
      // Al begonnen of voorbij: een herinnering heeft geen zin meer.
      if (start.getTime() <= now.getTime()) continue;

      // Het gewenste moment: precies reminder_hours vóór de afspraak. Dat moment
      // valt vrijwel nooit samen met een run, dus we kiezen de run die er het
      // dichtst vóór ligt. Doorschuiven naar een latere run mag alleen als aan
      // twee voorwaarden is voldaan:
      //   next.at <= dueAt — die run komt nog vóór het gewenste moment en ligt
      //     er dus dichterbij dan deze run. De oude regel keek naar "nu + 24 uur"
      //     en verstuurde daarmee in de EERSTE run die eraan voldeed. Met twee
      //     runs per dag betekende dat: alles wat de run van morgenochtend nog
      //     prima op tijd kon doen, ging vandaag al de deur uit. Bij
      //     reminder_hours=24 kwam de herinnering zo tot 47 uur van tevoren, en
      //     daarna nooit meer omdat reminder_sent al op true stond.
      //   next.by < start — zelfs als die volgende run te laat komt of overslaat,
      //     staat vast dat het vangnet (pg_cron 10:00) nog vóór de afspraak
      //     draait. Zonder deze voorwaarde kan een afspraak tussen twee runs door
      //     vallen: de volgende run ziet hem dan als "al begonnen" en er gaat
      //     helemaal niets uit. Dat is de reden dat een afspraak die kort na de
      //     run van 10:00 begint zijn herinnering al een dag eerder krijgt.
      // Omdat reminderHours > 0 geldt altijd dueAt < start, dus de eerste
      // voorwaarde kan nooit tot een mail ná de starttijd leiden.
      const dueAt = start.getTime() - reminderHours * 60 * 60 * 1000;
      if (next.at <= dueAt && next.by < start.getTime()) continue;

      // Prefer the client's chosen booking language (stored on the appointment);
      // fall back to the salon's country language for older/legacy rows.
      const lang = ["nl", "en", "es"].includes(apt.lang) ? apt.lang : langFor(p.country_code);
      const booking = {
        client_name: apt.client_name,
        client_email: apt.client_email,
        service_name: apt.service_name,
        date: apt.date,
        time: apt.time,
        price: apt.service_price,
        salon_name: p.business_name || "de salon",
        salon_slug: p.slug || "",
        salon_accent: p.accent_color || "",
        salon_logo: p.logo_url || "",
        // Reply-To: client replies land at the salon, not our noreply.
        salon_email: p.salon_email || p.email || "",
        // Currency symbol so a Bonaire client's reminder shows $ not € (send-emails defaults to €).
        currency: curFor(p.country_code),
        // Vandaag volgens de klok van de salon. send-emails vergelijkt dit met
        // date en schrijft "vandaag", "morgen" of de datum zelf — die mail zei
        // altijd "morgen", terwijl reminder_hours 1 t/m 12 over vandaag gaat en
        // 48 over overmorgen. Salontijd en niet UTC, anders staat er rond
        // middernacht in Nederland alsnog de verkeerde dag.
        today: localDateStr(now, tz),
        owner_id: apt.owner_id,
        lang,
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-emails`, {
        method: "POST",
        headers: INTERNAL_HEADERS,
        body: JSON.stringify({ type: "appointment_reminder", booking }),
      });
      if (res.ok) {
        // Dubbele herinneringen zijn uitgesloten doordat de vlag meteen na een
        // geslaagde verzending gezet wordt en de query hierboven alleen
        // reminder_sent=false pakt: elke latere run — de uurlijkse pg_cron én
        // de Vercel-run die er om ±09:07-09:47 tussendoor valt — ziet deze
        // afspraak niet meer, ook al valt hij door het brede venster op
        // meerdere momenten binnen bereik.
        await supabase.from("appointments").update({ reminder_sent: true }).eq("id", apt.id);
        sentCount++;
        if (apt.owner_id) remindedOwners.add(apt.owner_id);
        // SMS reminder — send-sms no-ops for non-Professional salons or
        // missing phone, so it's safe to fire for every reminder.
        if (apt.client_phone) {
          fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
            method: "POST",
            headers: INTERNAL_HEADERS,
            body: JSON.stringify({ type: "appointment_reminder", booking: { ...booking, client_phone: apt.client_phone } }),
          }).catch((e) => console.error("reminder SMS failed:", apt.id, e));
        }
      } else {
        console.error("reminder email failed:", apt.id, await res.text().catch(() => ""));
      }
    }

    // Salon digests — het VOLLEDIGE dagoverzicht van morgen, per eigenaar één
    // mail. Bewust helemaal los van de reminder-lus hierboven: die lus slaat
    // salons met reminder_hours=0 over, en zolang de digest-lijst dáár gevuld
    // werd raakte zo'n salon ook zijn eigen agenda-mail kwijt. "Geen
    // herinnering" gaat over de mail aan de KLANT; de eigenaar wil zijn dag nog
    // steeds weten. Eén query voor alle salons tegelijk, daarna groeperen —
    // scheelt een query per eigenaar. Ook al-gemailde afspraken horen erbij:
    // het is een agenda, geen verzendlijst.
    //
    // Dedupe per EIGENAAR via salon_digest_log (pk owner_id + sent_on): elke
    // run in het venster probeert per eigenaar een rij te claimen; alleen een
    // geslaagde insert geeft het recht de mail te sturen. Zo krijgt een salon
    // wiens eerste afspraak-van-morgen pas tussen twee runs in geboekt wordt,
    // zijn digest alsnog in de volgende run — het oude ene-vlag-per-dag-model
    // sloot die salon de rest van de dag buiten.
    let digests = 0;
    const inDigestWindow = DIGEST_UTC_HOURS.has(now.getUTCHours());
    if (inDigestWindow) {
      // Sleutel is de UTC-dag, consequent met tomorrowStr hierboven: binnen
      // het 9/10-venster valt elke salontijd die we bedienen (UTC-4 t/m UTC+2)
      // toch op dezelfde kalenderdag als UTC.
      const todayUtcStr = now.toISOString().split("T")[0];
      const { data: dayAppts } = await supabase
        .from("appointments")
        .select("owner_id, time, client_name, service_name, staff_name, profiles!owner_id(business_name, email, salon_email, country_code)")
        .eq("date", tomorrowStr)
        .eq("status", "confirmed")
        .is("cancelled_at", null);

      const byOwner = new Map<string, DigestRow[]>();
      for (const a of (dayAppts || []) as DigestRow[]) {
        if (!a.owner_id) continue;
        const list = byOwner.get(a.owner_id) || [];
        list.push(a);
        byOwner.set(a.owner_id, list);
      }
      for (const [ownerId, appts] of byOwner) {
        // Claim eerst de rij; ignoreDuplicates + select() gedraagt zich als
        // "insert … on conflict do nothing returning": bestond de rij al
        // (eerdere run vandaag), dan komt er een lege lijst terug en zwijgen
        // we. Bij een query-fout sturen we NIET — zonder claim kan elke
        // volgende uurrun in het venster dezelfde mail nogmaals sturen.
        const { data: claim, error: claimErr } = await supabase
          .from("salon_digest_log")
          .upsert(
            { owner_id: ownerId, sent_on: todayUtcStr },
            { onConflict: "owner_id,sent_on", ignoreDuplicates: true },
          )
          .select("owner_id");
        if (claimErr) { console.error("digest claim failed:", ownerId, claimErr.message); continue; }
        if (!claim || claim.length === 0) continue; // vandaag al gedaan

        const p = appts[0].profiles || {};
        const ok = await sendOwnerDigest({
          email: p.salon_email || p.email || "",
          salon_name: p.business_name || "je salon",
          lang: langFor(p.country_code),
          date: tomorrowStr,
          reminded: remindedOwners.has(ownerId),
          appts,
        });
        if (ok) digests++;
        else {
          // Mail mislukt: geef de claim terug, anders is dit voor deze salon
          // de laatste poging van vandaag en komt de agenda nooit meer aan.
          await supabase
            .from("salon_digest_log")
            .delete()
            .eq("owner_id", ownerId)
            .eq("sent_on", todayUtcStr);
        }
      }
      await recordDigestSent(digests);
    }

    await recordHealth("success", Date.now() - t0, sentCount, null);
    return new Response(
      JSON.stringify({
        success: true,
        reminders_sent: sentCount,
        reminders_off: skippedOff,
        owner_digests: digests,
        // Zichtbaar in de logs waaróm er nul digests waren: buiten het
        // 09/10-UTC-venster proberen we het niet eens; binnen het venster
        // betekent nul "niets te melden of alle eigenaren al geclaimd vandaag".
        digest_window: inDigestWindow,
        date: tomorrowStr,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    await recordHealth("error", Date.now() - t0, 0, (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
