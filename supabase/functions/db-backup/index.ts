// db-backup — draait dagelijks om 03:00. Schrijft elke tabel met gebruikersdata
// weg als één JSON-bestand in de privé-bucket `db-backups`, ruimt alles ouder
// dan 30 dagen op, en logt naar cron_health.
//
// 2026-08-18 — twee dingen rechtgezet:
//
// 1. De tabellenlijst stond hier hardgecodeerd (16 namen, laatst bijgewerkt in
//    april) en was niet meegegroeid met het schema. 17 van de 33 tabellen
//    vielen buiten de back-up, waaronder payment_invoices (de wettelijke
//    BTW-facturen), gift_vouchers (een betaalmiddel), manual_clients (135
//    klanten) en staff_day_overrides (88 roosteruitzonderingen). De lijst komt
//    nu uit de database zelf, via backup_table_list(), zodat een nieuwe tabel
//    automatisch meegaat. FALLBACK_TABLES blijft staan voor het geval die RPC
//    onverhoopt niet bestaat — dan is een onvolledige back-up nog altijd beter
//    dan geen, maar het loopt wel als fout in cron_health.
//
// 2. De functie meldde "success" ook als een tabel niet gelezen kon worden.
//    Dat is precies de storing die je wilt zien: een back-up die stilletjes
//    een tabel overslaat, ontdek je pas op het moment dat je hem nodig hebt.
//    Mislukt er nu ook maar één tabel, dan is de status "error" en staat in
//    cron_health welke tabellen het waren — waarmee cron-watchdog er de
//    volgende ochtend een mail over stuurt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Alleen een vangnet. De echte lijst komt uit backup_table_list().
const FALLBACK_TABLES = [
  "profiles", "locations", "service_categories", "services", "service_variants",
  "service_extras", "service_photos", "staff_members", "staff_services",
  "location_staff", "location_services", "clients", "appointments", "reviews",
  "subscriptions", "payments", "manual_clients", "staff_day_overrides",
  "payment_invoices", "payment_events", "products", "gift_vouchers",
  "client_no_shows", "app_admins", "waitlist", "birthday_discount_codes",
  "birthday_email_log", "salon_digest_log", "cancellation_tokens",
  "client_tokens", "review_tokens",
];

const BACKUP_BUCKET = "db-backups";
const RETENTION_DAYS = 30;

// Vaste volgorde per pagina (E2-18). Zonder ORDER BY garandeert Postgres geen
// gelijke volgorde tussen de losse .range()-vragen: een rij die tijdens de
// back-up wijzigt, kan dubbel of helemaal niet in het bestand belanden. We
// sorteren op de primaire sleutel; de meeste tabellen hebben "id", de
// uitzonderingen staan hier (nagekeken in pg_index op 05-10-2026).
// newsletter_opt_outs heeft geen id; token is daar uniek.
const ORDER_COLUMNS: Record<string, string[]> = {
  app_admins: ["user_id"],
  app_rating_invites: ["owner_id"],
  app_ratings: ["owner_id"],
  app_source_requests: ["owner_id"],
  client_no_shows: ["client_email", "owner_id"],
  location_services: ["location_id", "service_id"],
  location_staff: ["location_id", "staff_id"],
  newsletter_opt_outs: ["token"],
  referral_redemptions: ["new_profile_id"],
  renewal_reminder_log: ["owner_id", "plan_expires_at", "kind"],
  review_tokens: ["token"],
  salon_digest_log: ["owner_id", "sent_on"],
};
// Bovengrens per tabel. Een tabel die hem haalt is NIET volledig weggeschreven
// en telt als mislukt, in plaats van stil als "gelukt" (E2-18).
const MAX_ROWS_PER_TABLE = 100_000;

// Alleen de planner mag deze functie starten (audit E2-04, 05-10-2026). Tot dan
// schreef elke anonieme aanroep een volledige dump naar de bucket en kreeg hij
// de rijtellingen per tabel terug (aantal salons, betalingen, …). Toegestaan:
// x-internal-secret (service-role), x-cron-secret = CRON_SECRET-env, of een
// x-cron-secret dat de database bevestigt (cron_secret_ok, pg_cron uit de vault).
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
async function cronAuthorized(req) {
  const internal = req.headers.get("x-internal-secret") || "";
  if (internal && SUPABASE_SERVICE_KEY && internal === SUPABASE_SERVICE_KEY) return true;
  const cs = req.headers.get("x-cron-secret") || "";
  if (!cs) return false;
  if (CRON_SECRET && cs === CRON_SECRET) return true;
  try {
    const { data, error } = await supabase.rpc("cron_secret_ok", { p_secret: cs });
    return !error && data === true;
  } catch { return false; }
}

async function recordHealth(status, ms, processed, err) {
  try {
    await supabase.from("cron_health").insert({
      job_name: "db-backup",
      status, duration_ms: ms, items_processed: processed,
      error_message: err ? String(err).slice(0, 500) : null,
    });
  } catch {}
}

// De tabellen die weggeschreven moeten worden, uit de catalogus in plaats van
// uit een lijst die iemand moet bijhouden.
async function resolveTables() {
  const { data, error } = await supabase.rpc("backup_table_list");
  if (error || !Array.isArray(data) || data.length === 0) {
    return { tables: FALLBACK_TABLES, degraded: error?.message || "lege lijst" };
  }
  // De RPC geeft afhankelijk van de client een array strings of een array
  // objecten terug; beide vormen platslaan.
  const names = data.map(r => (typeof r === "string" ? r : r?.backup_table_list ?? r?.relname))
                    .filter(Boolean);
  if (names.length === 0) return { tables: FALLBACK_TABLES, degraded: "geen namen in resultaat" };
  return { tables: names, degraded: null };
}

// Hele datummappen ouder dan de bewaartermijn weggooien. De structuur is
// `YYYY-MM-DD/backup-*.json`, dus de mapnaam kan rechtstreeks met de
// afkapdatum vergeleken worden zonder created_at (dat is null voor mappen).
async function rotateOldBackups() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data: topLevel, error } = await supabase.storage.from(BACKUP_BUCKET).list("", { limit: 1000 });
  if (error || !topLevel) return 0;

  let deleted = 0;
  for (const entry of topLevel) {
    // Alleen datum-mappen. Een map heeft id === null, een bestand niet.
    if (entry.id !== null) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    if (entry.name >= cutoffStr) continue; // valt nog binnen de bewaartermijn

    const { data: inFolder } = await supabase.storage
      .from(BACKUP_BUCKET)
      .list(entry.name, { limit: 1000 });
    if (!inFolder || inFolder.length === 0) continue;
    const paths = inFolder.map(f => `${entry.name}/${f.name}`);
    const { error: rmErr } = await supabase.storage.from(BACKUP_BUCKET).remove(paths);
    if (!rmErr) deleted += paths.length;
  }
  return deleted;
}

serve(async (req) => {
  if (!(await cronAuthorized(req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const t0 = Date.now();
  try {
    const { tables: TABLES, degraded } = await resolveTables();

    const snapshot = {
      version: 2,
      created_at: new Date().toISOString(),
      table_source: degraded ? `fallback (${degraded})` : "backup_table_list()",
      tables: {},
      counts: {},
    };

    let totalRows = 0;
    const failed = [];

    for (const table of TABLES) {
      const rows = [];
      let from = 0;
      const pageSize = 1000;
      let ok = true;
      let complete = false;
      // Sorteren op de primaire sleutel (zie ORDER_COLUMNS). Bestaat de kolom
      // niet (een nieuwe tabel zonder "id" die hier nog niet in de lijst staat),
      // dan lezen we hem zonder volgorde — goed zolang hij in één pagina past;
      // past hij daar niet in, dan meldt de back-up dat als probleem.
      let orderCols = ORDER_COLUMNS[table] || ["id"];
      while (from < MAX_ROWS_PER_TABLE) {
        let q = supabase.from(table).select("*");
        for (const c of orderCols) q = q.order(c, { ascending: true });
        const { data, error } = await q.range(from, from + pageSize - 1);
        if (error && from === 0 && orderCols.length && /column .* does not exist|42703/i.test(`${error.code || ""} ${error.message || ""}`)) {
          orderCols = [];
          continue;
        }
        if (error) {
          snapshot.tables[table] = { error: error.message };
          snapshot.counts[table] = -1;
          failed.push(`${table}: ${error.message}`);
          ok = false;
          break;
        }
        rows.push(...(data || []));
        if (!data || data.length < pageSize) { complete = true; break; }
        from += pageSize;
      }
      if (ok && !complete) {
        // Bovengrens bereikt: het bestand bevat niet alle rijen.
        failed.push(`${table}: afgekapt op ${MAX_ROWS_PER_TABLE} rijen`);
      } else if (ok && orderCols.length === 0 && rows.length >= pageSize) {
        failed.push(`${table}: geen sorteerkolom bekend (voeg hem toe aan ORDER_COLUMNS), pagina's mogelijk onvolledig`);
      }
      if (ok) {
        snapshot.tables[table] = rows;
        snapshot.counts[table] = rows.length;
        totalRows += rows.length;
      }
    }

    const json = JSON.stringify(snapshot);
    const date = snapshot.created_at.slice(0, 10);
    const time = snapshot.created_at.slice(11, 19).replace(/:/g, "");
    const path = `${date}/backup-${date}T${time}.json`;

    const { error: upErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(path, new Blob([json], { type: "application/json" }), { upsert: true });
    if (upErr) {
      await recordHealth("error", Date.now() - t0, totalRows, `upload: ${upErr.message}`);
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500 });
    }

    const rotated = await rotateOldBackups();

    // Een onvolledige back-up is een storing, geen succes. Zo pikt
    // cron-watchdog hem op en krijg je er een mail over.
    const problems = [];
    if (degraded) problems.push(`tabellenlijst teruggevallen op de vaste lijst (${degraded})`);
    if (failed.length) problems.push(`${failed.length} tabel(len) mislukt: ${failed.join("; ")}`);

    await recordHealth(
      problems.length ? "error" : "success",
      Date.now() - t0,
      totalRows,
      problems.length ? problems.join(" | ") : null,
    );

    // Geen rijtellingen of details meer in het antwoord: die staan in het
    // back-upbestand zelf, in cron_health en in de functielog hieronder. Ook met
    // het cron-geheim hoeft het antwoord niets over de omvang van het bedrijf te
    // vertellen.
    console.log(`db-backup: ${path}, ${TABLES.length} tabellen, ${totalRows} rijen, ${rotated} oude bestanden opgeruimd${failed.length ? `, mislukt: ${failed.join("; ")}` : ""}`);
    return new Response(JSON.stringify({ ok: problems.length === 0 }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await recordHealth("error", Date.now() - t0, 0, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
