-- Mailplafond per salon voor mails die de app (een ingelogde eigenaar of
-- medewerker) via send-emails laat versturen (audit 05-10-2026, zwakke plek 2,
-- 12-11-2026).
--
-- Aanmelden is open en een eigenaar mag afspraken met elk e-mailadres
-- aanmaken. Daarna kon ze send-emails onbeperkt bevestigingen, wijzigingen en
-- facturen naar die adressen laten sturen: Vellu als spamrelais, met onze
-- afzender. Nu telt send-emails elke aanvraag met een login en weigert hij
-- boven het plafond (429 mail_limit). Mails van de server zelf (boekingen via
-- de boekingspagina, herinneringen, crons) tellen niet mee.
--
-- Plafond: 120 per uur en 400 per 24 uur per salon; voor een salon die korter
-- dan 7 dagen bestaat 30 per uur en 100 per 24 uur. Ter vergelijking, de
-- drukste salons maakten in de afgelopen 120 dagen hooguit 25 afspraken op één
-- dag en 16 in één uur.

create table if not exists public.email_send_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);
create index if not exists email_send_log_owner_sent_idx on public.email_send_log (owner_id, sent_at desc);
alter table public.email_send_log enable row level security;
revoke all on public.email_send_log from public, anon, authenticated;
grant select, insert, delete on public.email_send_log to service_role;

-- Telt en boekt in één keer, onder een slot per salon: twee aanvragen tegelijk
-- kunnen het plafond zo niet samen passeren. Geeft 'ok', 'hour' of 'day'.
-- Ruimt rijen ouder dan 2 dagen van deze salon meteen op.
create or replace function public.claim_salon_email(p_owner uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_new boolean;
  v_hour integer;
  v_day integer;
begin
  if p_owner is null then return 'ok'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salon-mail:' || p_owner::text, 0));
  select coalesce(p.created_at > now() - interval '7 days', false) into v_new
    from public.profiles p where p.id = p_owner;
  select count(*) filter (where l.sent_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day
    from public.email_send_log l
   where l.owner_id = p_owner and l.sent_at > now() - interval '24 hours';
  if v_hour >= (case when coalesce(v_new, false) then 30 else 120 end) then return 'hour'; end if;
  if v_day >= (case when coalesce(v_new, false) then 100 else 400 end) then return 'day'; end if;
  insert into public.email_send_log (owner_id, kind) values (p_owner, left(coalesce(p_kind, ''), 40));
  delete from public.email_send_log l where l.owner_id = p_owner and l.sent_at < now() - interval '2 days';
  return 'ok';
end;
$function$;
revoke all on function public.claim_salon_email(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_salon_email(uuid, text) to service_role;
