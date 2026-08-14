// supabase/functions/send-birthday-emails/index.ts
//
// Runs once a day and sends a birthday wish + discount code to every client
// whose birthday (month + day) matches "today", scoped per salon.
//
// Gates:
//   1. Salon has profiles.birthday_email_enabled = true.
//   2. Client has clients.birthday OR manual_clients.birthday set and today's
//      month + day match. Year is ignored so a 2005-06-30 birthday triggers
//      every year on June 30.
//   3. We haven't already logged a send for (owner, client_email, today) —
//      the birthday_email_log UNIQUE constraint enforces this even if the
//      cron overlaps itself.
//
// Discount code format:
//   {prefix or "BDAY"}-{pct}-{5 willekeurige tekens}, bijv. BDAY-15-K7QM4.
//   Prefix komt uit profiles.birthday_email_code_prefix. De staart is bewust
//   willekeurig en niet uit het e-mailadres afgeleid — zie makeCode.
//
// De code werd alleen in birthday_email_log gezet en nergens anders. Boeken met
// die code liep daardoor gegarandeerd stuk: book-appointment accepteert alleen
// codes die het als geldig herkent en gaf "invalid_discount".
//
// WAAR DE CODE NU STAAT — en waarom niet meer in profiles.discount_codes:
// De vorige ronde schreef hem in profiles.discount_codes met active = true. Dat
// ging op drie manieren mis:
//   1. de view public_salons levert álle actieve codes uit aan anonieme
//      bezoekers, dus de code was door iedereen inwisselbaar én lekte de eerste
//      zes tekens van het e-mailadres van een klant;
//   2. twee klanten met dezelfde eerste zes tekens vóór de @ kregen exact
//      dezelfde code, en botste hij met een code van de eigenaar dan bleef die
//      van de eigenaar staan terwijl de klant de mail al had;
//   3. de eigenaar overschrijft die kolom in één keer vanuit de state van zijn
//      instellingenpagina (src/OwnerApp.jsx: `discount_codes: salonData.
//      discount_codes || []`), dus wie 's ochtends die pagina openhad en daarna
//      iets opsloeg, wiste alle verjaardagscodes van die dag.
// Daarom leeft elke code nu als eigen rij in birthday_discount_codes: één
// schrijver (deze functie), een UNIQUE (owner_id, code) die botsingen echt
// tegenhoudt, client_email als NOT NULL-kolom zodat book-appointment de code aan
// één persoon kan binden, en buiten bereik van zowel de publieke view als de
// overschrijvende opslag van de eigenaar.
//
// Auth: cron secret via x-cron-secret header (Vercel cron), or internal
// service-role secret for manual invocation.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const FROM_ADDRESS = "noreply@vellu.cc";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

// Zelfde eenregelige taalkiezer als txt() in send-emails: nl is de terugval,
// zodat een onbekende of lege taal nooit een halve mail oplevert.
function txt(lang: string, nl: string, en: string, es: string) {
  return lang === "en" ? en : lang === "es" ? es : nl;
}

// Taal per ontvanger. clients en manual_clients hebben geen lang-kolom
// (gecheckt in information_schema op 2026-08-13), dus er valt per klant niets
// te kiezen: het salon-land bepaalt de taal, zoals bij de owner-mails in
// send-reminders/send-followups. NL/BE/AW/CW/BQ is de vaste DUTCH_COUNTRIES-
// lijst; SX (Sint Maarten, ook Nederlands-Caribisch) doet hier mee. Krijgt de
// klant ooit een eigen taalveld, dan hoort dat hier vóór het salon-land te gaan.
const DUTCH_COUNTRIES = new Set(["NL", "BE", "AW", "CW", "BQ", "SX"]);
function langFor(countryCode: unknown): string {
  return DUTCH_COUNTRIES.has(String(countryCode || "NL").toUpperCase()) ? "nl" : "en";
}

// Geen Math.random(): hier hangt een korting aan, dus dezelfde crypto-bron als
// de annuleertokens in book-appointment.
const SUFFIX_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // zonder I/O/0/1
function randomSuffix(len = 3): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join("");
}

// De code was eerst afgeleid van het e-mailadres (BDAY-ESTHER-15). Dat leest
// prettig, maar het is te raden: wie het adres van een klant kent, kan de code
// uitrekenen en via validate_birthday_discount bevestigd krijgen dat die persoon
// deze maand een verjaardagskorting bij deze salon heeft. Het geld lag niet open
// — book-appointment bindt de code aan één adres en weigert de rest met
// discount_not_yours — maar het lekte wel wie er klant is, en dat is precies wat
// een boekingspagina niet hoort te vertellen. Daarom nu een willekeurige staart.
//
// Het percentage blijft leesbaar in de code staan (BDAY-15-K7QM4): dat is geen
// geheim, het staat groot in dezelfde mail, en het maakt de code herkenbaar voor
// de eigenaar als een klant hem aan de telefoon voorleest. 32^5 = ruim 33
// miljoen mogelijkheden per salon per percentage, dus raden is geen route meer.
function makeCode(prefix: string, pct: number): string {
  const p = (prefix || "BDAY").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "BDAY";
  return `${p}-${pct}-${randomSuffix(5)}`;
}

// De opbouw (logo, accentkleur, code-blok) is vast; alleen de teksten wisselen
// per taal, in dezelfde nl/en/es-drieslag als de mails in send-emails.
function renderHtml({ salonName, logo, accent, firstName, code, pct, slug, lang }: {
  salonName: string;
  logo: string | null;
  accent: string;
  firstName: string;
  code: string;
  pct: number;
  slug: string;
  lang: string;
}) {
  const header = logo
    ? `<div style="text-align:center;margin-bottom:28px;"><img src="${esc(logo)}" alt="${esc(salonName)}" style="max-height:56px;max-width:200px;" /></div>`
    : `<div style="text-align:center;margin-bottom:28px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;color:#1a1a1a;">${esc(salonName)}</h1></div>`;
  const link = slug ? `https://vellu.cc/${esc(slug)}` : "";
  const heading = firstName
    ? txt(lang, `Gefeliciteerd, ${firstName}!`, `Happy birthday, ${firstName}!`, `¡Feliz cumpleaños, ${firstName}!`)
    : txt(lang, "Gefeliciteerd!", "Happy birthday!", "¡Feliz cumpleaños!");
  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#1a1a1a;background:#ffffff;">
    ${header}
    <div style="width:40px;height:1px;background:${esc(accent)};margin:0 auto 28px;"></div>
    <h1 style="font-size:26px;font-weight:600;margin:0 0 14px;text-align:center;color:#1a1a1a;">🎉 ${esc(heading)}</h1>
    <p style="font-size:15px;line-height:1.7;color:#333;margin:0 0 24px;text-align:center;">
      ${txt(lang,
        `Van iedereen bij <strong>${esc(salonName)}</strong> — een fijne verjaardag toegewenst. Als kadootje ${pct}% korting op je volgende afspraak.`,
        `From everyone at <strong>${esc(salonName)}</strong> — wishing you a wonderful birthday. As a little gift, enjoy ${pct}% off your next appointment.`,
        `De parte de todos en <strong>${esc(salonName)}</strong> — te deseamos un feliz cumpleaños. Como regalo, ${pct}% de descuento en tu próxima cita.`)}
    </p>
    <div style="background:#f9f7f4;border-radius:14px;padding:22px;text-align:center;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#999;margin-bottom:6px;">${txt(lang, "Jouw code", "Your code", "Tu código")}</div>
      <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:${esc(accent)};">${esc(code)}</div>
      <div style="font-size:12px;color:#666;margin-top:8px;">${txt(lang, `${pct}% korting · geldig deze maand`, `${pct}% off · valid this month`, `${pct}% de descuento · válido este mes`)}</div>
    </div>
    ${link ? `<div style="text-align:center;margin-bottom:24px;"><a href="${link}" style="display:inline-block;background:${esc(accent)};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-size:13px;font-weight:600;letter-spacing:0.06em;">${txt(lang, "Boek nu", "Book now", "Reservar ahora")}</a></div>` : ""}
    <p style="font-size:12px;color:#999;text-align:center;line-height:1.5;margin:0;">
      🎂 ${txt(lang, "Nog een fijne dag, van ons allemaal!", "Have a lovely day, from all of us!", "¡Que tengas un día precioso, de parte de todos!")}
    </p>
  </div>`;
}

// Laatste dag van de maand waarin de mail de deur uit ging. De mail zegt letterlijk
// "geldig deze maand", dus dat is de vervaldatum die we vastleggen.
function endOfMonth(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return last.toISOString().slice(0, 10);
}

// Legt de code vast VOORDAT de mail de deur uit gaat, en geeft terug wat er
// daadwerkelijk in de database staat — de mail verstuurt exact die string. Dat is
// de enige volgorde waarin een botsing niet stilletjes de verkeerde korting kan
// opleveren: schreven we pas achteraf weg, dan had de klant al een mail met een
// code die van iemand anders bleek te zijn.
//
// Botsingen worden op twee niveaus afgevangen:
//   - `taken` bevat de codes die de eigenaar zelf in profiles.discount_codes heeft
//     staan. book-appointment kijkt daar eerst; een verjaardagscode met dezelfde
//     naam zou dus nooit gelezen worden en de klant zou de korting van de eigenaar
//     (of een uitgezette code) krijgen. Die naam slaan we meteen over.
//   - UNIQUE (owner_id, code) in de database vangt de rest, inclusief twee runs
//     die elkaar overlappen. Op 23505 proberen we opnieuw met een andere staart.
// Dezelfde klant die opnieuw jarig is (of een tweede keer in dezelfde maand in de
// lijst belandt) krijgt haar bestaande code terug met een verlengde geldigheid —
// een tweede rij zou een tweede code betekenen voor één verjaardag.
async function reserveCode(
  ownerId: string,
  email: string,
  prefix: string,
  pct: number,
  expiresOn: string,
  taken: Set<string>,
): Promise<{ code: string; created: boolean } | null> {
  // Heeft deze klant bij deze salon al een lopende code? Dan die hergebruiken en
  // de geldigheid oprekken tot het eind van deze maand. limit(1) in plaats van
  // maybeSingle(): een afgebroken run uit het verleden kan meer dan één rij
  // hebben achtergelaten en daar mag de mail van vandaag niet op stuklopen.
  const { data: mine } = await supabase
    .from("birthday_discount_codes")
    .select("id, code, discount_pct")
    .eq("owner_id", ownerId)
    .eq("client_email", email)
    .order("expires_on", { ascending: false })
    .limit(1);
  const existing = (mine || [])[0];
  // Alleen hergebruiken als de bestaande code bij het HUIDIGE percentage hoort.
  // Heeft de eigenaar zijn percentage inmiddels gewijzigd, dan zou de mail "20%
  // korting" zeggen boven een code die op 15 staat. Dan liever een nieuwe code.
  // We toetsen op de kolom discount_pct en niet meer op de code-tekst: sinds de
  // code willekeurig is, valt het percentage er niet meer betrouwbaar uit te
  // lezen (een oude code van vóór deze wijziging heeft een ander formaat).
  const reusable = existing != null && Number(existing.discount_pct) === Number(pct);
  if (existing?.code && reusable) {
    const { error: extErr } = await supabase.from("birthday_discount_codes")
      .update({ discount_pct: pct, expires_on: expiresOn }).eq("id", existing.id);
    if (!extErr) return { code: String(existing.code), created: false };
    console.error("Extend existing birthday code failed:", extErr);
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    // Elke poging is een verse trekking. `taken` bevat de codes die de eigenaar
    // zelf al gebruikt, zodat een verjaardagscode nooit een bestaande code van de
    // salon kaapt.
    const code = makeCode(prefix, pct);
    if (taken.has(code)) continue;
    const { error } = await supabase.from("birthday_discount_codes").insert({
      owner_id: ownerId,
      code,
      client_email: email,
      discount_pct: pct,
      expires_on: expiresOn,
    });
    if (!error) { taken.add(code); return { code, created: true }; }
    if (error.code !== "23505") { console.error("Reserve code failed:", error); return null; }
    // 23505 = de naam was al bezet (andere klant, of een parallelle run).
    taken.add(code);
  }
  console.error(`Kon geen unieke verjaardagscode maken voor ${email} (salon ${ownerId})`);
  return null;
}

// Mail niet aangekomen? Dan hoort de code ook niet inwisselbaar te zijn. Alleen
// rijen die we in deze run zelf hebben aangemaakt worden teruggedraaid — een
// hergebruikte bestaande code van dezelfde klant blijft staan.
async function releaseCode(ownerId: string, code: string) {
  const { error } = await supabase
    .from("birthday_discount_codes").delete().eq("owner_id", ownerId).eq("code", code);
  if (error) console.error("Release code failed:", error);
}

// Opruimen in een APARTE pas over álle salons, buiten de opt-in-filters om.
// Waarom los: het opruimen hing vast aan dezelfde query die salons filtert op
// birthday_email_enabled + een ingevuld kortingspercentage + een actief
// abonnement. Zette een salon de verjaardagsmail uit, of liep zijn abonnement af,
// dan kwam hij nooit meer door die filters en bleven zijn oude codes voor altijd
// actief staan — precies de salons waar niemand nog meekijkt.
async function purgeExpiredCodes(today: string) {
  let removed = 0;

  // 1. De eigen tabel: één delete over alle eigenaren heen, geen filter op wie
  //    dan ook. expires_on is de dag waarop de code nog geldig is (de mail zegt
  //    "geldig deze maand"), dus pas weg vanaf de dag erna.
  const { data: gone, error: delErr } = await supabase
    .from("birthday_discount_codes").delete().lt("expires_on", today).select("id");
  if (delErr) console.error("Purge birthday_discount_codes failed:", delErr);
  else removed += (gone || []).length;

  // 2. Restanten in profiles.discount_codes van vóór de eigen tabel. De migratie
  //    haalt ze eenmalig weg; deze pas is het vangnet als er ergens nog een oude
  //    versie van deze functie draait. Codes van de eigenaar zelf hebben geen
  //    source-veld en blijven dus gegarandeerd staan.
  //    Let op: .contains() moet hier een JSON-STRING krijgen. Geef je een array
  //    mee, dan maakt postgrest-js er `cs.{...}` van (de vorm voor Postgres-
  //    arrays) en matcht een jsonb-kolom nooit.
  const { data: legacy, error: legErr } = await supabase
    .from("profiles").select("id, discount_codes")
    .contains("discount_codes", JSON.stringify([{ source: "birthday" }]));
  if (legErr) { console.error("Load legacy birthday codes failed:", legErr); return removed; }

  for (const p of legacy || []) {
    const current: any[] = Array.isArray(p.discount_codes) ? p.discount_codes : [];
    const kept = current.filter((c: any) =>
      c?.source !== "birthday" || String(c?.expires_at || "") >= today);
    if (kept.length === current.length) continue;
    const { error: upErr } = await supabase
      .from("profiles").update({ discount_codes: kept }).eq("id", p.id);
    if (upErr) console.error("Purge legacy birthday codes failed:", upErr);
    else removed += current.length - kept.length;
  }

  return removed;
}

async function sendEmail(to: string, subject: string, html: string, salonName: string, replyTo?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${salonName} <${FROM_ADDRESS}>`,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${txt}`);
  }
  return res.json().catch(() => ({}));
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }
  if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "email_not_configured" }), { status: 500 });

  // Auth: cron secret (Vercel) OR internal service-role secret.
  const cronHeader = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  const isInternal = cronHeader && cronHeader === SUPABASE_SERVICE_KEY;
  if (!isCron && !isInternal) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const sentOn = today.toISOString().slice(0, 10);

  // Eerst opruimen, dan pas versturen — en bewust vóór (en buiten) de gefilterde
  // salon-query hieronder, zodat ook salons die de verjaardagsmail hebben
  // uitgezet of geen lopend abonnement meer hebben van hun verlopen codes af
  // komen. Zie purgeExpiredCodes.
  const totalPurged = await purgeExpiredCodes(sentOn);

  // Only salons that have opted in and have a discount % configured.
  // discount_codes komt mee om naambotsingen met de eigen codes van de eigenaar
  // te vermijden (zie reserveCode) — we schrijven die kolom niet meer.
  const { data: salons, error: salonErr } = await supabase
    .from("profiles")
    .select("id, business_name, email, salon_email, accent_color, logo_url, slug, birthday_email_discount_pct, birthday_email_code_prefix, subscription_status, discount_codes, country_code")
    .eq("birthday_email_enabled", true)
    .not("birthday_email_discount_pct", "is", null);
  if (salonErr) {
    console.error("Load salons failed:", salonErr);
    return new Response(JSON.stringify({ error: "db_error" }), { status: 500 });
  }

  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalCodes = 0;

  for (const salon of salons || []) {
    // Skip inactive subscriptions so a cancelled account doesn't keep spending
    // our email quota / Twilio credits (once we wire that in).
    if (salon.subscription_status && !["active", "trialing"].includes(String(salon.subscription_status))) {
      continue;
    }
    const pct = salon.birthday_email_discount_pct as number;
    const prefix = String(salon.birthday_email_code_prefix || "BDAY");
    const salonName = String(salon.business_name || "Vellu");
    const accent = /^#[0-9a-fA-F]{6}$/.test(String(salon.accent_color || "")) ? String(salon.accent_color) : "#c9a96e";
    const logo = safeImg(salon.logo_url);
    const replyTo = String(salon.salon_email || salon.email || "") || undefined;
    const slug = String(salon.slug || "");
    // Zie langFor: zonder taalkolom op de klant geldt het salon-land voor
    // iedere jarige van deze salon.
    const lang = langFor(salon.country_code);

    // Collect all birthday-matching client contacts this salon has ever seen.
    // Manual clients live under manual_clients; appointment-derived contacts
    // live indirectly via the clients table joined by email in appointments.
    // We just take the union and dedupe by email.

    // Manual clients: filter server-side using extract() to keep the payload small.
    const { data: manuals } = await supabase
      .from("manual_clients")
      .select("email, name, birthday")
      .eq("owner_id", salon.id)
      .eq("hidden", false)
      .not("email", "is", null)
      .not("birthday", "is", null);

    // Appointment-derived: appointments hold a client_email + client_name and
    // a client_id linking to public.clients where we now store birthday too.
    const { data: apptRows } = await supabase
      .from("appointments")
      .select("client_email, client_name, clients(first_name, last_name, birthday)")
      .eq("owner_id", salon.id)
      .not("client_email", "is", null);

    type Contact = { email: string; name: string; birthday: string };
    const byEmail: Record<string, Contact> = {};
    const takeIfBdayToday = (email: string, name: string, birthday: string | null | undefined) => {
      if (!email || !birthday) return;
      const em = email.trim().toLowerCase();
      if (!em) return;
      const bstr = String(birthday);
      if (bstr.length < 10) return;
      const bmm = bstr.slice(5, 7);
      const bdd = bstr.slice(8, 10);
      if (bmm !== mm || bdd !== dd) return;
      if (!byEmail[em]) byEmail[em] = { email: em, name: name || "", birthday: bstr };
    };
    for (const m of manuals || []) takeIfBdayToday(String(m.email), String(m.name || ""), m.birthday as string);
    for (const a of apptRows || []) {
      const cliRow = a as { client_email: string; client_name?: string; clients?: { first_name?: string; last_name?: string; birthday?: string } };
      const email = String(cliRow.client_email || "");
      const client = cliRow.clients;
      const fullName = cliRow.client_name || [client?.first_name, client?.last_name].filter(Boolean).join(" ");
      takeIfBdayToday(email, fullName, client?.birthday);
    }

    const targets = Object.values(byEmail);
    // Geen jarige klanten vandaag: niets te doen. Het opruimen van verlopen codes
    // gebeurt niet meer hier maar in purgeExpiredCodes, buiten deze lus om.
    if (targets.length === 0) continue;

    // Filter out any (owner, email, today) rows already logged so a re-run
    // doesn't double-send.
    const emails = targets.map(t => t.email);
    const { data: alreadyLogged } = await supabase
      .from("birthday_email_log")
      .select("client_email")
      .eq("owner_id", salon.id)
      .eq("sent_on", sentOn)
      .in("client_email", emails);
    const doneSet = new Set((alreadyLogged || []).map(r => String(r.client_email).toLowerCase()));

    // Namen die de eigenaar zelf al gebruikt. book-appointment kijkt eerst in
    // deze lijst, dus een verjaardagscode met dezelfde naam zou nooit als
    // verjaardagscode gelezen worden. Eén keer per salon opbouwen.
    const ownerCodeNames = new Set(
      (Array.isArray(salon.discount_codes) ? salon.discount_codes : [])
        .map((c: any) => String(c?.code || "").toUpperCase())
        .filter(Boolean),
    );
    const expiresOn = endOfMonth(sentOn);

    for (const t of targets) {
      if (doneSet.has(t.email)) { totalSkipped++; continue; }
      const firstName = String(t.name || "").split(/\s+/)[0] || "";
      // Eerst de code vastleggen, dan pas mailen: de mail moet exact de string
      // bevatten die in de database staat. Andersom kon de klant een code in
      // handen krijgen die uiteindelijk van iemand anders bleek te zijn.
      const reserved = await reserveCode(salon.id, t.email, prefix, pct, expiresOn, ownerCodeNames);
      if (!reserved) { totalErrors++; continue; }
      const code = reserved.code;
      const html = renderHtml({ salonName, logo, accent, firstName, code, pct, slug, lang });
      const subject = txt(lang,
        `🎉 Gefeliciteerd van ${salonName}`,
        `🎉 Happy birthday from ${salonName}`,
        `🎉 Feliz cumpleaños de parte de ${salonName}`);
      try {
        await sendEmail(t.email, subject, html, salonName, replyTo);
        // Insert log row — the UNIQUE constraint guarantees we only ever
        // record one send per (owner, email, day).
        const { error: logErr } = await supabase.from("birthday_email_log").insert({
          owner_id: salon.id,
          client_email: t.email,
          sent_on: sentOn,
          discount_code: code,
        });
        if (logErr && logErr.code !== "23505") {
          // Any error other than a duplicate key is worth surfacing but
          // shouldn't stop the loop.
          console.error("Log insert failed:", logErr);
        }
        totalCodes++;
        totalSent++;
      } catch (e) {
        console.error(`Birthday email failed for ${t.email}:`, e);
        // De mail is niet aangekomen, dus de code hoort niet inwisselbaar te
        // blijven. Alleen terugdraaien wat we hier zelf hebben aangemaakt.
        if (reserved.created) await releaseCode(salon.id, code);
        totalErrors++;
      }
    }
  }

  return new Response(JSON.stringify({
    success: true,
    sent: totalSent,
    skipped_already_sent: totalSkipped,
    codes_activated: totalCodes,
    codes_purged: totalPurged,
    errors: totalErrors,
    date: sentOn,
  }), { headers: { "Content-Type": "application/json" } });
});
