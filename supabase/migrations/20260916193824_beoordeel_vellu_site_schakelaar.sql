-- Beoordeel Vellu (Faisal 16-09-2026): "when i get the answer they won't go
-- public anywhere right, i just get them in the admin tab". Antwoorden zijn
-- nooit publiek; ook het gemiddelde en gepubliceerde citaten komen pas op
-- vellu.cc als Vellu de schakelaar in het beheer aanzet (standaard UIT).
create table public.app_rating_settings (
  id           boolean primary key default true check (id),
  show_on_site boolean not null default false,
  updated_at   timestamptz not null default now()
);
comment on table public.app_rating_settings is 'Eén rij: staat het gemiddelde (en gepubliceerde citaten) van de salonbeoordelingen op vellu.cc? Standaard uit.';
insert into public.app_rating_settings (id, show_on_site) values (true, false);
alter table public.app_rating_settings enable row level security;
revoke all on public.app_rating_settings from anon, authenticated;

-- Publiek gemiddelde: alleen met de schakelaar aan, anders 0 beoordelingen.
create or replace function public.app_rating_summary()
returns table(avg_rating numeric, rating_count integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select round(avg(r.rating)::numeric, 1), count(*)::int
  from public.app_ratings r
  join public.profiles p on p.id = r.owner_id
  where not coalesce(p.is_demo, false)
    and exists (select 1 from public.app_rating_settings s where s.show_on_site);
$$;

-- Publieke citaten: idem, plus toestemming van de salon én publicatie door Vellu.
create or replace view public.public_app_ratings as
  select r.owner_id, r.rating, r.liked, p.business_name, p.city, p.country_code, r.updated_at
  from public.app_ratings r
  join public.profiles p on p.id = r.owner_id
  where r.allow_public and r.published and not coalesce(p.is_demo, false)
    and exists (select 1 from public.app_rating_settings s where s.show_on_site);

-- Beheer: stand lezen en zetten.
create or replace function public.admin_rating_site_visibility()
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v boolean;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select show_on_site into v from public.app_rating_settings where id;
  return coalesce(v, false);
end $$;
grant execute on function public.admin_rating_site_visibility() to authenticated;

create or replace function public.admin_set_rating_site_visibility(p_on boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v boolean;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update public.app_rating_settings set show_on_site = coalesce(p_on, false), updated_at = now() where id
  returning show_on_site into v;
  return coalesce(v, false);
end $$;
grant execute on function public.admin_set_rating_site_visibility(boolean) to authenticated;
