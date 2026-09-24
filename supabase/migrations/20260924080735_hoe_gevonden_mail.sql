-- "Hoe heb je Vellu gevonden?"-mail aan nieuwe salons (Faisal 24-09-2026).
-- Zelfde opzet als beoordeel_vellu_per_mail: per salon een verzendstand en
-- een opdrachtentabel die de edge function send-source-request uitvoert
-- (alleen een bestaande, nog niet gestarte opdracht met kloppend geheim),
-- zodat er geen aparte sleutel nodig is en elke verzending gelogd blijft.
-- Antwoorden komen niet in de database: de knoppen in de mail zijn mailto-
-- links, het antwoord landt in mirahventures@vellu.cc.

create table public.app_source_requests (
  owner_id   uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  sent_count integer not null default 0
);
comment on table public.app_source_requests is 'Per salon: is de "Hoe heb je Vellu gevonden?"-mail verstuurd (edge function send-source-request). Antwoorden komen per mail binnen op mirahventures@vellu.cc.';
alter table public.app_source_requests enable row level security;
revoke all on public.app_source_requests from anon, authenticated;

create table public.app_source_send_jobs (
  id           uuid primary key default gen_random_uuid(),
  secret       text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  mode         text not null check (mode in ('test', 'dry_run', 'send')),
  test_to      text,
  test_lang    text not null default 'nl' check (test_lang in ('nl', 'en')),
  only_owners  uuid[],
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  result       jsonb
);
comment on table public.app_source_send_jobs is 'Verzendopdrachten voor de "Hoe heb je Vellu gevonden?"-mail (edge function send-source-request); één opdracht = één uitvoering.';
alter table public.app_source_send_jobs enable row level security;
revoke all on public.app_source_send_jobs from anon, authenticated;
