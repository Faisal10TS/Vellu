
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS discount_amount numeric,
  ADD COLUMN IF NOT EXISTS discount_reason text;
COMMENT ON COLUMN public.appointments.discount_amount IS 'Owner-granted discount in EUR. service_price is ALWAYS the final amount the client pays (base minus this discount); this column is bookkeeping so the base price can be reconstructed.';
COMMENT ON COLUMN public.appointments.discount_reason IS 'Optional free-text reason for the discount (e.g. loyalty, complaint fix). Internal only.';
