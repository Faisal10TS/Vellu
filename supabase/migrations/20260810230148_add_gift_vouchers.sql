-- Kadobonnen: verkocht via de kassa, code op de factuur, saldo-tracking.
-- Inwisselen v1 = owner boekt af in het Kadobonnen-beheer.
CREATE TABLE IF NOT EXISTS gift_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  remaining numeric NOT NULL CHECK (remaining >= 0),
  buyer_name text,
  buyer_email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, code)
);
ALTER TABLE gift_vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_manages_gift_vouchers" ON gift_vouchers FOR ALL TO authenticated
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());