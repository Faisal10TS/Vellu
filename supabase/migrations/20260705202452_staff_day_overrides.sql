-- Per-staff blocks. profiles.day_overrides is keyed by date and can only
-- hold ONE entry per day, so a salon-wide block from the owner overwrites
-- any staff-specific block on the same date and vice versa. This table
-- keeps each staff member's blocks separate and lets multiple staff hold
-- overlapping blocks on the same date.
CREATE TABLE IF NOT EXISTS public.staff_day_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  date date NOT NULL,
  block_time_start text, -- HH:MM. NULL = whole-day block.
  block_time_end text,   -- HH:MM. NULL when whole-day.
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_day_overrides_owner_date
  ON public.staff_day_overrides (owner_id, date);
CREATE INDEX IF NOT EXISTS staff_day_overrides_staff_date
  ON public.staff_day_overrides (staff_id, date);

ALTER TABLE public.staff_day_overrides ENABLE ROW LEVEL SECURITY;

-- Public read — the client booking flow needs to know when a stylist is
-- unavailable to filter times / prevent invalid bookings. No PII in this
-- table beyond the fact that "staff X is off on date Y".
CREATE POLICY "Public can read staff day overrides"
  ON public.staff_day_overrides
  FOR SELECT
  USING (true);

-- Owner can do anything with blocks that belong to their salon.
CREATE POLICY "Owner manages staff day overrides"
  ON public.staff_day_overrides
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Staff can INSERT a block for themselves.
CREATE POLICY "Staff insert own blocks"
  ON public.staff_day_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_day_overrides.staff_id
        AND sm.user_id = auth.uid()
        AND sm.owner_id = staff_day_overrides.owner_id
    )
  );

-- Staff can DELETE their own blocks (undo an accidental block).
CREATE POLICY "Staff delete own blocks"
  ON public.staff_day_overrides
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_day_overrides.staff_id
        AND sm.user_id = auth.uid()
    )
  );