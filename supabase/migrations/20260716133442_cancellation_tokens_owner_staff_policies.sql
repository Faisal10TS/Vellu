-- Owner/staff-scoped access to cancellation_tokens.
--
-- Context: the table had RLS enabled with ZERO policies, so only edge
-- functions (service_role) could touch it. Consequence: appointments booked
-- manually from the owner/staff dashboard got no cancellation token, so the
-- client's confirmation email lacked the cancel button that self-booked
-- clients get; and the dashboard's token lookup for "appointment updated"
-- emails always came back empty.
--
-- These policies let an authenticated user create/read tokens ONLY for
-- appointments of a salon they own or work at (staff_members.user_id link).
-- No UPDATE/DELETE: consuming a token stays server-side (cancel-appointment).

create policy "owner_staff_insert_cancellation_tokens"
on public.cancellation_tokens
for insert to authenticated
with check (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and (
        a.owner_id = auth.uid()
        or exists (
          select 1 from public.staff_members sm
          where sm.owner_id = a.owner_id and sm.user_id = auth.uid()
        )
      )
  )
);

create policy "owner_staff_select_cancellation_tokens"
on public.cancellation_tokens
for select to authenticated
using (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and (
        a.owner_id = auth.uid()
        or exists (
          select 1 from public.staff_members sm
          where sm.owner_id = a.owner_id and sm.user_id = auth.uid()
        )
      )
  )
);