-- 2026-09-04 — Verjaardag meegeven bij een handmatig toegevoegde afspraak
--
-- De publieke boekingspagina kan sinds 02-09 optioneel een verjaardag vragen,
-- maar zette een salon zélf een afspraak in de agenda ("+ Afspraak" → Nieuwe
-- klant), dan was er nergens een veld — terwijl juist dáár de meeste klanten
-- van TTNB/Eydy vandaan komen (telefonisch/WhatsApp geboekt). Deze RPC maakt de
-- klantrij aan; zonder parameter kon de verjaardag er niet in.
--
-- De oude 5-parameterversie wordt gedropt: laten staan zou twee functies met
-- dezelfde naam opleveren en een aanroep met 5 argumenten ambigu maken.
drop function if exists public.get_or_create_client(text, text, text, text, text);

create or replace function public.get_or_create_client(
  p_email     text,
  p_first     text default ''::text,
  p_last      text default ''::text,
  p_phone     text default null::text,
  p_allergies text default null::text,
  p_birthday  date default null::date
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  p_email := lower(trim(p_email));
  IF p_email IS NULL OR p_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;
  SELECT id INTO v_id FROM clients WHERE lower(email) = p_email LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO clients (email, first_name, last_name, phone, allergies, birthday, last_visit)
    VALUES (p_email, COALESCE(NULLIF(trim(p_first), ''), p_email), COALESCE(trim(p_last), ''),
            NULLIF(trim(COALESCE(p_phone, '')), ''), NULLIF(trim(COALESCE(p_allergies, '')), ''),
            p_birthday, now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE clients SET
      phone = COALESCE(NULLIF(trim(COALESCE(p_phone, '')), ''), phone),
      allergies = COALESCE(NULLIF(trim(COALESCE(p_allergies, '')), ''), allergies),
      -- Nooit een bekende verjaardag wissen met een leeg veld; zelfde regel als
      -- in book-appointment.
      birthday = COALESCE(p_birthday, birthday)
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $function$;

revoke all on function public.get_or_create_client(text, text, text, text, text, date) from public;
grant execute on function public.get_or_create_client(text, text, text, text, text, date) to authenticated, service_role;
