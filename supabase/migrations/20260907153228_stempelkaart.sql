-- Stempelkaart (loyaliteitskorting): na elke N afgeronde bezoeken krijgt de
-- klant automatisch een persoonlijke kortingscode voor haar volgende afspraak.
--
-- 1. Instellingen per salon.
alter table public.profiles
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_visits integer not null default 10,
  add column if not exists loyalty_discount_pct integer not null default 10,
  add column if not exists loyalty_code_days integer not null default 90,
  add column if not exists loyalty_code_prefix text,
  add column if not exists loyalty_since date;

-- 2. De codes leven in dezelfde tabel als de verjaardagscodes (zelfde
--    validatie in book-appointment en validate_birthday_discount, zelfde
--    RLS): kind onderscheidt ze. De tabelnaam is historisch.
alter table public.birthday_discount_codes
  add column if not exists kind text not null default 'birthday',
  add column if not exists reward_no integer,
  add column if not exists visits_at integer,
  add column if not exists notified_at timestamptz;
alter table public.birthday_discount_codes drop constraint if exists birthday_discount_codes_kind_check;
alter table public.birthday_discount_codes add constraint birthday_discount_codes_kind_check check (kind in ('birthday', 'loyalty'));
create index if not exists birthday_discount_codes_loyalty_unnotified_idx
  on public.birthday_discount_codes (owner_id, created_at) where kind = 'loyalty' and notified_at is null;
comment on table public.birthday_discount_codes is 'Persoonlijke kortingscodes per klant: verjaardag (kind=birthday) en stempelkaart (kind=loyalty). Naam is historisch.';

-- 3. Publieke pagina mag adverteren met de actie (alleen deze drie velden;
--    nieuwe kolommen achteraan, create or replace view mag niets verschuiven).
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
    loyalty_enabled,
    loyalty_visits,
    loyalty_discount_pct
   FROM profiles;
grant select on public.public_salons to anon, authenticated;

-- 4. De stempel: trigger op statuswissel naar 'completed' (zelfde plek als de
--    no-show-teller, want eigenaar én medewerker zetten die status). Telt de
--    afgeronde bezoeken van dit adres sinds loyalty_since, vergelijkt met het
--    aantal al uitgedeelde codes en maakt er hooguit ÉÉN bij per afronding.
--    De mail gaat niet vanuit de database: de app roept loyalty-notify aan
--    (en send-followups veegt dagelijks na), op notified_at.
create or replace function public.tg_appointments_loyalty_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prof   record;
  v_email  text;
  v_visits integer;
  v_issued integer;
  v_prefix text;
  v_code   text;
  v_suffix text;
  i        integer;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then return new; end if;
  if coalesce(new.is_sale, false) then return new; end if;
  v_email := lower(btrim(coalesce(new.client_email, '')));
  if v_email = '' then return new; end if;
  select p.loyalty_enabled, p.loyalty_visits, p.loyalty_discount_pct, p.loyalty_code_days, p.loyalty_code_prefix, p.loyalty_since
    into v_prof from public.profiles p where p.id = new.owner_id;
  if not found or not coalesce(v_prof.loyalty_enabled, false)
     or coalesce(v_prof.loyalty_visits, 0) < 1 or coalesce(v_prof.loyalty_discount_pct, 0) < 1 then
    return new;
  end if;
  select count(*) into v_visits from public.appointments a
   where a.owner_id = new.owner_id and lower(btrim(a.client_email)) = v_email
     and a.status = 'completed' and coalesce(a.is_sale, false) = false
     and (v_prof.loyalty_since is null or a.date >= v_prof.loyalty_since);
  select count(*) into v_issued from public.birthday_discount_codes b
   where b.owner_id = new.owner_id and b.client_email = v_email and b.kind = 'loyalty';
  if (v_visits / v_prof.loyalty_visits) <= v_issued then return new; end if;

  v_prefix := coalesce(nullif(left(regexp_replace(upper(coalesce(v_prof.loyalty_code_prefix, '')), '[^A-Z0-9]', '', 'g'), 8), ''), 'STEMPEL');
  for i in 1..8 loop
    v_suffix := '';
    while length(v_suffix) < 5 loop
      v_suffix := v_suffix || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    v_code := v_prefix || '-' || v_prof.loyalty_discount_pct || '-' || v_suffix;
    begin
      insert into public.birthday_discount_codes (owner_id, code, client_email, discount_pct, expires_on, kind, reward_no, visits_at)
      values (new.owner_id, v_code, v_email, v_prof.loyalty_discount_pct,
              current_date + greatest(7, coalesce(v_prof.loyalty_code_days, 90)), 'loyalty', v_issued + 1, v_visits);
      exit;
    exception when unique_violation then
      null; -- naam bezet: nieuwe staart
    end;
  end loop;
  return new;
end $$;
drop trigger if exists appointments_loyalty_stamp on public.appointments;
create trigger appointments_loyalty_stamp
  after update of status on public.appointments
  for each row execute function public.tg_appointments_loyalty_stamp();
