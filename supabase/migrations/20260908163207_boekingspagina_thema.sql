-- Thema van de boekingspagina per salon (verzoek van een Bonaire-salon via
-- Faisal, 08-09-2026: "de app opent donker en dat wil ik niet, licht is
-- overzichtelijker"). Tot nu toe opende de publieke pagina donker tenzij de
-- bezoeker zelf ooit het zonnetje had aangetikt (localStorage).
--   dark  = zoals het was (standaard, dus niemand ziet verschil)
--   light = opent licht
--   auto  = volgt de licht/donker-instelling van het apparaat van de bezoeker
-- De bezoeker kan tijdens het bezoek nog steeds wisselen met het zonnetje/
-- maantje; bij een volgend bezoek geldt weer de keuze van de salon.
alter table public.profiles
  add column if not exists booking_theme text not null default 'dark';
alter table public.profiles drop constraint if exists profiles_booking_theme_check;
alter table public.profiles
  add constraint profiles_booking_theme_check check (booking_theme in ('auto', 'light', 'dark'));
comment on column public.profiles.booking_theme is 'Boekingspagina opent in: dark (oude gedrag) | light | auto (apparaat).';

-- Publieke view: nieuwe kolom achteraan (create or replace view mag niets verschuiven).
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
    booking_theme
   FROM profiles;
grant select on public.public_salons to anon, authenticated;
