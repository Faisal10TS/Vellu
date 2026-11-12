-- prepay-watch alleen nog met het cron-geheim (12-11-2026). Tot nu toe stuurde
-- de uurlijkse job alleen de anon-sleutel mee en draaide de functie voor elk
-- verzoek. Zelfde opdracht als send-renewal-reminder-daily (named arguments,
-- x-cron-secret uit de vault), alleen de functienaam verwisseld; zelfde
-- patroon als 20261101135932_activatiemails_cron. cron.schedule met een
-- bestaande jobnaam werkt die job bij (schema blijft :25 elk uur).
-- Volgorde: eerst deze migratie, dan de functie die het geheim eist.
select cron.schedule(
  'prepay-watch-hourly',
  '25 * * * *',
  replace(
    (select command from cron.job where jobname = 'send-renewal-reminder-daily'),
    'send-renewal-reminder', 'prepay-watch'
  )
);
