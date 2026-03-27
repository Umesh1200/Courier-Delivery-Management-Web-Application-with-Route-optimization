-- Delivery reattempt + RTS status migration
-- Date: 2026-03-03

START TRANSACTION;

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
    'delivery_attempt_failed',
    'waiting_for_reattempt',
    'rts_pending',
    'returned_to_sender',
    'delivered',
    'cancelled'
  ) NOT NULL DEFAULT 'created';

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
    'delivery_attempt_failed',
    'waiting_for_reattempt',
    'rts_pending',
    'returned_to_sender',
    'delivered',
    'cancelled'
  ) NOT NULL;

ALTER TABLE order_events
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
    'delivery_attempt_failed',
    'waiting_for_reattempt',
    'rts_pending',
    'returned_to_sender',
    'delivered',
    'cancelled'
  ) NOT NULL;

COMMIT;
