-- 2026-08-14 — Annuleringstermijn per salon (verzoek van salon Rioghna)
--
-- Er bestond GEEN enkele grens: de annuleerlink uit de bevestigingsmail werkte
-- tot een minuut voor de afspraak. Salons met een 48-uursbeleid (Rioghna) konden
-- dat beleid alleen in hun vrije-teksttekst zetten, waar niets het afdwong.
--
-- 0 = altijd annuleerbaar; dat is het huidige gedrag, dus bestaande salons
-- merken niets tot ze zelf een termijn kiezen. De afdwinging zit in de
-- edge-functie cancel-appointment (het enige klant-pad); de eigenaar zelf
-- houdt in de app altijd alle rechten, ook binnen de termijn.
alter table public.profiles
  add column if not exists cancel_deadline_hours integer not null default 0;
