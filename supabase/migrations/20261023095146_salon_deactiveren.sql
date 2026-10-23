-- Salon deactiveren en definitief verwijderen vanuit de admin (23-10-2026,
-- Faisal: "there should also be a button where i can delete a salon").
-- Gekozen: eerst DEACTIVEREN (terug te draaien, alle gegevens blijven), daarna
-- pas DEFINITIEF VERWIJDEREN. De acties zelf draaien in de edge function
-- admin-salon (Mollie, inlog blokkeren, bestanden); deze migratie legt de
-- database klaar:
--  1. profiles.deactivated_at (NULL = actief) + reden; de eigenaar kan die niet
--     zelf wissen (profiles_guard_privileged).
--  2. public_salons krijgt achteraan de kolom deactivated (boekingspagina,
--     homepage, sitemap); public_app_ratings toont geen gedeactiveerde salon.
--  3. reviews gaan mee bij verwijderen (de FK blokkeerde het verwijderen van
--     elke salon met reviews).
--  4. Vellu's facturen aan een salon BLIJVEN na verwijderen (fiscale
--     bewaarplicht 7 jaar): klantgegevens worden op de factuur vastgelegd
--     (nu meteen voor alle bestaande, voortaan bij het aanmaken via een
--     trigger), owner_id mag leeg worden (ON DELETE SET NULL), en de
--     admin-overzichten tellen facturen van verwijderde salons nog mee.
--  5. deleted_salons: een korte notitie per verwijderde salon (voor meldingen
--     als er daarna nog een Mollie-betaling binnenkomt).
--  6. admin_salons_list geeft status en deactivated_at terug; twee interne
--     functies voor admin-salon (alleen service_role).

-- 1. Vlag ---------------------------------------------------------------
alter table public.profiles
  add column deactivated_at timestamptz,
  add column deactivated_reason text check (deactivated_reason is null or char_length(deactivated_reason) <= 300);

-- De guard-trigger: deactivated_* bij de kolommen die alleen Vellu wijzigt, en
-- bij het aanmaken van een profiel moeten ze leeg zijn. Bewerkt de bestaande
-- definitie in plaats van hem over te tikken, en stopt als een stuk niet
-- gevonden wordt.
do $guard$
declare
  d text := pg_get_functiondef('public.profiles_guard_privileged'::regproc);
  n text;
begin
  n := replace(d, $s$'plan_change_started_at'$s$, $s$'plan_change_started_at', 'deactivated_at', 'deactivated_reason'$s$);
  if n = d then raise exception 'profiles_guard_privileged: v_locked niet gevonden'; end if;
  d := n;
  n := replace(d, $s$or new.plan_change_started_at is not null then$s$,
                  $s$or new.plan_change_started_at is not null
       or new.deactivated_at is not null or new.deactivated_reason is not null then$s$);
  if n = d then raise exception 'profiles_guard_privileged: INSERT-check niet gevonden'; end if;
  execute n;
end
$guard$;

-- 2. Publieke views -----------------------------------------------------
do $view$
declare
  d text := pg_get_viewdef('public.public_salons'::regclass, true);
  n text;
begin
  n := replace(d, 'COALESCE(is_demo, false) AS is_demo', 'COALESCE(is_demo, false) AS is_demo,' || chr(10) || '    deactivated_at IS NOT NULL AS deactivated');
  if n = d then raise exception 'public_salons: is_demo-kolom niet gevonden'; end if;
  execute 'create or replace view public.public_salons as ' || n;
end
$view$;

create or replace view public.public_app_ratings as
 select r.owner_id, r.rating, r.liked, p.business_name, p.city, p.country_code, r.updated_at
   from public.app_ratings r
   join public.profiles p on p.id = r.owner_id
  where r.allow_public and r.published and not coalesce(p.is_demo, false)
    and p.deactivated_at is null
    and exists (select 1 from public.app_rating_settings s where s.show_on_site);

-- 3. Reviews gaan mee met de salon ----------------------------------------
alter table public.reviews drop constraint reviews_owner_id_fkey;
alter table public.reviews add constraint reviews_owner_id_fkey
  foreign key (owner_id) references public.profiles(id) on delete cascade;

-- 4. Facturen blijven -----------------------------------------------------
alter table public.payment_invoices
  add column customer_owner_id uuid,
  add column customer_name text,
  add column customer_email text,
  add column customer_address text,
  add column customer_city text,
  add column customer_country_code text,
  add column customer_btw_id text,
  add column customer_kvk text,
  add column mollie_payment_id text;

update public.payment_invoices i
   set customer_owner_id = i.owner_id,
       customer_name = p.business_name,
       customer_email = p.email,
       customer_address = p.address,
       customer_city = p.city,
       customer_country_code = p.country_code,
       customer_btw_id = p.btw_id,
       customer_kvk = p.kvk_number
  from public.profiles p
 where p.id = i.owner_id;
update public.payment_invoices i
   set mollie_payment_id = e.mollie_payment_id
  from public.payment_events e
 where e.id = i.payment_event_id and i.mollie_payment_id is null;

alter table public.payment_invoices alter column owner_id drop not null;
alter table public.payment_invoices drop constraint payment_invoices_owner_id_fkey;
alter table public.payment_invoices add constraint payment_invoices_owner_id_fkey
  foreign key (owner_id) references public.profiles(id) on delete set null;
-- Alleen Vellu (service_role) schrijft facturen; nooit vanuit de browser.
revoke insert, update, delete, truncate on public.payment_invoices from anon, authenticated;

-- Nieuwe facturen krijgen de klantgegevens van dat moment mee.
create or replace function public.tg_payment_invoices_snapshot()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare p record;
begin
  if new.owner_id is not null then
    select pr.business_name, pr.email, pr.address, pr.city, pr.country_code, pr.btw_id, pr.kvk_number
      into p from public.profiles pr where pr.id = new.owner_id;
    new.customer_owner_id := coalesce(new.customer_owner_id, new.owner_id);
    if found then
      new.customer_name := coalesce(new.customer_name, p.business_name);
      new.customer_email := coalesce(new.customer_email, p.email);
      new.customer_address := coalesce(new.customer_address, p.address);
      new.customer_city := coalesce(new.customer_city, p.city);
      new.customer_country_code := coalesce(new.customer_country_code, p.country_code);
      new.customer_btw_id := coalesce(new.customer_btw_id, p.btw_id);
      new.customer_kvk := coalesce(new.customer_kvk, p.kvk_number);
    end if;
  end if;
  if new.mollie_payment_id is null and new.payment_event_id is not null then
    select e.mollie_payment_id into new.mollie_payment_id from public.payment_events e where e.id = new.payment_event_id;
  end if;
  return new;
end $function$;
revoke all on function public.tg_payment_invoices_snapshot() from public, anon, authenticated;
create trigger payment_invoices_snapshot before insert on public.payment_invoices
  for each row execute function public.tg_payment_invoices_snapshot();

-- Admin-overzichten: facturen van verwijderde salons (owner_id leeg) tellen mee.
create or replace function public.admin_subscription_invoices()
 returns table(invoice_number text, issued_on date, issued_at timestamptz, salon_id uuid, business_name text, country_code text,
               salon_btw_id text, salon_kvk text, plan text, billing_interval text, period_start date, period_end date,
               amount_excl_vat numeric, vat_rate numeric, vat_amount numeric, total_eur numeric, vat_treatment text,
               mollie_payment_id text, sent_at timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select i.invoice_number,
         (coalesce(i.issued_at, i.created_at) at time zone 'Europe/Amsterdam')::date,
         coalesce(i.issued_at, i.created_at),
         coalesce(p.id, i.customer_owner_id),
         coalesce(p.business_name, i.customer_name),
         coalesce(p.country_code, i.customer_country_code),
         coalesce(p.btw_id, i.customer_btw_id),
         coalesce(p.kvk_number, i.customer_kvk),
         i.plan, i.billing_interval, i.period_start, i.period_end,
         coalesce(i.amount_excl_vat, i.total_eur)::numeric,
         i.vat_rate,
         coalesce(i.vat_amount, 0)::numeric,
         coalesce(i.total_eur, 0)::numeric,
         case when coalesce(i.vat_rate, 0) > 0 then 'nl_vat' else 'outside_eu' end,
         coalesce(e.mollie_payment_id, i.mollie_payment_id),
         i.sent_at
    from public.payment_invoices i
    left join public.profiles p on p.id = i.owner_id
    left join public.payment_events e on e.id = i.payment_event_id
   where not coalesce(p.is_demo, false)
   order by coalesce(i.issued_at, i.created_at) desc, i.invoice_number desc;
end $function$;

create or replace function public.admin_subscription_revenue()
 returns table(kind text, period_key text, period_start date, invoice_count integer, salon_count integer, total_eur numeric, excl_vat_eur numeric, vat_eur numeric)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  with inv as (
    select coalesce(i.owner_id, i.customer_owner_id) as oid,
           coalesce(i.issued_at, i.created_at)::date as d,
           coalesce(i.total_eur, 0)::numeric as tot,
           coalesce(i.amount_excl_vat, 0)::numeric as ex,
           coalesce(i.vat_amount, 0)::numeric as vt
      from public.payment_invoices i
     where i.owner_id is null or i.owner_id in (select p.id from public.profiles p where not coalesce(p.is_demo, false))
  ), g as (
    select 'month'::text as kd, to_char(date_trunc('month', v.d), 'YYYY-MM') as pk, date_trunc('month', v.d)::date as ps, v.oid, v.tot, v.ex, v.vt from inv v
    union all
    select 'quarter'::text, to_char(v.d, 'YYYY') || '-Q' || to_char(v.d, 'Q'), date_trunc('quarter', v.d)::date, v.oid, v.tot, v.ex, v.vt from inv v
    union all
    select 'year'::text, to_char(v.d, 'YYYY'), date_trunc('year', v.d)::date, v.oid, v.tot, v.ex, v.vt from inv v
  )
  select g.kd, g.pk, g.ps, count(*)::int, count(distinct g.oid)::int, sum(g.tot)::numeric, sum(g.ex)::numeric, sum(g.vt)::numeric
    from g
   group by g.kd, g.pk, g.ps
   order by g.kd, g.ps;
end $function$;

create or replace function public.admin_billing_overview()
 returns table(mrr_eur numeric, arr_eur numeric, paying_count integer, churning_count integer, trialing_count integer, comped_count integer, trials_ending_14d integer, collected_total_eur numeric, collected_30d_eur numeric, invoices_count integer)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  with sub as (
    select
      p.subscription_status as status,
      (p.mollie_subscription_id is not null) as has_mollie,
      exists (select 1 from payment_invoices i
              where i.owner_id = p.id and i.total_eur > 0
                and i.period_end >= current_date) as has_current_paid_invoice,
      coalesce(p.cancel_at_period_end, false) as churning,
      p.trial_ends_at,
      (case when p.plan = 'professional' then 35.0
            when p.plan = 'starter' then 19.0
            else 0.0 end) as base,
      p.billing_interval as intv
    from profiles p
    where not p.is_demo and p.deactivated_at is null
  ), classified as (
    select s.*,
      (s.status = 'active' and (s.has_mollie or (s.intv = 'yearly' and s.has_current_paid_invoice))) as is_paying,
      (case when s.intv = 'yearly' then s.base * 10.0 / 12.0 else s.base end) as mrr
    from sub s
  ), inv as (
    select i.* from payment_invoices i
     where i.owner_id is null or i.owner_id in (select id from profiles where not is_demo)
  )
  select
    coalesce(sum(mrr) filter (where is_paying), 0)::numeric,
    (coalesce(sum(mrr) filter (where is_paying), 0) * 12)::numeric,
    count(*) filter (where is_paying)::int,
    count(*) filter (where is_paying and churning)::int,
    count(*) filter (where status = 'trialing')::int,
    count(*) filter (where status = 'active' and not is_paying)::int,
    count(*) filter (where status = 'trialing' and trial_ends_at is not null and trial_ends_at <= now() + interval '14 days')::int,
    (select coalesce(sum(total_eur), 0) from inv)::numeric,
    (select coalesce(sum(total_eur), 0) from inv where issued_at > now() - interval '30 days')::numeric,
    (select count(*)::int from inv)
  from classified;
end $function$;

-- 5. Notitie per verwijderde salon -----------------------------------------
create table public.deleted_salons (
  id uuid primary key,
  business_name text,
  slug text,
  email text,
  country_code text,
  mollie_customer_id text,
  deactivated_at timestamptz,
  deactivated_reason text,
  deleted_at timestamptz not null default now(),
  deleted_by uuid
);
alter table public.deleted_salons enable row level security;
revoke all on public.deleted_salons from public, anon, authenticated;

-- 6. Admin-lijst + interne functies ---------------------------------------
drop function if exists public.admin_salons_list();
create function public.admin_salons_list()
 returns table(id uuid, slug text, business_name text, email text, city text, plan text, plan_expires_at timestamptz,
               created_at timestamptz, staff_count integer, appt_count integer, completed_count integer, upcoming_count integer,
               total_revenue numeric, last_activity timestamptz, google_connected boolean, referred_by uuid, referral_code text,
               last_seen timestamptz, subscription_status text, deactivated_at timestamptz, deactivated_reason text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select
    p.id, p.slug, p.business_name, p.email, p.city,
    p.plan, p.plan_expires_at, p.created_at,
    (select count(*)::int from staff_members sm where sm.owner_id = p.id),
    (select count(*)::int from appointments a1 where a1.owner_id = p.id),
    (select count(*)::int from appointments a2 where a2.owner_id = p.id and a2.status = 'completed'),
    (select count(*)::int from appointments a3 where a3.owner_id = p.id and a3.status = 'confirmed' and a3.date >= current_date),
    (select coalesce(sum(a4.service_price), 0) from appointments a4 where a4.owner_id = p.id and a4.status = 'completed'),
    (select max(a5.created_at) from appointments a5 where a5.owner_id = p.id),
    coalesce(p.google_calendar_connected, false),
    p.referred_by, p.referral_code,
    greatest((select u.last_sign_in_at from auth.users u where u.id = p.id),
             (select max(s.updated_at) from auth.sessions s where s.user_id = p.id)),
    p.subscription_status, p.deactivated_at, p.deactivated_reason
  from profiles p
  where not p.is_demo
  order by p.created_at desc;
end;
$function$;
revoke all on function public.admin_salons_list() from public, anon;
grant execute on function public.admin_salons_list() to authenticated, service_role;

-- Wat admin-salon bij verwijderen moet opruimen buiten de cascade om:
-- logins van teamleden (geen FK), klanten die alleen bij deze salon boekten
-- (globale clients-tabel), en de bestanden in storage (alleen via de Storage
-- API te verwijderen). Legt ook meteen de klantgegevens op de facturen vast
-- en schrijft de notitie in deleted_salons.
create or replace function public.admin_salon_delete_prepare(p_owner uuid, p_by uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_p public.profiles%rowtype;
  v_staff uuid[];
  v_clients uuid[];
  v_files jsonb;
begin
  select * into v_p from public.profiles where id = p_owner;
  if not found then raise exception 'not_found'; end if;
  if v_p.deactivated_at is null then raise exception 'not_deactivated'; end if;
  if coalesce(v_p.is_demo, false) then raise exception 'demo'; end if;

  -- Teamleden met een eigen login, behalve de eigenaar zelf, iemand met een
  -- eigen salon, of iemand die ook bij een andere salon in het team staat.
  select coalesce(array_agg(distinct sm.user_id), '{}') into v_staff
    from public.staff_members sm
   where sm.owner_id = p_owner and sm.user_id is not null and sm.user_id <> p_owner
     and not exists (select 1 from public.profiles op where op.id = sm.user_id)
     and not exists (select 1 from public.staff_members o where o.user_id = sm.user_id and o.owner_id <> p_owner);

  select coalesce(array_agg(distinct a.client_id), '{}') into v_clients
    from public.appointments a
   where a.owner_id = p_owner and a.client_id is not null
     and not exists (select 1 from public.appointments b where b.client_id = a.client_id and b.owner_id <> p_owner);

  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)), '[]') into v_files
    from storage.objects o
   where o.bucket_id in ('business-images', 'service-photos') and o.name like p_owner::text || '/%';

  update public.payment_invoices i
     set customer_owner_id = coalesce(i.customer_owner_id, i.owner_id),
         customer_name = coalesce(i.customer_name, v_p.business_name),
         customer_email = coalesce(i.customer_email, v_p.email),
         customer_address = coalesce(i.customer_address, v_p.address),
         customer_city = coalesce(i.customer_city, v_p.city),
         customer_country_code = coalesce(i.customer_country_code, v_p.country_code),
         customer_btw_id = coalesce(i.customer_btw_id, v_p.btw_id),
         customer_kvk = coalesce(i.customer_kvk, v_p.kvk_number),
         mollie_payment_id = coalesce(i.mollie_payment_id, (select e.mollie_payment_id from public.payment_events e where e.id = i.payment_event_id))
   where i.owner_id = p_owner;

  insert into public.deleted_salons (id, business_name, slug, email, country_code, mollie_customer_id, deactivated_at, deactivated_reason, deleted_by)
  values (v_p.id, v_p.business_name, v_p.slug, v_p.email, v_p.country_code, v_p.mollie_customer_id, v_p.deactivated_at, v_p.deactivated_reason, p_by)
  on conflict (id) do update set deleted_at = now(), deleted_by = excluded.deleted_by;

  return jsonb_build_object(
    'business_name', v_p.business_name, 'slug', v_p.slug, 'mollie_customer_id', v_p.mollie_customer_id,
    'staff_user_ids', to_jsonb(v_staff), 'client_ids', to_jsonb(v_clients), 'files', v_files,
    'counts', jsonb_build_object(
      'appointments', (select count(*) from public.appointments where owner_id = p_owner),
      'clients', (select count(*) from public.manual_clients where owner_id = p_owner),
      'services', (select count(*) from public.services where owner_id = p_owner),
      'invoices_kept', (select count(*) from public.payment_invoices where owner_id = p_owner)));
end $function$;
revoke all on function public.admin_salon_delete_prepare(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_salon_delete_prepare(uuid, uuid) to service_role;

-- Na het verwijderen van de logins: wat niet via een FK meegaat.
create or replace function public.admin_salon_delete_finish(p_owner uuid, p_user_ids uuid[], p_client_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_clients int; v_usage int; v_trans int; v_inv int;
begin
  if exists (select 1 from public.profiles where id = p_owner) then raise exception 'profile_still_exists'; end if;
  delete from public.staff_invite_usage where owner_id = p_owner;
  delete from public.support_chat_user_usage where user_id = any(array_append(coalesce(p_user_ids, '{}'), p_owner));
  get diagnostics v_usage = row_count;
  delete from public.translate_usage where user_id = any(array_append(coalesce(p_user_ids, '{}'), p_owner));
  get diagnostics v_trans = row_count;
  -- Alleen klanten die nergens anders meer een afspraak hebben.
  delete from public.clients c
   where c.id = any(coalesce(p_client_ids, '{}'))
     and not exists (select 1 from public.appointments a where a.client_id = c.id);
  get diagnostics v_clients = row_count;
  select count(*) into v_inv from public.payment_invoices where customer_owner_id = p_owner;
  return jsonb_build_object('clients_deleted', v_clients, 'usage_rows', v_usage + v_trans, 'invoices_kept', v_inv);
end $function$;
revoke all on function public.admin_salon_delete_finish(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.admin_salon_delete_finish(uuid, uuid[], uuid[]) to service_role;
