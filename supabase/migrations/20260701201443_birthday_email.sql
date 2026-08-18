
-- Optional client birthday (month/day only matter for the birthday email; we
-- store the full DATE so an owner who wants exact age can still compute it).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.manual_clients
  ADD COLUMN IF NOT EXISTS birthday date;

COMMENT ON COLUMN public.clients.birthday IS
  'Optional client birthday (yyyy-mm-dd). Only used to trigger the birthday email — kept alongside the appointment-derived contact record so multiple salons can each see it.';
COMMENT ON COLUMN public.manual_clients.birthday IS
  'Optional client birthday (yyyy-mm-dd) captured by the owner or via CSV import. The daily birthday-email cron reads this row when the salon has the feature enabled.';

-- Owner-side controls for the birthday email. Kept nullable so a legacy
-- salon that never touches settings just gets the "off" behaviour.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS birthday_email_discount_pct integer,
  ADD COLUMN IF NOT EXISTS birthday_email_code_prefix text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_birthday_email_discount_pct_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_birthday_email_discount_pct_check
  CHECK (birthday_email_discount_pct IS NULL OR (birthday_email_discount_pct BETWEEN 1 AND 99));

COMMENT ON COLUMN public.profiles.birthday_email_enabled IS
  'When true the daily birthday-email cron sends an automated wish + discount code to any client whose birthday matches today. Default false.';
COMMENT ON COLUMN public.profiles.birthday_email_discount_pct IS
  'Percentage discount (1-99) included in the birthday email. Combined with birthday_email_code_prefix to build a per-client code (e.g. BDAY-ANNA25).';
COMMENT ON COLUMN public.profiles.birthday_email_code_prefix IS
  'Prefix for the generated birthday discount code (e.g. "BDAY"). Falls back to "BDAY" when null.';

-- Sent-log so re-runs of the cron on the same day never double-send. Keyed
-- by (owner, client_email, sent_on) so a client with birthday today is
-- guaranteed to receive at most one wish per salon per year.
CREATE TABLE IF NOT EXISTS public.birthday_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_email text NOT NULL,
  sent_on date NOT NULL DEFAULT CURRENT_DATE,
  discount_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_email, sent_on)
);

COMMENT ON TABLE public.birthday_email_log IS
  'Idempotency + audit trail for the birthday-email cron: one row per (salon, client, calendar date) send. UNIQUE constraint is what stops a re-run of the cron on the same day from sending twice.';

ALTER TABLE public.birthday_email_log ENABLE ROW LEVEL SECURITY;
