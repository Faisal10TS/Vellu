-- Web-push-abonnementen (browser/PWA) per ingelogde gebruiker (eigenaar, later
-- ook medewerker). Eén rij per apparaat/browser; endpoint is wereldwijd uniek.
-- Geschreven door de frontend (eigen rijen), gelezen door de edge function
-- send-push-notification (service role), die dode abonnementen (404/410 van
-- de push-dienst) zelf opruimt.
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh_key    text not null,
  auth_key      text not null,
  device_label  text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- Alleen je eigen abonnementen; service_role omzeilt RLS voor het versturen.
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Nieuwe objecten in public krijgen standaard rechten voor anon; die hoeft hier niets.
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
