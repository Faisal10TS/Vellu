-- Referral-actie (Faisal 21-09-2026): twee weken lang krijgen de uitnodigende
-- salon én de nieuwe salon 1 maand gratis in plaats van 2 weken. De beloning
-- wordt (net als altijd) bij het aanmelden bijgeschreven in
-- profiles.referral_credit_days en door mollie-webhook verzilverd bij een
-- betaling. Acties staan als rijen in referral_promos, zodat een volgende
-- actie geen codewijziging vraagt: redeem_referral_code pakt de actie die op
-- dat moment loopt, anders de vaste 14 dagen.

create table public.referral_promos (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reward_days integer not null check (reward_days between 1 and 90),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
comment on table public.referral_promos is 'Tijdelijke referral-acties: binnen starts_at..ends_at geldt reward_days (voor beide kanten) in plaats van de vaste 14 dagen.';
alter table public.referral_promos enable row level security;
revoke all on public.referral_promos from anon, authenticated;

insert into public.referral_promos (name, starts_at, ends_at, reward_days)
values ('1 maand gratis voor beide (21-09 t/m 05-10-2026)', '2026-09-21 00:00:00+02', '2026-10-05 23:59:59+02', 30);

-- Logboek per verzilvering: wie nodigde wie uit, hoeveel dagen, welke actie.
create table public.referral_redemptions (
  new_profile_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_id    uuid not null references public.profiles(id) on delete cascade,
  reward_days    integer not null,
  promo_id       uuid references public.referral_promos(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.referral_redemptions is 'Eén rij per verzilverde uitnodigingscode: beloning in dagen (voor beide kanten) en de actie die toen liep.';
create index referral_redemptions_referrer_idx on public.referral_redemptions (referrer_id);
create index referral_redemptions_promo_idx on public.referral_redemptions (promo_id);
alter table public.referral_redemptions enable row level security;
revoke all on public.referral_redemptions from anon, authenticated;

-- Publiek leesbaar: loopt er een actie, hoeveel dagen en tot wanneer. Voor
-- de actiekaart in de app, de homepage en het aanmeldscherm.
create or replace function public.active_referral_promo()
returns table(reward_days integer, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.reward_days, p.starts_at, p.ends_at
  from public.referral_promos p
  where now() between p.starts_at and p.ends_at
  order by p.reward_days desc, p.ends_at desc
  limit 1;
$$;
grant execute on function public.active_referral_promo() to anon, authenticated;

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

  UPDATE profiles
    SET referred_by = v_referrer_id,
        referral_credit_days = COALESCE(referral_credit_days, 0) + v_reward_days
    WHERE id = p_new_profile_id;

  UPDATE profiles
    SET referral_credit_days = COALESCE(referral_credit_days, 0) + v_reward_days
    WHERE id = v_referrer_id;

  INSERT INTO referral_redemptions (new_profile_id, referrer_id, reward_days, promo_id)
  VALUES (p_new_profile_id, v_referrer_id, v_reward_days, v_promo_id)
  ON CONFLICT (new_profile_id) DO NOTHING;

  RETURN QUERY SELECT true, v_referrer_name, v_referrer_id;
END;
$function$;
