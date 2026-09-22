-- Kassa, contant afrekenen (Faisal 22-09-2026): "kassa in / kassa uit" — wat
-- de klant geeft en wat er terug moet. Het ontvangen bedrag wordt bij de
-- verkoop bewaard zodat de bon, de bevestiging aan de balie en de
-- verkoopdetails het wisselgeld kunnen tonen (wisselgeld = ontvangen - totaal,
-- niet apart opgeslagen). NULL = niet ingevuld (pin, betaalverzoek, of gepast
-- zonder bedrag in te typen).
alter table public.appointments
  add column if not exists cash_received numeric(10,2);

comment on column public.appointments.cash_received is
  'Kassa, contant: bedrag dat de klant gaf (kassa in). Wisselgeld = cash_received - service_price. NULL als niet ingevuld of niet contant.';
