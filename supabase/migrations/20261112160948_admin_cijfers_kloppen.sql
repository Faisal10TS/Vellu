-- Admin: cijfers die niet klopten (review 12-11-2026, punten 1, 2, 4 en 6).
--
-- 1. admin_revenue_timeline nam ook toekomstige afspraken mee (alleen een
--    ondergrens op de datum): het grafiekje "last 30 days" liep tot april 2027
--    en zakte na vandaag naar nul. Nu tot en met vandaag.
-- 2. Omzet van salons telde euro's, dollars (Bonaire) en XCG (Curaçao) op tot
--    één euro-bedrag. De tijdlijn en de salonlijst geven nu het land mee; de
--    app rekent per munt (currencyForCountry in shared.jsx, één bron).
--    RETURNS TABLE wijzigen = drop + recreate, met dezelfde rechten.
-- 4. admin_billing_overview telde een opgezegde salon zonder lopend
--    Mollie-abonnement (toegang loopt nog tot plan_expires_at) als
--    "comped / free" en niet als "churning". Churning = opgezegd en de
--    toegang loopt nog, betalend of niet; comped = actief, niet betalend,
--    niet opgezegd.
-- 6. admin_cron_summary liet een job die langer dan 7 dagen niet draaide
--    helemaal uit de lijst vallen. Nu elke job die ooit een hartslag schreef;
--    de tellers blijven over de laatste 7 dagen.

drop function if exists public.admin_revenue_timeline(integer);
create function public.admin_revenue_timeline(p_days integer default 30)
returns table(day date, country_code text, revenue numeric, appointments integer)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select
    a.date::date,
    p.country_code::text,
    coalesce(sum(a.service_price) filter (where a.status = 'completed'), 0)::numeric,
    count(*)::int
  from appointments a
  join profiles p on p.id = a.owner_id
  where a.date > current_date - (p_days || ' days')::interval
    and a.date <= current_date
    and not p.is_demo
  group by a.date::date, p.country_code
  order by 1, 2;
end;
$function$;
revoke all on function public.admin_revenue_timeline(integer) from public, anon;
grant execute on function public.admin_revenue_timeline(integer) to authenticated, service_role;

drop function if exists public.admin_salons_list();
create function public.admin_salons_list()
returns table(id uuid, slug text, business_name text, email text, city text, plan text, plan_expires_at timestamp with time zone, created_at timestamp with time zone, staff_count integer, appt_count integer, completed_count integer, upcoming_count integer, total_revenue numeric, last_activity timestamp with time zone, google_connected boolean, referred_by uuid, referral_code text, last_seen timestamp with time zone, subscription_status text, deactivated_at timestamp with time zone, deactivated_reason text, country_code text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select
    p.id, p.slug, p.business_name, p.email, p.city,
    p.plan, p.plan_expires_at, p.created_at,
    (select count(*)::int from staff_members sm where sm.owner_id = p.id),
    (select count(*)::int from appointments a1 where a1.owner_id = p.id),
    (select count(*)::int from appointments a2 where a2.owner_id = p.id and a2.status = 'completed'),
    (select count(*)::int from appointments a3 where a3.owner_id = p.id and a3.status = 'confirmed' and a3.date >= current_date),
    (select coalesce(sum(a4.service_price), 0) from appointments a4 where a4.owner_id = p.id and a4.status = 'completed'),
    (select max(a5.created_at) from appointments a5 where a5.owner_id = p.id),
    coalesce(p.google_calendar_connected, false),
    p.referred_by, p.referral_code,
    greatest((select u.last_sign_in_at from auth.users u where u.id = p.id),
             (select max(s.updated_at) from auth.sessions s where s.user_id = p.id)),
    p.subscription_status, p.deactivated_at,
    (select n.reason from salon_deactivation_notes n where n.owner_id = p.id),
    p.country_code::text
  from profiles p
  where not p.is_demo
  order by p.created_at desc;
end;
$function$;
revoke all on function public.admin_salons_list() from public, anon;
grant execute on function public.admin_salons_list() to authenticated, service_role;

create or replace function public.admin_billing_overview()
returns table(mrr_eur numeric, arr_eur numeric, paying_count integer, churning_count integer, trialing_count integer, comped_count integer, trials_ending_14d integer, collected_total_eur numeric, collected_30d_eur numeric, invoices_count integer)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  with sub as (
    select
      p.subscription_status as status,
      (p.mollie_subscription_id is not null) as has_mollie,
      exists (select 1 from payment_invoices i
              where i.owner_id = p.id and i.total_eur > 0
                and i.period_end >= current_date) as has_current_paid_invoice,
      (coalesce(p.cancel_at_period_end, false)
        and (p.plan_expires_at is null or p.plan_expires_at > now())) as churning,
      p.trial_ends_at,
      (case when p.plan = 'professional' then 35.0
            when p.plan = 'starter' then 19.0
            else 0.0 end) as base,
      p.billing_interval as intv
    from profiles p
    where not p.is_demo and p.deactivated_at is null
  ), classified as (
    select s.*,
      (s.status = 'active' and (s.has_mollie or (s.intv = 'yearly' and s.has_current_paid_invoice))) as is_paying,
      (case when s.intv = 'yearly' then s.base * 10.0 / 12.0 else s.base end) as mrr
    from sub s
  ), inv as (
    select i.* from payment_invoices i
     where i.owner_id is null or i.owner_id in (select pr.id from profiles pr where not pr.is_demo)
  )
  select
    coalesce(sum(c.mrr) filter (where c.is_paying), 0)::numeric,
    (coalesce(sum(c.mrr) filter (where c.is_paying), 0) * 12)::numeric,
    count(*) filter (where c.is_paying)::int,
    count(*) filter (where c.status = 'active' and c.churning)::int,
    count(*) filter (where c.status = 'trialing')::int,
    count(*) filter (where c.status = 'active' and not c.is_paying and not c.churning)::int,
    count(*) filter (where c.status = 'trialing' and c.trial_ends_at is not null and c.trial_ends_at <= now() + interval '14 days')::int,
    (select coalesce(sum(v.total_eur), 0) from inv v)::numeric,
    (select coalesce(sum(v.total_eur), 0) from inv v where v.issued_at > now() - interval '30 days')::numeric,
    (select count(*)::int from inv v)
  from classified c;
end;
$function$;

create or replace function public.admin_cron_summary()
returns table(job_name text, last_ran_at timestamp with time zone, last_status text, last_error text, runs_last_7d integer, errors_last_7d integer, total_items_processed_7d integer, last_error_7d text, last_error_at_7d timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;

  return query
  select
    ch.job_name,
    max(ch.ran_at) as last_ran_at,
    (select c2.status from cron_health c2 where c2.job_name = ch.job_name order by c2.ran_at desc limit 1),
    (select c3.error_message from cron_health c3 where c3.job_name = ch.job_name order by c3.ran_at desc limit 1),
    (count(*) filter (where ch.ran_at > now() - interval '7 days'))::int as runs_last_7d,
    (count(*) filter (where ch.status = 'error' and ch.ran_at > now() - interval '7 days'))::int as errors_last_7d,
    coalesce(sum(ch.items_processed) filter (where ch.ran_at > now() - interval '7 days'), 0)::int as total_items_processed_7d,
    (select c4.error_message from cron_health c4 where c4.job_name = ch.job_name and c4.status = 'error' and c4.ran_at > now() - interval '7 days' order by c4.ran_at desc limit 1) as last_error_7d,
    (select c5.ran_at from cron_health c5 where c5.job_name = ch.job_name and c5.status = 'error' and c5.ran_at > now() - interval '7 days' order by c5.ran_at desc limit 1) as last_error_at_7d
  from cron_health ch
  group by ch.job_name
  order by ch.job_name;
end;
$function$;
