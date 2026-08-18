-- Two more staff-permission toggles. Default true = today's behaviour, so
-- nothing changes for existing salons until the owner switches them off.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS staff_can_invoice boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS staff_can_edit_services boolean NOT NULL DEFAULT true;

-- Helper: may the current staff user edit this salon's catalogue?
-- SECURITY DEFINER so the policy can read profiles without granting the
-- staff member a direct read on the owner's profile row.
CREATE OR REPLACE FUNCTION staff_may_edit_catalog(p_owner uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.owner_id = p_owner)
     AND COALESCE((SELECT p.staff_can_edit_services FROM profiles p WHERE p.id = p_owner), true)
$$;
REVOKE ALL ON FUNCTION staff_may_edit_catalog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION staff_may_edit_catalog(uuid) TO authenticated;

-- services
DROP POLICY IF EXISTS "Staff can update salon services" ON services;
CREATE POLICY "staff_update_services_when_allowed" ON services FOR UPDATE TO authenticated
USING (staff_may_edit_catalog(owner_id)) WITH CHECK (staff_may_edit_catalog(owner_id));

-- service_variants (scoped through the parent service's owner)
DROP POLICY IF EXISTS "Staff can update salon variants" ON service_variants;
DROP POLICY IF EXISTS "Staff can delete salon variants" ON service_variants;
CREATE POLICY "staff_update_variants_when_allowed" ON service_variants FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM services s WHERE s.id = service_variants.service_id AND staff_may_edit_catalog(s.owner_id)))
WITH CHECK (EXISTS (SELECT 1 FROM services s WHERE s.id = service_variants.service_id AND staff_may_edit_catalog(s.owner_id)));
CREATE POLICY "staff_delete_variants_when_allowed" ON service_variants FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM services s WHERE s.id = service_variants.service_id AND staff_may_edit_catalog(s.owner_id)));

-- service_extras
DROP POLICY IF EXISTS "Staff can update salon extras" ON service_extras;
DROP POLICY IF EXISTS "Staff can delete salon extras" ON service_extras;
CREATE POLICY "staff_update_extras_when_allowed" ON service_extras FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM services s WHERE s.id = service_extras.service_id AND staff_may_edit_catalog(s.owner_id)))
WITH CHECK (EXISTS (SELECT 1 FROM services s WHERE s.id = service_extras.service_id AND staff_may_edit_catalog(s.owner_id)));
CREATE POLICY "staff_delete_extras_when_allowed" ON service_extras FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM services s WHERE s.id = service_extras.service_id AND staff_may_edit_catalog(s.owner_id)));

-- service_photos
DROP POLICY IF EXISTS "Staff can insert service photos" ON service_photos;
DROP POLICY IF EXISTS "Staff can delete service photos" ON service_photos;
CREATE POLICY "staff_insert_photos_when_allowed" ON service_photos FOR INSERT TO authenticated
WITH CHECK (staff_may_edit_catalog(owner_id));
CREATE POLICY "staff_delete_photos_when_allowed" ON service_photos FOR DELETE TO authenticated
USING (staff_may_edit_catalog(owner_id));