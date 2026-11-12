-- Dubbele klantkaarten (audit 05-10, punt 1). Een nieuwe klantrij met
-- hetzelfde e-mailadres EN dezelfde naam als een bestaande rij van dezelfde
-- salon wordt geen tweede rij: de trigger vult lege velden van de bestaande
-- rij aan (overschrijft niets) en slaat de insert over. Zo breekt een import
-- van 200 regels niet op een dubbele, en een dubbelklik maakt geen tweede
-- kaart. Een andere naam op hetzelfde adres is een andere klant (gezinslid,
-- organisatieadres) en mag gewoon. Rijen zonder e-mailadres blijven buiten
-- schot. Bestaande dubbelen blijven staan (samenvoegen kan in de app).
-- SECURITY INVOKER (standaard): de check en de aanvulling lopen door de RLS
-- van de aanroeper, dus een insert met de owner_id van een andere salon raakt
-- daar niets en strandt daarna op de gewone RLS-check.
create index if not exists manual_clients_owner_email_idx
  on public.manual_clients (owner_id, lower(btrim(email)));

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

drop trigger if exists manual_clients_no_duplicate on public.manual_clients;
create trigger manual_clients_no_duplicate
  before insert on public.manual_clients
  for each row execute function public.tg_manual_clients_no_duplicate();
