-- Stempelkaart voor iedereen óf alleen voor gekozen klanten (verzoek van een
-- salon, 08-09-2026). Instelling per salon + vinkje per klant; de stempel-
-- trigger slaat bij "selected" elke klant zonder vinkje over (geen stempels,
-- geen code). Publieke pagina: de spaar-regel alleen tonen als iedereen
-- meedoet — adverteren met een actie die maar een deel van de klanten krijgt
-- zou misleiden.

alter table public.profiles
  add column if not exists loyalty_scope text not null default 'all';
alter table public.profiles drop constraint if exists profiles_loyalty_scope_check;
alter table public.profiles
  add constraint profiles_loyalty_scope_check check (loyalty_scope in ('all', 'selected'));
comment on column public.profiles.loyalty_scope is 'Stempelkaart: all = elke klant spaart; selected = alleen klanten met manual_clients.loyalty_opt_in.';

-- Per klant, per salon: manual_clients is de salon-eigen klantrij (notities,
-- telefoon, verjaardag, verborgen). Geen rij = niet gekozen.
alter table public.manual_clients
  add column if not exists loyalty_opt_in boolean not null default false;
comment on column public.manual_clients.loyalty_opt_in is 'Stempelkaart: doet mee wanneer profiles.loyalty_scope = selected.';

-- Trigger: zelfde functie als voorheen, met de scope-check direct na het
-- laden van de salon-instellingen.
CREATE OR REPLACE FUNCTION public.tg_appointments_loyalty_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- Publieke pagina: spaar-regel alleen als iedereen meedoet. Zelfde kolomnaam,
-- zelfde type en volgorde (create or replace view eist dat).
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
    day_overrides,
    min_advance_hours,
    max_advance_days,
    directory_visible,
    subscription_status,
    created_at,
    referral_code,
    payment_link IS NOT NULL OR iban IS NOT NULL AS payment_configured,
    ( SELECT COALESCE(jsonb_agg(c.value), '[]'::jsonb) AS "coalesce"
           FROM jsonb_array_elements(COALESCE(profiles.discount_codes, '[]'::jsonb)) c(value)
          WHERE ((c.value ->> 'active'::text)::boolean) IS TRUE AND (c.value ->> 'source'::text) IS DISTINCT FROM 'birthday'::text) AS discount_codes,
    cover_zoom,
    cover_focal_x,
    ask_birthday_on_booking AND birthday_feature_enabled AS ask_birthday_on_booking,
    loyalty_enabled AND COALESCE(loyalty_scope, 'all') = 'all' AS loyalty_enabled,
    loyalty_visits,
    loyalty_discount_pct,
    prepay_enabled AND (payment_link IS NOT NULL OR iban IS NOT NULL) AS prepay_enabled
   FROM profiles;
grant select on public.public_salons to anon, authenticated;
