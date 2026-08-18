-- Optional extra time (minutes) an extra adds to the appointment.
-- NULL/0 = quick add-on (gems), 30 = e.g. intricate design / removal.
ALTER TABLE service_extras ADD COLUMN IF NOT EXISTS duration integer;