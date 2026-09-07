-- Betaald bedrag per afspraak. Tot nu toe was "betaald" een ja/nee (paid_at);
-- met Vooruitbetalen kan een klant al €45 hebben overgemaakt terwijl de
-- behandeling in de salon €75 wordt. Dan is er €30 open: dat hoort op de kaart,
-- in de wijzigingsmail (betaalverzoek voor het verschil) en op de factuur
-- ("Vooruitbetaald -€45 / Te betalen €30"). Dezelfde kolom draagt straks de
-- aanbetaling (deelbedrag vooraf).
--
-- NULL = onbekend/oud: de app leidt het dan af uit paid_at (paid_at gezet =
-- het hele bedrag betaald, anders 0). paid_at blijft "volledig betaald".
alter table public.appointments
  add column if not exists amount_paid numeric(10,2);
comment on column public.appointments.amount_paid is 'Totaal ontvangen bedrag voor deze afspraak (vooruitbetaling, aanbetaling, betalingen erna). NULL = afleiden uit paid_at.';
