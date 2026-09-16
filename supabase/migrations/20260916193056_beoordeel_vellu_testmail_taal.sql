-- Beoordeel Vellu (16-09-2026): een testmail is één mail in één taal (Faisal:
-- "why does it send 2"). Standaard Nederlands, want alle huidige salons
-- krijgen de Nederlandse versie; Engels apart op te vragen.
alter table public.app_rating_send_jobs
  add column test_lang text not null default 'nl' check (test_lang in ('nl', 'en'));
comment on column public.app_rating_send_jobs.test_lang is 'Taal van de testmail (mode test): nl of en, één mail per opdracht.';
