-- Salon deactiveren, vervolg op 20261023095146 (23-10-2026, na de review):
--  1. De reden van deactiveren is alleen voor de beheerder ("only for you").
--     Op profiles kon de salon hem zelf lezen (eigen rij, en een teamlid via
--     staff_salon_profile). Nu een eigen tabel die alleen service_role leest;
--     admin_salons_list haalt hem daar op en de kolom op profiles verdwijnt.
--  2. Een "eigenaar"-login die ook teamlid is bij een ANDERE salon (een
--     stylist met een leeg eigen profiel) wordt nooit verwijderd:
--     admin_salon_delete_prepare weigert dan (admin-salon controleert het ook).

-- 1. Reden in een eigen tabel ---------------------------------------------
create table public.salon_deactivation_notes (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) <= 300),
  created_at timestamptz not null default now()
);
alter table public.salon_deactivation_notes enable row level security;
revoke all on public.salon_deactivation_notes from public, anon, authenticated;

insert into public.salon_deactivation_notes (owner_id, reason)
select id, deactivated_reason from public.profiles where deactivated_reason is not null;

-- De guard-trigger noemt de kolom: eerst daar weg (zelfde aanpak als in
-- 20261023095146: de bestaande definitie bewerken, stoppen als iets ontbreekt).
do $guard$
declare
  d text := pg_get_functiondef('public.profiles_guard_privileged'::regproc);
  n text;
begin
  n := replace(d, $s$'deactivated_at', 'deactivated_reason'$s$, $s$'deactivated_at'$s$);
  if n = d then raise exception 'profiles_guard_privileged: v_locked niet gevonden'; end if;
  d := n;
  n := replace(d, $s$or new.deactivated_at is not null or new.deactivated_reason is not null then$s$,
                  $s$or new.deactivated_at is not null then$s$);
  if n = d then raise exception 'profiles_guard_privileged: INSERT-check niet gevonden'; end if;
  execute n;
end
$guard$;

create or replace function public.admin_salons_list()
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
    p.subscription_status, p.deactivated_at,
    (select n.reason from salon_deactivation_notes n where n.owner_id = p.id)
  from profiles p
  where not p.is_demo
  order by p.created_at desc;
end;
$function$;

-- 2. Verwijderen: reden uit de nieuwe tabel, en een login die elders in een
-- team staat nooit verwijderen.
create or replace function public.admin_salon_delete_prepare(p_owner uuid, p_by uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_p public.profiles%rowtype;
  v_reason text;
  v_staff uuid[];
  v_clients uuid[];
  v_files jsonb;
begin
  select * into v_p from public.profiles where id = p_owner;
  if not found then raise exception 'not_found'; end if;
  if v_p.deactivated_at is null then raise exception 'not_deactivated'; end if;
  if coalesce(v_p.is_demo, false) then raise exception 'demo'; end if;
  if exists (select 1 from public.staff_members o where o.user_id = p_owner and o.owner_id <> p_owner) then
    raise exception 'owner_is_staff_elsewhere';
  end if;
  select n.reason into v_reason from public.salon_deactivation_notes n where n.owner_id = p_owner;

  -- Teamleden met een eigen login, behalve de eigenaar zelf, iemand met een
  -- eigen salon, iemand die ook bij een andere salon in het team staat, of
  -- een beheerder.
  select coalesce(array_agg(distinct sm.user_id), '{}') into v_staff
    from public.staff_members sm
   where sm.owner_id = p_owner and sm.user_id is not null and sm.user_id <> p_owner
     and not exists (select 1 from public.profiles op where op.id = sm.user_id)
     and not exists (select 1 from public.staff_members o where o.user_id = sm.user_id and o.owner_id <> p_owner)
     and not exists (select 1 from public.app_admins aa where aa.user_id = sm.user_id);

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
  values (v_p.id, v_p.business_name, v_p.slug, v_p.email, v_p.country_code, v_p.mollie_customer_id, v_p.deactivated_at, v_reason, p_by)
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

alter table public.profiles drop column deactivated_reason;
