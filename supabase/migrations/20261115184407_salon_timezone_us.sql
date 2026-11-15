-- Eigen tijdzone per salon (VS, fase 1, 15-11-2026).
--
-- Tot nu toe volgde de tijdzone uit het land (salon_tz): elk land had er één.
-- De Verenigde Staten hebben er zes (plus Arizona zonder zomertijd), dus kiest
-- een Amerikaanse salon die zelf. Leeg = de landregel, zoals altijd; alleen
-- bij country_code = 'US' telt de kolom (zelfde regel als tzFor in shared.jsx
-- en de edge-functies). Alleen deze zones mogen erin; uitbreiden = de lijst
-- hier, US_TIMEZONES in shared.jsx en SALON_TZS in de edge-functies samen.

alter table public.profiles add column if not exists timezone text;
alter table public.profiles drop constraint if exists profiles_timezone_check;
alter table public.profiles add constraint profiles_timezone_check
  check (timezone is null or timezone in ('America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'));
comment on column public.profiles.timezone is
  'IANA-tijdzone van de salon. Alleen voor country_code US; leeg = landregel (salon_tz). Zie salon_tz_of.';

-- Landregel: de VS zonder eigen keuze vallen op Eastern (de meeste inwoners).
create or replace function public.salon_tz(p_country text)
 returns text
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select case upper(coalesce(p_country, ''))
           when 'BE' then 'Europe/Brussels'
           when 'GB' then 'Europe/London'
           when 'AW' then 'America/Curacao'
           when 'CW' then 'America/Curacao'
           when 'BQ' then 'America/Curacao'
           when 'SX' then 'America/Curacao'
           when 'US' then 'America/New_York'
           else 'Europe/Amsterdam'
         end
$function$;

-- De tijdzone van één salon: eigen keuze (alleen VS), anders de landregel.
-- Geen RPC voor buitenstaanders: alleen de SECURITY DEFINER-functies
-- hieronder roepen hem aan.
create or replace function public.salon_tz_of(p_owner uuid)
 returns text
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select case when upper(coalesce(p.country_code, '')) = 'US' and p.timezone is not null
                 then p.timezone
                 else public.salon_tz(p.country_code) end
       from public.profiles p where p.id = p_owner),
    public.salon_tz(null))
$function$;
revoke all on function public.salon_tz_of(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_complete_appointment(p_id uuid, p_method text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_a public.appointments%rowtype;
  v_price numeric;
  v_paid numeric;
  v_open numeric;
  v_staff_name text;
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
    insert into public.client_payments (owner_id, appointment_id, amount, method, paid_on, client_name, label, staff_name)
    values (v_a.owner_id, v_a.id, v_open, p_method,
            (now() at time zone public.salon_tz_of(v_a.owner_id))::date,
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

CREATE OR REPLACE FUNCTION public.tg_appointments_move_cancel_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.date is null or coalesce(new.time, '') !~ '^[0-9]{2}:[0-9]{2}' then
    return null;
  end if;
  update public.cancellation_tokens
     set expires_at = (new.date + new.time::time) at time zone public.salon_tz_of(new.owner_id)
   where appointment_id = new.id
     and used is not true;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_appointments_followup_reset_on_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_time  text;
  v_visit timestamptz;
begin
  if new.date > old.date
     and new.date >= current_date - 3
     and coalesce(old.followup_sent, false)
     and coalesce(new.followup_sent, false)
     and not exists (select 1 from public.reviews r where r.appointment_id = new.id)
     and not exists (select 1 from public.review_tokens t where t.appointment_id = new.id and t.used_at is not null)
  then
    v_time := coalesce(substring(coalesce(new.time, '') from '^\d{1,2}:\d{2}'), '00:00');
    v_visit := (new.date + v_time::time) at time zone public.salon_tz_of(new.owner_id);
    if (old.followup_sent_at is null and new.date >= current_date)
       or (old.followup_sent_at is not null and old.followup_sent_at < v_visit)
    then
      new.followup_sent := false;
      new.followup_sent_at := null;
      update public.review_tokens t
         set expires_at = greatest(t.expires_at, (new.date + 60)::timestamptz)
       where t.appointment_id = new.id and t.used_at is null;
    end if;
  end if;
  return new;
end $function$;

-- Boekingspagina: de tijdzone moet mee, anders rekent de pagina een
-- Amerikaanse salon op Eastern.
create or replace view public.public_salons as
 SELECT id,
    slug,
    business_name,
    owner_name,
    city,
    country_code,
    address,
    accent_color,
    business_hours,
    account_type,
    page_font,
    slot_interval_minutes,
    show_owner_on_booking,
    booking_policy,
    booking_policy_en,
    salon_phone,
    salon_instagram,
    salon_email,
    whatsapp_number,
    phone_required,
    waitlist_enabled,
    break_minutes,
    logo_url,
    cover_image_url,
    cover_focal_y,
        CASE jsonb_typeof(day_overrides)
            WHEN 'object'::text THEN ( SELECT COALESCE(jsonb_object_agg(e.key,
                    CASE
                        WHEN jsonb_typeof(e.value) = 'object'::text THEN e.value - 'reason'::text - 'staff_name'::text
                        ELSE e.value
                    END), '{}'::jsonb) AS "coalesce"
               FROM jsonb_each(profiles.day_overrides) e(key, value))
            WHEN 'array'::text THEN ( SELECT COALESCE(jsonb_agg(
                    CASE
                        WHEN jsonb_typeof(e.value) = 'object'::text THEN e.value - 'reason'::text - 'staff_name'::text
                        ELSE e.value
                    END ORDER BY e.ord), '[]'::jsonb) AS "coalesce"
               FROM jsonb_array_elements(profiles.day_overrides) WITH ORDINALITY e(value, ord))
            ELSE day_overrides
        END AS day_overrides,
    min_advance_hours,
    max_advance_days,
    directory_visible,
    subscription_status,
    created_at,
        CASE
            WHEN COALESCE(is_demo, false) THEN NULL::text
            ELSE referral_code
        END AS referral_code,
    NULLIF(btrim(payment_link), ''::text) IS NOT NULL OR NULLIF(btrim(iban), ''::text) IS NOT NULL AS payment_configured,
    ( SELECT COALESCE(jsonb_agg(c.value), '[]'::jsonb) AS "coalesce"
           FROM jsonb_array_elements(COALESCE(profiles.discount_codes, '[]'::jsonb)) c(value)
          WHERE ((c.value ->> 'active'::text)::boolean) IS TRUE AND (c.value ->> 'source'::text) IS DISTINCT FROM 'birthday'::text) AS discount_codes,
    cover_zoom,
    cover_focal_x,
    ask_birthday_on_booking AND birthday_feature_enabled AS ask_birthday_on_booking,
    loyalty_enabled AND COALESCE(loyalty_scope, 'all'::text) = 'all'::text AS loyalty_enabled,
    loyalty_visits,
    loyalty_discount_pct,
    prepay_enabled AND (payment_link IS NOT NULL OR iban IS NOT NULL OR (EXISTS ( SELECT 1
           FROM staff_members s
          WHERE s.owner_id = profiles.id AND s.active IS TRUE AND (NULLIF(s.iban, ''::text) IS NOT NULL OR NULLIF(s.payment_link, ''::text) IS NOT NULL)))) AS prepay_enabled,
    booking_theme,
        CASE
            WHEN no_show_fee_enabled THEN no_show_fee_pct
            ELSE 0
        END AS no_show_fee_pct,
    cancel_deadline_hours,
    COALESCE(is_demo, false) AS is_demo,
    deactivated_at IS NOT NULL AS deactivated,
    booking_policy_es,
    timezone
   FROM profiles;
