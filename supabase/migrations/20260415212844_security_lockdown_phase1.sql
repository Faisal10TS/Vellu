-- Security lockdown phase 1 (retry with proper types)

-- ─── 1. RPC for public availability lookup ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_booked_slots(
  p_slug TEXT,
  p_date DATE,
  p_location_id UUID DEFAULT NULL
)
RETURNS TABLE (
  "time" TEXT,
  service_duration INT,
  staff_id UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.time, a.service_duration, a.staff_id
  FROM appointments a
  JOIN profiles p ON p.id = a.owner_id
  WHERE p.slug = p_slug
    AND a.date = p_date
    AND (p_location_id IS NULL OR a.location_id = p_location_id)
    AND a.status IN ('confirmed', 'completed');
$$;

REVOKE ALL ON FUNCTION public.get_booked_slots(TEXT, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booked_slots(TEXT, DATE, UUID) TO anon, authenticated;

-- ─── 2. Lock down APPOINTMENTS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Clients can read own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Public can cancel appointments" ON public.appointments;
DROP POLICY IF EXISTS "Anyone can book" ON public.appointments;

CREATE POLICY "Staff can read their salon appointments"
ON public.appointments FOR SELECT TO authenticated
USING (
  owner_id IN (
    SELECT owner_id FROM public.staff_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff can update their salon appointments"
ON public.appointments FOR UPDATE TO authenticated
USING (
  owner_id IN (
    SELECT owner_id FROM public.staff_members
    WHERE user_id = auth.uid()
  )
);

-- ─── 3. Lock down CLIENTS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can read clients" ON public.clients;
DROP POLICY IF EXISTS "Public can update clients" ON public.clients;
DROP POLICY IF EXISTS "Public can insert clients" ON public.clients;

CREATE POLICY "Authenticated can read clients"
ON public.clients FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert clients"
ON public.clients FOR INSERT TO authenticated
WITH CHECK (email IS NOT NULL AND email <> '');

CREATE POLICY "Authenticated can update clients"
ON public.clients FOR UPDATE TO authenticated
USING (true)
WITH CHECK (email IS NOT NULL AND email <> '');

-- ─── 4. Lock down CANCELLATION_TOKENS ───────────────────────────────────────
DROP POLICY IF EXISTS "Public can read tokens" ON public.cancellation_tokens;
DROP POLICY IF EXISTS "Public can update tokens" ON public.cancellation_tokens;
DROP POLICY IF EXISTS "Public can insert tokens" ON public.cancellation_tokens;

-- ─── 5. Lock down CLIENT_TOKENS ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Token lookup" ON public.client_tokens;
DROP POLICY IF EXISTS "Token update" ON public.client_tokens;
DROP POLICY IF EXISTS "Anyone can create login tokens" ON public.client_tokens;

-- ─── 6. Clean up duplicate policies ─────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read photos" ON public.service_photos;
DROP POLICY IF EXISTS "Anyone can view photos" ON public.service_photos;
DROP POLICY IF EXISTS "Service photos are publicly viewable" ON public.service_photos;
DROP POLICY IF EXISTS "Owners can manage their service photos" ON public.service_photos;

DROP POLICY IF EXISTS "Anyone can read staff" ON public.staff_members;
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
