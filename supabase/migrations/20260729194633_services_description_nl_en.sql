ALTER TABLE services ADD COLUMN IF NOT EXISTS description_nl text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS description_en text;
COMMENT ON COLUMN services.description_nl IS 'Optional service description (Dutch); mirrors variant descriptions. description_es already existed.';