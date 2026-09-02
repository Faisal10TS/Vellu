-- 2026-09-02 — Verjaardag via de boekingspagina + melding voor de salon
--
-- Twee losse opties (verzoek TTNB/Esther): (1) klanten kunnen bij het boeken
-- zelf hun verjaardag invullen (optioneel veld, alleen als de salon dat aanzet),
-- zodat de verjaardagsmail niet afhangt van handmatig invoeren; (2) de salon
-- krijgt op de dag zelf een push-melding + dashboardbanner. Beide default uit —
-- niet elke salon wil dit.
alter table public.profiles
  add column if not exists ask_birthday_on_booking boolean not null default false,
  add column if not exists birthday_notify_owner boolean not null default false;

comment on column public.profiles.ask_birthday_on_booking is
  'Toont een optioneel verjaardagsveld op de publieke boekingspagina; de waarde landt in clients.birthday.';
comment on column public.profiles.birthday_notify_owner is
  'Push-melding + dashboardbanner voor de eigenaar op de dag dat een klant jarig is (send-birthday-emails).';

-- De boekingspagina leest via de view; CREATE OR REPLACE staat alleen nieuwe
-- kolommen AAN HET EIND toe, dus de bestaande 36 blijven in dezelfde volgorde.
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
    ask_birthday_on_booking
   FROM profiles;
