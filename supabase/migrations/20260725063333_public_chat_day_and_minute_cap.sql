-- The per-IP rate limit on the public chat keys on X-Forwarded-For, which is
-- spoofable on a verify_jwt=false endpoint (and the in-memory map is per-instance).
-- So burst control must be GLOBAL and DB-backed. Replace the day-only counter
-- with a generic bucketed counter that tracks BOTH a per-UTC-day bucket (wallet
-- cap) and a per-minute bucket (burst cap). Header spoofing can't bypass either.

drop function if exists public.bump_public_chat_usage();
drop table if exists public.public_chat_usage;

create table public.public_chat_usage (
  bucket text primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Locked down: only the edge function (service_role) ever touches this.
alter table public.public_chat_usage enable row level security;

-- Atomically bump today's daily bucket AND the current-minute bucket; return both
-- counts. Prunes stale minute buckets (once per new minute) so the table stays tiny.
create or replace function public.bump_public_chat_usage()
returns table(day_count integer, minute_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  d_key text := 'day:' || to_char((now() at time zone 'utc'), 'YYYY-MM-DD');
  m_key text := 'min:' || to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI');
  d_count integer;
  m_count integer;
begin
  insert into public.public_chat_usage (bucket, count) values (d_key, 1)
    on conflict (bucket) do update set count = public_chat_usage.count + 1, updated_at = now()
    returning count into d_count;

  insert into public.public_chat_usage (bucket, count) values (m_key, 1)
    on conflict (bucket) do update set count = public_chat_usage.count + 1, updated_at = now()
    returning count into m_count;

  -- Only when a fresh minute bucket is created (m_count = 1), sweep old minute
  -- rows so we never run the delete on the hot path more than once per minute.
  if m_count = 1 then
    delete from public.public_chat_usage
      where bucket like 'min:%' and updated_at < now() - interval '2 hours';
  end if;

  return query select d_count, m_count;
end;
$$;

-- Supabase grants EXECUTE to anon/authenticated via default privileges; strip
-- those so only the edge function (service_role) can bump the counters.
revoke all on function public.bump_public_chat_usage() from public;
revoke execute on function public.bump_public_chat_usage() from anon, authenticated;
grant execute on function public.bump_public_chat_usage() to service_role;