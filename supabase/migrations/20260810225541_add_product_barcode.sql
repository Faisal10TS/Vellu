ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text;
CREATE INDEX IF NOT EXISTS idx_products_owner_barcode ON products (owner_id, barcode) WHERE barcode IS NOT NULL;