-- 1) Referral reward: 3 weeks -> 2 weeks (14 days) for BOTH sides.
--    Existing earned credit (e.g. TTNB's 42) is untouched — only future
--    redemptions use the new rate.
CREATE OR REPLACE FUNCTION public.redeem_referral_code(p_new_profile_id uuid, p_code text)
 RETURNS TABLE(success boolean, referrer_name text, referrer_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_referrer_id uuid;
  v_referrer_name text;
  v_clean_code text;
  v_reward_days constant integer := 14;
BEGIN
  v_clean_code := upper(btrim(p_code));
  SELECT id, business_name INTO v_referrer_id, v_referrer_name
  FROM profiles WHERE referral_code = v_clean_code;

  IF v_referrer_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_referrer_id = p_new_profile_id THEN
    -- Can't refer yourself
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  -- Prevent duplicate redemption: if already set, bail
  IF EXISTS(SELECT 1 FROM profiles WHERE id = p_new_profile_id AND referred_by IS NOT NULL) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE profiles
    SET referred_by = v_referrer_id,
        referral_credit_days = COALESCE(referral_credit_days, 0) + v_reward_days
    WHERE id = p_new_profile_id;

  UPDATE profiles
    SET referral_credit_days = COALESCE(referral_credit_days, 0) + v_reward_days
    WHERE id = v_referrer_id;

  RETURN QUERY SELECT true, v_referrer_name, v_referrer_id;
END;
$function$;

-- 2) Accurate "already redeemed" counter — with the rate change,
--    referral_count x fixed-rate can no longer reconstruct history.
--    The Mollie webhook increments this when it consumes credit at billing.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_credit_days_redeemed integer DEFAULT 0;