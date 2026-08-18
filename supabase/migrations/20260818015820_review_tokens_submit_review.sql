-- 2026-08-17 — Een review achterlaten kon in de praktijk nooit slagen
--
-- WAAROM (de huidige policy "Clients with completed appointments can review"):
--   with_check = owner_id is not null
--                and rating between 1 and 5
--                and client_email is not null and client_email <> ''
--                and exists (select 1 from appointments a
--                             where a.owner_id = reviews.owner_id
--                               and a.client_email = reviews.client_email
--                               and a.status = 'completed')
-- Beide paden in de app halen die eisen niet:
--   1. De review-uitnodiging uit de mail rendert ClientApp met
--      reviewEmail="" (src/App.jsx geeft dat letterlijk zo mee, bewust: een
--      ?email=-parameter is triviaal te vervalsen). De insert stuurt dus een
--      leeg adres mee en botst op client_email <> ''.
--   2. Het formulier direct ná het boeken stuurt wél het adres mee, maar de
--      zojuist gemaakte afspraak staat op 'confirmed' — niet 'completed' —
--      dus de exists-toets faalt.
-- Netto: 100% van de inserts wordt geweigerd, elke klant ziet
-- "opslaan mislukt". En omgekeerd was de policy een impersonatie-lek: wie het
-- e-mailadres van een klant van die salon kende, kon een review op diens naam
-- plaatsen zodra die klant één afgeronde afspraak had.
--
-- OPLOSSING: de identiteit komt niet langer uit clientinvoer maar uit een
-- token dat de server (send-followups) per afspraak aanmaakt en mailt. De
-- client kent alleen het token; het adres en de salon zitten aan de
-- serverkant eraan vast.

create table if not exists public.review_tokens (
  token          text primary key,
  appointment_id uuid references public.appointments(id) on delete cascade,
  owner_id       uuid references public.profiles(id) on delete cascade,
  -- Dit adres is de hele reden dat het token bestaat: het is de identiteit
  -- die submit_review straks gebruikt. Zonder adres heeft een token geen zin.
  client_email   text not null,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);

-- Eén uitnodiging per afspraak. Zou de followup-cron een afspraak ooit twee
-- keer verwerken, dan levert dat anders een tweede geldig token op en dus een
-- tweede review voor dezelfde behandeling.
create unique index if not exists review_tokens_appointment_uniq
  on public.review_tokens (appointment_id)
  where appointment_id is not null;

-- Verlopen/gebruikte tokens opruimen gaat per salon; hierop wordt gezocht.
create index if not exists review_tokens_owner_idx
  on public.review_tokens (owner_id);

alter table public.review_tokens enable row level security;

-- Bewust GEEN policies. Het token ís het geheim: kon anon deze tabel lezen,
-- dan haalt iedereen alle openstaande tokens op en schrijft reviews namens
-- willekeurige klanten. service_role negeert RLS en maakt de rijen aan;
-- submit_review leest ze als SECURITY DEFINER. Ook de table-grants weg, want
-- Supabase geeft anon/authenticated standaard alles op nieuwe tabellen.
revoke all on public.review_tokens from anon, authenticated;

-- De inwisselfunctie. p_token is het enige wat de bezoeker meestuurt dat over
-- identiteit gaat — naam en e-mailadres worden er hier aan de serverkant bij
-- gezocht, zodat "wie ben ik" nooit uit het formulier komt.
create or replace function public.submit_review(
  p_token   text,
  p_rating  int,
  p_comment text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tok  public.review_tokens%rowtype;
  v_name text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  -- FOR UPDATE: twee keer op "versturen" drukken (of een dubbele tap op
  -- mobiel) mag geen twee reviews opleveren. De tweede transactie wacht hier
  -- en ziet daarna used_at staan.
  select * into v_tok from public.review_tokens where token = p_token for update;
  if not found then
    raise exception 'invalid_token';
  end if;
  if v_tok.used_at is not null then
    raise exception 'token_used';
  end if;
  if v_tok.expires_at < now() then
    raise exception 'token_expired';
  end if;

  -- Ook de naam komt uit de afspraak en niet uit het formulier: met een
  -- geldig token zou je anders nog altijd een willekeurige naam boven je
  -- review kunnen zetten. Is de afspraak inmiddels verwijderd, dan valt de
  -- naam terug op het deel vóór de @ — reviews.client_name is NOT NULL.
  select nullif(btrim(a.client_name), '')
    into v_name
    from public.appointments a
   where a.id = v_tok.appointment_id;
  v_name := coalesce(v_name, split_part(v_tok.client_email, '@', 1));

  insert into public.reviews (appointment_id, owner_id, client_name, client_email, rating, comment)
  values (
    v_tok.appointment_id,
    v_tok.owner_id,
    v_name,
    lower(btrim(v_tok.client_email)),
    p_rating,
    nullif(btrim(coalesce(p_comment, '')), '')
  );

  update public.review_tokens set used_at = now() where token = p_token;
end;
$$;

-- Alleen via deze functie mag anon reviews schrijven.
revoke all on function public.submit_review(text, int, text) from public;
grant execute on function public.submit_review(text, int, text) to anon, authenticated;

-- De oude directe-insert-policy kan weg. Er is geen enkel pad in de app dat
-- er doorheen komt (zie de analyse bovenaan), dus dit breekt niets — het
-- sluit alleen het impersonatie-gat: nu kan niemand meer een review namens
-- iemand anders plaatsen door diens e-mailadres in te typen. Vanaf hier loopt
-- schrijven uitsluitend via submit_review.
drop policy if exists "Clients with completed appointments can review" on public.reviews;
