-- Beoordeel Vellu (Faisal 16-09-2026): korte enquête voor saloneigenaren.
-- Eén rij per salon (later bij te werken): cijfer 1-5, wat werkt goed, wat
-- mist. Het gemiddelde zonder demo-salons mag op vellu.cc staan; de naam en
-- de tekst van een salon alleen als de salon dat aanvinkt (allow_public) én
-- Vellu het daarna publiceert (published, alleen via de beheerdersfunctie).

create table public.app_ratings (
  owner_id     uuid primary key references public.profiles(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  liked        text check (liked is null or char_length(liked) <= 400),
  missing      text check (missing is null or char_length(missing) <= 400),
  allow_public boolean not null default false,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.app_ratings is 'Beoordeling van Vellu door de saloneigenaar: cijfer 1-5 plus toelichting, één rij per salon.';
comment on column public.app_ratings.allow_public is 'Salon vinkt aan dat naam en tekst op vellu.cc mogen staan.';
comment on column public.app_ratings.published is 'Door Vellu (beheerder) gekozen om op vellu.cc te tonen; kan alleen aan als allow_public aan staat.';

alter table public.app_ratings enable row level security;
create policy app_ratings_select_own on public.app_ratings for select to authenticated using (owner_id = auth.uid());
create policy app_ratings_insert_own on public.app_ratings for insert to authenticated with check (owner_id = auth.uid());
create policy app_ratings_update_own on public.app_ratings for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- De eigenaar mag alles zetten behalve published (dat is aan Vellu).
revoke all on public.app_ratings from anon, authenticated;
grant select on public.app_ratings to authenticated;
grant insert (owner_id, rating, liked, missing, allow_public) on public.app_ratings to authenticated;
grant update (rating, liked, missing, allow_public) on public.app_ratings to authenticated;

-- updated_at bijhouden; trekt de salon de toestemming in, dan gaat de
-- publicatie op de site automatisch uit.
create or replace function public.app_ratings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if not new.allow_public then new.published := false; end if;
  return new;
end $$;
create trigger app_ratings_touch before insert or update on public.app_ratings
  for each row execute function public.app_ratings_touch();

-- Publiek gemiddelde voor vellu.cc (zonder demo-salons). Geen namen.
create or replace function public.app_rating_summary()
returns table(avg_rating numeric, rating_count integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select round(avg(r.rating)::numeric, 1), count(*)::int
  from public.app_ratings r
  join public.profiles p on p.id = r.owner_id
  where not coalesce(p.is_demo, false);
$$;
grant execute on function public.app_rating_summary() to anon, authenticated;

-- Publieke citaten: alleen met toestemming van de salon én gepubliceerd door
-- Vellu. Zelfde patroon als public_reviews (view, geen RLS-doorval).
create view public.public_app_ratings as
  select r.owner_id, r.rating, r.liked, p.business_name, p.city, p.country_code, r.updated_at
  from public.app_ratings r
  join public.profiles p on p.id = r.owner_id
  where r.allow_public and r.published and not coalesce(p.is_demo, false);
grant select on public.public_app_ratings to anon, authenticated;

-- Beheer (vellu.cc/admin): alle beoordelingen lezen en publiceren.
create or replace function public.admin_app_ratings()
returns table(owner_id uuid, business_name text, slug text, city text, country_code text, is_demo boolean,
              rating smallint, liked text, missing text, allow_public boolean, published boolean,
              created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select r.owner_id, p.business_name, p.slug, p.city, p.country_code, coalesce(p.is_demo, false),
         r.rating, r.liked, r.missing, r.allow_public, r.published, r.created_at, r.updated_at
  from public.app_ratings r
  join public.profiles p on p.id = r.owner_id
  order by r.updated_at desc;
end $$;
grant execute on function public.admin_app_ratings() to authenticated;

create or replace function public.admin_set_app_rating_published(p_owner_id uuid, p_published boolean)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ok boolean;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update public.app_ratings set published = (p_published and allow_public)
  where owner_id = p_owner_id
  returning published into v_ok;
  return coalesce(v_ok, false);
end $$;
grant execute on function public.admin_set_app_rating_published(uuid, boolean) to authenticated;
