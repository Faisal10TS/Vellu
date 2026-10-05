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
  victim  text := '0af0ac31-b994-485d-9e6c-0852fad12feb';
  noor    text := '7ea0a9c9-a823-4bfd-99f1-58899dec4c85';
  noorrow text := '6246e170-f838-46fc-93c9-d3d8cc18cc39';
  newu    text := 'd2431923-17bc-4266-8e03-683a260c07a7';
  cl1     text := 'aaaaaaaa-0000-4000-8000-000000000001';
  cl3     text := 'aaaaaaaa-0000-4000-8000-000000000003';
  cb  jsonb := jsonb_build_object('sub', '74029064-56c2-44d1-93c2-b814db4059cf', 'role', 'authenticated', 'email', 'demo@bloomstudio.example');
  cn  jsonb := jsonb_build_object('sub', '7ea0a9c9-a823-4bfd-99f1-58899dec4c85', 'role', 'authenticated', 'email', 'staff@bloomstudio.example');
  cv  jsonb := jsonb_build_object('sub', '0af0ac31-b994-485d-9e6c-0852fad12feb', 'role', 'authenticated', 'email', 'victim@example.test');
  cnu jsonb := jsonb_build_object('sub', 'd2431923-17bc-4266-8e03-683a260c07a7', 'role', 'authenticated', 'email', 'faisalelmourabit4@gmail.com');
  cc1 jsonb := jsonb_build_object('sub', 'aaaaaaaa-0000-4000-8000-000000000001', 'role', 'authenticated', 'email', 'zzclaim@example.test');
  cc3 jsonb := jsonb_build_object('sub', 'aaaaaaaa-0000-4000-8000-000000000003', 'role', 'authenticated', 'email', 'zzclaim2@example.test');
  ca  jsonb := '{"role":"anon"}';
  cs  jsonb := '{"role":"service_role"}';
  row1 text; row2 text; selfrow text;
  nl text := E'\n';
begin
  -- staff: aanvallen en normaal gebruik door Noor (medewerker van Bloom)
  r := r || pg_temp.t('S01 staff re-points own owner_id', 'authenticated', cn, format('update public.staff_members set owner_id = %L where id = %L', victim, noorrow), 'err') || nl;
  r := r || pg_temp.t('S02 staff hours + feed token', 'authenticated', cn, format($q$update public.staff_members set working_hours = working_hours || '{"zz":1}'::jsonb, calendar_feed_token = 'zztoken0123456789012345678901234567890123456789' where id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('S03 staff invoice fields + stale counter', 'authenticated', cn, format($q$update public.staff_members set address='ZZ 1', kvk_number='123', btw_id='NL1', iban='NL91ABNA0417164300', iban_holder='Noor', payment_link='https://bunq.me/zz', invoice_prefix='ZZ', next_invoice_number=999 where id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('S03b counter kept at old value', 'postgres', '{}', format('select 1 from public.staff_members where id = %L and next_invoice_number = 1', noorrow), 'ok') || nl;
  r := r || pg_temp.t('S04 staff deactivates/reactivates self', 'authenticated', cn, format('update public.staff_members set active = false where id = %L', noorrow), 'err') || nl;
  r := r || pg_temp.t('S05 staff renames self', 'authenticated', cn, format($q$update public.staff_members set name = 'ZZ' where id = %L$q$, noorrow), 'err') || nl;
  r := r || pg_temp.t('S06 staff re-binds user_id', 'authenticated', cn, format('update public.staff_members set user_id = %L where id = %L', victim, noorrow), 'err') || nl;
  r := r || pg_temp.t('S07 staff changes own email', 'authenticated', cn, format($q$update public.staff_members set email = 'zz@example.test' where id = %L$q$, noorrow), 'err') || nl;

  -- staff: eigenaar Bloom
  r := r || pg_temp.t('O01 owner edits her stylist', 'authenticated', cb, format($q$update public.staff_members set name='Noor de Vries', role='Nail stylist', email='staff@bloomstudio.example', bio='zz', working_hours=working_hours, iban='NL91ABNA0417164300', iban_holder='Noor de Vries', payment_link=null, avatar_url=null, active=true, position=1 where id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('O02 owner moves stylist to other salon', 'authenticated', cb, format('update public.staff_members set owner_id = %L where id = %L', victim, noorrow), 'err') || nl;
  r := r || pg_temp.t('O03 owner binds stylist to someone else', 'authenticated', cb, format('update public.staff_members set user_id = %L where id = %L', victim, noorrow), 'err') || nl;
  r := r || pg_temp.t('O04 owner adds stylist (StaffAdder)', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, role, email, working_hours) values (%L, 'ZZ guard 1', 'Test', 'zzclaim@example.test', '{}'::jsonb)$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('O04b owner adds 2nd stylist', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, email) values (%L, 'ZZ guard 2', 'zzclaim2@example.test')$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('O05 owner inserts row bound to other user', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, user_id) values (%L, 'ZZ evil', %L)$q$, bloom, victim), 'err') || nl;
  r := r || pg_temp.t('O06 owner inserts row in other salon', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name) values (%L, 'ZZ evil')$q$, victim), 'err') || nl;
  r := r || pg_temp.t('O07 owner adds herself as stylist', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, user_id) values (%L, 'ZZ self', %L)$q$, bloom, bloom), 'ok') || nl;
  select id::text into selfrow from public.staff_members where owner_id = bloom::uuid and name = 'ZZ self';
  r := r || pg_temp.t('O08 attack chain: self row -> other salon', 'authenticated', cb, format('update public.staff_members set owner_id = %L where id = %L', victim, selfrow), 'err') || nl;
  select id::text into row1 from public.staff_members where owner_id = bloom::uuid and name = 'ZZ guard 1';
  select id::text into row2 from public.staff_members where owner_id = bloom::uuid and name = 'ZZ guard 2';

  -- uitnodiging claimen: sinds fix-all deel B (20261005155531) kan de browser
  -- niet meer op e-mailadres claimen (alleen claim_staff_invite met de gemailde
  -- token, getest in DB.tests.sql). Elke poging raakt dus 0 rijen.
  r := r || pg_temp.t('C01 e-mail claim no longer possible (matching e-mail)', 'authenticated', cc1, format('update public.staff_members set user_id = %L where id = %L and user_id is null', cl1, row1), 'zero') || nl;
  r := r || pg_temp.t('C02 claim with other e-mail', 'authenticated', cc1, format('update public.staff_members set user_id = %L where id = %L and user_id is null', cl1, row2), 'zero') || nl;
  r := r || pg_temp.t('C03 claim binding someone else', 'authenticated', cc3, format('update public.staff_members set user_id = %L where id = %L and user_id is null', victim, row2), 'zero') || nl;
  r := r || pg_temp.t('C04 claim + rename in one go', 'authenticated', cc3, format($q$update public.staff_members set user_id = %L, name = 'ZZ x' where id = %L and user_id is null$q$, cl3, row2), 'zero') || nl;
  r := r || pg_temp.t('C05 server links row 2 (create-staff-account / claim_staff_invite)', 'service_role', cs, format('update public.staff_members set user_id = %L where id = %L and user_id is null', cl3, row2), 'ok') || nl;
  r := r || pg_temp.t('C06 claimed staff edits hours', 'authenticated', cc3, format($q$update public.staff_members set working_hours = '{"1":{"open":"09:00","close":"17:00","closed":false}}'::jsonb where id = %L$q$, row2), 'ok') || nl;
  r := r || pg_temp.t('C07 owner deletes a stylist', 'authenticated', cb, format('delete from public.staff_members where id = %L', row1), 'ok') || nl;
  r := r || pg_temp.t('C08 service_role sets user_id (create-staff-account)', 'service_role', cs, format('update public.staff_members set user_id = %L, email = %L where id = %L', cl1, 'zz3@example.test', row2), 'ok') || nl;

  -- profiles: aanvallen door eigenaar Bloom (abonnement actief, geen proef)
  r := r || pg_temp.t('P01 plan change outside trial', 'authenticated', cb, format($q$update public.profiles set plan = 'starter' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P02 plan_expires_at', 'authenticated', cb, format($q$update public.profiles set plan_expires_at = '2099-01-01' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P03 subscription_status', 'authenticated', cb, format($q$update public.profiles set subscription_status = 'trialing' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P04 is_demo', 'authenticated', cb, format('update public.profiles set is_demo = false where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('P05 mollie_subscription_id', 'authenticated', cb, format($q$update public.profiles set mollie_subscription_id = 'sub_zz' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P06 referral credit', 'authenticated', cb, format('update public.profiles set referral_credit_days = 99 where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('P07 google token', 'authenticated', cb, format($q$update public.profiles set google_refresh_token = 'zz' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P08 invoice counter', 'authenticated', cb, format('update public.profiles set next_invoice_number = 999 where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('P08b referred_by reset', 'authenticated', cb, format('update public.profiles set referred_by = %L where id = %L', victim, bloom), 'err') || nl;
  -- profiles: normaal gebruik
  r := r || pg_temp.t('P09 big Save + settings columns', 'authenticated', cb, format($q$update public.profiles set business_name='Bloom Studio', city='Amsterdam', accent_color='#8A7356', iban='NL91ABNA0417164300', booking_policy='zz', day_overrides='{}'::jsonb, slug='bloomstudio', invoice_profiles='[]'::jsonb, onboarding_done_at=now(), staff_view_revenue=true, calendar_feed_token='zzfeed0123456789012345678901234567890123456789', prepay_enabled=true, country_code='NL', btw_rate=21, discount_codes='[]'::jsonb where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P10 email casing (signup upsert)', 'authenticated', cb, format($q$update public.profiles set email = 'Demo@BloomStudio.example' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P11 email to another address', 'authenticated', cb, format($q$update public.profiles set email = 'other@example.test' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P12 delete own profile', 'authenticated', cb, format('delete from public.profiles where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('P13 signup upsert on existing row', 'authenticated', cb, format($q$insert into public.profiles (id, email, business_name, slug, city, country_code, accent_color, account_type) values (%L, 'demo@bloomstudio.example', 'Bloom Studio', 'bloomstudio', 'Amsterdam', 'NL', '#8A7356', 'joint') on conflict (id) do update set id = excluded.id, email = excluded.email, business_name = excluded.business_name, slug = excluded.slug, city = excluded.city, country_code = excluded.country_code, accent_color = excluded.accent_color, account_type = excluded.account_type$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P14 new profile with plan', 'authenticated', cnu, format($q$insert into public.profiles (id, email, business_name, slug, city, plan, subscription_status) values (%L, 'x@example.test', 'ZZ', 'zz-guard-a', 'Test', 'professional', 'active')$q$, newu), 'err') || nl;
  r := r || pg_temp.t('P15 new profile for someone else', 'authenticated', cnu, format($q$insert into public.profiles (id, email, business_name, slug, city) values (%L, 'x@example.test', 'ZZ', 'zz-guard-b', 'Test')$q$, victim), 'err') || nl;
  r := r || pg_temp.t('P15b new profile with foreign e-mail', 'authenticated', cnu, format($q$insert into public.profiles (id, email, business_name, slug, city) values (%L, 'someone.else@example.test', 'ZZ', 'zz-guard-d', 'Test')$q$, newu), 'err') || nl;
  r := r || pg_temp.t('P16 new profile, plain signup', 'authenticated', cnu, format($q$insert into public.profiles (id, email, business_name, slug, city, country_code, accent_color, account_type) values (%L, 'faisalelmourabit4@gmail.com', 'ZZ', 'zz-guard-c', 'Test', 'NL', '#c9a96e', 'joint')$q$, newu), 'ok') || nl;
  r := r || pg_temp.t('P16b referral code generated', 'postgres', '{}', format('select 1 from public.profiles where id = %L and referral_code is not null', newu), 'ok') || nl;
  r := r || pg_temp.t('P16c signup upsert, typed casing', 'authenticated', cnu, format($q$insert into public.profiles (id, email, business_name, slug, city, country_code, accent_color, account_type) values (%L, 'FaisalElMourabit4@Gmail.com', 'ZZ', 'zz-guard-c', 'Test', 'NL', '#c9a96e', 'joint') on conflict (id) do update set id = excluded.id, email = excluded.email, business_name = excluded.business_name, slug = excluded.slug, city = excluded.city, country_code = excluded.country_code, accent_color = excluded.accent_color, account_type = excluded.account_type$q$, newu), 'ok') || nl;
  r := r || pg_temp.t('P17 service_role writes billing', 'service_role', cs, format('update public.profiles set plan_expires_at = now() + interval %L where id = %L', '1 day', bloom), 'ok') || nl;
  r := r || pg_temp.t('P18 definer RPC next_receipt_number', 'authenticated', cb, format('select public.next_receipt_number(%L::uuid)', bloom), 'ok') || nl;
  r := r || pg_temp.t('P19 staff updates salon profile', 'authenticated', cn, format($q$update public.profiles set business_name = 'ZZ' where id = %L$q$, bloom), 'zero') || nl;
  r := r || pg_temp.t('P20 anon updates a profile', 'anon', ca, format($q$update public.profiles set business_name = 'ZZ' where id = %L$q$, bloom), 'zero') || nl;
  -- proef: Starter <-> Professional
  r := r || pg_temp.t('P21 setup: Bloom on trial (server)', 'postgres', '{}', format($q$update public.profiles set subscription_status = 'trialing', plan = 'starter' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P22 trial upgrade to Professional', 'authenticated', cb, format($q$update public.profiles set plan = 'professional' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P23 trial back to Starter', 'authenticated', cb, format($q$update public.profiles set plan = 'starter' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P24 trial plan + expiry together', 'authenticated', cb, format($q$update public.profiles set plan = 'professional', plan_expires_at = '2099-01-01' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P25 trial ends own trial (status)', 'authenticated', cb, format($q$update public.profiles set subscription_status = 'active' where id = %L$q$, bloom), 'err') || nl;

  -- storage
  perform set_config('storage.allow_delete_query', 'true', true);
  r := r || pg_temp.t('T01 anon uploads service photo', 'anon', ca, format($q$insert into storage.objects (bucket_id, name) values ('service-photos', %L)$q$, bloom || '/svc/zz-anon.jpg'), 'err') || nl;
  r := r || pg_temp.t('T02 other owner uploads into Bloom', 'authenticated', cv, format($q$insert into storage.objects (bucket_id, name, owner) values ('business-images', %L, %L)$q$, bloom || '/zz-evil.jpg', victim), 'err') || nl;
  r := r || pg_temp.t('T03 owner logo upload', 'authenticated', cb, format($q$insert into storage.objects (bucket_id, name, owner) values ('business-images', %L, %L)$q$, bloom || '/zz-guard-logo.jpg', bloom), 'ok') || nl;
  r := r || pg_temp.t('T04 owner service photo upload', 'authenticated', cb, format($q$insert into storage.objects (bucket_id, name, owner) values ('service-photos', %L, %L)$q$, bloom || '/svc/zz-guard-owner.jpg', bloom), 'ok') || nl;
  r := r || pg_temp.t('T05 staff service photo upload', 'authenticated', cn, format($q$insert into storage.objects (bucket_id, name, owner) values ('service-photos', %L, %L)$q$, bloom || '/svc/zz-guard-noor.jpg', noor), 'ok') || nl;
  r := r || pg_temp.t('T06 staff uploads business image', 'authenticated', cn, format($q$insert into storage.objects (bucket_id, name, owner) values ('business-images', %L, %L)$q$, bloom || '/zz-noor.jpg', noor), 'err') || nl;
  r := r || pg_temp.t('T07 staff uploads into other salon', 'authenticated', cn, format($q$insert into storage.objects (bucket_id, name, owner) values ('service-photos', %L, %L)$q$, victim || '/svc/zz.jpg', noor), 'err') || nl;
  r := r || pg_temp.t('T08 non-uuid folder (no cast error)', 'authenticated', cn, $q$insert into storage.objects (bucket_id, name) values ('service-photos', 'not-a-uuid/zz.jpg')$q$, 'err') || nl;
  r := r || pg_temp.t('T09 anon deletes logo', 'anon', ca, format($q$delete from storage.objects where bucket_id = 'business-images' and name = %L$q$, bloom || '/zz-guard-logo.jpg'), 'zero') || nl;
  r := r || pg_temp.t('T10 other owner deletes Bloom photo', 'authenticated', cv, format($q$delete from storage.objects where bucket_id = 'service-photos' and name = %L$q$, bloom || '/svc/zz-guard-owner.jpg'), 'zero') || nl;
  r := r || pg_temp.t('T11 staff deletes owner photo', 'authenticated', cn, format($q$delete from storage.objects where bucket_id = 'service-photos' and name = %L$q$, bloom || '/svc/zz-guard-owner.jpg'), 'ok') || nl;
  r := r || pg_temp.t('T12 owner deletes staff photo', 'authenticated', cb, format($q$delete from storage.objects where bucket_id = 'service-photos' and name = %L$q$, bloom || '/svc/zz-guard-noor.jpg'), 'ok') || nl;
  r := r || pg_temp.t('T13 staff deletes business image', 'authenticated', cn, format($q$delete from storage.objects where bucket_id = 'business-images' and name = %L$q$, bloom || '/zz-guard-logo.jpg'), 'zero') || nl;
  r := r || pg_temp.t('T14 owner deletes own logo', 'authenticated', cb, format($q$delete from storage.objects where bucket_id = 'business-images' and name = %L$q$, bloom || '/zz-guard-logo.jpg'), 'ok') || nl;
  r := r || pg_temp.t('T15 setup: staff may not edit catalog', 'postgres', '{}', format('update public.profiles set staff_can_edit_services = false where id = %L', bloom), 'ok') || nl;
  r := r || pg_temp.t('T16 staff upload when not allowed', 'authenticated', cn, format($q$insert into storage.objects (bucket_id, name, owner) values ('service-photos', %L, %L)$q$, bloom || '/svc/zz-guard-noor2.jpg', noor), 'err') || nl;
  r := r || pg_temp.t('T17 bucket size limit set', 'postgres', '{}', $q$select 1 from storage.buckets where id in ('business-images','service-photos') and file_size_limit = 10485760 having count(*) = 2$q$, 'ok') || nl;
  r := r || pg_temp.t('T17b buckets accept images only, no svg', 'postgres', '{}', $q$select 1 from storage.buckets where id in ('business-images','service-photos') and 'image/jpeg' = any(allowed_mime_types) and 'image/webp' = any(allowed_mime_types) and not ('image/svg+xml' = any(allowed_mime_types)) having count(*) = 2$q$, 'ok') || nl;
  r := r || pg_temp.t('T18 db-backups still closed to users', 'authenticated', cb, $q$insert into storage.objects (bucket_id, name) values ('db-backups', '74029064-56c2-44d1-93c2-b814db4059cf/zz.json')$q$, 'err') || nl;

  raise exception E'REPORT\n%', r;
end $$;
