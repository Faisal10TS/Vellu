-- Admin, tabblad Salons: "Last activity" was MAX(appointments.created_at), dus
-- de laatste nieuwe afspraak, niet wanneer de eigenaar Vellu gebruikte
-- (Faisal 14-10-2026: "is the last activity thing accurate?"). Honeysets stond
-- op "23d ago" terwijl ze de dag ervoor nog inlogden om op te zeggen; nieuwe
-- salons die volop inrichtten stonden op "—". Nu twee kolommen:
--   last_activity (ongewijzigd, in de app "Last booking") en
--   last_seen: laatste keer dat de EIGENAAR de app open had = de nieuwste
--   sessie-verversing (auth.sessions.updated_at, ververst ongeveer elk uur
--   zolang de app openstaat) of de laatste inlog, wat het laatst was.
-- Uitloggen wist de sessie; dan valt last_seen terug op de laatste inlog.
-- Teamleden tellen niet mee (eigen accounts). Nieuwe kolom = ander
-- returntype, dus drop + create en de rechten opnieuw zoals ze waren.
drop function if exists public.admin_salons_list();
create function public.admin_salons_list()
 returns table(id uuid, slug text, business_name text, email text, city text, plan text, plan_expires_at timestamptz,
               created_at timestamptz, staff_count integer, appt_count integer, completed_count integer, upcoming_count integer,
               total_revenue numeric, last_activity timestamptz, google_connected boolean, referred_by uuid, referral_code text,
               last_seen timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select
    p.id, p.slug, p.business_name, p.email, p.city,
    p.plan, p.plan_expires_at, p.created_at,
    (select count(*)::int from staff_members sm where sm.owner_id = p.id),
    (select count(*)::int from appointments a1 where a1.owner_id = p.id),
    (select count(*)::int from appointments a2 where a2.owner_id = p.id and a2.status = 'completed'),
    (select count(*)::int from appointments a3 where a3.owner_id = p.id and a3.status = 'confirmed' and a3.date >= current_date),
    (select coalesce(sum(a4.service_price), 0) from appointments a4 where a4.owner_id = p.id and a4.status = 'completed'),
    (select max(a5.created_at) from appointments a5 where a5.owner_id = p.id),
    coalesce(p.google_calendar_connected, false),
    p.referred_by, p.referral_code,
    greatest((select u.last_sign_in_at from auth.users u where u.id = p.id),
             (select max(s.updated_at) from auth.sessions s where s.user_id = p.id))
  from profiles p
  where not p.is_demo
  order by p.created_at desc;
end;
$function$;
revoke all on function public.admin_salons_list() from public, anon;
grant execute on function public.admin_salons_list() to authenticated, service_role;
