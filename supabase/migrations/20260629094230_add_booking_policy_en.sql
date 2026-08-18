
-- The existing `booking_policy` text column becomes the Dutch (default)
-- version. Add an English variant alongside it so the salon profile can
-- show the right text depending on the visitor's language toggle.
-- Both are nullable: when EN is empty we fall back to NL on the client.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS booking_policy_en text;

COMMENT ON COLUMN public.profiles.booking_policy IS
  'Booking & cancellation policy in Dutch (default). Shown to clients when lang=nl, and as fallback when booking_policy_en is empty.';
COMMENT ON COLUMN public.profiles.booking_policy_en IS
  'Booking & cancellation policy in English. Shown to clients when lang=en. Falls back to booking_policy when empty.';
