-- Kritieke lekken dicht (audit 05-10-2026).
--
-- 1. staff_members (O7-01, S1-01, AP-01, E3-02, DB-01, E3-03). De policy
--    "Staff can update own record" toetst alleen user_id = auth.uid(). Een
--    medewerker kon dus owner_id van haar eigen rij naar ELKE salon zetten, en
--    iedereen kan zich aanmelden en zichzelf als medewerker van de eigen salon
--    toevoegen. Daarmee las je via staff_read_salon_profile,
--    staff_read_colleagues, de afspraken-, klanten- en wachtlijstpolicies en
--    staff_may_edit_catalog de gegevens van een andere salon. Daarnaast kon een
--    eigenaar een medewerker-rij rechtstreeks aan het user_id van iemand anders
--    hangen, waarna die persoon bij het inloggen in de verkeerde app belandde.
--    NIET opgelost hier (apart, vraagt een productkeuze): een uitnodiging wordt
--    geclaimd op het e-mailadres in de login, en aanmelden wordt niet per mail
--    bevestigd. Wie het adres van een openstaande uitnodiging kent, kan haar
--    claimen; een eigenaar kan het adres van iemand anders op een open rij zetten.
-- 2. profiles (E3-01, O8-01). Policy "Own profile" (FOR ALL, zonder WITH
--    CHECK) liet de eigenaar haar eigen abonnementsvelden schrijven: plan,
--    plan_expires_at, subscription_status, Mollie-id's, verwijzingskrediet,
--    is_demo. Professional voor altijd, gratis.
-- 3. storage. In service-photos kon iedereen, ook zonder account, elk bestand
--    uploaden of wissen. In business-images (logo's, covers, productfoto's)
--    kon elke ingelogde gebruiker de bestanden van elke salon wissen.
--
-- WIE WORDT BEWAAKT. Alleen directe aanroepen vanuit de browser:
-- current_user = 'anon' of 'authenticated'. Alles wat namens de server
-- schrijft, gaat ongemoeid door: edge functions met de service-role-sleutel
-- (current_user 'service_role'), SECURITY DEFINER-functies (draaien als
-- postgres: handle_new_user, redeem_referral_code, next_invoice_number,
-- next_receipt_number, next_staff_invoice_number), FK-cascades en pg_cron.
-- NIET toetsen op auth.role() of current_setting('role'): binnen een SECURITY
-- DEFINER-functie zeggen die nog 'authenticated', en dan breken de
-- verwijzingscode bij het aanmelden en de factuur-/bonnummers.
-- De triggerfuncties zelf zijn bewust SECURITY INVOKER: een SECURITY
-- DEFINER-trigger ziet altijd zijn eigen eigenaar als current_user.
--
-- Wat de browser legitiem schrijft, is per kolom nagelopen (OwnerApp,
-- StaffApp, App.jsx, LandingScreen.jsx, alle edge functions) en blijft werken:
-- - medewerker op haar eigen rij: working_hours, calendar_feed_token,
--   address, kvk_number, btw_id, iban, iban_holder, payment_link,
--   invoice_prefix (StaffApp.jsx:651, 708, 2911-2916). StaffApp stuurt bij
--   het opslaan van de factuurgegevens ook next_invoice_number mee, mogelijk
--   verouderd; die waarde wordt stil genegeerd (ophogen gaat via
--   next_staff_invoice_number()).
-- - uitnodiging claimen: user_id van NULL naar jezelf als het e-mailadres van
--   de rij gelijk is aan dat van je login (App.jsx:107, LandingScreen.jsx:1553).
-- - eigenaar op de rijen van haar salon: alles behalve id, owner_id,
--   created_at en user_id (StaffAdder, Team-tab, avatar-upload).
-- - profiles: alle instellingen; plan alleen wisselen tussen starter en
--   professional tijdens een proef zonder Mollie-abonnement (de knoppen
--   "Upgraden naar Professional" / "Terug naar Starter", OwnerApp.jsx:17871
--   en 17885); email alleen als het hetzelfde adres is in andere hoofd- of
--   kleine letters, of het adres van je login (upsert bij het aanmelden,
--   LandingScreen.jsx:1559).
-- - storage: eerste map in het pad = id van de salon-eigenaar. Eigenaar mag in
--   beide buckets; een medewerker alleen in service-photos van haar eigen
--   salon, en alleen als de eigenaar "medewerkers mogen diensten bewerken" aan
--   heeft staan (zelfde regel als de tabel service_photos via
--   staff_may_edit_catalog). Alle 218 bestaande bestanden volgen dit pad.

-- ── 1. staff_members ─────────────────────────────────────────────────────────

create or replace function public.staff_members_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  -- Wat een medewerker op haar EIGEN rij mag wijzigen. user_id staat erbij
  -- omdat de claim hieronder apart wordt getoetst.
  v_staff_editable text[] := array[
    'working_hours', 'calendar_feed_token', 'address', 'kvk_number', 'btw_id',
    'iban', 'iban_holder', 'payment_link', 'invoice_prefix', 'next_invoice_number',
    'user_id'
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
    if new.user_id is not null and new.user_id is distinct from v_uid then
      raise exception 'staff_members: een login koppelen gaat alleen via de uitnodiging'
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

  if new.user_id is distinct from old.user_id then
    -- Enige toegestane wijziging: een openstaande uitnodiging claimen.
    if not (old.user_id is null
            and v_uid is not null
            and new.user_id = v_uid
            and v_jwt_email <> ''
            and lower(coalesce(old.email, '')) = v_jwt_email) then
      raise exception 'staff_members: een login koppelen gaat alleen via de uitnodiging'
        using errcode = '42501';
    end if;
  end if;

  -- De eigenaar (ook op haar eigen medewerker-rij, user_id = owner_id).
  if v_uid is not distinct from old.owner_id then
    return new;
  end if;

  -- Medewerker op haar eigen rij, of iemand die een uitnodiging claimt.
  new.next_invoice_number := old.next_invoice_number;
  if (to_jsonb(new) - v_staff_editable) is distinct from (to_jsonb(old) - v_staff_editable) then
    raise exception 'staff_members: naam, rol, e-mail, bio, foto, actief en volgorde wijzigt alleen de eigenaar'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.staff_members_guard() from public, anon, authenticated;

create trigger staff_members_guard
  before insert or update on public.staff_members
  for each row execute function public.staff_members_guard();

-- ── 2. profiles ──────────────────────────────────────────────────────────────

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
    'next_invoice_number', 'next_receipt_number'
  ];
  v_new jsonb;
  v_old jsonb;
  v_col text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
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
       or coalesce(new.next_receipt_number, 1) <> 1 then
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

-- Naam sorteert vóór profiles_set_referral_code (BEFORE-triggers lopen op naam).
create trigger profiles_guard_privileged
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_privileged();

-- Geen enkele browserflow verwijdert een profiel (er is geen account-verwijderen),
-- en zonder DELETE kan niemand zijn profiel wissen en opnieuw aanmaken met
-- andere waarden. TRUNCATE gaat buiten RLS om; de browser heeft het nooit nodig.
revoke delete, truncate on public.profiles from anon, authenticated;
revoke truncate on public.staff_members from anon, authenticated;

-- ── 3. storage ───────────────────────────────────────────────────────────────

-- Mag de ingelogde gebruiker schrijven in deze salonmap? Tekst-argument: een map
-- die geen uuid is, levert false op in plaats van een cast-fout.
create or replace function public.storage_salon_folder_writable(p_folder text, p_allow_staff boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null or p_folder is null then false
    when p_folder = auth.uid()::text then exists (select 1 from public.profiles where id = auth.uid())
    when p_allow_staff
         and p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.staff_may_edit_catalog(p_folder::uuid)
    else false
  end
$$;

revoke all on function public.storage_salon_folder_writable(text, boolean) from public, anon;
grant execute on function public.storage_salon_folder_writable(text, boolean) to authenticated;

drop policy if exists "auth_upload_service_photos" on storage.objects;
drop policy if exists "auth_delete_service_photos" on storage.objects;
drop policy if exists "Owner can upload photos" on storage.objects;
drop policy if exists "Owner can delete photos" on storage.objects;
drop policy if exists "Authenticated users can upload service photos" on storage.objects;
drop policy if exists "Authenticated users can delete their service photos" on storage.objects;
drop policy if exists "Authenticated users can upload business images" on storage.objects;
drop policy if exists "Authenticated users can delete their business images" on storage.objects;

create policy "salon_folder_insert_business_images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-images'
              and public.storage_salon_folder_writable((storage.foldername(name))[1], false));

create policy "salon_folder_delete_business_images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-images'
         and public.storage_salon_folder_writable((storage.foldername(name))[1], false));

create policy "salon_folder_insert_service_photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'service-photos'
              and public.storage_salon_folder_writable((storage.foldername(name))[1], true));

create policy "salon_folder_delete_service_photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'service-photos'
         and public.storage_salon_folder_writable((storage.foldername(name))[1], true));

-- Alleen afbeeldingen, en niet groter dan 10 MB. compressImage maakt van elke
-- foto een JPEG (of PNG met transparantie); het grootste bestand nu is 446 KB en
-- er staan alleen jpeg, png, webp en avif in. Geen image/svg+xml: een SVG kan
-- script bevatten en de buckets zijn openbaar.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif',
                                  'image/gif', 'image/heic', 'image/heif']
 where id in ('business-images', 'service-photos');
