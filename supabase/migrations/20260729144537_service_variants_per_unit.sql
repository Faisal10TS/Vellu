-- Per-unit variants: a variant can be booked in a quantity (mirrors the
-- service_extras per_unit feature). Owners opt-in per variant; max_quantity
-- caps the stepper. Existing variants stay per_unit=false.
ALTER TABLE public.service_variants
  ADD COLUMN IF NOT EXISTS per_unit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_quantity integer NOT NULL DEFAULT 10;