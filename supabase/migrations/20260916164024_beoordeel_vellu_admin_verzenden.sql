-- Beoordeel Vellu (16-09-2026): Faisal verstuurt de beoordelingsmail zelf
-- vanuit vellu.cc/admin → Ratings. De uitnodigingslijst daar moet ALLE
-- actieve niet-demo salons tonen (ook wie nog geen uitnodiging heeft), met
-- verzonden / geopend / beantwoord, zodat per salon te zien is wie nog moet.
create or replace function public.admin_rating_invites()
returns table(owner_id uuid, business_name text, email text, sent_at timestamptz, sent_count integer, opened_at timestamptz, answered_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.business_name, coalesce(p.salon_email, p.email), i.sent_at, coalesce(i.sent_count, 0), i.opened_at, r.updated_at
  from public.profiles p
  left join public.app_rating_invites i on i.owner_id = p.id
  left join public.app_ratings r on r.owner_id = p.id
  where not coalesce(p.is_demo, false)
    and p.subscription_status in ('active', 'trialing')
  order by i.sent_at desc nulls last, p.business_name;
end $$;
