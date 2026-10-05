-- Tests voor pending/DB.sql. Alleen draaien in ÉÉN batch die eindigt met een
-- exception (alles wordt teruggedraaid):
--   begin; <pending/DB.sql>; <dit bestand>
-- Het rapport (PASS/FAIL per regel) komt terug in de fouttekst.
-- Rollen worden gesimuleerd met request.jwt.claims + set role, zoals PostgREST.

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

create function pg_temp.chk(p_label text, p_ok boolean, p_info text default '')
returns text language sql as $f$
  select case when coalesce(p_ok, false) then 'PASS ' else 'FAIL ' end || p_label
         || case when p_info <> '' then ' (' || p_info || ')' else '' end
$f$;

-- Neemt de plek in van net.http_post: geeft alleen de headers terug, zodat het
-- cron-commando veilig kan worden uitgevoerd (er gaat niets de deur uit).
create function pg_temp.fake_post(url text, headers jsonb, body jsonb)
returns jsonb language sql as $f$ select headers $f$;

do $$
declare
  r text := '';
  nl text := E'\n';
  bloom   uuid := '74029064-56c2-44d1-93c2-b814db4059cf';
  noor    uuid := '7ea0a9c9-a823-4bfd-99f1-58899dec4c85';
  noorrow uuid := '6246e170-f838-46fc-93c9-d3d8cc18cc39';
  victim  uuid := '0af0ac31-b994-485d-9e6c-0852fad12feb';
  mw      uuid := 'fdcd099d-612d-4fed-ad9d-7c3ce180dd9e';
  ttnb_a  uuid := 'f9ad99a9-0ec7-4b2d-af9c-d9245c4426b8';
  ttnb_b  uuid := '302a6ead-a3c2-4610-8e8b-8ca7a2945e24';
  cl1     uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  cl3     uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  cb  jsonb := jsonb_build_object('sub', '74029064-56c2-44d1-93c2-b814db4059cf', 'role', 'authenticated', 'email', 'demo@bloomstudio.example');
  cn  jsonb := jsonb_build_object('sub', '7ea0a9c9-a823-4bfd-99f1-58899dec4c85', 'role', 'authenticated', 'email', 'staff@bloomstudio.example');
  cv  jsonb := jsonb_build_object('sub', '0af0ac31-b994-485d-9e6c-0852fad12feb', 'role', 'authenticated', 'email', 'auraglownailss@gmail.com');
  cc1 jsonb := jsonb_build_object('sub', 'aaaaaaaa-0000-4000-8000-000000000001', 'role', 'authenticated', 'email', 'zzclaim@example.test');
  cc3 jsonb := jsonb_build_object('sub', 'aaaaaaaa-0000-4000-8000-000000000003', 'role', 'authenticated', 'email', 'zzclaim2@example.test');
  ca  jsonb := '{"role":"anon"}';
  cs  jsonb := '{"role":"service_role"}';
  -- testdata
  colrow uuid; svc uuid; svc_dur int; hidden_svc uuid; vsvc uuid;
  cl_own uuid; cl_foreign uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a_pend uuid; a_paidat uuid; a_canc uuid; a_lure uuid;
  a_rev uuid; rev_id uuid; a_code uuid; a_code2 uuid;
  pid uuid; pid_null uuid; pid_hidden uuid; pid_starter uuid;
  blk_own uuid; blk_col uuid; wl1 uuid;
  inv_row uuid; inv_row2 uuid; tok text; tok_hash text; hu_staffrow uuid;
  tm1 uuid; tm2 uuid; tm3 uuid; a_full uuid; a_free uuid; self_row uuid; self_row2 uuid; inv_self uuid; inv_row3 uuid;
  hu1 uuid := gen_random_uuid(); hu2 uuid := gen_random_uuid(); hu3 uuid := gen_random_uuid(); hu4 uuid := gen_random_uuid();
  zzref uuid := gen_random_uuid(); zzold uuid := gen_random_uuid();
  chu1 jsonb;
  czzref jsonb;
  czzold jsonb;
  bcode text; vcode text; vcredit_before int; zzcredit_before int; rdays int; nint int; nint2 int;
  mwcount bigint; mwvar bigint; v_secret text; h jsonb; j record;
  n1 bigint; n2 bigint; n3 bigint; n4 bigint; n5 bigint; exp1 bigint;
begin
  chu1 := jsonb_build_object('sub', hu1, 'role', 'authenticated', 'email', 'zz-hu1@example.test');
  czzref := jsonb_build_object('sub', zzref, 'role', 'authenticated', 'email', 'zz-ref1@example.test');
  czzold := jsonb_build_object('sub', zzold, 'role', 'authenticated', 'email', 'zz-old1@example.test');

  -- ── bezette tijden (vóór de eigen testafspraken, zodat de vergelijking met
  --    de oude query alleen echte data ziet) ──────────────────────────────────
  r := r || pg_temp.t('GB01 TTNB team part 1 (Esther 14:00, 110)', 'anon', ca, format($q$select 1 from public.get_booked_slots('ttnbdenhaag', '2026-09-22') g where g.time = '14:00' and g.service_duration = 110 and g.staff_id = %L$q$, ttnb_a), 'ok') || nl;
  r := r || pg_temp.t('GB02 TTNB team part 2 (Lady 15:50, 90)', 'anon', ca, format($q$select 1 from public.get_booked_slots('ttnbdenhaag', '2026-09-22') g where g.time = '15:50' and g.service_duration = 90 and g.staff_id = %L$q$, ttnb_b), 'ok') || nl;
  r := r || pg_temp.t('GB03 no whole-booking row for team booking', 'anon', ca, format($q$select 1 from public.get_booked_slots('ttnbdenhaag', '2026-09-22') g where g.time = '14:00' and g.service_duration = 200 and g.staff_id = %L$q$, ttnb_a), 'zero') || nl;
  r := r || pg_temp.t('GB04 range = single for that date', 'anon', ca, $q$select 1 where (select count(*) from public.get_booked_slots_range('ttnbdenhaag', '2026-09-22', '2026-09-22')) = (select count(*) from public.get_booked_slots('ttnbdenhaag', '2026-09-22')) and (select count(*) from public.get_booked_slots('ttnbdenhaag', '2026-09-22')) > 0$q$, 'ok') || nl;
  -- Oud (huidige functie) tegen nieuw over ALLE salons en datums. Een oude rij
  -- die verdwijnt, moet een kassaverkoop zijn of een afspraak die in delen is
  -- uitgesplitst; en nieuw = oud - verkopen - uitgesplitste + hun delen.
  select count(*) into n1 from (
    select p.slug, a.date, a.time, a.service_duration, a.staff_id
      from public.appointments a join public.profiles p on p.id = a.owner_id
     where a.status in ('confirmed', 'completed', 'pending_payment') and p.slug is not null
    except all
    select p.slug, g.date, g.time, g.service_duration, g.staff_id
      from public.profiles p cross join lateral public.get_booked_slots_range(p.slug, '1900-01-01', '2999-12-31') g
     where p.slug is not null
  ) x
  where not exists (
    select 1 from public.appointments a join public.profiles p on p.id = a.owner_id
     where p.slug = x.slug and a.date = x.date and a.time = x.time
       and a.service_duration is not distinct from x.service_duration and a.staff_id is not distinct from x.staff_id
       and (coalesce(a.is_sale, false)
            or (a.service_id is null and coalesce(a.service_duration, 0) = 0 and jsonb_typeof(a.products) = 'array' and jsonb_array_length(a.products) > 0)
            or exists (select 1 from jsonb_array_elements(a.service_breakdown) e
                        where coalesce(e ->> 'staff_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')));
  select count(*) into n2
    from public.profiles p cross join lateral public.get_booked_slots_range(p.slug, '1900-01-01', '2999-12-31') g
   where p.slug is not null;
  select count(*),
         count(*) filter (where coalesce(a.is_sale, false)
                            or (a.service_id is null and coalesce(a.service_duration, 0) = 0 and jsonb_typeof(a.products) = 'array' and jsonb_array_length(a.products) > 0)),
         count(*) filter (where not (coalesce(a.is_sale, false)
                                     or (a.service_id is null and coalesce(a.service_duration, 0) = 0 and jsonb_typeof(a.products) = 'array' and jsonb_array_length(a.products) > 0))
                            and exists (select 1 from jsonb_array_elements(a.service_breakdown) e
                                         where coalesce(e ->> 'staff_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),
         coalesce(sum(jsonb_array_length(a.service_breakdown))
                  filter (where not (coalesce(a.is_sale, false)
                                     or (a.service_id is null and coalesce(a.service_duration, 0) = 0 and jsonb_typeof(a.products) = 'array' and jsonb_array_length(a.products) > 0))
                            and exists (select 1 from jsonb_array_elements(a.service_breakdown) e
                                         where coalesce(e ->> 'staff_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')), 0)
    into n3, exp1, n4, n5
    from public.appointments a join public.profiles p on p.id = a.owner_id
   where a.status in ('confirmed', 'completed', 'pending_payment') and p.slug is not null;
  r := r || pg_temp.chk('GB05 every vanished row is a sale or a split booking', n1 = 0, format('unexplained=%s', n1)) || nl;
  r := r || pg_temp.chk('GB06 new = old - sales - split + parts', n2 = n3 - exp1 - n4 + n5,
                        format('old=%s new=%s sales=%s split=%s parts=%s', n3, n2, exp1, n4, n5)) || nl;
  r := r || pg_temp.t('GB07 range ordered by date, time, staff', 'anon', ca, $q$with g as (select x.d, x.t, x.o from public.get_booked_slots_range('ttnbdenhaag', '2026-01-01', '2026-12-31') with ordinality as x(d, t, dur, sid, o)) select 1 where exists (select 1 from g) and not exists (select 1 from g g1 join g g2 on g2.o = g1.o + 1 where (g2.d, g2.t) < (g1.d, g1.t))$q$, 'ok') || nl;

  -- ── testdata (als postgres) ─────────────────────────────────────────────
  update public.profiles set staff_see_all = false, staff_view_revenue = true, staff_view_client_contact = true,
         staff_can_edit_services = true where id = bloom;
  update public.staff_members set active = true where id = noorrow;
  insert into public.staff_members (owner_id, name, active, iban, email)
  values (bloom, 'ZZ colleague', true, 'NL91ABNA0417164300', 'zz-colleague@example.test') returning id into colrow;
  select s.id, s.duration into svc, svc_dur from public.services s where s.owner_id = bloom and s.visible order by s.position, s.id limit 1;
  insert into public.services (owner_id, name, name_nl, duration, price, visible)
  values (bloom, 'ZZ hidden', 'ZZ hidden', 30, 10, false) returning id into hidden_svc;
  select s.id into vsvc from public.services s where s.owner_id = victim limit 1;
  insert into public.clients (email, first_name, phone) values ('zz-own@example.test', 'ZZ', '+31 6 111') returning id into cl_own;
  insert into public.clients (email, first_name, phone, allergies) values ('zz-foreign@example.test', 'Foreign', '+31 6 999', 'latex') returning id into cl_foreign;
  insert into public.appointments (owner_id, date, time, client_name, client_email, client_id, service_name, status)
  values (victim, current_date + 2, '10:00', 'Foreign', 'zz-foreign@example.test', cl_foreign, 'ZZ', 'confirmed');
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time,
                                   client_name, client_email, client_id, staff_id, status, payment_method, amount_paid, paid_at,
                                   products, service_breakdown, tax_snapshot, cash_received, discount_amount, no_show_fee)
  values (bloom, svc, 'ZZ a1', 50, 30, current_date + 1, '09:00', 'ZZ Own', 'zz-own@example.test', cl_own, noorrow,
          'confirmed', 'prepaid', 20, now(),
          jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', 'ZZ oil', 'price', 5, 'qty', 1)),
          jsonb_build_array(jsonb_build_object('label', 'ZZ', 'duration', 30, 'price', 50, 'staff_id', noorrow, 'offset_min', 0, 'service_id', svc)),
          '{"grand_total": 50}'::jsonb, 10, 2, 1)
  returning id into a1;
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, payment_method)
  values (bloom, svc, 'ZZ a2', 40, 30, current_date + 1, '12:00', 'ZZ Two', 'zz-two@example.test', colrow, 'confirmed', 'on-arrival') returning id into a2;
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, status, payment_method)
  values (bloom, svc, 'ZZ a3', 30, 30, current_date + 1, '14:00', 'ZZ Three', 'zz-three@example.test', 'confirmed', 'on-arrival') returning id into a3;
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, payment_method)
  values (bloom, svc, 'ZZ a4', 35, 30, current_date + 40, '10:00', 'ZZ Four', 'zz-four@example.test', noorrow, 'confirmed', 'on-arrival') returning id into a4;
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, payment_method, payment_due_at)
  values (bloom, svc, 'ZZ pend', 25, 30, current_date + 3, '10:00', 'ZZ Pend', 'zz-pend@example.test', noorrow, 'pending_payment', 'prepay', now() + interval '1 day') returning id into a_pend;
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, payment_method, paid_at)
  values (bloom, svc, 'ZZ paidat', 60, 30, current_date - 1, '10:00', 'ZZ Paid', 'zz-paid@example.test', noorrow, 'completed', 'pin', now()) returning id into a_paidat;
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, payment_method)
  values (bloom, svc, 'ZZ canc', 25, 30, current_date + 3, '11:00', 'ZZ Canc', 'zz-canc@example.test', noorrow, 'cancelled', 'on-arrival') returning id into a_canc;
  insert into public.appointments (owner_id, date, time, client_name, client_email, service_name, status)
  values (bloom, current_date + 5, '10:00', 'Lure', 'zz-foreign@example.test', 'ZZ lure', 'confirmed') returning id into a_lure;
  -- Volledig vooruitbetaald (45 van 45) en gratis (0, niets betaald).
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, payment_method, amount_paid, paid_at)
  values (bloom, svc, 'ZZ full', 45, 30, current_date + 2, '16:00', 'ZZ Full', 'zz-full@example.test', noorrow, 'confirmed', 'prepaid', 45, '2026-01-01 10:00+00') returning id into a_full;
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, payment_method)
  values (bloom, svc, 'ZZ free', 0, 30, current_date + 2, '17:00', 'ZZ Free', 'zz-free@example.test', noorrow, 'confirmed', 'on-arrival') returning id into a_free;

  -- ── bezette tijden: verlengde duur, deel zonder stylist ─────────────────
  -- tm1: duur 120, delen Noor 0-30 en collega 30-60 (de eigenaar verlengde
  --      alleen de duur) -> het laatste deel loopt door tot het eind: 13:30, 90.
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, service_breakdown)
  values (bloom, svc, 'ZZ team long', 80, 120, current_date + 9, '13:00', 'ZZ Team', 'zz-team@example.test', noorrow, 'confirmed',
          jsonb_build_array(jsonb_build_object('duration', 30, 'staff_id', noorrow, 'offset_min', 0, 'service_id', svc),
                            jsonb_build_object('duration', 30, 'staff_id', colrow, 'offset_min', 30, 'service_id', svc)))
  returning id into tm1;
  -- tm2: deel 1 zonder stylist maar in staff_assignments (collega), deel 2
  --      Noor, deel 3 zonder stylist en zonder toewijzing -> staff_id van de
  --      afspraak (Noor), nooit NULL (dat zou de hele salon blokkeren).
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, staff_assignments, service_breakdown)
  values (bloom, svc, 'ZZ team mixed', 90, 90, current_date + 10, '09:00', 'ZZ Team', 'zz-team@example.test', noorrow, 'confirmed',
          jsonb_build_object(hidden_svc::text, colrow::text),
          jsonb_build_array(jsonb_build_object('duration', 30, 'staff_id', null, 'offset_min', 0, 'service_id', hidden_svc),
                            jsonb_build_object('duration', 30, 'staff_id', noorrow, 'offset_min', 30, 'service_id', svc),
                            jsonb_build_object('duration', 30, 'staff_id', '', 'offset_min', 60, 'service_id', gen_random_uuid())))
  returning id into tm2;
  -- tm3: verdeling langer dan de duur (eigenaar verkortte de duur): de delen
  --      blijven zoals ze zijn.
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, staff_id, status, service_breakdown)
  values (bloom, svc, 'ZZ team short', 80, 30, current_date + 11, '15:00', 'ZZ Team', 'zz-team@example.test', noorrow, 'confirmed',
          jsonb_build_array(jsonb_build_object('duration', 30, 'staff_id', noorrow, 'offset_min', 0, 'service_id', svc),
                            jsonb_build_object('duration', 30, 'staff_id', colrow, 'offset_min', 30, 'service_id', svc)))
  returning id into tm3;
  r := r || pg_temp.t('GB08 extended duration: first part as is', 'anon', ca, format($q$select 1 from public.get_booked_slots('bloomstudio', current_date + 9) g where g.time = '13:00' and g.service_duration = 30 and g.staff_id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('GB08b extended duration: last part runs to the end', 'anon', ca, format($q$select 1 from public.get_booked_slots('bloomstudio', current_date + 9) g where g.time = '13:30' and g.service_duration = 90 and g.staff_id = %L$q$, colrow), 'ok') || nl;
  r := r || pg_temp.t('GB08c no short 30-min row left', 'anon', ca, format($q$select 1 from public.get_booked_slots('bloomstudio', current_date + 9) g where g.time = '13:30' and g.service_duration = 30 and g.staff_id = %L$q$, colrow), 'zero') || nl;
  r := r || pg_temp.t('GB09 staff-less part -> staff_assignments', 'anon', ca, format($q$select 1 from public.get_booked_slots('bloomstudio', current_date + 10) g where g.time = '09:00' and g.service_duration = 30 and g.staff_id = %L$q$, colrow), 'ok') || nl;
  r := r || pg_temp.t('GB09b own stylist part', 'anon', ca, format($q$select 1 from public.get_booked_slots('bloomstudio', current_date + 10) g where g.time = '09:30' and g.service_duration = 30 and g.staff_id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('GB09c staff-less, unassigned part -> appointment stylist', 'anon', ca, format($q$select 1 from public.get_booked_slots('bloomstudio', current_date + 10) g where g.time = '10:00' and g.service_duration = 30 and g.staff_id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('GB09d no NULL-staff row from the mixed booking', 'anon', ca, $q$select 1 from public.get_booked_slots('bloomstudio', current_date + 10) g where g.time in ('09:00', '09:30', '10:00') and g.staff_id is null$q$, 'zero') || nl;
  r := r || pg_temp.t('GB10 parts longer than duration stay', 'anon', ca, format($q$select 1 from public.get_booked_slots('bloomstudio', current_date + 11) g where (g.time, g.service_duration, g.staff_id) in (('15:00', 30, %L::uuid), ('15:30', 30, %L::uuid)) having count(*) = 2$q$, noorrow, colrow), 'ok') || nl;

  -- ── 1. producten ────────────────────────────────────────────────────────
  insert into public.products (owner_id, name_nl, price, stock, visible_online, purchase_price) values (bloom, 'ZZ stock', 9, 5, true, 3) returning id into pid;
  insert into public.products (owner_id, name_nl, price, stock, visible_online) values (bloom, 'ZZ nostock', 9, null, true) returning id into pid_null;
  insert into public.products (owner_id, name_nl, price, visible_online) values (bloom, 'ZZ hidden prod', 9, false) returning id into pid_hidden;
  insert into public.products (owner_id, name_nl, price, visible_online) values (victim, 'ZZ starter prod', 9, true) returning id into pid_starter;
  r := r || pg_temp.t('PR01 anon reads products table', 'anon', ca, format('select 1 from public.products where owner_id = %L', bloom), 'zero') || nl;
  r := r || pg_temp.t('PR02 anon reads public_products', 'anon', ca, format('select 1 from public.public_products where owner_id = %L and id = %L', bloom, pid), 'ok') || nl;
  r := r || pg_temp.t('PR03 anon purchase_price via view', 'anon', ca, 'select purchase_price from public.public_products', 'err') || nl;
  r := r || pg_temp.t('PR04 hidden product not in view', 'anon', ca, format('select 1 from public.public_products where id = %L', pid_hidden), 'zero') || nl;
  r := r || pg_temp.t('PR05 Starter salon product not in view', 'anon', ca, format('select 1 from public.public_products where id = %L', pid_starter), 'zero') || nl;
  r := r || pg_temp.t('PR06 anon writes via view', 'anon', ca, format($q$update public.public_products set price = 1 where id = %L$q$, pid), 'err') || nl;
  r := r || pg_temp.t('PR07 owner reads own products + cost', 'authenticated', cb, format('select purchase_price from public.products where id = %L', pid), 'ok') || nl;
  r := r || pg_temp.t('PR08 adjust_product_stock -2 -> 3', 'authenticated', cb, format('select 1 where public.adjust_product_stock(%L, -2) = 3', pid), 'ok') || nl;
  r := r || pg_temp.t('PR09 adjust floors at 0', 'authenticated', cb, format('select 1 where public.adjust_product_stock(%L, -10) = 0', pid), 'ok') || nl;
  r := r || pg_temp.t('PR10 adjust +4 (restore) -> 4', 'authenticated', cb, format('select 1 where public.adjust_product_stock(%L, 4) = 4', pid), 'ok') || nl;
  r := r || pg_temp.t('PR11 untracked stock stays NULL', 'authenticated', cb, format('select 1 where public.adjust_product_stock(%L, -1) is null', pid_null), 'ok') || nl;
  r := r || pg_temp.t('PR11b untracked stock still NULL', 'postgres', '{}', format('select 1 from public.products where id = %L and stock is null', pid_null), 'ok') || nl;
  r := r || pg_temp.t('PR12 other owner adjusts Bloom stock (no-op)', 'authenticated', cv, format('select 1 where public.adjust_product_stock(%L, -1) is null', pid), 'ok') || nl;
  r := r || pg_temp.t('PR12b stock unchanged at 4', 'postgres', '{}', format('select 1 from public.products where id = %L and stock = 4', pid), 'ok') || nl;
  r := r || pg_temp.t('PR13 anon cannot adjust stock', 'anon', ca, format('select public.adjust_product_stock(%L, -1)', pid), 'err') || nl;
  r := r || pg_temp.t('PR14 service_role adjusts stock', 'service_role', cs, format('select 1 where public.adjust_product_stock(%L, -1) = 3', pid), 'ok') || nl;

  -- ── 2. clients ──────────────────────────────────────────────────────────
  r := r || pg_temp.t('CL01 owner reads client of own appointment', 'authenticated', cb, format('select 1 from public.clients where id = %L', cl_own), 'ok') || nl;
  r := r || pg_temp.t('CL02 owner reads foreign client via e-mail', 'authenticated', cb, $q$select 1 from public.clients where email = 'zz-foreign@example.test'$q$, 'zero') || nl;
  r := r || pg_temp.t('CL03 owner updates client row', 'authenticated', cb, format($q$update public.clients set phone = 'x' where id = %L$q$, cl_own), 'err') || nl;
  r := r || pg_temp.t('CL04 owner deletes client row', 'authenticated', cb, format('delete from public.clients where id = %L', cl_own), 'err') || nl;
  r := r || pg_temp.t('CL05 owner embeds clients via client_id', 'authenticated', cb, format($q$select 1 from public.appointments a join public.clients c on c.id = a.client_id where a.id = %L$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('CL06 get_or_create_client returns existing id', 'authenticated', cb, format($q$select 1 where public.get_or_create_client('zz-own@example.test', '', '', '+31 6 222', 'latex', null) = %L$q$, cl_own), 'ok') || nl;
  r := r || pg_temp.t('CL06b phone kept, empty allergies filled', 'postgres', '{}', format($q$select 1 from public.clients where id = %L and phone = '+31 6 111' and allergies = 'latex'$q$, cl_own), 'ok') || nl;
  r := r || pg_temp.t('CL07 foreign row never overwritten', 'authenticated', cb, $q$select public.get_or_create_client('zz-foreign@example.test', 'X', 'Y', '+31 6 000', 'none', '2000-01-01')$q$, 'ok') || nl;
  r := r || pg_temp.t('CL07b foreign phone/allergies intact', 'postgres', '{}', format($q$select 1 from public.clients where id = %L and phone = '+31 6 999' and allergies = 'latex' and birthday = '2000-01-01'$q$, cl_foreign), 'ok') || nl;
  r := r || pg_temp.t('CL08 no-show +1 on own client', 'authenticated', cb, format('select public.increment_no_show_count(%L)', cl_own), 'ok') || nl;
  r := r || pg_temp.t('CL09 no-show on foreign client', 'authenticated', cb, format('select public.increment_no_show_count(%L)', cl_foreign), 'err') || nl;
  r := r || pg_temp.t('CL10 staff no-show on salon client', 'authenticated', cn, format('select public.increment_no_show_count(%L)', cl_own), 'ok') || nl;
  r := r || pg_temp.t('CL11 service_role no-show', 'service_role', cs, format('select public.increment_no_show_count(%L)', cl_foreign), 'ok') || nl;
  r := r || pg_temp.t('CL12 anon no-show', 'anon', ca, format('select public.increment_no_show_count(%L)', cl_own), 'err') || nl;
  r := r || pg_temp.t('CL13 counters 2 and 1', 'postgres', '{}', format('select 1 from public.clients where (id = %L and no_show_count = 2) or (id = %L and no_show_count = 1) having count(*) = 2', cl_own, cl_foreign), 'ok') || nl;

  -- ── 3. staff_list_appointments + betaal-RPC's ────────────────────────────
  update public.profiles set staff_view_revenue = false where id = bloom;
  r := r || pg_temp.t('SL01 revenue off: money keys gone', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and not (x ?| array['service_price','amount_paid','cash_received','discount_amount','no_show_fee','tax_snapshot'])$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('SL02 revenue off: no price in products/breakdown', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and not (x->'products'->0 ? 'price') and (x->'products'->0 ? 'qty') and not (x->'service_breakdown'->0 ? 'price') and (x->'service_breakdown'->0->>'duration') = '30'$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('SL03 pay_state partial (prepaid 20/50)', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and x->>'pay_state' = 'partial'$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('SL04 pay_state paid (paid_at, no amount)', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and x->>'pay_state' = 'paid'$q$, a_paidat), 'ok') || nl;
  r := r || pg_temp.t('SL05 pay_state open (unassigned, unpaid)', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and x->>'pay_state' = 'open'$q$, a3), 'ok') || nl;
  r := r || pg_temp.t('SL06 colleague appointment hidden (see_all off)', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L$q$, a2), 'zero') || nl;
  r := r || pg_temp.t('SL07 p_to excludes later rows', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments(current_date::text, (current_date + 7)::text) x where x->>'id' = %L$q$, a4), 'zero') || nl;
  r := r || pg_temp.t('SL07b p_to keeps rows in range', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments(current_date::text, (current_date + 7)::text) x where x->>'id' = %L$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('SL08 ordered by date, id', 'authenticated', cn, $q$with g as (select (x->>'date')::date d, (x->>'id')::uuid i, o from public.staff_list_appointments('2000-01-01') with ordinality as t(x, o)) select 1 where (select count(*) from g) > 3 and not exists (select 1 from g g1 join g g2 on g2.o = g1.o + 1 where (g2.d, g2.i) < (g1.d, g1.i))$q$, 'ok') || nl;
  r := r || pg_temp.t('SL09 old call with p_from only', 'authenticated', cn, $q$select 1 from public.staff_list_appointments(p_from => '2000-01-01')$q$, 'ok') || nl;
  r := r || pg_temp.t('SL10 anon cannot list', 'anon', ca, 'select public.staff_list_appointments()', 'err') || nl;
  r := r || pg_temp.t('SL13 pay_state paid (fully prepaid 45/45)', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and x->>'pay_state' = 'paid'$q$, a_full), 'ok') || nl;
  -- Gratis en niets betaald: 'open', zoals de knop "Voltooid" in Owner- en
  -- StaffApp (paidAmountOf > 0 vereist) -> ook hier "Hoe is er betaald?".
  r := r || pg_temp.t('SL14 pay_state open for a free unpaid appointment', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and x->>'pay_state' = 'open'$q$, a_free), 'ok') || nl;
  update public.profiles set staff_view_revenue = true, staff_view_client_contact = false where id = bloom;
  r := r || pg_temp.t('SL11 revenue on: amounts present, no pay_state', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and (x->>'service_price')::numeric = 50 and (x->'products'->0 ? 'price') and not (x ? 'pay_state')$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('SL12 contact off: no e-mail/phone', 'authenticated', cn, format($q$select 1 from public.staff_list_appointments() x where x->>'id' = %L and not (x ?| array['client_email','client_phone','client_allergies'])$q$, a1), 'ok') || nl;
  update public.profiles set staff_view_revenue = false, staff_view_client_contact = true where id = bloom;

  r := r || pg_temp.t('RC01 complete unassigned with cash', 'authenticated', cn, format($q$select 1 where (public.staff_complete_appointment(%L, 'cash'))->>'status' = 'completed'$q$, a3), 'ok') || nl;
  r := r || pg_temp.t('RC01b amount from server, method cash', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and amount_paid = 30 and payment_method = 'cash' and paid_at is not null$q$, a3), 'ok') || nl;
  r := r || pg_temp.t('RC02 complete colleague appointment', 'authenticated', cn, format($q$select public.staff_complete_appointment(%L, 'cash')$q$, a2), 'err') || nl;
  r := r || pg_temp.t('RC03 complete prepaid remainder with pin', 'authenticated', cn, format($q$select 1 where (public.staff_complete_appointment(%L, 'pin'))->>'payment_method' = 'prepaid'$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('RC03b prepaid kept, amount = price', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and status = 'completed' and payment_method = 'prepaid' and amount_paid = 50$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('RC03c remainder 30 by pin in client_payments', 'postgres', '{}', format($q$select 1 from public.client_payments where appointment_id = %L and amount = 30 and method = 'pin' and owner_id = %L$q$, a1, bloom), 'ok') || nl;
  r := r || pg_temp.t('RC13 complete fully prepaid with cash', 'authenticated', cn, format($q$select 1 where (public.staff_complete_appointment(%L, 'cash'))->>'payment_method' = 'prepaid'$q$, a_full), 'ok') || nl;
  r := r || pg_temp.t('RC13b payment untouched, only status', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and status = 'completed' and payment_method = 'prepaid' and amount_paid = 45 and paid_at = '2026-01-01 10:00+00'$q$, a_full), 'ok') || nl;
  r := r || pg_temp.t('RC13c no cash payment recorded', 'postgres', '{}', format('select 1 from public.client_payments where appointment_id = %L', a_full), 'zero') || nl;
  r := r || pg_temp.t('RC04 other salon owner completes', 'authenticated', cv, format($q$select public.staff_complete_appointment(%L, 'cash')$q$, a4), 'err') || nl;
  r := r || pg_temp.t('RC05 invalid method', 'authenticated', cn, format($q$select public.staff_complete_appointment(%L, 'bitcoin')$q$, a4), 'err') || nl;
  r := r || pg_temp.t('RC06 complete later/invoice (on-arrival -> null)', 'authenticated', cn, format($q$select 1 where (public.staff_complete_appointment(%L, null))->>'status' = 'completed'$q$, a4), 'ok') || nl;
  r := r || pg_temp.t('RC06b method null, amount untouched', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and payment_method is null and amount_paid is null and paid_at is null$q$, a4), 'ok') || nl;
  r := r || pg_temp.t('RC07 mark prepaid (reservation)', 'authenticated', cn, format($q$select 1 where (public.staff_mark_prepaid(%L))->>'status' = 'confirmed'$q$, a_pend), 'ok') || nl;
  r := r || pg_temp.t('RC07b prepaid amount from server', 'postgres', '{}', format($q$select 1 from public.appointments where id = %L and payment_method = 'prepaid' and amount_paid = 25 and paid_at is not null$q$, a_pend), 'ok') || nl;
  r := r || pg_temp.t('RC08 mark prepaid on cancelled', 'authenticated', cn, format('select public.staff_mark_prepaid(%L)', a_canc), 'err') || nl;
  r := r || pg_temp.t('RC09 anon complete', 'anon', ca, format($q$select public.staff_complete_appointment(%L, 'cash')$q$, a2), 'err') || nl;
  update public.profiles set staff_see_all = true where id = bloom;
  r := r || pg_temp.t('RC10 see_all: complete colleague appointment', 'authenticated', cn, format($q$select 1 where (public.staff_complete_appointment(%L, 'transfer'))->>'status' = 'completed'$q$, a2), 'ok') || nl;
  update public.profiles set staff_see_all = false, staff_view_revenue = true where id = bloom;
  update public.staff_members set active = false where id = noorrow;
  r := r || pg_temp.t('RC11 inactive stylist cannot complete', 'authenticated', cn, format($q$select public.staff_complete_appointment(%L, 'cash')$q$, a_paidat), 'err') || nl;
  r := r || pg_temp.t('RC12 inactive stylist: no salon profile', 'authenticated', cn, 'select 1 where public.staff_salon_profile() is null', 'ok') || nl;
  update public.staff_members set active = true where id = noorrow;

  -- ── 4/5. staff-policies, salonprofiel, collega's ─────────────────────────
  r := r || pg_temp.t('SP01 staff reads own appointment', 'authenticated', cn, format('select 1 from public.appointments where id = %L', a1), 'ok') || nl;
  r := r || pg_temp.t('SP02 staff reads colleague appointment (see_all off)', 'authenticated', cn, format('select 1 from public.appointments where id = %L', a2), 'zero') || nl;
  r := r || pg_temp.t('SP03 staff reads unassigned appointment', 'authenticated', cn, format('select 1 from public.appointments where id = %L', a3), 'ok') || nl;
  update public.profiles set staff_view_revenue = false where id = bloom;
  r := r || pg_temp.t('SP04 revenue off: unassigned row not via REST', 'authenticated', cn, format('select 1 from public.appointments where id = %L', a3), 'zero') || nl;
  r := r || pg_temp.t('SP04b revenue off: own row still readable', 'authenticated', cn, format('select 1 from public.appointments where id = %L', a1), 'ok') || nl;
  update public.profiles set staff_view_revenue = true, staff_see_all = true where id = bloom;
  r := r || pg_temp.t('SP05 see_all: colleague appointment readable', 'authenticated', cn, format('select 1 from public.appointments where id = %L', a2), 'ok') || nl;
  update public.profiles set staff_see_all = false where id = bloom;
  r := r || pg_temp.t('SP06 update colleague appointment (see_all off)', 'authenticated', cn, format($q$update public.appointments set visit_advice = 'zz' where id = %L$q$, a2), 'zero') || nl;
  r := r || pg_temp.t('SP06b update own appointment', 'authenticated', cn, format($q$update public.appointments set visit_advice = 'zz' where id = %L$q$, a1), 'ok') || nl;
  r := r || pg_temp.t('SP07 staff inserts own appointment', 'authenticated', cn, format($q$insert into public.appointments (owner_id, date, time, client_name, client_email, staff_id, service_name, status) values (%L, current_date + 3, '15:00', 'ZZ', 'zz-ins@example.test', %L, 'ZZ', 'confirmed')$q$, bloom, noorrow), 'ok') || nl;
  r := r || pg_temp.t('SP07b staff inserts for colleague (see_all off)', 'authenticated', cn, format($q$insert into public.appointments (owner_id, date, time, client_name, client_email, staff_id, service_name, status) values (%L, current_date + 3, '16:00', 'ZZ', 'zz-ins@example.test', %L, 'ZZ', 'confirmed')$q$, bloom, colrow), 'err') || nl;
  r := r || pg_temp.t('SP07c staff inserts in other salon', 'authenticated', cn, format($q$insert into public.appointments (owner_id, date, time, client_name, client_email, service_name, status) values (%L, current_date + 3, '16:00', 'ZZ', 'zz-ins@example.test', 'ZZ', 'confirmed')$q$, victim), 'err') || nl;
  insert into public.manual_clients (owner_id, name, email, notes) values (bloom, 'ZZ Own', 'zz-own@example.test', 'zz note');
  r := r || pg_temp.t('SP08 staff reads manual client (contact on)', 'authenticated', cn, $q$select 1 from public.manual_clients where email = 'zz-own@example.test'$q$, 'ok') || nl;
  update public.profiles set staff_view_client_contact = false where id = bloom;
  r := r || pg_temp.t('SP08b contact off: manual client hidden', 'authenticated', cn, $q$select 1 from public.manual_clients where email = 'zz-own@example.test'$q$, 'zero') || nl;
  update public.profiles set staff_view_client_contact = true where id = bloom;
  r := r || pg_temp.t('SP09 staff reads salon profiles row', 'authenticated', cn, format('select 1 from public.profiles where id = %L', bloom), 'zero') || nl;
  r := r || pg_temp.t('SP10 staff_salon_profile without secrets', 'authenticated', cn, format($q$select 1 where (public.staff_salon_profile())->>'id' = %L and (public.staff_salon_profile()) ? 'staff_view_revenue' and (public.staff_salon_profile()) ? 'business_name' and not ((public.staff_salon_profile()) ?| array['calendar_feed_token','google_refresh_token','mollie_customer_id','mollie_subscription_id','referral_code','invoice_profiles','discount_codes','next_invoice_number','email'])$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('SP11 owner gets no staff profile', 'authenticated', cb, 'select 1 where public.staff_salon_profile() is null', 'ok') || nl;
  r := r || pg_temp.t('SP12 anon staff_salon_profile', 'anon', ca, 'select public.staff_salon_profile()', 'err') || nl;
  r := r || pg_temp.t('SP13 staff reads colleague staff row', 'authenticated', cn, format('select 1 from public.staff_members where id = %L', colrow), 'zero') || nl;
  r := r || pg_temp.t('SP13b staff reads own staff row', 'authenticated', cn, format('select 1 from public.staff_members where id = %L', noorrow), 'ok') || nl;
  r := r || pg_temp.t('SP14 staff reads colleague via public_staff', 'authenticated', cn, format('select 1 from public.public_staff where id = %L', colrow), 'ok') || nl;
  r := r || pg_temp.t('SP15 flags of another salon', 'authenticated', cn, format('select 1 from public.staff_salon_flags(%L)', victim), 'zero') || nl;
  r := r || pg_temp.t('SP15b flags of own salon', 'authenticated', cn, format('select 1 from public.staff_salon_flags(%L) f where f.view_revenue and not f.see_all', bloom), 'ok') || nl;
  r := r || pg_temp.t('SP16 owner reads own appointments', 'authenticated', cb, format('select 1 from public.appointments where id in (%L, %L, %L)', a1, a2, a3), 'ok') || nl;
  r := r || pg_temp.t('SP17 owner updates own appointment', 'authenticated', cb, format($q$update public.appointments set visit_advice = 'zz2' where id = %L$q$, a2), 'ok') || nl;

  -- ── wachtlijst ──────────────────────────────────────────────────────────
  r := r || pg_temp.t('WL01 anon inserts waitlist', 'anon', ca, format($q$insert into public.waitlist (owner_id, date, client_name, client_email) values (%L, current_date + 2, 'ZZ', 'zz-wl@example.test')$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('WL02 user inserts waitlist', 'authenticated', cv, format($q$insert into public.waitlist (owner_id, date, client_name, client_email) values (%L, current_date + 2, 'ZZ', 'zz-wl@example.test')$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('WL03 service_role inserts with lang', 'service_role', cs, format($q$insert into public.waitlist (owner_id, date, client_name, client_email, lang) values (%L, current_date + 2, 'ZZ', 'zz-wl@example.test', 'es')$q$, bloom), 'ok') || nl;
  select id into wl1 from public.waitlist where owner_id = bloom and client_email = 'zz-wl@example.test' limit 1;
  r := r || pg_temp.t('WL04 staff marks waitlist row notified', 'authenticated', cn, format($q$update public.waitlist set status = 'notified', notified_at = now() where id = %L$q$, wl1), 'ok') || nl;
  r := r || pg_temp.t('WL05 other owner updates Bloom waitlist', 'authenticated', cv, format($q$update public.waitlist set status = 'waiting' where id = %L$q$, wl1), 'zero') || nl;
  r := r || pg_temp.t('WL06 staff moves row to other salon', 'authenticated', cn, format($q$update public.waitlist set owner_id = %L where id = %L$q$, victim, wl1), 'err') || nl;
  r := r || pg_temp.t('WL07 owner still updates waitlist', 'authenticated', cb, format($q$update public.waitlist set status = 'waiting' where id = %L$q$, wl1), 'ok') || nl;
  r := r || pg_temp.t('WL08 anon has no insert privilege', 'postgres', '{}', $q$select 1 where not has_table_privilege('anon', 'public.waitlist', 'insert') and not has_table_privilege('authenticated', 'public.waitlist', 'insert') and not has_any_column_privilege('anon', 'public.waitlist', 'insert')$q$, 'ok') || nl;

  -- ── varianten / extra's ─────────────────────────────────────────────────
  r := r || pg_temp.t('VE01 staff adds variant', 'authenticated', cn, format($q$insert into public.service_variants (service_id, name_nl, price, duration) values (%L, 'ZZ var', 10, 30)$q$, svc), 'ok') || nl;
  r := r || pg_temp.t('VE02 staff adds extra', 'authenticated', cn, format($q$insert into public.service_extras (service_id, name_nl, price) values (%L, 'ZZ extra', 5)$q$, svc), 'ok') || nl;
  r := r || pg_temp.t('VE03 staff adds variant to other salon', 'authenticated', cn, format($q$insert into public.service_variants (service_id, name_nl, price, duration) values (%L, 'ZZ var', 10, 30)$q$, vsvc), 'err') || nl;
  r := r || pg_temp.t('VE04 staff adds variant to hidden service', 'authenticated', cn, format($q$insert into public.service_variants (service_id, name_nl, price, duration) values (%L, 'ZZ var', 10, 30)$q$, hidden_svc), 'ok') || nl;
  update public.profiles set staff_can_edit_services = false where id = bloom;
  r := r || pg_temp.t('VE05 not allowed: staff adds variant', 'authenticated', cn, format($q$insert into public.service_variants (service_id, name_nl, price, duration) values (%L, 'ZZ var', 10, 30)$q$, svc), 'err') || nl;
  r := r || pg_temp.t('VE06 not allowed: staff adds extra', 'authenticated', cn, format($q$insert into public.service_extras (service_id, name_nl, price) values (%L, 'ZZ extra', 5)$q$, svc), 'err') || nl;
  update public.profiles set staff_can_edit_services = true where id = bloom;
  r := r || pg_temp.t('VE07 owner adds variant', 'authenticated', cb, format($q$insert into public.service_variants (service_id, name_nl, price, duration) values (%L, 'ZZ var o', 10, 30)$q$, svc), 'ok') || nl;
  r := r || pg_temp.t('VE08 other owner adds variant to Bloom', 'authenticated', cv, format($q$insert into public.service_variants (service_id, name_nl, price, duration) values (%L, 'ZZ var', 10, 30)$q$, svc), 'err') || nl;

  -- ── diensten ────────────────────────────────────────────────────────────
  select count(*) into mwcount from public.services s where s.owner_id = mw and s.visible = true;
  select count(*) into mwvar from public.service_variants v join public.services s on s.id = v.service_id where s.owner_id = mw and s.visible = true;
  r := r || pg_temp.t('SV01 anon reads hidden service', 'anon', ca, format('select 1 from public.services where id = %L', hidden_svc), 'zero') || nl;
  r := r || pg_temp.t('SV02 anon reads visible services', 'anon', ca, format('select 1 from public.services where owner_id = %L', bloom), 'ok') || nl;
  r := r || pg_temp.t('SV03 staff reads hidden salon service', 'authenticated', cn, format('select 1 from public.services where id = %L', hidden_svc), 'ok') || nl;
  r := r || pg_temp.t('SV04 other owner reads hidden service', 'authenticated', cv, format('select 1 from public.services where id = %L', hidden_svc), 'zero') || nl;
  r := r || pg_temp.t('SV05 owner reads own hidden service', 'authenticated', cb, format('select 1 from public.services where id = %L', hidden_svc), 'ok') || nl;
  r := r || pg_temp.t('SV06 mywhimsandmore query: same services', 'anon', ca, format('select 1 where (select count(*) from public.services s left join public.service_categories c on c.id = s.category_id where s.owner_id = %L and s.visible = true) = %s and %s > 0', mw, mwcount, mwcount), 'ok') || nl;
  r := r || pg_temp.t('SV07 mywhimsandmore query: same variants', 'anon', ca, format('select 1 where (select count(*) from public.service_variants v join public.services s on s.id = v.service_id where s.owner_id = %L and s.visible = true) = %s', mw, mwvar), 'ok') || nl;
  r := r || pg_temp.t('SV08 staff updates salon service', 'authenticated', cn, format($q$update public.services set price = price where id = %L$q$, hidden_svc), 'ok') || nl;
  insert into public.service_extras (service_id, name_nl, price) values (hidden_svc, 'ZZ hidden extra', 5);
  r := r || pg_temp.t('SV09 anon reads variant of hidden service', 'anon', ca, format('select 1 from public.service_variants where service_id = %L', hidden_svc), 'zero') || nl;
  r := r || pg_temp.t('SV09b anon reads extra of hidden service', 'anon', ca, format('select 1 from public.service_extras where service_id = %L', hidden_svc), 'zero') || nl;
  r := r || pg_temp.t('SV10 anon reads variant of visible service', 'anon', ca, format($q$select 1 from public.service_variants where service_id = %L and name_nl = 'ZZ var'$q$, svc), 'ok') || nl;
  r := r || pg_temp.t('SV11 owner reads variant of own hidden service', 'authenticated', cb, format('select 1 from public.service_variants where service_id = %L', hidden_svc), 'ok') || nl;
  r := r || pg_temp.t('SV12 staff reads variant + extra of hidden salon service', 'authenticated', cn, format('select 1 where exists (select 1 from public.service_variants where service_id = %L) and exists (select 1 from public.service_extras where service_id = %L)', hidden_svc, hidden_svc), 'ok') || nl;
  r := r || pg_temp.t('SV13 other owner reads variant of Bloom hidden service', 'authenticated', cv, format('select 1 from public.service_variants where service_id = %L', hidden_svc), 'zero') || nl;
  r := r || pg_temp.t('SV14 staff updates variant of hidden service', 'authenticated', cn, format($q$update public.service_variants set price = price where service_id = %L$q$, hidden_svc), 'ok') || nl;
  select count(*) into n1 from public.service_extras e join public.services s on s.id = e.service_id where s.visible is not false;
  r := r || pg_temp.t('SV15 anon sees every extra of visible services', 'anon', ca, format('select 1 where (select count(*) from public.service_extras) = %s', n1), 'ok') || nl;
  select count(*) into n1 from public.service_variants v join public.services s on s.id = v.service_id where s.visible is not false;
  r := r || pg_temp.t('SV16 anon sees every variant of visible services', 'anon', ca, format('select 1 where (select count(*) from public.service_variants) = %s and %s > 0', n1, n1), 'ok') || nl;

  -- ── blokkades ───────────────────────────────────────────────────────────
  insert into public.staff_day_overrides (owner_id, staff_id, date, block_time_start, block_time_end, reason)
  values (bloom, noorrow, current_date + 4, '10:00', '11:00', 'ZZ private') returning id into blk_own;
  insert into public.staff_day_overrides (owner_id, staff_id, date, reason)
  values (bloom, colrow, current_date + 4, 'ZZ colleague private') returning id into blk_col;
  r := r || pg_temp.t('DO01 anon reads staff_day_overrides', 'anon', ca, format('select 1 from public.staff_day_overrides where owner_id = %L', bloom), 'zero') || nl;
  r := r || pg_temp.t('DO02 anon reads public view', 'anon', ca, format('select 1 from public.public_staff_day_overrides where id = %L and block_time_start = %L', blk_own, '10:00'), 'ok') || nl;
  r := r || pg_temp.t('DO03 anon reads reason via view', 'anon', ca, 'select reason from public.public_staff_day_overrides', 'err') || nl;
  r := r || pg_temp.t('DO04 anon deletes via view', 'anon', ca, format('delete from public.public_staff_day_overrides where id = %L', blk_own), 'err') || nl;
  r := r || pg_temp.t('DO05 staff reads own block', 'authenticated', cn, format('select 1 from public.staff_day_overrides where id = %L', blk_own), 'ok') || nl;
  r := r || pg_temp.t('DO05b staff reads colleague block', 'authenticated', cn, format('select 1 from public.staff_day_overrides where id = %L', blk_col), 'zero') || nl;
  r := r || pg_temp.t('DO06 staff edits own block (Bewerk)', 'authenticated', cn, format($q$update public.staff_day_overrides set block_time_end = '12:00' where id = %L and staff_id = %L returning id$q$, blk_own, noorrow), 'ok') || nl;
  r := r || pg_temp.t('DO06b staff edits colleague block', 'authenticated', cn, format($q$update public.staff_day_overrides set reason = 'x' where id = %L$q$, blk_col), 'zero') || nl;
  r := r || pg_temp.t('DO06c staff moves own block to colleague', 'authenticated', cn, format('update public.staff_day_overrides set staff_id = %L where id = %L', colrow, blk_own), 'err') || nl;
  r := r || pg_temp.t('DO07 staff inserts own block (returning)', 'authenticated', cn, format($q$insert into public.staff_day_overrides (owner_id, staff_id, date, reason) values (%L, %L, current_date + 6, 'zz') returning id$q$, bloom, noorrow), 'ok') || nl;
  r := r || pg_temp.t('DO08 owner reads all salon blocks', 'authenticated', cb, format('select 1 from public.staff_day_overrides where id in (%L, %L) having count(*) = 2', blk_own, blk_col), 'ok') || nl;
  r := r || pg_temp.t('DO09 staff deletes own block', 'authenticated', cn, format('delete from public.staff_day_overrides where id = %L', blk_own), 'ok') || nl;

  -- ── public_salons / public_staff ────────────────────────────────────────
  r := r || pg_temp.t('PS01 demo salon: no referral code', 'anon', ca, $q$select 1 from public.public_salons where slug = 'bloomstudio' and referral_code is null and is_demo$q$, 'ok') || nl;
  r := r || pg_temp.t('PS02 real salon keeps referral code', 'anon', ca, format('select 1 from public.public_salons where id = %L and referral_code is not null and not is_demo', victim), 'ok') || nl;
  r := r || pg_temp.t('PS03 no reason/staff_name in day_overrides', 'anon', ca, $q$select 1 from public.public_salons s, jsonb_each(case when jsonb_typeof(s.day_overrides) = 'object' then s.day_overrides else '{}'::jsonb end) e where jsonb_typeof(e.value) = 'object' and (e.value ? 'reason' or e.value ? 'staff_name')$q$, 'zero') || nl;
  r := r || pg_temp.t('PS04 day_overrides keep every date + type', 'postgres', '{}', $q$select 1 where (select count(*) from public.public_salons s, jsonb_each(s.day_overrides) e where e.value ? 'type') = (select count(*) from public.profiles p, jsonb_each(p.day_overrides) e where e.value ? 'type') and (select count(*) from public.profiles p, jsonb_each(p.day_overrides) e) > 0$q$, 'ok') || nl;
  r := r || pg_temp.t('PS05 new columns cancel_deadline_hours, is_demo', 'anon', ca, $q$select cancel_deadline_hours, is_demo from public.public_salons where slug = 'bloomstudio'$q$, 'ok') || nl;
  r := r || pg_temp.t('PS06 embed services via public_salons', 'anon', ca, $q$select 1 from public.public_salons ps join public.services s on s.owner_id = ps.id where ps.slug = 'bloomstudio' and s.visible$q$, 'ok') || nl;
  r := r || pg_temp.t('PS07 public_staff has_pay', 'anon', ca, format('select 1 from public.public_staff where id = %L and has_pay', colrow), 'ok') || nl;
  insert into public.staff_members (owner_id, name, iban, payment_link) values (bloom, 'ZZ nopay', '', null) returning id into hu_staffrow;
  r := r || pg_temp.t('PS08 public_staff has_pay false without IBAN/link', 'anon', ca, format('select 1 from public.public_staff where id = %L and not has_pay', hu_staffrow), 'ok') || nl;

  -- ── 7. uitnodiging (R-02) ───────────────────────────────────────────────
  r := r || pg_temp.t('S01 staff re-points own owner_id', 'authenticated', cn, format('update public.staff_members set owner_id = %L where id = %L', victim, noorrow), 'err') || nl;
  r := r || pg_temp.t('S02 staff hours + feed token', 'authenticated', cn, format($q$update public.staff_members set working_hours = working_hours || '{"zz":1}'::jsonb, calendar_feed_token = 'zztoken0123456789012345678901234567890123456789' where id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('S03 staff invoice fields + stale counter', 'authenticated', cn, format($q$update public.staff_members set address='ZZ 1', kvk_number='123', btw_id='NL1', iban='NL91ABNA0417164300', iban_holder='Noor', payment_link='https://bunq.me/zz', invoice_prefix='ZZ', next_invoice_number=999 where id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('S05 staff renames self', 'authenticated', cn, format($q$update public.staff_members set name = 'ZZ' where id = %L$q$, noorrow), 'err') || nl;
  r := r || pg_temp.t('S06 staff re-binds user_id', 'authenticated', cn, format('update public.staff_members set user_id = %L where id = %L', victim, noorrow), 'err') || nl;
  r := r || pg_temp.t('S07 staff changes own email', 'authenticated', cn, format($q$update public.staff_members set email = 'zz@example.test' where id = %L$q$, noorrow), 'err') || nl;
  r := r || pg_temp.t('S08 staff sets own invite hash', 'authenticated', cn, format($q$update public.staff_members set invite_token_hash = 'x' where id = %L$q$, noorrow), 'err') || nl;
  r := r || pg_temp.t('O01 owner edits her stylist', 'authenticated', cb, format($q$update public.staff_members set name='Noor de Vries', role='Nail stylist', email='staff@bloomstudio.example', bio='zz', working_hours=working_hours, iban='NL91ABNA0417164300', iban_holder='Noor de Vries', payment_link=null, avatar_url=null, active=true, position=1 where id = %L$q$, noorrow), 'ok') || nl;
  r := r || pg_temp.t('O02 owner moves stylist to other salon', 'authenticated', cb, format('update public.staff_members set owner_id = %L where id = %L', victim, noorrow), 'err') || nl;
  r := r || pg_temp.t('O03 owner binds stylist to someone else', 'authenticated', cb, format('update public.staff_members set user_id = %L where id = %L', victim, noorrow), 'err') || nl;
  r := r || pg_temp.t('O03b owner unlinks stylist login', 'authenticated', cb, format('update public.staff_members set user_id = null where id = %L', noorrow), 'err') || nl;
  r := r || pg_temp.t('O04 owner adds stylist (StaffAdder)', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, role, email, working_hours) values (%L, 'ZZ invite 1', 'Test', 'zzclaim@example.test', '{}'::jsonb)$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('O05 owner inserts row bound to other user', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, user_id) values (%L, 'ZZ evil', %L)$q$, bloom, victim), 'err') || nl;
  r := r || pg_temp.t('O06 owner inserts row in other salon', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name) values (%L, 'ZZ evil')$q$, victim), 'err') || nl;
  r := r || pg_temp.t('O07 owner adds herself as stylist', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, user_id) values (%L, 'ZZ self', %L)$q$, bloom, bloom), 'ok') || nl;
  r := r || pg_temp.t('O11 owner adds herself a second time', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, user_id) values (%L, 'ZZ self 2', %L)$q$, bloom, bloom), 'err') || nl;
  insert into public.staff_members (owner_id, name, email) values (bloom, 'ZZ selfrow', 'demo@bloomstudio.example') returning id into self_row;
  r := r || pg_temp.t('O12 owner links 2nd own row while on roster', 'authenticated', cb, format('update public.staff_members set user_id = %L where id = %L', bloom, self_row), 'err') || nl;
  delete from public.staff_members where owner_id = bloom and name = 'ZZ self';
  r := r || pg_temp.t('O13 owner links herself to own unlinked row', 'authenticated', cb, format('update public.staff_members set user_id = %L where id = %L', bloom, self_row), 'ok') || nl;
  r := r || pg_temp.t('O13b booking page shows her as owner', 'anon', ca, format('select 1 from public.public_staff where id = %L and is_owner', self_row), 'ok') || nl;
  insert into public.staff_members (owner_id, name) values (bloom, 'ZZ selfrow 2') returning id into self_row2;
  r := r || pg_temp.t('O14 owner links a second own row', 'authenticated', cb, format('update public.staff_members set user_id = %L where id = %L', bloom, self_row2), 'err') || nl;
  r := r || pg_temp.t('O15 staff links herself to a salon row', 'authenticated', cn, format('update public.staff_members set user_id = %L where id = %L', noor, self_row2), 'zero') || nl;
  r := r || pg_temp.t('O09 owner inserts row with invite hash', 'authenticated', cb, format($q$insert into public.staff_members (owner_id, name, invite_token_hash, invite_expires_at) values (%L, 'ZZ evil', 'abc', now() + interval '1 day')$q$, bloom), 'err') || nl;
  select id into inv_row from public.staff_members where owner_id = bloom and name = 'ZZ invite 1';
  r := r || pg_temp.t('O10 owner sets invite hash on row', 'authenticated', cb, format($q$update public.staff_members set invite_token_hash = 'abc', invite_expires_at = now() + interval '7 days' where id = %L$q$, inv_row), 'err') || nl;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  tok_hash := encode(extensions.digest(tok, 'sha256'), 'hex');
  r := r || pg_temp.t('IN01 service_role writes invite hash', 'service_role', cs, format($q$update public.staff_members set invite_token_hash = %L, invite_expires_at = now() + interval '7 days' where id = %L$q$, tok_hash, inv_row), 'ok') || nl;
  r := r || pg_temp.t('IN02 claim by matching e-mail (old way)', 'authenticated', cc1, format('update public.staff_members set user_id = %L where id = %L and user_id is null', cl1, inv_row), 'zero') || nl;
  r := r || pg_temp.t('IN02b row still unclaimed', 'postgres', '{}', format('select 1 from public.staff_members where id = %L and user_id is null', inv_row), 'ok') || nl;
  r := r || pg_temp.t('IN03 pending row not readable by e-mail', 'authenticated', cc1, format('select 1 from public.staff_members where id = %L', inv_row), 'zero') || nl;
  r := r || pg_temp.t('IN04 anon claim', 'anon', ca, format('select public.claim_staff_invite(%L)', tok), 'err') || nl;
  r := r || pg_temp.t('IN05 wrong token', 'authenticated', cc1, $q$select 1 where (public.claim_staff_invite(repeat('ab', 32)))->>'error' = 'invalid_or_expired'$q$, 'ok') || nl;
  r := r || pg_temp.t('IN05b malformed token', 'authenticated', cc1, $q$select 1 where (public.claim_staff_invite('nope'))->>'error' = 'invalid_or_expired'$q$, 'ok') || nl;
  r := r || pg_temp.t('IN06 owner with salon claims', 'authenticated', cv, format($q$select 1 where (public.claim_staff_invite(%L))->>'error' = 'has_salon'$q$, tok), 'ok') || nl;
  r := r || pg_temp.t('IN06b row still unclaimed', 'postgres', '{}', format('select 1 from public.staff_members where id = %L and user_id is null and invite_token_hash is not null', inv_row), 'ok') || nl;
  r := r || pg_temp.t('IN07 claim with valid token (upper case)', 'authenticated', cc1, format($q$select 1 where (public.claim_staff_invite(%L))->>'success' = 'true'$q$, upper(tok)), 'ok') || nl;
  r := r || pg_temp.t('IN07b linked, token cleared', 'postgres', '{}', format('select 1 from public.staff_members where id = %L and user_id = %L and invite_token_hash is null and invite_expires_at is null', inv_row, cl1), 'ok') || nl;
  r := r || pg_temp.t('IN08 token reused', 'authenticated', cc3, format($q$select 1 where (public.claim_staff_invite(%L))->>'error' = 'invalid_or_expired'$q$, tok), 'ok') || nl;
  r := r || pg_temp.t('IN09 claimed staff edits hours', 'authenticated', cc1, format($q$update public.staff_members set working_hours = '{"1":{"open":"09:00","close":"17:00","closed":false}}'::jsonb where id = %L$q$, inv_row), 'ok') || nl;
  r := r || pg_temp.t('IN10 claimed staff unlinks self', 'authenticated', cc1, format('update public.staff_members set user_id = null where id = %L', inv_row), 'err') || nl;
  insert into public.staff_members (owner_id, name, email) values (bloom, 'ZZ invite 2', 'zzclaim2@example.test') returning id into inv_row2;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  update public.staff_members set invite_token_hash = encode(extensions.digest(tok, 'sha256'), 'hex'),
         invite_expires_at = now() - interval '1 minute' where id = inv_row2;
  r := r || pg_temp.t('IN11 expired token', 'authenticated', cc3, format($q$select 1 where (public.claim_staff_invite(%L))->>'error' = 'invalid_or_expired'$q$, tok), 'ok') || nl;
  r := r || pg_temp.t('IN12 service_role links login (Login aanmaken)', 'service_role', cs, format('update public.staff_members set user_id = %L, email = %L where id = %L', cl3, 'zz3@example.test', inv_row2), 'ok') || nl;
  -- Uitnodiging voor een rij van de eigen salon (eigenaar op haar rooster).
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.staff_members (owner_id, name, email, invite_token_hash, invite_expires_at)
  values (bloom, 'ZZ invite self', 'demo@bloomstudio.example', encode(extensions.digest(tok, 'sha256'), 'hex'), now() + interval '7 days')
  returning id into inv_self;
  r := r || pg_temp.t('IN13 owner already on roster claims own-salon invite', 'authenticated', cb, format($q$select 1 where (public.claim_staff_invite(%L))->>'error' = 'already_staff'$q$, tok), 'ok') || nl;
  update public.staff_members set user_id = null where id = self_row;
  r := r || pg_temp.t('IN14 owner claims own-salon invite (no has_salon)', 'authenticated', cb, format($q$select 1 where (public.claim_staff_invite(%L))->>'success' = 'true'$q$, tok), 'ok') || nl;
  r := r || pg_temp.t('IN14b own row linked to owner', 'postgres', '{}', format('select 1 from public.staff_members where id = %L and user_id = %L and invite_token_hash is null', inv_self, bloom), 'ok') || nl;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.staff_members (owner_id, name, email, invite_token_hash, invite_expires_at)
  values (bloom, 'ZZ invite 3', 'zzclaim@example.test', encode(extensions.digest(tok, 'sha256'), 'hex'), now() + interval '7 days')
  returning id into inv_row3;
  r := r || pg_temp.t('IN15 linked stylist claims a second invite', 'authenticated', cc1, format($q$select 1 where (public.claim_staff_invite(%L))->>'error' = 'already_staff'$q$, tok), 'ok') || nl;
  r := r || pg_temp.t('IN15b second row stays unclaimed', 'postgres', '{}', format('select 1 from public.staff_members where id = %L and user_id is null and invite_token_hash is not null', inv_row3), 'ok') || nl;

  -- handle_new_user
  insert into auth.users (id, email, raw_user_meta_data, created_at)
  values (hu1, 'zz-hu1@example.test', '{"staff_invite": true}'::jsonb, now());
  r := r || pg_temp.t('HU01 invite signup gets no profile', 'postgres', '{}', format('select 1 from public.profiles where id = %L', hu1), 'zero') || nl;
  insert into public.staff_members (owner_id, name, email) values (bloom, 'ZZ hu2', 'zz-hu2@example.test') returning id into hu_staffrow;
  insert into auth.users (id, email, raw_user_meta_data, created_at)
  values (hu2, 'zz-hu2@example.test', '{"business_name": "ZZ hu2", "slug": "zz-hu2-salon"}'::jsonb, now());
  r := r || pg_temp.t('HU02 e-mail on a staff row no longer skips profile', 'postgres', '{}', format('select 1 from public.profiles where id = %L', hu2), 'ok') || nl;
  r := r || pg_temp.t('HU02b staff row not auto-linked', 'postgres', '{}', format('select 1 from public.staff_members where id = %L and user_id is null', hu_staffrow), 'ok') || nl;
  insert into auth.users (id, email, raw_user_meta_data, created_at)
  values (hu3, 'zz-hu3@example.test', '{"business_name": "ZZ hu3", "slug": "zz-hu3-salon"}'::jsonb, now());
  r := r || pg_temp.t('HU03 plain signup gets profile', 'postgres', '{}', format($q$select 1 from public.profiles where id = %L and slug = 'zz-hu3-salon'$q$, hu3), 'ok') || nl;
  insert into auth.users (id, email, raw_user_meta_data, created_at)
  values (hu4, 'zz-hu4@example.test', '{"business_name": "ZZ hu4", "slug": "Admin"}'::jsonb, now());
  r := r || pg_temp.t('HU04 reserved slug at signup gets a suffix', 'postgres', '{}', format($q$select 1 from public.profiles where id = %L and slug ~ '^Admin-[0-9a-f]{4}$' and not public.slug_is_reserved(slug)$q$, hu4), 'ok') || nl;

  -- ── 8. verwijzingen ─────────────────────────────────────────────────────
  select referral_code into bcode from public.profiles where id = bloom;
  select referral_code, coalesce(referral_credit_days, 0) into vcode, vcredit_before from public.profiles where id = victim;
  insert into auth.users (id, email, raw_user_meta_data, created_at)
  values (zzref, 'zz-ref1@example.test', '{"business_name": "ZZ Ref", "slug": "zz-ref-new-1"}'::jsonb, now());
  r := r || pg_temp.t('RF01 demo salon as referrer', 'authenticated', czzref, format('select 1 from public.redeem_referral_code(%L, %L) x where x.success = false', zzref, bcode), 'ok') || nl;
  r := r || pg_temp.t('RF02 real referrer', 'authenticated', czzref, format('select 1 from public.redeem_referral_code(%L, %L) x where x.success and x.referrer_id = %L', zzref, lower(vcode), victim), 'ok') || nl;
  r := r || pg_temp.chk('RF03 referrer not credited at signup', (select coalesce(referral_credit_days, 0) from public.profiles where id = victim) = vcredit_before) || nl;
  r := r || pg_temp.t('RF04 redemption row, not yet credited', 'postgres', '{}', format('select 1 from public.referral_redemptions where new_profile_id = %L and referrer_id = %L and referrer_credited_at is null', zzref, victim), 'ok') || nl;
  r := r || pg_temp.t('RF05 new salon referred_by set', 'postgres', '{}', format('select 1 from public.profiles where id = %L and referred_by = %L', zzref, victim), 'ok') || nl;
  select coalesce(referral_credit_days, 0) into zzcredit_before from public.profiles where id = zzref;
  update public.profiles set referred_by = null where id = zzref;
  r := r || pg_temp.t('RF06 replay after referred_by reset', 'authenticated', czzref, format('select 1 from public.redeem_referral_code(%L, %L) x where x.success = false', zzref, vcode), 'ok') || nl;
  r := r || pg_temp.chk('RF06b no extra credit on replay',
         (select coalesce(referral_credit_days, 0) from public.profiles where id = zzref) = zzcredit_before
         and (select coalesce(referral_credit_days, 0) from public.profiles where id = victim) = vcredit_before) || nl;
  r := r || pg_temp.t('RF07 redeem for someone else', 'authenticated', cv, format('select 1 from public.redeem_referral_code(%L, %L)', zzref, vcode), 'err') || nl;
  r := r || pg_temp.t('RF08 grant credit as user', 'authenticated', czzref, format('select public.grant_referral_credit(%L)', zzref), 'err') || nl;
  r := r || pg_temp.t('RF08b grant credit as anon', 'anon', ca, format('select public.grant_referral_credit(%L)', zzref), 'err') || nl;
  select reward_days into rdays from public.referral_redemptions where new_profile_id = zzref;
  r := r || pg_temp.t('RF09 grant credit (first payment)', 'service_role', cs, format('select 1 where public.grant_referral_credit(%L) = %s and %s > 0', zzref, rdays, rdays), 'ok') || nl;
  r := r || pg_temp.chk('RF09b referrer credited once', (select coalesce(referral_credit_days, 0) from public.profiles where id = victim) = vcredit_before + rdays, format('reward=%s', rdays)) || nl;
  r := r || pg_temp.t('RF10 second grant is a no-op', 'service_role', cs, format('select 1 where public.grant_referral_credit(%L) = 0', zzref), 'ok') || nl;
  r := r || pg_temp.chk('RF10b credit unchanged', (select coalesce(referral_credit_days, 0) from public.profiles where id = victim) = vcredit_before + rdays) || nl;
  insert into auth.users (id, email, raw_user_meta_data, created_at)
  values (zzold, 'zz-old1@example.test', '{"business_name": "ZZ Old", "slug": "zz-old-1"}'::jsonb, now() - interval '3 hours');
  update public.profiles set created_at = now() - interval '3 hours' where id = zzold;
  r := r || pg_temp.t('RF11 account older than 2 hours', 'authenticated', czzold, format('select 1 from public.redeem_referral_code(%L, %L) x where x.success = false', zzold, vcode), 'ok') || nl;
  r := r || pg_temp.t('RF12 existing redemptions back-filled', 'postgres', '{}', format('select 1 from public.referral_redemptions where referrer_credited_at is null and new_profile_id <> %L', zzref), 'zero') || nl;
  r := r || pg_temp.t('RF13 no default on referrer_credited_at after part B', 'postgres', '{}', $q$select 1 from information_schema.columns where table_schema = 'public' and table_name = 'referral_redemptions' and column_name = 'referrer_credited_at' and column_default is null$q$, 'ok') || nl;

  -- ── 10. cron-geheim ─────────────────────────────────────────────────────
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  r := r || pg_temp.chk('CR01 vault secret exists (64 hex)', v_secret ~ '^[0-9a-f]{64}$') || nl;
  nint := 0;
  for j in select jobname, command from cron.job
            where jobname in ('send-daily-reminders', 'send-daily-followups', 'send-daily-rebook-nudge',
                              'db-backup-daily', 'cron-watchdog-daily', 'send-renewal-reminder-daily') loop
    execute rtrim(btrim(replace(j.command, 'net.http_post(', 'pg_temp.fake_post('), E' \n\t\r'), ';') into h;
    if h ->> 'x-cron-secret' = v_secret and h ->> 'Authorization' like 'Bearer %' and h ->> 'Content-Type' = 'application/json' then
      nint := nint + 1;
    end if;
  end loop;
  r := r || pg_temp.chk('CR02 6 jobs send secret + same Authorization', nint = 6, format('%s/6', nint)) || nl;
  r := r || pg_temp.t('CR03 prepay/check-pending unchanged', 'postgres', '{}', $q$select 1 from cron.job where jobname in ('prepay-watch-hourly', 'check-pending-payments-hourly') and command !~ 'x-cron-secret' having count(*) = 2$q$, 'ok') || nl;
  r := r || pg_temp.t('CR04 schedules unchanged', 'postgres', '{}', $q$select 1 from cron.job where (jobname, schedule) in (('send-daily-reminders','0 * * * *'),('send-daily-followups','30 10 * * *'),('send-daily-rebook-nudge','0 11 * * *'),('cron-watchdog-daily','0 12 * * *'),('db-backup-daily','0 3 * * *'),('send-renewal-reminder-daily','0 8 * * *')) and active having count(*) = 6$q$, 'ok') || nl;
  r := r || pg_temp.t('CR05 secret not stored in cron.job', 'postgres', '{}', format('select 1 from cron.job where position(%L in command) > 0', v_secret), 'zero') || nl;
  r := r || pg_temp.t('CR06 cron_secret_ok right secret', 'service_role', cs, format('select 1 where public.cron_secret_ok(%L)', v_secret), 'ok') || nl;
  r := r || pg_temp.t('CR07 cron_secret_ok wrong/empty/null', 'service_role', cs, $q$select 1 where not public.cron_secret_ok('nope') and not public.cron_secret_ok('') and not public.cron_secret_ok(null)$q$, 'ok') || nl;
  r := r || pg_temp.t('CR08 cron_secret_ok as user', 'authenticated', cb, $q$select public.cron_secret_ok('x')$q$, 'err') || nl;
  r := r || pg_temp.t('CR09 cron_secret_ok as anon', 'anon', ca, $q$select public.cron_secret_ok('x')$q$, 'err') || nl;

  -- ── 13. review_tokens ───────────────────────────────────────────────────
  r := r || pg_temp.t('RT01 last_sent_at back-filled', 'postgres', '{}', 'select 1 from public.review_tokens where last_sent_at is null', 'zero') || nl;

  -- ── 14. nieuwsbrief-afmeldingen ─────────────────────────────────────────
  r := r || pg_temp.t('NL01 service_role adds opt-out row', 'service_role', cs, format($q$insert into public.newsletter_opt_outs (owner_id, email, token) values (%L, 'zz-nl@example.test', %L)$q$, bloom, encode(extensions.gen_random_bytes(32), 'hex')), 'ok') || nl;
  r := r || pg_temp.t('NL02 upsert on (owner_id, email) keeps row', 'service_role', cs, format($q$insert into public.newsletter_opt_outs (owner_id, email, token) values (%L, 'zz-nl@example.test', %L) on conflict (owner_id, email) do nothing$q$, bloom, encode(extensions.gen_random_bytes(32), 'hex')), 'zero') || nl;
  r := r || pg_temp.t('NL03 other casing is a duplicate', 'service_role', cs, format($q$insert into public.newsletter_opt_outs (owner_id, email, token) values (%L, 'ZZ-NL@example.test', %L)$q$, bloom, encode(extensions.gen_random_bytes(32), 'hex')), 'err') || nl;
  r := r || pg_temp.t('NL04 owner reads own opt-outs', 'authenticated', cb, 'select 1 from public.newsletter_opt_outs', 'ok') || nl;
  r := r || pg_temp.t('NL05 other owner reads them', 'authenticated', cv, format('select 1 from public.newsletter_opt_outs where owner_id = %L', bloom), 'zero') || nl;
  r := r || pg_temp.t('NL06 owner writes opt-out', 'authenticated', cb, format($q$insert into public.newsletter_opt_outs (owner_id, email, token) values (%L, 'zz-nl2@example.test', 'x')$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('NL07 anon reads opt-outs', 'anon', ca, 'select 1 from public.newsletter_opt_outs', 'err') || nl;
  r := r || pg_temp.t('NL08 service_role opts out by token', 'service_role', cs, $q$update public.newsletter_opt_outs set opted_out_at = now() where email = 'zz-nl@example.test' and opted_out_at is null$q$, 'ok') || nl;

  -- ── 16. reviews blijven staan ───────────────────────────────────────────
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, status)
  values (bloom, svc, 'ZZ rev', 20, 30, current_date - 3, '10:00', 'ZZ Rev', 'zz-rev@example.test', 'completed') returning id into a_rev;
  insert into public.reviews (appointment_id, owner_id, client_name, client_email, rating, comment)
  values (a_rev, bloom, 'ZZ Rev', 'zz-rev@example.test', 5, 'zz') returning id into rev_id;
  r := r || pg_temp.t('RV01 owner deletes reviewed appointment', 'authenticated', cb, format('delete from public.appointments where id = %L', a_rev), 'ok') || nl;
  r := r || pg_temp.t('RV02 review survives, appointment_id NULL', 'postgres', '{}', format('select 1 from public.reviews where id = %L and appointment_id is null', rev_id), 'ok') || nl;
  r := r || pg_temp.t('RV03 still on the public page', 'anon', ca, format('select 1 from public.public_reviews where id = %L', rev_id), 'ok') || nl;

  -- ── 18. codes vrij bij annuleren ────────────────────────────────────────
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, status)
  values (bloom, svc, 'ZZ code', 20, 30, current_date + 8, '10:00', 'ZZ Code', 'zz-code@example.test', 'confirmed') returning id into a_code;
  insert into public.appointments (owner_id, service_id, service_name, service_price, service_duration, date, time, client_name, client_email, status)
  values (bloom, svc, 'ZZ code2', 20, 30, current_date + 8, '11:00', 'ZZ Code', 'zz-code@example.test', 'confirmed') returning id into a_code2;
  insert into public.birthday_discount_codes (owner_id, code, client_email, discount_pct, expires_on, kind, used_at, used_by_appointment)
  values (bloom, 'ZZLOY-10-AAAAA', 'zz-code@example.test', 10, current_date + 30, 'loyalty', now(), a_code),
         (bloom, 'ZZBDAY-10-OLDAA', 'zz-code@example.test', 10, current_date - 5, 'birthday', now(), a_code2);
  r := r || pg_temp.t('BC01 owner cancels appointment', 'authenticated', cb, format($q$update public.appointments set status = 'cancelled' where id = %L$q$, a_code), 'ok') || nl;
  r := r || pg_temp.t('BC01b loyalty code free again', 'postgres', '{}', $q$select 1 from public.birthday_discount_codes where code = 'ZZLOY-10-AAAAA' and used_at is null and used_by_appointment is null$q$, 'ok') || nl;
  r := r || pg_temp.t('BC02 cancel via service role (prepay-watch)', 'service_role', cs, format($q$update public.appointments set status = 'cancelled' where id = %L$q$, a_code2), 'ok') || nl;
  r := r || pg_temp.t('BC02b expired code stays used', 'postgres', '{}', $q$select 1 from public.birthday_discount_codes where code = 'ZZBDAY-10-OLDAA' and used_at is not null$q$, 'ok') || nl;

  -- ── 19. create_birthday_code ────────────────────────────────────────────
  update public.profiles set birthday_email_discount_pct = 10 where id = bloom;
  r := r || pg_temp.t('BD01 personal code is not the loyalty code', 'authenticated', cb, $q$select 1 from public.create_birthday_code('zz-code@example.test') c where c.code <> 'ZZLOY-10-AAAAA'$q$, 'ok') || nl;
  r := r || pg_temp.t('BD02 loyalty code expiry untouched', 'postgres', '{}', $q$select 1 from public.birthday_discount_codes where code = 'ZZLOY-10-AAAAA' and expires_on = current_date + 30 and kind = 'loyalty'$q$, 'ok') || nl;
  r := r || pg_temp.t('BD03 second call reuses the birthday code', 'authenticated', cb, $q$select 1 from public.create_birthday_code('zz-code@example.test')$q$, 'ok') || nl;
  r := r || pg_temp.t('BD03b one open birthday code', 'postgres', '{}', $q$select 1 from public.birthday_discount_codes where client_email = 'zz-code@example.test' and kind = 'birthday' and used_at is null having count(*) = 1$q$, 'ok') || nl;

  -- ── 20. profiles-guard (alle regels van 05-10 + slot + slugs) ───────────
  r := r || pg_temp.t('P01 plan change outside trial', 'authenticated', cb, format($q$update public.profiles set plan = 'starter' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P02 plan_expires_at', 'authenticated', cb, format($q$update public.profiles set plan_expires_at = '2099-01-01' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P03 subscription_status', 'authenticated', cb, format($q$update public.profiles set subscription_status = 'trialing' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P04 is_demo', 'authenticated', cb, format('update public.profiles set is_demo = false where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('P05 mollie_subscription_id', 'authenticated', cb, format($q$update public.profiles set mollie_subscription_id = 'sub_zz' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P06 referral credit', 'authenticated', cb, format('update public.profiles set referral_credit_days = 99 where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('P07 google token', 'authenticated', cb, format($q$update public.profiles set google_refresh_token = 'zz' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P08 invoice counter', 'authenticated', cb, format('update public.profiles set next_invoice_number = 999 where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('P08b referred_by reset', 'authenticated', cb, format('update public.profiles set referred_by = %L where id = %L', victim, bloom), 'err') || nl;
  r := r || pg_temp.t('P09 big Save + settings columns', 'authenticated', cb, format($q$update public.profiles set business_name='Bloom Studio', city='Amsterdam', accent_color='#8A7356', iban='NL91ABNA0417164300', booking_policy='zz', day_overrides='{}'::jsonb, slug='bloomstudio', invoice_profiles='[]'::jsonb, onboarding_done_at=now(), staff_view_revenue=true, calendar_feed_token='zzfeed0123456789012345678901234567890123456789', prepay_enabled=true, country_code='NL', btw_rate=21, discount_codes='[]'::jsonb where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P10 email casing (signup upsert)', 'authenticated', cb, format($q$update public.profiles set email = 'Demo@BloomStudio.example' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P11 email to another address', 'authenticated', cb, format($q$update public.profiles set email = 'other@example.test' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P12 delete own profile', 'authenticated', cb, format('delete from public.profiles where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('P13 signup upsert on existing row', 'authenticated', cb, format($q$insert into public.profiles (id, email, business_name, slug, city, country_code, accent_color, account_type) values (%L, 'demo@bloomstudio.example', 'Bloom Studio', 'bloomstudio', 'Amsterdam', 'NL', '#8A7356', 'joint') on conflict (id) do update set id = excluded.id, email = excluded.email, business_name = excluded.business_name, slug = excluded.slug, city = excluded.city, country_code = excluded.country_code, accent_color = excluded.accent_color, account_type = excluded.account_type$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P14 new profile with plan', 'authenticated', chu1, format($q$insert into public.profiles (id, email, business_name, slug, city, plan, subscription_status) values (%L, 'zz-hu1@example.test', 'ZZ', 'zz-guard-a', 'Test', 'professional', 'active')$q$, hu1), 'err') || nl;
  r := r || pg_temp.t('P15 new profile for someone else', 'authenticated', chu1, format($q$insert into public.profiles (id, email, business_name, slug, city) values (%L, 'zz-hu1@example.test', 'ZZ', 'zz-guard-b', 'Test')$q$, victim), 'err') || nl;
  r := r || pg_temp.t('P15b new profile with foreign e-mail', 'authenticated', chu1, format($q$insert into public.profiles (id, email, business_name, slug, city) values (%L, 'someone.else@example.test', 'ZZ', 'zz-guard-d', 'Test')$q$, hu1), 'err') || nl;
  r := r || pg_temp.t('PG01 new profile with reserved slug', 'authenticated', chu1, format($q$insert into public.profiles (id, email, business_name, slug, city) values (%L, 'zz-hu1@example.test', 'Login', 'login', 'Test')$q$, hu1), 'err') || nl;
  r := r || pg_temp.t('PG02 new profile with plan_change_started_at', 'authenticated', chu1, format($q$insert into public.profiles (id, email, business_name, slug, city, plan_change_started_at) values (%L, 'zz-hu1@example.test', 'ZZ', 'zz-guard-e', 'Test', now())$q$, hu1), 'err') || nl;
  r := r || pg_temp.t('P16 new profile, plain signup', 'authenticated', chu1, format($q$insert into public.profiles (id, email, business_name, slug, city, country_code, accent_color, account_type) values (%L, 'zz-hu1@example.test', 'ZZ', 'zz-guard-c', 'Test', 'NL', '#c9a96e', 'joint')$q$, hu1), 'ok') || nl;
  r := r || pg_temp.t('P16b referral code generated', 'postgres', '{}', format('select 1 from public.profiles where id = %L and referral_code is not null', hu1), 'ok') || nl;
  r := r || pg_temp.t('P17 service_role writes billing', 'service_role', cs, format('update public.profiles set plan_expires_at = now() + interval %L where id = %L', '1 day', bloom), 'ok') || nl;
  r := r || pg_temp.t('P18 definer RPC next_receipt_number', 'authenticated', cb, format('select public.next_receipt_number(%L::uuid)', bloom), 'ok') || nl;
  r := r || pg_temp.t('P19 staff updates salon profile', 'authenticated', cn, format($q$update public.profiles set business_name = 'ZZ' where id = %L$q$, bloom), 'zero') || nl;
  r := r || pg_temp.t('P20 anon updates a profile', 'anon', ca, format($q$update public.profiles set business_name = 'ZZ' where id = %L$q$, bloom), 'zero') || nl;
  r := r || pg_temp.t('PG03 owner sets plan_change_started_at', 'authenticated', cb, format('update public.profiles set plan_change_started_at = now() where id = %L', bloom), 'err') || nl;
  r := r || pg_temp.t('PG04 service_role sets plan_change_started_at', 'service_role', cs, format('update public.profiles set plan_change_started_at = now() where id = %L', bloom), 'ok') || nl;
  r := r || pg_temp.t('PG05 owner saves while lock is set', 'authenticated', cb, format($q$update public.profiles set city = 'Amsterdam' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('PG06 slug to admin', 'authenticated', cb, format($q$update public.profiles set slug = 'admin' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('PG07 slug to Contact (case)', 'authenticated', cb, format($q$update public.profiles set slug = 'Contact' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('PG08 slug to robots.txt', 'authenticated', cb, format($q$update public.profiles set slug = 'robots.txt' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('PG10 slug to rate', 'authenticated', cb, format($q$update public.profiles set slug = 'rate' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('PG11 slug to Beoordeel', 'authenticated', cb, format($q$update public.profiles set slug = 'Beoordeel' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('PG12 slug to integrations', 'authenticated', cb, format($q$update public.profiles set slug = 'integrations' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('PG09 slug to a normal name', 'authenticated', cb, format($q$update public.profiles set slug = 'zz-bloom-new' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P21 setup: Bloom on trial (server)', 'postgres', '{}', format($q$update public.profiles set subscription_status = 'trialing', plan = 'starter' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P22 trial upgrade to Professional', 'authenticated', cb, format($q$update public.profiles set plan = 'professional' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P23 trial back to Starter', 'authenticated', cb, format($q$update public.profiles set plan = 'starter' where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('P24 trial plan + expiry together', 'authenticated', cb, format($q$update public.profiles set plan = 'professional', plan_expires_at = '2099-01-01' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P25 trial ends own trial (status)', 'authenticated', cb, format($q$update public.profiles set subscription_status = 'active' where id = %L$q$, bloom), 'err') || nl;

  -- ── 21. admin-RPC's ─────────────────────────────────────────────────────
  r := r || pg_temp.t('AD01 anon admin_cron_summary', 'anon', ca, 'select public.admin_cron_summary()', 'err') || nl;
  r := r || pg_temp.t('AD02 no anon/public execute on the six', 'postgres', '{}', $q$select 1 where not exists (select 1 from unnest(array['public.admin_app_ratings()','public.admin_cron_summary()','public.admin_rating_invites()','public.admin_rating_site_visibility()','public.admin_set_app_rating_published(uuid,boolean)','public.admin_set_rating_site_visibility(boolean)']) f where has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute'))$q$, 'ok') || nl;
  r := r || pg_temp.t('AD03 non-admin user still blocked inside', 'authenticated', cb, 'select public.admin_cron_summary()', 'err') || nl;

  -- ── rechten op de nieuwe functies ───────────────────────────────────────
  r := r || pg_temp.t('FN01 internal helpers not callable', 'postgres', '{}', $q$select 1 where not has_function_privilege('authenticated', 'public.staff_can_handle_appointment(uuid)', 'execute') and not has_function_privilege('anon', 'public.grant_referral_credit(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.release_codes_on_cancel()', 'execute') and not has_function_privilege('anon', 'public.claim_staff_invite(text)', 'execute') and has_function_privilege('authenticated', 'public.claim_staff_invite(text)', 'execute') and not has_function_privilege('authenticated', 'public.staff_hide_money(jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.staff_pay_state(jsonb)', 'execute')$q$, 'ok') || nl;

  raise exception E'REPORT\n%', r;
end $$;
