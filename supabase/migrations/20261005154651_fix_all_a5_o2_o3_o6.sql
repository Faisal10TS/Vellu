-- Fix-all audit 05-10-2026: O2.sql + O3.sql + O6.sql.
-- Samengesteld uit supabase/migrations/pending/*.sql (zie de commitgeschiedenis).
set local lock_timeout = '10s';

-- O2 (klantenlijst, finding O2-08): een verborgen klant komt vanzelf terug.
--
-- "Klant verwijderen" bij een klant met afspraken verbergt haar alleen
-- (manual_clients.hidden = true). Niets zette dat ooit terug: boekte ze later
-- opnieuw, of had ze een open post, dan bleef ze onvindbaar in Klanten.
-- Deze trigger zet hidden terug op false zodra er voor dat e-mailadres een
-- nieuwe afspraak (of Kassa-verkoop) in DEZE salon binnenkomt, ongeacht via
-- welk pad: boekingspagina (book-appointment, service role), "+ Afspraak" van
-- de eigenaar of een afspraak die een medewerker invoert. De klantenlijst
-- (OwnerApp CustomersView) heeft daarnaast "Verborgen klanten" met een knop
-- om haar handmatig terug te zetten.
--
-- SECURITY DEFINER: een medewerker mag manual_clients niet bijwerken (RLS),
-- maar haar afspraak moet de klant wel terugzetten. De functie raakt alleen
-- rijen van new.owner_id met precies dit adres (lower/btrim, zoals de
-- stempelkaart-trigger) en alleen de kolom hidden.
-- Afspraken zonder e-mailadres (client_email = '') doen niets: verborgen
-- klanten zonder adres zet de eigenaar terug via "Verborgen klanten".

create or replace function public.tg_appointments_unhide_client()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := lower(btrim(coalesce(new.client_email, '')));
begin
  if v_email = '' then
    return new;
  end if;
  update public.manual_clients m
     set hidden = false
   where m.owner_id = new.owner_id
     and m.hidden
     and lower(btrim(coalesce(m.email, ''))) = v_email;
  return new;
end;
$$;

revoke all on function public.tg_appointments_unhide_client() from public, anon, authenticated;

drop trigger if exists appointments_unhide_client on public.appointments;
create trigger appointments_unhide_client
  after insert on public.appointments
  for each row execute function public.tg_appointments_unhide_client();


-- O3 (OwnerApp state/handlers), audit 05-10-2026.
--
-- Bevroren belasting op AFSPRAKEN mag niet achterlopen op het bedrag.
--
-- Sinds deze ronde legt OwnerApp.markComplete bij het afronden van een
-- afspraak de belastingberekening vast in appointments.tax_snapshot (RP-05),
-- net als de kassa al deed voor verkopen. Rapporten, bonnen en de factuurmail
-- lezen die bevroren berekening (taxForSale) zodra hij er is.
--
-- Maar een afgeronde afspraak kan daarna nog van bedrag veranderen buiten
-- OwnerApp.saveEditAppt om (dat pad schrijft zelf een nieuwe snapshot mee):
-- producten aanslaan op een afgeronde afspraak (OwnerApp addProductsToAppt)
-- en "Prijs aanpassen" in de medewerkers-app (StaffApp savePrice). Dan zou de
-- factuur de oude regels en belasting tonen. Deze trigger maakt de snapshot
-- leeg zodra service_price of products écht verandert zonder dat dezelfde
-- update een nieuwe snapshot meegeeft; taxForSale rekent dan weer met de
-- instellingen van vandaag, precies het gedrag van vóór de snapshot.
--
-- Kassaverkopen (is_sale) blijven buiten schot: hun snapshot is een
-- uitgereikte bon en wordt nooit stil gewist.
-- Vandaag hebben 0 afspraken (niet-verkopen) een snapshot; niets verandert
-- aan bestaande rijen.

create or replace function public.tg_appointments_drop_stale_tax_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tax_snapshot := null;
  return new;
end;
$$;

revoke all on function public.tg_appointments_drop_stale_tax_snapshot() from public, anon, authenticated;

drop trigger if exists appointments_drop_stale_tax_snapshot on public.appointments;
create trigger appointments_drop_stale_tax_snapshot
  before update of service_price, products on public.appointments
  for each row
  when (
    new.tax_snapshot is not null
    and not coalesce(new.is_sale, false)
    and old.tax_snapshot is not distinct from new.tax_snapshot
    and (old.service_price is distinct from new.service_price
         or old.products is distinct from new.products)
  )
  execute function public.tg_appointments_drop_stale_tax_snapshot();


-- O6 (O6-01): elk factuurprofiel van een salon heeft een EIGEN voorvoegsel.
--
-- Een nieuw extra factuurprofiel kreeg "INV" mee, hetzelfde voorvoegsel als het
-- hoofdprofiel, en een eigen teller vanaf 1. De eerste factuur onder dat
-- profiel kreeg dan INV-0001, een nummer dat een andere klant al had. De app
-- geeft een nieuw profiel nu een eigen voorvoegsel en toont een melding bij een
-- dubbel voorvoegsel; deze trigger laat de database een opslag weigeren die er
-- een dubbel voorvoegsel BIJ maakt.
--
-- Regels (gelijk aan de app): leeg voorvoegsel telt als 'INV' (zo nummert
-- sendInvoiceWith), hoofdletterongevoelig, spaties eromheen tellen niet.
-- Alleen een wijziging die een voorvoegsel vaker laat voorkomen dan vóór de
-- wijziging wordt geweigerd. Een teller ophogen (next_invoice_number in
-- invoice_profiles), een profiel verwijderen of een bestaande situatie laten
-- staan gaat dus altijd door, ook bij een salon die al een dubbel had.
-- Live (05-10) heeft alleen TTNB extra profielen, met eigen voorvoegsels
-- (TT-E / TT-L): er bestaat geen dubbel.

create or replace function public.invoice_prefixes_of(p_main text, p_extras jsonb)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[upper(coalesce(nullif(btrim(p_main), ''), 'INV'))]
    || coalesce((
      select array_agg(upper(coalesce(nullif(btrim(x->>'invoice_prefix'), ''), 'INV')) order by o)
        from jsonb_array_elements(case when jsonb_typeof(p_extras) = 'array' then p_extras else '[]'::jsonb end)
             with ordinality as t(x, o)
    ), '{}'::text[]);
$$;

create or replace function public.profiles_invoice_prefix_unique()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_new text[] := public.invoice_prefixes_of(new.invoice_prefix, new.invoice_profiles);
  v_old text[] := case when tg_op = 'UPDATE'
                       then public.invoice_prefixes_of(old.invoice_prefix, old.invoice_profiles)
                       else '{}'::text[] end;
  v_dup text;
begin
  select n.p into v_dup
    from (select p, count(*) as c from unnest(v_new) as u(p) group by p) n
   where n.c > 1
     and n.c > (select count(*) from unnest(v_old) as o(p) where o.p = n.p)
   limit 1;
  if v_dup is not null then
    raise exception 'duplicate_invoice_prefix: %', v_dup
      using hint = 'Every invoice profile of a salon needs its own invoice prefix.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_invoice_prefix_unique on public.profiles;
create trigger profiles_invoice_prefix_unique
  before insert or update of invoice_prefix, invoice_profiles on public.profiles
  for each row execute function public.profiles_invoice_prefix_unique();

-- De trigger draait als de aanroeper (eigenaar via PostgREST, of een
-- SECURITY DEFINER-functie); die moet de hulpfunctie kunnen uitvoeren. Anon
-- schrijft nooit in profiles en hoeft hem niet.
revoke all on function public.invoice_prefixes_of(text, jsonb) from public, anon;
grant execute on function public.invoice_prefixes_of(text, jsonb) to authenticated, service_role;
revoke all on function public.profiles_invoice_prefix_unique() from public, anon, authenticated;
