-- O6 tests: draaien ALLEEN in één batch die begint met "begin;" en eindigt met
-- de exception hieronder (alles wordt teruggedraaid). Rollen gesimuleerd via
-- set_config('role') + request.jwt.claims, zoals de app ze heeft.
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
  cb  jsonb := jsonb_build_object('sub', '74029064-56c2-44d1-93c2-b814db4059cf', 'role', 'authenticated', 'email', 'demo@bloomstudio.example');
  cs  jsonb := '{"role":"service_role"}';
  p2  text := 'zz-o6-profile-2';
  p3  text := 'zz-o6-profile-3';
  nl  text := E'\n';
begin
  -- Gewone opslag van de instellingen (hoofdprofiel INV, geen extra's)
  r := r || pg_temp.t('P01 owner saves settings unchanged', 'authenticated', cb, format($q$update public.profiles set city = city, invoice_prefix = 'INV', invoice_profiles = '[]'::jsonb where id = %L$q$, bloom), 'ok') || nl;
  -- Nieuw extra profiel met hetzelfde voorvoegsel als het hoofdprofiel
  r := r || pg_temp.t('P02 extra profile with INV (same as main)', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_build_array(jsonb_build_object('id', %L, 'label', '', 'invoice_prefix', 'INV', 'next_invoice_number', 1)) where id = %L$q$, p2, bloom), 'err') || nl;
  r := r || pg_temp.t('P03 extra profile with " inv " (case/space)', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_build_array(jsonb_build_object('id', %L, 'label', '', 'invoice_prefix', ' inv ', 'next_invoice_number', 1)) where id = %L$q$, p2, bloom), 'err') || nl;
  r := r || pg_temp.t('P04 extra profile with empty prefix (= INV)', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_build_array(jsonb_build_object('id', %L, 'label', '', 'invoice_prefix', '', 'next_invoice_number', 1)) where id = %L$q$, p2, bloom), 'err') || nl;
  r := r || pg_temp.t('P05 extra profile without prefix key (= INV)', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_build_array(jsonb_build_object('id', %L, 'label', 'Lady')) where id = %L$q$, p2, bloom), 'err') || nl;
  -- Wat de app nu doet: eigen voorvoegsel
  r := r || pg_temp.t('P06 extra profile with own prefix INV2', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_build_array(jsonb_build_object('id', %L, 'label', '', 'invoice_prefix', 'INV2', 'next_invoice_number', 1)) where id = %L$q$, p2, bloom), 'ok') || nl;
  r := r || pg_temp.t('P07 label typed, prefix follows (LADY)', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_build_array(jsonb_build_object('id', %L, 'label', 'Lady', 'invoice_prefix', 'LADY', 'next_invoice_number', 1)) where id = %L$q$, p2, bloom), 'ok') || nl;
  r := r || pg_temp.t('P08 main prefix changed to lady (dup of extra)', 'authenticated', cb, format($q$update public.profiles set invoice_prefix = 'lady' where id = %L$q$, bloom), 'err') || nl;
  r := r || pg_temp.t('P09 main prefix changed to BLOOM', 'authenticated', cb, format($q$update public.profiles set invoice_prefix = 'BLOOM' where id = %L$q$, bloom), 'ok') || nl;
  -- Factuurnummer ophalen (teller in invoice_profiles) blijft werken
  r := r || pg_temp.t('P10 next_invoice_number for extra profile', 'authenticated', cb, format($q$select public.next_invoice_number(%L::uuid, %L)$q$, bloom, p2), 'ok') || nl;
  r := r || pg_temp.t('P10b counter of extra profile went to 2', 'postgres', '{}', format($q$select 1 from public.profiles, jsonb_array_elements(invoice_profiles) e where id = %L and e->>'id' = %L and (e->>'next_invoice_number')::int = 2$q$, bloom, p2), 'ok') || nl;
  r := r || pg_temp.t('P11 next_invoice_number for main profile', 'authenticated', cb, format($q$select public.next_invoice_number(%L::uuid, null)$q$, bloom), 'ok') || nl;
  -- Twee extra profielen onderling gelijk
  r := r || pg_temp.t('P12 two extras with the same prefix', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = invoice_profiles || jsonb_build_array(jsonb_build_object('id', %L, 'label', 'Noor', 'invoice_prefix', 'LADY', 'next_invoice_number', 1)) where id = %L$q$, p3, bloom), 'err') || nl;
  r := r || pg_temp.t('P13 second extra with own prefix NOOR', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = invoice_profiles || jsonb_build_array(jsonb_build_object('id', %L, 'label', 'Noor', 'invoice_prefix', 'NOOR', 'next_invoice_number', 1)) where id = %L$q$, p3, bloom), 'ok') || nl;
  r := r || pg_temp.t('P14 service_role cannot add a dup either', 'service_role', cs, format($q$update public.profiles set invoice_prefix = 'NOOR' where id = %L$q$, bloom), 'err') || nl;

  -- Bestaande salon die AL een dubbel heeft (oude data): gewone opslag,
  -- tellers en opruimen blijven werken; een extra dubbel niet.
  alter table public.profiles disable trigger profiles_invoice_prefix_unique;
  update public.profiles
     set invoice_prefix = 'INV',
         invoice_profiles = jsonb_build_array(
           jsonb_build_object('id', p2, 'label', 'Lady', 'invoice_prefix', 'INV', 'next_invoice_number', 3),
           jsonb_build_object('id', p3, 'label', 'Noor', 'invoice_prefix', 'NOOR', 'next_invoice_number', 1))
   where id = bloom::uuid;
  alter table public.profiles enable trigger profiles_invoice_prefix_unique;
  r := r || pg_temp.t('L01 legacy dup: owner saves settings unchanged', 'authenticated', cb, format($q$update public.profiles set city = city, invoice_prefix = invoice_prefix, invoice_profiles = invoice_profiles where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('L02 legacy dup: counter of dup profile', 'authenticated', cb, format($q$select public.next_invoice_number(%L::uuid, %L)$q$, bloom, p2), 'ok') || nl;
  r := r || pg_temp.t('L03 legacy dup: delete the other profile', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_path_query_array(invoice_profiles, '$[0]') where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('L04 legacy dup: third INV refused', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = invoice_profiles || jsonb_build_array(jsonb_build_object('id', %L, 'label', 'X', 'invoice_prefix', 'inv', 'next_invoice_number', 1)) where id = %L$q$, p3, bloom), 'err') || nl;
  r := r || pg_temp.t('L05 legacy dup: owner fixes it (LADY)', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_set(invoice_profiles, '{0,invoice_prefix}', '"LADY"') where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('L06 after fix: dup again refused', 'authenticated', cb, format($q$update public.profiles set invoice_profiles = jsonb_set(invoice_profiles, '{0,invoice_prefix}', '"INV"') where id = %L$q$, bloom), 'err') || nl;
  -- Andere schrijvers die de kolommen niet aanraken
  r := r || pg_temp.t('X01 unrelated update (accent) by owner', 'authenticated', cb, format($q$update public.profiles set accent_color = accent_color where id = %L$q$, bloom), 'ok') || nl;
  r := r || pg_temp.t('X02 live data has no dup today', 'postgres', '{}', $q$select 1 from public.profiles where (select count(*) - count(distinct p) from unnest(public.invoice_prefixes_of(invoice_prefix, invoice_profiles)) p) > 0$q$, 'zero') || nl;
  r := r || pg_temp.t('X03 helper not callable by anon', 'anon', '{"role":"anon"}', $q$select public.invoice_prefixes_of('INV', '[]'::jsonb)$q$, 'err') || nl;
  r := r || pg_temp.t('X04 helper callable by owner', 'authenticated', cb, $q$select 1 where public.invoice_prefixes_of(' inv ', '[{"invoice_prefix":""},{"invoice_prefix":"tt-l"},{}]'::jsonb) = array['INV','INV','TT-L','INV']$q$, 'ok') || nl;
  r := r || pg_temp.t('X05 trigger function not callable directly', 'authenticated', cb, $q$select public.profiles_invoice_prefix_unique()$q$, 'err') || nl;

  raise exception E'REPORT\n%', r;
end $$;
