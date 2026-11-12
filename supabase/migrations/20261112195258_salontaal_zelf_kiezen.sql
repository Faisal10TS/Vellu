-- Taal van de salon, door de salon zelf gekozen (12-11-2026). Tot nu toe volgde
-- de taal waarin Vellu de eigenaar mailt (nieuwe boeking, annulering, proef,
-- betaling) en de standaardtaal voor afspraken die de salon zelf invoert uit het
-- land: NL/BE/AW/CW/BQ/SX werd Nederlands. Daardoor kregen de salons op Curaçao
-- Nederlandse mails terwijl ze in het Engels werken.
--
-- Nu kiest de salon zelf: bij het aanmelden (het taalveld in het formulier) en
-- in Instellingen. Leeg = de oude landregel, zodat bestaande salons niets merken.
-- De app (salonLangOf in shared.jsx) en de edge functions lezen deze kolom eerst.
alter table public.profiles add column if not exists salon_lang text;

alter table public.profiles drop constraint if exists profiles_salon_lang_check;
alter table public.profiles add constraint profiles_salon_lang_check
  check (salon_lang is null or salon_lang in ('nl', 'en', 'es'));

comment on column public.profiles.salon_lang is
  'Taal van de salon (nl/en/es), zelf gekozen bij het aanmelden of in Instellingen. Leeg = afgeleid van country_code.';

-- De bestaande salons op Curaçao werken in het Engels.
update public.profiles set salon_lang = 'en' where country_code = 'CW' and salon_lang is null;
