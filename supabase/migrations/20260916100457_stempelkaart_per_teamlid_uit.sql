-- Stempelkaart per teamlid: per klant per stylist uit te zetten (Faisal 16-09-2026,
-- verzoek van TTNB). manual_clients.loyalty_staff_off = de stylisten
-- (staff_members.id) bij wie deze klant NIET spaart. De trigger slaat die
-- stylisten over: geen stempel en geen code bij haar. Zonder rij of met een
-- lege lijst verandert er niets (iedereen spaart bij iedereen, zoals eerst).
alter table public.manual_clients
  add column if not exists loyalty_staff_off uuid[] not null default '{}'::uuid[];
comment on column public.manual_clients.loyalty_staff_off is
  'Stempelkaart per teamlid: stylisten (staff_members.id) bij wie deze klant niet spaart.';

create or replace function public.tg_appointments_loyalty_stamp()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_off       uuid[];
  i           integer;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then return new; end if;
  if coalesce(new.is_sale, false) then return new; end if;
  v_email := lower(btrim(coalesce(new.client_email, '')));
  if v_email = '' then return new; end if;
  select p.loyalty_enabled, p.loyalty_visits, p.loyalty_discount_pct, p.loyalty_code_days, p.loyalty_code_prefix, p.loyalty_since, p.loyalty_per_staff, p.loyalty_scope
    into v_prof from public.profiles p where p.id = new.owner_id;
  if not found or not coalesce(v_prof.loyalty_enabled, false)
     or coalesce(v_prof.loyalty_visits, 0) < 1 or coalesce(v_prof.loyalty_discount_pct, 0) < 1 then
    return new;
  end if;
  -- Alleen gekozen klanten: zonder vinkje op de klantkaart geen stempel.
  if coalesce(v_prof.loyalty_scope, 'all') = 'selected' and not exists (
       select 1 from public.manual_clients m
        where m.owner_id = new.owner_id and lower(btrim(coalesce(m.email, ''))) = v_email
          and coalesce(m.loyalty_opt_in, false)) then
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
    -- Per teamlid uitgezet op de klantkaart: die stylist(en) overslaan.
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_off
      from public.manual_clients m, unnest(coalesce(m.loyalty_staff_off, '{}'::uuid[])) x
     where m.owner_id = new.owner_id and lower(btrim(coalesce(m.email, ''))) = v_email;
    if coalesce(array_length(v_off, 1), 0) > 0 then
      select coalesce(array_agg(y), '{}'::uuid[]) into v_staff_ids
        from unnest(v_staff_ids) y where not (y = any(v_off));
    end if;
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
end $function$;
