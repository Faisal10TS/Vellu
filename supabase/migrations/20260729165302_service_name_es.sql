-- Spanish names for salon-authored content (auto-translated on save; falls
-- back to name_en/name_nl when empty). Mirrors name_nl/name_en.
ALTER TABLE public.services         ADD COLUMN IF NOT EXISTS name_es text, ADD COLUMN IF NOT EXISTS description_es text;
ALTER TABLE public.service_variants ADD COLUMN IF NOT EXISTS name_es text, ADD COLUMN IF NOT EXISTS description_es text;
ALTER TABLE public.service_extras   ADD COLUMN IF NOT EXISTS name_es text;
ALTER TABLE public.service_categories ADD COLUMN IF NOT EXISTS name_es text;