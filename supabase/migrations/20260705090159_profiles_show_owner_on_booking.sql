-- Opt-in flag for the salon: when true, the client-facing booking page
-- surfaces which staff member is the salon owner. Default false because
-- most solos won't want to advertise the distinction.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS show_owner_on_booking boolean NOT NULL DEFAULT false;