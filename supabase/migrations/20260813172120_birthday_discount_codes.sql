-- 2026-08-13 — Verjaardagskortingscodes: publiek lek dichten + eigen tabel
--
-- WAT ER FOUT WAS
-- De verjaardagsmail zette zijn kortingscode in profiles.discount_codes met
-- active = true. De view public_salons levert álle actieve codes ongefilterd uit
-- aan anonieme bezoekers (jsonb_agg over de codes waar active waar is) en
-- src/ClientApp.jsx leest ze zo in. Daardoor:
--   1. was een persoonlijke code als BDAY-ESTHER-15 door iedereen inwisselbaar;
--   2. lekte de codestring de eerste zes tekens van het e-mailadres van een klant
--      naar iedere willekeurige bezoeker van de salonpagina;
--   3. wiste de eigenaar die codes bij het opslaan van zijn instellingen —
--      src/OwnerApp.jsx schrijft `discount_codes: salonData.discount_codes || []`
--      uit state die 's ochtends is ingeladen, dus alle codes van die dag
--      verdwenen terwijl de klanten de mail al hadden.
--
-- WAAROM EEN APARTE TABEL EN NIET ALLEEN EEN FILTER OP DE VIEW
-- Een filter op de view lost alleen (1) en (2) op. Probleem (3) is een
-- last-write-wins op één jsonb-kolom die twee partijen (de eigenaar via de UI,
-- de cron via de edge-functie) volledig overschrijven; dat is met geen enkele
-- filter te repareren zolang beide in dezelfde kolom schrijven — en OwnerApp.jsx
-- mag hier niet aangeraakt worden. Eén rij per code in een eigen tabel haalt de
-- twee schrijvers uit elkaars vaarwater, maakt uniciteit afdwingbaar met een
-- constraint in plaats van met hoop, en zet het e-mailadres van de ontvanger als
-- echte kolom naast de code. De view-filter hieronder blijft er tóch in als
-- vangnet voor oude rijen en voor een half uitgerolde versie van de cron.

-- ---------------------------------------------------------------------------
-- 1. Eigen tabel voor verjaardagscodes
-- ---------------------------------------------------------------------------
-- Zelfde vorm als birthday_email_log (owner_id -> profiles, cascade delete, RLS
-- aan zonder policies = uitsluitend de service_role komt erbij). De code is
-- persoonlijk: client_email is NOT NULL, want een verjaardagscode zonder
-- ontvanger is precies het lek dat we dichten.
create table if not exists public.birthday_discount_codes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  code         text not null,
  client_email text not null,
  discount_pct numeric not null,
  expires_on   date not null,
  created_at   timestamptz not null default now(),
  -- Twee klanten met dezelfde eerste zes tekens vóór de @ kregen exact dezelfde
  -- code. Deze constraint is de enige plek waar dat écht niet meer kan: de
  -- edge-functie botst op 23505 en genereert dan een variant, in plaats van
  -- stilletjes de code van iemand anders te overschrijven of te hergebruiken.
  constraint birthday_discount_codes_owner_code_key unique (owner_id, code)
);

-- book-appointment zoekt op (owner_id, code); dat gaat via de unique index.
-- De opruimpas zoekt op expires_on over alle salons heen.
create index if not exists birthday_discount_codes_expires_idx
  on public.birthday_discount_codes (expires_on);

-- Zelfde e-mailadres normaliseren als overal elders (book-appointment maakt het
-- adres van de boeker lowercase voordat het vergelijkt).
create index if not exists birthday_discount_codes_owner_email_idx
  on public.birthday_discount_codes (owner_id, client_email);

alter table public.birthday_discount_codes enable row level security;
-- Bewust GEEN policies: net als birthday_email_log is deze tabel alleen voor de
-- service_role (send-birthday-emails schrijft, book-appointment leest). anon en
-- authenticated krijgen nul rijen te zien — dat is het hele punt.
revoke all on public.birthday_discount_codes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. public_salons: verjaardagscodes uit de publieke uitlevering filteren
-- ---------------------------------------------------------------------------
-- Exact de bestaande definitie, met één extra voorwaarde in de discount_codes-
-- subquery. Alles anders (kolomvolgorde, payment_configured, de active-filter)
-- blijft ongewijzigd, zodat App.jsx/ClientApp.jsx niets merken.
-- book-appointment leest profiles met de service_role en ziet dus nog steeds
-- alles — de filter raakt uitsluitend het anonieme pad.
create or replace view public.public_salons as
 SELECT id,
    slug,
    business_name,
    owner_name,
    city,
    country_code,
    address,
    accent_color,
    business_hours,
    account_type,
    page_font,
    slot_interval_minutes,
    show_owner_on_booking,
    booking_policy,
    booking_policy_en,
    salon_phone,
    salon_instagram,
    salon_email,
    whatsapp_number,
    phone_required,
    waitlist_enabled,
    break_minutes,
    logo_url,
    cover_image_url,
    cover_focal_y,
    day_overrides,
    min_advance_hours,
    max_advance_days,
    directory_visible,
    subscription_status,
    created_at,
    referral_code,
    (payment_link IS NOT NULL OR iban IS NOT NULL) AS payment_configured,
    ( SELECT COALESCE(jsonb_agg(c.value), '[]'::jsonb) AS "coalesce"
           FROM jsonb_array_elements(COALESCE(profiles.discount_codes, '[]'::jsonb)) c(value)
          WHERE ((c.value ->> 'active'::text)::boolean) IS TRUE
            -- Verjaardagscodes zijn persoonlijk en horen nooit in een publieke
            -- payload: de code zelf verklapt het e-mailadres van de klant en
            -- iedere bezoeker zou hem kunnen inwisselen.
            AND (c.value ->> 'source'::text) IS DISTINCT FROM 'birthday') AS discount_codes
   FROM profiles;

-- ---------------------------------------------------------------------------
-- 3. Eenmalige opruiming van al weggeschreven verjaardagscodes
-- ---------------------------------------------------------------------------
-- Vanaf nu is birthday_discount_codes de enige bron; wat er in profiles staat is
-- restant van de vorige ronde en blijft anders eeuwig inwisselbaar (voor
-- iedereen, want book-appointment leest die lijst met de service_role). Op dit
-- moment is dit een no-op — geverifieerd: 0 van de 5 profielen heeft zo'n code —
-- maar hij hoort erin voor het geval de oude cron ergens wél gedraaid heeft.
update public.profiles
   set discount_codes = (
         select coalesce(jsonb_agg(c.value), '[]'::jsonb)
           from jsonb_array_elements(coalesce(discount_codes, '[]'::jsonb)) c(value)
          where (c.value ->> 'source') is distinct from 'birthday'
       )
 where discount_codes @> '[{"source":"birthday"}]'::jsonb;

-- ---------------------------------------------------------------------------
-- 4. RPC voor de publieke boekingspagina
-- ---------------------------------------------------------------------------
-- De klant krijgt haar code per mail en typt hem in het kortingsveld. Omdat de
-- code nu niet meer in de publieke payload zit, kan ClientApp hem niet meer zelf
-- terugvinden en zou hij als "ongeldige code" worden afgewezen vóór er ook maar
-- iets naar book-appointment gaat. Deze functie is de enige toegestane manier om
-- dat te controleren: hij geeft niets prijs zonder dat de beller de code én het
-- bijbehorende e-mailadres al kent, en levert alleen het kortingsbedrag terug —
-- nooit het adres, nooit een lijst. Dezelfde toets als in book-appointment,
-- zodat frontend en server niet uiteen kunnen lopen.
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
     -- Een dag speling, precies zoals book-appointment die aanhoudt. current_date
     -- staat hier in UTC, terwijl de Cariben op UTC-4 zitten: op de laatste
     -- geldigheidsdag is het na 20:00 lokale tijd in Bonaire al "morgen" voor de
     -- database. Zonder deze speling zegt de boekingspagina dan "ongeldige code"
     -- terwijl de server hem een seconde later wél zou accepteren.
     and b.expires_on >= (current_date - 1)
   limit 1;
$$;

revoke all on function public.validate_birthday_discount(text, text, text) from public;
grant execute on function public.validate_birthday_discount(text, text, text) to anon, authenticated, service_role;
