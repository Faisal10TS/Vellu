CREATE TABLE IF NOT EXISTS manual_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manual_clients_owner_idx ON manual_clients(owner_id);
ALTER TABLE manual_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner manages own manual clients" ON manual_clients;
CREATE POLICY "owner manages own manual clients" ON manual_clients
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
COMMENT ON TABLE manual_clients IS 'Owner-added client contacts (not derived from bookings). Shown in the owner Customers view alongside appointment-derived clients, deduped by email.';