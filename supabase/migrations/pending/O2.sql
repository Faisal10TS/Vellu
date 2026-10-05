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
