-- Professional product management (Sara-style): purchase price for margin /
-- inventory value, and OPTIONAL stock tracking. NULL stock = not tracked —
-- small salons keep it simple, bigger ones get Huidig/Min/Tekort signals.
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price numeric CHECK (purchase_price IS NULL OR purchase_price >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock integer CHECK (stock IS NULL OR stock >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock integer CHECK (min_stock IS NULL OR min_stock >= 0);