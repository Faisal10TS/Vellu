-- Shared-account salons where two stylists share ONE login (joint account,
-- no separate staff portal) need to send invoices in each person's own name
-- with a different KVK / BTW / IBAN / prefix. The existing address/kvk_number/
-- btw_id/iban/invoice_prefix/next_invoice_number columns stay as the primary
-- profile; invoice_profiles holds an array of additional named profiles.
--
-- Shape per element:
--   { id, label, address, kvk_number, btw_id, iban,
--     invoice_prefix, next_invoice_number }
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS invoice_profiles jsonb NOT NULL DEFAULT '[]'::jsonb;