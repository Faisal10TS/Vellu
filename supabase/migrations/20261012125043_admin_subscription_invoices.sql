-- Admin: alle abonnementsfacturen van Vellu per stuk, voor de boekhouding en de
-- btw-aangifte (Faisal 12-10-2026: "voeg alles toe zodat het makkelijker is om
-- te administreren"). Het admin-blok rekent de periodesommen (maand/kwartaal/
-- jaar) hieruit, zodat lijst en totalen altijd gelijk lopen; en splitst per
-- btw-behandeling: vat_rate > 0 = Nederlandse btw (rubriek 1a), NULL/0 =
-- buiten de EU (Caribisch Nederland e.a., niet in de aangifte). Demo's uit.
-- issued_on = factuurdatum in Nederlandse tijd (de aangifte volgt die).
create or replace function public.admin_subscription_invoices()
 returns table(invoice_number text, issued_on date, issued_at timestamptz, salon_id uuid, business_name text, country_code text,
               salon_btw_id text, salon_kvk text, plan text, billing_interval text, period_start date, period_end date,
               amount_excl_vat numeric, vat_rate numeric, vat_amount numeric, total_eur numeric, vat_treatment text,
               mollie_payment_id text, sent_at timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select i.invoice_number,
         (coalesce(i.issued_at, i.created_at) at time zone 'Europe/Amsterdam')::date,
         coalesce(i.issued_at, i.created_at),
         p.id, p.business_name, p.country_code, p.btw_id, p.kvk_number,
         i.plan, i.billing_interval, i.period_start, i.period_end,
         coalesce(i.amount_excl_vat, i.total_eur)::numeric,
         i.vat_rate,
         coalesce(i.vat_amount, 0)::numeric,
         coalesce(i.total_eur, 0)::numeric,
         case when coalesce(i.vat_rate, 0) > 0 then 'nl_vat' else 'outside_eu' end,
         e.mollie_payment_id,
         i.sent_at
    from public.payment_invoices i
    join public.profiles p on p.id = i.owner_id
    left join public.payment_events e on e.id = i.payment_event_id
   where not coalesce(p.is_demo, false)
   order by coalesce(i.issued_at, i.created_at) desc, i.invoice_number desc;
end $function$;
