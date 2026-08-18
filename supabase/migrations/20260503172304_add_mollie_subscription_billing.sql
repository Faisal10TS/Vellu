-- 1. Profile columns for live subscription state
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mollie_mandate_id text,
  ADD COLUMN IF NOT EXISTS mollie_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- 2. CHECK constraints (use DO blocks to make idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check
      CHECK (plan IS NULL OR plan IN ('starter', 'professional'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_subscription_status_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_status_check
      CHECK (subscription_status IS NULL OR subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'paused'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_billing_interval_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_billing_interval_check
      CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'yearly'));
  END IF;
END$$;

-- 3. payment_events: append-only audit log of Mollie webhook events
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  mollie_payment_id text,
  mollie_subscription_id text,
  mollie_customer_id text,
  event_type text NOT NULL,
  status text,
  amount_eur numeric(10,2),
  currency text NOT NULL DEFAULT 'EUR',
  description text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_events_owner_id_created_at_idx
  ON public.payment_events (owner_id, created_at DESC);

-- Idempotency: webhook may fire the same event multiple times; we want exactly one row per (payment, event_type)
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_mollie_payment_event_type_uniq
  ON public.payment_events (mollie_payment_id, event_type)
  WHERE mollie_payment_id IS NOT NULL;

-- 4. payment_invoices: Vellu's invoices to salon owners (VAT-compliant)
CREATE TABLE IF NOT EXISTS public.payment_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_event_id uuid REFERENCES public.payment_events(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  period_start date,
  period_end date,
  plan text,
  billing_interval text,
  amount_excl_vat numeric(10,2) NOT NULL,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.21,
  vat_amount numeric(10,2) NOT NULL,
  total_eur numeric(10,2) NOT NULL,
  pdf_url text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_invoices_owner_id_issued_at_idx
  ON public.payment_invoices (owner_id, issued_at DESC);

-- 5. Sequence + atomic invoice-number function for Vellu's own invoices
CREATE SEQUENCE IF NOT EXISTS public.vellu_invoice_seq START 1;

CREATE OR REPLACE FUNCTION public.get_next_vellu_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr text;
  n bigint;
BEGIN
  yr := to_char(now() AT TIME ZONE 'Europe/Amsterdam', 'YYYY');
  n := nextval('public.vellu_invoice_seq');
  RETURN 'VEL-' || yr || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_next_vellu_invoice_number() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_vellu_invoice_number() TO service_role;

-- 6. RLS on the new tables
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read own payment events" ON public.payment_events;
CREATE POLICY "Owners read own payment events"
  ON public.payment_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners read own invoices" ON public.payment_invoices;
CREATE POLICY "Owners read own invoices"
  ON public.payment_invoices
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

-- (no INSERT/UPDATE/DELETE policies for authenticated → only service_role writes)

-- 7. Helpful indexes for cron jobs (trial expiry, billing renewals)
CREATE INDEX IF NOT EXISTS profiles_subscription_status_idx
  ON public.profiles (subscription_status)
  WHERE subscription_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_trial_ends_at_idx
  ON public.profiles (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL AND subscription_status = 'trialing';

CREATE INDEX IF NOT EXISTS profiles_plan_expires_at_idx
  ON public.profiles (plan_expires_at)
  WHERE plan_expires_at IS NOT NULL;
