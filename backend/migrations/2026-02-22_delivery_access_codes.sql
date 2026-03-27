-- Delivery access code for secure tracking features (live map + chat)
-- Date: 2026-02-22

START TRANSACTION;

ALTER TABLE bookings
  ADD COLUMN delivery_access_code VARCHAR(32) NULL AFTER booking_code;

UPDATE bookings
SET delivery_access_code = CONCAT('DA-', UPPER(SUBSTRING(MD5(CONCAT('booking-', id, '-', booking_code)), 1, 8)))
WHERE delivery_access_code IS NULL OR TRIM(delivery_access_code) = '';

ALTER TABLE bookings
  MODIFY COLUMN delivery_access_code VARCHAR(32) NOT NULL;

CREATE UNIQUE INDEX idx_bookings_delivery_access_code
  ON bookings(delivery_access_code);

COMMIT;
