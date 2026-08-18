-- Belasting per jurisdictie. Vellu had één tarief per salon dat op ALLES werd
-- toegepast. Dat gaat mis op de eilanden: op Bonaire is doorverkoop van een
-- ingevoerd product niet belast (ABB is bij invoer al betaald) terwijl een
-- behandeling dat wel is, en Saba/Sint Eustatius hebben een ander tarief dan
-- Bonaire onder dezelfde landcode BQ.
--
-- Alles hieronder is nullable of heeft een default die het HUIDIGE gedrag exact
-- reproduceert; geen enkele bestaande salon ziet na deze migratie een ander
-- bedrag of een andere regel.

-- Belastingplicht expliciet maken. Tot nu toe was "btw_id ingevuld" de facto de
-- aan/uit-knop; met producten-onbelast erbij is dat niet meer leesbaar.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tax_registered boolean NOT NULL DEFAULT false;

-- Het eiland binnen een landcode: BQ-BON | BQ-SAB | BQ-EUX.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tax_region text;

-- De Bonaire-kernregel. Eigenschap van de ondernemer (ben je producent?),
-- niet van het losse product.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS products_taxable boolean NOT NULL DEFAULT true;

-- NULL = zelfde tarief als de behandelingen (btw_rate).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS product_tax_rate numeric;

-- Doorlopend bonnummer: een vereenvoudigde factuur vereist een oplopend
-- nummer, en een afgekapte UUID is dat niet.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_receipt_number integer NOT NULL DEFAULT 1;

-- De berekening bevriezen op het moment van verkoop. Zonder dit herschrijft
-- een tariefwijziging met terugwerkende kracht elke al verstuurde factuur en
-- elk rapport over een afgesloten kwartaal. NULL = oude rij, bereken als nu.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tax_snapshot jsonb;

-- ── Backfill: reproduceert het gedrag van vandaag ────────────────────────
-- showTax was `!!btw_id`, dus dat wordt tax_registered.
UPDATE profiles
   SET tax_registered = true
 WHERE coalesce(btw_id, '') <> '' AND tax_registered = false;

-- Bestaande BQ-salons staan op Bonaire (Saba/Statia hebben nog geen salon).
UPDATE profiles SET tax_region = 'BQ-BON' WHERE country_code = 'BQ' AND tax_region IS NULL;

-- Doorverkoop op de BES-eilanden is niet belast.
UPDATE profiles SET products_taxable = false WHERE country_code = 'BQ';

-- Ruim het Nederlandse standaardtarief op bij eilandsalons die (nog) geen
-- belasting in rekening brengen. Er werd niets getoond, dus dit verandert geen
-- enkel bestaand document — het haalt alleen de landmijn weg dat een Bonaire-
-- salon 21% ABB gaat printen zodra hij zijn CRIB invult.
UPDATE profiles SET btw_rate = 6 WHERE country_code = 'BQ' AND tax_registered = false;
UPDATE profiles SET btw_rate = 7 WHERE country_code = 'AW' AND tax_registered = false;

COMMENT ON COLUMN profiles.tax_registered IS 'Brengt deze salon belasting in rekening? Vervangt de impliciete check op btw_id.';
COMMENT ON COLUMN profiles.tax_region IS 'Eiland binnen een landcode: BQ-BON | BQ-SAB | BQ-EUX. NULL = landbreed.';
COMMENT ON COLUMN profiles.products_taxable IS 'Is doorverkoop van producten belast? Op de BES-eilanden nee (ABB al bij invoer betaald).';
COMMENT ON COLUMN profiles.product_tax_rate IS 'Tarief op producten. NULL = gelijk aan btw_rate (het dienstentarief).';
COMMENT ON COLUMN appointments.tax_snapshot IS 'Bevroren belastingberekening op moment van verkoop (v1). NULL = bereken met de huidige instellingen.';