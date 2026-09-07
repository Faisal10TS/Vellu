-- Het demosalon (Bloom Studio) hoort niet in het admin-overzicht: geen echte
-- klant, geen echte omzet. Vlag i.p.v. hardgecodeerd id, zodat een tweede
-- demosalon later één UPDATE is. Alle zes admin-RPC's filteren op is_demo;
-- de functiebodies zijn verder ongewijzigd t.o.v. hun vorige versie.
alter table public.profiles add column if not exists is_demo boolean not null default false;
update public.profiles set is_demo = true where id = '74029064-56c2-44d1-93c2-b814db4059cf';

CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS TABLE(total_salons integer, paid_salons integer, salons_last_7d integer, total_appointments integer, appointments_last_30d integer, total_revenue_eur numeric, revenue_last_30d_eur numeric, total_staff integer, total_clients integer, avg_appointments_per_salon numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH echt AS (SELECT id FROM profiles WHERE NOT is_demo)
  SELECT
    (SELECT COUNT(*)::int FROM echt),
    (SELECT COUNT(*)::int FROM profiles WHERE plan IS NOT NULL AND NOT is_demo),
    (SELECT COUNT(*)::int FROM profiles WHERE created_at > now() - interval '7 days' AND NOT is_demo),
    (SELECT COUNT(*)::int FROM appointments WHERE owner_id IN (SELECT id FROM echt)),
    (SELECT COUNT(*)::int FROM appointments WHERE created_at > now() - interval '30 days' AND owner_id IN (SELECT id FROM echt)),
    (SELECT COALESCE(SUM(service_price), 0) FROM appointments WHERE status = 'completed' AND owner_id IN (SELECT id FROM echt)),
    (SELECT COALESCE(SUM(service_price), 0) FROM appointments WHERE status = 'completed' AND date > CURRENT_DATE - interval '30 days' AND owner_id IN (SELECT id FROM echt)),
    (SELECT COUNT(*)::int FROM staff_members WHERE owner_id IN (SELECT id FROM echt)),
    (SELECT COUNT(*)::int FROM clients),
    (SELECT ROUND(AVG(cnt), 1) FROM (SELECT COUNT(*) AS cnt FROM appointments WHERE owner_id IN (SELECT id FROM echt) GROUP BY owner_id) q);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_salons_list()
 RETURNS TABLE(id uuid, slug text, business_name text, email text, city text, plan text, plan_expires_at timestamp with time zone, created_at timestamp with time zone, staff_count integer, appt_count integer, completed_count integer, upcoming_count integer, total_revenue numeric, last_activity timestamp with time zone, google_connected boolean, referred_by uuid, referral_code text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
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
  WHERE NOT p.is_demo
  ORDER BY p.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_recent_signups(p_days integer DEFAULT 30)
 RETURNS TABLE(id uuid, slug text, business_name text, email text, city text, plan text, referred_by_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
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
    AND NOT p.is_demo
  ORDER BY p.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revenue_timeline(p_days integer DEFAULT 30)
 RETURNS TABLE(day date, revenue numeric, appointments integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    a.date::date,
    COALESCE(SUM(a.service_price) FILTER (WHERE a.status = 'completed'), 0),
    COUNT(*)::int
  FROM appointments a
  WHERE a.date > CURRENT_DATE - (p_days || ' days')::interval
    AND a.owner_id IN (SELECT id FROM profiles WHERE NOT is_demo)
  GROUP BY a.date::date
  ORDER BY a.date::date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_billing_overview()
 RETURNS TABLE(mrr_eur numeric, arr_eur numeric, paying_count integer, churning_count integer, trialing_count integer, comped_count integer, trials_ending_14d integer, collected_total_eur numeric, collected_30d_eur numeric, invoices_count integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH sub AS (
    SELECT
      p.subscription_status AS status,
      (p.mollie_subscription_id IS NOT NULL) AS has_mollie,
      EXISTS (SELECT 1 FROM payment_invoices i
              WHERE i.owner_id = p.id AND i.total_eur > 0
                AND i.period_end >= current_date) AS has_current_paid_invoice,
      COALESCE(p.cancel_at_period_end, false) AS churning,
      p.trial_ends_at,
      (CASE WHEN p.plan = 'professional' THEN 35.0
            WHEN p.plan = 'starter' THEN 19.0
            ELSE 0.0 END) AS base,
      p.billing_interval AS intv
    FROM profiles p
    WHERE NOT p.is_demo
  ), classified AS (
    SELECT s.*,
      (s.status = 'active' AND (s.has_mollie OR (s.intv = 'yearly' AND s.has_current_paid_invoice))) AS is_paying,
      (CASE WHEN s.intv = 'yearly' THEN s.base * 10.0 / 12.0 ELSE s.base END) AS mrr
    FROM sub s
  )
  SELECT
    COALESCE(SUM(mrr) FILTER (WHERE is_paying), 0)::numeric,
    (COALESCE(SUM(mrr) FILTER (WHERE is_paying), 0) * 12)::numeric,
    COUNT(*) FILTER (WHERE is_paying)::int,
    COUNT(*) FILTER (WHERE is_paying AND churning)::int,
    COUNT(*) FILTER (WHERE status = 'trialing')::int,
    COUNT(*) FILTER (WHERE status = 'active' AND NOT is_paying)::int,
    COUNT(*) FILTER (WHERE status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at <= now() + interval '14 days')::int,
    (SELECT COALESCE(SUM(total_eur), 0) FROM payment_invoices WHERE owner_id IN (SELECT id FROM profiles WHERE NOT is_demo))::numeric,
    (SELECT COALESCE(SUM(total_eur), 0) FROM payment_invoices WHERE issued_at > now() - interval '30 days' AND owner_id IN (SELECT id FROM profiles WHERE NOT is_demo))::numeric,
    (SELECT COUNT(*)::int FROM payment_invoices WHERE owner_id IN (SELECT id FROM profiles WHERE NOT is_demo))
  FROM classified;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_subscriptions_list()
 RETURNS TABLE(id uuid, business_name text, slug text, plan text, subscription_status text, billing_interval text, classification text, mrr_eur numeric, has_mollie boolean, churning boolean, trial_ends_at timestamp with time zone, plan_expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH s AS (
    SELECT p.id AS pid, p.business_name AS bname, p.slug AS pslug, p.plan AS pplan,
      p.subscription_status AS status, p.billing_interval AS intv,
      p.mollie_subscription_id AS msub, COALESCE(p.cancel_at_period_end, false) AS churn,
      p.trial_ends_at AS trial_end, p.plan_expires_at AS plan_end, p.created_at AS created,
      (p.subscription_status = 'active' AND (p.mollie_subscription_id IS NOT NULL
        OR (p.billing_interval = 'yearly' AND EXISTS (
              SELECT 1 FROM payment_invoices i
              WHERE i.owner_id = p.id AND i.total_eur > 0 AND i.period_end >= current_date)))) AS is_paying,
      (CASE WHEN p.plan = 'professional' THEN 35.0 WHEN p.plan = 'starter' THEN 19.0 ELSE 0 END) AS base
    FROM profiles p
    WHERE NOT p.is_demo
  )
  SELECT
    s.pid, s.bname::text, s.pslug::text, s.pplan::text, s.status::text, s.intv::text,
    (CASE
      WHEN s.is_paying THEN 'paying'
      WHEN s.status = 'active' THEN 'comped'
      WHEN s.status = 'trialing' THEN 'trialing'
      ELSE COALESCE(s.status, 'none')
    END)::text,
    (CASE WHEN s.is_paying THEN
        (CASE WHEN s.intv = 'yearly' THEN s.base * 10.0 / 12.0 ELSE s.base END)
      ELSE 0 END)::numeric,
    (s.msub IS NOT NULL),
    s.churn,
    s.trial_end::timestamptz,
    s.plan_end::timestamptz,
    s.created::timestamptz
  FROM s
  ORDER BY
    (CASE WHEN s.is_paying THEN 0 WHEN s.status = 'trialing' THEN 1 ELSE 2 END),
    s.created;
END;
$function$;
