-- Tests voor pending/E2.sql (cron_health 'degraded'). Draaien in één batch die
-- terugrolt: begin; <E2.sql>; <dit bestand>. Het DO-blok eindigt met een
-- exception, dus er blijft niets staan.
create function pg_temp.t(p_label text, p_role text, p_claims jsonb, p_sql text, p_expect text)
returns text language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  perform set_config('role', p_role, true);
  execute p_sql;
  get diagnostics n = row_count;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
  return case when (p_expect = 'ok' and n > 0) or (p_expect = 'zero' and n = 0) then 'PASS ' else 'FAIL ' end
         || p_label || ' [want ' || p_expect || '] rows=' || n;
exception when others then
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
  return case when p_expect = 'err' then 'PASS ' else 'FAIL ' end
         || p_label || ' [want ' || p_expect || '] ' || sqlstate || ' ' || left(sqlerrm, 110);
end $f$;

do $$
declare
  r text := '';
  cb jsonb := jsonb_build_object('sub', '74029064-56c2-44d1-93c2-b814db4059cf', 'role', 'authenticated', 'email', 'demo@bloomstudio.example');
  ca jsonb := '{"role":"anon"}';
  cs jsonb := '{"role":"service_role"}';
  nl text := E'\n';
begin
  r := r || pg_temp.t('H01 service_role writes degraded heartbeat', 'service_role', cs, $q$insert into public.cron_health (job_name, status, duration_ms, items_processed, error_message) values ('zz-e2-test', 'degraded', 1, 3, '1 van 4 mislukt')$q$, 'ok') || nl;
  r := r || pg_temp.t('H02 service_role writes success heartbeat', 'service_role', cs, $q$insert into public.cron_health (job_name, status, items_processed) values ('zz-e2-test', 'success', 0)$q$, 'ok') || nl;
  r := r || pg_temp.t('H03 service_role writes error heartbeat', 'service_role', cs, $q$insert into public.cron_health (job_name, status, items_processed, error_message) values ('zz-e2-test', 'error', 0, 'alles mislukt')$q$, 'ok') || nl;
  r := r || pg_temp.t('H04 unknown status still refused', 'service_role', cs, $q$insert into public.cron_health (job_name, status) values ('zz-e2-test', 'warning')$q$, 'err') || nl;
  r := r || pg_temp.t('H05 constraint lists degraded', 'postgres', '{}', $q$select 1 from pg_constraint where conname = 'cron_health_status_check' and conrelid = 'public.cron_health'::regclass and pg_get_constraintdef(oid) like '%degraded%'$q$, 'ok') || nl;
  r := r || pg_temp.t('H06 owner cannot write heartbeats', 'authenticated', cb, $q$insert into public.cron_health (job_name, status) values ('zz-e2-test', 'degraded')$q$, 'err') || nl;
  r := r || pg_temp.t('H07 anon cannot write heartbeats', 'anon', ca, $q$insert into public.cron_health (job_name, status) values ('zz-e2-test', 'success')$q$, 'err') || nl;
  r := r || pg_temp.t('H08 owner cannot read heartbeats', 'authenticated', cb, $q$select 1 from public.cron_health where job_name = 'zz-e2-test'$q$, 'zero') || nl;
  r := r || pg_temp.t('H09 watchdog query sees degraded row', 'service_role', cs, $q$select 1 from public.cron_health where job_name = 'zz-e2-test' and status in ('error','degraded') and ran_at >= now() - interval '25 hours'$q$, 'ok') || nl;
  r := r || pg_temp.t('H10 existing rows still valid', 'postgres', '{}', $q$select 1 from public.cron_health where status not in ('success','error','degraded')$q$, 'zero') || nl;

  raise exception E'REPORT\n%', r;
end $$;
