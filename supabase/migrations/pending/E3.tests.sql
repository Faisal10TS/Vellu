-- Tests voor pending/E3.sql. Alleen draaien in één batch die terugrolt:
--   begin; <E3.sql>; <dit bestand>   (eindigt met raise exception = rollback)
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
  bloom text := '74029064-56c2-44d1-93c2-b814db4059cf';
  u1 text := 'eeeeeeee-0000-4000-8000-0000000000e1';
  u2 text := 'eeeeeeee-0000-4000-8000-0000000000e2';
  cb jsonb := jsonb_build_object('sub', '74029064-56c2-44d1-93c2-b814db4059cf', 'role', 'authenticated', 'email', 'demo@bloomstudio.example');
  ca jsonb := '{"role":"anon"}';
  cs jsonb := '{"role":"service_role"}';
  nl text := E'\n';
begin
  -- 1. payment_events
  r := r || pg_temp.t('P01 backfill: no unprocessed rows left', 'postgres', '{}', 'select 1 from public.payment_events where processed_at is null', 'zero') || nl;
  r := r || pg_temp.t('P02 new columns exist', 'postgres', '{}', $q$select 1 from information_schema.columns where table_schema='public' and table_name='payment_events' and column_name in ('processed_at','claimed_at','outcome') having count(*) = 3$q$, 'ok') || nl;
  r := r || pg_temp.t('P03 webhook insert with claim (service_role)', 'service_role', cs, format($q$insert into public.payment_events (owner_id, mollie_payment_id, event_type, status, amount_eur, claimed_at) values (%L, 'tr_zzE3test', 'recurring.paid', 'paid', 19, now())$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P04 duplicate event still refused', 'service_role', cs, format($q$insert into public.payment_events (owner_id, mollie_payment_id, event_type, status, amount_eur, claimed_at) values (%L, 'tr_zzE3test', 'recurring.paid', 'paid', 19, now())$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P05 chargeback is its own event', 'service_role', cs, format($q$insert into public.payment_events (owner_id, mollie_payment_id, event_type, status, amount_eur, claimed_at, processed_at) values (%L, 'tr_zzE3test', 'recurring.chargeback', 'paid', 19, now(), now())$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P06 take over stale claim (CAS)', 'service_role', cs, $q$update public.payment_events set claimed_at = now() where mollie_payment_id = 'tr_zzE3test' and event_type = 'recurring.paid' and processed_at is null and claimed_at < now() + interval '1 second'$q$, 'ok') || nl;
  r := r || pg_temp.t('P07 save outcome + mark processed', 'service_role', cs, $q$update public.payment_events set outcome = '{"period_start":"2026-10-05T00:00:00Z"}'::jsonb, processed_at = now() where mollie_payment_id = 'tr_zzE3test' and event_type = 'recurring.paid'$q$, 'ok') || nl;
  r := r || pg_temp.t('P08 owner cannot mark own event processed', 'authenticated', cb, $q$update public.payment_events set processed_at = null, outcome = null where mollie_payment_id = 'tr_zzE3test'$q$, 'zero') || nl;
  r := r || pg_temp.t('P09 owner still reads own events', 'authenticated', cb, $q$select 1 from public.payment_events where mollie_payment_id = 'tr_zzE3test'$q$, 'ok') || nl;
  r := r || pg_temp.t('P10 anon reads no events', 'anon', ca, $q$select 1 from public.payment_events where mollie_payment_id = 'tr_zzE3test'$q$, 'zero') || nl;

  -- 2. support_chat_user_usage + bump_support_chat_user_usage
  r := r || pg_temp.t('C01 anon cannot read user usage', 'anon', ca, 'select 1 from public.support_chat_user_usage', 'err') || nl;
  r := r || pg_temp.t('C02 authenticated cannot write user usage', 'authenticated', cb, format('insert into public.support_chat_user_usage (user_id, day, count) values (%L, current_date, -999)', bloom), 'err') || nl;
  r := r || pg_temp.t('C03 authenticated cannot call bump', 'authenticated', cb, format('select public.bump_support_chat_user_usage(%L)', bloom), 'err') || nl;
  r := r || pg_temp.t('C04 anon cannot call bump', 'anon', ca, format('select public.bump_support_chat_user_usage(%L)', u1), 'err') || nl;
  r := r || pg_temp.t('C05 service_role bump: first = 1', 'service_role', cs, format('select 1 from public.bump_support_chat_user_usage(%L) where user_count = 1 and day_total >= 1', u1), 'ok') || nl;
  r := r || pg_temp.t('C06 service_role bump: second = 2', 'service_role', cs, format('select 1 from public.bump_support_chat_user_usage(%L) where user_count = 2', u1), 'ok') || nl;
  r := r || pg_temp.t('C07 other user: own count 1, total grows', 'service_role', cs, format('select 1 from public.bump_support_chat_user_usage(%L) where user_count = 1 and day_total >= 3', u2), 'ok') || nl;
  r := r || pg_temp.t('C08 null user refused', 'service_role', cs, 'select public.bump_support_chat_user_usage(null)', 'err') || nl;

  -- 3. bump_public_chat_ip_usage
  r := r || pg_temp.t('I01 anon cannot call ip bump', 'anon', ca, $q$select public.bump_public_chat_ip_usage('zz-e3-ip')$q$, 'err') || nl;
  r := r || pg_temp.t('I02 authenticated cannot call ip bump', 'authenticated', cb, $q$select public.bump_public_chat_ip_usage('zz-e3-ip')$q$, 'err') || nl;
  r := r || pg_temp.t('I03 service_role ip bump: first = 1', 'service_role', cs, $q$select 1 where public.bump_public_chat_ip_usage('zz-e3-ip') = 1$q$, 'ok') || nl;
  r := r || pg_temp.t('I04 service_role ip bump: second = 2', 'service_role', cs, $q$select 1 where public.bump_public_chat_ip_usage('zz-e3-ip') = 2$q$, 'ok') || nl;
  r := r || pg_temp.t('I05 other ip has own count', 'service_role', cs, $q$select 1 where public.bump_public_chat_ip_usage('zz-e3-ip2') = 1$q$, 'ok') || nl;
  r := r || pg_temp.t('I06 empty ip refused', 'service_role', cs, $q$select public.bump_public_chat_ip_usage('  ')$q$, 'err') || nl;
  r := r || pg_temp.t('I07 global day bucket untouched by ip bumps', 'postgres', '{}', $q$select 1 from public.public_chat_usage where bucket like 'ip:%:zz-e3-ip%' having count(*) = 2$q$, 'ok') || nl;
  r := r || pg_temp.t('I08 existing global bump still works', 'service_role', cs, 'select 1 from public.bump_public_chat_usage() where day_count >= 1', 'ok') || nl;

  -- 4. translate_usage + consume_translate_budget
  r := r || pg_temp.t('D01 anon cannot read translate usage', 'anon', ca, 'select 1 from public.translate_usage', 'err') || nl;
  r := r || pg_temp.t('D02 authenticated cannot call budget', 'authenticated', cb, format('select public.consume_translate_budget(%L, 10, 100, 1000000)', bloom), 'err') || nl;
  r := r || pg_temp.t('D03 within budget: 60 of 100', 'service_role', cs, format('select 1 where public.consume_translate_budget(%L, 60, 100, 1000000)', u1), 'ok') || nl;
  r := r || pg_temp.t('D04 over user budget: +50 refused', 'service_role', cs, format('select 1 where public.consume_translate_budget(%L, 50, 100, 1000000)', u1), 'zero') || nl;
  r := r || pg_temp.t('D05 refused request not booked (still 60)', 'postgres', '{}', format('select 1 from public.translate_usage where user_id = %L and chars = 60', u1), 'ok') || nl;
  r := r || pg_temp.t('D06 exactly up to budget: +40', 'service_role', cs, format('select 1 where public.consume_translate_budget(%L, 40, 100, 1000000)', u1), 'ok') || nl;
  r := r || pg_temp.t('D07 single request above user cap', 'service_role', cs, format('select 1 where public.consume_translate_budget(%L, 101, 100, 1000000)', u2), 'zero') || nl;
  r := r || pg_temp.t('D08 global cap blocks other user', 'service_role', cs, format($q$select 1 where public.consume_translate_budget(%L, 30, 100, (select coalesce(sum(chars),0)::int + 20 from public.translate_usage where day = (now() at time zone 'utc')::date))$q$, u2), 'zero') || nl;
  r := r || pg_temp.t('D09 within global cap passes', 'service_role', cs, format($q$select 1 where public.consume_translate_budget(%L, 20, 100, (select coalesce(sum(chars),0)::int + 20 from public.translate_usage where day = (now() at time zone 'utc')::date))$q$, u2), 'ok') || nl;
  r := r || pg_temp.t('D10 zero chars always ok', 'service_role', cs, format('select 1 where public.consume_translate_budget(%L, 0, 100, 0)', u2), 'ok') || nl;
  r := r || pg_temp.t('D11 null user refused', 'service_role', cs, 'select 1 where public.consume_translate_budget(null, 10, 100, 1000)', 'zero') || nl;

  raise exception E'REPORT\n%', r;
end $$;
