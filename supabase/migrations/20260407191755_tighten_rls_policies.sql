
-- ============================================================
-- 1. SERVICE_CATEGORIES: Lock to owner only (was fully public)
-- ============================================================
DROP POLICY IF EXISTS "Public can delete categories" ON public.service_categories;
DROP POLICY IF EXISTS "Public can insert categories" ON public.service_categories;
DROP POLICY IF EXISTS "Public can update categories" ON public.service_categories;

CREATE POLICY "Owner can insert categories" ON public.service_categories
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update categories" ON public.service_categories
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can delete categories" ON public.service_categories
  FOR DELETE USING (auth.uid() = owner_id);

-- ============================================================
-- 2. SERVICE_PHOTOS: Remove 6 duplicate permissive policies,
--    keep the 2 proper owner-based ALL policies, add clean ones
-- ============================================================
DROP POLICY IF EXISTS "Public can delete photos" ON public.service_photos;
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON public.service_photos;
DROP POLICY IF EXISTS "Auth users can delete photos" ON public.service_photos;
DROP POLICY IF EXISTS "Auth users can insert photos" ON public.service_photos;
DROP POLICY IF EXISTS "Public can insert photos" ON public.service_photos;
DROP POLICY IF EXISTS "Authenticated users can insert photos" ON public.service_photos;
DROP POLICY IF EXISTS "Public can update photos" ON public.service_photos;
-- Keep: "Owners can manage their service photos" (ALL via service join)
-- Keep: "Owner manages photos" (ALL via owner_id)
-- Keep read policies

-- ============================================================
-- 3. APPOINTMENTS: Tighten INSERT and UPDATE
-- ============================================================
-- Replace wide-open INSERT with one that validates owner_id exists
DROP POLICY IF EXISTS "Anyone can book" ON public.appointments;
CREATE POLICY "Anyone can book" ON public.appointments
  FOR INSERT WITH CHECK (
    owner_id IS NOT NULL
    AND owner_id IN (SELECT id FROM public.profiles)
  );

-- Replace wide-open UPDATE with scoped policy
-- Allows: owner updates own, OR public can only set status to 'cancelled'
DROP POLICY IF EXISTS "Public can cancel appointments" ON public.appointments;
CREATE POLICY "Public can cancel appointments" ON public.appointments
  FOR UPDATE USING (true) WITH CHECK (status = 'cancelled');

-- ============================================================
-- 4. CLIENTS: Tighten INSERT and UPDATE
-- ============================================================
DROP POLICY IF EXISTS "Public can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Public can update clients" ON public.clients;

CREATE POLICY "Public can insert clients" ON public.clients
  FOR INSERT WITH CHECK (email IS NOT NULL AND email <> '');
CREATE POLICY "Public can update clients" ON public.clients
  FOR UPDATE USING (true) WITH CHECK (email IS NOT NULL AND email <> '');

-- ============================================================
-- 5. REVIEWS: Require valid owner_id
-- ============================================================
DROP POLICY IF EXISTS "Anyone can insert reviews" ON public.reviews;
CREATE POLICY "Anyone can insert reviews" ON public.reviews
  FOR INSERT WITH CHECK (
    owner_id IS NOT NULL
    AND owner_id IN (SELECT id FROM public.profiles)
    AND rating >= 1 AND rating <= 5
  );

-- ============================================================
-- 6. CANCELLATION_TOKENS: Basic validation
-- ============================================================
DROP POLICY IF EXISTS "Public can insert tokens" ON public.cancellation_tokens;
CREATE POLICY "Public can insert tokens" ON public.cancellation_tokens
  FOR INSERT WITH CHECK (
    appointment_id IS NOT NULL
    AND token IS NOT NULL AND token <> ''
  );

-- ============================================================
-- 7. CLIENT_TOKENS: Basic validation  
-- ============================================================
DROP POLICY IF EXISTS "Anyone can create login tokens" ON public.client_tokens;
CREATE POLICY "Anyone can create login tokens" ON public.client_tokens
  FOR INSERT WITH CHECK (
    email IS NOT NULL AND email <> ''
    AND token IS NOT NULL AND token <> ''
  );

-- ============================================================
-- 8. Fix handle_new_user search_path (security warning)
-- ============================================================
ALTER FUNCTION public.handle_new_user() SET search_path = public;
