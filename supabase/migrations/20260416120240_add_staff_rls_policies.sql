
-- Staff can update their own staff_members record (working hours, invoice settings)
CREATE POLICY "Staff can update own record"
  ON staff_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Staff can insert photos for their salon's services
CREATE POLICY "Staff can insert service photos"
  ON service_photos FOR INSERT
  TO authenticated
  WITH CHECK (owner_id IN (
    SELECT staff_members.owner_id FROM staff_members WHERE staff_members.user_id = auth.uid()
  ));

-- Staff can delete photos for their salon's services
CREATE POLICY "Staff can delete service photos"
  ON service_photos FOR DELETE
  TO authenticated
  USING (owner_id IN (
    SELECT staff_members.owner_id FROM staff_members WHERE staff_members.user_id = auth.uid()
  ));

-- Staff can update services for their salon
CREATE POLICY "Staff can update salon services"
  ON services FOR UPDATE
  TO authenticated
  USING (owner_id IN (
    SELECT staff_members.owner_id FROM staff_members WHERE staff_members.user_id = auth.uid()
  ));

-- Staff can delete variants for their salon's services
CREATE POLICY "Staff can delete salon variants"
  ON service_variants FOR DELETE
  TO authenticated
  USING (service_id IN (
    SELECT s.id FROM services s
    JOIN staff_members sm ON sm.owner_id = s.owner_id
    WHERE sm.user_id = auth.uid()
  ));

-- Staff can delete extras for their salon's services
CREATE POLICY "Staff can delete salon extras"
  ON service_extras FOR DELETE
  TO authenticated
  USING (service_id IN (
    SELECT s.id FROM services s
    JOIN staff_members sm ON sm.owner_id = s.owner_id
    WHERE sm.user_id = auth.uid()
  ));

-- Appointments DELETE policy for owner (for cancellations)
CREATE POLICY "Owner deletes appointments"
  ON appointments FOR DELETE
  TO public
  USING (auth.uid() = owner_id);
