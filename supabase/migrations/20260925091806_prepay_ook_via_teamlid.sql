-- Vooruitbetalen per teamlid (25-09-2026): de boekingspagina toont
-- "Vooruitbetalen" alleen als de publieke view prepay_enabled = true geeft.
-- Tot nu toe eiste die een betaallink of IBAN van de SALON; sinds vandaag
-- volstaat ook een teamlid met eigen IBAN of betaallink (book-appointment
-- stap 12a rekent daar al mee, en de schakelaar in Instellingen ook). Zonder
-- deze wijziging kon een salon zonder eigen IBAN de schakelaar aanzetten
-- terwijl de klant de keuze nooit te zien kreeg. Rest van de view ongewijzigd.
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
    loyalty_enabled AND COALESCE(loyalty_scope, 'all'::text) = 'all'::text AS loyalty_enabled,
    loyalty_visits,
    loyalty_discount_pct,
    prepay_enabled AND (payment_link IS NOT NULL OR iban IS NOT NULL
      OR EXISTS ( SELECT 1 FROM staff_members s
                   WHERE s.owner_id = profiles.id AND s.active IS TRUE
                     AND (NULLIF(s.iban, '') IS NOT NULL OR NULLIF(s.payment_link, '') IS NOT NULL))) AS prepay_enabled,
    booking_theme,
        CASE
            WHEN no_show_fee_enabled THEN no_show_fee_pct
            ELSE 0
        END AS no_show_fee_pct
   FROM profiles;
