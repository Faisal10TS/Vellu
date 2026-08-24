-- 2026-08-24 — Dienst tijdelijk verbergen zonder hem te verwijderen
--
-- WAAROM
-- Een salon op Bonaire wilde massage "on hold" zetten: ze biedt het nog niet
-- aan, maar wil de dienst (prijs, duur, vertalingen) niet kwijt. Vellu kende
-- daar geen knop voor, dus de enige uitweg was de dienst VERWIJDEREN en later
-- opnieuw intypen. Dat is verlies van gegevens voor iets tijdelijks — en het
-- speelt vaker: seizoenspauze, verlof, een behandeling uitfaseren terwijl de
-- historie (afspraken, omzet) moet blijven kloppen.
--
-- Producten hebben dit al: products.visible_online. Diensten krijgen nu
-- dezelfde vlag, met dezelfde betekenis: de eigenaar houdt de dienst volledig
-- in eigen beheer (agenda, handmatige afspraken, rapporten, historie), maar
-- klanten zien hem niet meer op de boekingspagina en kunnen hem niet boeken.
--
-- Default TRUE: alle bestaande diensten blijven gewoon zichtbaar, niemand merkt
-- iets van deze migratie tot hij zelf het oogje uitzet.
--
-- NB: dit is een WEERGAVE-vlag, geen beveiliging. De publieke SELECT-policy op
-- services blijft `true` (prijzen zijn niet geheim en medewerkers lezen de
-- catalogus via diezelfde policy). Het filter zit in de query's van de publieke
-- pagina's én — dat is de harde grens — in book-appointment, dat een verborgen
-- dienst weigert ook als iemand het service_id rechtstreeks POST.

alter table public.services
  add column if not exists visible boolean not null default true;

comment on column public.services.visible is
  'Zichtbaar op de publieke boekingspagina. false = tijdelijk verborgen (on hold): blijft in de agenda, rapporten en historie van de eigenaar, maar is niet zichtbaar en niet boekbaar voor klanten. Afgedwongen in book-appointment.';
