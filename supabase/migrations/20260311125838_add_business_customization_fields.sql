
-- Add customization fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_policy TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_required BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS discount_codes JSONB DEFAULT '[]'::jsonb;

-- Create storage bucket for business images (logo, cover)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-images', 'business-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for business images
CREATE POLICY "Anyone can view business images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-images');

CREATE POLICY "Authenticated users can upload business images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete their business images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'business-images' AND auth.role() = 'authenticated');
