-- 2026-08-18 — Drie SECURITY DEFINER-functies vroegen nooit wie er belde
--
-- Alle drie stonden op EXECUTE voor anon én PUBLIC, draaiden met de rechten
-- van de eigenaar (dus langs RLS heen) en bevatten geen enkele controle op
-- auth.uid(). Iedereen met de anon-sleutel — die in de frontend-bundel staat —
-- kon ze aanroepen. De profiel-UUID's die ze als parameter vragen zijn niet
-- geheim: public_salons deelt ze publiek uit.
--
-- 1. redeem_referral_code — de ernstigste, hier hangt geld aan.
--    Iemand kon het id van een willekeurig salon pakken en daarvoor zíjn eigen
--    referral-code inwisselen: 14 gratis dagen naar de aanvaller, en de
--    eenmalige referral-plek van dat salon voorgoed opgebrand (referred_by is
--    daarna niet meer leeg, dus de echte referral wordt later geweigerd).
--    Herhaalbaar voor elk salon in de directory.
-- 2. get_next_invoice_number — hoogt profiles.next_invoice_number op voor een
--    meegegeven owner_id. Iedereen kon de factuurnummering van elke salon
--    vooruit schoppen; gaten in een factuurreeks zijn boekhoudkundig geen
--    detail. De functie heeft nul aanroepers in de hele repo (nummering loopt
--    client-side via profiles.next_invoice_number), maar bestond wel.
-- 3. increment_no_show_count — hoogt clients.no_show_count op voor een
--    meegegeven client-id, zonder te vragen wie belt.
--
-- WAT DE CONTROLE WORDT, en waarom die het bestaande gebruik niet breekt:
--   redeem_referral_code krijgt auth.uid() = p_new_profile_id. Dat is precies
--   wat de app doet: src/LandingScreen.jsx roept hem aan direct na signUp, en
--   de profiles.upsert één regel daarvoor slaagt alleen als de gebruiker op dat
--   moment al is ingelogd (RLS op profiles eist auth.uid() = id). Was de
--   gebruiker niet ingelogd, dan was de registratie al eerder gestrand.
--   get_next_invoice_number krijgt auth.uid() = owner_id_param, zelfde vorm als
--   next_receipt_number.
--   increment_no_show_count kan geen eigenaarscontrole krijgen: clients is een
--   globale tabel zonder owner-kolom, dus er valt niet vast te stellen van wie
--   die klant is. Wat hier wél kan is eisen dat er überhaupt iemand is
--   ingelogd; dat sluit anonieme aanroepen. De aanroeper is de ingelogde
--   eigenaar (src/OwnerApp.jsx, regel ~4658, in de no-show-knop), dus dit
--   breekt niets. Dat élke ingelogde eigenaar de teller van élke klant kan
--   ophogen blijft staan — dat is niet met een check op te lossen maar met een
--   eigenaar-kolom, en die keuze hoort bij de bredere vraag of clients per
--   salon moet worden opgesplitst.
--
-- service_role blijft er in alle drie langs kunnen: cron- en edge-functies
-- draaien zonder auth.uid() en zouden anders stuklopen.

-- ---------------------------------------------------------------- 1
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
  v_reward_days constant integer := 14;
BEGIN
  -- Je mag alleen een code inwisselen voor je EIGEN, zojuist gemaakte profiel.
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

revoke execute on function public.redeem_referral_code(uuid, text) from anon, public;
grant  execute on function public.redeem_referral_code(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 2
create or replace function public.get_next_invoice_number(owner_id_param uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM owner_id_param
     AND current_setting('role') NOT IN ('service_role','postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE profiles
     SET next_invoice_number = COALESCE(next_invoice_number, 1) + 1
   WHERE id = owner_id_param
  RETURNING next_invoice_number - 1 INTO n;

  RETURN COALESCE(n, 1);
END;
$function$;

revoke execute on function public.get_next_invoice_number(uuid) from anon, public;
grant  execute on function public.get_next_invoice_number(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 3
create or replace function public.increment_no_show_count(client_id_param uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  -- Geen eigenaarscontrole mogelijk (clients heeft geen owner-kolom); wel de
  -- eis dat er iemand is ingelogd, zodat anonieme aanroepen wegvallen.
  IF auth.uid() IS NULL
     AND current_setting('role') NOT IN ('service_role','postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE clients
     SET no_show_count = COALESCE(no_show_count, 0) + 1
   WHERE id = client_id_param;
END;
$function$;

revoke execute on function public.increment_no_show_count(uuid) from anon, public;
grant  execute on function public.increment_no_show_count(uuid) to authenticated, service_role;

-- Opruimen van de vorige ronde: next_receipt_number had zijn eigen
-- auth.uid()-controle al, maar stond nog wel op EXECUTE voor anon. De functie
-- weigerde zo'n aanroep netjes met 'forbidden'; het recht hoort er niet te
-- staan.
revoke execute on function public.next_receipt_number(uuid) from anon, public;
