-- Wachtlijst: één wachtende rij per salon, adres en dag (audit 05-10-2026,
-- zwakke plek 3, 12-11-2026).
--
-- waitlist-notify kijkt eerst of dit adres al wacht op die dag en voegt dan pas
-- in. Twee identieke aanvragen tegelijk kwamen allebei langs die controle en
-- zetten allebei rijen neer, met twee keer mail aan de klant en de salon. Deze
-- index laat de tweede insert falen met 23505; waitlist-notify vangt dat af en
-- kijkt opnieuw welke dagen nog echt nieuw zijn. Alleen status 'waiting': een
-- klant die al een melding kreeg (notified) mag zich voor dezelfde dag opnieuw
-- aanmelden. lower(): de functie slaat het adres in kleine letters op, maar
-- oudere rijen kwamen uit de browser.
create unique index if not exists waitlist_waiting_unique
  on public.waitlist (owner_id, lower(client_email), date)
  where status = 'waiting';
