-- BASIS — het schema zoals het bestond vóór er migraties werden bijgehouden
--
-- WAAROM DIT BESTAND ER IS
-- De migratie-ledger van dit project begint op 11 maart 2026. Het fundament van
-- Vellu is daarvóór met de hand aangelegd en is nooit vastgelegd. Dat is niet
-- zichtbaar zolang je alleen naar productie kijkt, maar het betekent dat de
-- migraties samen de database NIET konden herbouwen: de allereerste migratie
-- (20260311125516_create_service_photos_table) doet al `references services(id)`,
-- en die tabel bestond in geen enkel bestand. Een herbouw op een lege database
-- faalde dus niet ergens halverwege, maar meteen bij migratie 1.
--
-- 17 van de 33 tabellen ontbraken volledig, waaronder profiles, appointments,
-- services, staff_members en reviews. Dit bestand legt die basis alsnog vast.
--
-- HOE HET IS SAMENGESTELD
-- Niet met de hand geschreven maar gegenereerd uit de systeemcatalogus van
-- productie (pg_class, pg_attribute, pg_constraint, pg_index, pg_policies).
-- Daarna is er per kolom, constraint, index en policy gecontroleerd of een
-- LATERE migratie hem al aanmaakt; alles wat al gedekt was is eruit gelaten.
-- Zo blijft de historische volgorde kloppen en lopen de 93 bestaande migraties
-- er daarna schoon overheen. Concreet weggelaten omdat een latere migratie ze
-- doet: 83 kolommen (waarvan 51 op profiles), profiles_plan_check,
-- profiles_calendar_feed_token_key, profiles_slot_interval_minutes_check,
-- services_category_id_fkey, appointments_client_id_fkey, vier indexen en
-- 16 van de 46 policies.
--
-- DIT BESTAND IS NIET GETEST DOOR HET TE DRAAIEN
-- Dat het klopt is afgeleid uit de catalogus, niet bewezen door een herbouw.
-- Een echte test hoort op een leeg tweede project of een Supabase-branch —
-- nooit op productie. Zie supabase/migrations/README.md.
--
-- VEILIG OM OPNIEUW TE DRAAIEN: alles staat op `if not exists` en policies
-- worden eerst gedropt. Op productie is deze migratie als reeds-toegepast
-- geregistreerd, dus `supabase db push` slaat hem over.

-- ============================================================ 1. TABELLEN

create table if not exists public.profiles (
  id uuid not null,
  business_name text default 'My Beauty Studio'::text not null,
  owner_name text,
  email text,
  phone text,
  city text,
  accent_color text default '#c9a96e'::text,
  created_at timestamp with time zone default now(),
  slug text,
  address text,
  kvk_number text,
  btw_id text,
  iban text,
  invoice_prefix text default 'INV'::text,
  next_invoice_number integer default 1,
  business_hours jsonb default '{"0": {"open": "09:00", "close": "17:30", "closed": true}, "1": {"open": "09:00", "close": "17:30", "closed": false}, "2": {"open": "09:00", "close": "17:30", "closed": false}, "3": {"open": "09:00", "close": "17:30", "closed": false}, "4": {"open": "09:00", "close": "17:30", "closed": false}, "5": {"open": "09:00", "close": "17:30", "closed": false}, "6": {"open": "09:00", "close": "17:30", "closed": true}}'::jsonb,
  plan text,
  plan_expires_at timestamp with time zone,
  mollie_customer_id text,
  break_minutes integer default 0,
  day_overrides jsonb default '{}'::jsonb,
  account_type text default 'joint'::text,
  min_advance_hours integer default 0,
  max_advance_days integer default 60,
  reminder_hours integer default 24,
  google_refresh_token text,
  google_calendar_connected boolean default false,
  google_place_id text,
  auto_block_no_show_threshold integer default 0,
  referral_code text,
  referred_by uuid,
  referral_credit_months integer default 0
);

create table if not exists public.locations (
  id uuid default gen_random_uuid() not null,
  owner_id uuid,
  name text not null,
  address text,
  city text,
  phone text,
  business_hours jsonb default '{}'::jsonb,
  break_minutes integer default 0,
  active boolean default true,
  "position" integer default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.services (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  name text not null,
  name_nl text,
  duration integer default 60 not null,
  price numeric(10,2) not null,
  "position" integer default 0,
  created_at timestamp with time zone default now(),
  name_en text
);

create table if not exists public.service_variants (
  id uuid default gen_random_uuid() not null,
  service_id uuid,
  name_nl text not null,
  name_en text,
  description_nl text,
  description_en text,
  price numeric(10,2) not null,
  duration integer not null,
  "position" integer default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.service_extras (
  id uuid default gen_random_uuid() not null,
  service_id uuid,
  name_nl text not null,
  name_en text,
  price numeric(10,2) default 0 not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.staff_members (
  id uuid default gen_random_uuid() not null,
  owner_id uuid,
  name text not null,
  role text,
  avatar_url text,
  "position" integer default 0,
  active boolean default true,
  created_at timestamp with time zone default now(),
  working_hours jsonb,
  user_id uuid,
  email text,
  address text,
  kvk_number text,
  btw_id text,
  iban text,
  invoice_prefix text default 'INV'::text,
  next_invoice_number integer default 1
);

create table if not exists public.staff_services (
  id uuid default gen_random_uuid() not null,
  staff_id uuid,
  service_id uuid
);

create table if not exists public.location_staff (
  location_id uuid not null,
  staff_id uuid not null
);

create table if not exists public.location_services (
  location_id uuid not null,
  service_id uuid not null
);

create table if not exists public.appointments (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  service_id uuid,
  service_name text,
  service_price numeric(10,2),
  service_duration integer,
  date date not null,
  "time" text not null,
  client_name text not null,
  client_email text not null,
  client_phone text,
  payment_method text default 'on-arrival'::text,
  status text default 'confirmed'::text,
  invoice_sent boolean default false,
  created_at timestamp with time zone default now(),
  reminder_sent boolean default false,
  staff_id uuid,
  staff_name text,
  client_allergies text,
  followup_sent boolean default false,
  followup_sent_at timestamp with time zone,
  location_id uuid,
  google_event_id text,
  rescheduled_at timestamp with time zone
);

create table if not exists public.reviews (
  id uuid default gen_random_uuid() not null,
  appointment_id uuid,
  owner_id uuid,
  client_name text not null,
  client_email text,
  rating integer not null,
  comment text,
  created_at timestamp with time zone default now()
);

create table if not exists public.client_tokens (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  email text not null,
  token text not null,
  expires_at timestamp with time zone not null,
  used boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.client_no_shows (
  client_email text not null,
  owner_id uuid not null,
  no_show_count integer default 0 not null,
  last_no_show_at timestamp with time zone,
  blocked boolean default false not null,
  blocked_at timestamp with time zone
);

create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() not null,
  owner_id uuid,
  plan text not null,
  status text default 'active'::text not null,
  amount numeric(10,2) not null,
  currency text default 'EUR'::text,
  "interval" text default 'month'::text,
  current_period_start timestamp with time zone default now(),
  current_period_end timestamp with time zone,
  mollie_subscription_id text,
  mollie_payment_id text,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.payments (
  id uuid default gen_random_uuid() not null,
  owner_id uuid,
  subscription_id uuid,
  amount numeric(10,2) not null,
  currency text default 'EUR'::text,
  status text default 'pending'::text not null,
  method text,
  mollie_payment_id text,
  description text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.app_admins (
  user_id uuid not null,
  created_at timestamp with time zone default now(),
  notes text
);

create table if not exists public.cron_health (
  id uuid default gen_random_uuid() not null,
  job_name text not null,
  ran_at timestamp with time zone default now() not null,
  status text not null,
  duration_ms integer,
  items_processed integer,
  error_message text
);

-- ================================ 2. SLEUTELS, UNIEKHEID EN CONTROLES
-- Eerst de primary keys en uniekheid, daarna pas de foreign keys — anders
-- verwijst een FK naar een kolom die nog geen unieke index heeft.

do $$ begin
  alter table public.profiles add constraint profiles_pkey primary key (id);
  alter table public.profiles add constraint profiles_referral_code_key unique (referral_code);
  alter table public.profiles add constraint profiles_slug_key unique (slug);
  alter table public.locations add constraint locations_pkey primary key (id);
  alter table public.services add constraint services_pkey primary key (id);
  alter table public.service_variants add constraint service_variants_pkey primary key (id);
  alter table public.service_extras add constraint service_extras_pkey primary key (id);
  alter table public.staff_members add constraint staff_members_pkey primary key (id);
  alter table public.staff_services add constraint staff_services_pkey primary key (id);
  alter table public.staff_services add constraint staff_services_staff_id_service_id_key unique (staff_id, service_id);
  alter table public.location_staff add constraint location_staff_pkey primary key (location_id, staff_id);
  alter table public.location_services add constraint location_services_pkey primary key (location_id, service_id);
  alter table public.appointments add constraint appointments_pkey primary key (id);
  alter table public.reviews add constraint reviews_pkey primary key (id);
  alter table public.reviews add constraint reviews_rating_check check (((rating >= 1) and (rating <= 5)));
  alter table public.client_tokens add constraint client_tokens_pkey primary key (id);
  alter table public.client_no_shows add constraint client_no_shows_pkey primary key (client_email, owner_id);
  alter table public.subscriptions add constraint subscriptions_pkey primary key (id);
  alter table public.payments add constraint payments_pkey primary key (id);
  alter table public.app_admins add constraint app_admins_pkey primary key (user_id);
  alter table public.cron_health add constraint cron_health_pkey primary key (id);
  alter table public.cron_health add constraint cron_health_status_check check ((status = any (array['success'::text, 'error'::text])));
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
  alter table public.profiles add constraint profiles_referred_by_fkey foreign key (referred_by) references public.profiles(id) on delete set null;
  alter table public.locations add constraint locations_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade;
  alter table public.services add constraint services_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade;
  alter table public.service_variants add constraint service_variants_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade;
  alter table public.service_extras add constraint service_extras_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade;
  alter table public.staff_members add constraint staff_members_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade;
  alter table public.staff_services add constraint staff_services_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade;
  alter table public.staff_services add constraint staff_services_staff_id_fkey foreign key (staff_id) references public.staff_members(id) on delete cascade;
  alter table public.location_staff add constraint location_staff_location_id_fkey foreign key (location_id) references public.locations(id) on delete cascade;
  alter table public.location_staff add constraint location_staff_staff_id_fkey foreign key (staff_id) references public.staff_members(id) on delete cascade;
  alter table public.location_services add constraint location_services_location_id_fkey foreign key (location_id) references public.locations(id) on delete cascade;
  alter table public.location_services add constraint location_services_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade;
  alter table public.appointments add constraint appointments_location_id_fkey foreign key (location_id) references public.locations(id);
  alter table public.appointments add constraint appointments_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade;
  alter table public.appointments add constraint appointments_service_id_fkey foreign key (service_id) references public.services(id) on delete set null;
  alter table public.appointments add constraint appointments_staff_id_fkey foreign key (staff_id) references public.staff_members(id);
  alter table public.reviews add constraint reviews_appointment_id_fkey foreign key (appointment_id) references public.appointments(id) on delete cascade;
  alter table public.reviews add constraint reviews_owner_id_fkey foreign key (owner_id) references public.profiles(id);
  alter table public.client_no_shows add constraint client_no_shows_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade;
  alter table public.subscriptions add constraint subscriptions_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade;
  alter table public.payments add constraint payments_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade;
  alter table public.payments add constraint payments_subscription_id_fkey foreign key (subscription_id) references public.subscriptions(id) on delete set null;
  alter table public.app_admins add constraint app_admins_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_table or duplicate_object then null;
end $$;

-- client_tokens_client_id_fkey staat BEWUST niet hierboven: die verwijst naar
-- public.clients, en die tabel wordt pas aangemaakt door migratie
-- 20260311134513_add_client_accounts_and_categories. De FK wordt daarom gelegd
-- in 20260818140001_reconcile_handmatige_wijzigingen.sql, achteraan de reeks.

-- ============================================================ 3. INDEXEN

create index if not exists idx_profiles_plan on public.profiles using btree (plan);
create index if not exists idx_staff_email on public.staff_members using btree (email);
create index if not exists idx_staff_user_id on public.staff_members using btree (user_id);
create index if not exists idx_client_tokens_email on public.client_tokens using btree (email);
create index if not exists idx_client_tokens_token on public.client_tokens using btree (token);
create index if not exists client_no_shows_owner_idx on public.client_no_shows using btree (owner_id);
create index if not exists idx_subscriptions_owner on public.subscriptions using btree (owner_id);
create index if not exists idx_payments_owner on public.payments using btree (owner_id);
create index if not exists cron_health_job_ran_idx on public.cron_health using btree (job_name, ran_at desc);

-- ==================================================== 4. ROW LEVEL SECURITY
-- Alle zeventien staan in productie op RLS aan. client_tokens en cron_health
-- bewust zonder policy: die zijn alleen voor de service_role, en RLS zonder
-- policy weigert standaard iedereen.

alter table public.profiles          enable row level security;
alter table public.locations         enable row level security;
alter table public.services          enable row level security;
alter table public.service_variants  enable row level security;
alter table public.service_extras    enable row level security;
alter table public.staff_members     enable row level security;
alter table public.staff_services    enable row level security;
alter table public.location_staff    enable row level security;
alter table public.location_services enable row level security;
alter table public.appointments      enable row level security;
alter table public.reviews           enable row level security;
alter table public.client_tokens     enable row level security;
alter table public.client_no_shows   enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.payments          enable row level security;
alter table public.app_admins        enable row level security;
alter table public.cron_health       enable row level security;

-- ============================================================ 5. POLICIES
-- Dertig policies. De overige zestien op deze tabellen worden door latere
-- migraties aangemaakt (de staff_*-reeks, de invite-claim-policies en de
-- insert/delete-policies op appointments) en staan hier dus niet.

drop policy if exists "Own profile" on public.profiles;
create policy "Own profile" on public.profiles for all to public using ((auth.uid() = id));

drop policy if exists "Owners manage own locations" on public.locations;
create policy "Owners manage own locations" on public.locations for all to public using ((auth.uid() = owner_id));

drop policy if exists "Public can read active locations" on public.locations;
create policy "Public can read active locations" on public.locations for select to public using ((active = true));

drop policy if exists "Owner manages services" on public.services;
create policy "Owner manages services" on public.services for all to public using ((auth.uid() = owner_id));

drop policy if exists "Public can read services" on public.services;
create policy "Public can read services" on public.services for select to public using (true);

drop policy if exists "Authenticated users can insert variants" on public.service_variants;
create policy "Authenticated users can insert variants" on public.service_variants for insert to public with check ((service_id in ( select services.id from services where (services.owner_id = auth.uid()))));

drop policy if exists "Owner manages variants" on public.service_variants;
create policy "Owner manages variants" on public.service_variants for all to public using ((service_id in ( select services.id from services where (services.owner_id = auth.uid()))));

drop policy if exists "Public can read variants" on public.service_variants;
create policy "Public can read variants" on public.service_variants for select to public using (true);

drop policy if exists "Authenticated users can insert extras" on public.service_extras;
create policy "Authenticated users can insert extras" on public.service_extras for insert to public with check ((service_id in ( select services.id from services where (services.owner_id = auth.uid()))));

drop policy if exists "Owner manages extras" on public.service_extras;
create policy "Owner manages extras" on public.service_extras for all to public using ((service_id in ( select services.id from services where (services.owner_id = auth.uid()))));

drop policy if exists "Public can read extras" on public.service_extras;
create policy "Public can read extras" on public.service_extras for select to public using (true);

drop policy if exists "Authenticated insert staff" on public.staff_members;
create policy "Authenticated insert staff" on public.staff_members for insert to public with check ((owner_id = auth.uid()));

drop policy if exists "Owner manages staff" on public.staff_members;
create policy "Owner manages staff" on public.staff_members for all to public using ((owner_id = auth.uid()));

drop policy if exists "Authenticated insert staff_services" on public.staff_services;
create policy "Authenticated insert staff_services" on public.staff_services for insert to public with check ((staff_id in ( select staff_members.id from staff_members where (staff_members.owner_id = auth.uid()))));

drop policy if exists "Owner manages staff_services" on public.staff_services;
create policy "Owner manages staff_services" on public.staff_services for all to public using ((staff_id in ( select staff_members.id from staff_members where (staff_members.owner_id = auth.uid()))));

drop policy if exists "Public can read staff_services" on public.staff_services;
create policy "Public can read staff_services" on public.staff_services for select to public using (true);

drop policy if exists "Owners manage location_staff" on public.location_staff;
create policy "Owners manage location_staff" on public.location_staff for all to public using ((location_id in ( select locations.id from locations where (locations.owner_id = auth.uid()))));

drop policy if exists "Public read location_staff" on public.location_staff;
create policy "Public read location_staff" on public.location_staff for select to public using (true);

drop policy if exists "Owners manage location_services" on public.location_services;
create policy "Owners manage location_services" on public.location_services for all to public using ((location_id in ( select locations.id from locations where (locations.owner_id = auth.uid()))));

drop policy if exists "Public read location_services" on public.location_services;
create policy "Public read location_services" on public.location_services for select to public using (true);

drop policy if exists "Owner sees appointments" on public.appointments;
create policy "Owner sees appointments" on public.appointments for select to public using ((auth.uid() = owner_id));

drop policy if exists "Owner updates appointments" on public.appointments;
create policy "Owner updates appointments" on public.appointments for update to public using ((auth.uid() = owner_id));

drop policy if exists "Owner manages reviews" on public.reviews;
create policy "Owner manages reviews" on public.reviews for all to public using ((owner_id = auth.uid()));

drop policy if exists client_no_shows_owner_modify on public.client_no_shows;
create policy client_no_shows_owner_modify on public.client_no_shows for all to public using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));

drop policy if exists client_no_shows_owner_select on public.client_no_shows;
create policy client_no_shows_owner_select on public.client_no_shows for select to public using (((owner_id = auth.uid()) or (owner_id in ( select staff_members.owner_id from staff_members where (staff_members.user_id = auth.uid())))));

drop policy if exists "Owners can view own subscriptions" on public.subscriptions;
create policy "Owners can view own subscriptions" on public.subscriptions for select to public using ((auth.uid() = owner_id));

drop policy if exists "Service role manages subscriptions" on public.subscriptions;
create policy "Service role manages subscriptions" on public.subscriptions for all to public using ((auth.role() = 'service_role'::text));

drop policy if exists "Owners can view own payments" on public.payments;
create policy "Owners can view own payments" on public.payments for select to public using ((auth.uid() = owner_id));

drop policy if exists "Service role manages payments" on public.payments;
create policy "Service role manages payments" on public.payments for all to public using ((auth.role() = 'service_role'::text));

drop policy if exists app_admins_self_read on public.app_admins;
create policy app_admins_self_read on public.app_admins for select to public using ((user_id = auth.uid()));

-- app_admins is de tabel die bepaalt wie het admin-dashboard mag zien. anon
-- hoort er niet bij te kunnen; een ingelogde gebruiker mag alleen zijn eigen
-- rij lezen (policy hierboven), en zonder deze grant zou die policy dood zijn.
revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;
