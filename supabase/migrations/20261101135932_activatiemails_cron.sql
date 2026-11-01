-- Activatiemails dagelijks aan (Faisal 01-11-2026: "oke u can switch it on").
-- 14:00 UTC = 15:00 in NL (wintertijd), 10:00 op de eilanden. Zelfde opdracht
-- als send-renewal-reminder-daily (named arguments, x-cron-secret uit vault),
-- alleen de functienaam verwisseld; zie de 401-lessen in cron_pipeline.
select cron.schedule(
  'send-activation-nudges-daily',
  '0 14 * * *',
  replace(
    (select command from cron.job where jobname = 'send-renewal-reminder-daily'),
    'send-renewal-reminder', 'send-activation-nudges'
  )
);
