
-- Exceptions (extra werkdagen) move from profiles.day_overrides (a JSON map
-- keyed by date — only ONE entry per date, so Esther's and Lady's exception
-- days overwrote each other) into this table, which already supports many
-- rows per date. kind='exception' reuses block_time_start/block_time_end as
-- the open/close window; staff_id NULL means salon-wide.
ALTER TABLE public.staff_day_overrides
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'block'
  CHECK (kind IN ('block','exception'));
COMMENT ON COLUMN public.staff_day_overrides.kind IS 'block = unavailable window (or whole day when times NULL); exception = EXTRA availability window (block_time_start/end are open/close). Multiple rows per date+staff allowed.';
