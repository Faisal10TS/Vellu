-- Medewerkers wijzigen afspraken via de server (audit, restrisico punt 1).
-- De medewerkersapp schreef rechtstreeks in appointments; daarvoor moest een
-- medewerker haar eigen afspraken ook rechtstreeks kunnen LEZEN, en zo kon ze
-- met een zelfgemaakt verzoek prijzen zien terwijl de omzet voor haar uit
-- stond. Deze stap zet de server-functies klaar; een volgende migratie haalt
-- de directe schrijf- en leesrechten weg zodra de nieuwe app live is.

-- Een afspraak zoals déze medewerker hem mag zien: zelfde regels als
-- staff_list_appointments (bedragen en contactgegevens weg als de eigenaar
-- dat zo heeft ingesteld). Alleen voor de functies hieronder.
create or replace function public.staff_appointment_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select (case when coalesce(p.staff_view_revenue, true) then to_jsonb(a) else public.staff_hide_money(to_jsonb(a)) end)
         - (case when coalesce(p.staff_view_client_contact, true) then '{}'::text[]
                 else array['client_email', 'client_phone', 'client_allergies'] end)
    from public.appointments a
    join public.profiles p on p.id = a.owner_id
   where a.id = p_id
$$;
revoke all on function public.staff_appointment_json(uuid) from public, anon, authenticated;

-- Wijzigen: alleen deze velden, alleen op een afspraak die de medewerker mag
-- behandelen (staff_can_handle_appointment), en bedragen alleen als de
-- eigenaar de omzet voor medewerkers aan heeft staan.
create or replace function public.staff_update_appointment(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
  v_rev boolean;
  v_bad text;
  v_sets text[] := '{}';
  v_txt text;
  v_num numeric;
  v_ts timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'empty_patch' using errcode = '22023';
  end if;
  select string_agg(k, ', ') into v_bad
    from jsonb_object_keys(p_patch) k
   where k <> all (array['status', 'visit_advice', 'advice_followed', 'invoice_number', 'invoice_sent',
                         'service_price', 'amount_paid', 'paid_at']);
  if v_bad is not null then
    raise exception 'field_not_allowed: %', v_bad using errcode = '42501';
  end if;
  if not public.staff_can_handle_appointment(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select a.owner_id into v_owner from public.appointments a where a.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(p.staff_view_revenue, true) into v_rev from public.profiles p where p.id = v_owner;
  if not v_rev and p_patch ?| array['service_price', 'amount_paid', 'paid_at'] then
    raise exception 'forbidden_money' using errcode = '42501';
  end if;

  if p_patch ? 'status' then
    v_txt := p_patch ->> 'status';
    if v_txt is null or v_txt not in ('cancelled', 'no_show') then
      raise exception 'invalid_status' using errcode = '22023';
    end if;
    v_sets := v_sets || format('status = %L', v_txt);
  end if;
  if p_patch ? 'visit_advice' then
    v_sets := v_sets || format('visit_advice = %L', nullif(left(btrim(coalesce(p_patch ->> 'visit_advice', '')), 600), ''));
  end if;
  if p_patch ? 'advice_followed' then
    if jsonb_typeof(p_patch -> 'advice_followed') not in ('boolean', 'null') then
      raise exception 'invalid_value' using errcode = '22023';
    end if;
    v_sets := v_sets || format('advice_followed = %L::boolean', p_patch ->> 'advice_followed');
  end if;
  if p_patch ? 'invoice_number' then
    v_txt := nullif(btrim(coalesce(p_patch ->> 'invoice_number', '')), '');
    if length(v_txt) > 40 then
      raise exception 'invalid_value' using errcode = '22023';
    end if;
    v_sets := v_sets || format('invoice_number = %L', v_txt);
  end if;
  if p_patch ? 'invoice_sent' then
    if jsonb_typeof(p_patch -> 'invoice_sent') <> 'boolean' then
      raise exception 'invalid_value' using errcode = '22023';
    end if;
    v_sets := v_sets || format('invoice_sent = %L::boolean', p_patch ->> 'invoice_sent');
  end if;
  if p_patch ? 'service_price' then
    v_num := (p_patch ->> 'service_price')::numeric;
    if v_num is null or v_num < 0 or v_num > 1000000 then
      raise exception 'invalid_value' using errcode = '22023';
    end if;
    v_sets := v_sets || format('service_price = %s', round(v_num, 2));
  end if;
  if p_patch ? 'amount_paid' then
    v_num := (p_patch ->> 'amount_paid')::numeric;
    if v_num is not null and (v_num < 0 or v_num > 1000000) then
      raise exception 'invalid_value' using errcode = '22023';
    end if;
    v_sets := v_sets || format('amount_paid = %s', coalesce(round(v_num, 2)::text, 'null'));
  end if;
  if p_patch ? 'paid_at' then
    v_ts := (p_patch ->> 'paid_at')::timestamptz;
    v_sets := v_sets || format('paid_at = %L::timestamptz', v_ts);
  end if;

  -- Alleen de meegegeven kolommen in de SET: triggers op "UPDATE OF status"
  -- (stempelkaart, codes vrijgeven) lopen zo niet bij het opslaan van een notitie.
  execute format('update public.appointments set %s where id = $1', array_to_string(v_sets, ', ')) using p_id;
  return public.staff_appointment_json(p_id);
end $$;
revoke all on function public.staff_update_appointment(uuid, jsonb) from public, anon;
grant execute on function public.staff_update_appointment(uuid, jsonb) to authenticated;

-- Nieuwe afspraak door een medewerker, altijd op haar eigen naam. De klantrij
-- (clients, per salon) zoekt of maakt de server zelf.
create or replace function public.staff_create_appointment(p_appt jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
  v_staff_id uuid;
  v_staff_name text;
  v_email text := lower(btrim(coalesce(p_appt ->> 'client_email', '')));
  v_name text := btrim(coalesce(p_appt ->> 'client_name', ''));
  v_phone text := nullif(btrim(coalesce(p_appt ->> 'client_phone', '')), '');
  v_service uuid;
  v_price numeric;
  v_dur integer;
  v_date date;
  v_time text := btrim(coalesce(p_appt ->> 'time', ''));
  v_lang text := nullif(btrim(coalesce(p_appt ->> 'lang', '')), '');
  v_bday date;
  v_client uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_appt is null or jsonb_typeof(p_appt) <> 'object' then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  v_owner := nullif(p_appt ->> 'owner_id', '')::uuid;
  select sm.id, sm.name into v_staff_id, v_staff_name
    from public.staff_members sm
   where sm.user_id = auth.uid() and sm.active is true and sm.owner_id = v_owner
   limit 1;
  if v_staff_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;
  v_date := nullif(p_appt ->> 'date', '')::date;
  if v_date is null or v_time !~ '^[0-2][0-9]:[0-5][0-9](:[0-5][0-9])?$' then
    raise exception 'invalid_datetime' using errcode = '22023';
  end if;
  v_service := nullif(p_appt ->> 'service_id', '')::uuid;
  if v_service is not null and not exists (
       select 1 from public.services s where s.id = v_service and s.owner_id = v_owner) then
    raise exception 'invalid_service' using errcode = '22023';
  end if;
  v_price := coalesce(nullif(p_appt ->> 'service_price', '')::numeric, 0);
  v_dur := coalesce(nullif(p_appt ->> 'service_duration', '')::integer, 60);
  if v_price < 0 or v_price > 1000000 or v_dur <= 0 or v_dur > 1440 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if v_lang is not null and v_lang not in ('nl', 'en', 'es') then
    v_lang := null;
  end if;
  v_bday := nullif(btrim(coalesce(p_appt ->> 'client_birthday', '')), '')::date;

  v_client := public.client_for_salon(
    v_owner, v_email,
    coalesce(nullif(btrim(p_appt ->> 'client_first'), ''), split_part(v_name, ' ', 1)),
    coalesce(btrim(p_appt ->> 'client_last'), ''),
    v_phone, null, v_bday);

  insert into public.appointments (
    owner_id, service_id, client_id, service_name, service_price, service_duration,
    date, time, client_name, client_email, client_phone,
    payment_method, status, invoice_sent, staff_id, staff_name, lang)
  values (
    v_owner, v_service, v_client, left(coalesce(p_appt ->> 'service_name', ''), 300), round(v_price, 2), v_dur,
    v_date, v_time, left(v_name, 200), v_email, v_phone,
    'on-arrival', 'confirmed', false, v_staff_id, v_staff_name, v_lang)
  returning id into v_id;
  return public.staff_appointment_json(v_id);
end $$;
revoke all on function public.staff_create_appointment(jsonb) from public, anon;
grant execute on function public.staff_create_appointment(jsonb) to authenticated;

-- Voltooien en vooruitbetaling vastleggen: zelfde werking, maar ze geven nu
-- de hele (gestripte) afspraak terug, zodat de app geen bedragen hoeft te raden.
create or replace function public.staff_complete_appointment(p_id uuid, p_method text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_a public.appointments%rowtype;
  v_price numeric;
  v_paid numeric;
  v_open numeric;
  v_staff_name text;
  v_cc text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_method is not null and p_method not in ('cash', 'pin', 'transfer') then
    raise exception 'invalid_method' using errcode = '22023';
  end if;
  if not public.staff_can_handle_appointment(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_a from public.appointments where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_a.status not in ('confirmed', 'completed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  v_price := coalesce(v_a.service_price, 0);
  v_paid := case
              when v_a.amount_paid is not null then greatest(v_a.amount_paid, 0)
              when v_a.paid_at is not null then v_price
              else 0
            end;
  v_open := round(v_price - v_paid, 2);

  if v_paid > 0 and v_open <= 0.005 then
    update public.appointments
       set status = 'completed'
     where id = p_id;
  elsif p_method is not null and v_a.payment_method = 'prepaid' and v_paid > 0 and v_open > 0.005 then
    select sm.name into v_staff_name
      from public.staff_members sm
     where sm.owner_id = v_a.owner_id and sm.user_id = auth.uid()
     limit 1;
    select p.country_code into v_cc from public.profiles p where p.id = v_a.owner_id;
    insert into public.client_payments (owner_id, appointment_id, amount, method, paid_on, client_name, label, staff_name)
    values (v_a.owner_id, v_a.id, v_open, p_method,
            (now() at time zone case v_cc
                                  when 'BE' then 'Europe/Brussels'
                                  when 'GB' then 'Europe/London'
                                  when 'AW' then 'America/Curacao'
                                  when 'CW' then 'America/Curacao'
                                  when 'BQ' then 'America/Curacao'
                                  when 'SX' then 'America/Curacao'
                                  else 'Europe/Amsterdam'
                                end)::date,
            nullif(v_a.client_name, ''), nullif(v_a.service_name, ''), v_staff_name);
    update public.appointments
       set status = 'completed', paid_at = now(), amount_paid = service_price
     where id = p_id;
  else
    update public.appointments
       set status = 'completed',
           payment_method = case when p_method is null and payment_method = 'on-arrival' then null
                                 else coalesce(p_method, payment_method) end,
           paid_at = case when p_method is not null then now() else paid_at end,
           amount_paid = case when p_method is not null then service_price else amount_paid end
     where id = p_id;
  end if;
  return public.staff_appointment_json(p_id);
end;
$function$;

create or replace function public.staff_mark_prepaid(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.staff_can_handle_appointment(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status from public.appointments where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_status = 'pending_payment' then
    update public.appointments
       set status = 'confirmed', payment_method = 'prepaid', paid_at = now(), amount_paid = service_price
     where id = p_id and status = 'pending_payment';
  elsif v_status in ('confirmed', 'completed') then
    update public.appointments
       set paid_at = now(), amount_paid = service_price
     where id = p_id;
  else
    -- Vervallen of geannuleerde reservering komt niet stilletjes terug.
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  return public.staff_appointment_json(p_id);
end;
$function$;

-- Annuleerlinks: eigenaar, of een medewerker die de afspraak mag behandelen.
-- Via een functie i.p.v. een subquery op appointments, zodat dit blijft werken
-- als medewerkers appointments niet meer rechtstreeks kunnen lezen.
create or replace function public.can_touch_appointment(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from public.appointments a where a.id = p_id and a.owner_id = auth.uid())
      or public.staff_can_handle_appointment(p_id)
$$;
revoke all on function public.can_touch_appointment(uuid) from public, anon;
grant execute on function public.can_touch_appointment(uuid) to authenticated;

drop policy if exists owner_staff_insert_cancellation_tokens on public.cancellation_tokens;
drop policy if exists owner_staff_select_cancellation_tokens on public.cancellation_tokens;
drop policy if exists owner_staff_update_cancellation_tokens on public.cancellation_tokens;
create policy owner_staff_insert_cancellation_tokens on public.cancellation_tokens
  for insert to authenticated
  with check (public.can_touch_appointment(appointment_id));
create policy owner_staff_select_cancellation_tokens on public.cancellation_tokens
  for select to authenticated
  using (public.can_touch_appointment(appointment_id));
create policy owner_staff_update_cancellation_tokens on public.cancellation_tokens
  for update to authenticated
  using (public.can_touch_appointment(appointment_id))
  with check (public.can_touch_appointment(appointment_id));

-- Klantnotities voor medewerkers (klantgegevens aan): klanten van afspraken
-- die zij mag behandelen. Ook via een functie, om dezelfde reden.
create or replace function public.staff_handles_client_email(p_owner uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.appointments a
     where a.owner_id = p_owner
       and lower(a.client_email) = lower(p_email)
       and public.staff_can_handle_appointment(a.id))
$$;
revoke all on function public.staff_handles_client_email(uuid, text) from public, anon;
grant execute on function public.staff_handles_client_email(uuid, text) to authenticated;

drop policy if exists staff_read_manual_clients_when_allowed on public.manual_clients;
create policy staff_read_manual_clients_when_allowed on public.manual_clients
  for select to authenticated
  using (
    exists (select 1 from public.staff_members sm
             where sm.user_id = (select auth.uid()) and sm.active is not false and sm.owner_id = manual_clients.owner_id)
    and owner_id in (select f.owner_id from public.staff_salon_flags() f where f.view_contact)
    and public.staff_handles_client_email(owner_id, email)
  );
