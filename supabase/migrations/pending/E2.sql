-- E2: cron_health kent naast 'success' en 'error' ook 'degraded' (audit E2-09).
--
-- De cron-functies (send-reminders, send-followups, send-rebook-nudge,
-- send-birthday-emails) schreven altijd 'success', ook als elke mail mislukte:
-- precies de stille storing van de zomer, en cron-watchdog zag niets. Nu
-- schrijven ze 'error' als ALLE verzendpogingen mislukten en 'degraded' als een
-- deel mislukte. De bestaande check liet alleen 'success' en 'error' toe; een
-- 'degraded'-rij zou stil geweigerd worden (de functies vangen de fout af) en de
-- watchdog zou de job dan als "stale" melden. cron-watchdog meldt 'degraded'
-- als gedeeltelijke fout.
--
-- Volgorde bij uitrol: deze migratie vóór de nieuwe versies van de functies.

alter table public.cron_health drop constraint if exists cron_health_status_check;
alter table public.cron_health
  add constraint cron_health_status_check
  check (status = any (array['success'::text, 'error'::text, 'degraded'::text]));
