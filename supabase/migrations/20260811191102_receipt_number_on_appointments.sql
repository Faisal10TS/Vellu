-- Een vereenvoudigde factuur (kassabon) vereist een DOORLOPEND nummer plus
-- dagtekening. Vellu drukte tot nu toe de eerste acht tekens van de UUID af;
-- dat is uniek maar niet oplopend, en dus geen bonnummer.
-- Bestaande rijen blijven NULL en vallen in de bon terug op de oude weergave.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS receipt_number integer;
COMMENT ON COLUMN appointments.receipt_number IS 'Doorlopend bonnummer, toegekend bij de kassaverkoop uit profiles.next_receipt_number. NULL = rij van vóór deze feature.';