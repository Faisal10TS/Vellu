
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slot_interval_minutes integer NOT NULL DEFAULT 30
  CHECK (slot_interval_minutes IN (10, 15, 20, 30, 60));
COMMENT ON COLUMN public.profiles.slot_interval_minutes IS 'Grid for bookable start times (minutes between slots) shown to clients and in owner appointment forms. One of 10/15/20/30/60, default 30.';
