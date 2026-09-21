-- Referral-actie, correctie (Faisal 21-09-2026): "if they sign up using the
-- referral code their first payment should be after a month, not after a
-- month and 2 weeks". De nieuwe salon kreeg de maand als TEGOED bovenop de
-- gewone proef van 14 dagen (samen ruim zes weken gratis). Nu: tijdens een
-- actie IS de gratis maand van de nieuwe salon haar proefperiode (30 dagen in
-- plaats van 14, geen tegoed erbovenop); de eerste betaling komt dus na één
-- maand. De uitnodigende salon houdt haar maand als tegoed. Buiten een actie
-- blijft alles zoals het was (14 dagen proef + 14 dagen tegoed voor beide).

alter table public.referral_redemptions
  add column new_salon_trial_days integer check (new_salon_trial_days between 1 and 90);
comment on column public.referral_redemptions.new_salon_trial_days is 'Gezet tijdens een actie: de proefperiode van de nieuwe salon in dagen (vervangt de 14 dagen; zij krijgt dan geen tegoed erbovenop). start-trial leest dit.';

create or replace function public.redeem_referral_code(p_new_profile_id uuid, p_code text)
returns table(success boolean, referrer_name text, referrer_id uuid)
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_referrer_id uuid;
  v_referrer_name text;
  v_clean_code text;
  v_reward_days integer := 14;
  v_promo_id uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_new_profile_id
     AND current_setting('role') NOT IN ('service_role','postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_clean_code := upper(btrim(p_code));
  SELECT id, business_name INTO v_referrer_id, v_referrer_name
  FROM profiles WHERE referral_code = v_clean_code;

  IF v_referrer_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_referrer_id = p_new_profile_id THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS(SELECT 1 FROM profiles WHERE id = p_new_profile_id AND referred_by IS NOT NULL) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  -- Lopende actie? Dan die beloning, anders de vaste 14 dagen.
  SELECT p.id, p.reward_days INTO v_promo_id, v_reward_days
  FROM referral_promos p
  WHERE now() BETWEEN p.starts_at AND p.ends_at
  ORDER BY p.reward_days DESC, p.ends_at DESC
  LIMIT 1;
  IF v_reward_days IS NULL THEN v_reward_days := 14; END IF;

  IF v_promo_id IS NOT NULL THEN
    -- Actie: de gratis periode van de nieuwe salon is haar proef (zie
    -- start-trial), geen tegoed erbovenop. Loopt haar proef al, dan wordt die
    -- verlengd tot de actieduur vanaf het begin van de proef.
    UPDATE profiles
      SET referred_by = v_referrer_id,
          trial_ends_at = CASE WHEN subscription_status = 'trialing' AND current_period_start IS NOT NULL
                               THEN GREATEST(trial_ends_at, current_period_start + make_interval(days => v_reward_days))
                               ELSE trial_ends_at END,
          plan_expires_at = CASE WHEN subscription_status = 'trialing' AND current_period_start IS NOT NULL
                                 THEN GREATEST(plan_expires_at, current_period_start + make_interval(days => v_reward_days))
                                 ELSE plan_expires_at END
      WHERE id = p_new_profile_id;
  ELSE
    UPDATE profiles
      SET referred_by = v_referrer_id,
          referral_credit_days = COALESCE(referral_credit_days, 0) + v_reward_days
      WHERE id = p_new_profile_id;
  END IF;

  UPDATE profiles
    SET referral_credit_days = COALESCE(referral_credit_days, 0) + v_reward_days
    WHERE id = v_referrer_id;

  INSERT INTO referral_redemptions (new_profile_id, referrer_id, reward_days, promo_id, new_salon_trial_days)
  VALUES (p_new_profile_id, v_referrer_id, v_reward_days, v_promo_id, CASE WHEN v_promo_id IS NOT NULL THEN v_reward_days END)
  ON CONFLICT (new_profile_id) DO NOTHING;

  RETURN QUERY SELECT true, v_referrer_name, v_referrer_id;
END;
$function$;

-- Hoe lang is de proef van de ingelogde eigenaar? 14, of de actieduur als zij
-- via een actie-uitnodiging binnenkwam. Voor de tekst op het plan-scherm.
create or replace function public.my_trial_days()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select r.new_salon_trial_days from public.referral_redemptions r where r.new_profile_id = auth.uid()), 14);
$$;
grant execute on function public.my_trial_days() to authenticated;
