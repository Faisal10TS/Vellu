-- =============================================
-- 1. CLIENT ACCOUNTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_visit TIMESTAMPTZ
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read clients" ON clients FOR SELECT USING (true);
CREATE POLICY "Public can insert clients" ON clients FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update clients" ON clients FOR UPDATE USING (true);

-- Link appointments to clients
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);

-- =============================================
-- 2. SERVICE CATEGORIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name_nl TEXT NOT NULL,
  name_en TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read categories" ON service_categories FOR SELECT USING (true);
CREATE POLICY "Public can insert categories" ON service_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update categories" ON service_categories FOR UPDATE USING (true);
CREATE POLICY "Public can delete categories" ON service_categories FOR DELETE USING (true);

-- Link services to categories
ALTER TABLE services ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES service_categories(id) ON DELETE SET NULL;

-- =============================================
-- 3. CANCELLATION TOKENS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS cancellation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  used BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cancellation_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read tokens" ON cancellation_tokens FOR SELECT USING (true);
CREATE POLICY "Public can insert tokens" ON cancellation_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update tokens" ON cancellation_tokens FOR UPDATE USING (true);

-- Add cancellation status to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;