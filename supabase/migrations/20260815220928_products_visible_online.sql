-- 2026-08-15 — Product: online zichtbaarheid los van "actief"
--
-- Eén active-vlag bestuurde zowel de boekingspagina als de eigen kassa: wie een
-- product tijdelijk niet online wilde aanbieden, kon het ook niet meer aan de
-- balie verkopen. visible_online=false = niet op de boekingspagina en niet te
-- bestellen, maar gewoon in de kassa/scanner. Default true = huidig gedrag.
alter table public.products
  add column if not exists visible_online boolean not null default true;
