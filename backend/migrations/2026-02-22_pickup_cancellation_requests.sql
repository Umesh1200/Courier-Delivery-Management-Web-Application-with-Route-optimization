-- Pickup cancellation request decision workflow
-- Date: 2026-02-22

START TRANSACTION;

CREATE TABLE IF NOT EXISTS cancellation_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  type ENUM('pickup') NOT NULL DEFAULT 'pickup',
  reason VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  context VARCHAR(50) NULL,
  actor_courier_id BIGINT NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decided_by_admin_id BIGINT NULL,
  decided_at TIMESTAMP NULL,
  admin_note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cancellation_requests_order (order_id),
  INDEX idx_cancellation_requests_order_status (order_id, status),
  INDEX idx_cancellation_requests_actor (actor_courier_id),
  CONSTRAINT fk_cancellation_requests_order FOREIGN KEY (order_id) REFERENCES bookings(id),
  CONSTRAINT fk_cancellation_requests_actor FOREIGN KEY (actor_courier_id) REFERENCES users(id),
  CONSTRAINT fk_cancellation_requests_admin FOREIGN KEY (decided_by_admin_id) REFERENCES users(id)
);

COMMIT;
