-- Fix-all audit 05-10-2026: DB.sql deel A, secties 6-11 (bezette tijden, uitnodiging, verwijzingen, wachtlijst, cron-geheim, publieke views).
-- Samengesteld uit supabase/migrations/pending/*.sql (zie de commitgeschiedenis).
set local lock_timeout = '10s';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Bezette tijden: elk deel van een teamboeking, geen kassaverkopen, vaste
--    volgorde (E1-01, E1-19, C1-09)
-- ════════════════════════════════════════════════════════════════════════════
-- Zelfde handtekening en kolommen (ClientApp hoeft niets te wijzigen). Een
-- afspraak met een service_breakdown waarin een stylist staat, geeft één rij
-- per deel: begin = time + offset_min, duur = het deel. Anders één rij zoals
-- altijd. Kassaverkopen (is_sale, of de structurele verkooprij: geen dienst,
-- duur 0, wel producten) blokkeren niets meer.
-- Regels per deel (book-appointment en reschedule-appointment, E1, moeten
-- hetzelfde doen):
--  * stylist = staff_id van het deel, anders staff_assignments[service_id
--    van het deel], anders staff_id van de afspraak, anders NULL (dan blokkeert
--    het deel iedereen, zoals een afspraak zonder stylist);
--  * de hele afspraak blijft bezet: eindigt het laatste deel vóór
--    service_duration (de eigenaar verlengde alleen de duur, Bewerk schrijft
--    de verdeling dan niet opnieuw), dan loopt het deel (of de delen) dat het
--    laatst eindigt door tot time + service_duration. Een verdeling die
--    langer is dan service_duration blijft zoals ze is.
-- ORDER BY over alle kolommen: rijen die gelijk sorteren zijn identiek, dus
-- pagineren met .range() is stabiel.
create or replace function public.get_booked_slots_range(p_slug text, p_from date, p_to date, p_location_id uuid default null::uuid)
returns table(date date, "time" text, service_duration integer, staff_id uuid)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with appts as (
    select a.id, a.date as d, a.time as t, a.service_duration as dur, a.staff_id as sid, a.service_breakdown as sb,
           a.staff_assignments as sa,
           exists (select 1 from jsonb_array_elements(
                     case when jsonb_typeof(a.service_breakdown) = 'array' then a.service_breakdown else '[]'::jsonb end) e
                    where coalesce(e ->> 'staff_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  ) as is_team
      from public.appointments a
      join public.profiles p on p.id = a.owner_id
     where p.slug = p_slug
       and a.date >= p_from and a.date <= p_to
       and (p_location_id is null or a.location_id is null or a.location_id = p_location_id)
       and a.status in ('confirmed', 'completed', 'pending_payment')
       and coalesce(a.is_sale, false) = false
       and not (a.service_id is null
                and coalesce(a.service_duration, 0) = 0
                and jsonb_typeof(a.products) = 'array'
                and jsonb_array_length(a.products) > 0)
  ), team_parts as (
    select ap.id, ap.d, ap.t, ap.dur,
           case when (e ->> 'offset_min') ~ '^[0-9]+(\.[0-9]+)?$'
                then round((e ->> 'offset_min')::numeric)::int else 0 end as off,
           case when (e ->> 'duration') ~ '^[0-9]+(\.[0-9]+)?$'
                then round((e ->> 'duration')::numeric)::int else ap.dur end as pdur,
           case when coalesce(e ->> 'staff_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (e ->> 'staff_id')::uuid
                when jsonb_typeof(ap.sa) = 'object'
                     and coalesce(ap.sa ->> (e ->> 'service_id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (ap.sa ->> (e ->> 'service_id'))::uuid
                else ap.sid end as psid
      from appts ap
      cross join lateral jsonb_array_elements(ap.sb) e
     where ap.is_team
  ), team_span as (
    select tp.*, max(tp.off + tp.pdur) over (partition by tp.id) as span
      from team_parts tp
  ), parts as (
    select ap.d, ap.t, ap.dur, ap.sid
      from appts ap
     where not ap.is_team
    union all
    select ts.d,
           case when ts.t ~ '^[0-9]{1,2}:[0-9]{2}'
                then to_char(ts.t::time + make_interval(mins => ts.off), 'HH24:MI')
                else ts.t end,
           case when ts.dur is not null and ts.off + ts.pdur = ts.span and ts.span < ts.dur
                then ts.dur - ts.off
                else ts.pdur end,
           ts.psid
      from team_span ts
  )
  select x.d, x.t, x.dur, x.sid
    from parts x
   order by x.d, x.t, x.sid, x.dur
$function$;

create or replace function public.get_booked_slots(p_slug text, p_date date, p_location_id uuid default null::uuid)
returns table("time" text, service_duration integer, staff_id uuid)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select r.time, r.service_duration, r.staff_id
    from public.get_booked_slots_range(p_slug, p_date, p_date, p_location_id) r
   order by r.time, r.staff_id, r.service_duration
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Teamlid-uitnodiging met een gemailde link in plaats van e-mailmatch
--    (R-02, O7-07, E3-14)
-- ════════════════════════════════════════════════════════════════════════════
-- Aanmelden wordt niet per mail bevestigd, dus "je login-adres is gelijk aan
-- het adres op de rij" bewijst niets: wie het adres van een openstaande
-- uitnodiging kende, werd medewerker van die salon. Nu: create-staff-account
-- (service role) zet een token-hash (sha256, hex, kleine letters) met een
-- vervaldatum en mailt https://vellu.cc/owner?invite=<token>; alleen wie die
-- link heeft, kan claimen via claim_staff_invite(). De browser kan user_id
-- niet meer zelf zetten.
alter table public.staff_members
  add column if not exists invite_token_hash text,
  add column if not exists invite_expires_at timestamptz;

create unique index if not exists staff_members_invite_token_hash_key
  on public.staff_members (invite_token_hash)
  where invite_token_hash is not null;

create or replace function public.claim_staff_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_id uuid;
  v_owner uuid;
  v_email text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- 32 willekeurige bytes als hex (create-staff-account).
  if v_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  end if;

  select sm.id, sm.owner_id, sm.email into v_id, v_owner, v_email
    from public.staff_members sm
   where sm.invite_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
     and sm.user_id is null
     and sm.invite_expires_at > now()
   for update;
  if v_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  end if;

  -- Al gekoppeld als teamlid van een salon (App.jsx zoekt de medewerkersrij
  -- op user_id en verwacht er één), of de eigenaar staat al op haar eigen
  -- rooster: geen tweede koppeling.
  if exists (select 1 from public.staff_members s
              where s.user_id = v_uid
                and (s.owner_id <> v_uid or v_owner = v_uid)) then
    return jsonb_build_object('success', false, 'error', 'already_staff');
  end if;

  -- Een account met een eigen salon (diensten of afspraken) wordt geen
  -- teamlid: dan zou de eigenaar haar eigen dashboard kwijt zijn. Behalve
  -- als het de uitnodiging voor haar EIGEN rij is (eigenaar op het eigen
  -- rooster: eigenaarsbadge en volgorde op de boekingspagina).
  if v_owner <> v_uid
     and (exists (select 1 from public.services where owner_id = v_uid)
          or exists (select 1 from public.appointments where owner_id = v_uid)) then
    return jsonb_build_object('success', false, 'error', 'has_salon');
  end if;

  -- De eigenaar die (nog ingelogd) de uitnodigingslink van een teamlid opent,
  -- koppelt niet haar eigen account aan die rij: alleen als de rij haar eigen
  -- login-adres draagt (eigenaar op het eigen rooster). De link blijft geldig,
  -- zodat het teamlid hem na het uitloggen of op haar eigen toestel kan gebruiken.
  if v_owner = v_uid
     and lower(btrim(coalesce(v_email, ''))) is distinct from
         lower(btrim(coalesce((select u.email from auth.users u where u.id = v_uid), auth.jwt() ->> 'email', ''))) then
    return jsonb_build_object('success', false, 'error', 'not_own_row');
  end if;

  update public.staff_members
     set user_id = v_uid, invite_token_hash = null, invite_expires_at = null
   where id = v_id;

  return jsonb_build_object('success', true, 'staff_id', v_id, 'owner_id', v_owner);
end;
$$;

revoke all on function public.claim_staff_invite(text) from public, anon;
grant execute on function public.claim_staff_invite(text) to authenticated;

-- De guard zonder e-mailclaim, het weghalen van de claim-policies en
-- handle_new_user met de staff_invite-vlag staan in DEEL B (B5): de huidige
-- App.jsx koppelt teamleden nog op e-mail en de huidige create-staff-account
-- geeft de vlag nog niet mee.

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Verwijzingen: de verwijzer krijgt haar tegoed pas na de eerste betaling
--    van de nieuwe salon (R-03, E3-15, L3-06)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.referral_redemptions
  add column if not exists referrer_credited_at timestamptz;

-- Bestaande inwisselingen zijn al uitbetaald (tegoed bij het aanmelden).
update public.referral_redemptions
   set referrer_credited_at = created_at
 where referrer_credited_at is null;

-- Tot DEEL B schrijft de OUDE redeem_referral_code nog inwisselingen en geeft
-- de verwijzer meteen haar dagen. Die rijen krijgen via deze standaardwaarde
-- ook een referrer_credited_at, zodat de nieuwe mollie-webhook (die al vóór
-- DEEL B live staat) ze niet nog een keer uitbetaalt. DEEL B (B6) haalt de
-- standaardwaarde weg en vervangt redeem_referral_code.
alter table public.referral_redemptions
  alter column referrer_credited_at set default now();

-- redeem_referral_code (nieuwe versie) staat in DEEL B (B6).

-- Tegoed voor de verwijzer, één keer per inwisseling. Alleen de server
-- (mollie-webhook na first.paid / oneoff.paid). Geeft het aantal dagen terug,
-- 0 als er niets (meer) te geven is.
create or replace function public.grant_referral_credit(p_new_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referrer uuid;
  v_days integer;
begin
  update public.referral_redemptions r
     set referrer_credited_at = now()
   where r.new_profile_id = p_new_profile_id
     and r.referrer_credited_at is null
  returning r.referrer_id, r.reward_days into v_referrer, v_days;

  if v_referrer is null then
    return 0;
  end if;

  update public.profiles
     set referral_credit_days = coalesce(referral_credit_days, 0) + coalesce(v_days, 0)
   where id = v_referrer
     and not coalesce(is_demo, false);
  if not found then
    return 0;
  end if;
  return coalesce(v_days, 0);
end;
$$;

revoke all on function public.grant_referral_credit(uuid) from public, anon, authenticated;
grant execute on function public.grant_referral_credit(uuid) to service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Wachtlijst: inschrijven alleen via waitlist-notify (R-04, E1-12, L1-09,
--    L2-10)
-- ════════════════════════════════════════════════════════════════════════════
-- Iedereen kon rijen invoegen met elke status, datum en created_at (vooraan in
-- de rij), ook als de salon de wachtlijst uit had. waitlist-notify valideert
-- en voegt nu zelf in (service role) en bewaart de taal van de klant voor de
-- "plek vrij"-mail.
alter table public.waitlist add column if not exists lang text;

-- De anonieme insert gaat dicht in DEEL B (B7): de huidige boekingspagina
-- voegt nog zelf in.

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Cron-geheim voor de pg_cron-aanroepen (E2-04)
-- ════════════════════════════════════════════════════════════════════════════
-- De cronfuncties draaien met verify_jwt = false en deden alles voor elke
-- anonieme aanroeper (db-backup schreef per aanroep een volledige dump en gaf
-- tabeltellingen terug). Ze eisen nu een geheim. pg_cron stuurt het als header
-- x-cron-secret mee, gelezen uit Vault op het moment van de aanroep (het staat
-- dus niet in cron.job). De functies toetsen het via cron_secret_ok().
-- prepay-watch en check-pending-payments blijven bewust zonder geheim.
create or replace function public.cron_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_secret, '') <> ''
     and p_secret = (select ds.decrypted_secret from vault.decrypted_secrets ds
                      where ds.name = 'cron_secret' limit 1)
$$;

revoke all on function public.cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.cron_secret_ok(text) to service_role;

do $$
declare
  j record;
  v_cmd text;
  v_n integer := 0;
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret',
                                'pg_cron -> edge functions (header x-cron-secret)');
  end if;

  -- Naam, schema, URL, Authorization en body blijven gelijk; alleen de header
  -- komt erbij.
  for j in
    select jobid, jobname, command
      from cron.job
     where jobname in ('send-daily-reminders', 'send-daily-followups', 'send-daily-rebook-nudge',
                       'db-backup-daily', 'cron-watchdog-daily', 'send-renewal-reminder-daily')
  loop
    v_n := v_n + 1;
    continue when position('x-cron-secret' in j.command) > 0;
    v_cmd := regexp_replace(
      j.command,
      '(headers\s*:=\s*''[^'']*''::jsonb)',
      '\1 || jsonb_build_object(''x-cron-secret'', (select decrypted_secret from vault.decrypted_secrets where name = ''cron_secret''))');
    if v_cmd = j.command then
      raise exception 'cron job %: headers niet gevonden, x-cron-secret niet toegevoegd', j.jobname;
    end if;
    perform cron.alter_job(job_id := j.jobid, command := v_cmd);
  end loop;

  if v_n <> 6 then
    raise warning 'cron-geheim: % van de 6 verwachte jobs gevonden', v_n;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Publieke blokkades zonder reden, opgeschoonde public_salons en
--     public_staff (C1-07, S1-22, L4-05, S1-09, L3-06)
-- ════════════════════════════════════════════════════════════════════════════
-- staff_day_overrides was voor iedereen leesbaar (USING true), inclusief de
-- vrije tekst reason ('Prive', 'Bday trip', klantnamen met tijden). De
-- boekingspagina heeft alleen de vensters nodig.
create or replace view public.public_staff_day_overrides as
  select id, owner_id, staff_id, service_id, date, weekday, kind, block_time_start, block_time_end
    from public.staff_day_overrides;

-- Eenvoudige view = bij te werken view: zonder deze revoke zou anon via de
-- view (als postgres) kunnen schrijven.
revoke all on public.public_staff_day_overrides from public, anon, authenticated;
grant select on public.public_staff_day_overrides to anon, authenticated;

-- De publieke leespolicy op de tabel gaat weg in DEEL B (B8): de huidige
-- boekingspagina leest de tabel nog rechtstreeks.

-- De staff-app leest en bewerkt haar eigen blokkades (S1-09: "Bewerk" faalde
-- altijd, er was geen UPDATE-policy voor medewerkers).
drop policy if exists staff_read_own_day_overrides on public.staff_day_overrides;
create policy staff_read_own_day_overrides on public.staff_day_overrides
  for select to authenticated
  using (exists (select 1 from public.staff_members sm
                  where sm.id = staff_day_overrides.staff_id
                    and sm.user_id = auth.uid() and sm.active is not false));

drop policy if exists "Staff update own blocks" on public.staff_day_overrides;
create policy "Staff update own blocks" on public.staff_day_overrides
  for update to authenticated
  using (exists (select 1 from public.staff_members sm
                  where sm.id = staff_day_overrides.staff_id
                    and sm.user_id = auth.uid() and sm.active is not false
                    and sm.owner_id = staff_day_overrides.owner_id))
  with check (exists (select 1 from public.staff_members sm
                       where sm.id = staff_day_overrides.staff_id
                         and sm.user_id = auth.uid()
                         and sm.owner_id = staff_day_overrides.owner_id));

-- public_salons: zelfde kolommen in dezelfde volgorde, met drie wijzigingen:
--  - day_overrides zonder reason en staff_name in elke regel;
--  - referral_code NULL voor de demo-salon (geen "Uitgenodigd door Bloom
--    Studio" voor elke prospect die de demo bekijkt);
--  - nieuw achteraan: cancel_deadline_hours en is_demo.
create or replace view public.public_salons as
 SELECT id,
    slug,
    business_name,
    owner_name,
    city,
    country_code,
    address,
    accent_color,
    business_hours,
    account_type,
    page_font,
    slot_interval_minutes,
    show_owner_on_booking,
    booking_policy,
    booking_policy_en,
    salon_phone,
    salon_instagram,
    salon_email,
    whatsapp_number,
    phone_required,
    waitlist_enabled,
    break_minutes,
    logo_url,
    cover_image_url,
    cover_focal_y,
        CASE jsonb_typeof(day_overrides)
            WHEN 'object'::text THEN ( SELECT COALESCE(jsonb_object_agg(e.key,
                    CASE WHEN jsonb_typeof(e.value) = 'object'::text THEN (e.value - 'reason'::text) - 'staff_name'::text ELSE e.value END), '{}'::jsonb)
                   FROM jsonb_each(profiles.day_overrides) e(key, value))
            WHEN 'array'::text THEN ( SELECT COALESCE(jsonb_agg(
                    CASE WHEN jsonb_typeof(e.value) = 'object'::text THEN (e.value - 'reason'::text) - 'staff_name'::text ELSE e.value END
                    ORDER BY e.ord), '[]'::jsonb)
                   FROM jsonb_array_elements(profiles.day_overrides) WITH ORDINALITY e(value, ord))
            ELSE day_overrides
        END AS day_overrides,
    min_advance_hours,
    max_advance_days,
    directory_visible,
    subscription_status,
    created_at,
        CASE WHEN COALESCE(is_demo, false) THEN NULL::text ELSE referral_code END AS referral_code,
    NULLIF(btrim(payment_link), '') IS NOT NULL OR NULLIF(btrim(iban), '') IS NOT NULL AS payment_configured,
    ( SELECT COALESCE(jsonb_agg(c.value), '[]'::jsonb) AS "coalesce"
           FROM jsonb_array_elements(COALESCE(profiles.discount_codes, '[]'::jsonb)) c(value)
          WHERE ((c.value ->> 'active'::text)::boolean) IS TRUE AND (c.value ->> 'source'::text) IS DISTINCT FROM 'birthday'::text) AS discount_codes,
    cover_zoom,
    cover_focal_x,
    ask_birthday_on_booking AND birthday_feature_enabled AS ask_birthday_on_booking,
    loyalty_enabled AND COALESCE(loyalty_scope, 'all'::text) = 'all'::text AS loyalty_enabled,
    loyalty_visits,
    loyalty_discount_pct,
    prepay_enabled AND (payment_link IS NOT NULL OR iban IS NOT NULL OR (EXISTS ( SELECT 1
           FROM staff_members s
          WHERE s.owner_id = profiles.id AND s.active IS TRUE AND (NULLIF(s.iban, ''::text) IS NOT NULL OR NULLIF(s.payment_link, ''::text) IS NOT NULL)))) AS prepay_enabled,
    booking_theme,
        CASE
            WHEN no_show_fee_enabled THEN no_show_fee_pct
            ELSE 0
        END AS no_show_fee_pct,
    cancel_deadline_hours,
    COALESCE(is_demo, false) AS is_demo
   FROM profiles;

-- public_staff: nieuw achteraan has_pay (eigen IBAN of betaallink), zodat de
-- boekingspagina "Vooruitbetalen" alleen toont als book-appointment het
-- accepteert (regel 12a: één stylist met eigen betaalgegevens).
create or replace view public.public_staff as
 SELECT id,
    owner_id,
    name,
    role,
    bio,
    avatar_url,
    working_hours,
    active,
    "position",
    user_id = owner_id AS is_owner,
    NULLIF(iban, ''::text) IS NOT NULL OR NULLIF(payment_link, ''::text) IS NOT NULL AS has_pay
   FROM staff_members;
