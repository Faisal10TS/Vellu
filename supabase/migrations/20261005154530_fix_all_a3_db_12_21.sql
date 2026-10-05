-- Fix-all audit 05-10-2026: DB.sql deel A, secties 12-21.
-- Samengesteld uit supabase/migrations/pending/*.sql (zie de commitgeschiedenis).
set local lock_timeout = '10s';

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
