-- Twee team-features (verzoek salon 28-08, "zoals Fresha"):
--
-- 1. staff_service_prices: afwijkende prijs per medewerker voor dezelfde
--    dienst (collega 1 doet manicure voor 55, collega 2 voor 45). Geen rij =
--    standaardprijs van de dienst/variant, dus bestaand gedrag verandert
--    nergens. variant_id alvast in het model (NULL = prijs op de dienst
--    zelf); de UI stelt v1 alleen dienst-prijzen in.
--
-- 2. staff_day_overrides.service_id: een blokkade die maar één dienst
--    raakt — "maandag geen brows voor Demi (één behandelkamer), pedicures
--    die dag wél". NULL = blokkade geldt voor alles (bestaand gedrag).
--    staff_id NULL + service_id gezet = niemand kan die dienst die dag.

CREATE TABLE public.staff_service_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.service_variants(id) ON DELETE CASCADE,
  price numeric NOT NULL CHECK (price >= 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (staff_id, service_id, variant_id)
);

ALTER TABLE public.staff_service_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages staff_service_prices" ON public.staff_service_prices
  FOR ALL
  USING (staff_id IN (SELECT id FROM public.staff_members WHERE owner_id = auth.uid()))
  WITH CHECK (staff_id IN (SELECT id FROM public.staff_members WHERE owner_id = auth.uid()));

-- De boekingspagina moet de juiste prijs per gekozen medewerker kunnen tonen.
CREATE POLICY "Public can read staff_service_prices" ON public.staff_service_prices
  FOR SELECT USING (true);

CREATE INDEX idx_staff_service_prices_service_id ON public.staff_service_prices (service_id);
CREATE INDEX idx_staff_service_prices_variant_id ON public.staff_service_prices (variant_id);

ALTER TABLE public.staff_day_overrides
  ADD COLUMN service_id uuid REFERENCES public.services(id) ON DELETE CASCADE;

CREATE INDEX idx_staff_day_overrides_service_id ON public.staff_day_overrides (service_id);
