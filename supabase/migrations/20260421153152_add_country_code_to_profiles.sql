-- Add country_code to profiles so salons know which country they operate in.
-- Needed for: per-country legal pages (imprint rules), VAT handling on invoices,
-- currency display, timezone defaults, and which payment methods to show.
-- Default 'NL' backfills existing rows automatically.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'NL';

-- Constrain to ISO 3166-1 alpha-2 to avoid typos / freeform garbage.
-- Matches our COUNTRIES registry in shared.jsx.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_country_code_check
  CHECK (country_code ~ '^[A-Z]{2}$');

COMMENT ON COLUMN public.profiles.country_code IS
  'ISO 3166-1 alpha-2 country code. Drives per-country legal pages, VAT rate, currency, and default timezone. Set at signup, editable in settings.';