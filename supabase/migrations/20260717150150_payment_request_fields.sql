-- Payment-request feature (no payment processing): salons configure a
-- payment link (bunq.me/PayPal.me/…) and/or rely on their IBAN; the invoice
-- email then renders a "pay" block with a SEPA (EPC) QR code. iban_holder is
-- the account holder name shown with the IBAN and embedded in the QR.
-- appointments.paid_at lets the owner tick off which invoices are paid.
alter table public.profiles add column if not exists payment_link text;
alter table public.profiles add column if not exists iban_holder text;
alter table public.appointments add column if not exists paid_at timestamptz;