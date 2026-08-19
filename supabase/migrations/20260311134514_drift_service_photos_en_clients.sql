-- 2026-03-11 (met terugwerkende kracht vastgelegd op 2026-08-18)
-- Vier kolommen die alleen in productie bestonden
--
-- HOE DIT AAN HET LICHT KWAM
-- De herbouw-test strandde bij bestand 18
-- (20260416120240_add_staff_rls_policies) met:
--
--     ERROR: 42703: column "owner_id" does not exist
--
-- Die migratie maakt policies op service_photos die op owner_id filteren, maar
-- geen enkele migratie voegt die kolom toe. Op productie bestaat hij wel — met
-- de hand aangebracht, buiten de migraties om. Precies hetzelfde patroon als
-- handle_new_user(), en opnieuw alleen zichtbaar bij een echte herbouw.
--
-- Daarna is de vergelijking systematisch gemaakt in plaats van geval voor
-- geval: per tabel een hash over de kolomnamen die de repo aanmaakt, naast
-- dezelfde hash uit productie. Van de 33 tabellen weken er drie af, waarvan
-- één een meetfout was (public_chat_usage wordt door 20260725063333 gedropt en
-- opnieuw gemaakt; de telling zag beide versies). De echte drift is deze:
--
--   service_photos : productie HEEFT owner_id en storage_path,
--                    en MIST photo_url en position die de repo aanmaakt
--   clients        : productie HEEFT no_show_count en allergies
--
-- WAAROM HIER IN DE REEKS
-- Dit bestand moet ná 20260311134513 (dat maakt clients) en vóór twee andere:
--   20260409123807 — de functie increment_no_show_count leest clients.no_show_count
--   20260416120240 — de policies die service_photos.owner_id nodig hebben
-- Een versienummer direct achter 20260311134513 voldoet aan allebei.
--
-- PRODUCTIE WORDT HIER NIET DOOR GERAAKT: alles staat op if-exists/if-not-exists
-- en het bestand is daar geregistreerd als toegepast zonder te draaien. Het
-- bestaat om een HERBOUW te laten kloppen.

-- ------------------------------------------------------- service_photos
-- photo_url is hernoemd naar storage_path, niet vervangen: de app leest overal
-- p.storage_path als de URL van de foto (src/App.jsx 514, src/OwnerApp.jsx 4022,
-- src/StaffApp.jsx 212). In de migraties komt photo_url alleen voor in de
-- CREATE TABLE, nergens anders, dus deze hernoeming breekt geen enkel later
-- bestand.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='service_photos'
                and column_name='photo_url')
     and not exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='service_photos'
                and column_name='storage_path')
  then
    alter table public.service_photos rename column photo_url to storage_path;
  end if;
end $$;

-- position werd door niets gebruikt en is in productie weggehaald.
alter table public.service_photos drop column if exists "position";

-- owner_id: nodig voor de RLS-policies uit 20260416120240. Eerst toevoegen als
-- nullable, dan vullen vanuit de dienst waar de foto bij hoort, en pas daarna
-- NOT NULL maken — anders faalt het op een database waar al foto's staan.
alter table public.service_photos add column if not exists owner_id uuid;

update public.service_photos sp
   set owner_id = s.owner_id
  from public.services s
 where s.id = sp.service_id
   and sp.owner_id is null;

do $$
begin
  alter table public.service_photos
    add constraint service_photos_owner_id_fkey
    foreign key (owner_id) references public.profiles(id) on delete cascade;
exception when duplicate_table or duplicate_object then null;
end $$;

do $$
begin
  -- Alleen NOT NULL maken als er geen wees-rijen zijn; anders zou een herbouw
  -- met bestaande data hierop klappen en dat is erger dan een nullable kolom.
  if not exists (select 1 from public.service_photos where owner_id is null) then
    alter table public.service_photos alter column owner_id set not null;
  end if;
end $$;

-- ---------------------------------------------- service_photos: policies
-- Twee policies die ook alleen in productie bestonden. Migratie
-- 20260407191755 heeft er zelfs een opmerking over staan ("Keep: Owner manages
-- photos (ALL via owner_id)") — die gaat er dus van uit dat ze er al zijn,
-- terwijl niets ze aanmaakt. Zonder deze twee komt een herbouw uit op 74
-- policies waar productie er 76 heeft, en zou een eigenaar zijn eigen
-- dienstfoto's niet kunnen beheren.
--
-- Ze staan hier en niet in de reconcile-migratie achteraan, omdat ze horen bij
-- owner_id: die kolom wordt een paar regels hierboven toegevoegd en de policy
-- filtert erop.

drop policy if exists "Owner manages photos" on public.service_photos;
create policy "Owner manages photos"
  on public.service_photos
  for all to public
  using ((auth.uid() = owner_id));

drop policy if exists "Public can read photos" on public.service_photos;
create policy "Public can read photos"
  on public.service_photos
  for select to public
  using (true);

-- --------------------------------------------------------------- clients
-- no_show_count telt hoe vaak een klant niet is komen opdagen; allergies is een
-- vrij tekstveld dat op de afspraakkaart wordt getoond. increment_no_show_count
-- (20260409123807) leest de eerste, dus die moet hiervoor bestaan.
alter table public.clients add column if not exists no_show_count integer default 0;
alter table public.clients add column if not exists allergies text;
