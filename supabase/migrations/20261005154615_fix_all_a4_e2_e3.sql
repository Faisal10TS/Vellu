-- Fix-all audit 05-10-2026: E2.sql + E3.sql.
-- Samengesteld uit supabase/migrations/pending/*.sql (zie de commitgeschiedenis).
set local lock_timeout = '10s';

-- E2: cron_health kent naast 'success' en 'error' ook 'degraded' (audit E2-09).
--
-- De cron-functies (send-reminders, send-followups, send-rebook-nudge,
-- send-birthday-emails) schreven altijd 'success', ook als elke mail mislukte:
-- precies de stille storing van de zomer, en cron-watchdog zag niets. Nu
-- schrijven ze 'error' als ALLE verzendpogingen mislukten en 'degraded' als een
-- deel mislukte. De bestaande check liet alleen 'success' en 'error' toe; een
-- 'degraded'-rij zou stil geweigerd worden (de functies vangen de fout af) en de
-- watchdog zou de job dan als "stale" melden. cron-watchdog meldt 'degraded'
-- als gedeeltelijke fout.
--
-- Volgorde bij uitrol: deze migratie vóór de nieuwe versies van de functies.

alter table public.cron_health drop constraint if exists cron_health_status_check;
alter table public.cron_health
  add constraint cron_health_status_check
  check (status = any (array['success'::text, 'error'::text, 'degraded'::text]));


-- E3 (05-10-2026): billing-webhook, support-chat, translate-text en de daglimiet
-- voor uitnodigingsmails aan teamleden.
-- Pending: de orchestrator voegt dit samen in één migratie. Idempotent.
-- VOLGORDE: eerst de samengevoegde migratie (deze SQL + DB.sql), dan E2
-- send-emails (mailtype staff_invite), dan pas de E3-functies. Wie wat nodig heeft:
--  - mollie-webhook: claimed_at/outcome/processed_at hieronder (schrijft claimed_at
--    bij elke gebeurtenis) + grant_referral_credit (DB.sql);
--  - support-chat, translate-text: tabellen en rpc's hieronder;
--  - change-plan: profiles.plan_change_started_at (DB.sql), anders 500 lock_failed
--    bij elke planwissel;
--  - send-renewal-reminder: cron_secret_ok + de cron-job met x-cron-secret
--    (DB.sql), anders 401 bij elke dagelijkse run;
--  - create-staff-account: staff_members.invite_token_hash/invite_expires_at en
--    handle_new_user met user_metadata.staff_invite (DB.sql), staff_invite_usage
--    hieronder, en het mailtype staff_invite in send-emails (E2);
--  - check-pending-payments (E1) leest processed_at hieronder.

-- ── 1. payment_events: verwerkt pas na alle bijwerkingen (E3-11) ──────────
-- mollie-webhook claimt een gebeurtenis (claimed_at), bewaart wat hij berekende
-- (outcome: periode, profielwijziging, abonnement-id) en zet processed_at pas
-- als alles gelukt is. Een herhaling (Mollie of check-pending-payments) gaat
-- door zolang processed_at leeg is en past exact dezelfde outcome toe.
alter table public.payment_events add column if not exists processed_at timestamptz;
alter table public.payment_events add column if not exists claimed_at timestamptz;
alter table public.payment_events add column if not exists outcome jsonb;
comment on column public.payment_events.processed_at is
  'Gezet door mollie-webhook als alle bijwerkingen van deze gebeurtenis gelukt zijn. Leeg = (nog) niet afgerond; check-pending-payments trapt de webhook dan opnieuw aan.';
comment on column public.payment_events.claimed_at is
  'Wanneer mollie-webhook deze gebeurtenis in behandeling nam (claim, 7 minuten geldig). Leeg op een uitkomstrij = rij van de webhookversie van vóór 05-10-2026 (toen al afgehandeld).';
comment on column public.payment_events.outcome is
  'Wat mollie-webhook bij de eerste poging berekende (periode, profielwijziging, abonnement-id), zodat een herhaling exact hetzelfde toepast.';
-- Alles van vóór deze wijziging is door de oude webhook al afgehandeld.
update public.payment_events set processed_at = created_at where processed_at is null;

-- ── 2. Support-chat, eigenaarsmodus: daglimiet per gebruiker (E3-12) ──────
create table if not exists public.support_chat_user_usage (
  user_id uuid not null,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table public.support_chat_user_usage enable row level security;
revoke all on table public.support_chat_user_usage from anon, authenticated;

-- Telt één bericht voor deze gebruiker op de huidige UTC-dag en geeft zijn
-- dagstand plus het dagtotaal van alle eigenaarsgesprekken terug.
create or replace function public.bump_support_chat_user_usage(p_user_id uuid)
returns table(user_count integer, day_total integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
  v_total integer;
begin
  if p_user_id is null then
    raise exception 'user required';
  end if;
  insert into public.support_chat_user_usage (user_id, day, count) values (p_user_id, v_day, 1)
    on conflict (user_id, day) do update set count = public.support_chat_user_usage.count + 1
    returning count into v_count;
  select coalesce(sum(u.count), 0)::integer into v_total
    from public.support_chat_user_usage u where u.day = v_day;
  -- Eerste bericht van deze gebruiker vandaag: oude dagen opruimen.
  if v_count = 1 then
    delete from public.support_chat_user_usage where day < v_day - 30;
  end if;
  return query select v_count, v_total;
end;
$function$;
revoke all on function public.bump_support_chat_user_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_support_chat_user_usage(uuid) to service_role;

-- ── 3. Support-chat, publieke modus: dagteller per IP (E3-28) ─────────────
-- In de bestaande tabel public_chat_usage, als emmer 'ip:<UTC-dag>:<ip>'.
create or replace function public.bump_public_chat_ip_usage(p_ip text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ip text := left(btrim(coalesce(p_ip, '')), 64);
  v_key text;
  v_count integer;
begin
  if v_ip = '' then
    raise exception 'ip required';
  end if;
  v_key := 'ip:' || to_char((now() at time zone 'utc'), 'YYYY-MM-DD') || ':' || v_ip;
  insert into public.public_chat_usage (bucket, count) values (v_key, 1)
    on conflict (bucket) do update set count = public.public_chat_usage.count + 1, updated_at = now()
    returning count into v_count;
  -- Nieuwe emmer: IP-emmers van eerdere dagen opruimen.
  if v_count = 1 then
    delete from public.public_chat_usage where bucket like 'ip:%' and updated_at < now() - interval '2 days';
  end if;
  return v_count;
end;
$function$;
revoke all on function public.bump_public_chat_ip_usage(text) from public, anon, authenticated;
grant execute on function public.bump_public_chat_ip_usage(text) to service_role;

-- ── 4. translate-text: dagbudget in tekens (E3-13) ────────────────────────
create table if not exists public.translate_usage (
  user_id uuid not null,
  day date not null,
  chars integer not null default 0,
  primary key (user_id, day)
);
alter table public.translate_usage enable row level security;
revoke all on table public.translate_usage from anon, authenticated;

-- Boekt p_chars af van het dagbudget van deze gebruiker (p_user_cap) en van
-- alle gebruikers samen (p_global_cap). true = binnen budget en afgeboekt;
-- false = er gaat niets af en er wordt niet vertaald.
create or replace function public.consume_translate_budget(p_user_id uuid, p_chars integer, p_user_cap integer, p_global_cap integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_total bigint;
  v_new integer;
begin
  if p_user_id is null or p_chars is null or p_user_cap is null or p_global_cap is null then
    return false;
  end if;
  if p_chars <= 0 then
    return true;
  end if;
  if p_chars > p_user_cap then
    return false;
  end if;
  select coalesce(sum(t.chars), 0) into v_total from public.translate_usage t where t.day = v_day;
  if v_total + p_chars > p_global_cap then
    return false;
  end if;
  insert into public.translate_usage (user_id, day, chars) values (p_user_id, v_day, p_chars)
    on conflict (user_id, day) do update set chars = public.translate_usage.chars + excluded.chars
      where public.translate_usage.chars + excluded.chars <= p_user_cap
    returning chars into v_new;
  if v_new is null then
    return false;
  end if;
  -- Eerste vertaling van deze gebruiker vandaag: oude dagen opruimen.
  if v_new = p_chars then
    delete from public.translate_usage where day < v_day - 30;
  end if;
  return true;
end;
$function$;
revoke all on function public.consume_translate_budget(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_translate_budget(uuid, integer, integer, integer) to service_role;

-- ── 5. create-staff-account: uitnodigingsmails per salon per dag ──────────
-- Elke uitnodiging is een mail van Vellu met de salonnaam erin, naar een adres
-- dat de eigenaar zelf invult. De grens van 5 per minuut per IP zit alleen in
-- het geheugen van één functie-instantie; deze teller begrenst per salon per dag.
create table if not exists public.staff_invite_usage (
  owner_id uuid not null,
  day date not null,
  count integer not null default 0,
  primary key (owner_id, day)
);
alter table public.staff_invite_usage enable row level security;
revoke all on table public.staff_invite_usage from anon, authenticated;

-- Telt één uitnodiging voor deze salon op de huidige UTC-dag en geeft de
-- dagstand terug (inclusief deze).
create or replace function public.bump_staff_invite_usage(p_owner_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if p_owner_id is null then
    raise exception 'owner required';
  end if;
  insert into public.staff_invite_usage (owner_id, day, count) values (p_owner_id, v_day, 1)
    on conflict (owner_id, day) do update set count = public.staff_invite_usage.count + 1
    returning count into v_count;
  -- Eerste uitnodiging van deze salon vandaag: oude dagen opruimen.
  if v_count = 1 then
    delete from public.staff_invite_usage where day < v_day - 30;
  end if;
  return v_count;
end;
$function$;
revoke all on function public.bump_staff_invite_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_staff_invite_usage(uuid) to service_role;
