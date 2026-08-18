-- 2026-08-17 — No-show-teller telde alleen mee als de EIGENAAR klikte
--
-- WAAROM: het ophogen zat in de client. src/OwnerApp.jsx roept na de
-- statuswijziging record_no_show aan, maar src/StaffApp.jsx (regel ~286) zet
-- alleen status='no_show' en roept niets aan. En record_no_show wéigert een
-- medewerker sowieso ("forbidden": auth.uid() is niet p_owner_id). In salons
-- waar de medewerkers de agenda bijhouden — het normale geval — blijft
-- client_no_shows dus leeg, telt niemand op naar de drempel en blokkeert
-- book-appointment nooit iemand. De teller hoort bij de statuswissel zelf,
-- niet bij één van de twee apps die hem kan maken.

create or replace function public.tg_appointments_count_no_show()
returns trigger
language plpgsql
-- SECURITY DEFINER omdat de schrijver hier meestal een medewerker is:
-- client_no_shows staat achter RLS met owner_id = auth.uid(), en die vlieger
-- gaat voor staff niet op.
security definer
set search_path = public, pg_temp
as $$
declare
  -- Zelfde sleutel als record_no_show gebruikt (lower, zonder trim), anders
  -- ontstaat er een tweede rij naast de bestaande tellingen.
  v_email     text := lower(coalesce(new.client_email, ''));
  v_threshold integer;
  v_count     integer;
begin
  -- Walk-ins en kassaverkopen hebben geen e-mailadres; zonder adres is er
  -- geen klant om iets aan toe te rekenen.
  if v_email = '' then
    return new;
  end if;

  select coalesce(auto_block_no_show_threshold, 0)
    into v_threshold
    from public.profiles
   where id = new.owner_id;

  insert into public.client_no_shows (client_email, owner_id, no_show_count, last_no_show_at)
  values (v_email, new.owner_id, 1, now())
  on conflict (client_email, owner_id)
  do update set
    no_show_count   = client_no_shows.no_show_count + 1,
    last_no_show_at = now()
  returning client_no_shows.no_show_count into v_count;

  -- Drempel 0 = automatisch blokkeren staat uit; dan alleen tellen.
  if v_threshold > 0 and v_count >= v_threshold then
    update public.client_no_shows
       set blocked = true,
           blocked_at = coalesce(blocked_at, now())
     where client_email = v_email
       and owner_id = new.owner_id;
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_count_no_show on public.appointments;

create trigger appointments_count_no_show
  after update of status on public.appointments
  for each row
  -- Alleen de OVERGANG naar no_show telt. Zonder deze when-clausule zou elke
  -- latere update van een no-show-rij (notitie erbij, prijs corrigeren) de
  -- teller opnieuw ophogen. IS DISTINCT FROM in plaats van <> zodat een
  -- afspraak met status NULL ook meetelt — bij <> levert NULL geen true op.
  when (old.status is distinct from 'no_show' and new.status = 'no_show')
  execute function public.tg_appointments_count_no_show();

-- Dubbeltellen structureel onmogelijk maken.
--
-- De trigger is vanaf nu de ENIGE schrijver. OwnerApp roept record_no_show
-- nog aan direct na zijn eigen status-update; zou die functie blijven
-- ophogen, dan telde elke no-show van de eigenaar dubbel. Daarom telt
-- record_no_show niet meer op: hij geeft alleen nog de actuele stand terug.
-- Signatuur en returnvorm blijven exact gelijk, zodat de bestaande aanroep
-- (toast "X is geblokkeerd", bijwerken van de lokale client_no_shows-map)
-- de juiste cijfers blijft tonen — de update is namelijk al gedaan als de
-- app deze functie aanroept. Verwijdert de frontend de aanroep later alsnog,
-- dan verandert er functioneel niets.
create or replace function public.record_no_show(p_owner_id uuid, p_client_email text)
returns table(no_show_count integer, blocked boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
BEGIN
  -- Alleen de eigenaar (of service_role) mag de stand van zijn eigen klanten
  -- opvragen; ongewijzigd overgenomen uit de oude versie.
  IF auth.uid() IS DISTINCT FROM p_owner_id AND current_setting('role') NOT IN ('service_role','postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT COALESCE(c.no_show_count, 0), COALESCE(c.blocked, false)
      FROM public.client_no_shows c
     WHERE c.client_email = lower(p_client_email)
       AND c.owner_id = p_owner_id;
END;
$$;
