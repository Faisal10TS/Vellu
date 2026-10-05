-- O3 tests. Run in ONE rolled-back batch:  begin; <O3.sql>; <this file>
-- The final DO block always raises, so nothing is kept. Test rows use the
-- demo salon Bloom Studio and are marked ZZ.

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
  a1 text := 'bbbbbbbb-0000-4000-8000-0000000000a1';
  a2 text := 'bbbbbbbb-0000-4000-8000-0000000000a2';
  a3 text := 'bbbbbbbb-0000-4000-8000-0000000000a3';
  a4 text := 'bbbbbbbb-0000-4000-8000-0000000000a4';
  a5 text := 'bbbbbbbb-0000-4000-8000-0000000000a5';
  a6 text := 'bbbbbbbb-0000-4000-8000-0000000000a6';
  w1 text := 'bbbbbbbb-0000-4000-8000-0000000000b1';
  cb  jsonb := jsonb_build_object('sub', '74029064-56c2-44d1-93c2-b814db4059cf', 'role', 'authenticated', 'email', 'demo@bloomstudio.example');
  cn  jsonb := jsonb_build_object('sub', '7ea0a9c9-a823-4bfd-99f1-58899dec4c85', 'role', 'authenticated', 'email', 'staff@bloomstudio.example');
  cs  jsonb := '{"role":"service_role"}';
  snap_old text := '{"v":1,"by_rate":[],"lines":[],"at":"old"}';
  pay text;
  nl text := E'\n';
begin
  -- setup (postgres): afgeronde afspraken mét snapshot, een kassaverkoop, een
  -- nog te ronden afspraak en een afspraak van medewerker Noor.
  r := r || pg_temp.t('SETUP rows', 'postgres', '{}', format($q$
    insert into public.appointments (id, owner_id, date, time, client_name, client_email, service_name, service_price, status, payment_method, paid_at, amount_paid, tax_snapshot, is_sale, staff_id)
    values
      (%1$L, %7$L, '2026-10-05', '10:00', 'ZZ O3 a1', 'zzo3@example.test', 'ZZ test', 50, 'completed', 'cash', now(), 50, %8$L::jsonb, false, null),
      (%2$L, %7$L, '2026-10-05', '11:00', 'ZZ O3 a2', 'zzo3@example.test', 'ZZ test', 50, 'completed', 'cash', now(), 50, %8$L::jsonb, false, null),
      (%3$L, %7$L, '2026-10-05', '12:00', 'ZZ O3 a3', '', 'Verkoop · ZZ', 20, 'completed', 'pin', now(), 20, '{"v":1,"by_rate":[],"lines":[],"at":"sale"}'::jsonb, true, null),
      (%4$L, %7$L, '2026-10-05', '13:00', 'ZZ O3 a4', 'zzo3@example.test', 'ZZ test', 65, 'confirmed', 'prepaid', null, 50, null, false, null),
      (%5$L, %7$L, '2026-10-05', '14:00', 'ZZ O3 a5', 'zzo3@example.test', 'ZZ test', 40, 'completed', 'pin', now(), 40, %8$L::jsonb, false, %9$L),
      (%6$L, %7$L, '2026-10-05', '15:00', 'ZZ O3 a6', 'zzo3@example.test', 'ZZ test', 30, 'completed', 'pin', now(), 30, %8$L::jsonb, false, null)
  $q$, a1, a2, a3, a4, a5, a6, bloom, snap_old, noorrow), 'ok') || nl;

  -- 1. stale snapshot wordt geleegd als het bedrag verandert zonder nieuwe snapshot
  r := r || pg_temp.t('X01 owner adds product to completed appt (no snapshot in update)', 'authenticated', cb, format($q$update public.appointments set service_price = 65, products = '[{"id":"zz","name":"ZZ olie","price":15,"qty":1}]'::jsonb where id = %L$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('X01b snapshot cleared', 'postgres', '{}', format('select 1 from public.appointments where id = %L and tax_snapshot is null and service_price = 65', a1), 'ok') || nl;
  r := r || pg_temp.t('X02 owner edits price WITH new snapshot (saveEditAppt)', 'authenticated', cb, format($q$update public.appointments set service_price = 70, tax_snapshot = '{"v":1,"by_rate":[],"lines":[],"at":"new"}'::jsonb where id = %L$q$, a2), 'ok') || nl;
  r := r || pg_temp.t('X02b new snapshot kept', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and tax_snapshot->>'at' = 'new'$q$, a2), 'ok') || nl;
  r := r || pg_temp.t('X03 same price rewritten (no real change)', 'authenticated', cb, format('update public.appointments set service_price = 70 where id = %L', a2), 'ok') || nl;
  r := r || pg_temp.t('X03b snapshot still there', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and tax_snapshot->>'at' = 'new'$q$, a2), 'ok') || nl;
  r := r || pg_temp.t('X04 kassa sale price change', 'authenticated', cb, format('update public.appointments set service_price = 25 where id = %L', a3), 'ok') || nl;
  r := r || pg_temp.t('X04b sale snapshot untouched', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and tax_snapshot->>'at' = 'sale'$q$, a3), 'ok') || nl;
  r := r || pg_temp.t('X05 staff changes price of her appt (StaffApp savePrice)', 'authenticated', cn, format('update public.appointments set service_price = 45 where id = %L', a5), 'ok') || nl;
  r := r || pg_temp.t('X05b snapshot cleared', 'postgres', '{}', format('select 1 from public.appointments where id = %L and tax_snapshot is null', a5), 'ok') || nl;
  r := r || pg_temp.t('X06 service_role changes products', 'service_role', cs, format($q$update public.appointments set products = '[{"id":"zz","name":"ZZ","price":5,"qty":1}]'::jsonb where id = %L$q$, a6), 'ok') || nl;
  r := r || pg_temp.t('X06b snapshot cleared', 'postgres', '{}', format('select 1 from public.appointments where id = %L and tax_snapshot is null', a6), 'ok') || nl;
  r := r || pg_temp.t('X07 status/payment update keeps snapshot', 'authenticated', cb, format($q$update public.appointments set paid_at = null, amount_paid = 30 where id = %L$q$, a2), 'ok') || nl;
  r := r || pg_temp.t('X07b snapshot still there', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and tax_snapshot->>'at' = 'new'$q$, a2), 'ok') || nl;

  -- 2. markComplete met restbetaling (deels vooruitbetaald): eerst de betaling,
  --    dan de afspraak (status + paid_at + amount_paid + snapshot), methode blijft prepaid.
  r := r || pg_temp.t('F01 owner records remainder payment (client_payments)', 'authenticated', cb, format($q$insert into public.client_payments (owner_id, appointment_id, amount, method, paid_on, client_name, label) values (%L, %L, 15, 'cash', '2026-10-05', 'ZZ O3 a4', 'ZZ test')$q$, bloom, a4), 'ok') || nl;
  r := r || pg_temp.t('F02 owner completes the appt with snapshot', 'authenticated', cb, format($q$update public.appointments set status = 'completed', paid_at = now(), amount_paid = 65, tax_snapshot = '{"v":1,"by_rate":[],"lines":[],"at":"done"}'::jsonb where id = %L$q$, a4), 'ok') || nl;
  r := r || pg_temp.t('F02b method kept prepaid, snapshot stored', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and payment_method = 'prepaid' and tax_snapshot->>'at' = 'done' and amount_paid = 65$q$, a4), 'ok') || nl;
  select id::text into pay from public.client_payments where appointment_id = a4::uuid limit 1;
  r := r || pg_temp.t('F03 rollback path: owner deletes the payment', 'authenticated', cb, format('delete from public.client_payments where id = %L', pay), 'ok') || nl;
  r := r || pg_temp.t('F04 remainder by card (method pin)', 'authenticated', cb, format($q$insert into public.client_payments (owner_id, appointment_id, amount, method, paid_on) values (%L, %L, 15, 'pin', '2026-10-05')$q$, bloom, a4), 'ok') || nl;
  r := r || pg_temp.t('F05 remainder by transfer', 'authenticated', cb, format($q$insert into public.client_payments (owner_id, appointment_id, amount, method, paid_on) values (%L, %L, 15, 'transfer', '2026-10-05')$q$, bloom, a4), 'ok') || nl;

  -- 3. agenda-blokkade voor één medewerker = rij in staff_day_overrides (hele dag, geen tijden)
  r := r || pg_temp.t('F06 owner inserts full-day staff block row', 'authenticated', cb, format($q$insert into public.staff_day_overrides (owner_id, staff_id, service_id, date, kind, reason) values (%L, %L, null, '2026-12-24', 'block', 'ZZ vrij')$q$, bloom, noorrow), 'ok') || nl;
  r := r || pg_temp.t('F06b owner deletes it again (rollback of move)', 'authenticated', cb, format($q$delete from public.staff_day_overrides where owner_id = %L and reason = 'ZZ vrij'$q$, bloom), 'ok') || nl;

  -- 4. wachtlijst: eigenaar leest alle kolommen (select *) en claimt een rij
  r := r || pg_temp.t('SETUP waitlist row', 'postgres', '{}', format($q$insert into public.waitlist (id, owner_id, date, client_name, client_email, service_ids, status) values (%L, %L, '2026-10-20', 'ZZ wacht', 'zzwait@example.test', '{}'::uuid[], 'waiting')$q$, w1, bloom), 'ok') || nl;
  r := r || pg_temp.t('F07 owner reads waitlist (select *)', 'authenticated', cb, format($q$select * from public.waitlist where owner_id = %L and date = '2026-10-20' and status = 'waiting'$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('F08 owner claims the entry', 'authenticated', cb, format($q$update public.waitlist set status = 'notified', notified_at = now() where id = %L and status = 'waiting'$q$, w1), 'ok') || nl;

  raise exception E'REPORT\n%', r;
end $$;
