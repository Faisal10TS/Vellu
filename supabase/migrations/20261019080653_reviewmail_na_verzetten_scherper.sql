-- Reviewmail na verzetten, scherpere regel (19-10-2026, reviewbevinding op
-- 20261019074853). Die eerste versie zette followup_sent ook terug als de
-- salon een al geweest bezoek achteraf corrigeerde naar "gisteren"
-- (current_date - 1), en dan kwam dezelfde reviewmail twee keer. Het echte
-- signaal is of de eerste mail uitging VÓÓR het (nieuwe) moment van het
-- bezoek: alleen dan opnieuw sturen. Dat moment = nieuwe datum + tijd in de
-- tijdzone van de salon (salon_tz). Oude rijen zonder followup_sent_at: alleen
-- bij een nieuwe datum vandaag of later. De ondergrens van drie dagen volgt
-- het venster van send-followups; daarvoor zou de mail toch niet meer gaan.
create or replace function public.tg_appointments_followup_reset_on_move()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cc    text;
  v_time  text;
  v_visit timestamptz;
begin
  if new.date > old.date
     and new.date >= current_date - 3
     and coalesce(old.followup_sent, false)
     and coalesce(new.followup_sent, false)
     and not exists (select 1 from public.reviews r where r.appointment_id = new.id)
     and not exists (select 1 from public.review_tokens t where t.appointment_id = new.id and t.used_at is not null)
  then
    select p.country_code into v_cc from public.profiles p where p.id = new.owner_id;
    v_time := coalesce(substring(coalesce(new.time, '') from '^\d{1,2}:\d{2}'), '00:00');
    v_visit := (new.date + v_time::time) at time zone public.salon_tz(v_cc);
    if (old.followup_sent_at is null and new.date >= current_date)
       or (old.followup_sent_at is not null and old.followup_sent_at < v_visit)
    then
      new.followup_sent := false;
      new.followup_sent_at := null;
      update public.review_tokens t
         set expires_at = greatest(t.expires_at, (new.date + 60)::timestamptz)
       where t.appointment_id = new.id and t.used_at is null;
    end if;
  end if;
  return new;
end $function$;
revoke all on function public.tg_appointments_followup_reset_on_move() from public, anon, authenticated;
