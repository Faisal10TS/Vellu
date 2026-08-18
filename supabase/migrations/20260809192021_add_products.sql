-- Retail products a salon sells alongside treatments (Professional plan).
-- v1: no stock tracking — name/price/photo/description + active flag.
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name_nl text,
  name_en text,
  name_es text,
  description_nl text,
  description_en text,
  description_es text,
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  photo_url text,
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_owner_idx ON products(owner_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- Anonymous booking page sees active products only; owners manage their own
-- (their ALL policy also covers reading inactive ones).
CREATE POLICY "Public can read active products" ON products FOR SELECT USING (active = true);
CREATE POLICY "Owner manages own products" ON products FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Structured record of products ordered with a booking; the total price of
-- an appointment (service_price) INCLUDES products, and the service_name
-- label appends them — this jsonb is for itemization (invoices, analytics).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS products jsonb;