-- Anonieme reviews + "stuur mijn reviewlink" (edge function request-review-link).
--
-- 1. Vlag op reviews. De naam blijft in de rij staan (koppeling met de
--    afspraak, misbruik), maar wordt nergens meer getoond zodra anonymous = true.
alter table public.reviews add column if not exists anonymous boolean not null default false;

-- 2. Publieke view: geen naam zodra anoniem; de vlag gaat mee zodat de pagina
--    een vertaald "Anoniem" kan tonen. Nieuwe kolom achteraan — create or
--    replace view mag bestaande kolommen niet verschuiven of hernoemen.
create or replace view public.public_reviews as
  select r.id,
         r.owner_id,
         case when r.anonymous then null else split_part(btrim(r.client_name), ' '::text, 1) end as client_name,
         r.rating,
         r.comment,
         r.created_at,
         r.anonymous
  from public.reviews r;
grant select on public.public_reviews to anon, authenticated;

-- 3. submit_review krijgt p_anonymous. De oude signatuur moet eerst weg: met
--    een default-parameter erbij zou een aanroep met drie argumenten anders op
--    twee functies passen (dubbelzinnig) — zie get_or_create_client, 04-09.
drop function if exists public.submit_review(text, integer, text);
create function public.submit_review(p_token text, p_rating integer, p_comment text default null, p_anonymous boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tok  public.review_tokens%rowtype;
  v_name text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  -- FOR UPDATE: dubbele tap mag nooit twee reviews opleveren.
  select * into v_tok from public.review_tokens where token = p_token for update;
  if not found then raise exception 'invalid_token'; end if;
  if v_tok.used_at is not null then raise exception 'token_used'; end if;
  if v_tok.expires_at < now() then raise exception 'token_expired'; end if;

  -- Naam uit de afspraak, niet uit het formulier.
  select nullif(btrim(a.client_name), '') into v_name
    from public.appointments a where a.id = v_tok.appointment_id;
  v_name := coalesce(v_name, split_part(v_tok.client_email, '@', 1));

  insert into public.reviews (appointment_id, owner_id, client_name, client_email, rating, comment, anonymous)
  values (v_tok.appointment_id, v_tok.owner_id, v_name,
          lower(btrim(v_tok.client_email)), p_rating,
          nullif(btrim(coalesce(p_comment, '')), ''),
          coalesce(p_anonymous, false));

  update public.review_tokens set used_at = now() where token = p_token;
end;
$$;
revoke all on function public.submit_review(text, integer, text, boolean) from public;
grant execute on function public.submit_review(text, integer, text, boolean) to anon, authenticated, service_role;
