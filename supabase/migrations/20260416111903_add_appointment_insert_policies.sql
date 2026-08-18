
-- Owner can insert appointments for their own salon
CREATE POLICY "Owner inserts appointments"
  ON appointments FOR INSERT
  TO public
  WITH CHECK (auth.uid() = owner_id);

-- Staff can insert appointments for their salon
CREATE POLICY "Staff can insert salon appointments"
  ON appointments FOR INSERT
  TO authenticated
  WITH CHECK (owner_id IN (
    SELECT staff_members.owner_id
    FROM staff_members
    WHERE staff_members.user_id = auth.uid()
  ));
