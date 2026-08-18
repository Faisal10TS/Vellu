-- 2026-08-18 — De dagelijkse back-up sloeg 17 van de 33 tabellen over
--
-- WAAROM: de edge-functie db-backup had een handgeschreven TABLES-lijst van 16
-- namen. Die lijst dateert van april en is sindsdien niet meegegroeid met het
-- schema, terwijl er wel tabellen bij zijn gekomen. Alles wat daarna is
-- gebouwd stond dus buiten de back-up, zonder dat iets daarover klaagde: de
-- functie meldde elke nacht netjes "success".
--
-- Wat er bij een herstel verloren was gegaan (stand 2026-08-18):
--   payment_invoices      5   de wettelijke BTW-facturen van Vellu zelf
--   gift_vouchers         1   een betaalmiddel — saldo van een klant
--   manual_clients      135   handmatig ingevoerde klanten
--   staff_day_overrides  88   roosteruitzonderingen per medewerker
--   payment_events       23   het Mollie-spoor achter de facturen
--   products              5   de productcatalogus van de kassa
--   client_no_shows       2   de no-show-tellers per salon
--   app_admins            1   wie er bij het admin-dashboard mag
--   + waitlist, birthday_discount_codes, birthday_email_log, salon_digest_log,
--     cancellation_tokens, client_tokens, review_tokens
--
-- OPLOSSING: de lijst niet aanvullen maar afschaffen. Deze functie leest de
-- tabellen uit de catalogus, zodat een nieuwe tabel automatisch meegaat en
-- niemand er ooit nog aan hoeft te denken. Alleen wegwerpdata staat op de
-- uitzonderingslijst; die staat hier expliciet, zodat toevoegen een bewuste
-- daad is in plaats van een vergeten regel.

create or replace function public.backup_table_list()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     -- Wegwerpdata: telemetrie die na een herstel geen enkele waarde heeft en
     -- de back-up alleen maar opblaast. cron_health is een logtabel die zich
     -- vanzelf weer vult, public_chat_usage is een daglimiet-teller.
     and c.relname not in ('cron_health', 'public_chat_usage')
   order by 1;
$$;

-- Alleen de back-up zelf mag dit weten. Een lijst van alle tabellen is voor
-- een buitenstaander gratis verkenning van het schema.
revoke all on function public.backup_table_list() from public, anon, authenticated;
grant execute on function public.backup_table_list() to service_role;

-- LET OP: de back-up bevat hierdoor ook de token-tabellen (cancellation_tokens,
-- client_tokens, review_tokens). Dat is bewust — zonder die rijen zouden na een
-- herstel alle rondgestuurde annuleer- en review-links dood zijn. Gevolg is wel
-- dat het back-up-JSON geheimen bevat; de bucket db-backups is daarom privé en
-- moet dat blijven.
