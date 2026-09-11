-- Herinneringen voor aflopende PROEFPERIODES (11-09-2026). Tot nu toe kreeg een
-- proefsalon geen enkel bericht: de dagelijkse herinnering bediende alleen
-- jaarabonnees. Brilliant Beauty en Honeysets liepen zo op 10-09 zonder
-- waarschuwing uit hun proef. send-renewal-reminder mailt nu ook 3 dagen vóór
-- het einde van de proef en op de dag dat hij afloopt (plus push + kopie aan
-- de beheerder). Dezelfde dedupe-tabel, met een soort erbij zodat de twee
-- proefmails naast de jaarherinnering kunnen bestaan.
alter table public.renewal_reminder_log
  add column if not exists kind text not null default 'renewal';
alter table public.renewal_reminder_log drop constraint if exists renewal_reminder_log_pkey;
alter table public.renewal_reminder_log
  add constraint renewal_reminder_log_pkey primary key (owner_id, plan_expires_at, kind);
comment on column public.renewal_reminder_log.kind is 'renewal (jaarabonnement) | trial_ending (3 dagen vooraf) | trial_expired (op de dag van aflopen)';
