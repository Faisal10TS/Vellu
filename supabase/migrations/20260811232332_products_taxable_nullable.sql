-- products_taxable stond op NOT NULL DEFAULT true. Daardoor krijgt een NIEUWE
-- salon die zich op Bonaire aanmeldt `true` mee, terwijl de landregel in
-- TAX_RULES juist zegt dat doorverkoop daar onbelast is — de bestaande rijen
-- waren wel goed gezet door de vorige migratie, maar de volgende aanmelding
-- zou stilletjes ABB over producten gaan rekenen.
--
-- NULL betekent voortaan "niet ingesteld, volg de regel van het land/eiland";
-- resolveTax() in shared.jsx doet dat al. Zodra de eigenaar de schakelaar zelf
-- aanraakt wordt het true of false en wint zijn keuze.
ALTER TABLE profiles ALTER COLUMN products_taxable DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN products_taxable DROP NOT NULL;
COMMENT ON COLUMN profiles.products_taxable IS 'Is doorverkoop van producten belast? NULL = volg de landregel uit TAX_RULES (BES-eilanden: nee). Expliciet true/false = keuze van de eigenaar.';