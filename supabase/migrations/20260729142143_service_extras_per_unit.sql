-- Per-unit extras: an extra like "Broken nail" can be booked in a quantity
-- (e.g. 3 broken nails = 3x the price). Owners opt-in per extra; max_quantity
-- caps the stepper. Existing extras stay per_unit=false (single add-on).
ALTER TABLE public.service_extras
  ADD COLUMN IF NOT EXISTS per_unit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_quantity integer NOT NULL DEFAULT 10;