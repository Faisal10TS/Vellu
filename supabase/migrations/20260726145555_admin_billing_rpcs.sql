-- Vellu's OWN subscription revenue metrics for the admin dashboard.
-- Gated by is_admin() like the other admin_* RPCs. Amounts in EUR (Vellu
-- always bills in euro regardless of salon region). MRR counts only salons
-- with an active subscription backed by a real Mollie subscription; comped
-- (active, no Mollie) and trialing salons contribute 0.
CREATE OR REPLACE FUNCTION public.admin_billing_overview()
 RETURNS TABLE(
   mrr_eur numeric,
   arr_eur numeric,
   paying_count integer,
   churning_count integer,
   trialing_count integer,
   comped_count integer,
   trials_ending_14d integer,
   collected_total_eur numeric,
   collected_30d_eur numeric,
   invoices_count integer
 )
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
      COALESCE(p.cancel_at_period_end, false) AS churning,
      p.trial_ends_at,
      (CASE WHEN p.plan = 'professional' THEN 35.0
            WHEN p.plan = 'starter' THEN 19.0
            ELSE 0.0 END) AS base,
      p.billing_interval AS intv
    FROM profiles p
  ), classified AS (
    SELECT s.*,
      (s.status = 'active' AND s.has_mollie) AS is_paying,
      (CASE WHEN s.intv = 'yearly' THEN s.base * 10.0 / 12.0 ELSE s.base END) AS mrr
    FROM sub s
  )
  SELECT
    COALESCE(SUM(mrr) FILTER (WHERE is_paying), 0)::numeric,
    (COALESCE(SUM(mrr) FILTER (WHERE is_paying), 0) * 12)::numeric,
    COUNT(*) FILTER (WHERE is_paying)::int,
    COUNT(*) FILTER (WHERE is_paying AND churning)::int,
    COUNT(*) FILTER (WHERE status = 'trialing')::int,
    COUNT(*) FILTER (WHERE status = 'active' AND NOT has_mollie)::int,
    COUNT(*) FILTER (WHERE status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at <= now() + interval '14 days')::int,
    (SELECT COALESCE(SUM(total_eur), 0) FROM payment_invoices)::numeric,
    (SELECT COALESCE(SUM(total_eur), 0) FROM payment_invoices WHERE issued_at > now() - interval '30 days')::numeric,
    (SELECT COUNT(*)::int FROM payment_invoices)
  FROM classified;
END;
$function$;

-- Per-salon subscription breakdown for the admin dashboard billing tab.
CREATE OR REPLACE FUNCTION public.admin_subscriptions_list()
 RETURNS TABLE(
   id uuid,
   business_name text,
   slug text,
   plan text,
   subscription_status text,
   billing_interval text,
   classification text,
   mrr_eur numeric,
   has_mollie boolean,
   churning boolean,
   trial_ends_at timestamptz,
   plan_expires_at timestamptz,
   created_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.business_name::text,
    p.slug::text,
    p.plan::text,
    p.subscription_status::text,
    p.billing_interval::text,
    (CASE
      WHEN p.subscription_status = 'active' AND p.mollie_subscription_id IS NOT NULL THEN 'paying'
      WHEN p.subscription_status = 'active' AND p.mollie_subscription_id IS NULL THEN 'comped'
      WHEN p.subscription_status = 'trialing' THEN 'trialing'
      ELSE COALESCE(p.subscription_status, 'none')
    END)::text,
    (CASE
      WHEN p.subscription_status = 'active' AND p.mollie_subscription_id IS NOT NULL THEN
        (CASE WHEN p.billing_interval = 'yearly'
              THEN (CASE WHEN p.plan='professional' THEN 35.0 WHEN p.plan='starter' THEN 19.0 ELSE 0 END) * 10.0 / 12.0
              ELSE (CASE WHEN p.plan='professional' THEN 35.0 WHEN p.plan='starter' THEN 19.0 ELSE 0 END) END)
      ELSE 0 END)::numeric,
    (p.mollie_subscription_id IS NOT NULL),
    COALESCE(p.cancel_at_period_end, false),
    p.trial_ends_at::timestamptz,
    p.plan_expires_at::timestamptz,
    p.created_at::timestamptz
  FROM profiles p
  ORDER BY
    (CASE
      WHEN p.subscription_status = 'active' AND p.mollie_subscription_id IS NOT NULL THEN 0
      WHEN p.subscription_status = 'trialing' THEN 1
      ELSE 2 END),
    p.created_at;
END;
$function$;