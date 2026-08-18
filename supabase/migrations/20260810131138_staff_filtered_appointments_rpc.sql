CREATE OR REPLACE FUNCTION staff_list_appointments(p_from text DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  WITH me AS (
    SELECT sm.owner_id,
           COALESCE(p.staff_view_revenue, true) AS see_rev,
           COALESCE(p.staff_view_client_contact, true) AS see_contact
    FROM staff_members sm
    JOIN profiles p ON p.id = sm.owner_id
    WHERE sm.user_id = auth.uid() AND sm.active = true
    LIMIT 1
  )
  SELECT to_jsonb(a)
    - (CASE WHEN me.see_rev THEN '{}'::text[] ELSE ARRAY['service_price'] END)
    - (CASE WHEN me.see_contact THEN '{}'::text[]
        ELSE ARRAY['client_email','client_phone','client_allergies'] END)
  FROM appointments a, me
  WHERE a.owner_id = me.owner_id
    AND (p_from IS NULL OR a.date >= p_from::date)
$$;
REVOKE ALL ON FUNCTION staff_list_appointments(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION staff_list_appointments(text) TO authenticated;