-- Boekingsbeleid in het Spaans (audit 05-10, punt 7). Spaanstalige klanten
-- zagen tot nu toe de Engelse tekst. Leeg = de boekingspagina valt terug op
-- booking_policy_en en daarna booking_policy. De kolom komt achteraan in
-- public_salons (zelfde aanpak als deactivated op 23-10).
alter table public.profiles add column if not exists booking_policy_es text;

comment on column public.profiles.booking_policy_es is
  'Booking & cancellation policy in Spanish. Shown to clients when lang=es. Falls back to booking_policy_en, then booking_policy, when empty.';

do $view$
declare
  d text := pg_get_viewdef('public.public_salons'::regclass, true);
  n text;
begin
  n := replace(d, 'deactivated_at IS NOT NULL AS deactivated', 'deactivated_at IS NOT NULL AS deactivated,' || chr(10) || '    booking_policy_es');
  if n = d then raise exception 'public_salons: deactivated-kolom niet gevonden'; end if;
  execute 'create or replace view public.public_salons as ' || n;
end
$view$;
