-- Tabelrechten van anon (niet ingelogd) en van authenticated op clients
-- intrekken waar alleen RLS ze tegenhield (audit 05-10-2026, zwakke plek 10,
-- 12-11-2026).
--
-- Supabase geeft anon standaard alle rechten op elke tabel in public; alleen de
-- RLS-policies hielden een bezoeker tegen. Eén te ruime policy later (een
-- "using (true)" die voor ingelogde gebruikers bedoeld was) en een bezoeker kon
-- weer schrijven of lezen. Nagelopen op 12-11-2026:
--  - anon schrijft nergens rechtstreeks: boeken, annuleren, wachtlijst en
--    reviews lopen via edge functions (service role) of SECURITY DEFINER-RPC's,
--    en geen enkele policy laat anon schrijven;
--  - anon leest alleen de catalogus (services, varianten, extra's, foto's,
--    categorieën, teamkoppelingen en -prijzen, locaties) en de public_*-views.
--    Die views draaien als eigenaar, dus hun basistabellen hebben geen
--    anon-recht nodig;
--  - op de 19 tabellen hieronder zag anon al nul rijen (geen policy die voor
--    hem opgaat). Het leesrecht intrekken verandert dus niets aan wat een
--    bezoeker ziet; een losse vraag geeft nu "permission denied" in plaats van
--    een lege lijst.
-- profiles en staff_members houden hun anon-leesrecht (ook daar nul rijen):
-- de app vraagt ze rond het inloggen op en een fout in plaats van een lege lijst
-- zou daar een ander pad kiezen.

-- 1. Geen enkel schrijfrecht meer voor anon in public (tabellen en views).
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', r.relname);
  end loop;
end $$;

-- 2. Leesrecht weg op tabellen die een bezoeker nooit hoort te zien.
revoke select on
  public.appointments, public.birthday_email_log, public.cancellation_tokens,
  public.cash_movements, public.client_no_shows, public.client_tokens,
  public.clients, public.cron_health, public.gift_vouchers, public.manual_clients,
  public.payment_events, public.payment_invoices, public.payments, public.products,
  public.public_chat_usage, public.reviews, public.staff_day_overrides,
  public.subscriptions, public.waitlist
from anon;

-- 3. clients: ingelogde gebruikers schrijven er nooit rechtstreeks in (alleen
-- book-appointment met de service role; er is ook geen schrijf-policy).
-- Lezen blijft (policy clients_select_visited_salon).
revoke insert, update, delete, truncate on public.clients from authenticated;

-- 4. Nieuwe tabellen in public krijgen voortaan geen schrijfrechten meer voor
-- anon (lezen wel, zoals Supabase standaard doet; een policy blijft nodig).
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;
