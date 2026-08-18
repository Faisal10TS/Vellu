-- Voor een klant buiten het EU-BTW-gebied (Bonaire, Saba, Sint Eustatius,
-- Aruba, Curacao, Sint Maarten) is de dienst NIET in Nederland belastbaar.
-- Dat is iets anders dan 0%: een tarief van 0 suggereert een in Nederland
-- belaste nultarief-prestatie, en elk op een factuur vermeld BTW-bedrag wordt
-- op grond van art. 37 Wet OB verschuldigd — ook 0,00.
--
-- NULL = buiten het toepassingsgebied van de Nederlandse BTW.
-- 0.21 = normaal Nederlands tarief.
ALTER TABLE payment_invoices ALTER COLUMN vat_rate DROP NOT NULL;
ALTER TABLE payment_invoices ALTER COLUMN vat_amount DROP NOT NULL;
COMMENT ON COLUMN payment_invoices.vat_rate IS 'NULL = niet in Nederland belastbaar (afnemer buiten het EU-BTW-gebied). Anders het toegepaste tarief, bv. 0.21.';
COMMENT ON COLUMN payment_invoices.vat_amount IS 'NULL wanneer de prestatie buiten het toepassingsgebied van de Nederlandse BTW valt — een bedrag van 0,00 op de factuur zou op grond van art. 37 Wet OB verschuldigd worden.';