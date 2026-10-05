-- O6 (O6-01): elk factuurprofiel van een salon heeft een EIGEN voorvoegsel.
--
-- Een nieuw extra factuurprofiel kreeg "INV" mee, hetzelfde voorvoegsel als het
-- hoofdprofiel, en een eigen teller vanaf 1. De eerste factuur onder dat
-- profiel kreeg dan INV-0001, een nummer dat een andere klant al had. De app
-- geeft een nieuw profiel nu een eigen voorvoegsel en toont een melding bij een
-- dubbel voorvoegsel; deze trigger laat de database een opslag weigeren die er
-- een dubbel voorvoegsel BIJ maakt.
--
-- Regels (gelijk aan de app): leeg voorvoegsel telt als 'INV' (zo nummert
-- sendInvoiceWith), hoofdletterongevoelig, spaties eromheen tellen niet.
-- Alleen een wijziging die een voorvoegsel vaker laat voorkomen dan vóór de
-- wijziging wordt geweigerd. Een teller ophogen (next_invoice_number in
-- invoice_profiles), een profiel verwijderen of een bestaande situatie laten
-- staan gaat dus altijd door, ook bij een salon die al een dubbel had.
-- Live (05-10) heeft alleen TTNB extra profielen, met eigen voorvoegsels
-- (TT-E / TT-L): er bestaat geen dubbel.

create or replace function public.invoice_prefixes_of(p_main text, p_extras jsonb)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[upper(coalesce(nullif(btrim(p_main), ''), 'INV'))]
    || coalesce((
      select array_agg(upper(coalesce(nullif(btrim(x->>'invoice_prefix'), ''), 'INV')) order by o)
        from jsonb_array_elements(case when jsonb_typeof(p_extras) = 'array' then p_extras else '[]'::jsonb end)
             with ordinality as t(x, o)
    ), '{}'::text[]);
$$;

create or replace function public.profiles_invoice_prefix_unique()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_new text[] := public.invoice_prefixes_of(new.invoice_prefix, new.invoice_profiles);
  v_old text[] := case when tg_op = 'UPDATE'
                       then public.invoice_prefixes_of(old.invoice_prefix, old.invoice_profiles)
                       else '{}'::text[] end;
  v_dup text;
begin
  select n.p into v_dup
    from (select p, count(*) as c from unnest(v_new) as u(p) group by p) n
   where n.c > 1
     and n.c > (select count(*) from unnest(v_old) as o(p) where o.p = n.p)
   limit 1;
  if v_dup is not null then
    raise exception 'duplicate_invoice_prefix: %', v_dup
      using hint = 'Every invoice profile of a salon needs its own invoice prefix.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_invoice_prefix_unique on public.profiles;
create trigger profiles_invoice_prefix_unique
  before insert or update of invoice_prefix, invoice_profiles on public.profiles
  for each row execute function public.profiles_invoice_prefix_unique();

-- De trigger draait als de aanroeper (eigenaar via PostgREST, of een
-- SECURITY DEFINER-functie); die moet de hulpfunctie kunnen uitvoeren. Anon
-- schrijft nooit in profiles en hoeft hem niet.
revoke all on function public.invoice_prefixes_of(text, jsonb) from public, anon;
grant execute on function public.invoice_prefixes_of(text, jsonb) to authenticated, service_role;
revoke all on function public.profiles_invoice_prefix_unique() from public, anon, authenticated;
