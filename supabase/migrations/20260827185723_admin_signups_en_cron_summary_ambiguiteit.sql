-- Zelfde 42702-familie als admin_salons_list (zie 20260827185236): de
-- Signups-tab ("No signups yet" terwijl Brilliant Beauty dezelfde dag
-- tekende) en de Cron Health-tab gooiden "column reference is ambiguous" —
-- ongekwalificeerde kolommen in subqueries botsten met gelijknamige
-- RETURNS TABLE-parameters (business_name/id resp. job_name/status/…), en de
-- frontend toont een RPC-fout als lege lijst. Alles gealiast; verder identiek.

CREATE OR REPLACE FUNCTION public.admin_recent_signups(p_days integer DEFAULT 30)
 RETURNS TABLE(id uuid, slug text, business_name text, email text, city text, plan text, referred_by_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    p.id, p.slug, p.business_name, p.email, p.city,
    p.plan,
    (SELECT r.business_name FROM profiles r WHERE r.id = p.referred_by),
    p.created_at
  FROM profiles p
  WHERE p.created_at > now() - (p_days || ' days')::interval
  ORDER BY p.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_cron_summary()
 RETURNS TABLE(job_name text, last_ran_at timestamp with time zone, last_status text, last_error text, runs_last_7d integer, errors_last_7d integer, total_items_processed_7d integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    ch.job_name,
    MAX(ch.ran_at) AS last_ran_at,
    (SELECT c2.status FROM cron_health c2 WHERE c2.job_name = ch.job_name ORDER BY c2.ran_at DESC LIMIT 1),
    (SELECT c3.error_message FROM cron_health c3 WHERE c3.job_name = ch.job_name ORDER BY c3.ran_at DESC LIMIT 1),
    COUNT(*)::int AS runs_last_7d,
    COUNT(*) FILTER (WHERE ch.status = 'error')::int AS errors_last_7d,
    COALESCE(SUM(ch.items_processed), 0)::int AS total_items_processed_7d
  FROM cron_health ch
  WHERE ch.ran_at > now() - interval '7 days'
  GROUP BY ch.job_name
  ORDER BY ch.job_name;
END;
$function$;
