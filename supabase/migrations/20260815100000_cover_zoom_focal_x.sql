-- 2026-08-15 — Coverfoto: zoom + horizontale positie
--
-- De cover kende alleen een verticale positie (cover_focal_y). Nu de eigenaar
-- de foto direct versleept in plaats van met een schuifbalk, is zoomen de
-- logische volgende stap — en zodra je inzoomt is horizontaal slepen ook nodig.
-- cover_zoom 1 = geen zoom (huidig gedrag); focal_x 50 = gecentreerd (huidig
-- gedrag). Bestaande salons merken dus niets.
alter table public.profiles
  add column if not exists cover_zoom numeric not null default 1,
  add column if not exists cover_focal_x integer not null default 50;

-- De publieke boekingspagina leest de cover via de view (zie
-- security_rls_views: nieuwe publieke kolom → eerst aan de view toevoegen).
-- CREATE OR REPLACE staat alleen toe dat kolommen AAN HET EIND bijkomen, dus
-- de bestaande 34 kolommen staan hier ongewijzigd in dezelfde volgorde.
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
    cover_focal_x
   FROM profiles;
