-- O3 (OwnerApp state/handlers), audit 05-10-2026.
--
-- Bevroren belasting op AFSPRAKEN mag niet achterlopen op het bedrag.
--
-- Sinds deze ronde legt OwnerApp.markComplete bij het afronden van een
-- afspraak de belastingberekening vast in appointments.tax_snapshot (RP-05),
-- net als de kassa al deed voor verkopen. Rapporten, bonnen en de factuurmail
-- lezen die bevroren berekening (taxForSale) zodra hij er is.
--
-- Maar een afgeronde afspraak kan daarna nog van bedrag veranderen buiten
-- OwnerApp.saveEditAppt om (dat pad schrijft zelf een nieuwe snapshot mee):
-- producten aanslaan op een afgeronde afspraak (OwnerApp addProductsToAppt)
-- en "Prijs aanpassen" in de medewerkers-app (StaffApp savePrice). Dan zou de
-- factuur de oude regels en belasting tonen. Deze trigger maakt de snapshot
-- leeg zodra service_price of products écht verandert zonder dat dezelfde
-- update een nieuwe snapshot meegeeft; taxForSale rekent dan weer met de
-- instellingen van vandaag, precies het gedrag van vóór de snapshot.
--
-- Kassaverkopen (is_sale) blijven buiten schot: hun snapshot is een
-- uitgereikte bon en wordt nooit stil gewist.
-- Vandaag hebben 0 afspraken (niet-verkopen) een snapshot; niets verandert
-- aan bestaande rijen.

create or replace function public.tg_appointments_drop_stale_tax_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tax_snapshot := null;
  return new;
end;
$$;

revoke all on function public.tg_appointments_drop_stale_tax_snapshot() from public, anon, authenticated;

drop trigger if exists appointments_drop_stale_tax_snapshot on public.appointments;
create trigger appointments_drop_stale_tax_snapshot
  before update of service_price, products on public.appointments
  for each row
  when (
    new.tax_snapshot is not null
    and not coalesce(new.is_sale, false)
    and old.tax_snapshot is not distinct from new.tax_snapshot
    and (old.service_price is distinct from new.service_price
         or old.products is distinct from new.products)
  )
  execute function public.tg_appointments_drop_stale_tax_snapshot();
