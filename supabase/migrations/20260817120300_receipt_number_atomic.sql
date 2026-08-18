-- 2026-08-17 — Twee kassa's konden hetzelfde bonnummer uitdelen
--
-- WAAROM: src/OwnerApp.jsx (~regel 5043) leest het nummer uit de in de app
-- gecachte salonData (`parseInt(salonData.next_receipt_number) || 1`), zet dat
-- op de verkoop en schrijft daarna profiles.next_receipt_number = n + 1. Twee
-- tabbladen, de telefoon naast de laptop of gewoon twee snel opeenvolgende
-- afrekeningen lezen allebei dezelfde n en drukken twee bonnen met hetzelfde
-- nummer. Voor de boekhouding is een dubbel bonnummer geen schoonheidsfoutje.
-- Ophogen hoort in één atomaire stap in de database.

create or replace function public.next_receipt_number(p_owner uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  -- De eigenaar mag alleen zijn eigen teller ophogen; anders kan iedereen de
  -- bonnummering van een andere salon vooruit schoppen.
  if auth.uid() is null or auth.uid() is distinct from p_owner then
    raise exception 'forbidden';
  end if;

  -- Ophogen én teruggeven in één statement: de rij staat op slot tot de
  -- transactie klaar is, dus een tweede kassa krijgt gegarandeerd het
  -- volgende nummer in plaats van hetzelfde.
  update public.profiles
     set next_receipt_number = coalesce(next_receipt_number, 0) + 1
   where id = p_owner
  returning next_receipt_number into v_next;

  if v_next is null then
    raise exception 'profile_not_found';
  end if;

  return v_next;
end;
$$;

revoke all on function public.next_receipt_number(uuid) from public;
grant execute on function public.next_receipt_number(uuid) to authenticated;

-- Let op voor wie dit gebruikt: de functie geeft de OPGEHOOGDE waarde terug.
-- Een salon die nu op 5 staat krijgt dus 6 als eerstvolgende bon; nummer 5
-- wordt eenmalig overgeslagen. Dat is bewust — zou de functie de huidige
-- waarde teruggeven, dan botst hij precies met een tabblad dat die 5 nog in
-- zijn cache heeft staan. Een gaatje in de reeks is onschuldig, een dubbel
-- nummer niet.

-- Sluitstuk: ook als er ooit weer een pad ontstaat dat het nummer zelf
-- bedenkt, weigert de database het duplicaat. Vooraf gecontroleerd op de
-- productiedatabase — er bestaan op dit moment geen dubbele combinaties, dus
-- de index kan er zonder opschonen op.
create unique index if not exists appointments_owner_receipt_uniq
  on public.appointments (owner_id, receipt_number)
  where receipt_number is not null;
