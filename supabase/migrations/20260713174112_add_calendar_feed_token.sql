
-- Secret token embedded in the private iCal subscribe URL so a salon can add
-- their Vellu agenda to Apple/phone Calendar. Unguessable; rotating it (set to
-- a new value) invalidates any previously shared URL.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_feed_token text UNIQUE;
COMMENT ON COLUMN public.profiles.calendar_feed_token IS 'Secret token in the private webcal/ICS subscription URL. NULL until the owner first opens the calendar-sync card (generated then).';
