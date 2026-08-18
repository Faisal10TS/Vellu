-- 2026-08-18 — Twee punten uit de Supabase-adviseur opgeruimd
--
-- 1. ADMIN-FUNCTIES WAREN AANROEPBAAR ZONDER IN TE LOGGEN
-- De zeven admin_*-functies stonden op EXECUTE voor anon. Ze zijn niet
-- kwetsbaar — elke functie begint met `IF NOT is_admin() THEN RAISE EXCEPTION
-- 'forbidden'` en is_admin() geeft voor een niet-ingelogde bezoeker false — maar
-- er is geen enkele reden dat ze vanaf /rest/v1/rpc/... bereikbaar zijn zonder
-- sessie. Eén laag verdediging is er één te weinig als die laag ooit per ongeluk
-- uit een functie verdwijnt.
--
-- authenticated houdt EXECUTE: het admin-dashboard draait op een ingelogde
-- gebruiker en leunt daarna op is_admin() voor de echte toegangscontrole.

revoke execute on function public.admin_overview()               from anon, public;
revoke execute on function public.admin_salons_list()            from anon, public;
revoke execute on function public.admin_recent_signups(integer)  from anon, public;
revoke execute on function public.admin_revenue_timeline(integer) from anon, public;
revoke execute on function public.admin_cron_summary()           from anon, public;
revoke execute on function public.admin_billing_overview()       from anon, public;
revoke execute on function public.admin_subscriptions_list()     from anon, public;

grant execute on function public.admin_overview()                to authenticated;
grant execute on function public.admin_salons_list()             to authenticated;
grant execute on function public.admin_recent_signups(integer)   to authenticated;
grant execute on function public.admin_revenue_timeline(integer) to authenticated;
grant execute on function public.admin_cron_summary()            to authenticated;
grant execute on function public.admin_billing_overview()        to authenticated;
grant execute on function public.admin_subscriptions_list()      to authenticated;

-- 2. SEARCH_PATH VASTZETTEN OP DE TWEE REFERRAL-FUNCTIES
-- Beide hadden een veranderlijk search_path. Ze zijn geen SECURITY DEFINER, dus
-- het risico is klein, maar ze draaien wel bij ELKE profielaanmaak (via de
-- BEFORE INSERT-trigger op profiles). Een vastgezet pad sluit uit dat een
-- afwijkend search_path ooit een andere `profiles` laat vinden dan bedoeld.
-- Verder identiek aan wat er stond.

create or replace function public.generate_referral_code()
 returns text
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  attempts int := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM profiles WHERE referral_code = code) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique referral code';
    END IF;
  END LOOP;
END;
$function$;

create or replace function public.set_referral_code()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$function$;

-- BEWUST NIET AANGERAAKT, met reden:
--
-- * handle_new_user() en tg_appointments_count_no_show() staan ook op EXECUTE
--   voor anon. Dat zijn triggerfuncties: rechtstreeks aanroepen via RPC geeft
--   meteen "trigger functions can only be called as trigger triggers", dus er
--   valt niets mee te doen. Het recht intrekken raakt het pad waarlangs een
--   nieuwe gebruiker zijn profiel krijgt, en dat risico is niet in verhouding
--   tot een waarschuwing zonder gevolg.
--
-- * De drie ERROR-meldingen over "security definer view" op public_salons,
--   public_staff en public_reviews zijn opzet, geen fout. Die views draaien
--   juist als eigenaar zodat de publieke salonpagina's kunnen lezen zonder dat
--   profiles en staff_members zelf open hoeven. Het echte risico daarin — dat
--   anon er doorheen kon SCHRIJVEN — is gedicht in 20260818121729.
--
-- * pg_net staat in het public-schema. Verplaatsen breekt de pg_cron-jobs die
--   er via net.http_post op leunen. Laten staan.
--
-- * Zes tabellen hebben RLS aan zonder policy (birthday_email_log,
--   client_tokens, cron_health, public_chat_usage, review_tokens,
--   salon_digest_log). Dat is de bedoeling: alleen de service_role komt erbij,
--   en RLS zonder policy weigert standaard iedereen.
