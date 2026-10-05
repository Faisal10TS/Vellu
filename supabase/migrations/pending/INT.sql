-- Fix-all 05-10-2026, integratie (hoort bij DEEL A, na DB.sql).
--
-- 1. Inactieve teamleden verliezen hun toegang (O7, review van de Team-tab).
--    Tot nu toe keek geen enkele medewerker-policy naar staff_members.active:
--    wie de eigenaar op inactief zette, kon via de API gewoon afspraken,
--    klantgegevens en de wachtlijst blijven lezen tot de rij echt werd
--    verwijderd. staff_salon_profile() en de policies uit DB.sql sectie 3/5
--    eisen het al; hier de twee gedeelde hulpfuncties en de zeven policies die
--    DB.sql niet opnieuw aanmaakt. Zelfde logica als live, alleen
--    "and sm.active is not false" erbij (active is nullable, standaard true).
-- 2. waitlist.notified_at komt van de server: de app zette hem met de klok van
--    het toestel, en send-emails accepteert de "plek vrij"-mail alleen binnen
--    een venster rond de serverklok.

create or replace function public.my_staff_owner_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$ select owner_id from staff_members where user_id = auth.uid() and active is not false $$;

create or replace function public.staff_may_edit_catalog(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from staff_members sm
                  where sm.user_id = auth.uid() and sm.active is not false and sm.owner_id = p_owner)
     and coalesce((select p.staff_can_edit_services from profiles p where p.id = p_owner), true)
$$;

drop policy if exists owner_staff_insert_cancellation_tokens on public.cancellation_tokens;
create policy owner_staff_insert_cancellation_tokens on public.cancellation_tokens
  for insert to authenticated
  with check (exists (select 1 from public.appointments a
                       where a.id = cancellation_tokens.appointment_id
                         and (a.owner_id = auth.uid()
                              or exists (select 1 from public.staff_members sm
                                          where sm.owner_id = a.owner_id and sm.user_id = auth.uid()
                                            and sm.active is not false))));

drop policy if exists owner_staff_select_cancellation_tokens on public.cancellation_tokens;
create policy owner_staff_select_cancellation_tokens on public.cancellation_tokens
  for select to authenticated
  using (exists (select 1 from public.appointments a
                  where a.id = cancellation_tokens.appointment_id
                    and (a.owner_id = auth.uid()
                         or exists (select 1 from public.staff_members sm
                                     where sm.owner_id = a.owner_id and sm.user_id = auth.uid()
                                       and sm.active is not false))));

drop policy if exists owner_staff_update_cancellation_tokens on public.cancellation_tokens;
create policy owner_staff_update_cancellation_tokens on public.cancellation_tokens
  for update to authenticated
  using (exists (select 1 from public.appointments a
                  where a.id = cancellation_tokens.appointment_id
                    and (a.owner_id = auth.uid()
                         or exists (select 1 from public.staff_members sm
                                     where sm.owner_id = a.owner_id and sm.user_id = auth.uid()
                                       and sm.active is not false))))
  with check (exists (select 1 from public.appointments a
                       where a.id = cancellation_tokens.appointment_id
                         and (a.owner_id = auth.uid()
                              or exists (select 1 from public.staff_members sm
                                          where sm.owner_id = a.owner_id and sm.user_id = auth.uid()
                                            and sm.active is not false))));

drop policy if exists client_no_shows_owner_select on public.client_no_shows;
create policy client_no_shows_owner_select on public.client_no_shows
  for select to public
  using (owner_id = auth.uid()
         or owner_id in (select staff_members.owner_id from public.staff_members
                          where staff_members.user_id = auth.uid() and staff_members.active is not false));

drop policy if exists "Staff delete own blocks" on public.staff_day_overrides;
create policy "Staff delete own blocks" on public.staff_day_overrides
  for delete to authenticated
  using (exists (select 1 from public.staff_members sm
                  where sm.id = staff_day_overrides.staff_id and sm.user_id = auth.uid()
                    and sm.active is not false));

drop policy if exists "Staff insert own blocks" on public.staff_day_overrides;
create policy "Staff insert own blocks" on public.staff_day_overrides
  for insert to authenticated
  with check (exists (select 1 from public.staff_members sm
                       where sm.id = staff_day_overrides.staff_id and sm.user_id = auth.uid()
                         and sm.active is not false
                         and sm.owner_id = staff_day_overrides.owner_id));

drop policy if exists waitlist_staff_select on public.waitlist;
create policy waitlist_staff_select on public.waitlist
  for select to authenticated
  using (exists (select 1 from public.staff_members sm
                  where sm.owner_id = waitlist.owner_id and sm.user_id = auth.uid()
                    and sm.active is not false));

create or replace function public.tg_waitlist_notified_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'notified' and old.status is distinct from 'notified' then
    new.notified_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.tg_waitlist_notified_at() from public, anon, authenticated;

drop trigger if exists waitlist_notified_at on public.waitlist;
create trigger waitlist_notified_at
  before update of status on public.waitlist
  for each row execute function public.tg_waitlist_notified_at();

-- 3. Annuleerlinks van verplaatste afspraken (E1-05). Tot 05-10-2026 schoof de
--    vervaldatum van de link niet mee als een afspraak werd verplaatst of
--    bewerkt: bij 16 toekomstige afspraken verliep de link vóór de afspraak
--    (de klant kon niet meer annuleren) of pas erna. Eenmalig gelijkgetrokken
--    met de regel van book-appointment: verloopt op het startmoment, in de
--    tijdzone van de salon. Alleen landen waarvan de zone vaststaat.
update public.cancellation_tokens ct
   set expires_at = (a.date + a.time::time) at time zone
         case when p.country_code in ('AW', 'CW', 'BQ', 'SX') then 'America/Curacao'
              when p.country_code = 'BE' then 'Europe/Brussels'
              else 'Europe/Amsterdam' end
  from public.appointments a
  join public.profiles p on p.id = a.owner_id
 where a.id = ct.appointment_id
   and coalesce(ct.used, false) = false
   and a.status not in ('cancelled', 'completed', 'no_show')
   and a.date >= current_date
   and a.time ~ '^[0-9]{2}:[0-9]{2}'
   and coalesce(p.country_code, 'NL') in ('NL', 'BE', 'AW', 'CW', 'BQ', 'SX')
   and ct.expires_at is distinct from ((a.date + a.time::time) at time zone
         case when p.country_code in ('AW', 'CW', 'BQ', 'SX') then 'America/Curacao'
              when p.country_code = 'BE' then 'Europe/Brussels'
              else 'Europe/Amsterdam' end);
