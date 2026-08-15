-- 2026-08-15 — Salon-digest: dedupe per EIGENAAR in plaats van per dag
--
-- De agenda-mail ("je afspraken voor morgen") werd gededuped met één
-- hartslag-rij per dag: had de eerste run digests gestuurd, dan sloeg elke
-- latere run ALLE salons over — ook een salon wiens eerste afspraak-van-morgen
-- pas ná die run geboekt werd. Met een rij per (eigenaar, dag) is de insert
-- zelf de lock: on conflict do nothing → al gehad vandaag, sla over.
create table if not exists public.salon_digest_log (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  sent_on  date not null,
  primary key (owner_id, sent_on)
);

alter table public.salon_digest_log enable row level security;
-- Geen policies: alleen de service_role (send-reminders) schrijft en leest.
revoke all on public.salon_digest_log from anon, authenticated;
