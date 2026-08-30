-- 45 minuten toegevoegd als tijdslot-interval (Instellingen → Planning).
-- genTimes en de boekingsflow zijn generiek; alleen deze CHECK somde de
-- toegestane waardes op.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_slot_interval_minutes_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_slot_interval_minutes_check
  CHECK (slot_interval_minutes IN (10, 15, 20, 30, 45, 60));
COMMENT ON COLUMN public.profiles.slot_interval_minutes IS 'Grid for bookable start times (minutes between slots) shown to clients and in owner appointment forms. One of 10/15/20/30/45/60, default 30.';
