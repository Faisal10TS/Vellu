
-- Per-row state for the Facturen view in the owner dashboard. NULL means
-- the invoice row is visible in the default tab; 'hidden' moves it to a
-- "Verborgen" tab; 'deleted' removes it from the Facturen view entirely
-- (but the underlying appointment row stays, so agenda/customer history
-- and analytics are not affected).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS invoice_view_state text;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_invoice_view_state_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_invoice_view_state_check
  CHECK (invoice_view_state IS NULL OR invoice_view_state IN ('hidden', 'deleted'));

COMMENT ON COLUMN public.appointments.invoice_view_state IS
  'Owner-side visibility of this appointment in the Facturen view. NULL = visible, ''hidden'' = shown only in the Verborgen tab, ''deleted'' = removed from Facturen entirely. Underlying appointment row remains; agenda and customer history are unaffected.';

-- Hide flag on manual_clients. When the owner "deletes" a customer who
-- has appointment history, we keep the contact row but mark it hidden so
-- they disappear from the Klanten list without losing the appointment
-- record. For pure-manual customers (no appointments) the row is hard
-- deleted instead; this column is only consulted when joining against
-- appointment-derived clients.
ALTER TABLE public.manual_clients
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.manual_clients.hidden IS
  'When true the owner has hidden this client from the Klanten list. Used as a soft-delete for appointment-derived clients whose history we cannot remove. Pure manual_clients rows that the owner explicitly deletes are hard-deleted instead.';
