-- Kortingscodes verhuizen mee met de klant. Een stempelkaart- of verjaardagscode
-- hangt aan het e-mailadres (birthday_discount_codes.client_email). Kreeg een
-- klant een ander adres (Klant bewerken) of werd haar kaart samengevoegd, dan
-- gingen de afspraken naar het nieuwe adres en bleven de codes achter: de
-- klant kon haar code niet meer gebruiken (validate_birthday_discount en
-- book-appointment zoeken op adres + code) en de stempeltrigger zag de oude
-- bezoeken onder het nieuwe adres zonder uitgegeven code, en gaf dus nog een
-- beloning voor dezelfde bezoeken.
--
-- move_client_codes(oud, nieuw): alleen de eigenaar, alleen eigen codes, en
-- alleen als de klant echt verhuisd is (geen afspraak van deze salon meer op het
-- oude adres, wel op het nieuwe). Alle codes gaan mee, ook gebruikte en
-- verlopen: die tellen mee voor wanneer de volgende stempelkaartcode komt.
create or replace function public.move_client_codes(p_from text, p_to text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := (select auth.uid());
  v_from  text := lower(btrim(coalesce(p_from, '')));
  v_to    text := lower(btrim(coalesce(p_to, '')));
  v_n     integer;
begin
  if v_owner is null or not exists (select 1 from public.profiles p where p.id = v_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_from = '' or v_from = v_to or v_to !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return 0;
  end if;
  if exists (select 1 from public.appointments a
              where a.owner_id = v_owner and lower(btrim(coalesce(a.client_email, ''))) = v_from) then
    return 0;
  end if;
  if not exists (select 1 from public.appointments a
                  where a.owner_id = v_owner and lower(btrim(coalesce(a.client_email, ''))) = v_to) then
    return 0;
  end if;
  update public.birthday_discount_codes b
     set client_email = v_to
   where b.owner_id = v_owner and lower(btrim(b.client_email)) = v_from;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.move_client_codes(text, text) from public, anon;
grant execute on function public.move_client_codes(text, text) to authenticated;

-- Stempels alleen op een echt e-mailadres. Bij een inloopklant tikt een salon
-- soms "." of "none" in het adresveld; de trigger telde dat als klant, maakte er
-- een code voor en loyalty-notify bleef die code proberen te mailen. De
-- klantenlijst behandelt zo'n adres sinds deze ronde ook als "geen adres".
create or replace function public.tg_appointments_loyalty_stamp()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_prof      record;
  v_email     text;
  v_since     date;
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
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return new; end if;
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
  -- Ingangsdatum: die van de klant (klantkaart) als die er is, anders de
  -- salondatum. Bij dubbele klantrijen wint de laatste datum.
  select max(m.loyalty_since) into v_since from public.manual_clients m
   where m.owner_id = new.owner_id and lower(btrim(coalesce(m.email, ''))) = v_email;
  v_since := coalesce(v_since, v_prof.loyalty_since);
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
       and (v_since is null or a.date >= v_since)
       and (v_staff is null or a.staff_id = v_staff or exists (
             select 1 from jsonb_array_elements(coalesce(a.service_breakdown, '[]'::jsonb)) q where q->>'staff_id' = v_staff::text));
    -- Uitgegeven codes sinds de ingangsdatum (eerdere horen bij de vorige kaart).
    select count(*) into v_issued from public.birthday_discount_codes b
     where b.owner_id = new.owner_id and b.client_email = v_email and b.kind = 'loyalty' and b.staff_id is not distinct from v_staff
       and (v_since is null or b.created_at >= v_since);
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
