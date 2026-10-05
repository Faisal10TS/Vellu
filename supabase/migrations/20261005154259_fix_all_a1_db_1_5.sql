-- Fix-all audit 05-10-2026: DB.sql deel A, secties 1-5 (producten, klantrij, staff-app, wachtlijst, geheimen).
-- Samengesteld uit supabase/migrations/pending/*.sql (zie de commitgeschiedenis).
set local lock_timeout = '10s';

-- Fix-all 05-10-2026, pakket DB (audit 05-10). NIET los toepassen: de
-- orchestrator voegt de pending-bestanden samen.
--
-- TWEE DELEN, TWEE MIGRATIES. Dit bestand wordt gesplitst op de enige regel
-- die begint met "-- @@ DEEL B" (onderaan, vóór B1).
-- Volgorde bij uitrollen:
--   1. DEEL A (alles boven de markering) als eerste migratie. Additief of
--      compatibel met de frontend en edge functions die NU live staan: oude
--      aanroepers blijven werken, en alles wat de nieuwe code aanroept
--      bestaat (public_products, public_staff_day_overrides,
--      staff_salon_profile, staff_list_appointments(p_from, p_to) met
--      pay_state, staff_complete_appointment, staff_mark_prepaid,
--      claim_staff_invite, grant_referral_credit, cron_secret_ok,
--      waitlist.lang, review_tokens.last_sent_at, newsletter_opt_outs, ...).
--   2. Edge functions (E1, E2, E3) en frontend (AP, C1, C2, S, O1-O8, SH)
--      deployen.
--   3. DEEL B (alles onder de markering) als tweede migratie. Daar staat
--      alleen wat een OUDE aanroeper laat falen of verkeerd laat schrijven:
--      de publieke policies op products en staff_day_overrides, UPDATE op
--      clients, de staff-policies op profiles/staff_members, de bedragen uit
--      staff_list_appointments, de e-mailclaim (guard, claim-policies,
--      handle_new_user), redeem_referral_code en de anonieme
--      wachtlijst-insert. Vóór stap 2 toegepast kan een medewerker niet
--      inloggen en schrijft de oude staff-app bedrag 0 weg; vóór stap 1
--      bestaat niet wat de nieuwe code aanroept.
-- DEEL A en DEEL B samen in één transactie (de tests) is ook geldig.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Producten: publieke view in plaats van de hele tabel (L4-01, E1-27)
-- ════════════════════════════════════════════════════════════════════════════
-- "Public can read active products" gaf iedereen met de publieke sleutel
-- inkoopprijs, voorraad, leverancier en barcode van elk actief product van elke
-- salon, ook producten die bewust niet online staan. De boekingspagina heeft
-- alleen naam, omschrijving, prijs, foto en volgorde nodig, en alleen van
-- producten die online zichtbaar zijn bij een Professional-salon (dezelfde
-- regel als book-appointment: products_not_available bij een ander plan).
-- View als postgres, zoals de andere public_*-views: RLS van de basistabel
-- geldt niet, de view zelf bepaalt wat zichtbaar is.
create or replace view public.public_products as
  select pr.id, pr.owner_id,
         pr.name_nl, pr.name_en, pr.name_es,
         pr.description_nl, pr.description_en, pr.description_es,
         pr.price, pr.photo_url, pr.position, pr.created_at
    from public.products pr
    join public.profiles p on p.id = pr.owner_id
   where pr.active is true
     and pr.visible_online is true
     and p.plan = 'professional';

revoke all on public.public_products from public, anon, authenticated;
grant select on public.public_products to anon, authenticated;

-- De anonieme leespolicy op products gaat weg in DEEL B (B1).

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Gedeelde klantrij (clients): niet meer lezen of overschrijven via een
--    e-mailadres (O2-01, O8-11, DB-03, DB-04, E1-13, L1-10, L4-03)
-- ════════════════════════════════════════════════════════════════════════════
-- clients is één rij per e-mailadres voor het hele platform. Een eigenaar kon
-- een afspraak met elk adres aanmaken en dan via de e-mailtak van de policies
-- naam, telefoon, verjaardag en allergieën van die persoon lezen en wijzigen.
-- Lezen kan nu alleen via een afspraak van de eigen salon die naar die rij
-- wijst (client_id). Schrijven gaat niet meer vanuit de browser; wat de salon
-- zelf over een klant vastlegt hoort in manual_clients.
-- Rest-risico (bewust, te groot om nu om te bouwen): wie het adres al kent,
-- kan via get_or_create_client het id krijgen, een afspraak koppelen en die
-- ene rij lezen.
drop policy if exists clients_select_visited_salon on public.clients;
create policy clients_select_visited_salon on public.clients
  for select to authenticated
  using (exists (select 1 from public.appointments a
                  where a.client_id = clients.id
                    and a.owner_id = auth.uid()));

-- Schrijven vanuit de browser gaat dicht in DEEL B (B2): de huidige
-- OwnerApp schrijft verjaardag en no-show nog rechtstreeks.

-- Bestaande rij: alleen lege velden aanvullen, nooit overschrijven. De
-- salon-eigen waarde staat in manual_clients / op de afspraak.
create or replace function public.get_or_create_client(
  p_email text, p_first text default ''::text, p_last text default ''::text,
  p_phone text default null::text, p_allergies text default null::text,
  p_birthday date default null::date)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  p_email := lower(trim(p_email));
  IF p_email IS NULL OR p_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;
  SELECT id INTO v_id FROM clients WHERE lower(email) = p_email LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO clients (email, first_name, last_name, phone, allergies, birthday, last_visit)
    VALUES (p_email, COALESCE(NULLIF(trim(p_first), ''), p_email), COALESCE(trim(p_last), ''),
            NULLIF(trim(COALESCE(p_phone, '')), ''), NULLIF(trim(COALESCE(p_allergies, '')), ''),
            p_birthday, now())
    RETURNING id INTO v_id;
  ELSE
    -- De rij is van het hele platform: een andere salon (of wie dit adres
    -- intypt) mag wat er staat niet vervangen. Alleen een leeg veld vullen.
    UPDATE clients SET
      phone = CASE WHEN NULLIF(trim(phone), '') IS NULL
                   THEN NULLIF(trim(COALESCE(p_phone, '')), '') ELSE phone END,
      allergies = CASE WHEN NULLIF(trim(allergies), '') IS NULL
                       THEN NULLIF(trim(COALESCE(p_allergies, '')), '') ELSE allergies END,
      birthday = COALESCE(birthday, p_birthday)
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $function$;

-- Alleen tellen voor een klant met een afspraak bij je eigen salon (of de
-- salon waar je medewerker bent). Server-aanroepen blijven vrij.
create or replace function public.increment_no_show_count(client_id_param uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF coalesce(current_setting('role', true), '') NOT IN ('service_role', 'postgres') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM appointments a
       WHERE a.client_id = client_id_param
         AND (a.owner_id = auth.uid() OR a.owner_id IN (SELECT my_staff_owner_ids()))
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  UPDATE clients
     SET no_show_count = COALESCE(no_show_count, 0) + 1
   WHERE id = client_id_param;
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Staff-app: omzet echt verborgen, betaalacties op de server, volledige
--    periode voor het rapport (S1-06, RP-10, S1-05, RP-02, S1-25)
-- ════════════════════════════════════════════════════════════════════════════

-- Mag de ingelogde medewerker deze afspraak afhandelen? Zelfde regel als de
-- policy "Staff can update their salon appointments" (eigen, toegewezen,
-- in de verdeling, of niemand toegewezen; alles bij staff_see_all), maar
-- alleen voor een ACTIEVE medewerkersrij. Intern hulpstuk voor de RPC's
-- hieronder (draaien als postgres); niet aan de browser gegeven.
create or replace function public.staff_can_handle_appointment(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.appointments a
      join public.staff_members sm
        on sm.owner_id = a.owner_id and sm.user_id = auth.uid() and sm.active is true
      join public.profiles p on p.id = a.owner_id
     where a.id = p_id
       and (
         coalesce(p.staff_see_all, false)
         or a.staff_id = sm.id
         or exists (select 1 from jsonb_each_text(coalesce(a.staff_assignments, '{}'::jsonb)) v
                     where v.value = sm.id::text)
         or exists (select 1 from jsonb_array_elements(
                      case when jsonb_typeof(a.service_breakdown) = 'array' then a.service_breakdown else '[]'::jsonb end) e
                     where e ->> 'staff_id' = sm.id::text)
         or (a.staff_id is null
             and coalesce(a.staff_assignments, '{}'::jsonb) = '{}'::jsonb
             and not exists (select 1 from jsonb_array_elements(
                               case when jsonb_typeof(a.service_breakdown) = 'array' then a.service_breakdown else '[]'::jsonb end) e
                              where nullif(e ->> 'staff_id', '') is not null))
       )
  )
$$;

revoke all on function public.staff_can_handle_appointment(uuid) from public, anon, authenticated;

-- Betaalstand van een afspraakrij (jsonb), zoals paidAmountOf /
-- outstandingOf in shared.jsx en de knop "Voltooid" in Owner- en StaffApp:
-- 'paid' alleen als er iets betaald is (of paid_at staat) en niets meer open
-- is. Een gratis afspraak zonder betaling blijft dus 'open' (de eigenaar en
-- de staff-app met omzet aan vragen daar ook "Hoe is er betaald?").
create or replace function public.staff_pay_state(p_row jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
           when x.paid >= x.price - 0.005 and (x.paid > 0 or (p_row ->> 'paid_at') is not null) then 'paid'
           when x.paid > 0 then 'partial'
           else 'open'
         end
    from (select coalesce((p_row ->> 'service_price')::numeric, 0) as price,
                 case
                   when jsonb_typeof(p_row -> 'amount_paid') = 'number' then greatest((p_row ->> 'amount_paid')::numeric, 0)
                   when (p_row ->> 'paid_at') is not null then coalesce((p_row ->> 'service_price')::numeric, 0)
                   else 0
                 end as paid) x
$$;

-- Afspraakrij voor een medewerker bij "medewerkers zien omzet" UIT. In DEEL A
-- komt alleen pay_state erbij (de staff-app die nu live staat rekent nog met
-- service_price en zou zonder bedrag 0 wegschrijven); DEEL B (B3) vervangt
-- deze functie door de versie die elk bedrag weghaalt.
create or replace function public.staff_hide_money(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_row || jsonb_build_object('pay_state', public.staff_pay_state(p_row))
$$;

revoke all on function public.staff_pay_state(jsonb) from public, anon, authenticated;
revoke all on function public.staff_hide_money(jsonb) from public, anon, authenticated;

-- Lijst voor de staff-app. Nieuw: p_to (rapport over een hele periode),
-- vaste volgorde (date, id) zodat de app kan pagineren voorbij 1000 rijen, en
-- bij "medewerkers zien omzet" UIT gaat de rij door staff_hide_money(): na
-- DEEL B verdwijnt elk bedrag (service_price, amount_paid, cash_received,
-- discount_amount, no_show_fee, tax_snapshot en price in products[] en
-- service_breakdown[]) en staat er pay_state ('paid' | 'partial' | 'open').
-- De oude versie (alleen p_from) moet weg: met twee versies naast elkaar is
-- een aanroep met alleen p_from dubbelzinnig. De huidige staff-app roept met
-- alleen p_from aan en komt zo op deze versie uit.
drop function if exists public.staff_list_appointments(text);

create or replace function public.staff_list_appointments(p_from text default null, p_to text default null)
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select sm.owner_id, sm.id as staff_id,
           coalesce(p.staff_view_revenue, true) as see_rev,
           coalesce(p.staff_view_client_contact, true) as see_contact,
           coalesce(p.staff_see_all, false) as see_all
      from public.staff_members sm join public.profiles p on p.id = sm.owner_id
     where sm.user_id = auth.uid() and sm.active = true
     limit 1
  )
  select (case when me.see_rev then to_jsonb(a) else public.staff_hide_money(to_jsonb(a)) end)
         - (case when me.see_contact then '{}'::text[] else array['client_email', 'client_phone', 'client_allergies'] end)
    from public.appointments a
    cross join me
   where a.owner_id = me.owner_id
     and (p_from is null or a.date >= p_from::date)
     and (p_to is null or a.date <= p_to::date)
     and (
       me.see_all
       or a.staff_id = me.staff_id
       or exists (select 1 from jsonb_each_text(coalesce(a.staff_assignments, '{}'::jsonb)) v
                   where v.value = me.staff_id::text)
       or exists (select 1 from jsonb_array_elements(
                    case when jsonb_typeof(a.service_breakdown) = 'array' then a.service_breakdown else '[]'::jsonb end) e
                   where e ->> 'staff_id' = me.staff_id::text)
       or (a.staff_id is null
           and coalesce(a.staff_assignments, '{}'::jsonb) = '{}'::jsonb
           and not exists (select 1 from jsonb_array_elements(
                             case when jsonb_typeof(a.service_breakdown) = 'array' then a.service_breakdown else '[]'::jsonb end) e
                            where nullif(e ->> 'staff_id', '') is not null))
     )
   order by a.date, a.id
$$;

revoke all on function public.staff_list_appointments(text, text) from public, anon;
grant execute on function public.staff_list_appointments(text, text) to authenticated, service_role;

-- Voltooien vanuit de staff-app zonder dat de browser een bedrag schrijft:
-- de server zet amount_paid op de echte prijs. p_method null = "Later /
-- factuur" (on-arrival wordt null, zoals markComplete). Restbetaling van een
-- deels vooruitbetaalde afspraak: betaalwijze blijft 'prepaid', alleen het
-- restant komt als client_payments-rij in de gekozen wijze (kasboek telt dan
-- alleen het contante deel). Al volledig betaald (vooruit of eerder): alleen
-- de status; betaalwijze, paid_at en bedrag blijven staan, anders telt het
-- kasboek een contante verkoop die nooit plaatsvond.
create or replace function public.staff_complete_appointment(p_id uuid, p_method text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.appointments%rowtype;
  v_price numeric;
  v_paid numeric;
  v_open numeric;
  v_staff_name text;
  v_cc text;
  v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_method is not null and p_method not in ('cash', 'pin', 'transfer') then
    raise exception 'invalid_method' using errcode = '22023';
  end if;
  if not public.staff_can_handle_appointment(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_a from public.appointments where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_a.status not in ('confirmed', 'completed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  v_price := coalesce(v_a.service_price, 0);
  v_paid := case
              when v_a.amount_paid is not null then greatest(v_a.amount_paid, 0)
              when v_a.paid_at is not null then v_price
              else 0
            end;
  v_open := round(v_price - v_paid, 2);

  if v_paid > 0 and v_open <= 0.005 then
    update public.appointments
       set status = 'completed'
     where id = p_id
    returning jsonb_build_object('id', id, 'status', status, 'payment_method', payment_method, 'paid_at', paid_at)
      into v_res;
  elsif p_method is not null and v_a.payment_method = 'prepaid' and v_paid > 0 and v_open > 0.005 then
    select sm.name into v_staff_name
      from public.staff_members sm
     where sm.owner_id = v_a.owner_id and sm.user_id = auth.uid()
     limit 1;
    select p.country_code into v_cc from public.profiles p where p.id = v_a.owner_id;
    insert into public.client_payments (owner_id, appointment_id, amount, method, paid_on, client_name, label, staff_name)
    values (v_a.owner_id, v_a.id, v_open, p_method,
            (now() at time zone case v_cc
                                  when 'BE' then 'Europe/Brussels'
                                  when 'GB' then 'Europe/London'
                                  when 'AW' then 'America/Curacao'
                                  when 'CW' then 'America/Curacao'
                                  when 'BQ' then 'America/Curacao'
                                  when 'SX' then 'America/Curacao'
                                  else 'Europe/Amsterdam'
                                end)::date,
            nullif(v_a.client_name, ''), nullif(v_a.service_name, ''), v_staff_name);
    update public.appointments
       set status = 'completed', paid_at = now(), amount_paid = service_price
     where id = p_id
    returning jsonb_build_object('id', id, 'status', status, 'payment_method', payment_method, 'paid_at', paid_at)
      into v_res;
  else
    update public.appointments
       set status = 'completed',
           payment_method = case when p_method is null and payment_method = 'on-arrival' then null
                                 else coalesce(p_method, payment_method) end,
           paid_at = case when p_method is not null then now() else paid_at end,
           amount_paid = case when p_method is not null then service_price else amount_paid end
     where id = p_id
    returning jsonb_build_object('id', id, 'status', status, 'payment_method', payment_method, 'paid_at', paid_at)
      into v_res;
  end if;
  return v_res;
end;
$$;

revoke all on function public.staff_complete_appointment(uuid, text) from public, anon;
grant execute on function public.staff_complete_appointment(uuid, text) to authenticated;

-- "Betaling ontvangen" (reservering met vooruitbetaling) en "Restbetaling
-- ontvangen": het bedrag komt van de server (amount_paid = service_price).
create or replace function public.staff_mark_prepaid(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.staff_can_handle_appointment(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status from public.appointments where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_status = 'pending_payment' then
    update public.appointments
       set status = 'confirmed', payment_method = 'prepaid', paid_at = now(), amount_paid = service_price
     where id = p_id and status = 'pending_payment'
    returning jsonb_build_object('id', id, 'status', status, 'payment_method', payment_method, 'paid_at', paid_at)
      into v_res;
  elsif v_status in ('confirmed', 'completed') then
    update public.appointments
       set paid_at = now(), amount_paid = service_price
     where id = p_id
    returning jsonb_build_object('id', id, 'status', status, 'payment_method', payment_method, 'paid_at', paid_at)
      into v_res;
  else
    -- Vervallen of geannuleerde reservering komt niet stilletjes terug.
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  return v_res;
end;
$$;

revoke all on function public.staff_mark_prepaid(uuid) from public, anon;
grant execute on function public.staff_mark_prepaid(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Wachtlijst: medewerker mag rijen van haar salon bijwerken (S1-04)
-- ════════════════════════════════════════════════════════════════════════════
-- Annuleert een medewerker, dan biedt de staff-app het vrijgekomen tijdstip
-- aan de wachtlijst aan en zet de rij op 'notified' (zelfde als de eigenaar).
drop policy if exists waitlist_staff_update on public.waitlist;
create policy waitlist_staff_update on public.waitlist
  for update to authenticated
  using (exists (select 1 from public.staff_members sm
                  where sm.owner_id = waitlist.owner_id
                    and sm.user_id = auth.uid()
                    and sm.active))
  with check (exists (select 1 from public.staff_members sm
                       where sm.owner_id = waitlist.owner_id
                         and sm.user_id = auth.uid()
                         and sm.active));

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Medewerker leest geen geheimen van de salon of van collega's (S1-12)
-- ════════════════════════════════════════════════════════════════════════════
-- staff_read_salon_profile gaf de hele profielrij (agenda-feedtoken van de
-- eigenaar, Google-token, Mollie-id's, factuurprofielen); staff_read_colleagues
-- gaf IBAN, adres en feedtoken van elke collega. De vier staff-policies die
-- nu profiles sub-selecteren zouden na het weghalen van staff_read_salon_profile
-- niets meer zien; zij lezen de drie schakelaars via een definer-hulpstuk.
-- Het hulpstuk geeft de salons waar de ingelogde gebruiker medewerker is, met
-- hun schakelaars (optioneel één salon). De policies gebruiken het als
-- "owner_id in (select ...)": zonder correlatie met de rij rekent Postgres het
-- één keer per query uit in plaats van per afspraak.
create or replace function public.staff_salon_flags(p_owner uuid default null)
returns table(owner_id uuid, see_all boolean, view_revenue boolean, view_contact boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,
         coalesce(p.staff_see_all, false),
         coalesce(p.staff_view_revenue, true),
         coalesce(p.staff_view_client_contact, true)
    from public.profiles p
   where p.id in (select sm.owner_id from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false)
     and (p_owner is null or p.id = p_owner)
$$;

revoke all on function public.staff_salon_flags(uuid) from public, anon;
grant execute on function public.staff_salon_flags(uuid) to authenticated;

-- Zelfde logica als de huidige policies; alleen de profiles-sub-selects zijn
-- vervangen door staff_salon_flags().
drop policy if exists staff_read_appointments_when_allowed on public.appointments;
create policy staff_read_appointments_when_allowed on public.appointments
  for select to authenticated
  using (
    (owner_id in (select sm.owner_id from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false))
    and (
      (owner_id in (select f.owner_id from public.staff_salon_flags() f where f.view_revenue and f.view_contact))
      or (staff_id in (select sm.id from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false))
    )
    and (
      (owner_id in (select f.owner_id from public.staff_salon_flags() f where f.see_all))
      or (staff_id in (select sm.id from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false))
      or (exists (select 1 from jsonb_each_text(coalesce(appointments.staff_assignments, '{}'::jsonb)) v(key, value)
                   where v.value in (select sm.id::text from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false)))
      or (exists (select 1 from jsonb_array_elements(
                    case when jsonb_typeof(appointments.service_breakdown) = 'array' then appointments.service_breakdown else '[]'::jsonb end) e(value)
                   where (e.value ->> 'staff_id') in (select sm.id::text from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false)))
      or ((staff_id is null)
          and (coalesce(staff_assignments, '{}'::jsonb) = '{}'::jsonb)
          and (not exists (select 1 from jsonb_array_elements(
                             case when jsonb_typeof(appointments.service_breakdown) = 'array' then appointments.service_breakdown else '[]'::jsonb end) e(value)
                            where nullif(e.value ->> 'staff_id', '') is not null)))
    )
  );

drop policy if exists "Staff can update their salon appointments" on public.appointments;
create policy "Staff can update their salon appointments" on public.appointments
  for update to authenticated
  using (
    (owner_id in (select sm.owner_id from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false))
    and (
      (owner_id in (select f.owner_id from public.staff_salon_flags() f where f.see_all))
      or (staff_id in (select sm.id from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false))
      or (exists (select 1 from jsonb_each_text(coalesce(appointments.staff_assignments, '{}'::jsonb)) v(key, value)
                   where v.value in (select sm.id::text from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false)))
      or (exists (select 1 from jsonb_array_elements(
                    case when jsonb_typeof(appointments.service_breakdown) = 'array' then appointments.service_breakdown else '[]'::jsonb end) e(value)
                   where (e.value ->> 'staff_id') in (select sm.id::text from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false)))
      or ((staff_id is null)
          and (coalesce(staff_assignments, '{}'::jsonb) = '{}'::jsonb)
          and (not exists (select 1 from jsonb_array_elements(
                             case when jsonb_typeof(appointments.service_breakdown) = 'array' then appointments.service_breakdown else '[]'::jsonb end) e(value)
                            where nullif(e.value ->> 'staff_id', '') is not null)))
    )
  );

drop policy if exists "Staff can insert salon appointments" on public.appointments;
create policy "Staff can insert salon appointments" on public.appointments
  for insert to authenticated
  with check (
    (owner_id in (select sm.owner_id from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false))
    and (
      (owner_id in (select f.owner_id from public.staff_salon_flags() f where f.see_all))
      or (staff_id is null)
      or (staff_id in (select sm.id from public.staff_members sm where sm.user_id = auth.uid() and sm.active is not false))
    )
  );

drop policy if exists staff_read_manual_clients_when_allowed on public.manual_clients;
create policy staff_read_manual_clients_when_allowed on public.manual_clients
  for select to authenticated
  using (
    (exists (select 1 from public.staff_members sm
              where sm.user_id = auth.uid() and sm.active is not false and sm.owner_id = manual_clients.owner_id))
    and (owner_id in (select f.owner_id from public.staff_salon_flags() f where f.view_contact))
    and (exists (select 1 from public.appointments a
                  where a.owner_id = manual_clients.owner_id
                    and lower(a.client_email) = lower(manual_clients.email)))
  );

-- Het salonprofiel voor de staff-app (App.jsx), zonder geheimen en zonder wat
-- alleen de eigenaar aangaat. Alleen voor een actieve medewerker van een
-- ANDERE salon (een eigenaar op haar eigen rooster gaat naar de owner-app).
create or replace function public.staff_salon_profile()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(p) - array[
           'calendar_feed_token', 'google_refresh_token', 'google_calendar_connected',
           'mollie_customer_id', 'mollie_mandate_id', 'mollie_subscription_id',
           'referral_code', 'referred_by', 'referral_credit_months', 'referral_credit_days',
           'referral_credit_days_redeemed', 'invoice_profiles', 'discount_codes',
           'next_invoice_number', 'next_receipt_number', 'email'
         ]
    from public.profiles p
   where p.id = (select sm.owner_id
                   from public.staff_members sm
                  where sm.user_id = auth.uid()
                    and sm.owner_id <> auth.uid()
                    and sm.active is true
                  order by sm.created_at, sm.id
                  limit 1)
$$;

revoke all on function public.staff_salon_profile() from public, anon;
grant execute on function public.staff_salon_profile() to authenticated;

-- staff_read_salon_profile en staff_read_colleagues gaan weg in DEEL B (B4):
-- de huidige App.jsx leest het salonprofiel nog rechtstreeks.
