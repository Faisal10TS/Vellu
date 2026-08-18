-- Public landing-page chatbot: hard global daily cap to protect the API wallet
-- from abuse of the unauthenticated support-chat endpoint. One row per day.
create table if not exists public.public_chat_usage (
  day date primary key,
  count integer not null default 0
);

-- Locked down: only the edge function (service_role) ever touches this. RLS on
-- with no policies denies anon/authenticated by default; service_role bypasses
-- RLS entirely.
alter table public.public_chat_usage enable row level security;

-- Atomically increment today's counter and return the new total.
create or replace function public.bump_public_chat_usage()
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.public_chat_usage (day, count)
  values (current_date, 1)
  on conflict (day) do update set count = public_chat_usage.count + 1
  returning count;
$$;

-- Only the edge function (service_role) may call it.
revoke all on function public.bump_public_chat_usage() from public;
grant execute on function public.bump_public_chat_usage() to service_role;