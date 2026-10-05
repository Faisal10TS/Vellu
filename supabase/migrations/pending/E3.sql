-- E3 (05-10-2026): billing-webhook, support-chat en translate-text.
-- Pending: de orchestrator voegt dit samen in één migratie. Idempotent.
-- VOLGORDE: deze SQL vóór de nieuwe versies van mollie-webhook, support-chat en
-- translate-text deployen (de functies gebruiken de kolommen en rpc's hieronder;
-- mollie-webhook schrijft claimed_at bij elke gebeurtenis).

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
  'Wanneer mollie-webhook deze gebeurtenis in behandeling nam (claim, 3 minuten geldig). Leeg op een uitkomstrij = rij van de webhookversie van vóór 05-10-2026 (toen al afgehandeld).';
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
