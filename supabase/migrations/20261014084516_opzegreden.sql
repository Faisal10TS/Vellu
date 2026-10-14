-- Opzegreden (14-10-2026). Faisal vroeg waarom Honeysets opzegde en dat was
-- nergens te zien: het opzegvenster vroeg niets en de supportchat bewaart geen
-- gesprekken. Vanaf nu krijgt elke opzegging van een abonnement (cancel-
-- subscription, aan het einde van de periode of meteen) een rij, met de
-- optionele reden die de salon in het opzegvenster koos en een eigen
-- toelichting. Alleen de edge function schrijft (service role); de app leest
-- niets, de admin leest via admin_subscription_cancellations(). Automatisch
-- betalen na de proef uitzetten is geen opzegging en komt hier niet in.
create table public.subscription_cancellations (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  reason text check (reason in ('too_expensive', 'not_enough_bookings', 'missing_feature', 'other_app', 'closing_business', 'other')),
  note text check (char_length(note) <= 500),
  plan text,
  billing_interval text,
  mode text not null check (mode in ('at_period_end', 'immediate')),
  access_until timestamptz
);
create index subscription_cancellations_owner_idx on public.subscription_cancellations (owner_id, created_at desc);
alter table public.subscription_cancellations enable row level security;
revoke all on public.subscription_cancellations from public, anon, authenticated;

-- Opzeggingen van vóór deze tabel (Honeysets, 14-10): een rij zonder reden.
insert into public.subscription_cancellations (owner_id, created_at, plan, billing_interval, mode, access_until)
select p.id, p.cancelled_at, p.plan, p.billing_interval,
       case when p.subscription_status = 'cancelled' and not coalesce(p.cancel_at_period_end, false) then 'immediate' else 'at_period_end' end,
       p.plan_expires_at
  from public.profiles p
 where p.cancelled_at is not null
   and not coalesce(p.is_demo, false);

create or replace function public.admin_subscription_cancellations()
 returns table(id bigint, owner_id uuid, business_name text, created_at timestamptz, reason text, note text,
               plan text, billing_interval text, mode text, access_until timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select c.id, c.owner_id, p.business_name::text, c.created_at, c.reason, c.note,
         c.plan, c.billing_interval, c.mode, c.access_until
    from public.subscription_cancellations c
    join public.profiles p on p.id = c.owner_id
   where not coalesce(p.is_demo, false)
   order by c.created_at desc, c.id desc;
end $function$;
revoke all on function public.admin_subscription_cancellations() from public, anon;
grant execute on function public.admin_subscription_cancellations() to authenticated;
