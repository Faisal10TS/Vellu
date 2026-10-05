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

-- ════════════════════════════════════════════════════════════════════════════
-- 12. Medewerker mag varianten en extra's toevoegen (S1-08)
-- ════════════════════════════════════════════════════════════════════════════
-- Bijwerken en verwijderen mocht al (staff_may_edit_catalog), toevoegen niet:
-- "Toevoegen mislukt" voor elke medewerker.
drop policy if exists staff_insert_variants_when_allowed on public.service_variants;
create policy staff_insert_variants_when_allowed on public.service_variants
  for insert to authenticated
  with check (exists (select 1 from public.services s
                       where s.id = service_variants.service_id
                         and public.staff_may_edit_catalog(s.owner_id)));

drop policy if exists staff_insert_extras_when_allowed on public.service_extras;
create policy staff_insert_extras_when_allowed on public.service_extras
  for insert to authenticated
  with check (exists (select 1 from public.services s
                       where s.id = service_extras.service_id
                         and public.staff_may_edit_catalog(s.owner_id)));

-- ════════════════════════════════════════════════════════════════════════════
-- 13. Reviewlink: verzendingen tellen, niet tokens (E1-11, L2-11)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.review_tokens add column if not exists last_sent_at timestamptz;

update public.review_tokens
   set last_sent_at = created_at
 where last_sent_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 14. Nieuwsbrief: afmelden met een link (E2-08)
-- ════════════════════════════════════════════════════════════════════════════
-- Eén rij per salon en adres, met een eigen token voor de link
-- https://vellu.cc/api/unsubscribe?t=<token>. send-newsletter (service role)
-- maakt de rijen aan en slaat adressen met opted_out_at over; api/unsubscribe
-- (service role) zet opted_out_at. De eigenaar mag haar eigen rijen lezen.
-- e-mail opslaan in kleine letters: de gewone unieke sleutel (owner_id,
-- email) maakt upsert met onConflict 'owner_id,email' mogelijk; de index op
-- lower(email) houdt ook andere schrijfwijzen tegen.
create table if not exists public.newsletter_opt_outs (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  token text not null unique,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  constraint newsletter_opt_outs_owner_id_email_key unique (owner_id, email)
);

create unique index if not exists newsletter_opt_outs_owner_email
  on public.newsletter_opt_outs (owner_id, lower(email));

alter table public.newsletter_opt_outs enable row level security;

revoke all on public.newsletter_opt_outs from public, anon, authenticated;
grant select on public.newsletter_opt_outs to authenticated;
grant all on public.newsletter_opt_outs to service_role;

drop policy if exists newsletter_opt_outs_owner_select on public.newsletter_opt_outs;
create policy newsletter_opt_outs_owner_select on public.newsletter_opt_outs
  for select to authenticated
  using (owner_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 15. Voorraad atomair aanpassen (O3-07)
-- ════════════════════════════════════════════════════════════════════════════
-- De kassa schreef een absolute waarde uit verouderde lokale voorraad en
-- draaide zo online bestellingen en verkopen op een ander apparaat terug.
-- SECURITY INVOKER: RLS "Owner manages own products" blijft gelden. Een
-- product zonder voorraadbeheer (stock NULL) blijft NULL; dan komt er NULL
-- terug.
create or replace function public.adjust_product_stock(p_product_id uuid, p_delta integer)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.products
     set stock = greatest(0, stock + coalesce(p_delta, 0))
   where id = p_product_id
     and stock is not null
  returning stock
$$;

revoke all on function public.adjust_product_stock(uuid, integer) from public, anon;
grant execute on function public.adjust_product_stock(uuid, integer) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 16. Review blijft staan als de afspraak wordt verwijderd (O4-14)
-- ════════════════════════════════════════════════════════════════════════════
-- reviews.appointment_id was al nullable; public_reviews en submit-review
-- gebruiken de kolom niet voor de weergave.
alter table public.reviews alter column appointment_id drop not null;
alter table public.reviews drop constraint if exists reviews_appointment_id_fkey;
alter table public.reviews
  add constraint reviews_appointment_id_fkey
  foreign key (appointment_id) references public.appointments(id) on delete set null;

-- ════════════════════════════════════════════════════════════════════════════
-- 17. Verborgen diensten niet meer publiek (L4-04)
-- ════════════════════════════════════════════════════════════════════════════
-- mywhimsandmore.com (api/prices.js) leest services met visible=eq.true plus
-- categorieën en varianten: ongewijzigd. Medewerkers blijven alle diensten
-- van hun salon zien (staff-app Diensten, ook verborgen).
drop policy if exists "Public can read services" on public.services;
drop policy if exists "Public can read visible services" on public.services;
create policy "Public can read visible services" on public.services
  for select to anon, authenticated
  using (visible is not false);

drop policy if exists staff_read_salon_services on public.services;
create policy staff_read_salon_services on public.services
  for select to authenticated
  using (owner_id in (select public.my_staff_owner_ids()));

-- Varianten en extra's volgen hun dienst: leesbaar voor wie de dienst mag
-- zien (de sub-select valt onder de policies van services: bezoeker =
-- zichtbare diensten, eigenaar = eigen salon, medewerker = haar salon).
-- Eerder USING (true): namen en prijzen van verborgen diensten lagen open.
-- Zelfde naam en rollen, dus de embed services -> service_variants op de
-- boekingspagina en bij mywhimsandmore.com geeft dezelfde rijen.
drop policy if exists "Public can read variants" on public.service_variants;
create policy "Public can read variants" on public.service_variants
  for select
  using (exists (select 1 from public.services s where s.id = service_variants.service_id));

drop policy if exists "Public can read extras" on public.service_extras;
create policy "Public can read extras" on public.service_extras
  for select
  using (exists (select 1 from public.services s where s.id = service_extras.service_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 18. Verjaardags- en stempelcode weer vrij bij annuleren (E1-07)
-- ════════════════════════════════════════════════════════════════════════════
-- Eén trigger dekt annuleren door de klant (cancel-appointment), door de salon
-- of medewerker, en een vervallen vooruitbetaling (prepay-watch). Een
-- verlopen code blijft gebruikt.
create or replace function public.release_codes_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.birthday_discount_codes
       set used_at = null, used_by_appointment = null
     where used_by_appointment = new.id
       and (expires_on is null or expires_on >= current_date);
  end if;
  return new;
end;
$$;

revoke all on function public.release_codes_on_cancel() from public, anon, authenticated;

drop trigger if exists appointments_release_codes on public.appointments;
create trigger appointments_release_codes
  after update of status on public.appointments
  for each row execute function public.release_codes_on_cancel();

-- ════════════════════════════════════════════════════════════════════════════
-- 19. "Maak persoonlijke code" hergebruikt alleen verjaardagscodes (O1-08)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.create_birthday_code(p_email text)
returns table(code text, discount_pct numeric, expires_on date)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner  uuid := auth.uid();
  v_prefix text;
  v_pct    integer;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_exp    date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_code   text;
  v_suffix text;
  i        integer;
begin
  if v_owner is null then raise exception 'not_authenticated'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  select coalesce(nullif(left(regexp_replace(upper(coalesce(p.birthday_email_code_prefix, 'BDAY')), '[^A-Z0-9]', '', 'g'), 8), ''), 'BDAY'),
         p.birthday_email_discount_pct
    into v_prefix, v_pct
    from public.profiles p where p.id = v_owner;
  if v_pct is null then raise exception 'no_discount_pct'; end if;

  -- Alleen een open VERJAARDAGScode hergebruiken: een stempelkaartcode met
  -- hetzelfde percentage is een andere beloning (en zou anders aan het eind
  -- van de maand vervallen).
  select b.code into v_code
    from public.birthday_discount_codes b
   where b.owner_id = v_owner and b.client_email = v_email and b.kind = 'birthday'
     and b.used_at is null and b.expires_on >= current_date and b.discount_pct = v_pct
   order by b.expires_on desc limit 1;
  if v_code is not null then
    update public.birthday_discount_codes b set expires_on = v_exp
     where b.owner_id = v_owner and b.code = v_code and b.kind = 'birthday';
    return query select v_code, v_pct::numeric, v_exp;
    return;
  end if;

  for i in 1..8 loop
    v_suffix := '';
    while length(v_suffix) < 5 loop
      v_suffix := v_suffix || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    v_code := v_prefix || '-' || v_pct || '-' || v_suffix;
    begin
      insert into public.birthday_discount_codes (owner_id, code, client_email, discount_pct, expires_on, kind)
      values (v_owner, v_code, v_email, v_pct, v_exp, 'birthday');
      return query select v_code, v_pct::numeric, v_exp;
      return;
    exception when unique_violation then
      null; -- naam bezet (andere klant of gelijktijdige cron-run): nieuwe staart
    end;
  end loop;
  raise exception 'code_collision';
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 20. profiles-guard: slot voor change-plan en gereserveerde slugs
--     (E3-27, L3-19)
-- ════════════════════════════════════════════════════════════════════════════
-- plan_change_started_at is het korte slot dat change-plan zet (twee
-- gelijktijdige upgrades maakten twee Mollie-abonnementen). Alleen de server
-- schrijft het.
alter table public.profiles add column if not exists plan_change_started_at timestamptz;

-- Namen die Vellu zelf als pad gebruikt (App.jsx-routes, vercel.json, public/):
-- een salon met zo'n slug is onbereikbaar of verwarrend. Zelfde lijst als
-- RESERVED_SLUGS in shared.jsx. Gebruikt door de profiles-guard (browser) en
-- handle_new_user (aanmelden). Geen bestaande salon gebruikt er een.
create or replace function public.slug_is_reserved(p_slug text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(btrim(coalesce(p_slug, ''))) = any (array[
    'owner', 'staff', 'admin', 'cancel', 'privacy', 'terms', 'dpa',
    'voorwaarden', 'contact', 'api', 'assets', 'public', 'static',
    'auth', 'login', 'signup', 'signin', 'logout', 'reset', 'review',
    'integrations', 'beoordeel', 'rate',
    '_', 'app', 'www', 'sitemap.xml', 'robots.txt', 'manifest.json'
  ])
$$;

-- Guard van 05-10 (20261005105459) met alle regels ongewijzigd, plus:
--  - plan_change_started_at in de afgesloten kolommen;
--  - een slug die Vellu zelf gebruikt (/owner, /contact, /admin, ...) kan de
--    browser niet kiezen: de boekingspagina zou onbereikbaar zijn. Getoetst
--    bij aanmaken en bij wijzigen van de slug (slug_is_reserved).
create or replace function public.profiles_guard_privileged()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  -- Alleen de server beheert deze kolommen (Mollie-webhook, start-trial,
  -- change-plan, cancel-subscription, check-trials, verwijzings- en
  -- nummer-RPC's, google-auth).
  v_locked text[] := array[
    'id', 'created_at',
    'plan', 'plan_expires_at', 'subscription_status', 'billing_interval',
    'current_period_start', 'cancel_at_period_end', 'cancelled_at',
    'trial_used', 'trial_ends_at',
    'mollie_customer_id', 'mollie_subscription_id', 'mollie_mandate_id',
    'referral_code', 'referred_by', 'referral_credit_months',
    'referral_credit_days', 'referral_credit_days_redeemed',
    'is_demo', 'google_refresh_token', 'google_calendar_connected',
    'next_invoice_number', 'next_receipt_number',
    'plan_change_started_at'
  ];
  v_new jsonb;
  v_old jsonb;
  v_col text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if (tg_op = 'INSERT' or new.slug is distinct from old.slug)
     and public.slug_is_reserved(new.slug) then
    raise exception 'profiles.slug: deze naam is gereserveerd door Vellu' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- Komt alleen voor bij de upsert na het aanmelden (LandingScreen.jsx:1559).
    -- Die stuurt geen enkele kolom uit v_locked mee; alles moet op de
    -- standaardwaarde staan. referral_code vult profiles_set_referral_code
    -- daarna in (die trigger komt alfabetisch na deze).
    if v_uid is null or new.id is distinct from v_uid then
      raise exception 'profiles: je kunt alleen je eigen profiel aanmaken' using errcode = '42501';
    end if;
    if new.plan is not null or new.plan_expires_at is not null
       or new.subscription_status is not null or new.billing_interval is not null
       or new.current_period_start is not null or new.cancel_at_period_end
       or new.cancelled_at is not null or new.trial_used or new.trial_ends_at is not null
       or new.mollie_customer_id is not null or new.mollie_subscription_id is not null
       or new.mollie_mandate_id is not null
       or new.referral_code is not null or new.referred_by is not null
       or coalesce(new.referral_credit_months, 0) <> 0
       or coalesce(new.referral_credit_days, 0) <> 0
       or coalesce(new.referral_credit_days_redeemed, 0) <> 0
       or new.is_demo or new.google_refresh_token is not null
       or coalesce(new.google_calendar_connected, false)
       or coalesce(new.next_invoice_number, 1) <> 1
       or coalesce(new.next_receipt_number, 1) <> 1
       or new.plan_change_started_at is not null then
      raise exception 'profiles: abonnements- en koppelingsgegevens zet alleen Vellu' using errcode = '42501';
    end if;
    -- profiles.email is het contactadres voor Mollie, abonnementsfacturen en
    -- proefherinneringen: alleen het adres van je eigen login.
    if v_jwt_email = '' or lower(btrim(coalesce(new.email, ''))) <> v_jwt_email then
      raise exception 'profiles.email: alleen je eigen login-adres' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  v_new := to_jsonb(new);
  v_old := to_jsonb(old);
  foreach v_col in array v_locked loop
    if (v_new -> v_col) is distinct from (v_old -> v_col) then
      -- Proef: wisselen tussen Starter en Professional mag zolang er geen
      -- Mollie-abonnement loopt (OwnerApp.jsx:17871 en 17885).
      if v_col = 'plan'
         and old.subscription_status = 'trialing'
         and old.mollie_subscription_id is null
         and new.plan in ('starter', 'professional') then
        continue;
      end if;
      raise exception 'profiles.%: deze kolom wijzigt alleen Vellu', v_col using errcode = '42501';
    end if;
  end loop;

  if new.email is distinct from old.email
     and lower(coalesce(new.email, '')) <> lower(coalesce(old.email, ''))
     and not (v_jwt_email <> '' and lower(coalesce(new.email, '')) = v_jwt_email) then
    raise exception 'profiles.email: alleen je eigen login-adres' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_guard_privileged() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 21. admin_*-RPC's niet aanroepbaar zonder login (DB-06)
-- ════════════════════════════════════════════════════════════════════════════
-- Elk begint met is_admin(); dit is de tweede laag, zoals bij de andere
-- admin-functies (20260818143136_advisor_opruiming).
revoke execute on function public.admin_app_ratings() from public, anon;
revoke execute on function public.admin_cron_summary() from public, anon;
revoke execute on function public.admin_rating_invites() from public, anon;
revoke execute on function public.admin_rating_site_visibility() from public, anon;
revoke execute on function public.admin_set_app_rating_published(uuid, boolean) from public, anon;
revoke execute on function public.admin_set_rating_site_visibility(boolean) from public, anon;
grant execute on function public.admin_app_ratings() to authenticated;
grant execute on function public.admin_cron_summary() to authenticated;
grant execute on function public.admin_rating_invites() to authenticated;
grant execute on function public.admin_rating_site_visibility() to authenticated;
grant execute on function public.admin_set_app_rating_published(uuid, boolean) to authenticated;
grant execute on function public.admin_set_rating_site_visibility(boolean) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- @@ DEEL B: NA DEPLOY @@
-- ════════════════════════════════════════════════════════════════════════════
-- Alles hieronder pas toepassen NA de deploy van de edge functions (E1, E2,
-- E3) en de frontend (AP, C1, C2, S, O1-O8, SH), als aparte migratie. Elk
-- stuk laat een aanroeper die nu live staat falen of verkeerd schrijven.

-- ── B1. products: anonieme leespolicy weg (sectie 1) ────────────────────────
-- Nodig: AP (App.jsx leest public_products). De eigenaar houdt "Owner manages
-- own products".
drop policy if exists "Public can read active products" on public.products;

-- ── B2. clients: niet meer schrijven vanuit de browser (sectie 2) ───────────
-- Nodig: O2/O8 (verjaardag naar manual_clients), O3 (no-show via
-- increment_no_show_count).
drop policy if exists clients_update_visited_salon on public.clients;
revoke update, delete, truncate on public.clients from anon, authenticated;

-- ── B3. staff-app: bedragen echt weg bij omzet uit (sectie 3) ───────────────
-- Nodig: S (rekent bij omzet uit met pay_state en betaalt via
-- staff_complete_appointment / staff_mark_prepaid). De staff-app die nu live
-- staat, zou zonder service_price amount_paid = 0 wegschrijven.
create or replace function public.staff_hide_money(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select (p_row - array['service_price', 'amount_paid', 'cash_received',
                        'discount_amount', 'no_show_fee', 'tax_snapshot'])
         || jsonb_build_object(
              'products',
                case when jsonb_typeof(p_row -> 'products') = 'array' then
                  (select coalesce(jsonb_agg(case when jsonb_typeof(x.v) = 'object' then x.v - 'price' else x.v end
                                             order by x.o), '[]'::jsonb)
                     from jsonb_array_elements(p_row -> 'products') with ordinality as x(v, o))
                else p_row -> 'products' end,
              'service_breakdown',
                case when jsonb_typeof(p_row -> 'service_breakdown') = 'array' then
                  (select coalesce(jsonb_agg(case when jsonb_typeof(x.v) = 'object' then x.v - 'price' else x.v end
                                             order by x.o), '[]'::jsonb)
                     from jsonb_array_elements(p_row -> 'service_breakdown') with ordinality as x(v, o))
                else p_row -> 'service_breakdown' end,
              'pay_state', public.staff_pay_state(p_row))
$$;

revoke all on function public.staff_hide_money(jsonb) from public, anon, authenticated;

-- ── B4. staff: geen salonprofiel- en collegarijen meer (sectie 5) ───────────
-- Nodig: AP (App.jsx laadt het salonprofiel via staff_salon_profile()) en S
-- (rooster uit public_staff). Zonder die deploy kan een medewerker niet
-- inloggen. my_staff_owner_ids() blijft (staff_read_salon_services,
-- client_no_shows e.d.).
drop policy if exists staff_read_salon_profile on public.profiles;
drop policy if exists staff_read_colleagues on public.staff_members;

-- ── B5. teamlid-uitnodiging: e-mailclaim weg (sectie 7) ─────────────────────
-- Nodig: AP (claimt alleen met de gemailde token via claim_staff_invite en
-- geeft bij aanmelden options.data.staff_invite mee), E3 (create-staff-account
-- maakt de token en zet user_metadata.staff_invite bij "Login aanmaken"), E2
-- (mail staff_invite).
--
-- Guard van 05-10 (20261005105459), aangepast: de claimtak op e-mail is weg en
-- de uitnodigingskolommen schrijft alleen de server. Eén koppeling mag de
-- browser nog: de eigenaar zet zichzelf op een ongekoppelde rij van haar eigen
-- salon (wat de oude e-mailclaim bij TTNB en Honeysets deed). Daar hangen de
-- eigenaarsbadge en de volgorde op de boekingspagina aan (public_staff.is_owner).
-- Hooguit één zo'n rij per salon (App.jsx zoekt de rij op user_id). Verder
-- ongewijzigd.
create or replace function public.staff_members_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  -- Wat een medewerker op haar EIGEN rij mag wijzigen.
  v_staff_editable text[] := array[
    'working_hours', 'calendar_feed_token', 'address', 'kvk_number', 'btw_id',
    'iban', 'iban_holder', 'payment_link', 'invoice_prefix', 'next_invoice_number'
  ];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_uid is null or new.owner_id is distinct from v_uid then
      raise exception 'staff_members: je kunt alleen medewerkers aan je eigen salon toevoegen'
        using errcode = '42501';
    end if;
    -- Alleen jezelf (eigenaar op het eigen rooster); een ander koppelen gaat
    -- via de uitnodiging.
    if new.user_id is not null and new.user_id is distinct from v_uid then
      raise exception 'staff_members: een login koppelen gaat alleen via de uitnodiging'
        using errcode = '42501';
    end if;
    if new.user_id is not null
       and exists (select 1 from public.staff_members s where s.owner_id = v_uid and s.user_id = v_uid) then
      raise exception 'staff_members: je staat al op je eigen rooster'
        using errcode = '42501';
    end if;
    if new.invite_token_hash is not null or new.invite_expires_at is not null then
      raise exception 'staff_members: uitnodigingen maakt alleen Vellu aan'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id
     or new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at then
    raise exception 'staff_members: id, owner_id en created_at kunnen niet worden gewijzigd'
      using errcode = '42501';
  end if;

  -- Koppelen gaat via claim_staff_invite() of create-staff-account; de
  -- browser mag alleen de eigenaar aan haar eigen rij koppelen.
  if new.user_id is distinct from old.user_id then
    if not (old.user_id is null
            and v_uid is not null
            and new.user_id = v_uid
            and old.owner_id = v_uid
            and not exists (select 1 from public.staff_members s
                             where s.owner_id = v_uid and s.user_id = v_uid and s.id <> old.id)) then
      raise exception 'staff_members: een login koppelen gaat alleen via de uitnodiging'
        using errcode = '42501';
    end if;
  end if;

  if new.invite_token_hash is distinct from old.invite_token_hash
     or new.invite_expires_at is distinct from old.invite_expires_at then
    raise exception 'staff_members: uitnodigingen maakt alleen Vellu aan'
      using errcode = '42501';
  end if;

  -- Een uitnodiging hoort bij één adres en een actief teamlid: verandert het
  -- e-mailadres of zet de eigenaar haar op inactief, dan vervalt de link (O7-07).
  if new.email is distinct from old.email or new.active is false then
    new.invite_token_hash := null;
    new.invite_expires_at := null;
  end if;

  -- De eigenaar (ook op haar eigen medewerker-rij, user_id = owner_id).
  if v_uid is not distinct from old.owner_id then
    return new;
  end if;

  -- Medewerker op haar eigen rij.
  new.next_invoice_number := old.next_invoice_number;
  if (to_jsonb(new) - v_staff_editable) is distinct from (to_jsonb(old) - v_staff_editable) then
    raise exception 'staff_members: naam, rol, e-mail, bio, foto, actief en volgorde wijzigt alleen de eigenaar'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.staff_members_guard() from public, anon, authenticated;

drop policy if exists staff_claim_invite_select on public.staff_members;
drop policy if exists staff_claim_invite_update on public.staff_members;

-- Geen eigen salonprofiel voor een teamlid: aanmelden via de uitnodiging
-- (options.data.staff_invite) of een login die de eigenaar aanmaakte
-- (create-staff-account zet user_metadata.staff_invite). De oude overslag op
-- "er staat een rij met mijn e-mailadres" is weg: daarmee kon een eigenaar
-- andermans adres op een rij zetten en diens salonprofiel blokkeren.
-- Een gereserveerde slug (/admin, /contact, ...) uit de aanmeldgegevens krijgt
-- een staart: deze functie draait als postgres en valt dus niet onder de
-- profiles-guard.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_slug text;
BEGIN
  IF coalesce(NEW.raw_user_meta_data ->> 'staff_invite', '') = 'true'
     OR EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_slug := COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email, '@', 1));
  IF public.slug_is_reserved(v_slug) THEN
    v_slug := btrim(v_slug) || '-' || left(replace(NEW.id::text, '-', ''), 4);
  END IF;

  INSERT INTO public.profiles (id, email, business_name, slug, city)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'business_name', 'Mijn Salon'),
    v_slug,
    COALESCE(NEW.raw_user_meta_data->>'city', 'Nederland')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── B6. verwijzingen: tegoed voor de verwijzer pas na de eerste betaling ─────
--        (sectie 8)
-- Nodig: E3 (mollie-webhook roept grant_referral_credit() aan na first.paid /
-- oneoff.paid). Zonder die deploy krijgt een verwijzer niets als de nieuwe
-- salon in de tussentijd betaalt.
-- Zelfde handtekening en antwoord (LandingScreen). Nieuw: geen demo-salon als
-- verwijzer, alleen een vers account (< 2 uur), eerst de inwisselrij (één per
-- nieuwe salon, ook bij gelijktijdige aanroepen) en daarna alleen de beloning
-- van de NIEUWE salon. De verwijzer krijgt haar dagen via
-- grant_referral_credit() zodra mollie-webhook de eerste betaling ziet.
alter table public.referral_redemptions
  alter column referrer_credited_at drop default;

create or replace function public.redeem_referral_code(p_new_profile_id uuid, p_code text)
returns table(success boolean, referrer_name text, referrer_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_referrer_id uuid;
  v_referrer_name text;
  v_referrer_demo boolean;
  v_clean_code text;
  v_reward_days integer := 14;
  v_promo_id uuid;
  v_new_created timestamptz;
  v_new_referred_by uuid;
  v_inserted uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_new_profile_id
     AND current_setting('role') NOT IN ('service_role','postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_clean_code := upper(btrim(coalesce(p_code, '')));
  SELECT id, business_name, coalesce(is_demo, false)
    INTO v_referrer_id, v_referrer_name, v_referrer_demo
    FROM profiles WHERE referral_code = v_clean_code;

  IF v_referrer_id IS NULL OR v_referrer_id = p_new_profile_id OR v_referrer_demo THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  -- Alleen een nieuw account: het oudste van profiel en login telt.
  SELECT least(p.created_at, u.created_at), p.referred_by
    INTO v_new_created, v_new_referred_by
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
   WHERE p.id = p_new_profile_id;
  IF NOT FOUND OR v_new_referred_by IS NOT NULL
     OR v_new_created IS NULL OR v_new_created < now() - interval '2 hours' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  -- Lopende actie? Dan die beloning, anders de vaste 14 dagen.
  SELECT p.id, p.reward_days INTO v_promo_id, v_reward_days
  FROM referral_promos p
  WHERE now() BETWEEN p.starts_at AND p.ends_at
  ORDER BY p.reward_days DESC, p.ends_at DESC
  LIMIT 1;
  IF v_reward_days IS NULL THEN v_reward_days := 14; END IF;

  -- Eerst de inwisselrij: wie hem niet kan aanmaken (al ingewisseld, ook
  -- gelijktijdig), krijgt niets. referrer_credited_at blijft leeg tot
  -- grant_referral_credit().
  INSERT INTO referral_redemptions (new_profile_id, referrer_id, reward_days, promo_id, new_salon_trial_days, referrer_credited_at)
  VALUES (p_new_profile_id, v_referrer_id, v_reward_days, v_promo_id, CASE WHEN v_promo_id IS NOT NULL THEN v_reward_days END, NULL)
  ON CONFLICT (new_profile_id) DO NOTHING
  RETURNING new_profile_id INTO v_inserted;
  IF v_inserted IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_promo_id IS NOT NULL THEN
    -- Actie: de gratis periode van de nieuwe salon is haar proef (zie
    -- start-trial), geen tegoed erbovenop. Loopt haar proef al, dan wordt die
    -- verlengd tot de actieduur vanaf het begin van de proef.
    UPDATE profiles
      SET referred_by = v_referrer_id,
          trial_ends_at = CASE WHEN subscription_status = 'trialing' AND current_period_start IS NOT NULL
                               THEN GREATEST(trial_ends_at, current_period_start + make_interval(days => v_reward_days))
                               ELSE trial_ends_at END,
          plan_expires_at = CASE WHEN subscription_status = 'trialing' AND current_period_start IS NOT NULL
                                 THEN GREATEST(plan_expires_at, current_period_start + make_interval(days => v_reward_days))
                                 ELSE plan_expires_at END
      WHERE id = p_new_profile_id;
  ELSE
    UPDATE profiles
      SET referred_by = v_referrer_id,
          referral_credit_days = COALESCE(referral_credit_days, 0) + v_reward_days
      WHERE id = p_new_profile_id;
  END IF;

  RETURN QUERY SELECT true, v_referrer_name, v_referrer_id;
END;
$function$;

-- ── B7. wachtlijst: geen anonieme insert meer (sectie 9) ────────────────────
-- Nodig: C1 (boekingspagina roept waitlist-notify aan) en E1 (waitlist-notify
-- voegt zelf in).
drop policy if exists waitlist_public_insert on public.waitlist;
revoke insert on public.waitlist from anon, authenticated;

-- ── B8. blokkades van teamleden niet meer publiek (sectie 11) ───────────────
-- Nodig: AP (App.jsx leest public_staff_day_overrides).
drop policy if exists "Public can read staff day overrides" on public.staff_day_overrides;
