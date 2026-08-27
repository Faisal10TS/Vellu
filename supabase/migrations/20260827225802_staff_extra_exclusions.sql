-- Per-medewerker aan/uit voor extra's ("Russian manicure doet Lady niet").
-- Uitsluitingsmodel: géén rij = medewerker voert de extra uit (default aan),
-- zodat bestaande salons en nieuwe extra's zich exact zo gedragen als nu en
-- er nooit backfill nodig is. Spiegelt staff_services qua RLS: eigenaar
-- beheert, publiek mag lezen (de boekingspagina filtert ermee).
CREATE TABLE public.staff_extra_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  extra_id uuid NOT NULL REFERENCES public.service_extras(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (staff_id, extra_id)
);

ALTER TABLE public.staff_extra_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages staff_extra_exclusions" ON public.staff_extra_exclusions
  FOR ALL
  USING (staff_id IN (SELECT id FROM public.staff_members WHERE owner_id = auth.uid()))
  WITH CHECK (staff_id IN (SELECT id FROM public.staff_members WHERE owner_id = auth.uid()));

CREATE POLICY "Public can read staff_extra_exclusions" ON public.staff_extra_exclusions
  FOR SELECT USING (true);

-- Dekkend index voor de FK op extra_id (de UNIQUE dekt staff_id al).
CREATE INDEX idx_staff_extra_exclusions_extra_id ON public.staff_extra_exclusions (extra_id);
