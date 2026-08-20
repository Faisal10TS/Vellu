-- 2026-08-19 — Eigen logo op de factuur en de rapporten, aan of uit
--
-- WAAROM
-- De PDF-rapporten (src/revenueReport.js, src/productReport.js) tekenden rechts-
-- boven altijd het woordmerk "vellu", ongeacht of de salon een eigen logo had.
-- Een salon op Bonaire vroeg terecht: dit is mijn omzetrapport, waarom staat
-- daar niet mijn logo? De factuurMAIL toont het eigen logo overigens al.
--
-- Niet iedereen wil zijn logo op een fiscaal document, dus dit wordt een keuze,
-- geen vaste vervanging. Default AAN: wie een logo heeft geüpload, wil het
-- vermoedelijk ook zien; wie er geen heeft, ziet gewoon zijn bedrijfsnaam en
-- merkt niets van deze vlag.

alter table public.profiles
  add column if not exists show_logo_on_invoice boolean not null default true;
