-- Cron health-tab: oranje "hersteld"-status naast rood "faalt nu".
-- last_error was alleen gevuld als de ALLERLAATSTE run faalde; een hersteld
-- probleem toonde dus wel "1 errors" maar nergens wát er mis was geweest.
-- Nieuw: last_error_7d + last_error_at_7d = de meest recente foutmelding
-- binnen het 7-dagen-venster, ook als de job daarna weer draait.
-- RETURNS TABLE uitbreiden = return type wijzigen, dus drop + recreate.
drop function if exists public.admin_cron_summary();
create function public.admin_cron_summary()
 returns table(
   job_name text,
   last_ran_at timestamp with time zone,
   last_status text,
   last_error text,
   runs_last_7d integer,
   errors_last_7d integer,
   total_items_processed_7d integer,
   last_error_7d text,
   last_error_at_7d timestamp with time zone
 )
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
    count(*)::int as runs_last_7d,
    count(*) filter (where ch.status = 'error')::int as errors_last_7d,
    coalesce(sum(ch.items_processed), 0)::int as total_items_processed_7d,
    (select c4.error_message from cron_health c4 where c4.job_name = ch.job_name and c4.status = 'error' and c4.ran_at > now() - interval '7 days' order by c4.ran_at desc limit 1) as last_error_7d,
    (select c5.ran_at from cron_health c5 where c5.job_name = ch.job_name and c5.status = 'error' and c5.ran_at > now() - interval '7 days' order by c5.ran_at desc limit 1) as last_error_at_7d
  from cron_health ch
  where ch.ran_at > now() - interval '7 days'
  group by ch.job_name
  order by ch.job_name;
end;
$function$;
