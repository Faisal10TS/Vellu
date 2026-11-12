-- Verjaardag uitzetten per klant (audit O2-10). Een verjaardag die de klant
-- zelf bij het boeken invulde (clients.birthday) kon de salon niet echt
-- uitzetten. Met dit vinkje stuurt de cron geen felicitatie en code, en staat
-- de klant niet in de lijst jarigen van de eigenaar, welke datum er ook staat.
alter table public.manual_clients
  add column birthday_off boolean not null default false;

comment on column public.manual_clients.birthday_off is
  'Geen verjaardagsmail, -code of -melding voor deze klant bij deze salon, ook niet met een verjaardag uit een boeking.';

-- Dubbele-klantkaart-trigger: het vinkje gaat mee (één rij met het vinkje is genoeg).
create or replace function public.tg_manual_clients_no_duplicate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_name  text := lower(regexp_replace(btrim(coalesce(new.name, '')), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if position('@' in v_email) = 0 or v_name = '' then
    return new;
  end if;
  -- Twee gelijktijdige inserts van dezelfde klant: de tweede wacht hier tot
  -- de eerste klaar is en ziet die rij dan wel.
  perform pg_advisory_xact_lock(hashtextextended('mc-dup:' || new.owner_id::text || ':' || v_email || ':' || v_name, 0));
  select m.id into v_id
    from public.manual_clients m
   where m.owner_id = new.owner_id
     and lower(btrim(m.email)) = v_email
     and lower(regexp_replace(btrim(m.name), '\s+', ' ', 'g')) = v_name
   order by m.hidden asc, m.created_at asc
   limit 1;
  if v_id is null then
    return new;
  end if;
  update public.manual_clients m set
    phone             = coalesce(nullif(btrim(m.phone), ''), new.phone),
    notes             = coalesce(nullif(btrim(m.notes), ''), new.notes),
    birthday          = coalesce(m.birthday, new.birthday),
    birthday_off      = m.birthday_off or coalesce(new.birthday_off, false),
    contact_name      = coalesce(nullif(btrim(m.contact_name), ''), new.contact_name),
    is_business       = m.is_business or coalesce(new.is_business, false),
    loyalty_opt_in    = m.loyalty_opt_in or coalesce(new.loyalty_opt_in, false),
    loyalty_since     = coalesce(m.loyalty_since, new.loyalty_since),
    loyalty_staff_off = case when cardinality(m.loyalty_staff_off) = 0 then coalesce(new.loyalty_staff_off, '{}'::uuid[]) else m.loyalty_staff_off end,
    -- Opnieuw toevoegen haalt een verborgen klant terug; samenvoegen verbergt nooit.
    hidden            = m.hidden and coalesce(new.hidden, false)
   where m.id = v_id;
  return null;
end $$;
