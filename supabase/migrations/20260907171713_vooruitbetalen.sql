-- Vooruitbetalen: de klant kiest bij het boeken "Vooruitbetalen", de afspraak
-- komt als reservering (status pending_payment) in de agenda met een
-- betaaltermijn, de salon zet hem op "Betaling ontvangen" en pas dán is hij
-- bevestigd. Niet op tijd betaald → prepay-watch (pg_cron, elk uur) laat de
-- reservering vervallen en geeft de tijd weer vrij.
--
-- 1. Instelling per salon (werkt alleen samen met een betaallink en/of IBAN —
--    de view hieronder laat de knop pas zien als dat er is).
alter table public.profiles
  add column if not exists prepay_enabled boolean not null default false;

-- 2. Betaaltermijn + herinneringsstempel op de afspraak. status is vrije tekst
--    (geen check-constraint); 'pending_payment' is de nieuwe tussenstand.
alter table public.appointments
  add column if not exists payment_due_at timestamptz,
  add column if not exists prepay_reminded_at timestamptz;
create index if not exists appointments_pending_payment_due_idx
  on public.appointments (payment_due_at) where status = 'pending_payment';
comment on column public.appointments.payment_due_at is 'Vooruitbetalen: uiterlijk betaalmoment; daarna vervalt de reservering (prepay-watch).';

-- 3. Publieke pagina: één boolean, alleen waar als het ook echt kan.
--    Nieuwe kolom achteraan (create or replace view mag niets verschuiven).
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
    loyalty_discount_pct,
    prepay_enabled AND (payment_link IS NOT NULL OR iban IS NOT NULL) AS prepay_enabled
   FROM profiles;
grant select on public.public_salons to anon, authenticated;

-- 4. Een reservering houdt het tijdslot vast. De tijdkiezer op de boekingspagina
--    leest deze twee RPC's; book-appointment en reschedule-appointment sluiten
--    alleen cancelled/no_show uit. Zonder deze regel zag de klant het slot als
--    vrij en kreeg bij het versturen alsnog "bezet" (zie booking_slot_parity).
CREATE OR REPLACE FUNCTION public.get_booked_slots(p_slug text, p_date date, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE("time" text, service_duration integer, staff_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.time, a.service_duration, a.staff_id
  FROM appointments a
  JOIN profiles p ON p.id = a.owner_id
  WHERE p.slug = p_slug
    AND a.date = p_date
    AND (p_location_id IS NULL OR a.location_id IS NULL OR a.location_id = p_location_id)
    AND a.status IN ('confirmed', 'completed', 'pending_payment');
$function$;

CREATE OR REPLACE FUNCTION public.get_booked_slots_range(p_slug text, p_from date, p_to date, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(date date, "time" text, service_duration integer, staff_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.date, a.time, a.service_duration, a.staff_id
  FROM appointments a
  JOIN profiles p ON p.id = a.owner_id
  WHERE p.slug = p_slug
    AND a.date >= p_from AND a.date <= p_to
    AND (p_location_id IS NULL OR a.location_id IS NULL OR a.location_id = p_location_id)
    AND a.status IN ('confirmed', 'completed', 'pending_payment');
$function$;
