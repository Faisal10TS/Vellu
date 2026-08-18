-- Add a permissive INSERT policy that works for anonymous users
DROP POLICY IF EXISTS "Public can insert photos" ON service_photos;
CREATE POLICY "Public can insert photos" ON service_photos FOR INSERT WITH CHECK (true);

-- Also ensure UPDATE works
DROP POLICY IF EXISTS "Public can update photos" ON service_photos;
CREATE POLICY "Public can update photos" ON service_photos FOR UPDATE USING (true);

-- And DELETE
DROP POLICY IF EXISTS "Public can delete photos" ON service_photos;
CREATE POLICY "Public can delete photos" ON service_photos FOR DELETE USING (true);