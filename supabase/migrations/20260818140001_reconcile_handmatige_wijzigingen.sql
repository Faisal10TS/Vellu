-- VERZOENING — alles wat in productie bestaat maar nooit in een migratie stond
--
-- WAAROM DIT BESTAND ER IS
-- Naast het ontbrekende fundament (zie 20260101000000_baseline_pre_ledger_schema)
-- bleek er nog een tweede categorie: dingen die ná 11 maart 2026 met een losse
-- query zijn aangebracht in plaats van via een migratie. Die staan dus wél in
-- productie maar in geen enkel bestand, en zouden bij een herbouw ontbreken.
--
-- Waarom achteraan de reeks en niet in de basis: elk onderdeel hieronder hangt
-- af van iets dat een tussenliggende migratie aanmaakt. De auth-trigger heeft
-- handle_new_user() nodig (20260407191755, bijgewerkt in 20260705085304), de
-- foreign key van client_tokens heeft public.clients nodig (20260311134513),
-- en de admin-functies lezen tabellen en kolommen die pas later ontstaan.
--
-- ALLES IS HERHAALBAAR: create or replace, if not exists, drop-then-create.
-- Deze migratie mag daarom wél gewoon op productie draaien — hij verandert
-- daar niets, want alles staat er al precies zo in.

-- ==================================================== 1. DE AUTH-TRIGGER
-- Verreweg het belangrijkste onderdeel van dit bestand.
--
-- handle_new_user() zelf wordt door migraties aangemaakt, maar de TRIGGER die
-- hem afvuurt bestond alleen in productie. Zonder deze trigger krijgt een
-- nieuwe gebruiker na registratie geen profiel — dan logt iemand in en vindt
-- de app niets. Een herbouwde database zou er volledig werkend uitzien en pas
-- bij de eerste nieuwe aanmelding stukgaan.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==================================== 2. REFERRAL-CODE BIJ NIEUW PROFIEL
-- Twee functies plus de trigger die ze aan elkaar knoopt. Zonder dit krijgt
-- geen enkel nieuw salon een referral-code, en werkt het hele
-- doorverwijsprogramma niet meer.

create or replace function public.generate_referral_code()
 returns text
 language plpgsql
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
    -- Check uniqueness
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
as $function$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$function$;

drop trigger if exists profiles_set_referral_code on public.profiles;
create trigger profiles_set_referral_code
  before insert on public.profiles
  for each row execute function public.set_referral_code();

-- ========================================== 3. ADMIN-DASHBOARD-FUNCTIES
-- Migratie 20260726145555_admin_billing_rpcs maakt admin_billing_overview en
-- admin_subscriptions_list. Deze zes — de poortwachter is_admin() en vijf
-- rapportagefuncties — zijn er destijds met de hand naast gezet. Zonder
-- is_admin() werkt geen van de andere admin-functies, ook de wél gemigreerde
-- niet: die beginnen allemaal met `IF NOT is_admin() THEN RAISE EXCEPTION`.

create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  SELECT EXISTS(SELECT 1 FROM app_admins WHERE user_id = auth.uid());
$function$;

create or replace function public.admin_overview()
 returns table(total_salons integer, paid_salons integer, salons_last_7d integer, total_appointments integer, appointments_last_30d integer, total_revenue_eur numeric, revenue_last_30d_eur numeric, total_staff integer, total_clients integer, avg_appointments_per_salon numeric)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::int FROM profiles),
    (SELECT COUNT(*)::int FROM profiles WHERE plan IS NOT NULL),
    (SELECT COUNT(*)::int FROM profiles WHERE created_at > now() - interval '7 days'),
    (SELECT COUNT(*)::int FROM appointments),
    (SELECT COUNT(*)::int FROM appointments WHERE created_at > now() - interval '30 days'),
    (SELECT COALESCE(SUM(service_price), 0) FROM appointments WHERE status = 'completed'),
    (SELECT COALESCE(SUM(service_price), 0) FROM appointments WHERE status = 'completed' AND date > CURRENT_DATE - interval '30 days'),
    (SELECT COUNT(*)::int FROM staff_members),
    (SELECT COUNT(*)::int FROM clients),
    (SELECT ROUND(AVG(cnt), 1) FROM (SELECT COUNT(*) AS cnt FROM appointments GROUP BY owner_id) q);
END;
$function$;

create or replace function public.admin_salons_list()
 returns table(id uuid, slug text, business_name text, email text, city text, plan text, plan_expires_at timestamp with time zone, created_at timestamp with time zone, staff_count integer, appt_count integer, completed_count integer, upcoming_count integer, total_revenue numeric, last_activity timestamp with time zone, google_connected boolean, referred_by uuid, referral_code text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    p.id, p.slug, p.business_name, p.email, p.city,
    p.plan, p.plan_expires_at, p.created_at,
    (SELECT COUNT(*)::int FROM staff_members WHERE owner_id = p.id),
    (SELECT COUNT(*)::int FROM appointments WHERE owner_id = p.id),
    (SELECT COUNT(*)::int FROM appointments WHERE owner_id = p.id AND status = 'completed'),
    (SELECT COUNT(*)::int FROM appointments WHERE owner_id = p.id AND status = 'confirmed' AND date >= CURRENT_DATE),
    (SELECT COALESCE(SUM(service_price), 0) FROM appointments WHERE owner_id = p.id AND status = 'completed'),
    (SELECT MAX(created_at) FROM appointments WHERE owner_id = p.id),
    COALESCE(p.google_calendar_connected, false),
    p.referred_by, p.referral_code
  FROM profiles p
  ORDER BY p.created_at DESC;
END;
$function$;

create or replace function public.admin_recent_signups(p_days integer default 30)
 returns table(id uuid, slug text, business_name text, email text, city text, plan text, referred_by_name text, created_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    p.id, p.slug, p.business_name, p.email, p.city,
    p.plan,
    (SELECT business_name FROM profiles WHERE id = p.referred_by),
    p.created_at
  FROM profiles p
  WHERE p.created_at > now() - (p_days || ' days')::interval
  ORDER BY p.created_at DESC;
END;
$function$;

create or replace function public.admin_revenue_timeline(p_days integer default 30)
 returns table(day date, revenue numeric, appointments integer)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    a.date::date,
    COALESCE(SUM(a.service_price) FILTER (WHERE a.status = 'completed'), 0),
    COUNT(*)::int
  FROM appointments a
  WHERE a.date > CURRENT_DATE - (p_days || ' days')::interval
  GROUP BY a.date::date
  ORDER BY a.date::date;
END;
$function$;

create or replace function public.admin_cron_summary()
 returns table(job_name text, last_ran_at timestamp with time zone, last_status text, last_error text, runs_last_7d integer, errors_last_7d integer, total_items_processed_7d integer)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    ch.job_name,
    MAX(ch.ran_at) AS last_ran_at,
    (SELECT status FROM cron_health WHERE job_name = ch.job_name ORDER BY ran_at DESC LIMIT 1),
    (SELECT error_message FROM cron_health WHERE job_name = ch.job_name ORDER BY ran_at DESC LIMIT 1),
    COUNT(*)::int AS runs_last_7d,
    COUNT(*) FILTER (WHERE ch.status = 'error')::int AS errors_last_7d,
    COALESCE(SUM(ch.items_processed), 0)::int AS total_items_processed_7d
  FROM cron_health ch
  WHERE ch.ran_at > now() - interval '7 days'
  GROUP BY ch.job_name
  ORDER BY ch.job_name;
END;
$function$;

-- ================================================ 4. get_booked_slots
-- De boekingspagina vraagt hiermee op welke tijden al bezet zijn. Migratie
-- 20260715121731 maakt get_booked_slots_RANGE — een andere functie. Deze
-- enkele-dag-variant stond alleen in productie.

create or replace function public.get_booked_slots(p_slug text, p_date date, p_location_id uuid default null::uuid)
 returns table("time" text, service_duration integer, staff_id uuid)
 language sql
 security definer
 set search_path to 'public'
as $function$
  SELECT a.time, a.service_duration, a.staff_id
  FROM appointments a
  JOIN profiles p ON p.id = a.owner_id
  WHERE p.slug = p_slug
    AND a.date = p_date
    -- Include rows with NULL location_id regardless of what the client asked for.
    -- Legacy/imported appointments often have no location set but still occupy the
    -- calendar; excluding them makes the client show slots as free that the server
    -- then rejects with slot_conflict.
    AND (p_location_id IS NULL OR a.location_id IS NULL OR a.location_id = p_location_id)
    AND a.status IN ('confirmed', 'completed');
$function$;

-- ========================================= 5. DE UITGESTELDE FOREIGN KEY
-- Kon niet in de basis staan omdat public.clients pas door migratie
-- 20260311134513 wordt aangemaakt.

do $$ begin
  alter table public.client_tokens
    add constraint client_tokens_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete cascade;
exception when duplicate_table or duplicate_object then null;
end $$;

-- ================================================== 6. STORAGE-POLICIES
-- Vier policies op storage.objects die nooit in een migratie stonden. Zonder
-- deze kan niemand meer een dienstfoto uploaden of verwijderen.
-- LET OP: de drie buckets zelf (business-images en service-photos publiek,
-- db-backups PRIVE) maakt dit bestand niet aan — zie de aantekening onderaan.

drop policy if exists "Owner can upload photos" on storage.objects;
create policy "Owner can upload photos" on storage.objects
  for insert to public
  with check (((bucket_id = 'service-photos'::text) and (auth.uid() is not null)));

drop policy if exists "Owner can delete photos" on storage.objects;
create policy "Owner can delete photos" on storage.objects
  for delete to public
  using (((bucket_id = 'service-photos'::text) and (auth.uid() is not null)));

drop policy if exists auth_upload_service_photos on storage.objects;
create policy auth_upload_service_photos on storage.objects
  for insert to public
  with check ((bucket_id = 'service-photos'::text));

drop policy if exists auth_delete_service_photos on storage.objects;
create policy auth_delete_service_photos on storage.objects
  for delete to public
  using ((bucket_id = 'service-photos'::text));

-- ============================================================ 7. EXTENSIES

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ==================================================================
-- WAT DIT BESTAND BEWUST NIET DOET, en wat je na een herbouw met de hand
-- moet terugzetten. Dit hoort niet in een migratie thuis omdat er geheimen
-- in zitten of omdat het buiten Postgres om gaat.
--
-- A. STORAGE-BUCKETS (3). Aanmaken via het Supabase-dashboard of de storage-API:
--      business-images   publiek
--      service-photos    publiek
--      db-backups        PRIVE — hier staan klantgegevens en tokens in.
--                        Deze mag nooit op publiek komen te staan.
--
-- B. PG_CRON-JOBS (5). Elke job doet een net.http_post naar een edge function
--    met een Authorization-header. Die header bevat de anon-sleutel van het
--    project, en die hoort niet in de repo. Terugzetten met dit patroon,
--    waarbij <ANON_KEY> uit het Supabase-dashboard komt:
--
--      select cron.schedule('send-daily-reminders', '0 * * * *', $job$
--        select net.http_post(
--          url := 'https://<PROJECT>.supabase.co/functions/v1/send-reminders',
--          headers := '{"Content-Type": "application/json",
--                       "Authorization": "Bearer <ANON_KEY>"}'::jsonb,
--          body := '{}'::jsonb);
--      $job$);
--
--    De vijf jobs en hun schema's:
--      send-daily-reminders     0 * * * *    (ieder uur; de functie bepaalt zelf
--                                            per salon of het tijd is)
--      send-daily-followups     30 10 * * *
--      send-daily-rebook-nudge  0 11 * * *
--      db-backup-daily          0 3 * * *
--      cron-watchdog-daily      0 12 * * *
--
-- C. EDGE FUNCTIONS. Staan in supabase/functions/, met hun verify_jwt in
--    supabase/config.toml. Deployen met de Supabase CLI.
--
-- D. SECRETS: RESEND_API_KEY, CRON_SECRET, ANTHROPIC_API_KEY, ADMIN_ALERT_EMAIL,
--    de Mollie-sleutels en SUPABASE_SERVICE_ROLE_KEY.
