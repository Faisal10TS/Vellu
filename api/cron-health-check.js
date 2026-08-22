// api/cron-health-check.js — de waakhond voor de waakhond.
//
// WAAROM
// cron-watchdog (Supabase edge function, pg_cron 12:00 UTC) bewaakt alle
// dagelijkse jobs en mailt als er één stilvalt. Maar hij kan zichzelf niet
// bewaken: valt zijn eigen cron stil — zoals in 2026 vier maanden lang toen
// pg_net ontbrak en álle pg_cron-jobs stierven, inclusief de watchdog — dan
// merkt niemand iets. Deze functie draait op Vercel (andere infrastructuur,
// andere scheduler) en kijkt alleen of de watchdog zijn dagelijkse hartslag in
// cron_health heeft gezet.
//
// WAT HIJ DOET
//   1. Hartslag van job 'cron-watchdog' ouder dan 25 uur (of afwezig)?
//      → de watchdog direct via HTTP aantrappen. Die controleert dan alsnog
//        alle jobs en mailt de beheerder via zijn eigen Resend-sleutel. Dit
//        dekt precies het historische scenario: pg_cron/pg_net dood terwijl de
//        edge functions zelf prima werken.
//      → én eerst een rij met status 'error' voor deze job wegschrijven, zodat
//        de zojuist aangetrapte watchdog "vercel-cron-health-check: errored —
//        cron-watchdog schedule stale" in zijn mail opneemt. Zo hoort de
//        beheerder het óók als verder alles gezond blijkt (dan zou de watchdog
//        anders niets mailen terwijl zijn eigen rooster wél kapot is).
//   2. Altijd een eigen hartslag ('vercel-cron-health-check') schrijven.
//      cron-watchdog heeft die job in zijn MONITORED-lijst: de twee bewaken
//      elkaar, zonder derde partij en zonder extra geheimen.
//
// Valt Supabase in zijn geheel weg, dan faalt deze functie (500) — zichtbaar
// in de Vercel-logs. Staat RESEND_API_KEY als Vercel-env, dan mailt hij in dat
// geval ook zelf; zonder die variabele blijft dat het enige gat.
//
// Rooster: 11:30 UTC (vercel.json). Vercel Hobby garandeert alleen het uur,
// dus de echte run valt tussen 11:30 en ~12:29. Beide volgordes kloppen met de
// 25-uursgrens: vóór 12:00 ziet hij de watchdog-rij van gisteren (≤ 24,5 u),
// erna die van vandaag. En de watchdog (12:00) ziet deze hartslag van vandaag
// of van gisteren (≤ 24,5 u). Auth: zelfde CRON_SECRET-patroon als
// check-trials.js — Vercel stuurt de Bearer zelf mee bij cron-aanroepen.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JOB = 'vercel-cron-health-check';
const WATCHED = 'cron-watchdog';
const MAX_AGE_HOURS = 25;
const ADMIN = process.env.ADMIN_ALERT_EMAIL || 'mirahventures@vellu.cc';

async function mailDirect(subject, text) {
  // Alleen mogelijk als RESEND_API_KEY op Vercel staat; anders stil overslaan.
  if (!process.env.RESEND_API_KEY) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Vellu Monitoring <noreply@vellu.cc>', to: [ADMIN], subject, text }),
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const out = { ran_at: new Date().toISOString(), watchdog: null, action: 'none' };

  try {
    const { data, error } = await supabase
      .from('cron_health')
      .select('ran_at, status, items_processed')
      .eq('job_name', WATCHED)
      .order('ran_at', { ascending: false })
      .limit(1);
    if (error) throw error;

    const last = data?.[0];
    const ageHours = last ? (Date.now() - new Date(last.ran_at).getTime()) / 3_600_000 : Infinity;
    out.watchdog = last
      ? { last_run: last.ran_at, age_hours: Number(ageHours.toFixed(1)), issues_found_then: last.items_processed }
      : null;

    const stale = ageHours > MAX_AGE_HOURS;
    if (stale) {
      const detail = last
        ? `cron-watchdog heartbeat is ${ageHours.toFixed(1)}h old (limit ${MAX_AGE_HOURS}h) — its pg_cron schedule is not firing`
        : 'cron-watchdog has no heartbeat at all';
      // Eerst de foutrij, dan de watchdog aantrappen: zo staat de melding al
      // klaar op het moment dat de watchdog zijn MONITORED-lijst doorloopt.
      await supabase.from('cron_health').insert({ job_name: JOB, status: 'error', items_processed: 1, error_message: detail });
      const r = await fetch(`${SUPABASE_URL}/functions/v1/cron-watchdog`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      out.action = `${detail} → triggered cron-watchdog directly: HTTP ${r.status}`;
      if (!r.ok) throw new Error(out.action);
      await mailDirect('⚠️ Vellu: cron-watchdog schedule is stale', `${detail}.\nTriggered it directly from Vercel (HTTP ${r.status}). Check pg_cron (cron.job_run_details) and the pg_net extension.`);
      return res.status(200).json(out);
    }

    await supabase.from('cron_health').insert({ job_name: JOB, status: 'success', items_processed: 0 });
    return res.status(200).json(out);
  } catch (err) {
    console.error('cron-health-check:', err);
    await mailDirect('⚠️ Vellu: cron-health-check could not reach Supabase', String(err?.message || err)).catch(() => {});
    return res.status(500).json({ error: String(err?.message || err), ...out });
  }
}
