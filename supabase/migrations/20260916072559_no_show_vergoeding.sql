-- No-show-vergoeding (verzoek van een salon via Faisal, 16-09-2026).
--
-- De salon kan naast de no-show-blokkade een percentage instellen dat bij
-- niet verschijnen in rekening wordt gebracht. Vellu int niets zelf: het
-- bedrag wordt bij de statuswissel naar no_show VASTGELEGD op de afspraak
-- (zodat een later gewijzigd percentage oude no-shows niet herrekent), de
-- kaart toont het en de salon stuurt zelf een betaalverzoek. De klant ziet
-- het percentage vóór het akkoord met het boekingsbeleid (public_salons).
--
-- Twee kolommen (aan/uit + percentage) zodat uitzetten het gekozen
-- percentage onthoudt; de view geeft 0 door zolang het uit staat.
alter table public.profiles
  add column if not exists no_show_fee_enabled boolean not null default false;
alter table public.profiles
  add column if not exists no_show_fee_pct integer not null default 20;
alter table public.profiles drop constraint if exists profiles_no_show_fee_pct_check;
alter table public.profiles
  add constraint profiles_no_show_fee_pct_check check (no_show_fee_pct between 0 and 100);
comment on column public.profiles.no_show_fee_enabled is 'No-show-vergoeding aan: bij status no_show wordt no_show_fee_pct van de afspraakprijs op de afspraak vastgelegd.';
comment on column public.profiles.no_show_fee_pct is 'Percentage van de afspraakprijs dat bij een no-show in rekening wordt gebracht (0-100).';

alter table public.appointments
  add column if not exists no_show_fee numeric(10,2);
comment on column public.appointments.no_show_fee is 'Vastgelegd bij de overgang naar no_show: service_price x no_show_fee_pct van de salon op dat moment. NULL = geen vergoeding (instelling uit of prijs 0).';

-- BEFORE-trigger op dezelfde overgang als de teller (appointments_count_no_show),
-- zodat eigenaar én medewerker (StaffApp zet ook status='no_show') hetzelfde
-- resultaat krijgen. SECURITY DEFINER: profiles staat achter RLS en de
-- schrijver is vaak een medewerker.
create or replace function public.tg_appointments_set_no_show_fee()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
  v_pct     integer;
begin
  select coalesce(no_show_fee_enabled, false), coalesce(no_show_fee_pct, 0)
    into v_enabled, v_pct
    from public.profiles
   where id = new.owner_id;

  if v_enabled and v_pct > 0 and coalesce(new.service_price, 0) > 0 then
    new.no_show_fee := round(new.service_price * v_pct / 100.0, 2);
  else
    new.no_show_fee := null;
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_set_no_show_fee on public.appointments;
create trigger appointments_set_no_show_fee
  before update of status on public.appointments
  for each row
  when (old.status is distinct from 'no_show' and new.status = 'no_show')
  execute function public.tg_appointments_set_no_show_fee();

-- Publieke view: nieuwe kolom achteraan (create or replace view mag niets
-- verschuiven). 0 zolang de vergoeding uit staat.
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
    prepay_enabled AND (payment_link IS NOT NULL OR iban IS NOT NULL) AS prepay_enabled,
    booking_theme,
    CASE WHEN no_show_fee_enabled THEN no_show_fee_pct ELSE 0 END AS no_show_fee_pct
   FROM profiles;
grant select on public.public_salons to anon, authenticated;
