-- Multi-service bookings currently only persist the "primary" staff on
-- appointments.staff_id (the staff assigned to the first service). When
-- the same booking has a second service handled by a different stylist,
-- filtering the agenda by that second stylist hides the row entirely.
--
-- staff_assignments captures every service→staff assignment on the row
-- itself: { [service_id]: staff_id }. Agenda filters check this map in
-- addition to the primary staff_id, and staff dashboards can also
-- surface appointments where they own only ONE service of a combined
-- booking.
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS staff_assignments jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS appointments_staff_assignments_gin
ON public.appointments USING gin (staff_assignments);