
-- Tighten cancellation_tokens UPDATE: only allow setting used=true
DROP POLICY IF EXISTS "Public can update tokens" ON public.cancellation_tokens;
CREATE POLICY "Public can update tokens" ON public.cancellation_tokens
  FOR UPDATE USING (true) WITH CHECK (used = true);

-- Tighten client_tokens UPDATE: only allow setting used=true  
DROP POLICY IF EXISTS "Token update" ON public.client_tokens;
CREATE POLICY "Token update" ON public.client_tokens
  FOR UPDATE USING (true) WITH CHECK (used = true);
