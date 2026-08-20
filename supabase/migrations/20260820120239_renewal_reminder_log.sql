-- 2026-08-19 — Dedupe voor de jaarlijkse verlengingsherinnering
--
-- send-renewal-reminder draait dagelijks en waarschuwt een jaarabonnee een week
-- voordat zijn abonnement afloopt. Zonder deze tabel zou hij dat elke dag in dat
-- venster opnieuw doen. Eén rij per (eigenaar, vervaldatum): de eerste
-- herinnering slaagt met de insert, elke volgende botst op de primary key en
-- wordt overgeslagen. Zelfde patroon als salon_digest_log.
--
-- plan_expires_at zit in de sleutel, niet created_at: verlengt de salon en
-- schuift de vervaldatum een jaar op, dan is dat een nieuwe periode die volgend
-- jaar gewoon weer een herinnering mag krijgen.

create table if not exists public.renewal_reminder_log (
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  plan_expires_at timestamptz not null,
  sent_at         timestamptz not null default now(),
  primary key (owner_id, plan_expires_at)
);

-- Alleen de service-role (de cron) raakt deze tabel aan. RLS aan, geen policy:
-- dat weigert standaard iedereen behalve service_role, precies zoals bij de
-- andere log-tabellen.
alter table public.renewal_reminder_log enable row level security;
revoke all on public.renewal_reminder_log from anon, authenticated;
