-- Admin salonlijst: "churning" alleen zolang de toegang nog loopt (15-11-2026).
--
-- admin_subscriptions_list gaf churning = cancel_at_period_end, en die vlag
-- blijft na het einde van de betaalde periode gewoon true staan. Honeysets
-- zegde op 13-10 op, haar toegang eindigde 13-11 (status 'cancelled'), maar
-- de Salons-tab en "Needs attention" toonden haar op 15-11 nog als
-- "churning" / "Cancelled, access still running". admin_billing_overview was
-- op 12-11 al gecorrigeerd (20261112160948, punt 4); deze lijst niet.
--
-- Nu dezelfde regel als de teller daar: opgezegd, status 'active' en
-- plan_expires_at leeg of in de toekomst. Wie voorbij is valt terug op de
-- gewone classificatie (subscription_status, dus "cancelled").
-- Zelfde RETURNS TABLE, dus create or replace; rechten blijven staan.

create or replace function public.admin_subscriptions_list()
 returns table(id uuid, business_name text, slug text, plan text, subscription_status text, billing_interval text, classification text, mrr_eur numeric, has_mollie boolean, churning boolean, trial_ends_at timestamp with time zone, plan_expires_at timestamp with time zone, created_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  with s as (
    select p.id as pid, p.business_name as bname, p.slug as pslug, p.plan as pplan,
      p.subscription_status as status, p.billing_interval as intv,
      p.mollie_subscription_id as msub,
      (coalesce(p.cancel_at_period_end, false)
        and p.subscription_status = 'active'
        and (p.plan_expires_at is null or p.plan_expires_at > now())) as churn,
      p.trial_ends_at as trial_end, p.plan_expires_at as plan_end, p.created_at as created,
      (p.subscription_status = 'active' and (p.mollie_subscription_id is not null
        or (p.billing_interval = 'yearly' and exists (
              select 1 from payment_invoices i
              where i.owner_id = p.id and i.total_eur > 0 and i.period_end >= current_date)))) as is_paying,
      (case when p.plan = 'professional' then 35.0 when p.plan = 'starter' then 19.0 else 0 end) as base
    from profiles p
    where not p.is_demo
  )
  select
    s.pid, s.bname::text, s.pslug::text, s.pplan::text, s.status::text, s.intv::text,
    (case
      when s.is_paying then 'paying'
      when s.status = 'active' then 'comped'
      when s.status = 'trialing' then 'trialing'
      else coalesce(s.status, 'none')
    end)::text,
    (case when s.is_paying then
        (case when s.intv = 'yearly' then s.base * 10.0 / 12.0 else s.base end)
      else 0 end)::numeric,
    (s.msub is not null),
    s.churn,
    s.trial_end::timestamptz,
    s.plan_end::timestamptz,
    s.created::timestamptz
  from s
  order by
    (case when s.is_paying then 0 when s.status = 'trialing' then 1 else 2 end),
    s.created;
end;
$function$;
