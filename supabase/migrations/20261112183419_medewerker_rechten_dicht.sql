-- Tweede stap van "medewerkers wijzigen via de server": de medewerkersapp
-- schrijft nu alleen nog via staff_update_appointment, staff_create_appointment,
-- staff_complete_appointment en staff_mark_prepaid. De directe schrijfrechten
-- gaan weg, en rechtstreeks lezen kan alleen nog als de eigenaar zowel omzet
-- als klantgegevens voor medewerkers aan heeft staan (dan is er niets te
-- verbergen). De uitzondering "eigen afspraken altijd leesbaar" bestond alleen
-- voor de directe updates en is daarmee overbodig.
drop policy if exists "Staff can update their salon appointments" on public.appointments;
drop policy if exists "Staff can insert salon appointments" on public.appointments;

drop policy if exists staff_read_appointments_when_allowed on public.appointments;
create policy staff_read_appointments_when_allowed on public.appointments
  for select to authenticated
  using (
    owner_id in (select sm.owner_id from public.staff_members sm
                  where sm.user_id = (select auth.uid()) and sm.active is not false)
    and owner_id in (select f.owner_id from public.staff_salon_flags() f
                      where f.view_revenue and f.view_contact)
    and (
      owner_id in (select f.owner_id from public.staff_salon_flags() f where f.see_all)
      or staff_id in (select sm.id from public.staff_members sm
                       where sm.user_id = (select auth.uid()) and sm.active is not false)
      or exists (select 1 from jsonb_each_text(coalesce(appointments.staff_assignments, '{}'::jsonb)) v(key, value)
                  where v.value in (select sm.id::text from public.staff_members sm
                                     where sm.user_id = (select auth.uid()) and sm.active is not false))
      or exists (select 1 from jsonb_array_elements(
                   case when jsonb_typeof(appointments.service_breakdown) = 'array'
                        then appointments.service_breakdown else '[]'::jsonb end) e(value)
                  where (e.value ->> 'staff_id') in (select sm.id::text from public.staff_members sm
                                                      where sm.user_id = (select auth.uid()) and sm.active is not false))
      or (staff_id is null
          and coalesce(staff_assignments, '{}'::jsonb) = '{}'::jsonb
          and not exists (select 1 from jsonb_array_elements(
                            case when jsonb_typeof(appointments.service_breakdown) = 'array'
                                 then appointments.service_breakdown else '[]'::jsonb end) e(value)
                           where nullif(e.value ->> 'staff_id', '') is not null))
    )
  );
