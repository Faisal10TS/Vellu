-- Klantrijen per salon (audit punt 5). clients was één rij per e-mailadres
-- voor het hele platform: wie een adres kende, kon via get_or_create_client het
-- id krijgen, een afspraak koppelen en zo die rij lezen. Nu hoort elke rij bij
-- één salon (owner_id) en ziet een salon alleen haar eigen rijen.

alter table public.clients
  add column owner_id uuid references public.profiles(id) on delete cascade;

-- Eén adres mag nu per salon een eigen rij hebben.
alter table public.clients drop constraint clients_email_key;

-- 1. Elke rij met afspraken: de salon van de eerste afspraak.
with eerste as (
  select distinct on (a.client_id) a.client_id, a.owner_id
    from public.appointments a
   where a.client_id is not null
   order by a.client_id, a.created_at, a.id
)
update public.clients c
   set owner_id = e.owner_id
  from eerste e
 where e.client_id = c.id;

-- 2. Boekte hetzelfde adres ook bij een andere salon: die salon krijgt een
-- kopie van de rij en haar afspraken wijzen voortaan naar die kopie.
do $$
declare
  r record;
  v_new uuid;
begin
  for r in
    select distinct a.client_id, a.owner_id
      from public.appointments a
      join public.clients c on c.id = a.client_id
     where a.owner_id is distinct from c.owner_id
  loop
    insert into public.clients (email, first_name, last_name, phone, created_at, last_visit,
                                no_show_count, allergies, birthday, owner_id)
    select email, first_name, last_name, phone, created_at, last_visit,
           no_show_count, allergies, birthday, r.owner_id
      from public.clients
     where id = r.client_id
    returning id into v_new;
    update public.appointments
       set client_id = v_new
     where client_id = r.client_id
       and owner_id = r.owner_id;
  end loop;
end $$;

-- Rijen zonder afspraak houden owner_id leeg: geen salon ziet ze.
create unique index clients_owner_email_key
  on public.clients (owner_id, lower(email))
  where owner_id is not null;

comment on column public.clients.owner_id is
  'Salon waar deze klantrij bij hoort. Eén rij per salon per e-mailadres; leeg = van geen salon (niet zichtbaar).';

-- Lezen: alleen de eigen salon.
drop policy if exists clients_select_visited_salon on public.clients;
create policy clients_select_own_salon on public.clients
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Interne hulpfunctie: de klantrij van één salon zoeken of maken. Bestaat de
-- rij al, dan alleen lege velden aanvullen (zelfde regel als book-appointment).
create or replace function public.client_for_salon(
  p_owner uuid, p_email text, p_first text default '', p_last text default '',
  p_phone text default null, p_allergies text default null, p_birthday date default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_owner is null then raise exception 'owner_required' using errcode = '22023'; end if;
  if v_email = '' then raise exception 'email_required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('client:' || p_owner::text || ':' || v_email, 0));
  select id into v_id from public.clients where owner_id = p_owner and lower(email) = v_email limit 1;
  if v_id is null then
    insert into public.clients (owner_id, email, first_name, last_name, phone, allergies, birthday, last_visit)
    values (p_owner, v_email, coalesce(nullif(btrim(p_first), ''), v_email), coalesce(btrim(p_last), ''),
            nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_allergies, '')), ''),
            p_birthday, now())
    returning id into v_id;
  else
    update public.clients set
      phone = case when nullif(btrim(phone), '') is null
                   then nullif(btrim(coalesce(p_phone, '')), '') else phone end,
      allergies = case when nullif(btrim(allergies), '') is null
                       then nullif(btrim(coalesce(p_allergies, '')), '') else allergies end,
      birthday = coalesce(birthday, p_birthday)
    where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.client_for_salon(uuid, text, text, text, text, text, date) from public, anon, authenticated;

-- Zelfde handtekening als voorheen; de salon is die van de aanroeper: de
-- eigenaar zelf, of de salon waar zij actief teamlid is.
create or replace function public.get_or_create_client(
  p_email text, p_first text default '', p_last text default '',
  p_phone text default null, p_allergies text default null, p_birthday date default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    v_owner := auth.uid();
  else
    select sm.owner_id into v_owner
      from public.staff_members sm
     where sm.user_id = auth.uid() and sm.active is not false
     order by sm.created_at
     limit 1;
  end if;
  if v_owner is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.client_for_salon(v_owner, p_email, p_first, p_last, p_phone, p_allergies, p_birthday);
end $$;
revoke execute on function public.get_or_create_client(text, text, text, text, text, date) from anon;
