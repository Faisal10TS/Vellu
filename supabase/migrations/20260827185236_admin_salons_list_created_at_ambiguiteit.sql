-- Salons-tab in /admin was leeg ("No salons match", 2026-08-27): de RPC gooide
-- 42702 "column reference created_at is ambiguous" — het subquery
-- MAX(created_at) botste met de gelijknamige RETURNS TABLE-parameter, en de
-- frontend slikt RPC-fouten in als lege lijst. Alle subquery-tabellen krijgen
-- een alias en elke kolom is nu gekwalificeerd; verder identiek.
CREATE OR REPLACE FUNCTION public.admin_salons_list()
 RETURNS TABLE(id uuid, slug text, business_name text, email text, city text, plan text, plan_expires_at timestamp with time zone, created_at timestamp with time zone, staff_count integer, appt_count integer, completed_count integer, upcoming_count integer, total_revenue numeric, last_activity timestamp with time zone, google_connected boolean, referred_by uuid, referral_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    p.id, p.slug, p.business_name, p.email, p.city,
    p.plan, p.plan_expires_at, p.created_at,
    (SELECT COUNT(*)::int FROM staff_members sm WHERE sm.owner_id = p.id),
    (SELECT COUNT(*)::int FROM appointments a1 WHERE a1.owner_id = p.id),
    (SELECT COUNT(*)::int FROM appointments a2 WHERE a2.owner_id = p.id AND a2.status = 'completed'),
    (SELECT COUNT(*)::int FROM appointments a3 WHERE a3.owner_id = p.id AND a3.status = 'confirmed' AND a3.date >= CURRENT_DATE),
    (SELECT COALESCE(SUM(a4.service_price), 0) FROM appointments a4 WHERE a4.owner_id = p.id AND a4.status = 'completed'),
    (SELECT MAX(a5.created_at) FROM appointments a5 WHERE a5.owner_id = p.id),
    COALESCE(p.google_calendar_connected, false),
    p.referred_by, p.referral_code
  FROM profiles p
  ORDER BY p.created_at DESC;
END;
$function$;
