-- Klantenrekening, aanvulling: klantnaam en omschrijving op de betaling zelf,
-- zodat het kasboek en de exports een contante deelbetaling kunnen tonen
-- zonder de (vaak maanden oudere) verkoop erbij te hoeven halen.
alter table public.client_payments
  add column client_name text,
  add column label text;
comment on column public.client_payments.client_name is 'Klantnaam op het moment van betalen (kopie van de verkoop), voor kasboek en exports.';
comment on column public.client_payments.label is 'Omschrijving van de post waarop is betaald (kopie van service_name), voor kasboek en exports.';
