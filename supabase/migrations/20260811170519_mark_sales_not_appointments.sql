-- Losse verkopen worden als 0-minuten "afspraak" opgeslagen zodat ze
-- automatisch meetellen in omzet/facturen/analytics. Ze horen echter NIET
-- in de agenda. Deze vlag scheidt de twee zonder de omzetketen te breken.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_sale boolean NOT NULL DEFAULT false;

-- Backfill: bestaande kassa-verkopen herkennen aan geen dienst + 0 minuten,
-- of aan het oude emoji-/Verkoop-label.
UPDATE appointments
SET is_sale = true
WHERE is_sale = false
  AND (
    (service_id IS NULL AND COALESCE(service_duration, 0) = 0 AND products IS NOT NULL)
    OR service_name LIKE '🛍%'
    OR service_name LIKE 'Verkoop ·%'
    OR service_name LIKE 'Sale ·%'
    OR service_name LIKE 'Venta ·%'
  );

CREATE INDEX IF NOT EXISTS idx_appointments_owner_sale_date ON appointments (owner_id, is_sale, date);