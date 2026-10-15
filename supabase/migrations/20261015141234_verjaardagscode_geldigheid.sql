-- Verjaardagscode: hoe lang hij geldig is kiest de salon zelf (TTNB
-- 15-10-2026: "Kon largu e por ta geldig na esun di loyalty card. Pero esun di
-- birthday no."). Tot nu toe gold een verjaardagscode vast tot het einde van de
-- maand waarin hij gemaakt werd: wie op de 28e jarig is, had drie dagen.
-- profiles.birthday_code_days:
--   NULL = zoals altijd, t/m de laatste dag van die maand ("Deze maand");
--   anders het aantal dagen vanaf het maken, met dezelfde rekenregel als de
--   stempelkaart (current_date + dagen).
-- Gebruikt door create_birthday_code (hieronder) en send-birthday-emails.
-- Een bestaande open code hergebruiken verkort de geldigheid niet meer
-- (greatest): wie de instelling inkort, pakt een klant geen dagen af.
alter table public.profiles add column birthday_code_days integer
  check (birthday_code_days is null or birthday_code_days between 7 and 365);

create or replace function public.create_birthday_code(p_email text)
 returns table(code text, discount_pct numeric, expires_on date)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_owner  uuid := auth.uid();
  v_prefix text;
  v_pct    integer;
  v_days   integer;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_exp    date;
  v_kept   date;
  v_code   text;
  v_suffix text;
  i        integer;
begin
  if v_owner is null then raise exception 'not_authenticated'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  select coalesce(nullif(left(regexp_replace(upper(coalesce(p.birthday_email_code_prefix, 'BDAY')), '[^A-Z0-9]', '', 'g'), 8), ''), 'BDAY'),
         p.birthday_email_discount_pct,
         p.birthday_code_days
    into v_prefix, v_pct, v_days
    from public.profiles p where p.id = v_owner;
  if v_pct is null then raise exception 'no_discount_pct'; end if;
  v_exp := case
             when v_days is null then (date_trunc('month', current_date) + interval '1 month - 1 day')::date
             else current_date + greatest(7, least(365, v_days))
           end;

  -- Alleen een open VERJAARDAGScode hergebruiken: een stempelkaartcode met
  -- hetzelfde percentage is een andere beloning.
  select b.code into v_code
    from public.birthday_discount_codes b
   where b.owner_id = v_owner and b.client_email = v_email and b.kind = 'birthday'
     and b.used_at is null and b.expires_on >= current_date and b.discount_pct = v_pct
   order by b.expires_on desc limit 1;
  if v_code is not null then
    update public.birthday_discount_codes b set expires_on = greatest(b.expires_on, v_exp)
     where b.owner_id = v_owner and b.code = v_code and b.kind = 'birthday'
     returning b.expires_on into v_kept;
    return query select v_code, v_pct::numeric, coalesce(v_kept, v_exp);
    return;
  end if;

  for i in 1..8 loop
    v_suffix := '';
    while length(v_suffix) < 5 loop
      v_suffix := v_suffix || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    v_code := v_prefix || '-' || v_pct || '-' || v_suffix;
    begin
      insert into public.birthday_discount_codes (owner_id, code, client_email, discount_pct, expires_on, kind)
      values (v_owner, v_code, v_email, v_pct, v_exp, 'birthday');
      return query select v_code, v_pct::numeric, v_exp;
      return;
    exception when unique_violation then
      null; -- naam bezet (andere klant of gelijktijdige cron-run): nieuwe staart
    end;
  end loop;
  raise exception 'code_collision';
end;
$function$;
