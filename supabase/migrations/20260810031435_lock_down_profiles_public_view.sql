-- BEFORE: policy "Anyone can view profiles by slug" USING (true) exposed EVERY
-- profiles column (iban, kvk, btw, mollie ids, discount codes incl. inactive,
-- invoice counters, login email, referral data) to anonymous visitors.
-- Public pages now read a view with only the columns they render; the base
-- table becomes owner/staff-only.

CREATE OR REPLACE VIEW public_salons AS
SELECT
  id, slug, business_name, owner_name, city, country_code, address,
  accent_color, business_hours, account_type, page_font, slot_interval_minutes,
  show_owner_on_booking, booking_policy, booking_policy_en,
  salon_phone, salon_instagram, salon_email, whatsapp_number,
  phone_required, waitlist_enabled, break_minutes,
  logo_url, cover_image_url, cover_focal_y,
  day_overrides, min_advance_hours, max_advance_days,
  directory_visible, subscription_status, created_at, referral_code,
  -- Booking UI only needs to know THAT online payment exists, never the values.
  (payment_link IS NOT NULL OR iban IS NOT NULL) AS payment_configured,
  -- Only ACTIVE discount codes reach the wire (client-side instant validation);
  -- inactive/history stays private.
  (SELECT COALESCE(jsonb_agg(c), '[]'::jsonb)
     FROM jsonb_array_elements(COALESCE(discount_codes, '[]'::jsonb)) AS c
    WHERE (c->>'active')::boolean IS TRUE) AS discount_codes
FROM profiles;

GRANT SELECT ON public_salons TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view profiles by slug" ON profiles;

-- Staff read their own salon's full profile row (StaffApp gets it as a prop).
CREATE POLICY "staff_read_salon_profile" ON profiles FOR SELECT TO authenticated
USING (id IN (SELECT owner_id FROM staff_members WHERE user_id = auth.uid()));

-- Referral counter on the owner dashboard counted OTHER profiles rows
-- (referred_by = me); without the public policy that count would be 0.
CREATE OR REPLACE FUNCTION my_referral_count() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ SELECT count(*)::int FROM profiles WHERE referred_by = auth.uid() $$;
REVOKE ALL ON FUNCTION my_referral_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_referral_count() TO authenticated;