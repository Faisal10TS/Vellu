-- 2026-08-18 — De eigenaar mocht een annuleer-token niet ongeldig maken
--
-- WAAROM: cancellation_tokens heeft RLS aan met precies twee policies —
-- owner_staff_insert_ en owner_staff_select_. Geen UPDATE. Annuleert de salon
-- een afspraak vanuit de agenda, dan blijft de annuleerlink uit de
-- bevestigingsmail dus geldig rondslingeren: PostgREST geeft bij een UPDATE
-- zonder policy geen foutmelding, hij raakt gewoon nul rijen. De edge-functie
-- cancel-appointment zet `used = true` wél, maar die draait op service_role en
-- negeert RLS; de knop in de agenda draait als de ingelogde gebruiker.
--
-- src/OwnerApp.jsx (invalidateCancelToken) is er al op gebouwd: hij leest eerst
-- of er een open token is en vergelijkt dat met wat de update raakte, zodat het
-- verschil zichtbaar wordt in plaats van stil te verdwijnen. Met deze policy
-- raakt die update vanaf nu de rij die hij moet raken.
--
-- REIKWIJDTE: exact dezelfde voorwaarde als de bestaande SELECT- en
-- INSERT-policy — de eigenaar van de afspraak, of een medewerker van die
-- eigenaar. De with_check herhaalt de using-clausule, zodat een token niet naar
-- de afspraak van iemand anders verplaatst kan worden: zonder with_check zou
-- een geldige rij tijdens de update een appointment_id van een vreemde salon
-- kunnen krijgen.

drop policy if exists owner_staff_update_cancellation_tokens on public.cancellation_tokens;

create policy owner_staff_update_cancellation_tokens
  on public.cancellation_tokens
  for update
  to authenticated
  using (
    exists (
      select 1 from public.appointments a
       where a.id = cancellation_tokens.appointment_id
         and (
           a.owner_id = auth.uid()
           or exists (
             select 1 from public.staff_members sm
              where sm.owner_id = a.owner_id and sm.user_id = auth.uid()
           )
         )
    )
  )
  with check (
    exists (
      select 1 from public.appointments a
       where a.id = cancellation_tokens.appointment_id
         and (
           a.owner_id = auth.uid()
           or exists (
             select 1 from public.staff_members sm
              where sm.owner_id = a.owner_id and sm.user_id = auth.uid()
           )
         )
    )
  );
