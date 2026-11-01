-- Activatiemails (01-11-2026). Faisal koos "Automatic emails" na de analyse
-- dat 7 van de 14 salons vastliepen: drie zetten nooit een dienst op hun
-- pagina, drie wel maar kregen geen klant aan het boeken. De edge function
-- send-activation-nudges mailt zo'n salon één keer per soort:
--   no_services  2 dagen na aanmelden nog geen zichtbare dienst
--   no_bookings  4 dagen na aanmelden wel diensten, hooguit één afspraak
-- De dagelijkse cronjob komt in een aparte migratie, pas na Faisals akkoord
-- op de teksten en een proefmail.

-- Logboek: precies één rij per (salon, soort) = hooguit één mail per soort.
create table public.activation_nudges (
  owner_id  uuid not null references public.profiles(id) on delete cascade,
  kind      text not null check (kind in ('no_services', 'no_bookings')),
  sent_at   timestamptz not null default now(),
  primary key (owner_id, kind)
);
comment on table public.activation_nudges is 'Verstuurde activatiemails (edge function send-activation-nudges): één rij per salon per soort, zodat elke mail hooguit één keer gaat.';
alter table public.activation_nudges enable row level security;
revoke all on public.activation_nudges from anon, authenticated;

-- Opdrachten voor test / dry_run / send (zelfde opzet als app_source_send_jobs):
-- insert ... returning id, secret, dan POST { job_id, secret } naar de functie.
create table public.activation_nudge_jobs (
  id           uuid primary key default gen_random_uuid(),
  secret       text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  mode         text not null check (mode in ('test', 'dry_run', 'send')),
  test_to      text,
  test_lang    text not null default 'en' check (test_lang in ('nl', 'en')),
  only_owners  uuid[],
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  result       jsonb
);
comment on table public.activation_nudge_jobs is 'Opdrachten voor de activatiemails (edge function send-activation-nudges); één opdracht = één uitvoering.';
alter table public.activation_nudge_jobs enable row level security;
revoke all on public.activation_nudge_jobs from anon, authenticated;
