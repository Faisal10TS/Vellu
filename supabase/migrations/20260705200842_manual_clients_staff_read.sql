-- Staff need to SEE (not manage) the salon's manual client notes so their
-- StaffApp appt cards and Klanten tab surface the same "prep info" the owner
-- has. Owner-manages policy still gates all writes.
CREATE POLICY "staff can read salon manual clients"
ON public.manual_clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.owner_id = manual_clients.owner_id
  )
);