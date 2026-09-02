-- 2026-09-02 — Hoofdschakelaar "Verjaardagsactie gebruiken"
--
-- Eén vlag die de hele verjaardagsfunctie aan/uit zet; de deelkeuzes (Vellu
-- mailt automatisch / zelf sturen, verjaardag vragen bij boeken, melding) en
-- de klantcodes staan er alleen als deze aan staat. Bestaande salons die de
-- mail al aan hadden of een percentage hadden ingesteld krijgen 'm aan, zodat
-- er voor hen niets verandert.
alter table public.profiles
  add column if not exists birthday_feature_enabled boolean not null default false;

update public.profiles
   set birthday_feature_enabled = true
 where birthday_email_enabled = true
    or birthday_email_discount_pct is not null;

comment on column public.profiles.birthday_feature_enabled is
  'Hoofdschakelaar verjaardagsactie: uit = geen mails, geen meldingen, geen verjaardagsveld bij boeken, geen klantcodes-blok.';

-- De boekingspagina toont het verjaardagsveld alleen als de actie aan staat:
-- zelfde kolomnaam/-type/-positie in de view, alleen de expressie verandert.
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
    (payment_link IS NOT NULL OR iban IS NOT NULL) AS payment_configured,
    ( SELECT COALESCE(jsonb_agg(c.value), '[]'::jsonb) AS "coalesce"
           FROM jsonb_array_elements(COALESCE(profiles.discount_codes, '[]'::jsonb)) c(value)
          WHERE ((c.value ->> 'active'::text)::boolean) IS TRUE
            AND (c.value ->> 'source'::text) IS DISTINCT FROM 'birthday') AS discount_codes,
    cover_zoom,
    cover_focal_x,
    (ask_birthday_on_booking AND birthday_feature_enabled) AS ask_birthday_on_booking
   FROM profiles;
