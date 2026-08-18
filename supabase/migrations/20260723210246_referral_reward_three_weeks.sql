-- Referral reward changes from 1 free MONTH to 3 free WEEKS, so the credit
-- unit becomes days (21) instead of months. New column + backfill of any
-- existing balance (currently zero across all salons) at 30 days/month.
alter table public.profiles add column if not exists referral_credit_days integer not null default 0;
update public.profiles
   set referral_credit_days = coalesce(referral_credit_months, 0) * 30
 where coalesce(referral_credit_months, 0) > 0;

-- Grant 21 days (3 weeks) to BOTH the new salon and the referrer.
create or replace function public.redeem_referral_code(p_new_profile_id uuid, p_code text)
 returns table(success boolean, referrer_name text, referrer_id uuid)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_referrer_id uuid;
  v_referrer_name text;
  v_clean_code text;
  v_reward_days constant integer := 21;
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