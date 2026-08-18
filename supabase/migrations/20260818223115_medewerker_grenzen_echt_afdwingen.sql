-- 2026-08-18 — De beloftes bij "Team ziet elkaars agenda" waarmaken
--
-- WAT ER MIS WAS, gemeten op productie (read-only, teruggedraaid)
-- Medewerker Lady van TTNB Den Haag, met de schakelaar staff_see_all UIT:
--     ziet 87 afspraken, waarvan 36 van haar
--     dus 49 afspraken van de eigenaar, 53 unieke klant-e-mailadressen
--     en 3 records met allergiegegevens
-- Het scherm verbergt die 51 (src/StaffApp.jsx regel 196 filtert client-side),
-- maar de gegevens stonden wél in haar browser. De tekst bij de schakelaar zegt
-- tegen de eigenaar dat klantgegevens pas voor het team zichtbaar worden als hij
-- hem AANzet, en belooft daarnaast "Ze kunnen alleen hun eigen afspraken
-- beheren". Geen van beide werd afgedwongen.
--
-- Daaronder zat een tweede, ernstiger gat. clients_select_visited_salon geeft
-- een medewerker leesrecht op een klantrij zodra er ÉRGENS in de salon een
-- afspraak bestaat met dat e-mailadres — en de INSERT-policy op appointments
-- controleerde alleen of het salon klopte. Een medewerker kon dus zelf een
-- afspraak aanmaken met het adres van een willekeurige klant en die rij daarna
-- lezen, en via clients_update_visited_salon zelfs wijzigen. Alleen de agenda
-- dichtzetten zou schijnzekerheid opleveren: voordeur dicht, raam open.
--
-- WAT DEZE MIGRATIE DOET
-- 1. appointments: lezen en bewerken begrensd tot de eigen afspraken
-- 2. appointments: inboeken alleen op eigen naam of zonder voorkeur
-- 3. clients: medewerkers er helemaal af (het opstapje verdwijnt)
-- 4. manual_clients: dezelfde grens als de agenda
-- 5. staff_list_appointments: dezelfde grens (het tweede leespad)
--
-- DRIE ONTWERPKEUZES DIE ERTOE DOEN
--
-- (a) EEN AFSPRAAK ZONDER MEDEWERKER BLIJFT VOOR IEDEREEN ZICHTBAAR.
--     "Geen voorkeur" is een gewone optie in de boekingsflow (ClientApp.jsx
--     regel 3252) en book-appointment schrijft dan staff_id = null. Bij
--     Beauty_By_Eydy is dat de norm: 101 van de 123 afspraken hebben geen
--     medewerker, allemaal nog in de toekomst. Zo'n afspraak is niet "van een
--     collega" maar van niemand, en er moet iemand op afkomen. Zou de regel
--     alleen op eigenaarschap filteren, dan verdween daar de halve agenda.
--
-- (b) "VAN DEZE MEDEWERKER" IS MEER DAN staff_id. StaffApp rekent een afspraak
--     ook toe via staff_assignments (jsonb-object) en service_breakdown
--     (jsonb-array), bij een afspraak met meerdere behandelingen door
--     verschillende mensen. De regel hieronder spiegelt exact isMine() uit
--     src/StaffApp.jsx, anders verdwijnen juist de gedeelde afspraken.
--
-- (c) GEEN SECURITY DEFINER-HULPFUNCTIE. Een eerdere opzet gebruikte die, maar
--     Postgres kan zo'n functie niet inlinen: hij draait per rij met een eigen
--     plan. Gemeten kostte dat 4,5 tot 6,7x meer op 87 rijen en 17x op 10.000.
--     Als gewone sub-selects in de policy wordt de opzoeking naar staff_members
--     één InitPlan per statement in plaats van één per rij.

-- =============================================== 1. AGENDA LEZEN

drop policy if exists staff_read_appointments_when_allowed on public.appointments;

create policy staff_read_appointments_when_allowed
  on public.appointments
  for select to authenticated
  using (
    -- Ongewijzigd: alleen salons waar ik medewerker ben.
    owner_id in (select sm.owner_id from staff_members sm where sm.user_id = auth.uid())
    -- Ongewijzigd: beide kijk-schakelaars aan, óf het is sowieso mijn eigen rij.
    and (
      (select coalesce(p.staff_view_revenue, true)
          and coalesce(p.staff_view_client_contact, true)
         from profiles p where p.id = appointments.owner_id)
      or staff_id in (select sm.id from staff_members sm where sm.user_id = auth.uid())
    )
    -- NIEUW: de grens die de schakelaar belooft.
    and (
      (select coalesce(p.staff_see_all, false) from profiles p where p.id = appointments.owner_id)
      or staff_id in (select sm.id from staff_members sm where sm.user_id = auth.uid())
      or exists (
           select 1 from jsonb_each_text(coalesce(staff_assignments, '{}'::jsonb)) v
            where v.value in (select sm.id::text from staff_members sm where sm.user_id = auth.uid()))
      or exists (
           select 1 from jsonb_array_elements(
                    case when jsonb_typeof(service_breakdown) = 'array'
                         then service_breakdown else '[]'::jsonb end) e
            where e->>'staff_id' in (select sm.id::text from staff_members sm where sm.user_id = auth.uid()))
      -- Van niemand: zie ontwerpkeuze (a).
      or (
        staff_id is null
        and coalesce(staff_assignments, '{}'::jsonb) = '{}'::jsonb
        and not exists (
              select 1 from jsonb_array_elements(
                       case when jsonb_typeof(service_breakdown) = 'array'
                            then service_breakdown else '[]'::jsonb end) e
               where nullif(e->>'staff_id', '') is not null)
      )
    )
  );

-- =============================================== 2. AGENDA BEWERKEN

drop policy if exists "Staff can update their salon appointments" on public.appointments;

create policy "Staff can update their salon appointments"
  on public.appointments
  for update to authenticated
  using (
    owner_id in (select sm.owner_id from staff_members sm where sm.user_id = auth.uid())
    and (
      (select coalesce(p.staff_see_all, false) from profiles p where p.id = appointments.owner_id)
      or staff_id in (select sm.id from staff_members sm where sm.user_id = auth.uid())
      or exists (
           select 1 from jsonb_each_text(coalesce(staff_assignments, '{}'::jsonb)) v
            where v.value in (select sm.id::text from staff_members sm where sm.user_id = auth.uid()))
      or exists (
           select 1 from jsonb_array_elements(
                    case when jsonb_typeof(service_breakdown) = 'array'
                         then service_breakdown else '[]'::jsonb end) e
            where e->>'staff_id' in (select sm.id::text from staff_members sm where sm.user_id = auth.uid()))
      or (
        staff_id is null
        and coalesce(staff_assignments, '{}'::jsonb) = '{}'::jsonb
        and not exists (
              select 1 from jsonb_array_elements(
                       case when jsonb_typeof(service_breakdown) = 'array'
                            then service_breakdown else '[]'::jsonb end) e
               where nullif(e->>'staff_id', '') is not null)
      )
    )
  );

-- =============================================== 3. AGENDA INBOEKEN
-- Een medewerker mag inboeken op eigen naam of zonder voorkeur, niet op naam van
-- een collega. Zonder deze grens maakt hij rijen aan die hij daarna zelf niet
-- meer kan zien, en kan hij de agenda van een ander vervuilen.

drop policy if exists "Staff can insert salon appointments" on public.appointments;

create policy "Staff can insert salon appointments"
  on public.appointments
  for insert to authenticated
  with check (
    owner_id in (select sm.owner_id from staff_members sm where sm.user_id = auth.uid())
    and (
      (select coalesce(p.staff_see_all, false) from profiles p where p.id = appointments.owner_id)
      or staff_id is null
      or staff_id in (select sm.id from staff_members sm where sm.user_id = auth.uid())
    )
  );

-- =============================================== 4. DE KLANTENTABEL
-- Hier zat het opstapje. De oplossing is simpel omdat StaffApp deze tabel
-- helemaal niet leest: hij gebruikt alleen de RPC get_or_create_client (SECURITY
-- DEFINER) bij het inboeken. Alleen OwnerApp leest clients rechtstreeks
-- (regels 4247 en 4706), en dat blijft ongemoeid — de eigenaarstak van de
-- policy is letterlijk overgenomen, alleen de medewerkerstak is eruit.

drop policy if exists clients_select_visited_salon on public.clients;

create policy clients_select_visited_salon
  on public.clients
  for select to authenticated
  using (
    exists (
      select 1 from appointments a
       where (a.client_id = clients.id or lower(a.client_email) = lower(clients.email))
         and a.owner_id = auth.uid()
    )
  );

drop policy if exists clients_update_visited_salon on public.clients;

create policy clients_update_visited_salon
  on public.clients
  for update to authenticated
  using (
    exists (
      select 1 from appointments a
       where (a.client_id = clients.id or lower(a.client_email) = lower(clients.email))
         and a.owner_id = auth.uid()
    )
  );

-- =============================================== 5. HANDMATIGE KLANTEN
-- StaffApp haalt hier notities op (regel 180) en toont ze bij een afspraak.
-- Ze volgen daarom dezelfde grens: een notitie is leesbaar als er een afspraak
-- is die deze medewerker mag zien met hetzelfde e-mailadres. Notities bij
-- klanten zonder afspraak worden nergens getoond, dus daar gaat niets verloren.

drop policy if exists staff_read_manual_clients_when_allowed on public.manual_clients;

create policy staff_read_manual_clients_when_allowed
  on public.manual_clients
  for select to authenticated
  using (
    exists (select 1 from staff_members sm
             where sm.user_id = auth.uid() and sm.owner_id = manual_clients.owner_id)
    and (select coalesce(p.staff_view_client_contact, true)
           from profiles p where p.id = manual_clients.owner_id)
    -- De agenda-policy hierboven bepaalt welke afspraken zichtbaar zijn; deze
    -- EXISTS erft die grens dus automatisch mee.
    and exists (
      select 1 from appointments a
       where a.owner_id = manual_clients.owner_id
         and lower(a.client_email) = lower(manual_clients.email)
    )
  );

-- =============================================== 6. HET TWEEDE LEESPAD
-- staff_list_appointments gaf de hele salon terug en knipte alleen VELDEN weg.
-- Nu volgt hij dezelfde rijgrens. De veld-stripping is ongewijzigd.

create or replace function public.staff_list_appointments(p_from text default null::text)
 returns setof jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  WITH me AS (
    SELECT sm.owner_id,
           sm.id                                        AS staff_id,
           COALESCE(p.staff_view_revenue, true)         AS see_rev,
           COALESCE(p.staff_view_client_contact, true)  AS see_contact,
           COALESCE(p.staff_see_all, false)             AS see_all
    FROM staff_members sm
    JOIN profiles p ON p.id = sm.owner_id
    WHERE sm.user_id = auth.uid() AND sm.active = true
    LIMIT 1
  )
  SELECT to_jsonb(a)
    - (CASE WHEN me.see_rev THEN '{}'::text[] ELSE ARRAY['service_price'] END)
    - (CASE WHEN me.see_contact THEN '{}'::text[]
        ELSE ARRAY['client_email','client_phone','client_allergies'] END)
  FROM appointments a, me
  WHERE a.owner_id = me.owner_id
    AND (p_from IS NULL OR a.date >= p_from::date)
    AND (
      me.see_all
      OR a.staff_id = me.staff_id
      OR EXISTS (SELECT 1 FROM jsonb_each_text(COALESCE(a.staff_assignments,'{}'::jsonb)) v
                  WHERE v.value = me.staff_id::text)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(a.service_breakdown)='array'
                        THEN a.service_breakdown ELSE '[]'::jsonb END) e
                  WHERE e->>'staff_id' = me.staff_id::text)
      OR (a.staff_id IS NULL
          AND COALESCE(a.staff_assignments,'{}'::jsonb) = '{}'::jsonb
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(a.service_breakdown)='array'
                                 THEN a.service_breakdown ELSE '[]'::jsonb END) e
                           WHERE NULLIF(e->>'staff_id','') IS NOT NULL))
    )
$function$;

-- LET OP VOOR LATER: er is bewust GEEN delete-policy voor medewerkers, en die
-- moet er ook niet komen zonder dezelfde grens erin. En als er ooit een nieuw
-- pad naar klantgegevens bijkomt (een view, een RPC, een edge-functie), stel dan
-- eerst de vraag die hier misging: kan de medewerker de VOORWAARDE zelf
-- schrijven? Bij clients kon dat — het e-mailadres van een afspraak is invoer,
-- geen gegeven.
