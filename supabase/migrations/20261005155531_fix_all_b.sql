-- Fix-all audit 05-10-2026: DB.sql deel B (na de deploy van frontend en edge functions).
-- Samengesteld uit supabase/migrations/pending/*.sql (zie de commitgeschiedenis).
set local lock_timeout = '10s';

-- @@ DEEL B: NA DEPLOY @@
-- ════════════════════════════════════════════════════════════════════════════
-- Alles hieronder pas toepassen NA de deploy van de edge functions (E1, E2,
-- E3) en de frontend (AP, C1, C2, S, O1-O8, SH), als aparte migratie. Elk
-- stuk laat een aanroeper die nu live staat falen of verkeerd schrijven.

-- ── B1. products: anonieme leespolicy weg (sectie 1) ────────────────────────
-- Nodig: AP (App.jsx leest public_products). De eigenaar houdt "Owner manages
-- own products".
drop policy if exists "Public can read active products" on public.products;

-- ── B2. clients: niet meer schrijven vanuit de browser (sectie 2) ───────────
-- Nodig: O2/O8 (verjaardag naar manual_clients), O3 (no-show via
-- increment_no_show_count).
drop policy if exists clients_update_visited_salon on public.clients;
revoke update, delete, truncate on public.clients from anon, authenticated;

-- ── B3. staff-app: bedragen echt weg bij omzet uit (sectie 3) ───────────────
-- Nodig: S (rekent bij omzet uit met pay_state en betaalt via
-- staff_complete_appointment / staff_mark_prepaid). De staff-app die nu live
-- staat, zou zonder service_price amount_paid = 0 wegschrijven.
create or replace function public.staff_hide_money(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select (p_row - array['service_price', 'amount_paid', 'cash_received',
                        'discount_amount', 'no_show_fee', 'tax_snapshot'])
         || jsonb_build_object(
              'products',
                case when jsonb_typeof(p_row -> 'products') = 'array' then
                  (select coalesce(jsonb_agg(case when jsonb_typeof(x.v) = 'object' then x.v - 'price' else x.v end
                                             order by x.o), '[]'::jsonb)
                     from jsonb_array_elements(p_row -> 'products') with ordinality as x(v, o))
                else p_row -> 'products' end,
              'service_breakdown',
                case when jsonb_typeof(p_row -> 'service_breakdown') = 'array' then
                  (select coalesce(jsonb_agg(case when jsonb_typeof(x.v) = 'object' then x.v - 'price' else x.v end
                                             order by x.o), '[]'::jsonb)
                     from jsonb_array_elements(p_row -> 'service_breakdown') with ordinality as x(v, o))
                else p_row -> 'service_breakdown' end,
              'pay_state', public.staff_pay_state(p_row))
$$;

revoke all on function public.staff_hide_money(jsonb) from public, anon, authenticated;

-- ── B4. staff: geen salonprofiel- en collegarijen meer (sectie 5) ───────────
-- Nodig: AP (App.jsx laadt het salonprofiel via staff_salon_profile()) en S
-- (rooster uit public_staff). Zonder die deploy kan een medewerker niet
-- inloggen. my_staff_owner_ids() blijft (staff_read_salon_services,
-- client_no_shows e.d.).
drop policy if exists staff_read_salon_profile on public.profiles;
drop policy if exists staff_read_colleagues on public.staff_members;

-- ── B5. teamlid-uitnodiging: e-mailclaim weg (sectie 7) ─────────────────────
-- Nodig: AP (claimt alleen met de gemailde token via claim_staff_invite en
-- geeft bij aanmelden options.data.staff_invite mee), E3 (create-staff-account
-- maakt de token en zet user_metadata.staff_invite bij "Login aanmaken"), E2
-- (mail staff_invite).
--
-- Guard van 05-10 (20261005105459), aangepast: de claimtak op e-mail is weg en
-- de uitnodigingskolommen schrijft alleen de server. Eén koppeling mag de
-- browser nog: de eigenaar zet zichzelf op een ongekoppelde rij van haar eigen
-- salon (wat de oude e-mailclaim bij TTNB en Honeysets deed). Daar hangen de
-- eigenaarsbadge en de volgorde op de boekingspagina aan (public_staff.is_owner).
-- Hooguit één zo'n rij per salon (App.jsx zoekt de rij op user_id). Verder
-- ongewijzigd.
create or replace function public.staff_members_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  -- Wat een medewerker op haar EIGEN rij mag wijzigen.
  v_staff_editable text[] := array[
    'working_hours', 'calendar_feed_token', 'address', 'kvk_number', 'btw_id',
    'iban', 'iban_holder', 'payment_link', 'invoice_prefix', 'next_invoice_number'
  ];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_uid is null or new.owner_id is distinct from v_uid then
      raise exception 'staff_members: je kunt alleen medewerkers aan je eigen salon toevoegen'
        using errcode = '42501';
    end if;
    -- Alleen jezelf (eigenaar op het eigen rooster); een ander koppelen gaat
    -- via de uitnodiging.
    if new.user_id is not null and new.user_id is distinct from v_uid then
      raise exception 'staff_members: een login koppelen gaat alleen via de uitnodiging'
        using errcode = '42501';
    end if;
    if new.user_id is not null
       and exists (select 1 from public.staff_members s where s.owner_id = v_uid and s.user_id = v_uid) then
      raise exception 'staff_members: je staat al op je eigen rooster'
        using errcode = '42501';
    end if;
    if new.invite_token_hash is not null or new.invite_expires_at is not null then
      raise exception 'staff_members: uitnodigingen maakt alleen Vellu aan'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id
     or new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at then
    raise exception 'staff_members: id, owner_id en created_at kunnen niet worden gewijzigd'
      using errcode = '42501';
  end if;

  -- Koppelen gaat via claim_staff_invite() of create-staff-account; de
  -- browser mag alleen de eigenaar aan haar eigen rij koppelen.
  if new.user_id is distinct from old.user_id then
    if not (old.user_id is null
            and v_uid is not null
            and new.user_id = v_uid
            and old.owner_id = v_uid
            and not exists (select 1 from public.staff_members s
                             where s.owner_id = v_uid and s.user_id = v_uid and s.id <> old.id)) then
      raise exception 'staff_members: een login koppelen gaat alleen via de uitnodiging'
        using errcode = '42501';
    end if;
  end if;

  if new.invite_token_hash is distinct from old.invite_token_hash
     or new.invite_expires_at is distinct from old.invite_expires_at then
    raise exception 'staff_members: uitnodigingen maakt alleen Vellu aan'
      using errcode = '42501';
  end if;

  -- Een uitnodiging hoort bij één adres en een actief teamlid: verandert het
  -- e-mailadres of zet de eigenaar haar op inactief, dan vervalt de link (O7-07).
  if new.email is distinct from old.email or new.active is false then
    new.invite_token_hash := null;
    new.invite_expires_at := null;
  end if;

  -- De eigenaar (ook op haar eigen medewerker-rij, user_id = owner_id).
  if v_uid is not distinct from old.owner_id then
    return new;
  end if;

  -- Medewerker op haar eigen rij.
  new.next_invoice_number := old.next_invoice_number;
  if (to_jsonb(new) - v_staff_editable) is distinct from (to_jsonb(old) - v_staff_editable) then
    raise exception 'staff_members: naam, rol, e-mail, bio, foto, actief en volgorde wijzigt alleen de eigenaar'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.staff_members_guard() from public, anon, authenticated;

drop policy if exists staff_claim_invite_select on public.staff_members;
drop policy if exists staff_claim_invite_update on public.staff_members;

-- Geen eigen salonprofiel voor een teamlid: aanmelden via de uitnodiging
-- (options.data.staff_invite) of een login die de eigenaar aanmaakte
-- (create-staff-account zet user_metadata.staff_invite). De oude overslag op
-- "er staat een rij met mijn e-mailadres" is weg: daarmee kon een eigenaar
-- andermans adres op een rij zetten en diens salonprofiel blokkeren.
-- Een gereserveerde slug (/admin, /contact, ...) uit de aanmeldgegevens krijgt
-- een staart: deze functie draait als postgres en valt dus niet onder de
-- profiles-guard.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_slug text;
BEGIN
  IF coalesce(NEW.raw_user_meta_data ->> 'staff_invite', '') = 'true'
     OR EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_slug := COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email, '@', 1));
  IF public.slug_is_reserved(v_slug) THEN
    v_slug := btrim(v_slug) || '-' || left(replace(NEW.id::text, '-', ''), 4);
  END IF;

  INSERT INTO public.profiles (id, email, business_name, slug, city)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'business_name', 'Mijn Salon'),
    v_slug,
    COALESCE(NEW.raw_user_meta_data->>'city', 'Nederland')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── B6. verwijzingen: tegoed voor de verwijzer pas na de eerste betaling ─────
--        (sectie 8)
-- Nodig: E3 (mollie-webhook roept grant_referral_credit() aan na first.paid /
-- oneoff.paid). Zonder die deploy krijgt een verwijzer niets als de nieuwe
-- salon in de tussentijd betaalt.
-- Zelfde handtekening en antwoord (LandingScreen). Nieuw: geen demo-salon als
-- verwijzer, alleen een vers account (< 2 uur), eerst de inwisselrij (één per
-- nieuwe salon, ook bij gelijktijdige aanroepen) en daarna alleen de beloning
-- van de NIEUWE salon. De verwijzer krijgt haar dagen via
-- grant_referral_credit() zodra mollie-webhook de eerste betaling ziet.
alter table public.referral_redemptions
  alter column referrer_credited_at drop default;

create or replace function public.redeem_referral_code(p_new_profile_id uuid, p_code text)
returns table(success boolean, referrer_name text, referrer_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_referrer_id uuid;
  v_referrer_name text;
  v_referrer_demo boolean;
  v_clean_code text;
  v_reward_days integer := 14;
  v_promo_id uuid;
  v_new_created timestamptz;
  v_new_referred_by uuid;
  v_inserted uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_new_profile_id
     AND current_setting('role') NOT IN ('service_role','postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_clean_code := upper(btrim(coalesce(p_code, '')));
  SELECT id, business_name, coalesce(is_demo, false)
    INTO v_referrer_id, v_referrer_name, v_referrer_demo
    FROM profiles WHERE referral_code = v_clean_code;

  IF v_referrer_id IS NULL OR v_referrer_id = p_new_profile_id OR v_referrer_demo THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  -- Alleen een nieuw account: het oudste van profiel en login telt.
  SELECT least(p.created_at, u.created_at), p.referred_by
    INTO v_new_created, v_new_referred_by
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
   WHERE p.id = p_new_profile_id;
  IF NOT FOUND OR v_new_referred_by IS NOT NULL
     OR v_new_created IS NULL OR v_new_created < now() - interval '2 hours' THEN
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

  -- Eerst de inwisselrij: wie hem niet kan aanmaken (al ingewisseld, ook
  -- gelijktijdig), krijgt niets. referrer_credited_at blijft leeg tot
  -- grant_referral_credit().
  INSERT INTO referral_redemptions (new_profile_id, referrer_id, reward_days, promo_id, new_salon_trial_days, referrer_credited_at)
  VALUES (p_new_profile_id, v_referrer_id, v_reward_days, v_promo_id, CASE WHEN v_promo_id IS NOT NULL THEN v_reward_days END, NULL)
  ON CONFLICT (new_profile_id) DO NOTHING
  RETURNING new_profile_id INTO v_inserted;
  IF v_inserted IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

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

  RETURN QUERY SELECT true, v_referrer_name, v_referrer_id;
END;
$function$;

-- ── B7. wachtlijst: geen anonieme insert meer (sectie 9) ────────────────────
-- Nodig: C1 (boekingspagina roept waitlist-notify aan) en E1 (waitlist-notify
-- voegt zelf in).
drop policy if exists waitlist_public_insert on public.waitlist;
revoke insert on public.waitlist from anon, authenticated;

-- ── B8. blokkades van teamleden niet meer publiek (sectie 11) ───────────────
-- Nodig: AP (App.jsx leest public_staff_day_overrides).
drop policy if exists "Public can read staff day overrides" on public.staff_day_overrides;
