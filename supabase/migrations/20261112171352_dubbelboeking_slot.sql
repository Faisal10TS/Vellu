-- Dubbele boeking in dezelfde milliseconde dichtzetten (audit 05-10-2026,
-- zwakke plek 4, 12-11-2026).
--
-- book-appointment toetst een slot vóór de insert en nog eens erna (stap 13a):
-- van twee botsende boekingen trekt de LATERE zich terug, en "later" is de
-- grotere created_at. Maar created_at was het begin van de transactie, niet
-- het moment van opslaan. Boeking A begint, B begint iets later maar slaat
-- eerder op; B's nacontrole ziet A nog niet, A's nacontrole ziet B maar vindt
-- B "later" en negeert hem. Allebei bleven staan.
--
-- Deze trigger zet inserts voor dezelfde salon en dezelfde dag achter elkaar
-- (advisory lock tot de commit) en geeft created_at pas ONDER dat slot een
-- waarde: de klok van dat moment, en minstens 1 ms na de jongste afspraak van
-- die salon op die dag. Dan is created_at gelijk aan de volgorde van opslaan,
-- ook op milliseconden (book-appointment vergelijkt met JavaScript-Date, dat
-- microseconden afkapt). De latere boeking ziet in haar nacontrole dus altijd
-- de eerdere en trekt zich terug. Geen wijziging in book-appointment nodig.
--
-- Alleen als created_at de standaardwaarde heeft (now()): een rij met een
-- eigen created_at (herstel uit een back-up) blijft zoals hij is. Kassa-
-- verkopen lopen ook door het slot; dat duurt een fractie van een
-- milliseconde. SECURITY DEFINER zodat de max() alle rijen van die dag ziet,
-- ook als een medewerker de afspraak invoert.
create or replace function public.tg_appointments_serialize_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prev timestamptz;
begin
  if new.owner_id is null or new.date is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('appt-day:' || new.owner_id::text || ':' || new.date::text, 0));
  if new.created_at is null or new.created_at = now() then
    -- Volatile functie: deze query krijgt een verse snapshot en ziet dus ook
    -- de rij die vlak voor ons slot werd vastgelegd.
    select max(a.created_at) into v_prev
      from public.appointments a
     where a.owner_id = new.owner_id and a.date = new.date;
    new.created_at := greatest(clock_timestamp(), coalesce(v_prev + interval '1 millisecond', clock_timestamp()));
  end if;
  return new;
end;
$function$;
revoke all on function public.tg_appointments_serialize_insert() from public, anon, authenticated;

drop trigger if exists appointments_serialize_insert on public.appointments;
create trigger appointments_serialize_insert
  before insert on public.appointments
  for each row execute function public.tg_appointments_serialize_insert();
