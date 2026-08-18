-- BEFORE: any authenticated user (any salon, any staff account) could read and
-- UPDATE every clients row — names, phones, allergies (GDPR art. 9) of every
-- salon's clients. Lock to salons the client actually visited.

DROP POLICY IF EXISTS "Authenticated can read clients" ON clients;
DROP POLICY IF EXISTS "Authenticated can update clients" ON clients;
DROP POLICY IF EXISTS "Authenticated can insert clients" ON clients;

CREATE POLICY "clients_select_visited_salon" ON clients FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM appointments a
  WHERE (a.client_id = clients.id OR lower(a.client_email) = lower(clients.email))
    AND (a.owner_id = auth.uid()
         OR a.owner_id IN (SELECT owner_id FROM staff_members WHERE user_id = auth.uid()))
));

CREATE POLICY "clients_update_visited_salon" ON clients FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM appointments a
  WHERE (a.client_id = clients.id OR lower(a.client_email) = lower(clients.email))
    AND (a.owner_id = auth.uid()
         OR a.owner_id IN (SELECT owner_id FROM staff_members WHERE user_id = auth.uid()))
))
WITH CHECK (email IS NOT NULL AND email <> '');

-- Creation goes through this RPC: clients.email is globally unique (shared
-- across salons), so a salon adding a walk-in whose email already exists at
-- ANOTHER salon can't see that row (policy above) and a plain INSERT would
-- hit the unique constraint. SECURITY DEFINER bridges exactly that gap and
-- returns only the id.
CREATE OR REPLACE FUNCTION get_or_create_client(
  p_email text, p_first text DEFAULT '', p_last text DEFAULT '',
  p_phone text DEFAULT NULL, p_allergies text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  p_email := lower(trim(p_email));
  IF p_email IS NULL OR p_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;
  SELECT id INTO v_id FROM clients WHERE lower(email) = p_email LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO clients (email, first_name, last_name, phone, allergies, last_visit)
    VALUES (p_email, COALESCE(NULLIF(trim(p_first), ''), p_email), COALESCE(trim(p_last), ''),
            NULLIF(trim(COALESCE(p_phone, '')), ''), NULLIF(trim(COALESCE(p_allergies, '')), ''), now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE clients SET
      phone = COALESCE(NULLIF(trim(COALESCE(p_phone, '')), ''), phone),
      allergies = COALESCE(NULLIF(trim(COALESCE(p_allergies, '')), ''), allergies)
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION get_or_create_client(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_or_create_client(text, text, text, text, text) TO authenticated;