-- Reviewmail opnieuw na verzetten (19-10-2026). Get Niq'd Up: Rachel kreeg op
-- 16-10 "How was your visit?" de dag na haar oorspronkelijke datum; daarna werd
-- de afspraak nog naar 17-10 verzet en pas toen kwam ze. send-followups zet
-- followup_sent = true en die vlag bleef staan, dus na het echte bezoek kwam er
-- geen reviewmail meer.
-- Nu: wordt een afspraak naar een LATERE datum verzet die nog moet komen
-- (vandaag of later, met een dag speling voor de Caribische salons die achter
-- lopen op UTC) en is er voor deze afspraak nog geen review, dan gaat
-- followup_sent terug op false. send-followups stuurt de mail dan de dag na de
-- nieuwe datum opnieuw, met dezelfde reviewlink; die blijft geldig tot 60 dagen
-- na de nieuwe datum. Een correctie van een datum in het verleden (beide
-- datums voorbij) stuurt niets opnieuw. Geldt voor elke route die de datum
-- wijzigt: de verzetlink (reschedule-appointment), de eigenaar en een teamlid.
-- security definer: de trigger moet reviews en review_tokens kunnen lezen,
-- ook als een ingelogde eigenaar of teamlid de afspraak verzet (RLS).
create or replace function public.tg_appointments_followup_reset_on_move()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.date > old.date
     and new.date >= current_date - 1
     and coalesce(old.followup_sent, false)
     and coalesce(new.followup_sent, false)
     and not exists (select 1 from public.reviews r where r.appointment_id = new.id)
     and not exists (select 1 from public.review_tokens t where t.appointment_id = new.id and t.used_at is not null)
  then
    new.followup_sent := false;
    new.followup_sent_at := null;
    update public.review_tokens t
       set expires_at = greatest(t.expires_at, (new.date + 60)::timestamptz)
     where t.appointment_id = new.id and t.used_at is null;
  end if;
  return new;
end $function$;
revoke all on function public.tg_appointments_followup_reset_on_move() from public, anon, authenticated;

create trigger appointments_followup_reset_on_move
  before update of date on public.appointments
  for each row when (new.date is distinct from old.date)
  execute function public.tg_appointments_followup_reset_on_move();
