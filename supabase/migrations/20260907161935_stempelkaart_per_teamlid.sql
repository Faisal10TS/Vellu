-- Stempelkaart per teamlid: bezoeken tellen per stylist en de code hoort bij
-- haar — anders spaart een klant bij Lady en verzilvert ze bij Esther.
alter table public.profiles add column if not exists loyalty_per_staff boolean not null default false;
alter table public.birthday_discount_codes add column if not exists staff_id uuid references public.staff_members(id) on delete set null;
create index if not exists birthday_discount_codes_loyalty_staff_idx on public.birthday_discount_codes (owner_id, client_email, staff_id) where kind = 'loyalty';

-- Validatie geeft de gebonden stylist mee (id + naam) zodat de boekingspagina
-- de korting alleen op háár behandelingen kan tonen. Return-type wijzigt →
-- drop + create, met dezelfde rechten als voorheen.
drop function if exists public.validate_birthday_discount(text, text, text);
create function public.validate_birthday_discount(p_slug text, p_code text, p_email text)
returns table(code text, amount numeric, type text, staff_id uuid, staff_name text)
language sql security definer set search_path to 'public' as $$
  select b.code, b.discount_pct as amount, 'percent'::text as type, b.staff_id, s.name as staff_name
    from public.birthday_discount_codes b
    join public.profiles p on p.id = b.owner_id
    left join public.staff_members s on s.id = b.staff_id
   where p.slug = p_slug
     and b.code = upper(btrim(p_code))
     and b.client_email = lower(btrim(p_email))
     and b.used_at is null
     and b.expires_on >= (current_date - 1)
   limit 1;
$$;
revoke all on function public.validate_birthday_discount(text, text, text) from public;
grant execute on function public.validate_birthday_discount(text, text, text) to anon, authenticated, service_role;

-- Trigger: per stylist (loyalty_per_staff) of salonbreed (staff_id null).
create or replace function public.tg_appointments_loyalty_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prof      record;
  v_email     text;
  v_visits    integer;
  v_issued    integer;
  v_prefix    text;
  v_code      text;
  v_suffix    text;
  v_staff     uuid;
  v_staff_ids uuid[];
  i           integer;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then return new; end if;
  if coalesce(new.is_sale, false) then return new; end if;
  v_email := lower(btrim(coalesce(new.client_email, '')));
  if v_email = '' then return new; end if;
  select p.loyalty_enabled, p.loyalty_visits, p.loyalty_discount_pct, p.loyalty_code_days, p.loyalty_code_prefix, p.loyalty_since, p.loyalty_per_staff
    into v_prof from public.profiles p where p.id = new.owner_id;
  if not found or not coalesce(v_prof.loyalty_enabled, false)
     or coalesce(v_prof.loyalty_visits, 0) < 1 or coalesce(v_prof.loyalty_discount_pct, 0) < 1 then
    return new;
  end if;
  v_prefix := coalesce(nullif(left(regexp_replace(upper(coalesce(v_prof.loyalty_code_prefix, '')), '[^A-Z0-9]', '', 'g'), 8), ''), 'STEMPEL');

  if coalesce(v_prof.loyalty_per_staff, false) then
    -- Elke stylist die in deze afspraak een deel deed krijgt een stempel op
    -- haar eigen kaart; zonder breakdown telt de primaire stylist.
    select coalesce(array_agg(distinct (p->>'staff_id')::uuid), '{}'::uuid[]) into v_staff_ids
      from jsonb_array_elements(coalesce(new.service_breakdown, '[]'::jsonb)) p
     where coalesce(p->>'staff_id', '') ~ '^[0-9a-fA-F-]{36}$';
    if coalesce(array_length(v_staff_ids, 1), 0) = 0 and new.staff_id is not null then v_staff_ids := array[new.staff_id]; end if;
    if coalesce(array_length(v_staff_ids, 1), 0) = 0 then return new; end if;
  else
    v_staff_ids := array[null::uuid];
  end if;

  foreach v_staff in array v_staff_ids loop
    select count(*) into v_visits from public.appointments a
     where a.owner_id = new.owner_id and lower(btrim(a.client_email)) = v_email
       and a.status = 'completed' and coalesce(a.is_sale, false) = false
       and (v_prof.loyalty_since is null or a.date >= v_prof.loyalty_since)
       and (v_staff is null or a.staff_id = v_staff or exists (
             select 1 from jsonb_array_elements(coalesce(a.service_breakdown, '[]'::jsonb)) q where q->>'staff_id' = v_staff::text));
    select count(*) into v_issued from public.birthday_discount_codes b
     where b.owner_id = new.owner_id and b.client_email = v_email and b.kind = 'loyalty' and b.staff_id is not distinct from v_staff;
    if (v_visits / v_prof.loyalty_visits) <= v_issued then continue; end if;
    for i in 1..8 loop
      v_suffix := '';
      while length(v_suffix) < 5 loop
        v_suffix := v_suffix || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
      end loop;
      v_code := v_prefix || '-' || v_prof.loyalty_discount_pct || '-' || v_suffix;
      begin
        insert into public.birthday_discount_codes (owner_id, code, client_email, discount_pct, expires_on, kind, reward_no, visits_at, staff_id)
        values (new.owner_id, v_code, v_email, v_prof.loyalty_discount_pct,
                current_date + greatest(7, coalesce(v_prof.loyalty_code_days, 90)), 'loyalty', v_issued + 1, v_visits, v_staff);
        exit;
      exception when unique_violation then
        null; -- naam bezet: nieuwe staart
      end;
    end loop;
  end loop;
  return new;
end $$;
