
-- Atomic invoice number increment (prevents race conditions with concurrent sends)
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(owner_id_param uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  UPDATE profiles
  SET next_invoice_number = COALESCE(next_invoice_number, 1) + 1
  WHERE id = owner_id_param
  RETURNING next_invoice_number - 1 INTO next_num;
  RETURN COALESCE(next_num, 1);
END;
$$;

-- Atomic no-show count increment (prevents race conditions)
CREATE OR REPLACE FUNCTION public.increment_no_show_count(client_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET no_show_count = COALESCE(no_show_count, 0) + 1
  WHERE id = client_id_param;
END;
$$;

-- Also add index for booking slot queries (most frequent query pattern)
CREATE INDEX IF NOT EXISTS idx_appointments_owner_date_status 
ON public.appointments (owner_id, date, status);

-- Add index for staff appointment queries
CREATE INDEX IF NOT EXISTS idx_appointments_staff_date 
ON public.appointments (staff_id, date) WHERE staff_id IS NOT NULL;
