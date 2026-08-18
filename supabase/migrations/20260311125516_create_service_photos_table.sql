
-- Create service_photos table
CREATE TABLE IF NOT EXISTS service_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE service_photos ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Service photos are publicly viewable" 
  ON service_photos FOR SELECT 
  USING (true);

CREATE POLICY "Owners can manage their service photos" 
  ON service_photos FOR ALL 
  USING (
    service_id IN (
      SELECT id FROM services WHERE owner_id = auth.uid()
    )
  );

-- Create storage bucket for service photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-photos', 'service-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can view service photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-photos');

CREATE POLICY "Authenticated users can upload service photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'service-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete their service photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'service-photos' AND auth.role() = 'authenticated');
