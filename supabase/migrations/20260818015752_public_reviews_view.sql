-- 2026-08-17 — Reviews publiek: het e-mailadres van de klant lekte mee
--
-- WAAROM: src/App.jsx haalde de reviews op met select("*") en de policy
-- "Public can read reviews" staat op using(true). Elke bezoeker van
-- vellu.cc/<salon> kreeg dus client_email en appointment_id in zijn
-- netwerk-tab, terwijl de pagina daar niets van toont: alleen de voornaam,
-- de sterren, de tekst en hoe lang geleden. Zelfde patroon als
-- public_salons/public_staff: een view met precies de publieke kolommen,
-- zodat de tabel zelf nooit rechtstreeks over de anon-lijn hoeft.
--
-- De view is bewust GEEN security_invoker-view (net als public_salons en
-- public_staff): hij draait als eigenaar en omzeilt daarmee RLS op reviews.
-- Dat is precies de bedoeling — de kolomkeuze hieronder ís de afscherming.

create or replace view public.public_reviews as
  select
    -- Eigen id van de review: nodig als React-key, verwijst naar niemand.
    r.id,
    -- De frontend filtert op owner_id; dat is de profiel-id die via
    -- public_salons.id toch al publiek is. Geen extra informatie dus.
    r.owner_id,
    -- Alleen de voornaam gaat de deur uit. De UI toonde al
    -- client_name.split(" ")[0], maar downloadde daarvoor wél de volledige
    -- achternaam. Nu komt de achternaam niet eens meer over de lijn.
    split_part(btrim(r.client_name), ' ', 1) as client_name,
    r.rating,
    r.comment,
    r.created_at
  from public.reviews r;

-- NIET opgenomen en dat blijft zo: client_email (het lek zelf) en
-- appointment_id (daarmee is een review aan een concrete afspraak — en dus
-- aan een persoon, datum en dienst — te koppelen).

grant select on public.public_reviews to anon, authenticated;
