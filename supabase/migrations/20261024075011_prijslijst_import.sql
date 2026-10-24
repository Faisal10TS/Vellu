-- Prijslijst inlezen (24-10-2026, Faisal: "yes do 2"). Een salon uploadt een
-- foto of PDF van haar prijslijst; de edge function parse-price-list laat
-- Claude de behandelingen, prijzen en tijden lezen, de salon controleert de
-- lijst en voegt alles in één keer toe. Aanleiding: salons die zich aanmelden
-- en daarna nooit een dienst invullen (Élané, Hair by Lina, Mebeauty).
--  1. price_list_imports: één rij per poging (bestanden, uitkomst, tokens,
--     of en hoeveel er is toegevoegd). Alleen de edge function schrijft
--     (price_list_import_begin: met de daglimiet); de salon volgt het lezen
--     via price_list_import_status en meldt "toegevoegd" via
--     price_list_import_applied.
--  2. Opslagbucket price-lists (privé): de upload blijft bewaard zodat de
--     beheerder een onleesbare foto kan bekijken en de salon kan helpen.
--  3. Admin: admin_onboarding (wie loopt vast) en admin_price_list_imports.
--  4. Definitief verwijderen van een salon ruimt ook haar prijslijsten op.

-- 1. Logboek ------------------------------------------------------------
create table public.price_list_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'processing' check (status in ('processing', 'ok', 'empty', 'failed')),
  files jsonb not null default '[]'::jsonb,
  error text,
  model text,
  services_found integer,
  result jsonb,
  input_tokens integer,
  output_tokens integer,
  applied_at timestamptz,
  services_added integer
);
create index price_list_imports_owner_created on public.price_list_imports (owner_id, created_at desc);
alter table public.price_list_imports enable row level security;
revoke all on public.price_list_imports from public, anon, authenticated;

-- Een nieuwe poging beginnen, met de daglimiet in dezelfde transactie (een
-- slot per salon: twee gelijktijdige aanvragen kunnen er niet allebei langs).
-- null = limiet bereikt. Alleen de edge function (service_role).
create or replace function public.price_list_import_begin(p_owner uuid, p_model text, p_limit integer)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('price_list_import:' || p_owner::text));
  if (select count(*) from public.price_list_imports
       where owner_id = p_owner and created_at > now() - interval '24 hours') >= p_limit then
    return null;
  end if;
  insert into public.price_list_imports (owner_id, status, model)
  values (p_owner, 'processing', p_model) returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.price_list_import_begin(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.price_list_import_begin(uuid, text, integer) to service_role;

-- De app vraagt om de paar seconden hoe het ervoor staat: het lezen loopt op
-- de achtergrond (anders sloot Supabase lange prijslijsten na 150 s af).
-- Staat een poging na 8 minuten nog op 'processing', dan is de achtergrondtaak
-- gestopt (de functie mag 400 s draaien): dan 'failed'. Alleen de eigen poging.
create or replace function public.price_list_import_status(p_import uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare r public.price_list_imports%rowtype;
begin
  select * into r from public.price_list_imports where id = p_import and owner_id = auth.uid();
  if not found then return null; end if;
  if r.status = 'processing' and r.created_at < now() - interval '8 minutes' then
    update public.price_list_imports set status = 'failed', error = coalesce(error, 'stopped')
     where id = r.id and status = 'processing';
    return jsonb_build_object('status', 'failed', 'error', 'stopped', 'result', null);
  end if;
  return jsonb_build_object('status', r.status, 'error', r.error, 'result', r.result);
end;
$function$;
revoke all on function public.price_list_import_status(uuid) from public, anon;
grant execute on function public.price_list_import_status(uuid) to authenticated;

-- De salon meldt na het toevoegen hoeveel behandelingen erbij kwamen (voor het
-- admin-overzicht). Alleen haar eigen poging.
create or replace function public.price_list_import_applied(p_import uuid, p_added integer)
 returns void
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  update public.price_list_imports
     set applied_at = now(), services_added = greatest(0, least(coalesce(p_added, 0), 500))
   where id = p_import and owner_id = auth.uid();
$function$;
revoke all on function public.price_list_import_applied(uuid, integer) from public, anon;
grant execute on function public.price_list_import_applied(uuid, integer) to authenticated;

-- 2. Opslag ---------------------------------------------------------------
-- Privé: geen publieke leesregel. De edge function schrijft met service_role;
-- de beheerder leest via een getekende link (policy hieronder).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('price-lists', 'price-lists', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;
create policy price_lists_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'price-lists' and public.is_admin());

-- 3. Admin ------------------------------------------------------------------
-- Per salon: hoe ver is ze (diensten, eerste afspraak) en de laatste
-- prijslijstpoging. De admin-pagina bepaalt zelf wie "vastloopt".
create or replace function public.admin_onboarding()
 returns table(id uuid, slug text, business_name text, email text, country_code text, created_at timestamptz,
               subscription_status text, plan text, trial_ends_at timestamptz, last_seen timestamptz,
               services integer, visible_services integer, appts integer, first_appt_at timestamptz,
               imports integer, last_import_at timestamptz, last_import_status text,
               last_import_found integer, last_import_added integer)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.slug, p.business_name, p.email, p.country_code, p.created_at,
         p.subscription_status, p.plan, p.trial_ends_at,
         greatest((select u.last_sign_in_at from auth.users u where u.id = p.id),
                  (select max(s.updated_at) from auth.sessions s where s.user_id = p.id)),
         (select count(*)::int from services sv where sv.owner_id = p.id),
         (select count(*)::int from services sv where sv.owner_id = p.id and sv.visible),
         (select count(*)::int from appointments a where a.owner_id = p.id),
         (select min(a.created_at) from appointments a where a.owner_id = p.id),
         (select count(*)::int from price_list_imports i where i.owner_id = p.id),
         li.created_at, li.status, li.services_found, li.services_added
    from profiles p
    left join lateral (
      select i.created_at,
             case when i.status = 'processing' and i.created_at < now() - interval '8 minutes' then 'failed' else i.status end as status,
             i.services_found, i.services_added
        from price_list_imports i where i.owner_id = p.id
       order by i.created_at desc limit 1
    ) li on true
   where not p.is_demo and p.deactivated_at is null
   order by p.created_at desc;
end;
$function$;
revoke all on function public.admin_onboarding() from public, anon;
grant execute on function public.admin_onboarding() to authenticated;

create or replace function public.admin_price_list_imports()
 returns table(id uuid, owner_id uuid, business_name text, slug text, created_at timestamptz, status text,
               files jsonb, error text, model text, services_found integer, services_added integer,
               applied_at timestamptz, input_tokens integer, output_tokens integer)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  -- Na 8 minuten nog 'processing' = gestopt (zie price_list_import_status).
  select i.id, i.owner_id, p.business_name, p.slug, i.created_at,
         case when i.status = 'processing' and i.created_at < now() - interval '8 minutes' then 'failed' else i.status end,
         i.files,
         case when i.status = 'processing' and i.created_at < now() - interval '8 minutes' then coalesce(i.error, 'stopped') else i.error end,
         i.model,
         i.services_found, i.services_added, i.applied_at, i.input_tokens, i.output_tokens
    from price_list_imports i
    join profiles p on p.id = i.owner_id
   where not p.is_demo
   order by i.created_at desc
   limit 200;
end;
$function$;
revoke all on function public.admin_price_list_imports() from public, anon;
grant execute on function public.admin_price_list_imports() to authenticated;

-- 4. Verwijderen van een salon: ook de prijslijsten in storage --------------
do $prep$
declare
  d text := pg_get_functiondef('public.admin_salon_delete_prepare(uuid, uuid)'::regprocedure);
  n text;
begin
  n := replace(d, $s$o.bucket_id in ('business-images', 'service-photos')$s$,
                  $s$o.bucket_id in ('business-images', 'service-photos', 'price-lists')$s$);
  if n = d then raise exception 'admin_salon_delete_prepare: bucketlijst niet gevonden'; end if;
  execute n;
end
$prep$;
