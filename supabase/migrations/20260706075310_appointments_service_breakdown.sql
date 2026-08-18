-- Per-service breakdown for combined bookings. When a client picks nails
-- with Esther and toes with Lady in one booking, the appointment stores a
-- single row (one client, one price, one payment) but each service occupies
-- a different time window and is done by a different stylist. This column
-- records the ORDERED array of {service_id, staff_id, duration, offset_min,
-- label} so a staff-filtered agenda can render each stylist's own sub-slot
-- at the correct start time.
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS service_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;