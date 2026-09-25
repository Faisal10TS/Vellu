-- Betaaltermijn bij vooruitbetalen instelbaar (Esther/TTNB via Faisal
-- 25-09-2026: "can I also change how many days they have to pay?"). Uren
-- vanaf het boeken; book-appointment houdt de bestaande grenzen aan (nooit
-- later dan 2 uur vóór de afspraak, nooit korter dan 2 uur vanaf nu).
-- 24 = het oude vaste gedrag; de vaste 48 uur bij een afspraak over meer dan
-- een week vervalt, de salon kiest nu zelf.
alter table public.profiles
  add column prepay_term_hours integer not null default 24
  check (prepay_term_hours between 1 and 336);
comment on column public.profiles.prepay_term_hours is 'Betaaltermijn bij vooruitbetalen, in uren vanaf het boeken (keuzes in de app: 12, 24, 48, 72, 168). Uiterlijk 2 uur vóór de afspraak.';
