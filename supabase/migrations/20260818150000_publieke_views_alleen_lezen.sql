-- 2026-08-18 — KRITIEK: anon kon via de publieke views in profiles, staff_members
-- en reviews SCHRIJVEN. RLS werd daarbij volledig omzeild.
--
-- HOE HET KON:
--   1. public_salons, public_staff en public_reviews zijn gewone views over
--      precies één basistabel zonder aggregatie. Postgres maakt zulke views
--      automatisch schrijfbaar (pg_relation_is_updatable = true).
--   2. Supabase geeft nieuwe objecten in het public-schema standaard ALLE
--      rechten aan anon en authenticated. Bij een TABEL is dat ongevaarlijk,
--      want RLS houdt de deur dicht. Bij een VIEW niet: een view zonder
--      security_invoker draait met de rechten van de eigenaar, en die is
--      niet aan RLS gebonden.
--   3. Netto: elke bezoeker met de anon-sleutel — die per definitie in de
--      frontend-bundel staat — kon door de view heen de onderliggende tabel
--      herschrijven.
--
-- BEWEZEN op productie vóór deze migratie, met een filter die met opzet nul
-- rijen raakte zodat er niets veranderde:
--   PATCH /rest/v1/public_salons?id=eq.0000…  {"business_name":"…"} → HTTP 200
--   PATCH /rest/v1/public_staff?id=eq.0000…   {"name":"…"}          → HTTP 200
--   DELETE /rest/v1/public_reviews?id=eq.0000…                      → HTTP 200
-- Geen 401 of 403: de schrijfactie werd geaccepteerd en uitgevoerd. Met een
-- bestaand id — en die ids deelt public_salons zelf publiek uit — lag alles
-- open: business_hours, discount_codes, slug, booking_policy, en het ergste
-- subscription_status (een salon kon zichzelf op 'active' zetten, of een
-- ander op 'cancelled'). Alle reviews wissen kon met één DELETE.
--
-- WAAROM ZO EN NIET ANDERS: security_invoker = true zou het gat ook dichten,
-- maar dan slaan de publieke salonpagina's dicht — profiles en staff_members
-- hebben bewust géén anon-SELECT-policy; dat de view als eigenaar draait is
-- precies de bedoeling en de reden dat deze constructie bestaat. Het probleem
-- is niet het lezen, het is dat er ooit schrijfrechten bij zijn gekomen.
-- Alleen die trekken we in.
--
-- BREEKT DIT IETS? Nee. De hele repo is nagelopen: deze drie views komen
-- uitsluitend voor met .select(...) — in src/App.jsx, src/LandingScreen.jsx en
-- src/OwnerApp.jsx. Er bestaat geen enkel insert/update/delete/upsert-pad.

revoke insert, update, delete, truncate, references, trigger
  on public.public_salons  from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.public_staff   from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.public_reviews from anon, authenticated;

-- Lezen blijft; dat is waar de views voor gemaakt zijn.
grant select on public.public_salons  to anon, authenticated;
grant select on public.public_staff   to anon, authenticated;
grant select on public.public_reviews to anon, authenticated;

-- LET OP BIJ EEN VOLGENDE VIEW: dit gat ontstaat vanzelf opnieuw. Elke nieuwe
-- view in public krijgt via de standaardrechten van Supabase weer INSERT,
-- UPDATE en DELETE voor anon. Sluit een nieuwe publieke view dus altijd af met
-- hetzelfde revoke-blok als hierboven. Controleren kan met:
--
--   select c.relname,
--          (select string_agg(distinct g.privilege_type, ',')
--             from information_schema.role_table_grants g
--            where g.table_name = c.relname
--              and g.grantee in ('anon','authenticated')
--              and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'v';
--
-- Alles in die tweede kolom hoort NULL te zijn.
