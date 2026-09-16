-- Wachtlijst: inschrijvingen voor een dag die voorbij is verdwijnen vanzelf
-- (Faisal 16-09-2026). De app toont alleen nog rijen met date >= vandaag;
-- deze cron-job (dagelijks 03:15 UTC) verwijdert de verlopen rijen echt.
-- Eenmalig nu ook de bestaande verlopen rijen opruimen.
delete from public.waitlist where date < current_date;
select cron.unschedule('waitlist-expire-daily') where exists (select 1 from cron.job where jobname = 'waitlist-expire-daily');
select cron.schedule('waitlist-expire-daily', '15 3 * * *', $$delete from public.waitlist where date < current_date$$);
