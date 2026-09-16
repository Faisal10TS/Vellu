-- Advies per bezoek (Faisal 16-09-2026, verzoek van TTNB): wat de salon de klant
-- na de behandeling heeft meegegeven ("elke dag nagelriemolie"), zodat het bij
-- het volgende bezoek op de afspraakkaart staat — plus of de klant het gedaan
-- heeft (advice_followed, ingevuld bij dat volgende bezoek op de VORIGE rij).
alter table public.appointments
  add column if not exists visit_advice text,
  add column if not exists advice_followed boolean;
comment on column public.appointments.visit_advice is 'Advies voor de volgende keer, door eigenaar of medewerker ingevuld op de afspraakkaart.';
comment on column public.appointments.advice_followed is 'Bij het volgende bezoek: heeft de klant het advies opgevolgd? null = nog niet beoordeeld.';
