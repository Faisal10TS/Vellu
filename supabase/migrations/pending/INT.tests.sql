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
  bloom   text := '74029064-56c2-44d1-93c2-b814db4059cf';
  noorrow text := '6246e170-f838-46fc-93c9-d3d8cc18cc39';
  cb  jsonb := jsonb_build_object('sub', '74029064-56c2-44d1-93c2-b814db4059cf', 'role', 'authenticated', 'email', 'demo@bloomstudio.example');
  cn  jsonb := jsonb_build_object('sub', '7ea0a9c9-a823-4bfd-99f1-58899dec4c85', 'role', 'authenticated', 'email', 'staff@bloomstudio.example');
  wl text;
  nl text := E'\n';
begin
  r := r || pg_temp.t('I01 active staff sees salon appointments', 'authenticated', cn, format('select 1 from public.appointments where owner_id = %L limit 1', bloom), 'ok') || nl;
  r := r || pg_temp.t('I02 setup: owner deactivates stylist (server)', 'postgres', '{}', format('update public.staff_members set active = false where id = %L', noorrow), 'ok') || nl;
  r := r || pg_temp.t('I03 inactive: no appointments', 'authenticated', cn, format('select 1 from public.appointments where owner_id = %L', bloom), 'zero') || nl;
  r := r || pg_temp.t('I04 inactive: my_staff_owner_ids empty', 'authenticated', cn, 'select 1 from public.my_staff_owner_ids()', 'zero') || nl;
  r := r || pg_temp.t('I05 inactive: may not edit catalog', 'authenticated', cn, format('select 1 where public.staff_may_edit_catalog(%L::uuid)', bloom), 'zero') || nl;
  r := r || pg_temp.t('I06 inactive: no cancellation tokens', 'authenticated', cn, format('select 1 from public.cancellation_tokens ct join public.appointments a on a.id = ct.appointment_id where a.owner_id = %L', bloom), 'zero') || nl;
  r := r || pg_temp.t('I07 inactive: no waitlist', 'authenticated', cn, format('select 1 from public.waitlist where owner_id = %L', bloom), 'zero') || nl;
  r := r || pg_temp.t('I08 inactive: cannot add own block', 'authenticated', cn, format($q$insert into public.staff_day_overrides (owner_id, staff_id, date, kind) values (%L, %L, current_date + 3, 'block')$q$, bloom, noorrow), 'err') || nl;
  r := r || pg_temp.t('I09 inactive: storage upload refused', 'authenticated', cn, format($q$insert into storage.objects (bucket_id, name) values ('service-photos', %L)$q$, bloom || '/svc/zz-int.jpg'), 'err') || nl;
  r := r || pg_temp.t('I10 setup: reactivate (server)', 'postgres', '{}', format('update public.staff_members set active = true where id = %L', noorrow), 'ok') || nl;
  r := r || pg_temp.t('I11 reactivated: appointments visible again', 'authenticated', cn, format('select 1 from public.appointments where owner_id = %L limit 1', bloom), 'ok') || nl;
  r := r || pg_temp.t('I12 owner still sees everything', 'authenticated', cb, format('select 1 from public.appointments where owner_id = %L limit 1', bloom), 'ok') || nl;
  -- wachtlijst: notified_at van de server
  insert into public.waitlist (owner_id, date, client_name, client_email, status)
  values (bloom::uuid, current_date + 5, 'ZZ int', 'delivered@resend.dev', 'waiting') returning id::text into wl;
  r := r || pg_temp.t('I13 owner marks notified with a wrong device clock', 'authenticated', cb, format($q$update public.waitlist set status = 'notified', notified_at = '2000-01-01T00:00:00Z' where id = %L$q$, wl), 'ok') || nl;
  r := r || pg_temp.t('I14 notified_at is server time', 'postgres', '{}', format($q$select 1 from public.waitlist where id = %L and notified_at > now() - interval '1 minute'$q$, wl), 'ok') || nl;
  -- annuleerlinks gelijk aan het startmoment
  r := r || pg_temp.t('I15 no future token out of line with its start', 'postgres', '{}', $q$select 1 from public.cancellation_tokens ct join public.appointments a on a.id = ct.appointment_id join public.profiles p on p.id = a.owner_id
     where coalesce(ct.used,false) = false and a.status not in ('cancelled','completed','no_show') and a.date >= current_date and coalesce(p.country_code,'NL') in ('NL','BE','AW','CW','BQ','SX')
       and abs(extract(epoch from (ct.expires_at - ((a.date + a.time::time) at time zone case when p.country_code in ('AW','CW','BQ','SX') then 'America/Curacao' when p.country_code = 'BE' then 'Europe/Brussels' else 'Europe/Amsterdam' end)))) > 60$q$, 'zero') || nl;
  raise exception E'REPORT\n%', r;
end $$;
