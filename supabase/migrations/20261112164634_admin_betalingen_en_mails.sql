-- Admin ronde 3 (12-11-2026): betalingsfeed en verstuurde mails per salon.
--
-- admin_payment_events: elke Mollie-gebeurtenis (payment_events) van de
-- laatste p_days dagen, nieuwste eerst, met de salon erbij. Zonder
-- raw_payload/outcome: de feed toont alleen wat er gebeurde. Demo's uit.
-- Zo valt op wat tot nu toe niemand zag, zoals vijf afgebroken betalingen
-- van Brilliant Beauty in september of een mislukte afschrijving.
--
-- admin_lifecycle_emails: de automatische mails die Vellu een salon stuurde
-- over het eigen account: activatie (activation_nudges: no_services,
-- no_bookings) en proef/verlenging (renewal_reminder_log: trial_ending,
-- trial_expired, trial_autopay_ending, trial_autopay_today, renewal).
-- Alleen lezen, achter is_admin().

create or replace function public.admin_payment_events(p_days integer default 120)
returns table(id uuid, created_at timestamp with time zone, owner_id uuid, business_name text, slug text, country_code text,
              event_type text, status text, amount_eur numeric, description text, mollie_payment_id text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select e.id, e.created_at, e.owner_id, p.business_name, p.slug, p.country_code::text,
         e.event_type, e.status, e.amount_eur, e.description, e.mollie_payment_id
    from payment_events e
    left join profiles p on p.id = e.owner_id
   where e.created_at > now() - make_interval(days => greatest(coalesce(p_days, 120), 1))
     and not coalesce(p.is_demo, false)
   order by e.created_at desc
   limit 1000;
end;
$function$;
revoke all on function public.admin_payment_events(integer) from public, anon;
grant execute on function public.admin_payment_events(integer) to authenticated, service_role;

create or replace function public.admin_lifecycle_emails()
returns table(owner_id uuid, kind text, sent_at timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select x.owner_id, x.kind, x.sent_at
    from (
      select n.owner_id, n.kind, n.sent_at from activation_nudges n
      union all
      select r.owner_id, r.kind, r.sent_at from renewal_reminder_log r
    ) x
    join profiles p on p.id = x.owner_id
   where not p.is_demo
   order by x.sent_at desc;
end;
$function$;
revoke all on function public.admin_lifecycle_emails() from public, anon;
grant execute on function public.admin_lifecycle_emails() to authenticated, service_role;
