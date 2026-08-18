-- 2026-08-17 — Twee gaten die de audit-fixes zelf openlieten
--
-- ── 1. Bevinding 9 was maar half gedicht ────────────────────────────────────
-- De nieuwe view public_reviews haalt client_email uit de publieke payload,
-- maar de tabel reviews hield de policy "Public can read reviews" (SELECT,
-- using true). Wie zelf /rest/v1/reviews?select=* aanroept met de anon-sleutel
-- kreeg het e-mailadres van elke reviewer alsnog gewoon terug — de view is een
-- nettere deur, geen slot.
--
-- Weghalen kan veilig, want beide overgebleven lezers hebben hun eigen route:
--   * de eigenaar leest zijn reviews via policy "Owner manages reviews"
--     (ALL, owner_id = auth.uid()) — src/OwnerApp.jsx leest de tabel direct;
--   * de publieke pagina leest public_reviews, en die view draait zonder
--     security_invoker, dus met de rechten van de view-eigenaar. RLS op de
--     onderliggende tabel raakt hem niet.
drop policy if exists "Public can read reviews" on public.reviews;

-- ── 2. Bevinding 7 werkte alleen vooruit ────────────────────────────────────
-- Nieuwe annuleertokens krijgen voortaan het startmoment van de afspraak als
-- vervaldatum, maar de tokens die er al liggen houden hun oude waarde
-- (starttijd − 24 uur). Een klant met een afspraak morgenochtend klikt dus nog
-- steeds op "verlopen", precies de klacht die de fix moest wegnemen.
--
-- Datum en tijd van een afspraak staan in de klok van de SALON; AT TIME ZONE
-- met de zone van het land rekent dat om naar een echt moment. Dezelfde tabel
-- als TZ_BY_COUNTRY in de edge-functies (de ABC/BES-eilanden en Sint Maarten
-- delen America/Curacao, zonder zomertijd).
--
-- Alleen toekomstige, ongebruikte tokens; en alleen als het nieuwe moment
-- LATER ligt, zodat een token nooit per ongeluk langer geldig wordt dan de
-- afspraak zelf duurt.
with nieuw as (
  select t.token,
         ((a.date::text || ' ' || a.time)::timestamp
            at time zone (case
              when p.country_code in ('AW', 'CW', 'BQ', 'SX') then 'America/Curacao'
              when p.country_code = 'BE' then 'Europe/Brussels'
              when p.country_code = 'GB' then 'Europe/London'
              else 'Europe/Amsterdam'
            end)) as start_moment
    from public.cancellation_tokens t
    join public.appointments a on a.id = t.appointment_id
    join public.profiles p on p.id = a.owner_id
   where coalesce(t.used, false) = false
     and a.date >= current_date
     and a.time is not null
)
update public.cancellation_tokens t
   set expires_at = nieuw.start_moment
  from nieuw
 where t.token = nieuw.token
   and t.expires_at < nieuw.start_moment;
