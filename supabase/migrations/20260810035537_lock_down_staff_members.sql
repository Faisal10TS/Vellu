-- BEFORE: "Public can read staff" USING (true) exposed every column to anon —
-- including freelancer billing data (iban, iban_holder, kvk_number, btw_id,
-- payment_link, invoice counters) and staff emails. Public pages now read a
-- safe view; the base table is owner/self/colleague-scoped.

-- Colleague visibility needs a self-referencing check; doing that inline in a
-- policy on the same table recurses, so it lives in a SECURITY DEFINER helper.
CREATE OR REPLACE FUNCTION my_staff_owner_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT owner_id FROM staff_members WHERE user_id = auth.uid() $$;
REVOKE ALL ON FUNCTION my_staff_owner_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_staff_owner_ids() TO authenticated;

CREATE OR REPLACE VIEW public_staff AS
SELECT id, owner_id, name, role, bio, avatar_url, working_hours, active, position,
       (user_id = owner_id) AS is_owner
FROM staff_members;
GRANT SELECT ON public_staff TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read staff" ON staff_members;

CREATE POLICY "staff_read_self" ON staff_members FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "staff_read_colleagues" ON staff_members FOR SELECT TO authenticated
USING (owner_id IN (SELECT my_staff_owner_ids()));
-- Invite claiming: a fresh account finds its unclaimed row by its own
-- (JWT-verified) email and links it. SELECT + the NULL->uid UPDATE.
CREATE POLICY "staff_claim_invite_select" ON staff_members FOR SELECT TO authenticated
USING (user_id IS NULL AND lower(email) = lower(COALESCE(auth.jwt()->>'email', '')));
CREATE POLICY "staff_claim_invite_update" ON staff_members FOR UPDATE TO authenticated
USING (user_id IS NULL AND lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
WITH CHECK (user_id = auth.uid());