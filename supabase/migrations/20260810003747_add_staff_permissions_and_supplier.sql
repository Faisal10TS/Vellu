-- Staff view permissions (salon-wide toggles, default = current behaviour: everything visible)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS staff_view_revenue boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS staff_view_client_contact boolean NOT NULL DEFAULT true;
-- Supplier ("agensia") per retail product, for per-supplier order lists
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier text;