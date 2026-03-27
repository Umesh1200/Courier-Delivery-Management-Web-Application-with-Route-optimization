-- Dispatch + load-confirmation migration
-- Date: 2026-02-19

START TRANSACTION;

-- 1) Backfill old status names (if older enum values exist)
UPDATE bookings
SET status = 'in_transit_to_origin_branch'
WHERE status = 'in_transit_to_branch';

UPDATE bookings
SET status = 'received_at_origin_branch'
WHERE status = 'in_branch_origin';

UPDATE bookings
SET status = 'received_at_destination_branch'
WHERE status = 'in_branch_destination';

UPDATE booking_status_events
SET status = 'in_transit_to_origin_branch'
WHERE status = 'in_transit_to_branch';

UPDATE booking_status_events
SET status = 'received_at_origin_branch'
WHERE status = 'in_branch_origin';

UPDATE booking_status_events
SET status = 'received_at_destination_branch'
WHERE status = 'in_branch_destination';

-- 2) New columns required for lane + custody checkpoints
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS requires_linehaul BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_intercity BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linehaul_load_confirmed_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_load_confirmed_at TIMESTAMP NULL DEFAULT NULL;

-- 3) Upgrade booking status enum
ALTER TABLE bookings
  MODIFY COLUMN status ENUM(
    'created',
    'pickup_assigned',
    'picked_up',
    'in_transit_to_origin_branch',
    'received_at_origin_branch',
    'linehaul_assigned',
    'linehaul_load_confirmed',
    'linehaul_in_transit',
    'received_at_destination_branch',
    'delivery_assigned',
    'delivery_load_confirmed',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ) NOT NULL DEFAULT 'created';

-- 4) Upgrade booking_status_events enum
ALTER TABLE booking_status_events
  MODIFY COLUMN status ENUM(
    'created',
    'pickup_assigned',
    'picked_up',
    'in_transit_to_origin_branch',
    'received_at_origin_branch',
    'linehaul_assigned',
    'linehaul_load_confirmed',
    'linehaul_in_transit',
    'received_at_destination_branch',
    'delivery_assigned',
    'delivery_load_confirmed',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ) NOT NULL;

-- 5) New order_events audit table
CREATE TABLE IF NOT EXISTS order_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  status ENUM(
    'created',
    'pickup_assigned',
    'picked_up',
    'in_transit_to_origin_branch',
    'received_at_origin_branch',
    'linehaul_assigned',
    'linehaul_load_confirmed',
    'linehaul_in_transit',
    'received_at_destination_branch',
    'delivery_assigned',
    'delivery_load_confirmed',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ) NOT NULL,
  actor_type ENUM('system','customer','courier','admin','branch') NOT NULL DEFAULT 'system',
  actor_id BIGINT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_events_order (order_id),
  INDEX idx_order_events_status (status),
  INDEX idx_order_events_created (created_at),
  CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES bookings(id)
);

-- 6) Backfill lane flag using rule:
-- is_intercity = (origin_city != destination_city) OR requires_linehaul = true
UPDATE bookings AS b
JOIN addresses AS pickup ON pickup.id = b.pickup_address_id
JOIN addresses AS delivery ON delivery.id = b.delivery_address_id
SET b.is_intercity = CASE
  WHEN b.requires_linehaul = TRUE THEN TRUE
  WHEN LOWER(TRIM(COALESCE(pickup.city, ''))) <> LOWER(TRIM(COALESCE(delivery.city, ''))) THEN TRUE
  ELSE FALSE
END;

COMMIT;
