-- Staff can already read + delete variants/extras but cannot UPDATE, which
-- means the StaffApp edit form silently fails. Mirror the delete qual so
-- a stylist can tweak name/price/duration on services from their own
-- dashboard just like the owner does.
CREATE POLICY "Staff can update salon variants"
ON public.service_variants
FOR UPDATE
TO authenticated
USING (
  service_id IN (
    SELECT s.id FROM public.services s
    JOIN public.staff_members sm ON sm.owner_id = s.owner_id
    WHERE sm.user_id = auth.uid()
  )
)
WITH CHECK (
  service_id IN (
    SELECT s.id FROM public.services s
    JOIN public.staff_members sm ON sm.owner_id = s.owner_id
    WHERE sm.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can update salon extras"
ON public.service_extras
FOR UPDATE
TO authenticated
USING (
  service_id IN (
    SELECT s.id FROM public.services s
    JOIN public.staff_members sm ON sm.owner_id = s.owner_id
    WHERE sm.user_id = auth.uid()
  )
)
WITH CHECK (
  service_id IN (
    SELECT s.id FROM public.services s
    JOIN public.staff_members sm ON sm.owner_id = s.owner_id
    WHERE sm.user_id = auth.uid()
  )
);