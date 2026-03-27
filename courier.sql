CREATE DATABASE courier CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE courier;

CREATE TABLE roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(30),
  avatar_url TEXT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active','inactive','banned') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE branches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  address_line VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) DEFAULT 'USA',
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  contact_name VARCHAR(150),
  contact_phone VARCHAR(30),
  contact_email VARCHAR(150),
  status ENUM('active','maintenance','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE courier_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL UNIQUE,
  branch_id BIGINT NULL,
  courier_role ENUM('pickup','delivery','both','linehaul','express') DEFAULT 'both',
  rating DECIMAL(3,2) DEFAULT 0,
  total_deliveries INT DEFAULT 0,
  completed_deliveries INT DEFAULT 0,
  experience_years INT DEFAULT 0,
  availability ENUM('online','offline','busy') DEFAULT 'offline',
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE vehicles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,
  plate_number VARCHAR(50) UNIQUE NOT NULL,
  capacity_kg DECIMAL(10,2),
  status ENUM('active','maintenance','inactive') DEFAULT 'active',
  branch_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE vehicle_assignments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  vehicle_id BIGINT NOT NULL,
  courier_id BIGINT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unassigned_at TIMESTAMP NULL,
  status ENUM('active','ended') DEFAULT 'active',
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (courier_id) REFERENCES users(id)
);

CREATE TABLE addresses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  line1 VARCHAR(255) NOT NULL,
  line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) DEFAULT 'USA',
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  contact_name VARCHAR(150),
  contact_phone VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE packages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  category VARCHAR(100),
  size VARCHAR(50),
  declared_weight VARCHAR(50),
  measured_weight VARCHAR(50),
  description TEXT,
  length_cm DECIMAL(10,2),
  width_cm DECIMAL(10,2),
  height_cm DECIMAL(10,2),
  declared_value DECIMAL(12,2),
  special_instructions TEXT,
  signature_required BOOLEAN DEFAULT false,
  photo_proof BOOLEAN DEFAULT false,
  call_before_delivery BOOLEAN DEFAULT false,
  fragile_handling BOOLEAN DEFAULT false,
  insurance BOOLEAN DEFAULT false
);

CREATE TABLE bookings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  booking_code VARCHAR(50) UNIQUE NOT NULL,
  customer_id BIGINT NOT NULL,
  courier_id BIGINT NULL,
  pickup_courier_id BIGINT NULL,
  delivery_courier_id BIGINT NULL,
  linehaul_courier_id BIGINT NULL,
  package_id BIGINT NOT NULL,
  pickup_address_id BIGINT NOT NULL,
  delivery_address_id BIGINT NOT NULL,
  origin_branch_id BIGINT NULL,
  destination_branch_id BIGINT NULL,
  current_branch_id BIGINT NULL,
  branch_id BIGINT NULL,
  service_type ENUM('same-day','next-day','scheduled','standard','express') NOT NULL,
  priority ENUM('normal','express') DEFAULT 'normal',
  scheduled_date DATE NULL,
  scheduled_time VARCHAR(50) NULL,
  delivery_deadline DATETIME NULL,
  requires_linehaul BOOLEAN DEFAULT false,
  is_intercity BOOLEAN DEFAULT false,
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
  ) DEFAULT 'created',
  linehaul_load_confirmed_at TIMESTAMP NULL,
  delivery_load_confirmed_at TIMESTAMP NULL,
  distance_km DECIMAL(10,2),
  eta_minutes INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (origin_branch_id),
  INDEX (destination_branch_id),
  INDEX (current_branch_id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (courier_id) REFERENCES users(id),
  FOREIGN KEY (pickup_courier_id) REFERENCES users(id),
  FOREIGN KEY (delivery_courier_id) REFERENCES users(id),
  FOREIGN KEY (linehaul_courier_id) REFERENCES users(id),
  FOREIGN KEY (package_id) REFERENCES packages(id),
  FOREIGN KEY (pickup_address_id) REFERENCES addresses(id),
  FOREIGN KEY (delivery_address_id) REFERENCES addresses(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE booking_status_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  booking_id BIGINT NOT NULL,
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
  description VARCHAR(255),
  location_text VARCHAR(255),
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE order_events (
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
  FOREIGN KEY (order_id) REFERENCES bookings(id)
);

CREATE TABLE cancellation_requests (
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
  FOREIGN KEY (order_id) REFERENCES bookings(id),
  FOREIGN KEY (actor_courier_id) REFERENCES users(id),
  FOREIGN KEY (decided_by_admin_id) REFERENCES users(id)
);

CREATE TABLE payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  booking_id BIGINT NOT NULL,
  method ENUM('credit-card','debit-card','cash','wallet') NOT NULL,
  provider VARCHAR(50),
  provider_reference VARCHAR(100),
  provider_payload JSON,
  base_rate DECIMAL(12,2),
  distance_fee DECIMAL(12,2),
  service_fee DECIMAL(12,2),
  additional_fees DECIMAL(12,2),
  subtotal DECIMAL(12,2),
  tax DECIMAL(12,2),
  discount DECIMAL(12,2),
  total DECIMAL(12,2),
  status ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  booking_id BIGINT NOT NULL,
  sender_id BIGINT NOT NULL,
  sender_role ENUM('customer','courier') NOT NULL,
  recipient_id BIGINT NOT NULL,
  recipient_role ENUM('customer','courier') NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (recipient_id) REFERENCES users(id)
);

CREATE TABLE ratings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  booking_id BIGINT NOT NULL,
  courier_id BIGINT NOT NULL,
  rater_id BIGINT NOT NULL,
  stage ENUM('pickup','delivery','linehaul') NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (courier_id) REFERENCES users(id),
  FOREIGN KEY (rater_id) REFERENCES users(id)
);

CREATE TABLE fines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  booking_id BIGINT NOT NULL,
  error_type ENUM(
    'under_reported_weight',
    'too_large_vehicle',
    'wrong_street_number',
    'wrong_city_postal'
  ) NOT NULL,
  immediate_result VARCHAR(255) NOT NULL,
  financial_result VARCHAR(255) NOT NULL,
  fine_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  status ENUM('pending','applied','waived') DEFAULT 'pending',
  issued_by BIGINT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (issued_by) REFERENCES users(id)
);

CREATE TABLE proofs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  booking_id BIGINT NOT NULL,
  photo_url VARCHAR(500),
  signature_url VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE system_alerts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  category VARCHAR(50) NOT NULL,
  alert_name VARCHAR(150) NOT NULL,
  trigger_condition VARCHAR(255) NOT NULL,
  recommended_action VARCHAR(255) NOT NULL,
  status ENUM('open','acknowledged','closed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL
);

CREATE TABLE courier_live_location (
  courier_id BIGINT PRIMARY KEY,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (courier_id) REFERENCES users(id)
);

CREATE TABLE graph_nodes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  external_ref VARCHAR(100),
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE graph_edges (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  from_node_id BIGINT NOT NULL,
  to_node_id BIGINT NOT NULL,
  distance_km DECIMAL(10,4) NOT NULL,
  travel_time_min DECIMAL(10,2) NOT NULL,
  road_type VARCHAR(50),
  is_bidirectional BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_node_id) REFERENCES graph_nodes(id),
  FOREIGN KEY (to_node_id) REFERENCES graph_nodes(id)
);

CREATE TABLE route_plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  courier_id BIGINT NOT NULL,
  status ENUM('draft','active','completed','cancelled') DEFAULT 'draft',
  selected_candidate_id BIGINT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (courier_id) REFERENCES users(id)
);

CREATE TABLE route_candidates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  route_plan_id BIGINT NOT NULL,
  candidate_type ENUM('sequential','time_priority','optimized') NOT NULL,
  score DECIMAL(10,4) NOT NULL,
  distance_km DECIMAL(10,4) NULL,
  eta_minutes INT NULL,
  payload_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_plan_id) REFERENCES route_plans(id)
);

CREATE TABLE route_stops (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  route_plan_id BIGINT NOT NULL,
  booking_id BIGINT NOT NULL,
  stop_kind ENUM('pickup','delivery') NOT NULL,
  address_id BIGINT NOT NULL,
  stop_order INT NOT NULL,
  locked BOOLEAN DEFAULT false,
  eta_minutes INT NULL,
  status ENUM('pending','reached','skipped') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_plan_id) REFERENCES route_plans(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id)
);
