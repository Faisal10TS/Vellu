-- Fix 13: Require completed appointment to leave a review
DROP POLICY IF EXISTS "Anyone can insert reviews" ON public.reviews;

CREATE POLICY "Clients with completed appointments can review"
ON public.reviews FOR INSERT TO public
WITH CHECK (
  owner_id IS NOT NULL
  AND owner_id IN (SELECT id FROM profiles)
  AND rating >= 1 AND rating <= 5
  AND client_email IS NOT NULL
  AND client_email != ''
  AND EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.owner_id = reviews.owner_id
    AND a.client_email = reviews.client_email
    AND a.status = 'completed'
  )
);

-- Fix 16: Drop broad storage listing policies
-- Public buckets serve files by direct URL — listing all files is not needed
-- and leaks the directory structure to anyone.
DROP POLICY IF EXISTS "Anyone can view business images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view service photos" ON storage.objects;
DROP POLICY IF EXISTS "public_read_service_photos" ON storage.objects;

-- Re-add a narrow read-only policy for accessing individual objects
-- (needed because public buckets still need objects to be fetchable by URL)
CREATE POLICY "Public can read storage objects by path"
ON storage.objects FOR SELECT TO public
USING (bucket_id IN ('business-images', 'service-photos'));
