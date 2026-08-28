-- Telefoon-agenda-abonnement voor medewerkers: eigen feed-token per staff-rij,
-- de tegenhanger van profiles.calendar_feed_token voor de eigenaar. Het token
-- ís de authenticatie van de publieke calendar-feed-functie, dus deze kolom
-- mag NOOIT in de public_staff-view worden opgenomen. Medewerkers muntten hem
-- zelf via hun bestaande self-update-RLS op staff_members (zoals working_hours).
alter table public.staff_members add column if not exists calendar_feed_token text;
create unique index if not exists staff_members_calendar_feed_token_key
  on public.staff_members (calendar_feed_token)
  where calendar_feed_token is not null;
