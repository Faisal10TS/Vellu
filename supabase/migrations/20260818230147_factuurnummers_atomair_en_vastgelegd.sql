-- 2026-08-18 — Factuurnummers: twee tabbladen konden hetzelfde nummer uitdelen,
--              en het nummer werd daarna nergens bewaard
--
-- PROBLEEM 1 — DUBBELE NUMMERS
-- src/OwnerApp.jsx (~regel 6100) leest het nummer uit de in de app gecachte
-- salonData, stuurt de factuurmail met dat nummer, en schrijft daarna
-- next_invoice_number = n + 1 terug. Twee tabbladen, de telefoon naast de
-- laptop, of twee facturen kort na elkaar: allebei lezen dezelfde n en er gaan
-- twee facturen de deur uit met hetzelfde nummer. Hetzelfde gebeurt in
-- src/StaffApp.jsx (~regel 430/464) voor de eigen nummering van een
-- freelancende medewerker, en in de factuurprofielen — die zitten als
-- jsonb-array op profiles.invoice_profiles, elk met een eigen teller.
--
-- Precies dezelfde fout is op 17 augustus al opgelost voor BONnummers
-- (20260818015958_receipt_number_atomic). Facturen bleven achter.
--
-- PROBLEEM 2 — HET NUMMER WERD NERGENS OPGESLAGEN
-- appointments heeft invoice_sent (boolean) en receipt_number (integer), maar
-- geen invoice_number. Het nummer dat de klant op zijn factuur ziet bestond dus
-- alleen in de verstuurde e-mail. Je kunt niet nazoeken welk nummer bij welke
-- afspraak hoort, en de database kon een duplicaat ook niet weigeren omdat er
-- niets was om tegen te toetsen. Voor een doorlopende factuurnummering is dat
-- een gat: bij een controle moet je kunnen laten zien welk nummer waar naartoe
-- ging.
--
-- WAAROM DEZE FUNCTIE HET NUMMER TERUGGEEFT DAT ER STOND, en niet het
-- opgehoogde — anders dan next_receipt_number
-- Bij bonnen is bewust voor "geef het opgehoogde terug" gekozen, zodat een
-- tabblad met een oude waarde in zijn cache nooit kan botsen; een gaatje in de
-- bonreeks is onschuldig. Bij FACTUREN is dat niet zo: een doorlopende
-- nummering zonder gaten is een boekhoudkundige eis. Daarom geeft deze functie
-- de huidige waarde terug en hoogt hij daarna op — atomair, dus twee gelijktijdige
-- aanroepen krijgen n en n+1, nooit twee keer n. Dat mag omdat de frontend na
-- deze migratie zijn gecachte waarde helemaal niet meer gebruikt voor het
-- versturen: hij vraagt het nummer op bij de database.

-- ------------------------------------------------------------------ opslag
alter table public.appointments
  add column if not exists invoice_number text;

-- Sluitstuk: ook als er ooit weer een pad ontstaat dat het nummer zelf bedenkt,
-- weigert de database het duplicaat. Vooraf gecontroleerd op productie: er
-- bestaan nu nul rijen met een invoice_number, dus de index kan er zonder
-- opschonen op.
create unique index if not exists appointments_owner_invoice_uniq
  on public.appointments (owner_id, invoice_number)
  where invoice_number is not null;

-- --------------------------------------------- teller van de salon / profiel
-- p_profile_key null  -> de hoofdteller (profiles.next_invoice_number)
-- p_profile_key gezet -> de teller van dat factuurprofiel binnen de
--                        jsonb-array profiles.invoice_profiles, op zijn id
--                        (niet op arrayvolgorde: die verschuift zodra iemand
--                        een profiel verwijdert).
create or replace function public.next_invoice_number(
  p_owner       uuid,
  p_profile_key text default null
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  -- Alleen de eigenaar mag zijn eigen nummering ophogen; anders kan iedereen
  -- de factuurreeks van een andere salon vooruit schoppen.
  if auth.uid() is null or auth.uid() is distinct from p_owner then
    raise exception 'forbidden';
  end if;

  if p_profile_key is null then
    -- Ophogen én teruggeven in één statement: de rij staat op slot tot de
    -- transactie klaar is, dus een tweede tabblad krijgt gegarandeerd het
    -- volgende nummer in plaats van hetzelfde.
    update public.profiles
       set next_invoice_number = coalesce(next_invoice_number, 0) + 1
     where id = p_owner
    returning next_invoice_number - 1 into v_n;

    if v_n is null then raise exception 'profile_not_found'; end if;
    -- Een teller die op 0 of NULL stond begint bij 1, niet bij 0.
    return greatest(v_n, 1);
  end if;

  -- Bij een factuurprofiel gaat het om een element in een jsonb-array; dat kan
  -- niet in één UPDATE-met-RETURNING. Daarom eerst de profielrij op slot zetten,
  -- zodat lezen en terugschrijven samen één ondeelbare stap zijn.
  perform 1 from public.profiles where id = p_owner for update;

  select coalesce(nullif(e->>'next_invoice_number','')::int, 1)
    into v_n
    from public.profiles p,
         jsonb_array_elements(coalesce(p.invoice_profiles, '[]'::jsonb)) e
   where p.id = p_owner and e->>'id' = p_profile_key;

  if v_n is null then raise exception 'invoice_profile_not_found'; end if;

  update public.profiles p
     set invoice_profiles = (
       select jsonb_agg(
                case when t.e->>'id' = p_profile_key
                     then jsonb_set(t.e, '{next_invoice_number}', to_jsonb(v_n + 1))
                     else t.e end
                order by t.ord)
         from jsonb_array_elements(coalesce(p.invoice_profiles, '[]'::jsonb))
              with ordinality t(e, ord))
   where p.id = p_owner;

  return greatest(v_n, 1);
end;
$$;

revoke all on function public.next_invoice_number(uuid, text) from public, anon;
grant execute on function public.next_invoice_number(uuid, text) to authenticated;

-- ------------------------------------------- teller van een medewerker
-- Een freelancende medewerker factureert op eigen naam en heeft daarom een
-- eigen doorlopende reeks op staff_members.next_invoice_number.
create or replace function public.next_staff_invoice_number(p_staff uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  -- Alleen de medewerker zelf. Let op: bij een eenmanszaak is de eigenaar ook
  -- zijn eigen staff_members-rij (user_id = owner_id), dus die valt hier
  -- vanzelf onder.
  if not exists (
    select 1 from public.staff_members
     where id = p_staff and user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  update public.staff_members
     set next_invoice_number = coalesce(next_invoice_number, 0) + 1
   where id = p_staff
  returning next_invoice_number - 1 into v_n;

  if v_n is null then raise exception 'staff_not_found'; end if;
  return greatest(v_n, 1);
end;
$$;

revoke all on function public.next_staff_invoice_number(uuid) from public, anon;
grant execute on function public.next_staff_invoice_number(uuid) to authenticated;
