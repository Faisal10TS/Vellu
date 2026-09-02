-- 2026-09-02 — Verjaardagscode handmatig aanmaken (verzoek TTNB)
--
-- De persoonlijke code stond alleen in de mail aan de klant; de salon kon hem
-- nergens zien en dus niet zelf (via WhatsApp) doorsturen — en als de
-- verjaardag pas ná de ochtendrun is ingevuld bestaat er helemaal geen code.
-- Deze RPC maakt er een aan met exact dezelfde regels als send-birthday-emails:
-- prefix + percentage uit het profiel, willekeurige staart zonder I/O/0/1,
-- geldig tot het einde van de maand, en een lopende ongebruikte code van
-- hetzelfde adres wordt hergebruikt (één verjaardag = één code). Owner-gebonden
-- via auth.uid(); schrijven blijft verder exclusief voor de service_role.
create or replace function public.create_birthday_code(p_email text)
returns table (code text, discount_pct numeric, expires_on date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  uuid := auth.uid();
  v_prefix text;
  v_pct    integer;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_exp    date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_code   text;
  v_suffix text;
  i        integer;
begin
  if v_owner is null then raise exception 'not_authenticated'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  select coalesce(nullif(left(regexp_replace(upper(coalesce(p.birthday_email_code_prefix, 'BDAY')), '[^A-Z0-9]', '', 'g'), 8), ''), 'BDAY'),
         p.birthday_email_discount_pct
    into v_prefix, v_pct
    from public.profiles p where p.id = v_owner;
  if v_pct is null then raise exception 'no_discount_pct'; end if;

  select b.code into v_code
    from public.birthday_discount_codes b
   where b.owner_id = v_owner and b.client_email = v_email
     and b.used_at is null and b.expires_on >= current_date and b.discount_pct = v_pct
   order by b.expires_on desc limit 1;
  if v_code is not null then
    update public.birthday_discount_codes b set expires_on = v_exp
     where b.owner_id = v_owner and b.code = v_code;
    return query select v_code, v_pct::numeric, v_exp;
    return;
  end if;

  for i in 1..8 loop
    v_suffix := '';
    while length(v_suffix) < 5 loop
      v_suffix := v_suffix || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    v_code := v_prefix || '-' || v_pct || '-' || v_suffix;
    begin
      insert into public.birthday_discount_codes (owner_id, code, client_email, discount_pct, expires_on)
      values (v_owner, v_code, v_email, v_pct, v_exp);
      return query select v_code, v_pct::numeric, v_exp;
      return;
    exception when unique_violation then
      null; -- naam bezet (andere klant of gelijktijdige cron-run): nieuwe staart
    end;
  end loop;
  raise exception 'code_collision';
end;
$$;

revoke all on function public.create_birthday_code(text) from public;
grant execute on function public.create_birthday_code(text) to authenticated;
