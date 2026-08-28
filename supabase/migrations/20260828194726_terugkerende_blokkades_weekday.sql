-- Wekelijks terugkerende blokkades ("elke zondag dicht", "elke woensdag
-- geen brows bij Demi"). weekday = JS getDay() (0=zondag .. 6=zaterdag).
-- NULL = eenmalige blokkade op `date` (bestaand gedrag, niets verandert).
-- Gezet = de blokkade geldt elke week op die dag VANAF `date` (de datum is
-- het anker/de eerste keer). Combineert met staff_id, service_id en de
-- tijdvak-kolommen zoals elke andere blokkade; kind blijft 'block'.
ALTER TABLE public.staff_day_overrides
  ADD COLUMN weekday smallint CHECK (weekday >= 0 AND weekday <= 6);

CREATE INDEX idx_staff_day_overrides_weekday
  ON public.staff_day_overrides (weekday)
  WHERE weekday IS NOT NULL;
