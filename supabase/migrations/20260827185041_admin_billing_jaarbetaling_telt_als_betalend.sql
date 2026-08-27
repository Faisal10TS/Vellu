-- Revenue-tab telde jaarklanten als "comped" (2026-08-27, My Whims €350/jaar).
-- De RPC's uit admin_billing_rpcs (26-07) kenden maar één soort betalende klant:
-- subscription_status='active' + een lopend Mollie-abonnement. Sinds 20-08 loopt
-- het JAARabonnement bewust als eenmalige Mollie-betaling zónder abonnement
-- (geen mandaat), dus viel elke jaarklant in de "active zonder Mollie-sub"-bak
-- die toen alleen comped/demo-accounts bevatte. "Betalend" is nu: een lopende
-- Mollie-sub, ÓF een jaarklant met een echte factuur (total_eur > 0) waarvan de
-- periode vandaag nog dekt. Comped/demo heeft geen facturen en blijft comped;
-- een verlopen jaarklant valt er vanzelf uit. MRR-equivalent jaar blijft
-- prijs × 10/12 (jaar = 10× maand, 2 maanden gratis).

CREATE OR REPLACE FUNCTION public.admin_billing_overview()
 RETURNS TABLE(mrr_eur numeric, arr_eur numeric, paying_count integer, churning_count integer, trialing_count integer, comped_count integer, trials_ending_14d integer, collected_total_eur numeric, collected_30d_eur numeric, invoices_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    (SELECT COALESCE(SUM(total_eur), 0) FROM payment_invoices)::numeric,
    (SELECT COALESCE(SUM(total_eur), 0) FROM payment_invoices WHERE issued_at > now() - interval '30 days')::numeric,
    (SELECT COUNT(*)::int FROM payment_invoices)
  FROM classified;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_subscriptions_list()
 RETURNS TABLE(id uuid, business_name text, slug text, plan text, subscription_status text, billing_interval text, classification text, mrr_eur numeric, has_mollie boolean, churning boolean, trial_ends_at timestamp with time zone, plan_expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
