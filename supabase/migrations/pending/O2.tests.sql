-- Tests voor supabase/migrations/pending/O2.sql (trigger appointments_unhide_client).
-- Draaien in ÉÉN batch die terugrolt:
--   begin; <O2.sql>; <dit bestand>   (het eindigt met raise exception = rollback)
-- Rollen worden nagebootst met set_config('role'/'request.jwt.claims').

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
  bloom   uuid := '74029064-56c2-44d1-93c2-b814db4059cf';
  other   uuid := '0af0ac31-b994-485d-9e6c-0852fad12feb';
  noorrow uuid := '6246e170-f838-46fc-93c9-d3d8cc18cc39';
  cb  jsonb := jsonb_build_object('sub', '74029064-56c2-44d1-93c2-b814db4059cf', 'role', 'authenticated', 'email', 'demo@bloomstudio.example');
  cn  jsonb := jsonb_build_object('sub', '7ea0a9c9-a823-4bfd-99f1-58899dec4c85', 'role', 'authenticated', 'email', 'staff@bloomstudio.example');
  ca  jsonb := '{"role":"anon"}';
  cs  jsonb := '{"role":"service_role"}';
  m1 uuid := gen_random_uuid(); m1b uuid := gen_random_uuid(); m2 uuid := gen_random_uuid();
  m3 uuid := gen_random_uuid(); m4 uuid := gen_random_uuid(); m5 uuid := gen_random_uuid();
  m6 uuid := gen_random_uuid();
  nl text := E'\n';
begin
  -- Opzet (postgres): verborgen klantrijen. Twee dubbele rijen voor zzhide1 bij
  -- Bloom, dezelfde klant verborgen bij een andere salon, en controles.
  insert into public.manual_clients (id, owner_id, name, email, hidden) values
    (m1,  bloom, 'ZZ Hide Een',  'ZZHide1@Example.test', true),
    (m1b, bloom, 'ZZ Hide Een',  'zzhide1@example.test', true),
    (m2,  other, 'ZZ Hide Een',  'zzhide1@example.test', true),
    (m3,  bloom, 'ZZ Hide Twee', 'zzhide2@example.test', true),
    (m4,  bloom, 'ZZ Hide Drie', 'zzhide3@example.test', true),
    (m5,  bloom, 'ZZ Geen Mail', null,                   true),
    (m6,  bloom, 'ZZ Hide Vier', 'zzhide4@example.test', true);

  -- Eigenaar boekt een afspraak voor zzhide1 (andere hoofdletters + spaties).
  r := r || pg_temp.t('U01 owner inserts appointment for hidden client', 'authenticated', cb,
        format($q$insert into public.appointments (owner_id, date, time, client_name, client_email) values (%L, current_date + 30, '10:00', 'ZZ Hide Een', ' ZZHIDE1@example.test ')$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('U02 both Bloom rows of zzhide1 visible again', 'postgres', '{}',
        format($q$select 1 from (select count(*) c from public.manual_clients where id in (%L, %L) and not hidden) x where c = 2$q$, m1, m1b), 'ok') || nl;
  r := r || pg_temp.t('U03 other salon keeps its hidden row', 'postgres', '{}',
        format('select 1 from public.manual_clients where id = %L and hidden', m2), 'ok') || nl;

  -- Medewerker (Noor) voert een afspraak in: de trigger draait als definer.
  r := r || pg_temp.t('U04 staff inserts appointment for hidden client', 'authenticated', cn,
        format($q$insert into public.appointments (owner_id, date, time, client_name, client_email, staff_id) values (%L, current_date + 31, '11:00', 'ZZ Hide Twee', 'zzhide2@example.test', %L)$q$, bloom, noorrow), 'ok') || nl;
  r := r || pg_temp.t('U05 staff booking unhides the client', 'postgres', '{}',
        format('select 1 from public.manual_clients where id = %L and not hidden', m3), 'ok') || nl;
  r := r || pg_temp.t('U05b staff still cannot update manual_clients directly', 'authenticated', cn,
        format('update public.manual_clients set hidden = true where id = %L', m3), 'zero') || nl;

  -- Boekingspagina (book-appointment draait als service role).
  r := r || pg_temp.t('U06 service role inserts appointment', 'service_role', cs,
        format($q$insert into public.appointments (owner_id, date, time, client_name, client_email) values (%L, current_date + 32, '12:00', 'ZZ Hide Drie', 'zzhide3@example.test')$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('U07 online booking unhides the client', 'postgres', '{}',
        format('select 1 from public.manual_clients where id = %L and not hidden', m4), 'ok') || nl;

  -- Afspraak zonder e-mailadres raakt niets.
  r := r || pg_temp.t('U08 owner inserts appointment without email', 'authenticated', cb,
        format($q$insert into public.appointments (owner_id, date, time, client_name, client_email) values (%L, current_date + 33, '13:00', 'ZZ Geen Mail', '')$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('U09 email-less hidden row stays hidden', 'postgres', '{}',
        format('select 1 from public.manual_clients where id = %L and hidden', m5), 'ok') || nl;
  r := r || pg_temp.t('U10 unrelated hidden row stays hidden', 'postgres', '{}',
        format('select 1 from public.manual_clients where id = %L and hidden', m6), 'ok') || nl;

  -- Geen nieuwe paden: functie niet direct aanroepbaar, geen anon-insert,
  -- geen insert voor een andere salon.
  r := r || pg_temp.t('U11 anon cannot call the trigger function', 'anon', ca,
        'select public.tg_appointments_unhide_client()', 'err') || nl;
  r := r || pg_temp.t('U12 authenticated cannot call the trigger function', 'authenticated', cb,
        'select public.tg_appointments_unhide_client()', 'err') || nl;
  r := r || pg_temp.t('U13 anon cannot insert an appointment', 'anon', ca,
        format($q$insert into public.appointments (owner_id, date, time, client_name, client_email) values (%L, current_date + 34, '14:00', 'ZZ', 'zzhide4@example.test')$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('U14 owner cannot insert for another salon', 'authenticated', cb,
        format($q$insert into public.appointments (owner_id, date, time, client_name, client_email) values (%L, current_date + 34, '14:00', 'ZZ', 'zzhide1@example.test')$q$, other), 'err') || nl;
  r := r || pg_temp.t('U15 other salon row still hidden after U14', 'postgres', '{}',
        format('select 1 from public.manual_clients where id = %L and hidden', m2), 'ok') || nl;
  r := r || pg_temp.t('U16 zzhide4 still hidden after failed inserts', 'postgres', '{}',
        format('select 1 from public.manual_clients where id = %L and hidden', m6), 'ok') || nl;

  -- Normaal gebruik van de klantenlijst blijft werken.
  r := r || pg_temp.t('U17 owner hides a client again', 'authenticated', cb,
        format('update public.manual_clients set hidden = true where owner_id = %L and id in (%L, %L)', bloom, m1, m1b), 'ok') || nl;
  r := r || pg_temp.t('U18 owner restores a hidden client', 'authenticated', cb,
        format('update public.manual_clients set hidden = false where owner_id = %L and id in (%L, %L)', bloom, m1, m1b), 'ok') || nl;
  r := r || pg_temp.t('U19 owner updates own appointments by id (merge/edit path)', 'authenticated', cb,
        format($q$update public.appointments set client_email = 'zzhide1b@example.test' where owner_id = %L and client_email = ' ZZHIDE1@example.test '$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('U20 trigger exists on appointments', 'postgres', '{}',
        $q$select 1 from pg_trigger where tgname = 'appointments_unhide_client' and tgrelid = 'public.appointments'::regclass and not tgisinternal$q$, 'ok') || nl;

  raise exception E'O2 TEST REPORT (rolled back)\n%', r;
end $$;
