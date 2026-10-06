-- Admin: Vellu's eigen abonnementsomzet per maand, kwartaal en jaar (Faisal
-- 06-10-2026: "how much I make a month, a year and quarterly off Vellu
-- subscriptions"). Bron = payment_invoices (echt geïnd via Mollie, demo's
-- uitgesloten), gedateerd op issued_at (anders created_at). Drie reeksen in
-- één antwoord; elke kolom gekwalificeerd (RETURNS TABLE maakt van elke
-- uitvoerkolom een variabele — zie de 42702-les van 27-08).
create or replace function public.admin_subscription_revenue()
 returns table(kind text, period_key text, period_start date, invoice_count integer, salon_count integer, total_eur numeric, excl_vat_eur numeric, vat_eur numeric)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  with inv as (
    select i.owner_id as oid,
           coalesce(i.issued_at, i.created_at)::date as d,
           coalesce(i.total_eur, 0)::numeric as tot,
           coalesce(i.amount_excl_vat, 0)::numeric as ex,
           coalesce(i.vat_amount, 0)::numeric as vt
      from public.payment_invoices i
     where i.owner_id in (select p.id from public.profiles p where not coalesce(p.is_demo, false))
  ), g as (
    select 'month'::text as kd, to_char(date_trunc('month', v.d), 'YYYY-MM') as pk, date_trunc('month', v.d)::date as ps, v.oid, v.tot, v.ex, v.vt from inv v
    union all
    select 'quarter'::text, to_char(v.d, 'YYYY') || '-Q' || to_char(v.d, 'Q'), date_trunc('quarter', v.d)::date, v.oid, v.tot, v.ex, v.vt from inv v
    union all
    select 'year'::text, to_char(v.d, 'YYYY'), date_trunc('year', v.d)::date, v.oid, v.tot, v.ex, v.vt from inv v
  )
  select g.kd, g.pk, g.ps, count(*)::int, count(distinct g.oid)::int, sum(g.tot)::numeric, sum(g.ex)::numeric, sum(g.vt)::numeric
    from g
   group by g.kd, g.pk, g.ps
   order by g.kd, g.ps;
end $function$;
