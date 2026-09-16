-- Beoordeel Vellu per mail (Faisal 16-09-2026): de enquête staat niet in de
-- app maar op een eigen pagina vellu.cc/beoordeel/<token>, waar de salon via
-- een mail van Faisal naartoe gaat. Per salon één uitnodiging met een eigen
-- token (blijft werken om het antwoord later te wijzigen).
-- Verzendopdrachten (test / dry_run / send) staan als rij in
-- app_rating_send_jobs: de edge function send-rating-request voert alleen een
-- opdracht uit die bestaat, nog niet gestart is en waarvan het geheim klopt.
-- Zo is er geen aparte sleutel nodig en blijft er een logboek van elke
-- verzending over.

create table public.app_rating_invites (
  owner_id   uuid primary key references public.profiles(id) on delete cascade,
  token      text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  sent_count integer not null default 0,
  opened_at  timestamptz
);
comment on table public.app_rating_invites is 'Uitnodiging per salon om Vellu te beoordelen: token voor vellu.cc/beoordeel/<token>, verzend- en openstand.';
alter table public.app_rating_invites enable row level security;
revoke all on public.app_rating_invites from anon, authenticated;

create table public.app_rating_send_jobs (
  id           uuid primary key default gen_random_uuid(),
  secret       text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  mode         text not null check (mode in ('test', 'dry_run', 'send')),
  test_to      text,
  only_owners  uuid[],
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  result       jsonb
);
comment on table public.app_rating_send_jobs is 'Verzendopdrachten voor de beoordelingsmail (edge function send-rating-request); één opdracht = één uitvoering.';
alter table public.app_rating_send_jobs enable row level security;
revoke all on public.app_rating_send_jobs from anon, authenticated;

-- Pagina: gegevens bij een token (salonnaam, land voor de taal, eerder
-- antwoord). Zet opened_at bij de eerste keer openen.
create or replace function public.app_rating_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if p_token is null or length(p_token) < 16 then return null; end if;
  update public.app_rating_invites set opened_at = coalesce(opened_at, now()) where token = p_token;
  select jsonb_build_object(
    'business_name', p.business_name,
    'country_code', p.country_code,
    'existing', (select jsonb_build_object('rating', r.rating, 'liked', r.liked, 'missing', r.missing, 'allow_public', r.allow_public, 'updated_at', r.updated_at)
                 from public.app_ratings r where r.owner_id = i.owner_id)
  ) into v
  from public.app_rating_invites i
  join public.profiles p on p.id = i.owner_id
  where i.token = p_token;
  return v;
end $$;
grant execute on function public.app_rating_invite(text) to anon, authenticated;

-- Pagina: antwoord opslaan (nieuw of bijgewerkt). published blijft staan;
-- de trigger app_ratings_touch zet het uit zodra allow_public uitgaat.
create or replace function public.submit_app_rating(p_token text, p_rating integer, p_liked text, p_missing text, p_allow_public boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid; v_row public.app_ratings;
begin
  select owner_id into v_owner from public.app_rating_invites where token = p_token;
  if v_owner is null then raise exception 'invalid_token'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'invalid_rating'; end if;
  insert into public.app_ratings (owner_id, rating, liked, missing, allow_public)
  values (v_owner, p_rating,
          nullif(left(btrim(coalesce(p_liked, '')), 400), ''),
          nullif(left(btrim(coalesce(p_missing, '')), 400), ''),
          coalesce(p_allow_public, false))
  on conflict (owner_id) do update
    set rating = excluded.rating, liked = excluded.liked, missing = excluded.missing, allow_public = excluded.allow_public
  returning * into v_row;
  return jsonb_build_object('rating', v_row.rating, 'liked', v_row.liked, 'missing', v_row.missing, 'allow_public', v_row.allow_public, 'updated_at', v_row.updated_at);
end $$;
grant execute on function public.submit_app_rating(text, integer, text, text, boolean) to anon, authenticated;

-- Beheer: wie is uitgenodigd, wie heeft de pagina geopend, wie heeft geantwoord.
create or replace function public.admin_rating_invites()
returns table(owner_id uuid, business_name text, email text, sent_at timestamptz, sent_count integer, opened_at timestamptz, answered_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select i.owner_id, p.business_name, coalesce(p.salon_email, p.email), i.sent_at, i.sent_count, i.opened_at, r.updated_at
  from public.app_rating_invites i
  join public.profiles p on p.id = i.owner_id
  left join public.app_ratings r on r.owner_id = i.owner_id
  order by i.sent_at desc nulls last, p.business_name;
end $$;
grant execute on function public.admin_rating_invites() to authenticated;
