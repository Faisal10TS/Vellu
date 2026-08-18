CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  date date NOT NULL,
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_phone text,
  service_ids uuid[] DEFAULT ARRAY[]::uuid[],
  notes text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','booked','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

CREATE INDEX IF NOT EXISTS waitlist_owner_status_idx ON public.waitlist(owner_id, status);
CREATE INDEX IF NOT EXISTS waitlist_owner_date_idx ON public.waitlist(owner_id, date);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone can add themselves to the waitlist (public booking page).
DROP POLICY IF EXISTS waitlist_public_insert ON public.waitlist;
CREATE POLICY waitlist_public_insert ON public.waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Owner can see + manage their own waitlist.
DROP POLICY IF EXISTS waitlist_owner_select ON public.waitlist;
CREATE POLICY waitlist_owner_select ON public.waitlist
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS waitlist_owner_update ON public.waitlist;
CREATE POLICY waitlist_owner_update ON public.waitlist
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS waitlist_owner_delete ON public.waitlist;
CREATE POLICY waitlist_owner_delete ON public.waitlist
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Staff can see waitlist entries for their salon so they can spot opportunities.
DROP POLICY IF EXISTS waitlist_staff_select ON public.waitlist;
CREATE POLICY waitlist_staff_select ON public.waitlist
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.owner_id = waitlist.owner_id
      AND sm.user_id = auth.uid()
  ));