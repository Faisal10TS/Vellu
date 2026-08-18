-- 2026-08-15 — Verjaardagscode: eenmalig gebruik + inzage voor de eigenaar
--
-- 1. used_at: een verjaardagskorting is een cadeau voor één boeking, geen
--    maandabonnement op korting. book-appointment zet de stempel bij een
--    geslaagde boeking en weigert een gestempelde code daarna.
alter table public.birthday_discount_codes
  add column if not exists used_at timestamptz,
  add column if not exists used_by_appointment uuid;

-- 2. De RPC van de boekingspagina telt gebruikte codes niet meer mee — zelfde
--    toets als de server, zodat de klant "al gebruikt" niet pas bij het
--    versturen ontdekt.
create or replace function public.validate_birthday_discount(
  p_slug  text,
  p_code  text,
  p_email text
) returns table (code text, amount numeric, type text)
language sql
security definer
set search_path = public
as $$
  select b.code, b.discount_pct as amount, 'percent'::text as type
    from public.birthday_discount_codes b
    join public.profiles p on p.id = b.owner_id
   where p.slug = p_slug
     and b.code = upper(btrim(p_code))
     and b.client_email = lower(btrim(p_email))
     and b.used_at is null
     -- Een dag speling, precies zoals book-appointment (UTC vs Cariben UTC-4).
     and b.expires_on >= (current_date - 1)
   limit 1;
$$;

-- 3. De eigenaar kon uitstaande codes nergens inzien ("mijn code doet het
--    niet" aan de telefoon = niets kunnen opzoeken). Alleen SELECT op eigen
--    rijen; schrijven blijft exclusief voor de service_role (de cron stempelt
--    en ruimt op, de eigenaar kijkt alleen).
create policy "eigenaar leest eigen verjaardagscodes"
  on public.birthday_discount_codes
  for select to authenticated
  using (owner_id = auth.uid());

-- Zonder table-grant is de policy dood: migratie 20260813120000 deed
-- "revoke all ... from anon, authenticated", en RLS-policies werken pas als
-- de rol óók het gewone SELECT-privilege heeft. Alleen SELECT teruggeven;
-- schrijven blijft exclusief voor de service_role.
grant select on public.birthday_discount_codes to authenticated;
