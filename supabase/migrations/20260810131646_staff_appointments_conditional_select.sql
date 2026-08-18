-- Direct staff SELECT on appointments is now conditional: full direct reads
-- only while BOTH visibility toggles are on (the default). A stylist can
-- always read appointments assigned to themselves (needed for insert-
-- returning and their own invoicing). The salon-wide list goes through
-- staff_list_appointments(), which strips columns per the owner's flags.
DROP POLICY IF EXISTS "Staff can read their salon appointments" ON appointments;
CREATE POLICY "staff_read_appointments_when_allowed" ON appointments FOR SELECT TO authenticated
USING (
  owner_id IN (SELECT owner_id FROM staff_members WHERE user_id = auth.uid())
  AND (
    (SELECT COALESCE(p.staff_view_revenue, true) AND COALESCE(p.staff_view_client_contact, true)
       FROM profiles p WHERE p.id = appointments.owner_id)
    OR staff_id IN (SELECT id FROM staff_members WHERE user_id = auth.uid())
  )
);
-- Client notes are contact data: staff only read them while the contact
-- toggle is on.
DROP POLICY IF EXISTS "staff can read salon manual clients" ON manual_clients;
CREATE POLICY "staff_read_manual_clients_when_allowed" ON manual_clients FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.owner_id = manual_clients.owner_id)
  AND (SELECT COALESCE(p.staff_view_client_contact, true) FROM profiles p WHERE p.id = manual_clients.owner_id)
);