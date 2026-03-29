<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$config = require __DIR__ . '/../config.php';

function db_connect(array $config)
{
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $config['host'],
        $config['name'],
        $config['charset']
    );

    return new PDO($dsn, $config['user'], $config['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
}

function json_response($data, $status = 200)
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

require_once __DIR__ . '/../Algorithms/AutoAssign.php';
require_once __DIR__ . '/../Algorithms/RouteOptimization.php';

function get_json_body()
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function ensure_role(PDO $pdo, $roleName)
{
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
    $stmt->execute(['name' => $roleName]);
    $role = $stmt->fetch();
    if ($role) {
        return $role['id'];
    }
    $insert = $pdo->prepare('INSERT INTO roles (name) VALUES (:name)');
    $insert->execute(['name' => $roleName]);
    return $pdo->lastInsertId();
}

function user_has_role(PDO $pdo, int $userId, string $roleName): bool
{
    $stmt = $pdo->prepare(
        'SELECT 1
         FROM user_roles
         JOIN roles ON roles.id = user_roles.role_id
         WHERE user_roles.user_id = :user_id AND roles.name = :role
         LIMIT 1'
    );
    $stmt->execute([
        'user_id' => $userId,
        'role' => $roleName
    ]);
    return (bool)$stmt->fetchColumn();
}

function courier_chat_access(array $booking): array
{
    $courierRole = strtolower(trim((string)($booking['courier_role'] ?? 'both')));
    $status = strtolower(trim((string)($booking['status'] ?? '')));
    $pickupStatuses = ['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch'];
    $deliveryStatuses = ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery'];
    $isPickupStage = in_array($status, $pickupStatuses, true);
    $isDeliveryStage = in_array($status, $deliveryStatuses, true);

    if ($courierRole === 'express') {
        $courierRole = 'delivery';
    }
    if ($courierRole === 'linehaul') {
        return ['allowed' => false, 'reason' => 'Linehaul couriers do not use customer chat.'];
    }
    if ($courierRole === 'pickup') {
        return $isPickupStage
            ? ['allowed' => true, 'reason' => '']
            : ['allowed' => false, 'reason' => 'Chat is only available during pickup stage.'];
    }
    if ($courierRole === 'delivery') {
        return $isDeliveryStage
            ? ['allowed' => true, 'reason' => '']
            : ['allowed' => false, 'reason' => 'Chat is only available during delivery stage.'];
    }
    return ($isPickupStage || $isDeliveryStage)
        ? ['allowed' => true, 'reason' => '']
        : ['allowed' => false, 'reason' => 'Chat unlocks only during pickup or delivery stages.'];
}

function courier_matches_booking_assignment(array $booking, int $courierId): bool
{
    if ($courierId <= 0) {
        return false;
    }
    $assignedCourierIds = array_values(array_unique(array_filter([
        (int)($booking['courier_id'] ?? 0),
        (int)($booking['pickup_courier_id'] ?? 0),
        (int)($booking['delivery_courier_id'] ?? 0),
        (int)($booking['linehaul_courier_id'] ?? 0)
    ], function ($value) {
        return (int)$value > 0;
    })));
    return in_array($courierId, $assignedCourierIds, true);
}

function courier_has_booking_message_access(PDO $pdo, int $bookingId, int $courierId): bool
{
    if ($bookingId <= 0 || $courierId <= 0) {
        return false;
    }
    try {
        $stmt = $pdo->prepare(
            "SELECT 1
             FROM messages
             WHERE booking_id = :booking_id
               AND (
                   (recipient_id = :courier_id AND recipient_role = 'courier')
                   OR (sender_id = :courier_id AND sender_role = 'courier')
               )
             LIMIT 1"
        );
        $stmt->execute([
            'booking_id' => $bookingId,
            'courier_id' => $courierId
        ]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

function generate_token()
{
    return bin2hex(random_bytes(24));
}

function generate_booking_code(PDO $pdo)
{
    $prefix = 'CF';
    for ($i = 0; $i < 5; $i++) {
        $code = $prefix . date('ymdHis') . random_int(100, 999);
        $stmt = $pdo->prepare('SELECT id FROM bookings WHERE booking_code = :code');
        $stmt->execute(['code' => $code]);
        if (!$stmt->fetch()) {
            return $code;
        }
    }
    return $prefix . date('ymdHis') . random_int(1000, 9999);
}

function normalize_delivery_access_code($value)
{
    $normalized = strtoupper(trim((string)$value));
    if ($normalized === '') {
        return '';
    }
    return preg_replace('/[^A-Z0-9]/', '', $normalized) ?: '';
}

function generate_delivery_access_code(PDO $pdo)
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $alphabetLength = strlen($alphabet);
    for ($attempt = 0; $attempt < 10; $attempt++) {
        $token = '';
        for ($idx = 0; $idx < 8; $idx++) {
            $token .= $alphabet[random_int(0, $alphabetLength - 1)];
        }
        $code = 'DA-' . $token;
        $stmt = $pdo->prepare('SELECT id FROM bookings WHERE delivery_access_code = :code LIMIT 1');
        $stmt->execute(['code' => $code]);
        if (!$stmt->fetch()) {
            return $code;
        }
    }

    return 'DA-' . strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
}

function booking_delivery_access_code_matches(array $booking, $inputCode): bool
{
    $stored = normalize_delivery_access_code($booking['delivery_access_code'] ?? '');
    $input = normalize_delivery_access_code($inputCode);
    if ($stored === '' || $input === '') {
        return false;
    }
    return hash_equals($stored, $input);
}

function to_decimal_or_null($value)
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    return (float)$value;
}

function to_bool($value)
{
    return filter_var($value, FILTER_VALIDATE_BOOLEAN);
}

function backend_base_url()
{
    $isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $scheme = $isHttps ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost:8000';
    return $scheme . '://' . $host;
}

function users_avatar_column_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }

    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'avatar_url'");
        if ($stmt && $stmt->fetch()) {
            $ready = true;
            return true;
        }

        $pdo->exec('ALTER TABLE users ADD COLUMN avatar_url TEXT NULL AFTER phone');
        $ready = true;
    } catch (Throwable $e) {
        $ready = false;
    }

    return $ready;
}

function save_user_avatar_from_data_url($dataUrl, $userId)
{
    $raw = trim((string)$dataUrl);
    if ($raw === '') {
        return null;
    }

    if (!preg_match('/^data:(image\\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+\\/=\\s]+)$/', $raw, $matches)) {
        return null;
    }

    $mime = strtolower($matches[1]);
    $extMap = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/webp' => 'webp'
    ];
    $extension = $extMap[$mime] ?? null;
    if ($extension === null) {
        return null;
    }

    $binary = base64_decode(preg_replace('/\\s+/', '', $matches[2]), true);
    if ($binary === false || strlen($binary) === 0) {
        return null;
    }
    if (strlen($binary) > 5 * 1024 * 1024) {
        return null;
    }

    $uploadDir = __DIR__ . '/uploads/avatars';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
        return null;
    }

    try {
        $token = bin2hex(random_bytes(8));
    } catch (Throwable $e) {
        $token = (string)mt_rand(10000000, 99999999);
    }

    $filename = sprintf('user_%d_avatar_%s.%s', (int)$userId, $token, $extension);
    $filePath = $uploadDir . '/' . $filename;
    $bytes = file_put_contents($filePath, $binary);
    if ($bytes === false) {
        return null;
    }

    return backend_base_url() . '/uploads/avatars/' . $filename;
}

function save_proof_image_from_data_url($dataUrl, $bookingId, $kind)
{
    $raw = trim((string)$dataUrl);
    if ($raw === '') {
        return null;
    }

    if (!preg_match('/^data:(image\\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+\\/=\\s]+)$/', $raw, $matches)) {
        return null;
    }

    $mime = strtolower($matches[1]);
    $extMap = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/webp' => 'webp'
    ];
    $extension = $extMap[$mime] ?? null;
    if ($extension === null) {
        return null;
    }

    $binary = base64_decode(preg_replace('/\\s+/', '', $matches[2]), true);
    if ($binary === false || strlen($binary) === 0) {
        return null;
    }
    if (strlen($binary) > 5 * 1024 * 1024) {
        return null;
    }

    $uploadDir = __DIR__ . '/uploads/proofs';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
        return null;
    }

    try {
        $token = bin2hex(random_bytes(8));
    } catch (Throwable $e) {
        $token = (string)mt_rand(10000000, 99999999);
    }

    $safeKind = preg_replace('/[^a-z0-9_\\-]/i', '', (string)$kind);
    if ($safeKind === '') {
        $safeKind = 'proof';
    }
    $filename = sprintf('booking_%d_%s_%s.%s', (int)$bookingId, $safeKind, $token, $extension);
    $filePath = $uploadDir . '/' . $filename;
    $bytes = file_put_contents($filePath, $binary);
    if ($bytes === false) {
        return null;
    }

    return backend_base_url() . '/uploads/proofs/' . $filename;
}

function save_support_image_from_data_url($dataUrl, $ticketId, $kind = 'attachment')
{
    $raw = trim((string)$dataUrl);
    if ($raw === '') {
        return null;
    }

    if (!preg_match('/^data:(image\\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+\\/=\\s]+)$/', $raw, $matches)) {
        return null;
    }

    $mime = strtolower($matches[1]);
    $extMap = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/webp' => 'webp'
    ];
    $extension = $extMap[$mime] ?? null;
    if ($extension === null) {
        return null;
    }

    $binary = base64_decode(preg_replace('/\\s+/', '', $matches[2]), true);
    if ($binary === false || strlen($binary) === 0) {
        return null;
    }
    if (strlen($binary) > 5 * 1024 * 1024) {
        return null;
    }

    $uploadDir = __DIR__ . '/uploads/support';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
        return null;
    }

    try {
        $token = bin2hex(random_bytes(8));
    } catch (Throwable $e) {
        $token = (string)mt_rand(10000000, 99999999);
    }

    $safeKind = preg_replace('/[^a-z0-9_\\-]/i', '', (string)$kind);
    if ($safeKind === '') {
        $safeKind = 'attachment';
    }
    $filename = sprintf('support_%d_%s_%s.%s', (int)$ticketId, $safeKind, $token, $extension);
    $filePath = $uploadDir . '/' . $filename;
    $bytes = file_put_contents($filePath, $binary);
    if ($bytes === false) {
        return null;
    }

    return backend_base_url() . '/uploads/support/' . $filename;
}

function support_tables_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }

    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS support_tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT NULL,
                booking_code VARCHAR(64) NULL,
                customer_id INT NOT NULL,
                category VARCHAR(64) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                image_url TEXT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'open',
                assigned_admin_id INT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_message_at TIMESTAMP NULL DEFAULT NULL,
                last_message_preview VARCHAR(255) NULL,
                INDEX idx_support_tickets_customer (customer_id, created_at),
                INDEX idx_support_tickets_status (status, created_at),
                INDEX idx_support_tickets_booking (booking_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS support_ticket_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id INT NOT NULL,
                sender_id INT NOT NULL,
                sender_role VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_support_ticket_messages_ticket (ticket_id, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        $ready = true;
    } catch (Throwable $e) {
        $ready = false;
    }

    return $ready;
}

function support_ticket_status_values()
{
    return ['open', 'in_progress', 'resolved', 'closed'];
}

function normalize_support_ticket_status($value, $fallback = 'open')
{
    $status = strtolower(trim((string)$value));
    if (in_array($status, support_ticket_status_values(), true)) {
        return $status;
    }
    return $fallback;
}

function support_ticket_category_values()
{
    return ['report_issue', 'change_delivery_address', 'reschedule_delivery', 'live_chat', 'other'];
}

function normalize_support_ticket_category($value)
{
    $category = strtolower(trim((string)$value));
    if (in_array($category, support_ticket_category_values(), true)) {
        return $category;
    }
    return 'other';
}

function normalize_notification_role($value, $fallback = '')
{
    $role = strtolower(trim((string)$value));
    if (in_array($role, ['customer', 'courier', 'admin'], true)) {
        return $role;
    }
    return $fallback;
}

function notifications_table_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }

    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS notifications (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT NOT NULL,
                audience_role VARCHAR(20) NULL,
                type VARCHAR(50) NOT NULL DEFAULT 'info',
                title VARCHAR(150) NOT NULL,
                body TEXT NULL,
                icon VARCHAR(100) NULL,
                link_url TEXT NULL,
                dedupe_key VARCHAR(191) NULL,
                is_read BOOLEAN DEFAULT false,
                read_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        $columnMigrations = [
            "SHOW COLUMNS FROM notifications LIKE 'audience_role'" => "ALTER TABLE notifications ADD COLUMN audience_role VARCHAR(20) NULL AFTER user_id",
            "SHOW COLUMNS FROM notifications LIKE 'type'" => "ALTER TABLE notifications ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT 'info' AFTER audience_role",
            "SHOW COLUMNS FROM notifications LIKE 'icon'" => "ALTER TABLE notifications ADD COLUMN icon VARCHAR(100) NULL AFTER body",
            "SHOW COLUMNS FROM notifications LIKE 'link_url'" => "ALTER TABLE notifications ADD COLUMN link_url TEXT NULL AFTER icon",
            "SHOW COLUMNS FROM notifications LIKE 'dedupe_key'" => "ALTER TABLE notifications ADD COLUMN dedupe_key VARCHAR(191) NULL AFTER link_url",
            "SHOW COLUMNS FROM notifications LIKE 'read_at'" => "ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP NULL DEFAULT NULL AFTER is_read"
        ];

        foreach ($columnMigrations as $checkSql => $alterSql) {
            $stmt = $pdo->query($checkSql);
            if ($stmt && $stmt->fetch()) {
                continue;
            }
            $pdo->exec($alterSql);
        }

        $ready = true;
    } catch (Throwable $e) {
        $ready = false;
    }

    return $ready;
}

function notification_select_sql()
{
    return 'SELECT id, user_id, audience_role, type, title, body, icon, link_url, dedupe_key, is_read, read_at, created_at FROM notifications';
}

function notification_to_response(array $row): array
{
    $icon = trim((string)($row['icon'] ?? ''));
    $link = trim((string)($row['link_url'] ?? ''));
    $dedupeKey = trim((string)($row['dedupe_key'] ?? ''));

    return [
        'id' => (string)($row['id'] ?? ''),
        'userId' => (int)($row['user_id'] ?? 0),
        'role' => ($row['audience_role'] ?? '') !== '' ? (string)$row['audience_role'] : null,
        'type' => ($row['type'] ?? '') !== '' ? (string)$row['type'] : 'info',
        'title' => (string)($row['title'] ?? ''),
        'message' => (string)($row['body'] ?? ''),
        'icon' => $icon !== '' ? $icon : 'Bell',
        'link' => $link !== '' ? $link : null,
        'read' => !empty($row['is_read']),
        'dedupeKey' => $dedupeKey !== '' ? $dedupeKey : null,
        'createdAt' => $row['created_at'] ?? null,
        'readAt' => $row['read_at'] ?? null
    ];
}

function fetch_notification_for_user(PDO $pdo, int $notificationId, int $userId, ?string $role = null): ?array
{
    if ($notificationId <= 0 || $userId <= 0 || !notifications_table_ready($pdo)) {
        return null;
    }

    $sql = notification_select_sql() . ' WHERE id = :id AND user_id = :user_id';
    $params = [
        'id' => $notificationId,
        'user_id' => $userId
    ];
    if ($role !== null && $role !== '') {
        $sql .= ' AND audience_role <=> :audience_role';
        $params['audience_role'] = $role;
    }
    $sql .= ' LIMIT 1';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row ? notification_to_response($row) : null;
}

function fetch_user_notifications(PDO $pdo, int $userId, ?string $role = null, int $limit = 50): array
{
    if ($userId <= 0 || !notifications_table_ready($pdo)) {
        return [];
    }

    $safeLimit = max(1, min(100, (int)$limit));
    $sql = notification_select_sql() . ' WHERE user_id = :user_id';
    $params = ['user_id' => $userId];

    if ($role !== null && $role !== '') {
        $sql .= ' AND audience_role <=> :audience_role';
        $params['audience_role'] = $role;
    }

    $sql .= ' ORDER BY created_at DESC, id DESC LIMIT ' . $safeLimit;
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    return array_map('notification_to_response', $rows);
}

function unread_notification_count(PDO $pdo, int $userId, ?string $role = null): int
{
    if ($userId <= 0 || !notifications_table_ready($pdo)) {
        return 0;
    }

    $sql = 'SELECT COUNT(*) FROM notifications WHERE user_id = :user_id AND is_read = 0';
    $params = ['user_id' => $userId];

    if ($role !== null && $role !== '') {
        $sql .= ' AND audience_role <=> :audience_role';
        $params['audience_role'] = $role;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function create_user_notification(PDO $pdo, int $userId, array $payload): ?array
{
    if ($userId <= 0 || !notifications_table_ready($pdo)) {
        return null;
    }

    $title = trim((string)($payload['title'] ?? ''));
    $message = trim((string)($payload['message'] ?? $payload['body'] ?? ''));
    if ($title === '' || $message === '') {
        return null;
    }

    $role = normalize_notification_role(
        $payload['role'] ?? $payload['audienceRole'] ?? $payload['audience_role'] ?? '',
        ''
    );
    $type = trim((string)($payload['type'] ?? 'info'));
    if ($type === '') {
        $type = 'info';
    }
    $icon = trim((string)($payload['icon'] ?? 'Bell'));
    if ($icon === '') {
        $icon = 'Bell';
    }
    $link = trim((string)($payload['link'] ?? $payload['linkUrl'] ?? $payload['link_url'] ?? ''));
    $link = $link !== '' ? $link : null;
    $dedupeKey = trim((string)($payload['dedupeKey'] ?? $payload['dedupe_key'] ?? ''));
    $dedupeKey = $dedupeKey !== '' ? $dedupeKey : null;

    if ($dedupeKey !== null) {
        $check = $pdo->prepare(
            notification_select_sql() . '
             WHERE user_id = :user_id
               AND audience_role <=> :audience_role
               AND dedupe_key = :dedupe_key
             ORDER BY id DESC
             LIMIT 1'
        );
        $check->execute([
            'user_id' => $userId,
            'audience_role' => $role !== '' ? $role : null,
            'dedupe_key' => $dedupeKey
        ]);
        $existing = $check->fetch();
        if ($existing) {
            return notification_to_response($existing);
        }
    }

    $insert = $pdo->prepare(
        'INSERT INTO notifications (user_id, audience_role, type, title, body, icon, link_url, dedupe_key, is_read)
         VALUES (:user_id, :audience_role, :type, :title, :body, :icon, :link_url, :dedupe_key, :is_read)'
    );
    $insert->execute([
        'user_id' => $userId,
        'audience_role' => $role !== '' ? $role : null,
        'type' => $type,
        'title' => $title,
        'body' => $message,
        'icon' => $icon,
        'link_url' => $link,
        'dedupe_key' => $dedupeKey,
        'is_read' => 0
    ]);

    return fetch_notification_for_user($pdo, (int)$pdo->lastInsertId(), $userId, $role !== '' ? $role : null);
}

function mark_user_notification_read(PDO $pdo, int $notificationId, int $userId, ?string $role = null): ?array
{
    if ($notificationId <= 0 || $userId <= 0 || !notifications_table_ready($pdo)) {
        return null;
    }

    $sql = 'UPDATE notifications
            SET is_read = 1,
                read_at = IFNULL(read_at, NOW())
            WHERE id = :id
              AND user_id = :user_id';
    $params = [
        'id' => $notificationId,
        'user_id' => $userId
    ];
    if ($role !== null && $role !== '') {
        $sql .= ' AND audience_role <=> :audience_role';
        $params['audience_role'] = $role;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return fetch_notification_for_user($pdo, $notificationId, $userId, $role);
}

function mark_all_user_notifications_read(PDO $pdo, int $userId, ?string $role = null): int
{
    if ($userId <= 0 || !notifications_table_ready($pdo)) {
        return 0;
    }

    $sql = 'UPDATE notifications
            SET is_read = 1,
                read_at = IFNULL(read_at, NOW())
            WHERE user_id = :user_id
              AND is_read = 0';
    $params = ['user_id' => $userId];

    if ($role !== null && $role !== '') {
        $sql .= ' AND audience_role <=> :audience_role';
        $params['audience_role'] = $role;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

function clear_user_notifications(PDO $pdo, int $userId, ?string $role = null): int
{
    if ($userId <= 0 || !notifications_table_ready($pdo)) {
        return 0;
    }

    $sql = 'DELETE FROM notifications WHERE user_id = :user_id';
    $params = ['user_id' => $userId];

    if ($role !== null && $role !== '') {
        $sql .= ' AND audience_role <=> :audience_role';
        $params['audience_role'] = $role;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

function add_system_alert(PDO $pdo, string $category, string $name, string $trigger, string $action)
{
    $check = $pdo->prepare(
        'SELECT id FROM system_alerts WHERE status = :status AND alert_name = :name AND trigger_condition = :trigger LIMIT 1'
    );
    $check->execute([
        'status' => 'open',
        'name' => $name,
        'trigger' => $trigger
    ]);
    if ($check->fetch()) {
        return;
    }

    $insert = $pdo->prepare(
        'INSERT INTO system_alerts (category, alert_name, trigger_condition, recommended_action, status)
         VALUES (:category, :alert_name, :trigger_condition, :recommended_action, :status)'
    );
    $insert->execute([
        'category' => $category,
        'alert_name' => $name,
        'trigger_condition' => $trigger,
        'recommended_action' => $action,
        'status' => 'open'
    ]);
}

function format_code_label($value)
{
    $label = str_replace(['_', '-'], ' ', strtolower(trim((string)$value)));
    if ($label === '') {
        return '';
    }
    return ucwords($label);
}

function cancellation_reason_catalog()
{
    return [
        'pickup_cancellation' => [
            'sender_unavailable' => 'Sender unavailable',
            'address_unreachable' => 'Address unreachable',
            'unsafe_location' => 'Unsafe location',
            'package_issue' => 'Package issue',
            'other' => 'Other'
        ],
        'delivery_cancellation' => [
            'customer_cancel_before_load' => 'Customer cancelled before load',
            'invalid_delivery_window' => 'Invalid delivery window',
            'address_issue' => 'Address issue',
            'package_issue' => 'Package issue',
            'other' => 'Other'
        ],
        'delivery_failure' => [
            'customer_unreachable' => 'Customer unreachable',
            'address_closed' => 'Address closed',
            'refused_by_recipient' => 'Recipient refused delivery',
            'unsafe_location' => 'Unsafe location',
            'payment_collection_failed' => 'Payment collection failed',
            'other' => 'Other'
        ],
        'final_cancellation' => [
            'customer_confirmed_cancellation' => 'Customer confirmed cancellation',
            'delivery_attempt_failed' => 'Delivery attempt failed',
            'address_verification_failed' => 'Address verification failed',
            'policy_exception' => 'Policy exception',
            'other' => 'Other'
        ],
        'pre_pickup_force_cancellation' => [
            'customer_requested_cancel' => 'Customer requested cancellation',
            'address_invalid' => 'Invalid pickup address',
            'merchant_unavailable' => 'Sender unavailable for pickup',
            'ops_exception' => 'Operational exception',
            'other' => 'Other'
        ]
    ];
}

function cancellation_reason_label($type, $reasonCode)
{
    $catalog = cancellation_reason_catalog();
    $typeKey = strtolower(trim((string)$type));
    $reasonKey = strtolower(trim((string)$reasonCode));
    if ($reasonKey === '') {
        return '';
    }
    if (isset($catalog[$typeKey][$reasonKey])) {
        return $catalog[$typeKey][$reasonKey];
    }
    return format_code_label($reasonKey);
}

function cancellation_reason_allowed($type, $reasonCode)
{
    $catalog = cancellation_reason_catalog();
    $typeKey = strtolower(trim((string)$type));
    $reasonKey = strtolower(trim((string)$reasonCode));
    if (!isset($catalog[$typeKey]) || $reasonKey === '') {
        return false;
    }
    return array_key_exists($reasonKey, $catalog[$typeKey]);
}

function insert_booking_message(
    PDO $pdo,
    int $bookingId,
    int $senderId,
    string $senderRole,
    int $recipientId,
    string $recipientRole,
    string $message
) {
    $normalizedSenderRole = strtolower(trim($senderRole));
    $normalizedRecipientRole = strtolower(trim($recipientRole));
    $content = trim($message);
    if (
        $bookingId <= 0
        || $senderId <= 0
        || $recipientId <= 0
        || $content === ''
        || !in_array($normalizedSenderRole, ['customer', 'courier'], true)
        || !in_array($normalizedRecipientRole, ['customer', 'courier'], true)
    ) {
        return;
    }

    try {
        $insert = $pdo->prepare(
            'INSERT INTO messages (booking_id, sender_id, sender_role, recipient_id, recipient_role, message)
             VALUES (:booking_id, :sender_id, :sender_role, :recipient_id, :recipient_role, :message)'
        );
        $insert->execute([
            'booking_id' => $bookingId,
            'sender_id' => $senderId,
            'sender_role' => $normalizedSenderRole,
            'recipient_id' => $recipientId,
            'recipient_role' => $normalizedRecipientRole,
            'message' => $content
        ]);
    } catch (Throwable $e) {
        // Ignore notification write errors to avoid blocking primary flow.
    }
}

function pickup_completed_status($status)
{
    $code = normalize_booking_status_code((string)$status);
    return in_array($code, [
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
        'returned_to_sender'
    ], true);
}

function booking_has_delivery_failure_event(PDO $pdo, int $bookingId): bool
{
    if ($bookingId <= 0) {
        return false;
    }

    if (order_events_table_supported($pdo)) {
        try {
            $stmt = $pdo->prepare(
                "SELECT 1
                 FROM order_events
                 WHERE order_id = :id
                   AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.action')) = 'delivery_failure'
                 ORDER BY id DESC
                 LIMIT 1"
            );
            $stmt->execute(['id' => $bookingId]);
            if ($stmt->fetchColumn()) {
                return true;
            }
        } catch (Throwable $e) {
            // Fall back to booking status events lookup.
        }
    }

    $fallback = $pdo->prepare(
        "SELECT 1
         FROM booking_status_events
         WHERE booking_id = :id
           AND description LIKE :needle
         ORDER BY id DESC
         LIMIT 1"
    );
    $fallback->execute([
        'id' => $bookingId,
        'needle' => '%incident (delivery_failure)%'
    ]);
    return (bool)$fallback->fetchColumn();
}

function is_demo_system_alert(array $row): bool
{
    $name = strtolower(trim((string)($row['alert_name'] ?? '')));
    $trigger = strtolower(trim((string)($row['trigger_condition'] ?? '')));
    $demoNames = [
        'ghost shipment',
        'api latency',
        'auth timeout',
        'driver conflict',
        'capacity breach',
        'invalid route'
    ];
    if (!in_array($name, $demoNames, true)) {
        return false;
    }
    $demoTriggers = [
        'shipment created with 0 weight or null dimensions.',
        'mock geocoding or payment api takes > 2 seconds.',
        'token expiration or invalid local session.',
        'two users attempt to "accept" the same order id simultaneously.',
        'assigned parcel volume exceeds vehicle/hub max limit.',
        'start/end coordinates are identical or mathematically impossible.'
    ];
    return $trigger === '' || in_array($trigger, $demoTriggers, true);
}

function parse_weight_kg($value)
{
    if ($value === null) {
        return 0.0;
    }
    if (is_numeric($value)) {
        return (float)$value;
    }
    if (preg_match('/([0-9]+(?:\\.[0-9]+)?)/', (string)$value, $matches)) {
        return (float)$matches[1];
    }
    return 0.0;
}

function fine_error_type_catalog()
{
    return [
        'under_reported_weight' => 'Under-reported Weight',
        'too_large_vehicle' => 'Too Large for Vehicle',
        'wrong_street_number' => 'Wrong Street Number',
        'wrong_city_postal' => 'Wrong City/Postal Code'
    ];
}

function fine_error_type_label($value)
{
    $code = strtolower(trim((string)$value));
    $catalog = fine_error_type_catalog();
    if (isset($catalog[$code])) {
        return $catalog[$code];
    }
    return format_code_label($code);
}

function fine_issue_allowed_statuses()
{
    return [
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
        'waiting_for_reattempt'
    ];
}

function fine_can_be_issued_for_status($status)
{
    $normalized = normalize_booking_status_code((string)$status);
    return in_array($normalized, fine_issue_allowed_statuses(), true);
}

function latest_booking_fine(PDO $pdo, int $bookingId, bool $pendingOnly = false)
{
    if ($bookingId <= 0) {
        return null;
    }
    try {
        $sql = "SELECT id, booking_id, error_type, immediate_result, financial_result, fine_amount, notes, status, issued_by, issued_at
                FROM fines
                WHERE booking_id = :id";
        if ($pendingOnly) {
            $sql .= " AND status = 'pending'";
        }
        $sql .= ' ORDER BY issued_at DESC, id DESC LIMIT 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $bookingId]);
        $row = $stmt->fetch();
        return $row ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

function booking_has_pending_fine(PDO $pdo, int $bookingId): bool
{
    $fine = latest_booking_fine($pdo, $bookingId, true);
    return is_array($fine) && strtolower(trim((string)($fine['status'] ?? ''))) === 'pending';
}

function pickup_assignment_distance_limit_km($serviceType)
{
    $service = strtolower(trim((string)$serviceType));
    if ($service === 'express') {
        return 25.0;
    }
    if ($service === 'same-day') {
        return 35.0;
    }
    if ($service === 'next-day') {
        return 55.0;
    }
    return 75.0;
}

function pickup_vehicle_type_compatible($vehicleType, $packageSize, $packageWeightKg)
{
    $type = strtolower(trim((string)$vehicleType));
    if ($type === '') {
        return false;
    }

    $sizeToken = strtolower(trim((string)$packageSize));
    $weightKg = is_numeric($packageWeightKg) ? (float)$packageWeightKg : 0.0;
    $isTwoWheeler = strpos($type, 'bike') !== false
        || strpos($type, 'bicycle') !== false
        || strpos($type, 'scooter') !== false
        || strpos($type, 'motor') !== false;
    $isLargeSize = $sizeToken !== ''
        && (
            strpos($sizeToken, 'large') !== false
            || strpos($sizeToken, 'xl') !== false
            || $sizeToken === 'l'
            || strpos($sizeToken, 'heavy') !== false
        );

    if ($isTwoWheeler && ($isLargeSize || $weightKg > 15.0)) {
        return false;
    }

    return true;
}

function pickup_assignment_courier_start_point(array $courier)
{
    if (has_valid_coords($courier['live_lat'] ?? null, $courier['live_lng'] ?? null)) {
        return [
            'lat' => (float)$courier['live_lat'],
            'lng' => (float)$courier['live_lng']
        ];
    }
    if (has_valid_coords($courier['branch_lat'] ?? null, $courier['branch_lng'] ?? null)) {
        return [
            'lat' => (float)$courier['branch_lat'],
            'lng' => (float)$courier['branch_lng']
        ];
    }
    return null;
}

function pickup_assignment_is_courier_eligible(PDO $pdo, array $booking, array $courier)
{
    $role = strtolower(trim((string)($courier['courier_role'] ?? '')));
    if (!in_array($role, ['pickup', 'both'], true)) {
        return ['eligible' => false, 'reason' => 'role', 'distanceKm' => null];
    }

    $userStatus = strtolower(trim((string)($courier['user_status'] ?? '')));
    if ($userStatus !== 'active') {
        return ['eligible' => false, 'reason' => 'inactive', 'distanceKm' => null];
    }

    $availability = strtolower(trim((string)($courier['availability'] ?? '')));
    if ($availability !== 'online') {
        return ['eligible' => false, 'reason' => 'unavailable', 'distanceKm' => null];
    }

    $serviceType = strtolower(trim((string)($booking['service_type'] ?? '')));
    if (!in_array($serviceType, ['same-day', 'next-day', 'standard', 'scheduled', 'express'], true)) {
        return ['eligible' => false, 'reason' => 'service', 'distanceKm' => null];
    }

    $vehicleStatus = strtolower(trim((string)($courier['vehicle_status'] ?? '')));
    $vehicleCapacityKg = $courier['vehicle_capacity_kg'] !== null ? (float)$courier['vehicle_capacity_kg'] : 0.0;
    $packageWeightKg = parse_weight_kg($booking['declared_weight'] ?? null);
    if ($vehicleStatus !== 'active' || $vehicleCapacityKg <= 0) {
        return ['eligible' => false, 'reason' => 'vehicle', 'distanceKm' => null];
    }
    if (!pickup_vehicle_type_compatible($courier['vehicle_type'] ?? null, $booking['size'] ?? null, $packageWeightKg)) {
        return ['eligible' => false, 'reason' => 'vehicle_type', 'distanceKm' => null];
    }

    if ($packageWeightKg > 0) {
        $courierId = (int)($courier['id'] ?? 0);
        if ($courierId <= 0) {
            return ['eligible' => false, 'reason' => 'courier', 'distanceKm' => null];
        }
        $currentLoadKg = get_courier_current_load_kg($pdo, $courierId);
        $remainingKg = $vehicleCapacityKg - $currentLoadKg;
        if ($remainingKg < $packageWeightKg) {
            return ['eligible' => false, 'reason' => 'capacity', 'distanceKm' => null];
        }
    }

    $distanceKm = null;
    if (has_valid_coords($booking['pickup_lat'] ?? null, $booking['pickup_lng'] ?? null)) {
        $start = pickup_assignment_courier_start_point($courier);
        if ($start === null) {
            return ['eligible' => false, 'reason' => 'location', 'distanceKm' => null];
        }
        $distanceKm = calculate_distance_km(
            $booking['pickup_lat'],
            $booking['pickup_lng'],
            $start['lat'],
            $start['lng']
        );
        if (!is_numeric($distanceKm)) {
            return ['eligible' => false, 'reason' => 'distance', 'distanceKm' => null];
        }
        if ((float)$distanceKm > pickup_assignment_distance_limit_km($serviceType)) {
            return ['eligible' => false, 'reason' => 'distance', 'distanceKm' => null];
        }
    } else {
        $pickupCity = normalize_city_token($booking['pickup_city'] ?? null);
        $pickupProvince = normalize_city_token($booking['pickup_province'] ?? null);
        if ($pickupCity !== '' || $pickupProvince !== '') {
            $branchCity = normalize_city_token($courier['branch_city'] ?? null);
            $branchProvince = normalize_city_token($courier['branch_province'] ?? null);
            $cityMatch = $pickupCity !== '' && $branchCity === $pickupCity;
            $provinceMatch = $pickupProvince !== '' && $branchProvince === $pickupProvince;
            if (!$cityMatch && !$provinceMatch) {
                return ['eligible' => false, 'reason' => 'branch_region', 'distanceKm' => null];
            }
        }
    }

    return ['eligible' => true, 'reason' => null, 'distanceKm' => $distanceKm];
}

function delivery_assignment_dispatch_scope(PDO $pdo, array $booking)
{
    $isIntercity = booking_is_intercity($booking);
    $dispatchBranchId = $isIntercity
        ? (int)($booking['destination_branch_id'] ?? 0)
        : (int)($booking['origin_branch_id'] ?? 0);
    $dispatchBranch = fetch_branch_payload($pdo, $dispatchBranchId);
    if (!$dispatchBranch) {
        $dispatchBranchId = 0;
    }

    $fallbackCity = $isIntercity
        ? ($booking['delivery_city'] ?? null)
        : ($booking['pickup_city'] ?? null);
    $fallbackProvince = $isIntercity
        ? ($booking['delivery_province'] ?? null)
        : ($booking['pickup_province'] ?? null);

    $dispatchCity = normalize_city_token($dispatchBranch['city'] ?? $fallbackCity);
    $dispatchProvince = normalize_city_token($dispatchBranch['province'] ?? $fallbackProvince);

    return [
        'isIntercity' => $isIntercity,
        'branchId' => $dispatchBranchId,
        'city' => $dispatchCity,
        'province' => $dispatchProvince
    ];
}

function delivery_assignment_branch_compatible(array $dispatchScope, array $courier)
{
    $dispatchBranchId = (int)($dispatchScope['branchId'] ?? 0);
    $dispatchCity = normalize_city_token($dispatchScope['city'] ?? null);
    $dispatchProvince = normalize_city_token($dispatchScope['province'] ?? null);
    $courierBranchId = (int)($courier['branch_id'] ?? 0);
    $courierCity = normalize_city_token($courier['branch_city'] ?? null);
    $courierProvince = normalize_city_token($courier['branch_province'] ?? null);

    if ($dispatchBranchId > 0 && $courierBranchId === $dispatchBranchId) {
        return true;
    }
    if ($dispatchCity !== '') {
        return $courierCity !== '' && $courierCity === $dispatchCity;
    }
    if ($dispatchProvince !== '') {
        return $courierProvince !== '' && $courierProvince === $dispatchProvince;
    }
    return true;
}

function delivery_assignment_is_courier_eligible(PDO $pdo, array $booking, array $courier, $dispatchScope = null)
{
    $role = strtolower(trim((string)($courier['courier_role'] ?? '')));
    if (!in_array($role, ['delivery', 'both', 'express'], true)) {
        return ['eligible' => false, 'reason' => 'role'];
    }

    $userStatus = strtolower(trim((string)($courier['user_status'] ?? '')));
    if ($userStatus !== 'active') {
        return ['eligible' => false, 'reason' => 'inactive'];
    }

    $availability = strtolower(trim((string)($courier['availability'] ?? '')));
    if ($availability !== 'online') {
        return ['eligible' => false, 'reason' => 'unavailable'];
    }

    $serviceType = strtolower(trim((string)($booking['service_type'] ?? '')));
    if (!in_array($serviceType, ['same-day', 'next-day', 'standard', 'scheduled', 'express'], true)) {
        return ['eligible' => false, 'reason' => 'service'];
    }

    $scope = is_array($dispatchScope) ? $dispatchScope : delivery_assignment_dispatch_scope($pdo, $booking);
    if (!delivery_assignment_branch_compatible($scope, $courier)) {
        return ['eligible' => false, 'reason' => 'dispatch_scope'];
    }

    $vehicleStatus = strtolower(trim((string)($courier['vehicle_status'] ?? '')));
    $vehicleCapacityKg = $courier['vehicle_capacity_kg'] !== null ? (float)$courier['vehicle_capacity_kg'] : 0.0;
    $packageWeightKg = parse_weight_kg($booking['declared_weight'] ?? null);
    if ($vehicleStatus !== 'active' || $vehicleCapacityKg <= 0) {
        return ['eligible' => false, 'reason' => 'vehicle'];
    }
    if (!pickup_vehicle_type_compatible($courier['vehicle_type'] ?? null, $booking['size'] ?? null, $packageWeightKg)) {
        return ['eligible' => false, 'reason' => 'vehicle_type'];
    }

    if ($packageWeightKg > 0) {
        $courierId = (int)($courier['id'] ?? 0);
        if ($courierId <= 0) {
            return ['eligible' => false, 'reason' => 'courier'];
        }
        $currentLoadKg = get_courier_current_load_kg($pdo, $courierId);
        $remainingKg = $vehicleCapacityKg - $currentLoadKg;
        if ($remainingKg < $packageWeightKg) {
            return ['eligible' => false, 'reason' => 'capacity'];
        }
    }

    return ['eligible' => true, 'reason' => null];
}

function normalize_city_token($value)
{
    $city = strtolower(trim((string)$value));
    if ($city === '') {
        return '';
    }
    $city = preg_replace('/\s+/', ' ', $city);
    return $city ?? '';
}

function booking_is_intercity(array $booking)
{
    if (to_bool($booking['requires_linehaul'] ?? false)) {
        return true;
    }

    $originBranchId = (int)($booking['origin_branch_id'] ?? 0);
    $destinationBranchId = (int)($booking['destination_branch_id'] ?? 0);
    if ($originBranchId > 0 && $destinationBranchId > 0) {
        return $originBranchId !== $destinationBranchId;
    }

    $originCity = normalize_city_token($booking['origin_city'] ?? $booking['pickup_city'] ?? null);
    $destinationCity = normalize_city_token($booking['destination_city'] ?? $booking['delivery_city'] ?? null);
    if ($originCity !== '' && $destinationCity !== '' && $originCity !== $destinationCity) {
        return true;
    }

    return false;
}

function fetch_branch_payload(PDO $pdo, int $branchId)
{
    static $cache = [];
    if ($branchId <= 0) {
        return null;
    }
    if (array_key_exists($branchId, $cache)) {
        return $cache[$branchId];
    }

    $stmt = $pdo->prepare(
        'SELECT id, name, address_line, city, province, postal_code, lat, lng
         FROM branches
         WHERE id = :id
         LIMIT 1'
    );
    $stmt->execute(['id' => $branchId]);
    $row = $stmt->fetch();
    if (!$row) {
        $cache[$branchId] = null;
        return null;
    }

    $cache[$branchId] = [
        'id' => (int)$row['id'],
        'name' => $row['name'] ?: null,
        'address' => $row['address_line'] ?: null,
        'city' => $row['city'] ?: null,
        'province' => $row['province'] ?: null,
        'postalCode' => $row['postal_code'] ?: null,
        'lat' => $row['lat'] !== null ? (float)$row['lat'] : null,
        'lng' => $row['lng'] !== null ? (float)$row['lng'] : null
    ];
    return $cache[$branchId];
}

function apply_branch_anchor_fallback(?array $branchPayload, $anchorLat = null, $anchorLng = null, float $maxDistanceKm = 80.0): ?array
{
    if (!$branchPayload || !has_valid_coords($anchorLat, $anchorLng)) {
        return $branchPayload;
    }

    $anchorLatValue = (float)$anchorLat;
    $anchorLngValue = (float)$anchorLng;
    $branchLat = $branchPayload['lat'] ?? null;
    $branchLng = $branchPayload['lng'] ?? null;
    if (!has_valid_coords($branchLat, $branchLng)) {
        $branchPayload['lat'] = $anchorLatValue;
        $branchPayload['lng'] = $anchorLngValue;
        return $branchPayload;
    }

    if (!function_exists('calculate_distance_km')) {
        return $branchPayload;
    }

    $distanceKm = calculate_distance_km(
        $anchorLatValue,
        $anchorLngValue,
        (float)$branchLat,
        (float)$branchLng
    );
    if (is_numeric($distanceKm) && (float)$distanceKm > $maxDistanceKm) {
        $branchPayload['lat'] = $anchorLatValue;
        $branchPayload['lng'] = $anchorLngValue;
    }

    return $branchPayload;
}

function resolve_destination_branch_for_booking_row(PDO $pdo, array $row, bool $persist = true)
{
    if (!function_exists('find_nearest_branch')) {
        return null;
    }

    $bookingId = (int)($row['id'] ?? 0);
    $currentDestinationBranchId = (int)($row['destination_branch_id'] ?? 0);
    $resolvedBranchId = find_nearest_branch(
        $pdo,
        $row['delivery_lat'] ?? null,
        $row['delivery_lng'] ?? null,
        $row['delivery_city'] ?? null,
        $row['delivery_province'] ?? null
    );
    $targetBranchId = $resolvedBranchId !== null ? (int)$resolvedBranchId : ($currentDestinationBranchId > 0 ? $currentDestinationBranchId : 0);
    if ($targetBranchId <= 0) {
        return null;
    }

    if ($persist && $bookingId > 0 && $targetBranchId !== $currentDestinationBranchId) {
        $update = $pdo->prepare('UPDATE bookings SET destination_branch_id = :destination_branch_id WHERE id = :id');
        $update->execute([
            'destination_branch_id' => $targetBranchId,
            'id' => $bookingId
        ]);
    }

    $payload = fetch_branch_payload($pdo, $targetBranchId);
    return apply_branch_anchor_fallback($payload, $row['delivery_lat'] ?? null, $row['delivery_lng'] ?? null);
}

function normalize_booking_status_code($status)
{
    $value = strtolower(trim((string)$status));
    if ($value === 'in_transit_to_branch') {
        return 'in_transit_to_origin_branch';
    }
    if ($value === 'in_branch_origin') {
        return 'received_at_origin_branch';
    }
    if ($value === 'in_branch_destination') {
        return 'received_at_destination_branch';
    }
    return $value;
}

function order_status_flow($isIntercity)
{
    $flow = [
        'created',
        'pickup_assigned',
        'picked_up',
        'in_transit_to_origin_branch',
        'received_at_origin_branch'
    ];
    if ($isIntercity) {
        $flow[] = 'linehaul_assigned';
        $flow[] = 'linehaul_load_confirmed';
        $flow[] = 'linehaul_in_transit';
        $flow[] = 'received_at_destination_branch';
    }
    $flow[] = 'delivery_assigned';
    $flow[] = 'delivery_load_confirmed';
    $flow[] = 'out_for_delivery';
    $flow[] = 'delivery_attempt_failed';
    $flow[] = 'waiting_for_reattempt';
    $flow[] = 'rts_pending';
    $flow[] = 'returned_to_sender';
    $flow[] = 'delivered';
    return $flow;
}

function order_status_transition_map($isIntercity)
{
    $map = [
        'created' => ['pickup_assigned'],
        'pickup_assigned' => ['picked_up'],
        'picked_up' => ['in_transit_to_origin_branch'],
        'in_transit_to_origin_branch' => ['received_at_origin_branch'],
        'delivery_assigned' => ['delivery_load_confirmed'],
        'delivery_load_confirmed' => ['out_for_delivery'],
        'out_for_delivery' => ['delivered', 'delivery_attempt_failed'],
        'delivery_attempt_failed' => ['waiting_for_reattempt'],
        'waiting_for_reattempt' => ['delivery_assigned', 'rts_pending'],
        'rts_pending' => ['returned_to_sender'],
        'returned_to_sender' => [],
        'delivered' => [],
        'cancelled' => []
    ];

    if ($isIntercity) {
        $map['received_at_origin_branch'] = ['linehaul_assigned'];
        $map['linehaul_assigned'] = ['linehaul_load_confirmed'];
        $map['linehaul_load_confirmed'] = ['linehaul_in_transit'];
        $map['linehaul_in_transit'] = ['received_at_destination_branch'];
        $map['received_at_destination_branch'] = ['delivery_assigned'];
    } else {
        $map['received_at_origin_branch'] = ['delivery_assigned'];
    }

    return $map;
}

function delivery_dispatch_ready_status($isIntercity)
{
    return $isIntercity ? 'received_at_destination_branch' : 'received_at_origin_branch';
}

function can_transition_status($currentStatus, $nextStatus, $isIntercity)
{
    $currentStatus = normalize_booking_status_code($currentStatus);
    $nextStatus = normalize_booking_status_code($nextStatus);
    if ($nextStatus === 'cancelled') {
        return !in_array($currentStatus, ['delivered', 'cancelled', 'returned_to_sender'], true);
    }
    $transitionMap = order_status_transition_map($isIntercity);
    $allowedNext = $transitionMap[$currentStatus] ?? [];
    return in_array($nextStatus, $allowedNext, true);
}

function booking_status_side_effect_sql($status)
{
    $status = normalize_booking_status_code($status);
    $parts = [];
    if ($status === 'received_at_origin_branch') {
        $parts[] = 'current_branch_id = origin_branch_id';
    } elseif ($status === 'received_at_destination_branch') {
        $parts[] = 'current_branch_id = destination_branch_id';
    }
    if ($status === 'linehaul_load_confirmed') {
        $parts[] = 'linehaul_load_confirmed_at = CURRENT_TIMESTAMP';
    } elseif ($status === 'delivery_load_confirmed') {
        $parts[] = 'delivery_load_confirmed_at = CURRENT_TIMESTAMP';
    }
    return $parts;
}

function normalize_actor_type($actorType)
{
    $value = strtolower(trim((string)$actorType));
    if (!in_array($value, ['system', 'customer', 'courier', 'admin', 'branch'], true)) {
        return 'system';
    }
    return $value;
}

function order_events_table_supported(PDO $pdo)
{
    static $supported = null;
    if ($supported !== null) {
        return $supported;
    }
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'order_events'");
        $supported = (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        $supported = false;
    }
    return $supported;
}

function cancellation_requests_table_supported(PDO $pdo)
{
    static $supported = null;
    if ($supported !== null) {
        return $supported;
    }
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'cancellation_requests'");
        $supported = (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        $supported = false;
    }
    return $supported;
}

function find_pickup_cancellation_order_event_id(PDO $pdo, int $bookingId, int $requestId): ?int
{
    if ($bookingId <= 0 || $requestId <= 0 || !order_events_table_supported($pdo)) {
        return null;
    }

    try {
        $stmt = $pdo->prepare(
            'SELECT id, metadata
             FROM order_events
             WHERE order_id = :id
             ORDER BY id DESC
             LIMIT 120'
        );
        $stmt->execute(['id' => $bookingId]);
        foreach ($stmt as $row) {
            $metadataRaw = $row['metadata'] ?? null;
            if (!is_string($metadataRaw) || trim($metadataRaw) === '') {
                continue;
            }
            $metadata = json_decode($metadataRaw, true);
            if (!is_array($metadata)) {
                continue;
            }
            $action = strtolower(trim((string)($metadata['action'] ?? '')));
            $metadataRequestId = isset($metadata['requestId']) ? (int)$metadata['requestId'] : 0;
            if ($action === 'pickup_cancellation' && $metadataRequestId === $requestId) {
                return (int)$row['id'];
            }
            if ($action === 'pickup_cancellation' && (int)$row['id'] === $requestId) {
                // Legacy pickup cancellation records may not have metadata.requestId.
                return (int)$row['id'];
            }
        }
    } catch (Throwable $e) {
        return null;
    }

    return null;
}

function update_pickup_cancellation_order_event_decision(
    PDO $pdo,
    int $bookingId,
    int $requestId,
    string $decisionStatus,
    ?string $decisionReasonCode,
    ?string $decisionReasonText,
    ?string $decisionNotes,
    ?int $adminId
) {
    $eventId = find_pickup_cancellation_order_event_id($pdo, $bookingId, $requestId);
    if ($eventId === null || $eventId <= 0) {
        return;
    }

    try {
        $metadataStmt = $pdo->prepare('SELECT metadata FROM order_events WHERE id = :id LIMIT 1');
        $metadataStmt->execute(['id' => $eventId]);
        $metadataRaw = $metadataStmt->fetchColumn();
        $metadata = [];
        if (is_string($metadataRaw) && trim($metadataRaw) !== '') {
            $decoded = json_decode($metadataRaw, true);
            if (is_array($decoded)) {
                $metadata = $decoded;
            }
        }

        $normalizedDecision = strtolower(trim($decisionStatus));
        $metadata['decisionStatus'] = $normalizedDecision !== '' ? $normalizedDecision : 'pending';
        $metadata['decisionReasonCode'] = $decisionReasonCode !== null && trim((string)$decisionReasonCode) !== ''
            ? strtolower(trim((string)$decisionReasonCode))
            : null;
        $metadata['decisionReasonText'] = $decisionReasonText !== null && trim((string)$decisionReasonText) !== ''
            ? trim((string)$decisionReasonText)
            : null;
        $metadata['decisionNotes'] = $decisionNotes !== null && trim((string)$decisionNotes) !== ''
            ? trim((string)$decisionNotes)
            : null;
        $metadata['decisionAt'] = date('Y-m-d H:i:s');
        $metadata['decisionBy'] = $adminId !== null && $adminId > 0 ? $adminId : null;

        $updateStmt = $pdo->prepare('UPDATE order_events SET metadata = :metadata WHERE id = :id');
        $updateStmt->execute([
            'metadata' => json_encode($metadata),
            'id' => $eventId
        ]);
    } catch (Throwable $e) {
        // Keep primary flow successful even if metadata sync fails.
    }
}

function latest_pickup_cancellation_order_event_id(PDO $pdo, int $bookingId): int
{
    if ($bookingId <= 0 || !order_events_table_supported($pdo)) {
        return 0;
    }

    try {
        $latestStmt = $pdo->prepare(
            "SELECT id
             FROM order_events
             WHERE order_id = :order_id
               AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.action')) = 'pickup_cancellation'
             ORDER BY id DESC
             LIMIT 1"
        );
        $latestStmt->execute(['order_id' => $bookingId]);
        $latestId = (int)($latestStmt->fetchColumn() ?: 0);
        if ($latestId > 0) {
            return $latestId;
        }
    } catch (Throwable $e) {
        // Fall through to metadata parsing fallback.
    }

    try {
        $scanStmt = $pdo->prepare(
            'SELECT id, metadata
             FROM order_events
             WHERE order_id = :order_id
             ORDER BY id DESC
             LIMIT 200'
        );
        $scanStmt->execute(['order_id' => $bookingId]);
        foreach ($scanStmt as $row) {
            $metadataRaw = $row['metadata'] ?? null;
            if (!is_string($metadataRaw) || trim($metadataRaw) === '') {
                continue;
            }
            $metadata = json_decode($metadataRaw, true);
            if (!is_array($metadata)) {
                continue;
            }
            $action = strtolower(trim((string)($metadata['action'] ?? '')));
            if ($action === 'pickup_cancellation') {
                return (int)$row['id'];
            }
        }
    } catch (Throwable $e) {
        return 0;
    }

    return 0;
}

function write_order_event(
    PDO $pdo,
    $bookingId,
    $status,
    $actorType = 'system',
    $actorId = null,
    $metadata = null,
    $description = null
) {
    if (!order_events_table_supported($pdo)) {
        return;
    }

    $metadataJson = null;
    if ($metadata !== null) {
        if (is_array($metadata) || is_object($metadata)) {
            $metadataJson = json_encode($metadata);
        } else {
            $metadataJson = json_encode(['value' => $metadata]);
        }
    }
    if ($description !== null) {
        $decoded = $metadataJson ? json_decode($metadataJson, true) : [];
        if (!is_array($decoded)) {
            $decoded = [];
        }
        $decoded['description'] = $description;
        $metadataJson = json_encode($decoded);
    }

    $insert = $pdo->prepare(
        'INSERT INTO order_events (order_id, status, actor_type, actor_id, metadata)
         VALUES (:order_id, :status, :actor_type, :actor_id, :metadata)'
    );
    $insert->execute([
        'order_id' => (int)$bookingId,
        'status' => $status,
        'actor_type' => normalize_actor_type($actorType),
        'actor_id' => $actorId !== null ? (int)$actorId : null,
        'metadata' => $metadataJson
    ]);
}

function calculate_courier_fee($distanceKm, $weightKg, $category, $serviceType)
{
    if ($distanceKm === null) {
        return 0.0;
    }

    $basePay = 60.0;
    $distancePay = 10.0 * $distanceKm;
    $extraWeightKg = max(0.0, $weightKg - 3.0);
    $weightPay = 10.0 * $extraWeightKg;

    $electronicsFee = 0.0;
    if ($category && stripos($category, 'electronics') !== false) {
        $electronicsFee = 20.0;
    }

    $expressFee = 0.0;
    if ($serviceType === 'express') {
        $expressFee = $distanceKm > 10 ? 50.0 : 30.0;
    }

    return $basePay + $distancePay + $weightPay + $electronicsFee + $expressFee;
}

function calculate_distance_between_points_or_null($fromLat, $fromLng, $toLat, $toLng)
{
    if (!has_valid_coords($fromLat, $fromLng) || !has_valid_coords($toLat, $toLng)) {
        return null;
    }
    if (!function_exists('calculate_distance_km')) {
        return null;
    }
    $distanceKm = calculate_distance_km(
        (float)$fromLat,
        (float)$fromLng,
        (float)$toLat,
        (float)$toLng
    );
    return is_numeric($distanceKm) ? (float)$distanceKm : null;
}

function earning_context_is_intercity(array $context): bool
{
    if (array_key_exists('is_intercity', $context)) {
        return to_bool($context['is_intercity']);
    }
    if (array_key_exists('requires_linehaul', $context) && to_bool($context['requires_linehaul'])) {
        return true;
    }

    $originBranchId = (int)($context['origin_branch_id'] ?? 0);
    $destinationBranchId = (int)($context['destination_branch_id'] ?? 0);
    if ($originBranchId > 0 && $destinationBranchId > 0) {
        return $originBranchId !== $destinationBranchId;
    }

    $pickupCity = normalize_city_token($context['pickup_city'] ?? null);
    $deliveryCity = normalize_city_token($context['delivery_city'] ?? null);
    if ($pickupCity !== '' && $deliveryCity !== '' && $pickupCity !== $deliveryCity) {
        return true;
    }

    return false;
}

function resolve_earning_distance_km($courierRole, $distanceKm, array $context = [])
{
    $role = strtolower(trim((string)($courierRole ?: 'delivery')));
    $fallbackDistanceKm = is_numeric($distanceKm) ? (float)$distanceKm : null;
    if (!$context) {
        return $fallbackDistanceKm;
    }

    $isIntercity = earning_context_is_intercity($context);
    if ($role === 'linehaul') {
        $linehaulDistanceKm = calculate_distance_between_points_or_null(
            $context['origin_branch_lat'] ?? null,
            $context['origin_branch_lng'] ?? null,
            $context['destination_branch_lat'] ?? null,
            $context['destination_branch_lng'] ?? null
        );
        return $linehaulDistanceKm !== null ? $linehaulDistanceKm : $fallbackDistanceKm;
    }

    if (in_array($role, ['delivery', 'express'], true) && $isIntercity) {
        $deliveryLegDistanceKm = calculate_distance_between_points_or_null(
            $context['destination_branch_lat'] ?? null,
            $context['destination_branch_lng'] ?? null,
            $context['delivery_lat'] ?? null,
            $context['delivery_lng'] ?? null
        );
        return $deliveryLegDistanceKm !== null ? $deliveryLegDistanceKm : $fallbackDistanceKm;
    }

    return $fallbackDistanceKm;
}

function calculate_role_earning_components($courierRole, $status, $distanceKm, $weightKg, $category, $serviceType, array $context = [])
{
    $role = strtolower(trim((string)($courierRole ?: 'delivery')));
    $effectiveDistanceKm = resolve_earning_distance_km($role, $distanceKm, $context);
    $basePay = 60.0;
    $distancePay = $effectiveDistanceKm !== null ? (10.0 * $effectiveDistanceKm) : 0.0;
    $weightPay = 10.0 * max(0.0, $weightKg - 3.0);
    $electronicsFee = ($category && stripos($category, 'electronics') !== false) ? 20.0 : 0.0;
    $expressFee = ($serviceType === 'express')
        ? ($effectiveDistanceKm !== null && $effectiveDistanceKm > 10 ? 50.0 : 30.0)
        : 0.0;
    $deliveryFee = $basePay + $distancePay + $weightPay + $electronicsFee + $expressFee;
    $pickupFee = $basePay;
    $linehaulFee = $basePay + $distancePay;

    if ($role === 'pickup') {
        return [
            'base' => $basePay,
            'distance' => 0.0,
            'weight' => 0.0,
            'extras' => 0.0,
            'total' => $pickupFee
        ];
    }
    if ($role === 'linehaul') {
        return [
            'base' => $basePay,
            'distance' => $distancePay,
            'weight' => 0.0,
            'extras' => 0.0,
            'total' => $linehaulFee
        ];
    }
    if ($role === 'both') {
        if ($status === 'delivered') {
            return [
                'base' => $basePay + $basePay,
                'distance' => $distancePay,
                'weight' => $weightPay,
                'extras' => $electronicsFee + $expressFee,
                'total' => $pickupFee + $deliveryFee
            ];
        }
        return [
            'base' => $basePay,
            'distance' => 0.0,
            'weight' => 0.0,
            'extras' => 0.0,
            'total' => $pickupFee
        ];
    }
    return [
        'base' => $basePay,
        'distance' => $distancePay,
        'weight' => $weightPay,
        'extras' => $electronicsFee + $expressFee,
        'total' => $deliveryFee
    ];
}

function calculate_role_earnings($courierRole, $status, $distanceKm, $weightKg, $category, $serviceType, array $context = [])
{
    $components = calculate_role_earning_components($courierRole, $status, $distanceKm, $weightKg, $category, $serviceType, $context);
    return (float)($components['total'] ?? 0.0);
}

function courier_assignment_condition($courierRole)
{
    $role = $courierRole ?: 'delivery';
    if ($role === 'pickup') {
        return 'bookings.pickup_courier_id = :id';
    }
    if ($role === 'linehaul') {
        return 'bookings.linehaul_courier_id = :id';
    }
    if ($role === 'delivery') {
        return 'bookings.delivery_courier_id = :id';
    }
    if ($role === 'both') {
        return '(bookings.pickup_courier_id = :id OR bookings.delivery_courier_id = :id OR bookings.linehaul_courier_id = :id)';
    }
    return 'bookings.courier_id = :id';
}

function courier_dashboard_visible_statuses($courierRole)
{
    $role = $courierRole ?: 'delivery';
    if ($role === 'pickup') {
        return [
            'pickup_assigned',
            'picked_up',
            'in_transit_to_origin_branch',
            'received_at_origin_branch',
            'cancelled'
        ];
    }
    if ($role === 'linehaul') {
        return [
            'linehaul_assigned',
            'linehaul_load_confirmed',
            'linehaul_in_transit',
            'received_at_destination_branch',
            'delivery_assigned',
            'delivery_load_confirmed',
            'out_for_delivery',
            'delivered',
            'cancelled'
        ];
    }
    if ($role === 'both') {
        return [
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
        ];
    }
    return ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender', 'delivered', 'cancelled'];
}

function courier_dashboard_active_statuses($courierRole)
{
    $role = $courierRole ?: 'delivery';
    if ($role === 'pickup') {
        return ['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch'];
    }
    if ($role === 'linehaul') {
        return ['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit'];
    }
    if ($role === 'both') {
        return [
            'pickup_assigned',
            'picked_up',
            'in_transit_to_origin_branch',
            'linehaul_assigned',
            'linehaul_load_confirmed',
            'linehaul_in_transit',
            'delivery_assigned',
            'delivery_load_confirmed',
            'out_for_delivery',
            'delivery_attempt_failed'
        ];
    }
    return ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'];
}

function courier_earnable_statuses($courierRole)
{
    $role = $courierRole ?: 'delivery';
    if ($role === 'pickup') {
        return [
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
            'delivered'
        ];
    }
    if ($role === 'linehaul') {
        return [
            'linehaul_assigned',
            'linehaul_load_confirmed',
            'linehaul_in_transit',
            'received_at_destination_branch',
            'delivery_assigned',
            'delivery_load_confirmed',
            'out_for_delivery',
            'delivered'
        ];
    }
    if ($role === 'both') {
        return [
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
            'delivered'
        ];
    }
    return ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivered'];
}

function courier_completed_statuses($courierRole)
{
    $role = $courierRole ?: 'delivery';
    if ($role === 'pickup') {
        return [
            'received_at_origin_branch',
            'linehaul_assigned',
            'linehaul_load_confirmed',
            'linehaul_in_transit',
            'received_at_destination_branch',
            'delivery_assigned',
            'delivery_load_confirmed',
            'out_for_delivery',
            'delivered'
        ];
    }
    if ($role === 'linehaul') {
        return [
            'received_at_destination_branch',
            'delivery_assigned',
            'delivery_load_confirmed',
            'out_for_delivery',
            'delivered'
        ];
    }
    if ($role === 'both') {
        return ['received_at_origin_branch', 'received_at_destination_branch', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender', 'delivered'];
    }
    return ['waiting_for_reattempt', 'rts_pending', 'returned_to_sender', 'delivered'];
}

function courier_assignment_event_statuses($courierRole)
{
    $role = $courierRole ?: 'delivery';
    if ($role === 'pickup') {
        return ['pickup_assigned'];
    }
    if ($role === 'linehaul') {
        return ['linehaul_assigned'];
    }
    if ($role === 'both') {
        return ['pickup_assigned', 'linehaul_assigned', 'delivery_assigned'];
    }
    return ['delivery_assigned'];
}

function normalize_payment_method($method)
{
    $value = strtolower(trim((string)$method));
    if ($value === 'cop' || $value === 'cash' || $value === 'cash on pickup') {
        return ['cash', null];
    }
    if ($value === 'khalti') {
        return ['wallet', 'khalti'];
    }
    if (in_array($value, ['paypal', 'apple-pay', 'google-pay'], true)) {
        return ['wallet', $value];
    }
    if (in_array($value, ['wallet', 'credit-card', 'debit-card'], true)) {
        return [$value, null];
    }
    return [null, null];
}

function resolve_payment_totals(array $paymentPayload, $distanceKm, $weightKg, $category, $serviceType)
{
    $total = to_decimal_or_null($paymentPayload['total'] ?? null);
    if ($total === null) {
        $total = calculate_courier_fee($distanceKm, $weightKg, $category, $serviceType);
    }

    $subtotal = to_decimal_or_null($paymentPayload['subtotal'] ?? null);
    $tax = to_decimal_or_null($paymentPayload['tax'] ?? null);
    $discount = to_decimal_or_null($paymentPayload['discount'] ?? null);
    if ($subtotal === null) {
        $subtotal = $total;
    }
    if ($tax === null) {
        $tax = 0.0;
    }
    if ($discount === null) {
        $discount = 0.0;
    }

    return [
        'base_rate' => to_decimal_or_null($paymentPayload['baseRate'] ?? null),
        'distance_fee' => to_decimal_or_null($paymentPayload['distanceFee'] ?? null),
        'service_fee' => to_decimal_or_null($paymentPayload['serviceFee'] ?? null),
        'additional_fees' => to_decimal_or_null($paymentPayload['additionalFees'] ?? null),
        'subtotal' => $subtotal,
        'tax' => $tax,
        'discount' => $discount,
        'total' => $total
    ];
}

function khalti_request(array $khaltiConfig, $endpoint, array $payload)
{
    $baseUrl = rtrim($khaltiConfig['api_url'] ?? '', '/');
    if ($baseUrl === '') {
        return ['ok' => false, 'status' => 0, 'error' => 'Khalti API URL missing', 'body' => null];
    }

    $url = $baseUrl . '/' . ltrim($endpoint, '/');
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Key ' . ($khaltiConfig['secret_key'] ?? '')
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

    $raw = curl_exec($ch);
    $error = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $decoded = null;
    if ($raw !== false) {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            $decoded = ['raw' => $raw];
        }
    }

    return [
        'ok' => $error === '' && $status >= 200 && $status < 300,
        'status' => $status,
        'error' => $error ?: null,
        'body' => $decoded
    ];
}

function get_query_param($key, $default = null)
{
    return $_GET[$key] ?? $default;
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = db_connect($config['db']);
} catch (Throwable $e) {
    json_response(['error' => 'Database connection failed'], 500);
}

if ($path === '/api/health' && $method === 'GET') {
    json_response(['status' => 'ok']);
}

if (preg_match('#^/api/users/(\d+)$#', $path, $matches) && $method === 'GET') {
    $userId = (int)$matches[1];
    $avatarSelectSql = users_avatar_column_ready($pdo)
        ? 'users.avatar_url AS avatar_url,'
        : 'NULL AS avatar_url,';
    $stmt = $pdo->prepare(
        "SELECT users.id, users.full_name, users.email, users.phone, {$avatarSelectSql} roles.name AS role,
                courier_profiles.courier_role, courier_profiles.availability, branches.name AS branch_name
         FROM users
         LEFT JOIN user_roles ON user_roles.user_id = users.id
         LEFT JOIN roles ON roles.id = user_roles.role_id
         LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
         LEFT JOIN branches ON branches.id = courier_profiles.branch_id
         WHERE users.id = :id
         LIMIT 1"
    );
    $stmt->execute(['id' => $userId]);
    $user = $stmt->fetch();
    if (!$user) {
        json_response(['error' => 'User not found'], 404);
    }
    $vehicle = null;
    if (($user['role'] ?? '') === 'courier') {
        $vehicle = courier_vehicle_details($pdo, $userId);
    }

    json_response([
        'id' => (int)$user['id'],
        'fullName' => $user['full_name'],
        'email' => $user['email'],
        'phone' => $user['phone'],
        'avatarUrl' => $user['avatar_url'] ?: null,
        'role' => $user['role'] ?: 'customer',
        'courierRole' => $user['courier_role'] ?: null,
        'availability' => $user['availability'] ?: null,
        'branchName' => $user['branch_name'] ?: null,
        'vehicle' => $vehicle
    ]);
}

if (preg_match('#^/api/users/(\d+)$#', $path, $matches) && $method === 'PATCH') {
    $userId = (int)$matches[1];
    $payload = get_json_body();
    $fullName = trim($payload['fullName'] ?? '');
    $email = trim($payload['email'] ?? '');
    $phone = trim($payload['phone'] ?? '');
    $hasFullName = array_key_exists('fullName', $payload);
    $hasEmail = array_key_exists('email', $payload);
    $hasPhone = array_key_exists('phone', $payload);
    $hasAvatarDataUrl = array_key_exists('avatarDataUrl', $payload);
    $avatarDataUrl = $payload['avatarDataUrl'] ?? null;
    $hasAvatarUrl = array_key_exists('avatarUrl', $payload);
    $avatarUrl = trim((string)($payload['avatarUrl'] ?? ''));
    $avatarColumnReady = users_avatar_column_ready($pdo);

    $stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = :id');
    $stmt->execute(['id' => $userId]);
    $existing = $stmt->fetch();
    if (!$existing) {
        json_response(['error' => 'User not found'], 404);
    }

    if ($hasEmail && $email !== '' && $email !== $existing['email']) {
        $check = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $check->execute(['email' => $email]);
        if ($check->fetch()) {
            json_response(['error' => 'Email already exists'], 409);
        }
    }

    if ($hasFullName && $fullName !== '') {
        $update = $pdo->prepare('UPDATE users SET full_name = :full_name WHERE id = :id');
        $update->execute(['full_name' => $fullName, 'id' => $userId]);
    }

    if ($hasEmail && $email !== '') {
        $update = $pdo->prepare('UPDATE users SET email = :email WHERE id = :id');
        $update->execute(['email' => $email, 'id' => $userId]);
    }

    if ($hasPhone) {
        $update = $pdo->prepare('UPDATE users SET phone = :phone WHERE id = :id');
        $update->execute(['phone' => $phone, 'id' => $userId]);
    }

    if ($hasAvatarDataUrl || $hasAvatarUrl) {
        if (!$avatarColumnReady) {
            json_response(['error' => 'Avatar storage is not available right now'], 500);
        }
        $nextAvatarUrl = null;
        if ($hasAvatarDataUrl) {
            $avatarRaw = trim((string)$avatarDataUrl);
            if ($avatarRaw !== '') {
                $savedAvatarUrl = save_user_avatar_from_data_url($avatarRaw, $userId);
                if (!$savedAvatarUrl) {
                    json_response(['error' => 'Invalid avatar image. Use PNG/JPG/WEBP under 5MB.'], 422);
                }
                $nextAvatarUrl = $savedAvatarUrl;
            }
        } elseif ($hasAvatarUrl) {
            $nextAvatarUrl = $avatarUrl !== '' ? $avatarUrl : null;
        }
        $update = $pdo->prepare('UPDATE users SET avatar_url = :avatar_url WHERE id = :id');
        $update->execute([
            'avatar_url' => $nextAvatarUrl,
            'id' => $userId
        ]);
    }

    $profileStmt = $avatarColumnReady
        ? $pdo->prepare('SELECT id, full_name, email, phone, avatar_url FROM users WHERE id = :id LIMIT 1')
        : $pdo->prepare('SELECT id, full_name, email, phone FROM users WHERE id = :id LIMIT 1');
    $profileStmt->execute(['id' => $userId]);
    $updated = $profileStmt->fetch();

    json_response([
        'message' => 'Profile updated',
        'user' => [
            'id' => (int)($updated['id'] ?? $userId),
            'fullName' => $updated['full_name'] ?? $fullName,
            'email' => $updated['email'] ?? $email,
            'phone' => $updated['phone'] ?? $phone,
            'avatarUrl' => $avatarColumnReady ? (($updated['avatar_url'] ?? '') ?: null) : null
        ]
    ]);
}

if ($path === '/api/notifications' && $method === 'GET') {
    $userId = (int)get_query_param('userId', 0);
    $role = normalize_notification_role(get_query_param('role', ''), '');
    $limit = (int)get_query_param('limit', 50);

    if ($userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }
    if (!notifications_table_ready($pdo)) {
        json_response(['error' => 'Notifications storage unavailable'], 500);
    }

    json_response([
        'notifications' => fetch_user_notifications($pdo, $userId, $role !== '' ? $role : null, $limit),
        'unreadCount' => unread_notification_count($pdo, $userId, $role !== '' ? $role : null)
    ]);
}

if ($path === '/api/notifications' && $method === 'POST') {
    $payload = get_json_body();
    $userId = (int)($payload['userId'] ?? 0);
    $role = normalize_notification_role($payload['role'] ?? '', '');
    $title = trim((string)($payload['title'] ?? ''));
    $message = trim((string)($payload['message'] ?? $payload['body'] ?? ''));

    if ($userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }
    if ($title === '' || $message === '') {
        json_response(['error' => 'title and message are required'], 422);
    }
    if (!notifications_table_ready($pdo)) {
        json_response(['error' => 'Notifications storage unavailable'], 500);
    }

    $notification = create_user_notification($pdo, $userId, [
        'role' => $role,
        'type' => $payload['type'] ?? 'info',
        'title' => $title,
        'message' => $message,
        'icon' => $payload['icon'] ?? 'Bell',
        'link' => $payload['link'] ?? null,
        'dedupeKey' => $payload['dedupeKey'] ?? null
    ]);

    if (!$notification) {
        json_response(['error' => 'Unable to save notification'], 500);
    }

    json_response(['notification' => $notification]);
}

if (preg_match('#^/api/notifications/(\d+)$#', $path, $matches) && $method === 'PATCH') {
    $notificationId = (int)$matches[1];
    $payload = get_json_body();
    $userId = (int)($payload['userId'] ?? 0);
    $role = normalize_notification_role($payload['role'] ?? '', '');
    $read = to_bool($payload['read'] ?? true);

    if ($userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }
    if (!$read) {
        json_response(['error' => 'Only read=true is supported'], 422);
    }
    if (!notifications_table_ready($pdo)) {
        json_response(['error' => 'Notifications storage unavailable'], 500);
    }

    $notification = mark_user_notification_read($pdo, $notificationId, $userId, $role !== '' ? $role : null);
    if (!$notification) {
        json_response(['error' => 'Notification not found'], 404);
    }

    json_response(['notification' => $notification]);
}

if ($path === '/api/notifications/read-all' && $method === 'POST') {
    $payload = get_json_body();
    $userId = (int)($payload['userId'] ?? 0);
    $role = normalize_notification_role($payload['role'] ?? '', '');

    if ($userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }
    if (!notifications_table_ready($pdo)) {
        json_response(['error' => 'Notifications storage unavailable'], 500);
    }

    $updated = mark_all_user_notifications_read($pdo, $userId, $role !== '' ? $role : null);
    json_response([
        'updated' => $updated,
        'notifications' => fetch_user_notifications($pdo, $userId, $role !== '' ? $role : null),
        'unreadCount' => unread_notification_count($pdo, $userId, $role !== '' ? $role : null)
    ]);
}

if ($path === '/api/notifications/clear' && $method === 'POST') {
    $payload = get_json_body();
    $userId = (int)($payload['userId'] ?? 0);
    $role = normalize_notification_role($payload['role'] ?? '', '');

    if ($userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }
    if (!notifications_table_ready($pdo)) {
        json_response(['error' => 'Notifications storage unavailable'], 500);
    }

    $deleted = clear_user_notifications($pdo, $userId, $role !== '' ? $role : null);
    json_response([
        'deleted' => $deleted,
        'notifications' => [],
        'unreadCount' => 0
    ]);
}

if ($path === '/api/dashboard/customer' && $method === 'GET') {
    $userId = (int)get_query_param('userId', 0);
    if ($userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }
    $spendPeriod = strtolower(trim((string)get_query_param('spendPeriod', 'lifetime')));
    if (!in_array($spendPeriod, ['lifetime', 'this_month', 'last_30_days'], true)) {
        $spendPeriod = 'lifetime';
    }
    $spendStartDate = null;
    if ($spendPeriod === 'this_month') {
        $spendStartDate = (new DateTimeImmutable('first day of this month'))->format('Y-m-d 00:00:00');
    } elseif ($spendPeriod === 'last_30_days') {
        $spendStartDate = (new DateTimeImmutable('-30 days'))->format('Y-m-d H:i:s');
    }
    $spendDateClause = '';
    $spendParams = ['id' => $userId];
    if ($spendStartDate !== null) {
        $spendDateClause = ' AND COALESCE(latest_payments.paid_at, bookings.created_at) >= :start_date';
        $spendParams['start_date'] = $spendStartDate;
    }

    $activeCount = $pdo->prepare(
        "SELECT COUNT(*) AS total FROM bookings WHERE customer_id = :id
         AND status IN ('pickup_assigned','picked_up','in_transit_to_origin_branch','received_at_origin_branch','linehaul_assigned','linehaul_load_confirmed','linehaul_in_transit','received_at_destination_branch','delivery_assigned','delivery_load_confirmed','out_for_delivery','delivery_attempt_failed','waiting_for_reattempt','rts_pending')"
    );
    $activeCount->execute(['id' => $userId]);
    $active = (int)($activeCount->fetch()['total'] ?? 0);

    $completedCount = $pdo->prepare("SELECT COUNT(*) AS total FROM bookings WHERE customer_id = :id AND status = 'delivered'");
    $completedCount->execute(['id' => $userId]);
    $completed = (int)($completedCount->fetch()['total'] ?? 0);

    $pendingCount = $pdo->prepare("SELECT COUNT(*) AS total FROM bookings WHERE customer_id = :id AND status IN ('created','pickup_assigned')");
    $pendingCount->execute(['id' => $userId]);
    $pending = (int)($pendingCount->fetch()['total'] ?? 0);

    $savingsStmt = $pdo->prepare(
        'SELECT COALESCE(SUM(payments.discount), 0) AS savings
         FROM payments
         JOIN bookings ON bookings.id = payments.booking_id
         WHERE bookings.customer_id = :id'
    );
    $savingsStmt->execute(['id' => $userId]);
    $savings = (float)($savingsStmt->fetch()['savings'] ?? 0);

    $totalSpendStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(latest_payments.total), 0) AS total_spend
         FROM bookings
         LEFT JOIN (
            SELECT p_latest.booking_id, p_latest.total, p_latest.status, p_latest.paid_at
            FROM payments AS p_latest
            JOIN (
                SELECT booking_id, MAX(id) AS latest_id
                FROM payments
                GROUP BY booking_id
            ) AS p_ids ON p_ids.latest_id = p_latest.id
         ) AS latest_payments ON latest_payments.booking_id = bookings.id
         WHERE bookings.customer_id = :id
           AND latest_payments.status = 'paid'" . $spendDateClause
    );
    $totalSpendStmt->execute($spendParams);
    $totalSpend = (float)($totalSpendStmt->fetch()['total_spend'] ?? 0);
    $spendBreakdownStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(CASE WHEN latest_payments.status = 'paid' THEN latest_payments.total ELSE 0 END), 0) AS paid_amount,
                COALESCE(SUM(CASE WHEN latest_payments.status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_orders
         FROM bookings
         LEFT JOIN (
            SELECT p_latest.booking_id, p_latest.total, p_latest.status, p_latest.paid_at
            FROM payments AS p_latest
            JOIN (
                SELECT booking_id, MAX(id) AS latest_id
                FROM payments
                GROUP BY booking_id
            ) AS p_ids ON p_ids.latest_id = p_latest.id
         ) AS latest_payments ON latest_payments.booking_id = bookings.id
         WHERE bookings.customer_id = :id" . $spendDateClause
    );
    $spendBreakdownStmt->execute($spendParams);
    $spendBreakdownRow = $spendBreakdownStmt->fetch() ?: [];
    $paidAmount = (float)($spendBreakdownRow['paid_amount'] ?? 0);
    $paidOrders = (int)($spendBreakdownRow['paid_orders'] ?? 0);

    $bookingsStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.booking_code, bookings.delivery_access_code, bookings.created_at, bookings.status,
                bookings.pickup_courier_id, bookings.delivery_courier_id,
                packages.category,
                pickup.line1 AS pickup_line, pickup.city AS pickup_city, pickup.province AS pickup_province, pickup.postal_code AS pickup_postal,
                delivery.line1 AS delivery_line, delivery.city AS delivery_city, delivery.province AS delivery_province, delivery.postal_code AS delivery_postal,
                payments.total AS amount,
                EXISTS(
                    SELECT 1 FROM ratings
                    WHERE ratings.booking_id = bookings.id
                      AND ratings.rater_id = :id
                      AND ratings.stage = "pickup"
                ) AS pickup_rated,
                EXISTS(
                    SELECT 1 FROM ratings
                    WHERE ratings.booking_id = bookings.id
                      AND ratings.rater_id = :id
                      AND ratings.stage = "delivery"
                ) AS delivery_rated,
                EXISTS(
                    SELECT 1 FROM proofs
                    WHERE proofs.booking_id = bookings.id
                ) AS has_delivery_proof,
                (SELECT f.id FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_id,
                (SELECT f.status FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_status,
                (SELECT f.error_type FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_error_type,
                (SELECT f.fine_amount FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_amount,
                (SELECT f.notes FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_notes
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN payments ON payments.booking_id = bookings.id
         WHERE bookings.customer_id = :id
         ORDER BY bookings.created_at DESC'
    );
    $bookingsStmt->execute(['id' => $userId]);
    $bookings = [];
    foreach ($bookingsStmt as $row) {
        $statusCode = normalize_booking_status_code((string)($row['status'] ?? ''));
        $fineStatus = strtolower(trim((string)($row['fine_status'] ?? '')));
        $isOnHold = $fineStatus === 'pending';
        $displayStatusCode = $isOnHold ? 'on_hold' : $statusCode;
        $statusLabel = $isOnHold ? 'On Hold' : ucwords(str_replace('_', ' ', $statusCode));
        $fineId = (int)($row['fine_id'] ?? 0);
        $bookings[] = [
            'bookingId' => (int)$row['id'],
            'trackingNumber' => $row['booking_code'],
            'deliveryAccessCode' => trim((string)($row['delivery_access_code'] ?? '')),
            'date' => $row['created_at'],
            'pickup' => sprintf('%s, %s, %s %s', $row['pickup_line'], $row['pickup_city'], $row['pickup_province'], $row['pickup_postal']),
            'delivery' => sprintf('%s, %s, %s %s', $row['delivery_line'], $row['delivery_city'], $row['delivery_province'], $row['delivery_postal']),
            'packageType' => $row['category'],
            'status' => $statusLabel,
            'statusCode' => $statusCode,
            'displayStatusCode' => $displayStatusCode,
            'isOnHold' => $isOnHold,
            'amount' => $row['amount'] ? (float)$row['amount'] : 0,
            'pickupCourierId' => $row['pickup_courier_id'] ? (int)$row['pickup_courier_id'] : null,
            'deliveryCourierId' => $row['delivery_courier_id'] ? (int)$row['delivery_courier_id'] : null,
            'pickupRated' => (int)($row['pickup_rated'] ?? 0) === 1,
            'deliveryRated' => (int)($row['delivery_rated'] ?? 0) === 1,
            'hasDeliveryProof' => (int)($row['has_delivery_proof'] ?? 0) === 1,
            'fine' => $fineId > 0 ? [
                'id' => $fineId,
                'status' => $fineStatus !== '' ? $fineStatus : 'pending',
                'errorType' => strtolower(trim((string)($row['fine_error_type'] ?? ''))),
                'errorLabel' => fine_error_type_label((string)($row['fine_error_type'] ?? 'fine')),
                'amount' => $row['fine_amount'] !== null ? (float)$row['fine_amount'] : 0.0,
                'notes' => trim((string)($row['fine_notes'] ?? '')) ?: null
            ] : null
        ];
    }

    $upcomingPickupStmt = $pdo->prepare(
        "SELECT bookings.id AS booking_id, bookings.booking_code, bookings.scheduled_date, bookings.scheduled_time, bookings.status,
                pickup.line1 AS pickup_line, pickup.city AS pickup_city, pickup.province AS pickup_province, pickup.postal_code AS pickup_postal,
                packages.category, couriers.full_name AS courier_name, courier_profiles.courier_role AS courier_role
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         LEFT JOIN users AS couriers ON couriers.id = bookings.courier_id
         LEFT JOIN courier_profiles ON courier_profiles.user_id = bookings.courier_id
         WHERE bookings.customer_id = :id AND bookings.status IN ('created','pickup_assigned')
         ORDER BY bookings.scheduled_date ASC
         LIMIT 5"
    );
    $upcomingPickupStmt->execute(['id' => $userId]);
    $upcomingPickups = [];
    foreach ($upcomingPickupStmt as $row) {
        $scheduled = $row['scheduled_date'] ? $row['scheduled_date'] . 'T' . ($row['scheduled_time'] ?? '00:00') : null;
        $courierRole = $row['courier_role'] ?? null;
        $pickupCourier = in_array($courierRole, ['pickup', 'both', 'linehaul'], true) ? ($row['courier_name'] ?? 'Unassigned') : 'Unassigned';
        $upcomingPickups[] = [
            'bookingId' => (int)$row['booking_id'],
            'trackingNumber' => $row['booking_code'],
            'courierName' => $pickupCourier,
            'scheduledTime' => $scheduled,
            'pickupAddress' => sprintf('%s, %s, %s %s', $row['pickup_line'], $row['pickup_city'], $row['pickup_province'], $row['pickup_postal']),
            'packageType' => $row['category'],
            'status' => $row['status']
        ];
    }

    $upcomingStmt = $pdo->prepare(
        "SELECT bookings.id AS booking_id, bookings.booking_code, bookings.scheduled_date, bookings.scheduled_time, bookings.status,
                delivery.line1 AS delivery_line, delivery.city AS delivery_city, delivery.province AS delivery_province, delivery.postal_code AS delivery_postal,
                packages.category, couriers.full_name AS courier_name, courier_profiles.courier_role AS courier_role
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN users AS couriers ON couriers.id = bookings.courier_id
         LEFT JOIN courier_profiles ON courier_profiles.user_id = bookings.courier_id
         WHERE bookings.customer_id = :id AND bookings.status IN ('linehaul_in_transit','received_at_destination_branch','delivery_assigned','delivery_load_confirmed','out_for_delivery','delivery_attempt_failed','waiting_for_reattempt')
         ORDER BY bookings.scheduled_date ASC
         LIMIT 5"
    );
    $upcomingStmt->execute(['id' => $userId]);
    $upcoming = [];
    foreach ($upcomingStmt as $row) {
        $scheduled = $row['scheduled_date'] ? $row['scheduled_date'] . 'T' . ($row['scheduled_time'] ?? '00:00') : null;
        $courierRole = $row['courier_role'] ?? null;
        $finalCourier = in_array($courierRole, ['delivery', 'both', 'express'], true) ? ($row['courier_name'] ?? 'Unassigned') : 'Unassigned';
        $upcoming[] = [
            'bookingId' => (int)$row['booking_id'],
            'trackingNumber' => $row['booking_code'],
            'courierName' => $finalCourier,
            'scheduledTime' => $scheduled,
            'deliveryAddress' => sprintf('%s, %s, %s %s', $row['delivery_line'], $row['delivery_city'], $row['delivery_province'], $row['delivery_postal']),
            'packageType' => $row['category'],
            'status' => $row['status']
        ];
    }

    $activityStmt = $pdo->prepare(
        'SELECT booking_status_events.description, booking_status_events.status, booking_status_events.occurred_at,
                bookings.booking_code
         FROM booking_status_events
         JOIN bookings ON bookings.id = booking_status_events.booking_id
         WHERE bookings.customer_id = :id
         ORDER BY booking_status_events.occurred_at DESC
         LIMIT 8'
    );
    $activityStmt->execute(['id' => $userId]);
    $activities = [];
    foreach ($activityStmt as $row) {
        $title = ucwords(str_replace('_', ' ', $row['status']));
        $activities[] = [
            'type' => 'delivery',
            'title' => $title,
            'description' => $row['description'] ?: ('Update for ' . $row['booking_code']),
            'timestamp' => $row['occurred_at']
        ];
    }

    json_response([
        'summary' => [
            'activeDeliveries' => $active,
            'completedOrders' => $completed,
            'totalSpend' => $totalSpend,
            'spendPeriod' => $spendPeriod,
            'totalSavings' => $savings,
            'pendingBookings' => $pending
        ],
        'spendBreakdown' => [
            'period' => $spendPeriod,
            'paidOrders' => $paidOrders,
            'paidAmount' => $paidAmount
        ],
        'bookings' => $bookings,
        'upcomingDeliveries' => $upcoming,
        'upcomingPickups' => $upcomingPickups,
        'recentActivities' => $activities
    ]);
}

if ($path === '/api/customer/invoices' && $method === 'GET') {
    $userId = (int)get_query_param('userId', 0);
    $statusFilter = strtolower(trim((string)get_query_param('status', 'all')));
    if ($userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }
    if (!user_has_role($pdo, $userId, 'customer')) {
        json_response(['error' => 'Access denied'], 403);
    }

    $allowedStatuses = ['all', 'pending', 'paid', 'failed', 'refunded'];
    if (!in_array($statusFilter, $allowedStatuses, true)) {
        $statusFilter = 'all';
    }

    $statusClause = '';
    $params = ['id' => $userId];
    if ($statusFilter !== 'all') {
        $statusClause = ' AND payments.status = :payment_status';
        $params['payment_status'] = $statusFilter;
    }

    $invoiceStmt = $pdo->prepare(
        'SELECT payments.id AS payment_id,
                bookings.id AS booking_id,
                bookings.booking_code,
                bookings.created_at AS booking_created_at,
                bookings.status AS booking_status,
                bookings.service_type,
                packages.category AS package_category,
                packages.declared_weight AS package_weight,
                pickup.line1 AS pickup_line, pickup.city AS pickup_city, pickup.province AS pickup_province, pickup.postal_code AS pickup_postal,
                delivery.line1 AS delivery_line, delivery.city AS delivery_city, delivery.province AS delivery_province, delivery.postal_code AS delivery_postal,
                payments.method AS payment_method,
                payments.provider AS payment_provider,
                payments.provider_reference AS payment_reference,
                payments.status AS payment_status,
                payments.base_rate,
                payments.distance_fee,
                payments.service_fee,
                payments.additional_fees,
                payments.subtotal,
                payments.tax,
                payments.discount,
                payments.total,
                payments.paid_at
         FROM payments
         JOIN bookings ON bookings.id = payments.booking_id
         LEFT JOIN packages ON packages.id = bookings.package_id
         LEFT JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         LEFT JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.customer_id = :id' . $statusClause . '
         ORDER BY COALESCE(payments.paid_at, bookings.created_at) DESC, payments.id DESC
         LIMIT 500'
    );
    $invoiceStmt->execute($params);

    $invoices = [];
    $summaryTotal = 0.0;
    $summaryPaid = 0.0;
    $summaryRefunded = 0.0;
    $summaryPaidCount = 0;
    foreach ($invoiceStmt as $row) {
        $paymentId = (int)($row['payment_id'] ?? 0);
        if ($paymentId <= 0) {
            continue;
        }
        $paymentStatus = strtolower(trim((string)($row['payment_status'] ?? 'pending')));
        $totalAmount = $row['total'] !== null ? (float)$row['total'] : 0.0;
        $issuedAt = $row['paid_at'] ?: $row['booking_created_at'];
        $invoiceNumber = 'INV-' . str_pad((string)$paymentId, 8, '0', STR_PAD_LEFT);

        if (in_array($paymentStatus, ['paid', 'refunded'], true)) {
            $summaryPaid += $totalAmount;
            $summaryPaidCount += 1;
        }
        if ($paymentStatus === 'refunded') {
            $summaryRefunded += $totalAmount;
        }
        $summaryTotal += $totalAmount;

        $invoices[] = [
            'paymentId' => $paymentId,
            'invoiceNumber' => $invoiceNumber,
            'bookingId' => (int)($row['booking_id'] ?? 0),
            'bookingCode' => trim((string)($row['booking_code'] ?? '')),
            'bookingStatus' => strtolower(trim((string)($row['booking_status'] ?? ''))),
            'issuedAt' => $issuedAt,
            'paidAt' => $row['paid_at'] ?? null,
            'paymentMethod' => strtolower(trim((string)($row['payment_method'] ?? ''))),
            'paymentProvider' => strtolower(trim((string)($row['payment_provider'] ?? ''))),
            'paymentReference' => trim((string)($row['payment_reference'] ?? '')) ?: null,
            'paymentStatus' => $paymentStatus !== '' ? $paymentStatus : 'pending',
            'serviceType' => trim((string)($row['service_type'] ?? '')) ?: null,
            'packageType' => trim((string)($row['package_category'] ?? '')) ?: null,
            'packageWeight' => trim((string)($row['package_weight'] ?? '')) ?: null,
            'pickupAddress' => sprintf(
                '%s, %s, %s %s',
                $row['pickup_line'] ?? '',
                $row['pickup_city'] ?? '',
                $row['pickup_province'] ?? '',
                $row['pickup_postal'] ?? ''
            ),
            'deliveryAddress' => sprintf(
                '%s, %s, %s %s',
                $row['delivery_line'] ?? '',
                $row['delivery_city'] ?? '',
                $row['delivery_province'] ?? '',
                $row['delivery_postal'] ?? ''
            ),
            'breakdown' => [
                'baseRate' => $row['base_rate'] !== null ? (float)$row['base_rate'] : 0.0,
                'distanceFee' => $row['distance_fee'] !== null ? (float)$row['distance_fee'] : 0.0,
                'serviceFee' => $row['service_fee'] !== null ? (float)$row['service_fee'] : 0.0,
                'additionalFees' => $row['additional_fees'] !== null ? (float)$row['additional_fees'] : 0.0,
                'subtotal' => $row['subtotal'] !== null ? (float)$row['subtotal'] : 0.0,
                'tax' => $row['tax'] !== null ? (float)$row['tax'] : 0.0,
                'discount' => $row['discount'] !== null ? (float)$row['discount'] : 0.0,
                'total' => $totalAmount
            ]
        ];
    }

    json_response([
        'summary' => [
            'totalInvoices' => count($invoices),
            'totalAmount' => $summaryTotal,
            'paidInvoices' => $summaryPaidCount,
            'paidAmount' => $summaryPaid,
            'refundedAmount' => $summaryRefunded
        ],
        'invoices' => $invoices
    ]);
}

if ($path === '/api/tracking' && $method === 'GET') {
    $trackingId = trim((string)get_query_param('trackingId', ''));
    $userId = (int)get_query_param('userId', 0);
    $role = strtolower(trim((string)get_query_param('role', 'customer')));
    $deliveryAccessCode = trim((string)get_query_param('accessCode', ''));

    if ($trackingId === '') {
        json_response(['error' => 'trackingId is required'], 422);
    }

    if (in_array($role, ['courier', 'admin'], true) && $userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }

    $stmt = $pdo->prepare(
        'SELECT bookings.id, bookings.booking_code, bookings.delivery_access_code, bookings.status, bookings.distance_km, bookings.eta_minutes,
                bookings.requires_linehaul, bookings.is_intercity,
                bookings.customer_id, bookings.courier_id, bookings.pickup_courier_id, bookings.linehaul_courier_id, bookings.delivery_courier_id,
                pickup.line1 AS pickup_line, pickup.city AS pickup_city, pickup.province AS pickup_province, pickup.postal_code AS pickup_postal,
                pickup.lat AS pickup_lat, pickup.lng AS pickup_lng,
                delivery.line1 AS delivery_line, delivery.city AS delivery_city, delivery.province AS delivery_province, delivery.postal_code AS delivery_postal,
                delivery.lat AS delivery_lat, delivery.lng AS delivery_lng, delivery.contact_name AS delivery_contact_name, delivery.contact_phone AS delivery_contact_phone,
                origin_branch.name AS origin_branch_name, origin_branch.address_line AS origin_branch_line,
                origin_branch.city AS origin_branch_city, origin_branch.province AS origin_branch_province, origin_branch.postal_code AS origin_branch_postal,
                origin_branch.lat AS origin_branch_lat, origin_branch.lng AS origin_branch_lng,
                destination_branch.name AS destination_branch_name, destination_branch.address_line AS destination_branch_line,
                destination_branch.city AS destination_branch_city, destination_branch.province AS destination_branch_province, destination_branch.postal_code AS destination_branch_postal,
                destination_branch.lat AS destination_branch_lat, destination_branch.lng AS destination_branch_lng,
                packages.category, packages.declared_weight, packages.length_cm, packages.width_cm, packages.height_cm, packages.special_instructions,
                payments.total AS total,
                couriers.full_name AS courier_name, couriers.phone AS courier_phone,
                courier_profiles.rating, courier_profiles.total_deliveries, courier_profiles.completed_deliveries, courier_profiles.experience_years
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN branches AS origin_branch ON origin_branch.id = bookings.origin_branch_id
         LEFT JOIN branches AS destination_branch ON destination_branch.id = bookings.destination_branch_id
         LEFT JOIN payments ON payments.booking_id = bookings.id
         LEFT JOIN users AS couriers ON couriers.id = bookings.courier_id
         LEFT JOIN courier_profiles ON courier_profiles.user_id = bookings.courier_id
         WHERE bookings.booking_code = :code
         LIMIT 1'
    );
    $stmt->execute(['code' => $trackingId]);
    $booking = $stmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    if ($role === 'courier' && (int)$booking['courier_id'] !== $userId) {
        json_response(['error' => 'Access denied'], 403);
    }
    if ($role === 'admin' && !user_has_role($pdo, $userId, 'admin')) {
        json_response(['error' => 'Access denied'], 403);
    }

    $hasSecureAccess = false;
    $secureAccessError = '';
    $normalizedProvidedAccessCode = normalize_delivery_access_code($deliveryAccessCode);
    $ownsBookingAsCustomer = $role === 'customer'
        && $userId > 0
        && (int)$booking['customer_id'] === $userId;

    if ($role === 'admin') {
        $hasSecureAccess = true;
    } elseif ($role === 'courier') {
        $hasSecureAccess = true;
    } elseif ($ownsBookingAsCustomer) {
        $hasSecureAccess = true;
    } elseif ($normalizedProvidedAccessCode !== '') {
        if (booking_delivery_access_code_matches($booking, $normalizedProvidedAccessCode)) {
            $hasSecureAccess = true;
        } else {
            $secureAccessError = 'Invalid delivery access code.';
        }
    }

    $latestFineRow = latest_booking_fine($pdo, (int)$booking['id']);
    $finePayload = null;
    $isOnHold = false;
    if ($hasSecureAccess && is_array($latestFineRow)) {
        $fineStatus = strtolower(trim((string)($latestFineRow['status'] ?? '')));
        $isOnHold = $fineStatus === 'pending';
        $finePayload = [
            'id' => (int)($latestFineRow['id'] ?? 0),
            'status' => $fineStatus !== '' ? $fineStatus : 'pending',
            'errorType' => strtolower(trim((string)($latestFineRow['error_type'] ?? ''))),
            'errorLabel' => fine_error_type_label((string)($latestFineRow['error_type'] ?? 'fine')),
            'immediateResult' => trim((string)($latestFineRow['immediate_result'] ?? '')) ?: null,
            'financialResult' => trim((string)($latestFineRow['financial_result'] ?? '')) ?: null,
            'amount' => $latestFineRow['fine_amount'] !== null ? (float)$latestFineRow['fine_amount'] : 0.0,
            'notes' => trim((string)($latestFineRow['notes'] ?? '')) ?: null,
            'issuedAt' => $latestFineRow['issued_at'] ?? null
        ];
    }
    $eventsStmt = $pdo->prepare(
        'SELECT id, status, description, location_text, lat, lng, occurred_at
         FROM booking_status_events
         WHERE booking_id = :id
         ORDER BY occurred_at ASC'
    );
    $eventsStmt->execute(['id' => (int)$booking['id']]);
    $events = $eventsStmt->fetchAll();

    $eventMap = [];
    foreach ($events as $event) {
        if (!isset($eventMap[$event['status']])) {
            $eventMap[$event['status']] = $event;
        }
    }
    $latestEvent = count($events) > 0 ? $events[count($events) - 1] : null;

    $steps = [
        'created' => ['title' => 'Order Placed', 'description' => 'Booking created'],
        'pickup_assigned' => ['title' => 'Pickup Assigned', 'description' => 'Pickup courier assigned'],
        'picked_up' => ['title' => 'Package Picked Up', 'description' => 'Courier has collected your package'],
        'in_transit_to_origin_branch' => ['title' => 'To Origin Branch', 'description' => 'Package is on the way to origin branch'],
        'received_at_origin_branch' => ['title' => 'At Origin Branch', 'description' => 'Package arrived at origin branch'],
        'linehaul_assigned' => ['title' => 'Linehaul Assigned', 'description' => 'Linehaul courier assigned'],
        'linehaul_load_confirmed' => ['title' => 'Linehaul Load Confirmed', 'description' => 'Linehaul courier confirmed branch handover'],
        'linehaul_in_transit' => ['title' => 'Linehaul In Transit', 'description' => 'Package is moving between branches'],
        'received_at_destination_branch' => ['title' => 'At Destination Branch', 'description' => 'Package arrived at destination branch'],
        'delivery_assigned' => ['title' => 'Delivery Assigned', 'description' => 'Delivery courier assigned'],
        'delivery_load_confirmed' => ['title' => 'Delivery Load Confirmed', 'description' => 'Delivery courier confirmed package loading'],
        'out_for_delivery' => ['title' => 'Out for Delivery', 'description' => 'Package will be delivered soon'],
        'delivery_attempt_failed' => ['title' => 'Delivery Attempt Failed', 'description' => 'Courier could not complete delivery'],
        'waiting_for_reattempt' => ['title' => 'Waiting for Reattempt', 'description' => 'Parcel returned to hub and is waiting for re-delivery assignment'],
        'rts_pending' => ['title' => 'Return to Sender in Progress', 'description' => 'Shipment is being prepared for return to sender'],
        'returned_to_sender' => ['title' => 'Returned to Sender', 'description' => 'Shipment has been returned to sender'],
        'delivered' => ['title' => 'Delivered', 'description' => 'Package successfully delivered']
    ];

    $linehaulStatuses = [
        'linehaul_assigned',
        'linehaul_load_confirmed',
        'linehaul_in_transit',
        'received_at_destination_branch'
    ];
    $linehaulEventSeen = false;
    foreach ($linehaulStatuses as $statusKey) {
        if (isset($eventMap[$statusKey])) {
            $linehaulEventSeen = true;
            break;
        }
    }
    $isIntercity = booking_is_intercity($booking);
    if (!$isIntercity && !$linehaulEventSeen) {
        unset(
            $steps['linehaul_assigned'],
            $steps['linehaul_load_confirmed'],
            $steps['linehaul_in_transit'],
            $steps['received_at_destination_branch']
        );
    }

    $currentStatus = normalize_booking_status_code((string)($booking['status'] ?? ''));
    $reattemptStatuses = ['delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender'];
    $reattemptEventSeen = in_array($currentStatus, $reattemptStatuses, true);
    if (!$reattemptEventSeen) {
        foreach ($reattemptStatuses as $statusKey) {
            if (isset($eventMap[$statusKey])) {
                $reattemptEventSeen = true;
                break;
            }
        }
    }
    if (!$reattemptEventSeen) {
        unset(
            $steps['delivery_attempt_failed'],
            $steps['waiting_for_reattempt'],
            $steps['rts_pending'],
            $steps['returned_to_sender']
        );
    }
    $rtsStatuses = ['rts_pending', 'returned_to_sender'];
    $rtsDecisionSeen = in_array($currentStatus, $rtsStatuses, true);
    if (!$rtsDecisionSeen) {
        foreach ($rtsStatuses as $statusKey) {
            if (isset($eventMap[$statusKey])) {
                $rtsDecisionSeen = true;
                break;
            }
        }
    }
    if (!$rtsDecisionSeen) {
        unset(
            $steps['rts_pending'],
            $steps['returned_to_sender']
        );
    }

    if ($currentStatus === 'cancelled') {
        $steps['cancelled'] = ['title' => 'Cancelled', 'description' => 'Booking cancelled'];
    }

    $statusKeys = array_keys($steps);
    $currentIndex = array_search($currentStatus, $statusKeys, true);
    if ($currentIndex === false) {
        $currentIndex = 0;
        $currentStatus = $statusKeys[0];
    }
    $displayStatus = $isOnHold ? 'on_hold' : $currentStatus;

    $timeline = [];
    foreach ($statusKeys as $index => $key) {
        $event = $eventMap[$key] ?? null;
        $itemStatus = 'pending';
        if ($currentStatus === 'delivered') {
            $itemStatus = 'completed';
        } elseif ($index < $currentIndex) {
            $itemStatus = 'completed';
        } elseif ($index === $currentIndex) {
            $itemStatus = 'active';
        }
        $timeline[] = [
            'id' => $index + 1,
            'title' => $steps[$key]['title'],
            'description' => $event['description'] ?? $steps[$key]['description'],
            'location' => $event['location_text'] ?? null,
            'timestamp' => $event['occurred_at'] ?? null,
            'status' => $itemStatus
        ];
    }

    $pickupAddress = sprintf('%s, %s, %s %s', $booking['pickup_line'], $booking['pickup_city'], $booking['pickup_province'], $booking['pickup_postal']);
    $deliveryAddress = sprintf('%s, %s, %s %s', $booking['delivery_line'], $booking['delivery_city'], $booking['delivery_province'], $booking['delivery_postal']);
    $formatBranchAddress = function ($nameKey, $lineKey, $cityKey, $provinceKey, $postalKey) use ($booking) {
        $name = trim((string)($booking[$nameKey] ?? ''));
        $line = trim((string)($booking[$lineKey] ?? ''));
        $city = trim((string)($booking[$cityKey] ?? ''));
        $province = trim((string)($booking[$provinceKey] ?? ''));
        $postal = trim((string)($booking[$postalKey] ?? ''));
        $tail = trim($city . ', ' . $province . ' ' . $postal, ' ,');
        if ($line === '' && $name === '' && $tail === '') {
            return null;
        }
        if ($line === '') {
            return trim($name . ', ' . $tail, ' ,');
        }
        return trim(($name !== '' ? ($name . ', ') : '') . $line . ($tail !== '' ? (', ' . $tail) : ''), ' ,');
    };
    $toPoint = function ($lat, $lng) {
        if (!has_valid_coords($lat, $lng)) {
            return null;
        }
        return [
            'lat' => (float)$lat,
            'lng' => (float)$lng
        ];
    };
    $pickupPoint = $toPoint($booking['pickup_lat'], $booking['pickup_lng']);
    $deliveryPoint = $toPoint($booking['delivery_lat'], $booking['delivery_lng']);
    $originBranchPoint = $toPoint($booking['origin_branch_lat'], $booking['origin_branch_lng']);
    $destinationBranchPoint = $toPoint($booking['destination_branch_lat'], $booking['destination_branch_lng']);
    $originBranchAddress = $formatBranchAddress(
        'origin_branch_name',
        'origin_branch_line',
        'origin_branch_city',
        'origin_branch_province',
        'origin_branch_postal'
    );
    $destinationBranchAddress = $formatBranchAddress(
        'destination_branch_name',
        'destination_branch_line',
        'destination_branch_city',
        'destination_branch_province',
        'destination_branch_postal'
    );
    $isIntercityBooking = to_bool($booking['is_intercity'] ?? false) || to_bool($booking['requires_linehaul'] ?? false);
    $deliveryDispatchBranchPoint = $isIntercityBooking
        ? ($destinationBranchPoint ?: $originBranchPoint)
        : ($originBranchPoint ?: $destinationBranchPoint);
    $deliveryDispatchBranchAddress = $isIntercityBooking
        ? ($destinationBranchAddress ?: $originBranchAddress)
        : ($originBranchAddress ?: $destinationBranchAddress);

    $activeCourierId = 0;
    if (in_array($currentStatus, ['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch', 'received_at_origin_branch'], true)) {
        $activeCourierId = (int)($booking['pickup_courier_id'] ?: $booking['courier_id']);
    } elseif (in_array($currentStatus, ['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit', 'received_at_destination_branch'], true)) {
        $activeCourierId = (int)($booking['linehaul_courier_id'] ?: $booking['courier_id']);
    } elseif (in_array($currentStatus, ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender', 'delivered'], true)) {
        $activeCourierId = (int)($booking['delivery_courier_id'] ?: $booking['courier_id']);
    } else {
        $activeCourierId = (int)$booking['courier_id'];
    }
    if (in_array($currentStatus, ['waiting_for_reattempt', 'rts_pending', 'returned_to_sender'], true)) {
        $activeCourierId = 0;
    }

    $activeCourier = null;
    $activeCourierVehicle = null;
    $activeCourierStats = null;
    if ($activeCourierId > 0) {
        $courierStmt = $pdo->prepare(
            'SELECT users.full_name, users.phone,
                    courier_profiles.rating, courier_profiles.total_deliveries,
                    courier_profiles.completed_deliveries, courier_profiles.experience_years
             FROM users
             LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
             WHERE users.id = :id
             LIMIT 1'
        );
        $courierStmt->execute(['id' => $activeCourierId]);
        $activeCourier = $courierStmt->fetch();
        $activeCourierVehicle = courier_vehicle_details($pdo, $activeCourierId);

        // Compute live stats from bookings so the tracking card doesn't depend on stale profile counters.
        $statsStmt = $pdo->prepare(
            "SELECT COUNT(DISTINCT bookings.id) AS total_count,
                    COUNT(DISTINCT CASE
                        WHEN bookings.status IN ('received_at_origin_branch', 'received_at_destination_branch', 'delivered')
                        THEN bookings.id
                    END) AS completed_count
             FROM bookings
             WHERE bookings.pickup_courier_id = :id
                OR bookings.linehaul_courier_id = :id
                OR bookings.delivery_courier_id = :id
                OR bookings.courier_id = :id"
        );
        $statsStmt->execute(['id' => $activeCourierId]);
        $activeCourierStats = $statsStmt->fetch();
    }

    $liveCourierLocation = null;
    if ($activeCourierId > 0) {
        $liveStmt = $pdo->prepare(
            'SELECT latitude, longitude, updated_at
             FROM courier_live_location
             WHERE courier_id = :id
             LIMIT 1'
        );
        $liveStmt->execute(['id' => $activeCourierId]);
        $liveRow = $liveStmt->fetch();
        if ($liveRow && has_valid_coords($liveRow['latitude'], $liveRow['longitude'])) {
            $liveCourierLocation = [
                'lat' => (float)$liveRow['latitude'],
                'lng' => (float)$liveRow['longitude'],
                'updatedAt' => $liveRow['updated_at']
            ];
        }
    }

    $movingVehicleStatuses = ['pickup_assigned', 'picked_up', 'out_for_delivery', 'delivery_attempt_failed'];
    $isLiveTrackingEnabled = in_array($currentStatus, $movingVehicleStatuses, true);

    $targetLocation = null;
    $targetAddress = null;
    $targetType = null;
    if ($currentStatus === 'pickup_assigned') {
        $targetLocation = $pickupPoint;
        $targetAddress = $pickupAddress;
        $targetType = 'pickup';
    } elseif (in_array($currentStatus, ['picked_up', 'in_transit_to_origin_branch'], true)) {
        $targetLocation = $originBranchPoint ?: $pickupPoint;
        $targetAddress = $originBranchAddress ?: $pickupAddress;
        $targetType = 'origin_branch';
    } elseif (in_array($currentStatus, ['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit'], true)) {
        $targetLocation = $destinationBranchPoint ?: $deliveryPoint;
        $targetAddress = $destinationBranchAddress ?: $deliveryAddress;
        $targetType = 'destination_branch';
    } elseif (in_array($currentStatus, ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery'], true)) {
        $targetLocation = $deliveryPoint;
        $targetAddress = $deliveryAddress;
        $targetType = 'delivery';
    } elseif ($currentStatus === 'delivery_attempt_failed') {
        $targetLocation = $deliveryDispatchBranchPoint ?: $deliveryPoint;
        $targetAddress = $deliveryDispatchBranchAddress ?: $deliveryAddress;
        $targetType = 'dispatch_branch';
    } elseif ($currentStatus === 'waiting_for_reattempt') {
        $targetLocation = $deliveryDispatchBranchPoint ?: $deliveryPoint;
        $targetAddress = $deliveryDispatchBranchAddress ?: $deliveryAddress;
        $targetType = 'dispatch_branch';
    } elseif (in_array($currentStatus, ['rts_pending', 'returned_to_sender'], true)) {
        $targetLocation = $originBranchPoint ?: $pickupPoint;
        $targetAddress = $originBranchAddress ?: $pickupAddress;
        $targetType = 'origin_branch';
    }

    $currentLat = $latestEvent['lat'] ?? null;
    $currentLng = $latestEvent['lng'] ?? null;
    $parcelPoint = null;
    if ($currentStatus === 'created' || $currentStatus === 'pickup_assigned') {
        $parcelPoint = $pickupPoint;
    } elseif (in_array($currentStatus, ['picked_up', 'in_transit_to_origin_branch', 'linehaul_in_transit', 'out_for_delivery'], true)) {
        if ($liveCourierLocation) {
            $parcelPoint = [
                'lat' => $liveCourierLocation['lat'],
                'lng' => $liveCourierLocation['lng']
            ];
        }
    } elseif (in_array($currentStatus, ['received_at_origin_branch', 'linehaul_assigned', 'linehaul_load_confirmed'], true)) {
        $parcelPoint = $originBranchPoint ?: $pickupPoint;
    } elseif (in_array($currentStatus, ['received_at_destination_branch', 'delivery_assigned', 'delivery_load_confirmed', 'waiting_for_reattempt'], true)) {
        $parcelPoint = $deliveryDispatchBranchPoint ?: $deliveryPoint;
    } elseif ($currentStatus === 'delivery_attempt_failed') {
        if ($liveCourierLocation) {
            $parcelPoint = [
                'lat' => $liveCourierLocation['lat'],
                'lng' => $liveCourierLocation['lng']
            ];
        } else {
            $parcelPoint = $deliveryDispatchBranchPoint ?: $deliveryPoint;
        }
    } elseif (in_array($currentStatus, ['rts_pending', 'returned_to_sender'], true)) {
        $parcelPoint = $originBranchPoint ?: $pickupPoint;
    } elseif ($currentStatus === 'delivered') {
        $parcelPoint = $deliveryPoint;
    }

    if ($parcelPoint === null && $currentLat !== null && $currentLng !== null) {
        $parcelPoint = $toPoint($currentLat, $currentLng);
    }
    if ($parcelPoint === null) {
        if (in_array($currentStatus, ['created', 'pickup_assigned', 'picked_up', 'in_transit_to_origin_branch', 'received_at_origin_branch', 'linehaul_assigned', 'linehaul_load_confirmed'], true)) {
            $parcelPoint = $pickupPoint;
        } else {
            $parcelPoint = $deliveryPoint;
        }
    }
    if ($parcelPoint) {
        $currentLat = $parcelPoint['lat'];
        $currentLng = $parcelPoint['lng'];
    }

    $currentAddress = $latestEvent['location_text'] ?? null;
    if (!$currentAddress) {
        if (in_array($currentStatus, ['created', 'pickup_assigned'], true)) {
            $currentAddress = $pickupAddress;
        } elseif (in_array($currentStatus, ['picked_up', 'in_transit_to_origin_branch', 'received_at_origin_branch', 'linehaul_assigned', 'linehaul_load_confirmed'], true)) {
            $currentAddress = $originBranchAddress ?: $pickupAddress;
        } elseif ($currentStatus === 'delivery_attempt_failed') {
            $currentAddress = $deliveryDispatchBranchAddress ?: $deliveryAddress;
        } elseif (in_array($currentStatus, ['linehaul_in_transit', 'received_at_destination_branch', 'delivery_assigned', 'delivery_load_confirmed', 'waiting_for_reattempt'], true)) {
            $currentAddress = $deliveryDispatchBranchAddress ?: $deliveryAddress;
        } elseif (in_array($currentStatus, ['rts_pending', 'returned_to_sender'], true)) {
            $currentAddress = $originBranchAddress ?: $pickupAddress;
        } else {
            $currentAddress = $deliveryAddress;
        }
    }

    $notificationStage = null;
    if ($currentStatus === 'pickup_assigned') {
        $notificationStage = 'pickup';
    } elseif (in_array($currentStatus, ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery'], true)) {
        $notificationStage = 'delivery';
    }
    $distanceToTargetMeters = null;
    if ($liveCourierLocation && $targetLocation) {
        $distanceToTargetMeters = (float)round(calculate_distance_km(
            $liveCourierLocation['lat'],
            $liveCourierLocation['lng'],
            $targetLocation['lat'],
            $targetLocation['lng']
        ) * 1000);
    }

    $weightValue = trim((string)($booking['declared_weight'] ?? ''));
    $weight = $weightValue !== '' && stripos($weightValue, 'kg') === false
        ? $weightValue . ' kg'
        : ($weightValue !== '' ? $weightValue : 'N/A');

    $length = $booking['length_cm'];
    $width = $booking['width_cm'];
    $height = $booking['height_cm'];
    $dimensions = 'N/A';
    if ($length !== null && $width !== null && $height !== null) {
        $dimensions = sprintf('%s x %s x %s cm', $length, $width, $height);
    }

    $proofStmt = $pdo->prepare(
        'SELECT photo_url, signature_url, notes, created_at
         FROM proofs
         WHERE booking_id = :id
         ORDER BY created_at DESC
         LIMIT 1'
    );
    $proofStmt->execute(['id' => (int)$booking['id']]);
    $proofRow = $proofStmt->fetch();
    $deliveryProof = null;
    if ($proofRow) {
        $deliveryProof = [
            'completedAt' => $proofRow['created_at'],
            'photo' => $proofRow['photo_url'] ? ['url' => $proofRow['photo_url'], 'alt' => 'Delivery photo'] : null,
            'signature' => $proofRow['signature_url'] ? ['url' => $proofRow['signature_url'], 'alt' => 'Recipient signature', 'signedBy' => $booking['delivery_contact_name'] ?: 'Recipient'] : null,
            'notes' => $proofRow['notes']
        ];
    }

    $distanceKm = $booking['distance_km'] !== null ? (float)$booking['distance_km'] : null;
    $etaMinutes = $booking['eta_minutes'] !== null ? (int)$booking['eta_minutes'] : null;
    if ($distanceKm === null && has_valid_coords($booking['pickup_lat'], $booking['pickup_lng'])
        && has_valid_coords($booking['delivery_lat'], $booking['delivery_lng'])) {
        $distanceKm = calculate_distance_km(
            $booking['pickup_lat'],
            $booking['pickup_lng'],
            $booking['delivery_lat'],
            $booking['delivery_lng']
        );
    }
    if ($etaMinutes === null && $distanceKm !== null) {
        $avgSpeedKmph = 25;
        $etaMinutes = (int)max(1, round(($distanceKm / $avgSpeedKmph) * 60));
    }

    $courierName = trim((string)($activeCourier['full_name'] ?? $booking['courier_name'] ?? ''));
    if ($courierName === '') {
        $courierName = 'Unassigned';
    }
    $courierPhone = trim((string)($activeCourier['phone'] ?? $booking['courier_phone'] ?? ''));

    $courierRating = $activeCourier['rating'] ?? $booking['rating'] ?? null;
    $courierTotalDeliveries = $activeCourierStats && $activeCourierStats['total_count'] !== null
        ? (int)$activeCourierStats['total_count']
        : ($activeCourier['total_deliveries'] ?? $booking['total_deliveries'] ?? null);
    $courierCompletedDeliveries = $activeCourierStats && $activeCourierStats['completed_count'] !== null
        ? (int)$activeCourierStats['completed_count']
        : ($activeCourier['completed_deliveries'] ?? $booking['completed_deliveries'] ?? null);
    $courierExperienceYears = $activeCourier['experience_years'] ?? $booking['experience_years'] ?? null;

    $courierVehicleType = trim((string)($activeCourierVehicle['type'] ?? ''));
    if ($courierVehicleType === '') {
        $courierVehicleType = 'Assigned Vehicle';
    }
    $courierVehicleNumber = trim((string)($activeCourierVehicle['plate'] ?? ''));
    if ($courierVehicleNumber === '') {
        $courierVehicleNumber = trim((string)($activeCourierVehicle['code'] ?? ''));
    }
    if ($courierVehicleNumber === '') {
        $courierVehicleNumber = 'N/A';
    }

    json_response([
        'bookingId' => (int)$booking['id'],
        'bookingCode' => $booking['booking_code'],
        'status' => $currentStatus,
        'displayStatus' => $displayStatus,
        'isOnHold' => $isOnHold,
        'holdReason' => $isOnHold ? 'Pending fine payment' : null,
        'secureAccessRequired' => true,
        'secureAccessGranted' => $hasSecureAccess,
        'secureAccessError' => $secureAccessError !== '' ? $secureAccessError : null,
        'secureAccessMessage' => $hasSecureAccess
            ? 'Live map and chat unlocked.'
            : 'Enter delivery access code to unlock live map tracking and chat.',
        'fine' => $finePayload,
        'isLiveTrackingEnabled' => $hasSecureAccess ? $isLiveTrackingEnabled : false,
        'currentLocation' => [
            'lat' => $hasSecureAccess && $currentLat !== null ? (float)$currentLat : null,
            'lng' => $hasSecureAccess && $currentLng !== null ? (float)$currentLng : null
        ],
        'parcelLocation' => [
            'lat' => $hasSecureAccess && $currentLat !== null ? (float)$currentLat : null,
            'lng' => $hasSecureAccess && $currentLng !== null ? (float)$currentLng : null
        ],
        'courierLocation' => $hasSecureAccess && $liveCourierLocation ? [
            'lat' => $liveCourierLocation['lat'],
            'lng' => $liveCourierLocation['lng'],
            'updatedAt' => $liveCourierLocation['updatedAt']
        ] : null,
        'activeCourierId' => $activeCourierId > 0 ? $activeCourierId : null,
        'pickupLocation' => [
            'lat' => has_valid_coords($booking['pickup_lat'], $booking['pickup_lng']) ? (float)$booking['pickup_lat'] : null,
            'lng' => has_valid_coords($booking['pickup_lat'], $booking['pickup_lng']) ? (float)$booking['pickup_lng'] : null
        ],
        'deliveryLocation' => [
            'lat' => has_valid_coords($booking['delivery_lat'], $booking['delivery_lng']) ? (float)$booking['delivery_lat'] : null,
            'lng' => has_valid_coords($booking['delivery_lat'], $booking['delivery_lng']) ? (float)$booking['delivery_lng'] : null
        ],
        'originBranchLocation' => $originBranchPoint,
        'destinationBranchLocation' => $destinationBranchPoint,
        'targetLocation' => $hasSecureAccess ? $targetLocation : null,
        'targetAddress' => $targetAddress,
        'targetType' => $targetType,
        'notificationStage' => $notificationStage,
        'distanceToTargetMeters' => $hasSecureAccess ? $distanceToTargetMeters : null,
        'currentAddress' => $currentAddress,
        'estimatedTime' => $etaMinutes !== null ? $etaMinutes . ' mins' : 'N/A',
        'distance' => $distanceKm !== null ? number_format($distanceKm, 1) . ' km' : 'N/A',
        'pickupAddress' => $pickupAddress,
        'deliveryAddress' => $deliveryAddress,
        'timeline' => $timeline,
        'packageInfo' => [
            'bookingId' => $booking['booking_code'],
            'type' => $booking['category'] ?: 'Package',
            'weight' => $weight,
            'dimensions' => $dimensions,
            'fee' => $booking['total'] ? ('RS ' . number_format((float)$booking['total'], 2)) : 'RS 0.00',
            'recipient' => [
                'name' => $booking['delivery_contact_name'] ?: 'Recipient',
                'phone' => $booking['delivery_contact_phone'] ?: '',
                'address' => $deliveryAddress
            ],
            'specialInstructions' => $booking['special_instructions'] ?: '',
            'images' => []
        ],
        'courier' => [
            'name' => $courierName,
            'avatar' => '',
            'avatarAlt' => $courierName !== 'Unassigned' ? ('Profile photo of ' . $courierName) : 'Courier profile photo',
            'rating' => $courierRating !== null ? (string)$courierRating : '0.0',
            'totalDeliveries' => $courierTotalDeliveries !== null ? (string)$courierTotalDeliveries : '0',
            'completedDeliveries' => $courierCompletedDeliveries !== null ? (string)$courierCompletedDeliveries : '0',
            'experience' => $courierExperienceYears !== null ? ($courierExperienceYears . ' years') : '0 years',
            'vehicleType' => $courierVehicleType,
            'vehicleNumber' => $courierVehicleNumber,
            'phone' => $courierPhone
        ],
        'deliveryProof' => $deliveryProof
    ]);
}

if ($path === '/api/support/tickets' && $method === 'POST') {
    if (!support_tables_ready($pdo)) {
        json_response(['error' => 'Support ticket service is unavailable right now.'], 500);
    }

    $payload = get_json_body();
    $userId = (int)($payload['userId'] ?? 0);
    $role = strtolower(trim((string)($payload['role'] ?? '')));
    $subject = trim((string)($payload['subject'] ?? ''));
    $description = trim((string)($payload['description'] ?? ''));
    $category = normalize_support_ticket_category($payload['category'] ?? 'other');
    $bookingId = (int)($payload['bookingId'] ?? 0);
    $bookingCode = trim((string)($payload['bookingCode'] ?? ''));
    $imageDataUrl = trim((string)($payload['imageDataUrl'] ?? ''));

    if ($userId <= 0 || $role !== 'customer') {
        json_response(['error' => 'Only signed-in customers can create support tickets.'], 422);
    }
    if ($subject === '') {
        json_response(['error' => 'subject is required'], 422);
    }
    if ($description === '') {
        json_response(['error' => 'description is required'], 422);
    }

    if (!user_has_role($pdo, $userId, 'customer')) {
        json_response(['error' => 'Access denied'], 403);
    }

    if ($bookingId > 0) {
        $bookingStmt = $pdo->prepare(
            'SELECT id, booking_code, customer_id
             FROM bookings
             WHERE id = :id
             LIMIT 1'
        );
        $bookingStmt->execute(['id' => $bookingId]);
        $booking = $bookingStmt->fetch();
        if (!$booking) {
            json_response(['error' => 'Booking not found'], 404);
        }
        if ((int)$booking['customer_id'] !== $userId) {
            json_response(['error' => 'Booking does not belong to this customer.'], 403);
        }
        $bookingCode = trim((string)($booking['booking_code'] ?? ''));
    } elseif ($bookingCode !== '') {
        $bookingByCodeStmt = $pdo->prepare(
            'SELECT id, booking_code, customer_id
             FROM bookings
             WHERE booking_code = :code
             LIMIT 1'
        );
        $bookingByCodeStmt->execute(['code' => $bookingCode]);
        $bookingByCode = $bookingByCodeStmt->fetch();
        if ($bookingByCode) {
            if ((int)$bookingByCode['customer_id'] !== $userId) {
                json_response(['error' => 'Booking does not belong to this customer.'], 403);
            }
            $bookingId = (int)$bookingByCode['id'];
            $bookingCode = trim((string)($bookingByCode['booking_code'] ?? $bookingCode));
        }
    }

    $insertTicket = $pdo->prepare(
        'INSERT INTO support_tickets (
            booking_id, booking_code, customer_id, category, subject, description, image_url, status,
            last_message_at, last_message_preview
         )
         VALUES (
            :booking_id, :booking_code, :customer_id, :category, :subject, :description, :image_url, :status,
            NOW(), :last_message_preview
         )'
    );
    $insertTicket->execute([
        'booking_id' => $bookingId > 0 ? $bookingId : null,
        'booking_code' => $bookingCode !== '' ? $bookingCode : null,
        'customer_id' => $userId,
        'category' => $category,
        'subject' => $subject,
        'description' => $description,
        'image_url' => null,
        'status' => 'open',
        'last_message_preview' => substr($description, 0, 240)
    ]);
    $ticketId = (int)$pdo->lastInsertId();

    $imageUrl = null;
    if ($imageDataUrl !== '') {
        $imageUrl = save_support_image_from_data_url($imageDataUrl, $ticketId, 'ticket');
        if ($imageUrl) {
            $pdo->prepare('UPDATE support_tickets SET image_url = :image_url WHERE id = :id')
                ->execute([
                    'image_url' => $imageUrl,
                    'id' => $ticketId
                ]);
        }
    }

    $insertMessage = $pdo->prepare(
        'INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, message)
         VALUES (:ticket_id, :sender_id, :sender_role, :message)'
    );
    $insertMessage->execute([
        'ticket_id' => $ticketId,
        'sender_id' => $userId,
        'sender_role' => 'customer',
        'message' => $description
    ]);

    json_response([
        'ticket' => [
            'id' => $ticketId,
            'bookingId' => $bookingId > 0 ? $bookingId : null,
            'bookingCode' => $bookingCode !== '' ? $bookingCode : null,
            'customerId' => $userId,
            'category' => $category,
            'subject' => $subject,
            'description' => $description,
            'imageUrl' => $imageUrl,
            'status' => 'open',
            'assignedAdminId' => null,
            'createdAt' => date('Y-m-d H:i:s'),
            'updatedAt' => date('Y-m-d H:i:s'),
            'lastMessageAt' => date('Y-m-d H:i:s'),
            'lastMessagePreview' => substr($description, 0, 240),
            'messageCount' => 1
        ]
    ], 201);
}

if ($path === '/api/support/tickets' && $method === 'GET') {
    if (!support_tables_ready($pdo)) {
        json_response(['error' => 'Support ticket service is unavailable right now.'], 500);
    }

    $userId = (int)get_query_param('userId', 0);
    $role = strtolower(trim((string)get_query_param('role', '')));
    $status = strtolower(trim((string)get_query_param('status', 'all')));
    $limit = (int)get_query_param('limit', 100);

    if ($userId <= 0 || !in_array($role, ['customer', 'admin'], true)) {
        json_response(['error' => 'userId and role are required'], 422);
    }
    if ($limit <= 0 || $limit > 200) {
        $limit = 100;
    }

    if ($role === 'customer' && !user_has_role($pdo, $userId, 'customer')) {
        json_response(['error' => 'Access denied'], 403);
    }
    if ($role === 'admin' && !user_has_role($pdo, $userId, 'admin')) {
        json_response(['error' => 'Access denied'], 403);
    }

    $where = [];
    $params = [];
    if ($role === 'customer') {
        $where[] = 't.customer_id = :user_id';
        $params['user_id'] = $userId;
    }
    if ($status !== 'all') {
        $normalizedStatus = normalize_support_ticket_status($status, '');
        if ($normalizedStatus === '') {
            json_response(['error' => 'Invalid status filter'], 422);
        }
        $where[] = 't.status = :status';
        $params['status'] = $normalizedStatus;
    }

    $sql = 'SELECT t.id, t.booking_id, t.booking_code, t.customer_id, t.category, t.subject, t.description, t.image_url,
                   t.status, t.assigned_admin_id, t.created_at, t.updated_at, t.last_message_at, t.last_message_preview,
                   customer.full_name AS customer_name,
                   admin_user.full_name AS assigned_admin_name,
                   (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count
            FROM support_tickets t
            LEFT JOIN users AS customer ON customer.id = t.customer_id
            LEFT JOIN users AS admin_user ON admin_user.id = t.assigned_admin_id';
    if (!empty($where)) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY COALESCE(t.last_message_at, t.updated_at, t.created_at) DESC LIMIT :limit';
    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue(':' . $key, $value);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $tickets = [];
    foreach ($stmt as $row) {
        $tickets[] = [
            'id' => (int)$row['id'],
            'bookingId' => $row['booking_id'] !== null ? (int)$row['booking_id'] : null,
            'bookingCode' => $row['booking_code'] ?: null,
            'customerId' => (int)$row['customer_id'],
            'customerName' => $row['customer_name'] ?: 'Customer',
            'category' => normalize_support_ticket_category($row['category'] ?? 'other'),
            'subject' => (string)($row['subject'] ?? ''),
            'description' => (string)($row['description'] ?? ''),
            'imageUrl' => $row['image_url'] ?: null,
            'status' => normalize_support_ticket_status($row['status'] ?? 'open'),
            'assignedAdminId' => $row['assigned_admin_id'] !== null ? (int)$row['assigned_admin_id'] : null,
            'assignedAdminName' => $row['assigned_admin_name'] ?: null,
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'lastMessageAt' => $row['last_message_at'],
            'lastMessagePreview' => $row['last_message_preview'] ?: null,
            'messageCount' => (int)($row['message_count'] ?? 0)
        ];
    }

    json_response(['tickets' => $tickets]);
}

if (preg_match('#^/api/support/tickets/(\d+)/messages$#', $path, $matches) && $method === 'GET') {
    if (!support_tables_ready($pdo)) {
        json_response(['error' => 'Support ticket service is unavailable right now.'], 500);
    }

    $ticketId = (int)$matches[1];
    $userId = (int)get_query_param('userId', 0);
    $role = strtolower(trim((string)get_query_param('role', '')));
    $afterId = (int)get_query_param('afterId', 0);
    $limit = (int)get_query_param('limit', 200);

    if ($ticketId <= 0 || $userId <= 0 || !in_array($role, ['customer', 'admin'], true)) {
        json_response(['error' => 'ticketId, userId, and role are required'], 422);
    }
    if ($limit <= 0 || $limit > 300) {
        $limit = 200;
    }

    $ticketStmt = $pdo->prepare(
        'SELECT id, customer_id, status
         FROM support_tickets
         WHERE id = :id
         LIMIT 1'
    );
    $ticketStmt->execute(['id' => $ticketId]);
    $ticket = $ticketStmt->fetch();
    if (!$ticket) {
        json_response(['error' => 'Support ticket not found'], 404);
    }

    if ($role === 'customer') {
        if ((int)$ticket['customer_id'] !== $userId) {
            json_response(['error' => 'Access denied'], 403);
        }
    } else {
        if (!user_has_role($pdo, $userId, 'admin')) {
            json_response(['error' => 'Access denied'], 403);
        }
    }

    $messagesStmt = $pdo->prepare(
        'SELECT m.id, m.sender_id, m.sender_role, m.message, m.created_at, sender.full_name AS sender_name
         FROM support_ticket_messages m
         LEFT JOIN users AS sender ON sender.id = m.sender_id
         WHERE m.ticket_id = :ticket_id AND m.id > :after_id
         ORDER BY m.id ASC
         LIMIT :limit'
    );
    $messagesStmt->bindValue(':ticket_id', $ticketId, PDO::PARAM_INT);
    $messagesStmt->bindValue(':after_id', $afterId, PDO::PARAM_INT);
    $messagesStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $messagesStmt->execute();

    $messages = [];
    foreach ($messagesStmt as $row) {
        $messages[] = [
            'id' => (int)$row['id'],
            'senderId' => (int)$row['sender_id'],
            'senderRole' => strtolower(trim((string)($row['sender_role'] ?? 'customer'))),
            'senderName' => $row['sender_name'] ?: null,
            'message' => (string)($row['message'] ?? ''),
            'createdAt' => $row['created_at']
        ];
    }

    json_response([
        'messages' => $messages,
        'ticketStatus' => normalize_support_ticket_status($ticket['status'] ?? 'open')
    ]);
}

if (preg_match('#^/api/support/tickets/(\d+)/messages$#', $path, $matches) && $method === 'POST') {
    if (!support_tables_ready($pdo)) {
        json_response(['error' => 'Support ticket service is unavailable right now.'], 500);
    }

    $ticketId = (int)$matches[1];
    $payload = get_json_body();
    $userId = (int)($payload['userId'] ?? 0);
    $role = strtolower(trim((string)($payload['role'] ?? '')));
    $message = trim((string)($payload['message'] ?? ''));

    if ($ticketId <= 0 || $userId <= 0 || !in_array($role, ['customer', 'admin'], true)) {
        json_response(['error' => 'ticketId, userId, and role are required'], 422);
    }
    if ($message === '') {
        json_response(['error' => 'message is required'], 422);
    }

    $ticketStmt = $pdo->prepare(
        'SELECT id, customer_id, status, assigned_admin_id
         FROM support_tickets
         WHERE id = :id
         LIMIT 1'
    );
    $ticketStmt->execute(['id' => $ticketId]);
    $ticket = $ticketStmt->fetch();
    if (!$ticket) {
        json_response(['error' => 'Support ticket not found'], 404);
    }

    if ($role === 'customer') {
        if ((int)$ticket['customer_id'] !== $userId) {
            json_response(['error' => 'Access denied'], 403);
        }
    } else {
        if (!user_has_role($pdo, $userId, 'admin')) {
            json_response(['error' => 'Access denied'], 403);
        }
    }

    $insertMessage = $pdo->prepare(
        'INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, message)
         VALUES (:ticket_id, :sender_id, :sender_role, :message)'
    );
    $insertMessage->execute([
        'ticket_id' => $ticketId,
        'sender_id' => $userId,
        'sender_role' => $role,
        'message' => $message
    ]);
    $messageId = (int)$pdo->lastInsertId();

    $currentStatus = normalize_support_ticket_status($ticket['status'] ?? 'open');
    $nextStatus = $currentStatus;
    if ($role === 'customer' && in_array($currentStatus, ['resolved', 'closed'], true)) {
        $nextStatus = 'open';
    }
    if ($role === 'admin' && $currentStatus === 'open') {
        $nextStatus = 'in_progress';
    }
    $assignedAdminId = (int)($ticket['assigned_admin_id'] ?? 0);
    if ($role === 'admin' && $userId > 0) {
        $assignedAdminId = $userId;
    }

    $updateTicket = $pdo->prepare(
        'UPDATE support_tickets
         SET status = :status,
             assigned_admin_id = CASE WHEN :assigned_admin_id > 0 THEN :assigned_admin_id ELSE assigned_admin_id END,
             last_message_at = NOW(),
             last_message_preview = :last_message_preview
         WHERE id = :id'
    );
    $updateTicket->execute([
        'status' => $nextStatus,
        'assigned_admin_id' => $assignedAdminId,
        'last_message_preview' => substr($message, 0, 240),
        'id' => $ticketId
    ]);

    json_response([
        'message' => [
            'id' => $messageId,
            'senderId' => $userId,
            'senderRole' => $role,
            'message' => $message,
            'createdAt' => date('Y-m-d H:i:s')
        ],
        'ticketStatus' => $nextStatus,
        'assignedAdminId' => $assignedAdminId > 0 ? $assignedAdminId : null
    ], 201);
}

if (preg_match('#^/api/support/tickets/(\d+)$#', $path, $matches) && $method === 'PATCH') {
    if (!support_tables_ready($pdo)) {
        json_response(['error' => 'Support ticket service is unavailable right now.'], 500);
    }

    $ticketId = (int)$matches[1];
    $payload = get_json_body();
    $userId = (int)($payload['userId'] ?? 0);
    $role = strtolower(trim((string)($payload['role'] ?? '')));
    $status = normalize_support_ticket_status($payload['status'] ?? '', '');
    $assignedAdminId = isset($payload['assignedAdminId']) ? (int)$payload['assignedAdminId'] : null;

    if ($ticketId <= 0 || $userId <= 0 || !in_array($role, ['admin', 'customer'], true)) {
        json_response(['error' => 'Valid ticket update credentials are required'], 422);
    }
    if ($status === '') {
        json_response(['error' => 'status is required'], 422);
    }

    $ticketStmt = $pdo->prepare(
        'SELECT id, customer_id
         FROM support_tickets
         WHERE id = :id
         LIMIT 1'
    );
    $ticketStmt->execute(['id' => $ticketId]);
    $ticket = $ticketStmt->fetch();
    if (!$ticket) {
        json_response(['error' => 'Support ticket not found'], 404);
    }

    if ($role === 'admin') {
        if (!user_has_role($pdo, $userId, 'admin')) {
            json_response(['error' => 'Access denied'], 403);
        }
        $updateSql = 'UPDATE support_tickets
                      SET status = :status,
                          assigned_admin_id = CASE
                              WHEN :assigned_admin_id > 0 THEN :assigned_admin_id
                              ELSE assigned_admin_id
                          END
                      WHERE id = :id';
        $updateStmt = $pdo->prepare($updateSql);
        $updateStmt->execute([
            'status' => $status,
            'assigned_admin_id' => $assignedAdminId !== null ? $assignedAdminId : $userId,
            'id' => $ticketId
        ]);
    } else {
        if ((int)$ticket['customer_id'] !== $userId) {
            json_response(['error' => 'Access denied'], 403);
        }
        if ($status !== 'closed') {
            json_response(['error' => 'Customers can only close their support tickets.'], 422);
        }
        $updateStmt = $pdo->prepare(
            'UPDATE support_tickets
             SET status = :status
             WHERE id = :id'
        );
        $updateStmt->execute([
            'status' => 'closed',
            'id' => $ticketId
        ]);
    }

    $selectTicket = $pdo->prepare(
        'SELECT t.id, t.booking_id, t.booking_code, t.customer_id, t.category, t.subject, t.description, t.image_url,
                t.status, t.assigned_admin_id, t.created_at, t.updated_at, t.last_message_at, t.last_message_preview,
                customer.full_name AS customer_name,
                admin_user.full_name AS assigned_admin_name,
                (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count
         FROM support_tickets t
         LEFT JOIN users AS customer ON customer.id = t.customer_id
         LEFT JOIN users AS admin_user ON admin_user.id = t.assigned_admin_id
         WHERE t.id = :id
         LIMIT 1'
    );
    $selectTicket->execute(['id' => $ticketId]);
    $row = $selectTicket->fetch();

    json_response([
        'ticket' => [
            'id' => (int)$row['id'],
            'bookingId' => $row['booking_id'] !== null ? (int)$row['booking_id'] : null,
            'bookingCode' => $row['booking_code'] ?: null,
            'customerId' => (int)$row['customer_id'],
            'customerName' => $row['customer_name'] ?: 'Customer',
            'category' => normalize_support_ticket_category($row['category'] ?? 'other'),
            'subject' => (string)($row['subject'] ?? ''),
            'description' => (string)($row['description'] ?? ''),
            'imageUrl' => $row['image_url'] ?: null,
            'status' => normalize_support_ticket_status($row['status'] ?? 'open'),
            'assignedAdminId' => $row['assigned_admin_id'] !== null ? (int)$row['assigned_admin_id'] : null,
            'assignedAdminName' => $row['assigned_admin_name'] ?: null,
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'lastMessageAt' => $row['last_message_at'],
            'lastMessagePreview' => $row['last_message_preview'] ?: null,
            'messageCount' => (int)($row['message_count'] ?? 0)
        ]
    ]);
}

if ($path === '/api/messages' && $method === 'GET') {
    $bookingId = (int)get_query_param('bookingId', 0);
    $userId = (int)get_query_param('userId', 0);
    $role = strtolower(trim((string)get_query_param('role', '')));
    $context = strtolower(trim((string)get_query_param('context', '')));
    $deliveryAccessCode = trim((string)get_query_param('accessCode', ''));
    $afterId = (int)get_query_param('afterId', 0);
    $limit = (int)get_query_param('limit', 100);

    if ($bookingId <= 0 || $userId <= 0 || !in_array($role, ['customer', 'courier', 'admin'], true)) {
        json_response(['error' => 'bookingId, userId, and role are required'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.customer_id, bookings.courier_id, bookings.pickup_courier_id,
                bookings.delivery_access_code,
                bookings.delivery_courier_id, bookings.linehaul_courier_id, bookings.status, courier_profiles.courier_role
         FROM bookings
         LEFT JOIN courier_profiles ON courier_profiles.user_id = bookings.courier_id
         WHERE bookings.id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    if ($role === 'customer') {
        $ownsBooking = (int)$booking['customer_id'] === $userId;
        $trackingCodeMatches = $context === 'tracking'
            && booking_delivery_access_code_matches($booking, $deliveryAccessCode);
        $trackingAccessGranted = $context === 'tracking'
            && ($ownsBooking || $trackingCodeMatches);
        if (!$ownsBooking && !$trackingAccessGranted) {
            json_response(['error' => 'Access denied'], 403);
        }
        if ($context === 'tracking' && !$trackingAccessGranted) {
            json_response(['error' => 'Valid delivery access code is required for tracking chat.'], 403);
        }
    }
    if ($role === 'courier') {
        $isAssignedCourier = courier_matches_booking_assignment($booking, $userId);
        $hasMessageAccess = $isAssignedCourier || courier_has_booking_message_access($pdo, $bookingId, $userId);
        if (!$hasMessageAccess) {
            json_response(['error' => 'Access denied'], 403);
        }
        if ($isAssignedCourier) {
            $chatAccess = courier_chat_access($booking);
            if (!$chatAccess['allowed']) {
                json_response(['error' => $chatAccess['reason']], 403);
            }
        }
    }
    if ($role === 'admin' && !user_has_role($pdo, $userId, 'admin')) {
        json_response(['error' => 'Access denied'], 403);
    }

    if ($limit <= 0 || $limit > 200) {
        $limit = 200;
    }

    $stmt = $pdo->prepare(
        'SELECT id, sender_id, sender_role, recipient_id, recipient_role, message, created_at
         FROM messages
         WHERE booking_id = :booking_id AND id > :after_id
         ORDER BY id ASC
         LIMIT :limit'
    );
    $stmt->bindValue(':booking_id', $bookingId, PDO::PARAM_INT);
    $stmt->bindValue(':after_id', $afterId, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $messages = [];
    foreach ($stmt as $row) {
        $messages[] = [
            'id' => (int)$row['id'],
            'senderId' => (int)$row['sender_id'],
            'senderRole' => $row['sender_role'],
            'recipientId' => (int)$row['recipient_id'],
            'recipientRole' => $row['recipient_role'],
            'message' => $row['message'],
            'createdAt' => $row['created_at']
        ];
    }

    json_response(['messages' => $messages]);
}

if ($path === '/api/messages' && $method === 'POST') {
    $payload = get_json_body();
    $bookingId = (int)($payload['bookingId'] ?? 0);
    $userId = (int)($payload['userId'] ?? 0);
    $role = strtolower(trim((string)($payload['role'] ?? '')));
    $message = trim((string)($payload['message'] ?? ''));
    $context = strtolower(trim((string)($payload['context'] ?? '')));
    $deliveryAccessCode = trim((string)($payload['accessCode'] ?? ''));

    if ($bookingId <= 0 || $userId <= 0 || !in_array($role, ['customer', 'courier', 'admin'], true)) {
        json_response(['error' => 'bookingId, userId, and role are required'], 422);
    }
    if ($message === '') {
        json_response(['error' => 'message is required'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.customer_id, bookings.courier_id, bookings.pickup_courier_id,
                bookings.delivery_access_code,
                bookings.delivery_courier_id, bookings.linehaul_courier_id, bookings.status, courier_profiles.courier_role
         FROM bookings
         LEFT JOIN courier_profiles ON courier_profiles.user_id = bookings.courier_id
         WHERE bookings.id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $senderRole = $role === 'admin' ? 'courier' : $role;
    $recipientId = 0;
    $recipientRole = '';

    if ($role === 'customer') {
        $ownsBooking = (int)$booking['customer_id'] === $userId;
        $trackingCodeMatches = $context === 'tracking'
            && booking_delivery_access_code_matches($booking, $deliveryAccessCode);
        $trackingAccessGranted = $context === 'tracking'
            && ($ownsBooking || $trackingCodeMatches);
        if (!$ownsBooking && !$trackingAccessGranted) {
            json_response(['error' => 'Access denied'], 403);
        }
        if ($context === 'tracking' && !$trackingAccessGranted) {
            json_response(['error' => 'Valid delivery access code is required for tracking chat.'], 403);
        }
        if (!$booking['courier_id']) {
            json_response(['error' => 'Courier not assigned yet'], 409);
        }
        $recipientId = (int)$booking['courier_id'];
        $recipientRole = 'courier';
    } else {
        if ($role === 'courier') {
            if (!courier_matches_booking_assignment($booking, $userId)) {
                json_response(['error' => 'Access denied'], 403);
            }
            $chatAccess = courier_chat_access($booking);
            if (!$chatAccess['allowed']) {
                json_response(['error' => $chatAccess['reason']], 403);
            }
            $recipientId = (int)$booking['customer_id'];
            $recipientRole = 'customer';
        } else {
            if (!user_has_role($pdo, $userId, 'admin')) {
                json_response(['error' => 'Access denied'], 403);
            }
            $recipientId = (int)($payload['recipientId'] ?? 0);
            $recipientRole = strtolower(trim((string)($payload['recipientRole'] ?? '')));
            if ($recipientId <= 0 || !in_array($recipientRole, ['customer', 'courier'], true)) {
                json_response(['error' => 'recipientId and recipientRole are required for admin messages'], 422);
            }
            $isCustomerRecipient = $recipientRole === 'customer' && $recipientId === (int)$booking['customer_id'];
            $isCourierRecipient = $recipientRole === 'courier' && $recipientId === (int)$booking['courier_id'];
            if (!$isCustomerRecipient && !$isCourierRecipient) {
                json_response(['error' => 'Recipient must belong to this booking'], 422);
            }
        }
    }

    $insert = $pdo->prepare(
        'INSERT INTO messages (booking_id, sender_id, sender_role, recipient_id, recipient_role, message)
         VALUES (:booking_id, :sender_id, :sender_role, :recipient_id, :recipient_role, :message)'
    );
    $insert->execute([
        'booking_id' => $bookingId,
        'sender_id' => $userId,
        'sender_role' => $senderRole,
        'recipient_id' => $recipientId,
        'recipient_role' => $recipientRole,
        'message' => $message
    ]);

    $messageId = (int)$pdo->lastInsertId();
    json_response([
        'message' => [
            'id' => $messageId,
            'senderId' => $userId,
            'senderRole' => $senderRole,
            'recipientId' => $recipientId,
            'recipientRole' => $recipientRole,
            'message' => $message,
            'createdAt' => date('Y-m-d H:i:s')
        ]
    ], 201);
}

  if ($path === '/api/dashboard/courier' && $method === 'GET') {
    $userId = (int)get_query_param('userId', 0);
    if ($userId <= 0) {
        json_response(['error' => 'userId is required'], 422);
    }

    $courierRoleStmt = $pdo->prepare('SELECT courier_role FROM courier_profiles WHERE user_id = :id');
    $courierRoleStmt->execute(['id' => $userId]);
    $courierRoleRow = $courierRoleStmt->fetch();
    $courierRole = $courierRoleRow ? ($courierRoleRow['courier_role'] ?: 'delivery') : 'delivery';
    $hideCustomerDetails = $courierRole === 'linehaul';
    $vehicle = courier_vehicle_details($pdo, $userId);
    $assignmentCondition = courier_assignment_condition($courierRole);
    $dashboardStatuses = courier_dashboard_visible_statuses($courierRole);
    $dashboardStatusPlaceholders = [];
    $dashboardParams = ['id' => $userId];
    foreach ($dashboardStatuses as $idx => $statusValue) {
        $key = 'dashboard_status_' . $idx;
        $dashboardStatusPlaceholders[] = ':' . $key;
        $dashboardParams[$key] = $statusValue;
    }
    if (!$dashboardStatusPlaceholders) {
        $dashboardStatusPlaceholders[] = ':dashboard_status_fallback';
        $dashboardParams['dashboard_status_fallback'] = 'cancelled';
    }
    $activeDashboardStatuses = courier_dashboard_active_statuses($courierRole);
    $activeDashboardStatusPlaceholders = [];
    $activeDashboardParams = ['id' => $userId];
    foreach ($activeDashboardStatuses as $idx => $statusValue) {
        $key = 'active_status_' . $idx;
        $activeDashboardStatusPlaceholders[] = ':' . $key;
        $activeDashboardParams[$key] = $statusValue;
    }
    if (!$activeDashboardStatusPlaceholders) {
        $activeDashboardStatusPlaceholders[] = ':active_status_fallback';
        $activeDashboardParams['active_status_fallback'] = 'out_for_delivery';
    }
    $earnableStatuses = courier_earnable_statuses($courierRole);
    $completedStatuses = courier_completed_statuses($courierRole);
    $assignmentEventStatuses = courier_assignment_event_statuses($courierRole);

    $deliveriesStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.booking_code, bookings.status, bookings.distance_km, bookings.eta_minutes,
                bookings.service_type, bookings.requires_linehaul, bookings.is_intercity,
                bookings.origin_branch_id, bookings.destination_branch_id,
                packages.category, packages.declared_weight, packages.special_instructions,
                payments.method AS payment_method, payments.provider AS payment_provider, payments.status AS payment_status, payments.total AS payment_total,
                origin_branch.name AS origin_branch_name, origin_branch.address_line AS origin_branch_address_line,
                origin_branch.city AS origin_branch_city, origin_branch.province AS origin_branch_province, origin_branch.postal_code AS origin_branch_postal_code,
                origin_branch.lat AS origin_branch_lat, origin_branch.lng AS origin_branch_lng,
                destination_branch.name AS destination_branch_name, destination_branch.address_line AS destination_branch_address_line,
                destination_branch.city AS destination_branch_city, destination_branch.province AS destination_branch_province, destination_branch.postal_code AS destination_branch_postal_code,
                destination_branch.lat AS destination_branch_lat, destination_branch.lng AS destination_branch_lng,
                delivery.line1 AS delivery_line, delivery.city AS delivery_city, delivery.province AS delivery_province, delivery.postal_code AS delivery_postal,
                delivery.lat AS delivery_lat, delivery.lng AS delivery_lng,
                pickup.line1 AS pickup_line, pickup.city AS pickup_city, pickup.province AS pickup_province, pickup.postal_code AS pickup_postal,
                pickup.lat AS pickup_lat, pickup.lng AS pickup_lng,
                customers.full_name AS customer_name, customers.phone AS customer_phone
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN (
            SELECT p_latest.booking_id, p_latest.method, p_latest.provider, p_latest.status, p_latest.total
            FROM payments AS p_latest
            JOIN (
                SELECT booking_id, MAX(id) AS latest_id
                FROM payments
                GROUP BY booking_id
            ) AS p_ids ON p_ids.latest_id = p_latest.id
         ) AS payments ON payments.booking_id = bookings.id
         LEFT JOIN users AS customers ON customers.id = bookings.customer_id
         LEFT JOIN branches AS origin_branch ON origin_branch.id = bookings.origin_branch_id
         LEFT JOIN branches AS destination_branch ON destination_branch.id = bookings.destination_branch_id
         WHERE ' . $assignmentCondition . '
           AND bookings.status IN (' . implode(',', $dashboardStatusPlaceholders) . ')
         ORDER BY bookings.created_at DESC
         LIMIT 12'
    );
    $deliveriesStmt->execute($dashboardParams);
    $deliveries = [];
    foreach ($deliveriesStmt as $row) {
        $distanceKm = $row['distance_km'] !== null ? (float)$row['distance_km'] : null;
        if ($distanceKm === null && has_valid_coords($row['pickup_lat'], $row['pickup_lng'])
            && has_valid_coords($row['delivery_lat'], $row['delivery_lng'])) {
            $distanceKm = calculate_distance_km(
                $row['pickup_lat'],
                $row['pickup_lng'],
                $row['delivery_lat'],
                $row['delivery_lng']
            );
        }
        $etaMinutes = $row['eta_minutes'] !== null ? (int)$row['eta_minutes'] : null;
        if ($etaMinutes === null && $distanceKm !== null) {
            $avgSpeedKmph = 25;
            $etaMinutes = (int)max(1, round(($distanceKm / $avgSpeedKmph) * 60));
        }
        $weightKg = parse_weight_kg($row['declared_weight']);
        $earnings = calculate_role_earnings($courierRole, $row['status'], $distanceKm, $weightKg, $row['category'], $row['service_type'], $row);

        $requiresLinehaul = to_bool($row['requires_linehaul'] ?? false);
        $isIntercity = to_bool($row['is_intercity'] ?? false);
        if (!$isIntercity) {
            $pickupCityToken = normalize_city_token($row['pickup_city'] ?? null);
            $deliveryCityToken = normalize_city_token($row['delivery_city'] ?? null);
            $isIntercity = $requiresLinehaul
                || ($pickupCityToken !== '' && $deliveryCityToken !== '' && $pickupCityToken !== $deliveryCityToken);
        }
        $originBranchPayload = $row['origin_branch_id'] ? [
            'id' => (int)$row['origin_branch_id'],
            'name' => $row['origin_branch_name'] ?: null,
            'address' => $row['origin_branch_address_line'] ?: null,
            'city' => $row['origin_branch_city'] ?: null,
            'province' => $row['origin_branch_province'] ?: null,
            'postalCode' => $row['origin_branch_postal_code'] ?: null,
            'lat' => $row['origin_branch_lat'] !== null ? (float)$row['origin_branch_lat'] : null,
            'lng' => $row['origin_branch_lng'] !== null ? (float)$row['origin_branch_lng'] : null
        ] : null;
        $originBranchPayload = apply_branch_anchor_fallback(
            $originBranchPayload,
            $row['pickup_lat'] ?? null,
            $row['pickup_lng'] ?? null
        );
        $destinationBranchPayload = $row['destination_branch_id'] ? [
            'id' => (int)$row['destination_branch_id'],
            'name' => $row['destination_branch_name'] ?: null,
            'address' => $row['destination_branch_address_line'] ?: null,
            'city' => $row['destination_branch_city'] ?: null,
            'province' => $row['destination_branch_province'] ?: null,
            'postalCode' => $row['destination_branch_postal_code'] ?: null,
            'lat' => $row['destination_branch_lat'] !== null ? (float)$row['destination_branch_lat'] : null,
            'lng' => $row['destination_branch_lng'] !== null ? (float)$row['destination_branch_lng'] : null
        ] : null;
        $destinationBranchPayload = apply_branch_anchor_fallback(
            $destinationBranchPayload,
            $row['delivery_lat'] ?? null,
            $row['delivery_lng'] ?? null
        );
        if ($isIntercity) {
            $resolvedDestinationBranch = resolve_destination_branch_for_booking_row($pdo, $row, true);
            if ($resolvedDestinationBranch !== null) {
                $destinationBranchPayload = $resolvedDestinationBranch;
            }
        }
        $deliveries[] = [
            'id' => (int)$row['id'],
            'trackingId' => $row['booking_code'],
            'status' => $row['status'],
            'priority' => 'medium',
            'pickupCity' => $row['pickup_city'] ?: null,
            'deliveryCity' => $row['delivery_city'] ?: null,
            'pickupLat' => $row['pickup_lat'] !== null ? (float)$row['pickup_lat'] : null,
            'pickupLng' => $row['pickup_lng'] !== null ? (float)$row['pickup_lng'] : null,
            'deliveryLat' => $row['delivery_lat'] !== null ? (float)$row['delivery_lat'] : null,
            'deliveryLng' => $row['delivery_lng'] !== null ? (float)$row['delivery_lng'] : null,
            'requiresLinehaul' => $requiresLinehaul,
            'isIntercity' => $isIntercity,
            'originBranch' => $originBranchPayload,
            'destinationBranch' => $destinationBranchPayload,
            'pickupAddress' => sprintf('%s, %s, %s %s', $row['pickup_line'], $row['pickup_city'], $row['pickup_province'], $row['pickup_postal']),
            'deliveryAddress' => sprintf('%s, %s, %s %s', $row['delivery_line'], $row['delivery_city'], $row['delivery_province'], $row['delivery_postal']),
            'packageType' => $row['category'],
            'weight' => $row['declared_weight'] ?: '0',
            'distance' => $distanceKm !== null ? number_format($distanceKm, 1) . ' km' : 'N/A',
            'estimatedTime' => $etaMinutes !== null ? $etaMinutes . ' mins' : 'N/A',
            'earnings' => $earnings,
            'customerName' => $hideCustomerDetails ? null : ($row['customer_name'] ?: 'Customer'),
            'customerPhone' => $hideCustomerDetails ? null : ($row['customer_phone'] ?: ''),
            'specialInstructions' => $row['special_instructions'],
            'paymentMethod' => $row['payment_method'] ?: null,
            'paymentProvider' => $row['payment_provider'] ?: null,
            'paymentStatus' => $row['payment_status'] ?: null,
            'paymentTotal' => $row['payment_total'] !== null ? (float)$row['payment_total'] : null,
            'cashToCollect' => ($row['payment_method'] === 'cash' && $row['payment_total'] !== null)
                ? (float)$row['payment_total']
                : null
        ];
    }

    $activeOrderSql = 'bookings.updated_at DESC';
    if ($courierRole === 'linehaul') {
        $activeOrderSql = "CASE
            WHEN bookings.status = 'linehaul_in_transit' THEN 0
            WHEN bookings.status = 'linehaul_load_confirmed' THEN 1
            WHEN bookings.status = 'linehaul_assigned' THEN 2
            ELSE 9
        END, bookings.updated_at DESC";
    }

    $activeStmt = $pdo->prepare(
        "SELECT bookings.id, bookings.booking_code, bookings.status, bookings.eta_minutes, bookings.distance_km,
                bookings.service_type, bookings.requires_linehaul, bookings.is_intercity,
                bookings.origin_branch_id, bookings.destination_branch_id,
                packages.category, packages.declared_weight, packages.special_instructions,
                payments.method AS payment_method, payments.provider AS payment_provider, payments.status AS payment_status, payments.total AS payment_total,
                origin_branch.name AS origin_branch_name, origin_branch.address_line AS origin_branch_address_line,
                origin_branch.city AS origin_branch_city, origin_branch.province AS origin_branch_province, origin_branch.postal_code AS origin_branch_postal_code,
                origin_branch.lat AS origin_branch_lat, origin_branch.lng AS origin_branch_lng,
                destination_branch.name AS destination_branch_name, destination_branch.address_line AS destination_branch_address_line,
                destination_branch.city AS destination_branch_city, destination_branch.province AS destination_branch_province, destination_branch.postal_code AS destination_branch_postal_code,
                destination_branch.lat AS destination_branch_lat, destination_branch.lng AS destination_branch_lng,
                delivery.line1 AS delivery_line, delivery.city AS delivery_city, delivery.province AS delivery_province, delivery.postal_code AS delivery_postal,
                delivery.lat AS delivery_lat, delivery.lng AS delivery_lng,
                pickup.line1 AS pickup_line, pickup.city AS pickup_city, pickup.province AS pickup_province, pickup.postal_code AS pickup_postal,
                pickup.lat AS pickup_lat, pickup.lng AS pickup_lng,
                customers.full_name AS customer_name, customers.phone AS customer_phone
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN (
            SELECT p_latest.booking_id, p_latest.method, p_latest.provider, p_latest.status, p_latest.total
            FROM payments AS p_latest
            JOIN (
                SELECT booking_id, MAX(id) AS latest_id
                FROM payments
                GROUP BY booking_id
            ) AS p_ids ON p_ids.latest_id = p_latest.id
         ) AS payments ON payments.booking_id = bookings.id
         LEFT JOIN users AS customers ON customers.id = bookings.customer_id
         LEFT JOIN branches AS origin_branch ON origin_branch.id = bookings.origin_branch_id
         LEFT JOIN branches AS destination_branch ON destination_branch.id = bookings.destination_branch_id
         WHERE {$assignmentCondition}
           AND bookings.status IN (" . implode(',', $activeDashboardStatusPlaceholders) . ")
         ORDER BY {$activeOrderSql}
         LIMIT 1"
    );
    $activeStmt->execute($activeDashboardParams);
    $activeRow = $activeStmt->fetch();
    $activeDelivery = null;
    if ($activeRow) {
        $distanceKm = $activeRow['distance_km'] !== null ? (float)$activeRow['distance_km'] : null;
        if ($distanceKm === null && has_valid_coords($activeRow['pickup_lat'], $activeRow['pickup_lng'])
            && has_valid_coords($activeRow['delivery_lat'], $activeRow['delivery_lng'])) {
            $distanceKm = calculate_distance_km(
                $activeRow['pickup_lat'],
                $activeRow['pickup_lng'],
                $activeRow['delivery_lat'],
                $activeRow['delivery_lng']
            );
        }
        $etaMinutes = $activeRow['eta_minutes'] !== null ? (int)$activeRow['eta_minutes'] : null;
        if ($etaMinutes === null && $distanceKm !== null) {
            $avgSpeedKmph = 25;
            $etaMinutes = (int)max(1, round(($distanceKm / $avgSpeedKmph) * 60));
        }
        $weightKg = parse_weight_kg($activeRow['declared_weight']);
        $earnings = calculate_role_earnings($courierRole, $activeRow['status'], $distanceKm, $weightKg, $activeRow['category'], $activeRow['service_type'], $activeRow);
        $requiresLinehaul = to_bool($activeRow['requires_linehaul'] ?? false);
        $isIntercity = to_bool($activeRow['is_intercity'] ?? false);
        if (!$isIntercity) {
            $pickupCityToken = normalize_city_token($activeRow['pickup_city'] ?? null);
            $deliveryCityToken = normalize_city_token($activeRow['delivery_city'] ?? null);
            $isIntercity = $requiresLinehaul
                || ($pickupCityToken !== '' && $deliveryCityToken !== '' && $pickupCityToken !== $deliveryCityToken);
        }
        $originBranchPayload = $activeRow['origin_branch_id'] ? [
            'id' => (int)$activeRow['origin_branch_id'],
            'name' => $activeRow['origin_branch_name'] ?: null,
            'address' => $activeRow['origin_branch_address_line'] ?: null,
            'city' => $activeRow['origin_branch_city'] ?: null,
            'province' => $activeRow['origin_branch_province'] ?: null,
            'postalCode' => $activeRow['origin_branch_postal_code'] ?: null,
            'lat' => $activeRow['origin_branch_lat'] !== null ? (float)$activeRow['origin_branch_lat'] : null,
            'lng' => $activeRow['origin_branch_lng'] !== null ? (float)$activeRow['origin_branch_lng'] : null
        ] : null;
        $originBranchPayload = apply_branch_anchor_fallback(
            $originBranchPayload,
            $activeRow['pickup_lat'] ?? null,
            $activeRow['pickup_lng'] ?? null
        );
        $destinationBranchPayload = $activeRow['destination_branch_id'] ? [
            'id' => (int)$activeRow['destination_branch_id'],
            'name' => $activeRow['destination_branch_name'] ?: null,
            'address' => $activeRow['destination_branch_address_line'] ?: null,
            'city' => $activeRow['destination_branch_city'] ?: null,
            'province' => $activeRow['destination_branch_province'] ?: null,
            'postalCode' => $activeRow['destination_branch_postal_code'] ?: null,
            'lat' => $activeRow['destination_branch_lat'] !== null ? (float)$activeRow['destination_branch_lat'] : null,
            'lng' => $activeRow['destination_branch_lng'] !== null ? (float)$activeRow['destination_branch_lng'] : null
        ] : null;
        $destinationBranchPayload = apply_branch_anchor_fallback(
            $destinationBranchPayload,
            $activeRow['delivery_lat'] ?? null,
            $activeRow['delivery_lng'] ?? null
        );
        if ($isIntercity) {
            $resolvedDestinationBranch = resolve_destination_branch_for_booking_row($pdo, $activeRow, true);
            if ($resolvedDestinationBranch !== null) {
                $destinationBranchPayload = $resolvedDestinationBranch;
            }
        }
        $activeDelivery = [
            'id' => (int)$activeRow['id'],
            'trackingId' => $activeRow['booking_code'],
            'status' => $activeRow['status'],
            'pickupCity' => $activeRow['pickup_city'] ?: null,
            'deliveryCity' => $activeRow['delivery_city'] ?: null,
            'pickupLat' => $activeRow['pickup_lat'] !== null ? (float)$activeRow['pickup_lat'] : null,
            'pickupLng' => $activeRow['pickup_lng'] !== null ? (float)$activeRow['pickup_lng'] : null,
            'deliveryLat' => $activeRow['delivery_lat'] !== null ? (float)$activeRow['delivery_lat'] : null,
            'deliveryLng' => $activeRow['delivery_lng'] !== null ? (float)$activeRow['delivery_lng'] : null,
            'requiresLinehaul' => $requiresLinehaul,
            'isIntercity' => $isIntercity,
            'originBranch' => $originBranchPayload,
            'destinationBranch' => $destinationBranchPayload,
            'pickupAddress' => sprintf('%s, %s, %s %s', $activeRow['pickup_line'], $activeRow['pickup_city'], $activeRow['pickup_province'], $activeRow['pickup_postal']),
            'deliveryAddress' => sprintf('%s, %s, %s %s', $activeRow['delivery_line'], $activeRow['delivery_city'], $activeRow['delivery_province'], $activeRow['delivery_postal']),
            'packageType' => $activeRow['category'],
            'weight' => $activeRow['declared_weight'] ?: '0',
            'distance' => $distanceKm !== null ? number_format($distanceKm, 1) . ' km' : 'N/A',
            'eta' => $etaMinutes !== null ? $etaMinutes . ' mins' : 'N/A',
            'earnings' => $earnings,
            'customerName' => $hideCustomerDetails ? null : ($activeRow['customer_name'] ?: 'Customer'),
            'customerPhone' => $hideCustomerDetails ? null : ($activeRow['customer_phone'] ?: ''),
            'specialInstructions' => $activeRow['special_instructions'],
            'paymentMethod' => $activeRow['payment_method'] ?: null,
            'paymentProvider' => $activeRow['payment_provider'] ?: null,
            'paymentStatus' => $activeRow['payment_status'] ?: null,
            'paymentTotal' => $activeRow['payment_total'] !== null ? (float)$activeRow['payment_total'] : null,
            'cashToCollect' => ($activeRow['payment_method'] === 'cash' && $activeRow['payment_total'] !== null)
                ? (float)$activeRow['payment_total']
                : null
        ];
    }

    $earningStatusPlaceholders = [];
    $earningParams = ['id' => $userId];
    foreach ($earnableStatuses as $idx => $statusValue) {
        $key = 'earn_status_' . $idx;
        $earningStatusPlaceholders[] = ':' . $key;
        $earningParams[$key] = $statusValue;
    }
    if (!$earningStatusPlaceholders) {
        $earningStatusPlaceholders[] = ':earn_status_fallback';
        $earningParams['earn_status_fallback'] = 'delivered';
    }
    $earningsStmt = $pdo->prepare(
        "SELECT bookings.id, bookings.updated_at, bookings.created_at, bookings.distance_km, bookings.eta_minutes,
                bookings.service_type, bookings.status, bookings.delivery_deadline,
                bookings.requires_linehaul, bookings.is_intercity,
                bookings.origin_branch_id, bookings.destination_branch_id,
                packages.category, packages.declared_weight,
                origin_branch.lat AS origin_branch_lat, origin_branch.lng AS origin_branch_lng,
                destination_branch.lat AS destination_branch_lat, destination_branch.lng AS destination_branch_lng,
                pickup.city AS pickup_city, pickup.province AS pickup_province,
                delivery.city AS delivery_city, delivery.province AS delivery_province,
                pickup.lat AS pickup_lat, pickup.lng AS pickup_lng,
                delivery.lat AS delivery_lat, delivery.lng AS delivery_lng
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN branches AS origin_branch ON origin_branch.id = bookings.origin_branch_id
         LEFT JOIN branches AS destination_branch ON destination_branch.id = bookings.destination_branch_id
         WHERE {$assignmentCondition}
           AND bookings.status IN (" . implode(',', $earningStatusPlaceholders) . ")"
    );
    $earningsStmt->execute($earningParams);
    $dailyTotal = 0.0;
    $weeklyTotal = 0.0;
    $monthlyTotal = 0.0;
    $dailyBase = 0.0;
    $weeklyBase = 0.0;
    $monthlyBase = 0.0;
    $dailyBonuses = 0.0;
    $weeklyBonuses = 0.0;
    $monthlyBonuses = 0.0;
    $dailyCount = 0;
    $weeklyCount = 0;
    $monthlyCount = 0;
    $dailyBreakdown = ['base' => 0.0, 'distance' => 0.0, 'weight' => 0.0, 'extras' => 0.0];
    $weeklyBreakdown = ['base' => 0.0, 'distance' => 0.0, 'weight' => 0.0, 'extras' => 0.0];
    $monthlyBreakdown = ['base' => 0.0, 'distance' => 0.0, 'weight' => 0.0, 'extras' => 0.0];
    $today = new DateTimeImmutable('today');
    $weekStart = $today->modify('monday this week');
    $monthStart = $today->modify('first day of this month');
      foreach ($earningsStmt as $row) {
        $timestamp = $row['updated_at'] ?: $row['created_at'];
        if (!$timestamp) {
            continue;
        }
        $date = new DateTimeImmutable($timestamp);
        $distanceKm = $row['distance_km'] !== null ? (float)$row['distance_km'] : null;
        if ($distanceKm === null && has_valid_coords($row['pickup_lat'], $row['pickup_lng'])
            && has_valid_coords($row['delivery_lat'], $row['delivery_lng'])) {
            $distanceKm = calculate_distance_km(
                $row['pickup_lat'],
                $row['pickup_lng'],
                $row['delivery_lat'],
                $row['delivery_lng']
            );
        }
        $weightKg = parse_weight_kg($row['declared_weight']);
        $earningParts = calculate_role_earning_components(
            $courierRole,
            $row['status'],
            $distanceKm,
            $weightKg,
            $row['category'],
            $row['service_type'],
            $row
        );
        $amount = (float)($earningParts['total'] ?? 0.0);
        $basePay = (float)($earningParts['base'] ?? 0.0);
        $distancePay = (float)($earningParts['distance'] ?? 0.0);
        $weightPay = (float)($earningParts['weight'] ?? 0.0);
        $extraFees = (float)($earningParts['extras'] ?? 0.0);

        if ($date >= $today) {
            $dailyTotal += $amount;
            $dailyBase += $basePay + $distancePay + $weightPay;
            $dailyBreakdown['base'] += $basePay;
            $dailyBreakdown['distance'] += $distancePay;
            $dailyBreakdown['weight'] += $weightPay;
            $dailyBreakdown['extras'] += $extraFees;
            $dailyCount += 1;
        }
        if ($date >= $weekStart) {
            $weeklyTotal += $amount;
            $weeklyBase += $basePay + $distancePay + $weightPay;
            $weeklyBreakdown['base'] += $basePay;
            $weeklyBreakdown['distance'] += $distancePay;
            $weeklyBreakdown['weight'] += $weightPay;
            $weeklyBreakdown['extras'] += $extraFees;
            $weeklyCount += 1;
        }
        if ($date >= $monthStart) {
            $monthlyTotal += $amount;
            $monthlyBase += $basePay + $distancePay + $weightPay;
            $monthlyBreakdown['base'] += $basePay;
            $monthlyBreakdown['distance'] += $distancePay;
            $monthlyBreakdown['weight'] += $weightPay;
            $monthlyBreakdown['extras'] += $extraFees;
            $monthlyCount += 1;
        }
      }

      $assignStmt = $pdo->prepare(
          "SELECT id, status, updated_at, created_at, delivery_deadline, eta_minutes, service_type
           FROM bookings
           WHERE {$assignmentCondition}"
      );
      $assignStmt->execute(['id' => $userId]);
      $assignedRows = [];
      foreach ($assignStmt as $row) {
          $assignedRows[] = $row;
      }

      $assignmentEventTimes = [];
      $completionEventTimes = [];
      if (!empty($assignedRows)) {
          $bookingIdPlaceholders = [];
          $bookingIdParams = [];
          foreach ($assignedRows as $idx => $bookingRow) {
              $key = 'booking_id_' . $idx;
              $bookingIdPlaceholders[] = ':' . $key;
              $bookingIdParams[$key] = (int)$bookingRow['id'];
          }

          if (!empty($assignmentEventStatuses)) {
              $assignmentStatusPlaceholders = [];
              $assignmentStatusParams = $bookingIdParams;
              foreach ($assignmentEventStatuses as $idx => $statusValue) {
                  $key = 'assignment_event_status_' . $idx;
                  $assignmentStatusPlaceholders[] = ':' . $key;
                  $assignmentStatusParams[$key] = $statusValue;
              }
              $assignmentEventStmt = $pdo->prepare(
                  "SELECT booking_id, MIN(occurred_at) AS assigned_at
                   FROM booking_status_events
                   WHERE booking_id IN (" . implode(',', $bookingIdPlaceholders) . ")
                     AND status IN (" . implode(',', $assignmentStatusPlaceholders) . ")
                   GROUP BY booking_id"
              );
              $assignmentEventStmt->execute($assignmentStatusParams);
              foreach ($assignmentEventStmt as $assignmentEventRow) {
                  $assignmentEventTimes[(int)$assignmentEventRow['booking_id']] = $assignmentEventRow['assigned_at'] ?: null;
              }
          }

          if (!empty($completedStatuses)) {
              $completionStatusPlaceholders = [];
              $completionStatusParams = $bookingIdParams;
              foreach ($completedStatuses as $idx => $statusValue) {
                  $key = 'completion_event_status_' . $idx;
                  $completionStatusPlaceholders[] = ':' . $key;
                  $completionStatusParams[$key] = $statusValue;
              }
              $completionEventStmt = $pdo->prepare(
                  "SELECT booking_id, MIN(occurred_at) AS completed_at
                   FROM booking_status_events
                   WHERE booking_id IN (" . implode(',', $bookingIdPlaceholders) . ")
                     AND status IN (" . implode(',', $completionStatusPlaceholders) . ")
                   GROUP BY booking_id"
              );
              $completionEventStmt->execute($completionStatusParams);
              foreach ($completionEventStmt as $completionEventRow) {
                  $completionEventTimes[(int)$completionEventRow['booking_id']] = $completionEventRow['completed_at'] ?: null;
              }
          }
      }

      $resolveOnTimeTargetMinutes = function ($etaMinutes, $serviceType) {
          $etaValue = is_numeric($etaMinutes) ? (int)$etaMinutes : 0;
          if ($etaValue > 0) {
              return $etaValue;
          }
          $service = strtolower(trim((string)$serviceType));
          if ($service === 'express') {
              return 180;
          }
          if ($service === 'same-day') {
              return 360;
          }
          if ($service === 'next-day') {
              return 1440;
          }
          if ($service === 'scheduled') {
              return 1440;
          }
          return 4320;
      };

      $totalAssigned = 0;
      $completedCount = 0;
      $onTimeCount = 0;
      foreach ($assignedRows as $row) {
          $totalAssigned += 1;
          $bookingId = (int)($row['id'] ?? 0);
          $status = $row['status'];
          $completed = in_array($status, $completedStatuses, true);
          if ($completed) {
              $completedCount += 1;
              $deadline = $row['delivery_deadline'] ?? null;
              $completedAtRaw = $completionEventTimes[$bookingId] ?? ($row['updated_at'] ?: $row['created_at']);
              $startedAtRaw = $assignmentEventTimes[$bookingId] ?? ($row['created_at'] ?: null);
              if ($deadline && $completedAtRaw) {
                  try {
                      $deadlineTime = new DateTimeImmutable($deadline);
                      $completedAt = new DateTimeImmutable($completedAtRaw);
                      if ($completedAt <= $deadlineTime) {
                          $onTimeCount += 1;
                      }
                  } catch (Throwable $e) {
                  }
              } elseif ($startedAtRaw && $completedAtRaw) {
                  try {
                      $startedAt = new DateTimeImmutable($startedAtRaw);
                      $completedAt = new DateTimeImmutable($completedAtRaw);
                      $elapsedMinutes = (int)floor(($completedAt->getTimestamp() - $startedAt->getTimestamp()) / 60);
                      $targetMinutes = $resolveOnTimeTargetMinutes($row['eta_minutes'] ?? null, $row['service_type'] ?? null);
                      if ($elapsedMinutes >= 0 && $elapsedMinutes <= $targetMinutes) {
                          $onTimeCount += 1;
                      }
                  } catch (Throwable $e) {
                  }
              }
          }
      }

      $completionRate = $totalAssigned > 0 ? round(($completedCount / $totalAssigned) * 100) : 0;
      $onTimeRate = $completedCount > 0 ? round(($onTimeCount / $completedCount) * 100) : 0;

      $ratingStmt = $pdo->prepare(
          "SELECT COALESCE(NULLIF(courier_profiles.rating, 0), ratings_agg.avg_rating, 0) AS avg_rating,
                  COALESCE(ratings_agg.total_reviews, 0) AS total_reviews
           FROM users
           LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
           LEFT JOIN (
                SELECT courier_id, AVG(rating) AS avg_rating, COUNT(*) AS total_reviews
                FROM ratings
                GROUP BY courier_id
           ) AS ratings_agg ON ratings_agg.courier_id = users.id
           WHERE users.id = :id
           LIMIT 1"
      );
      $ratingStmt->execute(['id' => $userId]);
      $ratingRow = $ratingStmt->fetch();
      $avgRating = $ratingRow && $ratingRow['avg_rating'] !== null ? (float)$ratingRow['avg_rating'] : 0.0;
      $totalReviews = $ratingRow ? (int)$ratingRow['total_reviews'] : 0;
      $customerRatingScore = $avgRating > 0 ? round(($avgRating / 5) * 100) : 0;
      $efficiencyScore = (int)round(($completionRate * 0.5) + ($onTimeRate * 0.5));
      $overallScore = (int)round(($customerRatingScore * 0.4) + ($completionRate * 0.3) + ($onTimeRate * 0.3));
      $achievements = [
          [
              'name' => 'First Run',
              'icon' => 'CheckCircle2',
              'unlocked' => $completedCount >= 1
          ],
          [
              'name' => 'Reliable',
              'icon' => 'Shield',
              'unlocked' => $completionRate >= 90 && $totalAssigned >= 5
          ],
          [
              'name' => 'On-Time Pro',
              'icon' => 'Clock',
              'unlocked' => $onTimeRate >= 80 && $completedCount >= 5
          ],
          [
              'name' => 'Top Rated',
              'icon' => 'Star',
              'unlocked' => $avgRating >= 4.5 && $totalReviews >= 5
          ]
      ];
      $suggestions = [];
      if ($totalAssigned <= 0) {
          $suggestions[] = 'Accept new assignments to start building your performance profile.';
      } else {
          if ($completionRate < 90) {
              $suggestions[] = 'Close assigned jobs before shift end to improve completion rate.';
          }
          if ($onTimeRate < 80) {
              $suggestions[] = 'Confirm load and start transit earlier to improve on-time delivery.';
          }
          if ($avgRating > 0 && $avgRating < 4.5) {
              $suggestions[] = 'Share ETA updates and delivery proof to boost customer rating.';
          }
          if ($totalReviews < 5) {
              $suggestions[] = 'Complete more deliveries to collect enough reviews for stable rating trends.';
          }
      }
      if (empty($suggestions)) {
          $suggestions[] = 'Great consistency. Keep this pace to maintain top-tier performance.';
      }

      $milestones = [
        ['count' => 5, 'bonus' => 100],
        ['count' => 10, 'bonus' => 300],
        ['count' => 15, 'bonus' => 600]
      ];

      $calcBonuses = function ($count) use ($milestones) {
        $bonusTotal = 0.0;
        foreach ($milestones as $milestone) {
            if ($count >= $milestone['count']) {
                $bonusTotal += $milestone['bonus'];
            }
        }
        $next = null;
        foreach ($milestones as $milestone) {
            if ($count < $milestone['count']) {
                $next = $milestone;
                break;
            }
        }
        if (!$next) {
            return [
                'bonusTotal' => $bonusTotal,
                'next' => ['remaining' => 0, 'bonus' => 0, 'progress' => 100]
            ];
        }
        $progress = (int)round(($count / $next['count']) * 100);
        return [
            'bonusTotal' => $bonusTotal,
            'next' => [
                'remaining' => $next['count'] - $count,
                'bonus' => $next['bonus'],
                'progress' => min(100, max(0, $progress))
            ]
        ];
      };

      $dailyBonusData = $calcBonuses($dailyCount);
      $weeklyBonusData = $calcBonuses($weeklyCount);
      $monthlyBonusData = $calcBonuses($monthlyCount);
      $dailyBonuses = $dailyBonusData['bonusTotal'];
      $weeklyBonuses = $weeklyBonusData['bonusTotal'];
      $monthlyBonuses = $monthlyBonusData['bonusTotal'];

      $dailyTotal += $dailyBonuses;
      $weeklyTotal += $weeklyBonuses;
      $monthlyTotal += $monthlyBonuses;

      $buildBreakdown = function ($breakdown, $count, $total) {
        $safeTotal = $total > 0 ? $total : 1;
        return [
            [
                'type' => 'Base Pay',
                'count' => $count,
                'amount' => $breakdown['base'],
                'percentage' => (int)round(($breakdown['base'] / $safeTotal) * 100),
                'icon' => 'Wallet'
            ],
            [
                'type' => 'Distance Pay',
                'count' => $count,
                'amount' => $breakdown['distance'],
                'percentage' => (int)round(($breakdown['distance'] / $safeTotal) * 100),
                'icon' => 'MapPin'
            ],
            [
                'type' => 'Weight Pay',
                'count' => $count,
                'amount' => $breakdown['weight'],
                'percentage' => (int)round(($breakdown['weight'] / $safeTotal) * 100),
                'icon' => 'Weight'
            ],
            [
                'type' => 'Extras',
                'count' => $count,
                'amount' => $breakdown['extras'],
                'percentage' => (int)round(($breakdown['extras'] / $safeTotal) * 100),
                'icon' => 'Zap'
            ]
        ];
      };

      $timeStmt = $pdo->prepare(
          'SELECT worked_minutes, break_minutes
           FROM courier_time_logs
           WHERE courier_id = :id AND shift_date = CURDATE()'
      );
      $timeStmt->execute(['id' => $userId]);
      $timeRow = $timeStmt->fetch();
      $workedMinutes = $timeRow ? (int)$timeRow['worked_minutes'] : 0;
      $breakMinutes = $timeRow ? (int)$timeRow['break_minutes'] : 0;

      $assignmentStatusPlaceholders = [];
      $assignmentEventParams = ['id' => $userId];
      foreach ($assignmentEventStatuses as $idx => $statusValue) {
          $key = 'assign_status_' . $idx;
          $assignmentStatusPlaceholders[] = ':' . $key;
          $assignmentEventParams[$key] = $statusValue;
      }
      if (!$assignmentStatusPlaceholders) {
          $assignmentStatusPlaceholders[] = ':assign_status_fallback';
          $assignmentEventParams['assign_status_fallback'] = 'delivery_assigned';
      }

      $assignedTodayEventsStmt = $pdo->prepare(
          "SELECT COUNT(DISTINCT booking_status_events.booking_id) AS total
           FROM booking_status_events
           JOIN bookings ON bookings.id = booking_status_events.booking_id
           WHERE {$assignmentCondition}
             AND booking_status_events.status IN (" . implode(',', $assignmentStatusPlaceholders) . ")
             AND DATE(booking_status_events.occurred_at) = CURDATE()"
      );
      $assignedTodayEventsStmt->execute($assignmentEventParams);
      $deliveriesTodayFromEvents = (int)($assignedTodayEventsStmt->fetch()['total'] ?? 0);

      $assignmentLogParams = ['id' => $userId];
      $assignmentLogPlaceholders = [];
      foreach ($assignmentEventStatuses as $idx => $statusValue) {
          $key = 'assign_log_status_' . $idx;
          $assignmentLogPlaceholders[] = ':' . $key;
          $assignmentLogParams[$key] = $statusValue;
      }
      if (!$assignmentLogPlaceholders) {
          $assignmentLogPlaceholders[] = ':assign_log_status_fallback';
          $assignmentLogParams['assign_log_status_fallback'] = 'delivery_assigned';
      }
      $assignedTodayLogsStmt = $pdo->prepare(
          "SELECT COUNT(DISTINCT booking_status_logs.booking_id) AS total
           FROM booking_status_logs
           WHERE booking_status_logs.courier_id = :id
             AND booking_status_logs.status IN (" . implode(',', $assignmentLogPlaceholders) . ")
             AND DATE(booking_status_logs.occurred_at) = CURDATE()"
      );
      $assignedTodayLogsStmt->execute($assignmentLogParams);
      $deliveriesTodayFromLogs = (int)($assignedTodayLogsStmt->fetch()['total'] ?? 0);

      $deliveriesToday = $deliveriesTodayFromEvents > 0 ? $deliveriesTodayFromEvents : $deliveriesTodayFromLogs;

      $incidentDecisions = [];
      if (cancellation_requests_table_supported($pdo)) {
          try {
              $incidentDecisionStmt = $pdo->prepare(
                  "SELECT cancellation_requests.id, cancellation_requests.order_id, cancellation_requests.reason,
                          cancellation_requests.notes, cancellation_requests.status, cancellation_requests.decided_at,
                          cancellation_requests.admin_note, bookings.booking_code
                   FROM cancellation_requests
                   JOIN bookings ON bookings.id = cancellation_requests.order_id
                   WHERE cancellation_requests.actor_courier_id = :id
                     AND cancellation_requests.type = 'pickup'
                     AND cancellation_requests.status IN ('approved', 'rejected')
                     AND cancellation_requests.decided_at IS NOT NULL
                   ORDER BY cancellation_requests.decided_at DESC, cancellation_requests.id DESC
                   LIMIT 20"
              );
              $incidentDecisionStmt->execute(['id' => $userId]);
              foreach ($incidentDecisionStmt as $decisionRow) {
                  $incidentDecisions[] = [
                      'requestId' => (int)$decisionRow['id'],
                      'bookingId' => (int)$decisionRow['order_id'],
                      'bookingCode' => $decisionRow['booking_code'] ?: null,
                      'status' => strtolower(trim((string)($decisionRow['status'] ?? ''))),
                      'reason' => trim((string)($decisionRow['reason'] ?? '')),
                      'notes' => trim((string)($decisionRow['notes'] ?? '')),
                      'adminNote' => trim((string)($decisionRow['admin_note'] ?? '')),
                      'decidedAt' => $decisionRow['decided_at'] ?: null
                  ];
              }
          } catch (Throwable $e) {
              $incidentDecisions = [];
          }
      }

      json_response([
          'deliveries' => $deliveries,
          'activeDelivery' => $activeDelivery,
          'vehicle' => $vehicle,
          'incidentDecisions' => $incidentDecisions,
          'todayStats' => [
              'workedMinutes' => $workedMinutes,
              'breakMinutes' => $breakMinutes,
              'deliveriesToday' => $deliveriesToday
          ],
          'earnings' => [
            'daily' => [
                'total' => $dailyTotal,
                'growth' => 0,
                'base' => $dailyBase,
                'bonuses' => $dailyBonuses,
                'deliveries' => $dailyCount,
                'breakdown' => $buildBreakdown($dailyBreakdown, $dailyCount, $dailyTotal),
                'nextMilestone' => [
                    'remaining' => $dailyBonusData['next']['remaining'],
                    'bonus' => $dailyBonusData['next']['bonus'],
                    'progress' => $dailyBonusData['next']['progress']
                ]
            ],
            'weekly' => [
                'total' => $weeklyTotal,
                'growth' => 0,
                'base' => $weeklyBase,
                'bonuses' => $weeklyBonuses,
                'deliveries' => $weeklyCount,
                'breakdown' => $buildBreakdown($weeklyBreakdown, $weeklyCount, $weeklyTotal),
                'nextMilestone' => [
                    'remaining' => $weeklyBonusData['next']['remaining'],
                    'bonus' => $weeklyBonusData['next']['bonus'],
                    'progress' => $weeklyBonusData['next']['progress']
                ]
            ],
            'monthly' => [
                'total' => $monthlyTotal,
                'growth' => 0,
                'base' => $monthlyBase,
                'bonuses' => $monthlyBonuses,
                'deliveries' => $monthlyCount,
                'breakdown' => $buildBreakdown($monthlyBreakdown, $monthlyCount, $monthlyTotal),
                'nextMilestone' => [
                    'remaining' => $monthlyBonusData['next']['remaining'],
                    'bonus' => $monthlyBonusData['next']['bonus'],
                    'progress' => $monthlyBonusData['next']['progress']
                ]
            ]
        ],
        'performance' => [
            'overallScore' => $overallScore ?? 0,
            'customerRating' => $avgRating ?? 0,
            'totalReviews' => $totalReviews ?? 0,
            'completionRate' => $completionRate ?? 0,
            'onTimeRate' => $onTimeRate ?? 0,
            'efficiencyScore' => $efficiencyScore ?? 0,
            'achievements' => $achievements,
            'suggestions' => $suggestions
        ]
    ]);
}

if ($path === '/api/dashboard/admin' && $method === 'GET') {
    $revenueStmt = $pdo->query('SELECT COALESCE(SUM(total), 0) AS revenue FROM payments');
    $revenue = (float)($revenueStmt->fetch()['revenue'] ?? 0);

    $activeStmt = $pdo->query(
        "SELECT COUNT(*) AS total FROM bookings
         WHERE status IN ('pickup_assigned','picked_up','in_transit_to_origin_branch','received_at_origin_branch','linehaul_assigned','linehaul_load_confirmed','linehaul_in_transit','received_at_destination_branch','delivery_assigned','delivery_load_confirmed','out_for_delivery','delivery_attempt_failed','waiting_for_reattempt','rts_pending')"
    );
    $activeDeliveries = (int)($activeStmt->fetch()['total'] ?? 0);

    $usersStmt = $pdo->query('SELECT COUNT(*) AS total FROM users');
    $totalUsers = (int)($usersStmt->fetch()['total'] ?? 0);

    $avgStmt = $pdo->query("SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, updated_at)) AS avg_minutes FROM bookings WHERE status = 'delivered'");
    $avgMinutes = (float)($avgStmt->fetch()['avg_minutes'] ?? 0);

    json_response([
        'metrics' => [
            'totalRevenue' => $revenue,
            'activeDeliveries' => $activeDeliveries,
            'totalUsers' => $totalUsers,
            'avgResponseMinutes' => $avgMinutes
        ]
    ]);
}

if (preg_match('#^/api/courier/bookings/(\d+)/proof$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? 0);
    $notes = trim((string)($payload['notes'] ?? ''));
    $photoDataUrl = trim((string)($payload['photoDataUrl'] ?? ''));
    $signatureDataUrl = trim((string)($payload['signatureDataUrl'] ?? ''));

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }
    if ($photoDataUrl === '' && $signatureDataUrl === '' && $notes === '') {
        json_response(['error' => 'Provide at least one proof field'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, status, courier_id
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    if ((int)$booking['courier_id'] !== $courierId) {
        json_response(['error' => 'Access denied'], 403);
    }
    if (!in_array($booking['status'], ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivered'], true)) {
        json_response(['error' => 'Proof can only be captured during delivery'], 422);
    }

    $existingProofStmt = $pdo->prepare(
        'SELECT id, photo_url, signature_url, notes
         FROM proofs
         WHERE booking_id = :id
         ORDER BY created_at DESC, id DESC
         LIMIT 1'
    );
    $existingProofStmt->execute(['id' => $bookingId]);
    $existingProof = $existingProofStmt->fetch();

    $photoUrl = $existingProof['photo_url'] ?? null;
    $signatureUrl = $existingProof['signature_url'] ?? null;
    $proofNotes = $notes !== '' ? $notes : ($existingProof['notes'] ?? null);

    if ($photoDataUrl !== '') {
        $savedPhotoUrl = save_proof_image_from_data_url($photoDataUrl, $bookingId, 'photo');
        if ($savedPhotoUrl === null) {
            json_response(['error' => 'Invalid photo proof image'], 422);
        }
        $photoUrl = $savedPhotoUrl;
    }

    if ($signatureDataUrl !== '') {
        $savedSignatureUrl = save_proof_image_from_data_url($signatureDataUrl, $bookingId, 'signature');
        if ($savedSignatureUrl === null) {
            json_response(['error' => 'Invalid signature proof image'], 422);
        }
        $signatureUrl = $savedSignatureUrl;
    }

    if ($existingProof) {
        $updateProofStmt = $pdo->prepare(
            'UPDATE proofs
             SET photo_url = :photo_url, signature_url = :signature_url, notes = :notes
             WHERE id = :id'
        );
        $updateProofStmt->execute([
            'photo_url' => $photoUrl,
            'signature_url' => $signatureUrl,
            'notes' => $proofNotes,
            'id' => (int)$existingProof['id']
        ]);
    } else {
        $insertProofStmt = $pdo->prepare(
            'INSERT INTO proofs (booking_id, photo_url, signature_url, notes)
             VALUES (:booking_id, :photo_url, :signature_url, :notes)'
        );
        $insertProofStmt->execute([
            'booking_id' => $bookingId,
            'photo_url' => $photoUrl,
            'signature_url' => $signatureUrl,
            'notes' => $proofNotes
        ]);
    }

    json_response([
        'message' => 'Proof saved',
        'proof' => [
            'bookingId' => $bookingId,
            'photoUrl' => $photoUrl,
            'signatureUrl' => $signatureUrl,
            'notes' => $proofNotes
        ]
    ]);
}

if (preg_match('#^/api/courier/bookings/(\d+)/status$#', $path, $matches) && $method === 'PATCH') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? 0);
    $status = trim((string)($payload['status'] ?? ''));
    $description = trim((string)($payload['description'] ?? ''));
    $locationText = trim((string)($payload['locationText'] ?? ''));
    $lat = to_decimal_or_null($payload['lat'] ?? null);
    $lng = to_decimal_or_null($payload['lng'] ?? null);

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }

    $courierRoleStmt = $pdo->prepare('SELECT courier_role FROM courier_profiles WHERE user_id = :id');
    $courierRoleStmt->execute(['id' => $courierId]);
    $courierRoleRow = $courierRoleStmt->fetch();
    $courierRole = $courierRoleRow ? ($courierRoleRow['courier_role'] ?: 'delivery') : 'delivery';

    $allowedStatuses = $courierRole === 'pickup'
        ? ['picked_up', 'in_transit_to_origin_branch']
        : ($courierRole === 'linehaul'
            ? ['linehaul_in_transit']
            : ($courierRole === 'both'
                ? ['picked_up', 'in_transit_to_origin_branch', 'linehaul_in_transit', 'out_for_delivery', 'delivered']
                : ['out_for_delivery', 'delivered']));
    if (!in_array($status, $allowedStatuses, true)) {
        json_response(['error' => 'Invalid status'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.status, bookings.courier_id, bookings.requires_linehaul,
                bookings.current_branch_id, bookings.destination_branch_id,
                pickup.city AS pickup_city, delivery.city AS delivery_city
         FROM bookings
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    if ((int)$booking['courier_id'] !== $courierId) {
        json_response(['error' => 'Access denied'], 403);
    }

    $isIntercity = booking_is_intercity($booking);
    $currentStatus = normalize_booking_status_code((string)$booking['status']);
    if (!can_transition_status($currentStatus, $status, $isIntercity)) {
        json_response(['error' => 'Invalid status transition'], 422);
    }
    if ($status === 'out_for_delivery' && $currentStatus !== 'delivery_load_confirmed') {
        json_response(['error' => 'Load confirmation is required before out_for_delivery'], 422);
    }
    if ($status === 'linehaul_in_transit' && $currentStatus !== 'linehaul_load_confirmed') {
        json_response(['error' => 'Load confirmation is required before linehaul_in_transit'], 422);
    }

    $setParts = ['status = :status'];
    $params = ['status' => $status, 'id' => $bookingId];
    foreach (booking_status_side_effect_sql($status) as $part) {
        $setParts[] = $part;
    }
    if (in_array($status, ['picked_up', 'in_transit_to_origin_branch'], true)) {
        $setParts[] = 'pickup_courier_id = COALESCE(pickup_courier_id, :pickup_courier_id)';
        $params['pickup_courier_id'] = $courierId;
    } elseif ($status === 'linehaul_in_transit') {
        $setParts[] = 'linehaul_courier_id = COALESCE(linehaul_courier_id, :linehaul_courier_id)';
        $params['linehaul_courier_id'] = $courierId;
    } elseif (in_array($status, ['out_for_delivery', 'delivered'], true)) {
        $setParts[] = 'delivery_courier_id = COALESCE(delivery_courier_id, :delivery_courier_id)';
        $params['delivery_courier_id'] = $courierId;
    }

    $pdo->prepare('UPDATE bookings SET ' . implode(', ', $setParts) . ' WHERE id = :id')->execute($params);

    $paymentResponse = null;
    if ($status === 'picked_up') {
        $paymentStmt = $pdo->prepare(
            'SELECT id, method, status, total, provider_payload, paid_at
             FROM payments
             WHERE booking_id = :id
             ORDER BY id DESC
             LIMIT 1'
        );
        $paymentStmt->execute(['id' => $bookingId]);
        $payment = $paymentStmt->fetch();
        if ($payment) {
            $paymentMethod = strtolower(trim((string)($payment['method'] ?? '')));
            $paymentStatus = strtolower(trim((string)($payment['status'] ?? '')));
            $paidAt = $payment['paid_at'] ?? null;
            if ($paymentMethod === 'cash' && $paymentStatus === 'pending') {
                $providerPayload = [];
                $providerPayloadRaw = trim((string)($payment['provider_payload'] ?? ''));
                if ($providerPayloadRaw !== '') {
                    $decodedPayload = json_decode($providerPayloadRaw, true);
                    if (is_array($decodedPayload)) {
                        $providerPayload = $decodedPayload;
                    }
                }
                $collectedAt = date('Y-m-d H:i:s');
                $providerPayload['cashCollection'] = [
                    'collected' => true,
                    'collectedAt' => $collectedAt,
                    'collectedByCourierId' => $courierId,
                    'bookingStatus' => $status
                ];
                $paymentUpdateStmt = $pdo->prepare(
                    "UPDATE payments
                     SET status = 'paid',
                         paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
                         provider_payload = :provider_payload
                     WHERE id = :id
                       AND status = 'pending'"
                );
                $paymentUpdateStmt->execute([
                    'provider_payload' => json_encode($providerPayload),
                    'id' => (int)$payment['id']
                ]);
                if ($paymentUpdateStmt->rowCount() > 0) {
                    $paymentStatus = 'paid';
                    $paidAt = $paidAt ?: $collectedAt;
                    write_order_event(
                        $pdo,
                        $bookingId,
                        $status,
                        'courier',
                        $courierId,
                        [
                            'action' => 'cash_collected',
                            'paymentId' => (int)$payment['id'],
                            'paymentMethod' => 'cash',
                            'paymentStatus' => 'paid',
                            'amount' => $payment['total'] !== null ? (float)$payment['total'] : null
                        ],
                        'Cash on pickup collected by courier'
                    );
                }
            }
            $paymentResponse = [
                'id' => (int)$payment['id'],
                'method' => $paymentMethod !== '' ? $paymentMethod : null,
                'status' => $paymentStatus !== '' ? $paymentStatus : null,
                'total' => $payment['total'] !== null ? (float)$payment['total'] : null,
                'collectedAt' => $paidAt
            ];
        }
    }

    $descriptionMap = [
        'picked_up' => 'Package picked up',
        'in_transit_to_origin_branch' => 'Package in transit to origin branch',
        'linehaul_in_transit' => 'Package moving between branches',
        'out_for_delivery' => 'Out for delivery',
        'delivered' => 'Package delivered',
        'cancelled' => 'Booking cancelled'
    ];
    $eventDescription = $description !== '' ? $description : ($descriptionMap[$status] ?? 'Status updated');
    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description, location_text, lat, lng)
         VALUES (:booking_id, :status, :description, :location_text, :lat, :lng)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => $status,
        'description' => $eventDescription,
        'location_text' => $locationText !== '' ? $locationText : null,
        'lat' => $lat,
        'lng' => $lng
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        $status,
        'courier',
        $courierId,
        [
            'locationText' => $locationText !== '' ? $locationText : null,
            'lat' => $lat,
            'lng' => $lng
        ],
        $eventDescription
    );

    if (in_array($status, ['delivered', 'cancelled'], true)) {
        clear_routes_if_courier_complete($pdo, $courierId);
    }

    json_response([
        'message' => 'Status updated',
        'booking' => [
            'id' => $bookingId,
            'status' => $status
        ],
        'payment' => $paymentResponse
    ]);
}

if (preg_match('#^/api/courier/bookings/(\d+)/incident$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? 0);
    $type = strtolower(trim((string)($payload['type'] ?? '')));
    $actionContext = strtolower(trim((string)($payload['actionContext'] ?? '')));
    $reasonCode = strtolower(trim((string)($payload['reasonCode'] ?? '')));
    $reasonText = trim((string)($payload['reasonText'] ?? ''));
    $notes = trim((string)($payload['notes'] ?? ''));
    $locationText = trim((string)($payload['locationText'] ?? ''));
    $lat = to_decimal_or_null($payload['lat'] ?? null);
    $lng = to_decimal_or_null($payload['lng'] ?? null);

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }
    if (!in_array($type, ['pickup_cancellation', 'delivery_cancellation', 'delivery_failure'], true)) {
        json_response(['error' => 'Invalid incident type'], 422);
    }
    if (!in_array($actionContext, ['dashboard', 'navigation'], true)) {
        json_response(['error' => 'Invalid action context'], 422);
    }
    if (!cancellation_reason_allowed($type, $reasonCode)) {
        json_response(['error' => 'Valid reasonCode is required'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status, customer_id, courier_id, pickup_courier_id, delivery_courier_id,
                current_branch_id, origin_branch_id, destination_branch_id
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $status = normalize_booking_status_code((string)$booking['status']);
    $assignedCourierIds = [];
    if ($type === 'pickup_cancellation') {
        $assignedCourierIds = [
            (int)($booking['pickup_courier_id'] ?? 0),
            (int)($booking['courier_id'] ?? 0)
        ];
        if ($status !== 'pickup_assigned') {
            json_response(['error' => 'Pickup cancellation is only allowed during pickup_assigned'], 422);
        }
    } elseif ($type === 'delivery_cancellation') {
        $assignedCourierIds = [
            (int)($booking['delivery_courier_id'] ?? 0),
            (int)($booking['courier_id'] ?? 0)
        ];
        if ($status !== 'delivery_assigned') {
            json_response(['error' => 'Delivery cancellation is only allowed during delivery_assigned'], 422);
        }
        if ($actionContext !== 'dashboard') {
            json_response(['error' => 'Delivery cancellation can only be submitted from dashboard'], 422);
        }
    } else {
        $assignedCourierIds = [
            (int)($booking['delivery_courier_id'] ?? 0),
            (int)($booking['courier_id'] ?? 0)
        ];
        if ($status !== 'out_for_delivery') {
            json_response(['error' => 'Delivery failure can only be reported while out_for_delivery'], 422);
        }
        if ($actionContext !== 'navigation') {
            json_response(['error' => 'Delivery failure can only be submitted from navigation'], 422);
        }
    }
    $assignedCourierIds = array_values(array_unique(array_filter($assignedCourierIds, function ($value) {
        return (int)$value > 0;
    })));
    if (!in_array($courierId, $assignedCourierIds, true)) {
        json_response(['error' => 'Access denied'], 403);
    }

    $resolvedReasonText = $reasonText !== '' ? $reasonText : cancellation_reason_label($type, $reasonCode);
    $pickupCancellationRequestId = null;
    if ($type === 'pickup_cancellation' && cancellation_requests_table_supported($pdo)) {
        $existingPendingStmt = $pdo->prepare(
            "SELECT id
             FROM cancellation_requests
             WHERE order_id = :order_id
               AND type = 'pickup'
               AND status = 'pending'
             ORDER BY id DESC
             LIMIT 1"
        );
        $existingPendingStmt->execute(['order_id' => $bookingId]);
        $existingPendingRequestId = (int)($existingPendingStmt->fetchColumn() ?: 0);
        if ($existingPendingRequestId > 0) {
            json_response(['error' => 'A pickup cancellation request is already pending for this order'], 409);
        }

        $requestInsert = $pdo->prepare(
            "INSERT INTO cancellation_requests (
                order_id, type, reason, notes, context, actor_courier_id, status
            ) VALUES (
                :order_id, 'pickup', :reason, :notes, :context, :actor_courier_id, 'pending'
            )"
        );
        $requestInsert->execute([
            'order_id' => $bookingId,
            'reason' => $resolvedReasonText,
            'notes' => $notes !== '' ? $notes : null,
            'context' => $actionContext !== '' ? $actionContext : null,
            'actor_courier_id' => $courierId
        ]);
        $pickupCancellationRequestId = (int)$pdo->lastInsertId();
    }

    $descriptionParts = [
        sprintf('Courier incident (%s): %s', $type, $resolvedReasonText),
        'Context: ' . $actionContext
    ];
    if ($notes !== '') {
        $descriptionParts[] = 'Notes: ' . $notes;
    }
    $eventDescription = implode(' | ', $descriptionParts);
    $incidentStatus = $status;
    $finalBookingStatus = $status;
    $returnBranchId = 0;
    if ($type === 'delivery_failure') {
        $incidentStatus = 'delivery_attempt_failed';
        $finalBookingStatus = 'delivery_attempt_failed';
        $returnBranchId = (int)($booking['destination_branch_id'] ?? 0);
        if ($returnBranchId <= 0) {
            $returnBranchId = (int)($booking['origin_branch_id'] ?? 0);
        }
        if ($returnBranchId <= 0) {
            $returnBranchId = (int)($booking['current_branch_id'] ?? 0);
        }

        $setParts = [
            'status = :status'
        ];
        $updateParams = [
            'status' => $finalBookingStatus,
            'id' => $bookingId
        ];
        $pdo->prepare('UPDATE bookings SET ' . implode(', ', $setParts) . ' WHERE id = :id')
            ->execute($updateParams);
    }

    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description, location_text, lat, lng)
         VALUES (:booking_id, :status, :description, :location_text, :lat, :lng)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => $incidentStatus,
        'description' => $eventDescription,
        'location_text' => $locationText !== '' ? $locationText : null,
        'lat' => $lat,
        'lng' => $lng
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        $incidentStatus,
        'courier',
        $courierId,
        [
            'action' => $type,
            'requestId' => $pickupCancellationRequestId,
            'reasonCode' => $reasonCode,
            'reasonText' => $resolvedReasonText,
            'notes' => $notes !== '' ? $notes : null,
            'decisionStatus' => 'pending',
            'decisionReasonCode' => null,
            'decisionReasonText' => null,
            'decisionNotes' => null,
            'decisionAt' => null,
            'decisionBy' => null,
            'actionContext' => $actionContext,
            'locationText' => $locationText !== '' ? $locationText : null,
            'lat' => $lat,
            'lng' => $lng,
            'requiresAdminReview' => true,
            'returnBranchId' => $type === 'delivery_failure' && $returnBranchId > 0 ? $returnBranchId : null
        ],
        $eventDescription
    );

    $bookingCode = trim((string)($booking['booking_code'] ?? ''));
    $incidentLabel = format_code_label($type);
    add_system_alert(
        $pdo,
        'shipment',
        'Courier Incident Reported',
        sprintf(
            '%s | %s | %s',
            $bookingCode !== '' ? $bookingCode : ('Booking #' . $bookingId),
            $incidentLabel,
            $resolvedReasonText
        ),
        'Review order and complete final cancellation only after customer confirmation.'
    );

    if ((int)$booking['customer_id'] > 0) {
        $customerMessage = sprintf(
            '%s reported for your booking. Reason: %s. Admin will review next steps.',
            $incidentLabel,
            $resolvedReasonText
        );
        if ($notes !== '') {
            $customerMessage .= ' Notes: ' . $notes;
        }
        insert_booking_message(
            $pdo,
            $bookingId,
            $courierId,
            'courier',
            (int)$booking['customer_id'],
            'customer',
            $customerMessage
        );
    }

    $responseMessage = $type === 'delivery_failure'
        ? 'Delivery failure reported. Parcel stays on vehicle until branch handover is confirmed, and admin review has been requested.'
        : 'Cancellation request submitted. Admin review has been requested.';

    json_response([
        'message' => $responseMessage,
        'incident' => [
            'bookingId' => $bookingId,
            'type' => $type,
            'requestId' => $pickupCancellationRequestId,
            'actionContext' => $actionContext,
            'reasonCode' => $reasonCode,
            'reasonText' => $resolvedReasonText,
            'status' => $finalBookingStatus
        ]
    ], 201);
}

if (preg_match('#^/api/orders/(\d+)/delivery/confirm-load$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? $payload['actorId'] ?? 0);
    $description = trim((string)($payload['description'] ?? 'Delivery load confirmed by courier'));

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, status, delivery_courier_id
         FROM bookings
         WHERE id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    if ((int)($booking['delivery_courier_id'] ?? 0) !== $courierId) {
        json_response(['error' => 'Only assigned delivery courier can confirm load'], 403);
    }
    if ($booking['status'] !== 'delivery_assigned') {
        json_response(['error' => 'Load confirmation allowed only from delivery_assigned'], 422);
    }

    $setParts = ['status = :status'];
    foreach (booking_status_side_effect_sql('delivery_load_confirmed') as $part) {
        $setParts[] = $part;
    }
    $pdo->prepare('UPDATE bookings SET ' . implode(', ', $setParts) . ' WHERE id = :id')
        ->execute([
            'status' => 'delivery_load_confirmed',
            'id' => $bookingId
        ]);

    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => 'delivery_load_confirmed',
        'description' => $description !== '' ? $description : 'Delivery load confirmed by courier'
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        'delivery_load_confirmed',
        'courier',
        $courierId,
        ['checkpoint' => 'delivery_load_confirmed'],
        $description
    );

    json_response([
        'message' => 'Delivery load confirmed',
        'booking' => [
            'id' => $bookingId,
            'status' => 'delivery_load_confirmed'
        ]
    ]);
}

if (preg_match('#^/api/orders/(\d+)/linehaul/confirm-load$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? $payload['actorId'] ?? 0);
    $description = trim((string)($payload['description'] ?? 'Linehaul load confirmed by courier'));

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.status, bookings.linehaul_courier_id, bookings.requires_linehaul,
                bookings.current_branch_id, bookings.destination_branch_id,
                pickup.city AS pickup_city, delivery.city AS delivery_city
         FROM bookings
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    if (!booking_is_intercity($booking)) {
        json_response(['error' => 'Linehaul load confirmation is only for inter-city orders'], 422);
    }
    if ((int)($booking['linehaul_courier_id'] ?? 0) !== $courierId) {
        json_response(['error' => 'Only assigned linehaul courier can confirm load'], 403);
    }
    if ($booking['status'] !== 'linehaul_assigned') {
        json_response(['error' => 'Load confirmation allowed only from linehaul_assigned'], 422);
    }

    $setParts = ['status = :status'];
    foreach (booking_status_side_effect_sql('linehaul_load_confirmed') as $part) {
        $setParts[] = $part;
    }
    $pdo->prepare('UPDATE bookings SET ' . implode(', ', $setParts) . ' WHERE id = :id')
        ->execute([
            'status' => 'linehaul_load_confirmed',
            'id' => $bookingId
        ]);

    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => 'linehaul_load_confirmed',
        'description' => $description !== '' ? $description : 'Linehaul load confirmed by courier'
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        'linehaul_load_confirmed',
        'courier',
        $courierId,
        ['checkpoint' => 'linehaul_load_confirmed'],
        $description
    );

    json_response([
        'message' => 'Linehaul load confirmed',
        'booking' => [
            'id' => $bookingId,
            'status' => 'linehaul_load_confirmed'
        ]
    ]);
}

if (preg_match('#^/api/orders/(\d+)/branch/confirm-receipt$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $stage = strtolower(trim((string)($payload['stage'] ?? '')));
    $actorType = normalize_actor_type($payload['actorType'] ?? 'branch');
    $actorId = isset($payload['actorId']) ? (int)$payload['actorId'] : null;
    $description = trim((string)($payload['description'] ?? ''));
    $locationText = trim((string)($payload['locationText'] ?? ''));
    $lat = to_decimal_or_null($payload['lat'] ?? null);
    $lng = to_decimal_or_null($payload['lng'] ?? null);

    if (!in_array($stage, ['origin', 'destination'], true)) {
        json_response(['error' => 'stage must be origin or destination'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.status, bookings.service_type, bookings.requires_linehaul,
                bookings.current_branch_id, bookings.origin_branch_id, bookings.destination_branch_id,
                packages.declared_weight, packages.size,
                pickup.city AS pickup_city, pickup.province AS pickup_province,
                delivery.city AS delivery_city, delivery.province AS delivery_province
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $isIntercity = booking_is_intercity($booking);
    $currentStatus = normalize_booking_status_code((string)$booking['status']);
    $isDeliveryFailureHandover = $stage === 'destination' && $currentStatus === 'delivery_attempt_failed';
    $nextStatus = $stage === 'origin'
        ? 'received_at_origin_branch'
        : ($isDeliveryFailureHandover ? 'waiting_for_reattempt' : 'received_at_destination_branch');
    $requiredCurrent = $stage === 'origin' ? 'in_transit_to_origin_branch' : 'linehaul_in_transit';

    if ($stage === 'destination' && !$isIntercity && !$isDeliveryFailureHandover) {
        json_response(['error' => 'Destination branch receipt is only valid for inter-city orders'], 422);
    }
    if ($stage === 'destination' && $isDeliveryFailureHandover) {
        // Allow delivery-failure branch handover to complete return workflow.
    } elseif ($currentStatus !== $requiredCurrent) {
        json_response(['error' => 'Invalid status for branch receipt confirmation'], 422);
    }

    $setParts = ['status = :status'];
    foreach (booking_status_side_effect_sql($nextStatus) as $part) {
        $setParts[] = $part;
    }
    $updateParams = [
        'status' => $nextStatus,
        'id' => $bookingId
    ];
    if ($isDeliveryFailureHandover) {
        $returnBranchId = $isIntercity
            ? (int)($booking['destination_branch_id'] ?? 0)
            : (int)($booking['origin_branch_id'] ?? 0);
        if ($returnBranchId <= 0) {
            $returnBranchId = (int)($booking['destination_branch_id'] ?? 0);
        }
        if ($returnBranchId <= 0) {
            $returnBranchId = (int)($booking['origin_branch_id'] ?? 0);
        }
        if ($returnBranchId <= 0) {
            $returnBranchId = (int)($booking['current_branch_id'] ?? 0);
        }
        $setParts[] = 'courier_id = NULL';
        $setParts[] = 'delivery_courier_id = NULL';
        $setParts[] = 'delivery_load_confirmed_at = NULL';
        if ($returnBranchId > 0) {
            $setParts[] = 'current_branch_id = :current_branch_id';
            $updateParams['current_branch_id'] = $returnBranchId;
        }
    }
    $pdo->prepare('UPDATE bookings SET ' . implode(', ', $setParts) . ' WHERE id = :id')
        ->execute($updateParams);

    $descriptionMap = [
        'received_at_origin_branch' => 'Package received at origin branch',
        'received_at_destination_branch' => 'Package received at destination branch',
        'waiting_for_reattempt' => 'Failed delivery parcel handed over at branch and queued for reattempt assignment'
    ];
    $eventDescription = $description !== '' ? $description : ($descriptionMap[$nextStatus] ?? 'Branch receipt confirmed');
    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description, location_text, lat, lng)
         VALUES (:booking_id, :status, :description, :location_text, :lat, :lng)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => $nextStatus,
        'description' => $eventDescription,
        'location_text' => $locationText !== '' ? $locationText : null,
        'lat' => $lat,
        'lng' => $lng
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        $nextStatus,
        $actorType,
        $actorId,
        [
            'stage' => $stage,
            'sourceStatus' => $currentStatus,
            'deliveryFailureHandover' => $isDeliveryFailureHandover,
            'locationText' => $locationText !== '' ? $locationText : null,
            'lat' => $lat,
            'lng' => $lng
        ],
        $eventDescription
    );

    $autoAssignStage = null;
    $autoAssignment = null;
    if ($nextStatus === 'received_at_origin_branch') {
        $autoAssignStage = $isIntercity ? 'linehaul' : 'delivery';
        $autoAssignment = auto_assign_booking_stage($pdo, $bookingId, $autoAssignStage);
    } elseif ($nextStatus === 'received_at_destination_branch' && !$isDeliveryFailureHandover) {
        $autoAssignStage = 'delivery';
        $autoAssignment = auto_assign_booking_stage($pdo, $bookingId, 'delivery');
    }

    if ($autoAssignment && empty($autoAssignment['assigned'])) {
        $reason = $autoAssignment['reason'] ?? 'Auto-assign failed';
        add_system_alert(
            $pdo,
            'Operations',
            'Auto-assign Failed (' . ($autoAssignStage ?: 'dispatch') . ')',
            'Booking #' . $bookingId . ': ' . $reason,
            'Assign ' . ($autoAssignStage ?: 'dispatch') . ' courier manually.'
        );
    }

    $responseMessage = $isDeliveryFailureHandover
        ? 'Branch handover confirmed. Parcel moved to waiting for reattempt.'
        : 'Branch receipt confirmed';

    json_response([
        'message' => $responseMessage,
        'booking' => [
            'id' => $bookingId,
            'status' => $autoAssignment['status'] ?? $nextStatus
        ],
        'autoAssignment' => $autoAssignment
    ]);
}

if ($path === '/api/ratings' && $method === 'POST') {
    $payload = get_json_body();
    $bookingId = (int)($payload['bookingId'] ?? 0);
    $raterId = (int)($payload['raterId'] ?? 0);
    $stage = strtolower(trim((string)($payload['stage'] ?? '')));
    $rating = (int)($payload['rating'] ?? 0);
    $comment = trim((string)($payload['comment'] ?? ''));

    if ($bookingId <= 0 || $raterId <= 0 || !in_array($stage, ['pickup', 'delivery', 'linehaul'], true)) {
        json_response(['error' => 'bookingId, raterId, and stage are required'], 422);
    }
    if ($rating < 1 || $rating > 5) {
        json_response(['error' => 'rating must be between 1 and 5'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, status, customer_id, pickup_courier_id, delivery_courier_id, linehaul_courier_id
         FROM bookings WHERE id = :id LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    if ((int)$booking['customer_id'] !== $raterId) {
        json_response(['error' => 'Access denied'], 403);
    }

    $status = normalize_booking_status_code($booking['status']);
    if ($stage === 'pickup' && !in_array($status, ['picked_up', 'in_transit_to_origin_branch', 'received_at_origin_branch', 'linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit', 'received_at_destination_branch', 'delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender', 'delivered'], true)) {
        json_response(['error' => 'Pickup rating not available yet'], 422);
    }
    if ($stage === 'delivery' && $status !== 'delivered') {
        json_response(['error' => 'Delivery rating not available yet'], 422);
    }
    if ($stage === 'linehaul' && !in_array($status, ['linehaul_in_transit', 'received_at_destination_branch', 'delivered'], true)) {
        json_response(['error' => 'Linehaul rating not available yet'], 422);
    }

    $courierId = null;
    if ($stage === 'pickup') {
        $courierId = $booking['pickup_courier_id'];
    } elseif ($stage === 'delivery') {
        $courierId = $booking['delivery_courier_id'];
    } else {
        $courierId = $booking['linehaul_courier_id'];
    }
    if (!$courierId) {
        json_response(['error' => 'Courier not assigned for this stage'], 409);
    }

    $existsStmt = $pdo->prepare(
        'SELECT id FROM ratings WHERE booking_id = :booking_id AND rater_id = :rater_id AND stage = :stage LIMIT 1'
    );
    $existsStmt->execute(['booking_id' => $bookingId, 'rater_id' => $raterId, 'stage' => $stage]);
    if ($existsStmt->fetch()) {
        json_response(['error' => 'Rating already submitted'], 409);
    }

    $insert = $pdo->prepare(
        'INSERT INTO ratings (booking_id, courier_id, rater_id, stage, rating, comment)
         VALUES (:booking_id, :courier_id, :rater_id, :stage, :rating, :comment)'
    );
    $insert->execute([
        'booking_id' => $bookingId,
        'courier_id' => (int)$courierId,
        'rater_id' => $raterId,
        'stage' => $stage,
        'rating' => $rating,
        'comment' => $comment !== '' ? $comment : null
    ]);

    json_response(['message' => 'Rating submitted'], 201);
}

if ($path === '/api/courier/availability' && $method === 'PATCH') {
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? 0);
    $availability = strtolower(trim((string)($payload['availability'] ?? '')));

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }
    if (!in_array($availability, ['online', 'offline'], true)) {
        json_response(['error' => 'availability must be online or offline'], 422);
    }

    $courierStmt = $pdo->prepare(
        "SELECT users.id
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
         WHERE users.id = :id"
    );
    $courierStmt->execute(['id' => $courierId]);
    if (!$courierStmt->fetch()) {
        json_response(['error' => 'Courier not found'], 404);
    }

    $profileStmt = $pdo->prepare('SELECT courier_role FROM courier_profiles WHERE user_id = :id LIMIT 1');
    $profileStmt->execute(['id' => $courierId]);
    $profile = $profileStmt->fetch();

    if ($profile) {
        $pdo->prepare('UPDATE courier_profiles SET availability = :availability WHERE user_id = :id')
            ->execute([
                'availability' => $availability,
                'id' => $courierId
            ]);
    } else {
        $pdo->prepare(
            'INSERT INTO courier_profiles (user_id, courier_role, availability, branch_id)
             VALUES (:user_id, :courier_role, :availability, :branch_id)'
        )->execute([
            'user_id' => $courierId,
            'courier_role' => 'delivery',
            'availability' => $availability,
            'branch_id' => null
        ]);
    }

    json_response([
        'message' => 'Availability updated',
        'availability' => $availability
    ]);
}

if ($path === '/api/courier/location' && $method === 'POST') {
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? 0);
    $lat = to_decimal_or_null($payload['latitude'] ?? null);
    $lng = to_decimal_or_null($payload['longitude'] ?? null);

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }
    if ($lat === null || $lng === null) {
        json_response(['error' => 'latitude and longitude are required'], 422);
    }

    $courierStmt = $pdo->prepare(
        "SELECT users.id
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
         WHERE users.id = :id"
    );
    $courierStmt->execute(['id' => $courierId]);
    if (!$courierStmt->fetch()) {
        json_response(['error' => 'Courier not found'], 404);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO courier_live_location (courier_id, latitude, longitude)
         VALUES (:courier_id, :latitude, :longitude)
         ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), updated_at = NOW()'
    );
    $stmt->execute([
        'courier_id' => $courierId,
        'latitude' => $lat,
        'longitude' => $lng
    ]);

    json_response(['message' => 'Location updated']);
}

if ($path === '/api/courier/location/clear' && $method === 'POST') {
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? 0);
    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }

    $pdo->prepare('DELETE FROM courier_live_location WHERE courier_id = :id')
        ->execute(['id' => $courierId]);

    json_response(['message' => 'Location cleared']);
}

if ($path === '/api/admin/active-deliveries' && $method === 'GET') {
    $limit = (int)get_query_param('limit', 8);
    if ($limit <= 0) {
        $limit = 8;
    }

    $stmt = $pdo->prepare(
        "SELECT bookings.id, bookings.booking_code, bookings.customer_id, bookings.courier_id,
                bookings.pickup_courier_id, bookings.linehaul_courier_id, bookings.delivery_courier_id,
                bookings.status, bookings.service_type, bookings.eta_minutes, bookings.distance_km,
                couriers.full_name AS courier_name,
                pickup_couriers.full_name AS pickup_courier_name,
                linehaul_couriers.full_name AS linehaul_courier_name,
                delivery_couriers.full_name AS delivery_courier_name,
                customers.full_name AS customer_name,
                pickup.line1 AS pickup_line, pickup.city AS pickup_city, pickup.province AS pickup_province, pickup.postal_code AS pickup_postal,
                pickup.lat AS pickup_lat, pickup.lng AS pickup_lng,
                delivery.line1 AS delivery_line, delivery.city AS delivery_city, delivery.province AS delivery_province, delivery.postal_code AS delivery_postal,
                delivery.lat AS delivery_lat, delivery.lng AS delivery_lng
         FROM bookings
         LEFT JOIN users AS couriers ON couriers.id = bookings.courier_id
         LEFT JOIN users AS pickup_couriers ON pickup_couriers.id = bookings.pickup_courier_id
         LEFT JOIN users AS linehaul_couriers ON linehaul_couriers.id = bookings.linehaul_courier_id
         LEFT JOIN users AS delivery_couriers ON delivery_couriers.id = bookings.delivery_courier_id
         LEFT JOIN users AS customers ON customers.id = bookings.customer_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.status IN ('pickup_assigned','picked_up','in_transit_to_origin_branch','received_at_origin_branch','linehaul_assigned','linehaul_load_confirmed','linehaul_in_transit','received_at_destination_branch','delivery_assigned','delivery_load_confirmed','out_for_delivery','delivery_attempt_failed','waiting_for_reattempt','rts_pending')
         ORDER BY bookings.updated_at DESC
         LIMIT :limit"
    );
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $progressMap = [
        'pickup_assigned' => 10,
        'picked_up' => 25,
        'in_transit_to_origin_branch' => 40,
        'received_at_origin_branch' => 50,
        'linehaul_assigned' => 55,
        'linehaul_load_confirmed' => 60,
        'linehaul_in_transit' => 70,
        'received_at_destination_branch' => 80,
        'delivery_assigned' => 85,
        'delivery_load_confirmed' => 88,
        'out_for_delivery' => 90,
        'delivery_attempt_failed' => 92,
        'waiting_for_reattempt' => 94,
        'rts_pending' => 96,
        'returned_to_sender' => 100,
        'delivered' => 100
    ];

    $deliveries = [];
    foreach ($stmt as $row) {
        $priority = 'normal';
        if ($row['service_type'] === 'same-day') {
            $priority = 'urgent';
        } elseif ($row['service_type'] === 'next-day') {
            $priority = 'high';
        }

        $distanceKm = $row['distance_km'] !== null ? (float)$row['distance_km'] : null;
        if ($distanceKm === null && has_valid_coords($row['pickup_lat'], $row['pickup_lng'])
            && has_valid_coords($row['delivery_lat'], $row['delivery_lng'])) {
            $distanceKm = calculate_distance_km(
                $row['pickup_lat'],
                $row['pickup_lng'],
                $row['delivery_lat'],
                $row['delivery_lng']
            );
        }
        $etaMinutes = $row['eta_minutes'] !== null ? (int)$row['eta_minutes'] : null;
        if ($etaMinutes === null && $distanceKm !== null) {
            $avgSpeedKmph = 25;
            $etaMinutes = (int)max(1, round(($distanceKm / $avgSpeedKmph) * 60));
        }

        $pickupStages = ['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch', 'received_at_origin_branch'];
        $linehaulStages = ['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit'];
        $deliveryStages = ['received_at_destination_branch', 'delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender', 'delivered'];
        if (in_array($row['status'], $pickupStages, true)) {
            $stageCourier = $row['pickup_courier_name'];
            $stageCourierId = $row['pickup_courier_id'] ? (int)$row['pickup_courier_id'] : null;
        } elseif (in_array($row['status'], $linehaulStages, true)) {
            $stageCourier = $row['linehaul_courier_name'];
            $stageCourierId = $row['linehaul_courier_id'] ? (int)$row['linehaul_courier_id'] : null;
        } elseif (in_array($row['status'], $deliveryStages, true)) {
            $stageCourier = $row['delivery_courier_name'];
            $stageCourierId = $row['delivery_courier_id'] ? (int)$row['delivery_courier_id'] : null;
        } else {
            $stageCourier = $row['courier_name'];
            $stageCourierId = $row['courier_id'] ? (int)$row['courier_id'] : null;
        }
        $stageCourier = $stageCourier ?: $row['courier_name'];
        if (!$stageCourierId && $row['courier_id']) {
            $stageCourierId = (int)$row['courier_id'];
        }

        $deliveries[] = [
            'id' => $row['booking_code'],
            'bookingId' => (int)$row['id'],
            'bookingCode' => $row['booking_code'],
            'customerId' => $row['customer_id'] ? (int)$row['customer_id'] : null,
            'courierId' => $stageCourierId,
            'courier' => $stageCourier ?: 'Unassigned',
            'courierAvatar' => null,
            'courierAvatarAlt' => $stageCourier ? ('Profile photo of ' . $stageCourier) : 'Courier profile photo',
            'customer' => $row['customer_name'] ?: 'Customer',
            'status' => $row['status'],
            'priority' => $priority,
            'pickup' => sprintf('%s, %s, %s %s', $row['pickup_line'], $row['pickup_city'], $row['pickup_province'], $row['pickup_postal']),
            'delivery' => sprintf('%s, %s, %s %s', $row['delivery_line'], $row['delivery_city'], $row['delivery_province'], $row['delivery_postal']),
            'eta' => $etaMinutes !== null ? $etaMinutes . ' mins' : 'N/A',
            'distance' => $distanceKm !== null ? number_format($distanceKm, 1) . ' km' : 'N/A',
            'progress' => $progressMap[$row['status']] ?? 0
        ];
    }

    json_response(['deliveries' => $deliveries]);
}

if ($path === '/api/admin/recent-activity' && $method === 'GET') {
    $limit = (int)get_query_param('limit', 10);
    if ($limit <= 0) {
        $limit = 10;
    }
    $type = trim((string)get_query_param('type', 'all'));
    $allowedTypes = ['all', 'user_registration', 'delivery_completed', 'booking_created', 'payment_received'];
    if (!in_array($type, $allowedTypes, true)) {
        $type = 'all';
    }

    $activityBaseSql = "
        SELECT 'user_registration' AS type,
               users.full_name AS user_name,
               'registered on the platform' AS action,
               users.created_at AS occurred_at,
               NULL AS booking_code
        FROM users
        UNION ALL
        SELECT 'booking_created' AS type,
               customers.full_name AS user_name,
               CONCAT('created new booking #', bookings.booking_code) AS action,
               bookings.created_at AS occurred_at,
               bookings.booking_code AS booking_code
        FROM bookings
        JOIN users AS customers ON customers.id = bookings.customer_id
        UNION ALL
        SELECT 'delivery_completed' AS type,
               customers.full_name AS user_name,
               CONCAT('completed delivery #', bookings.booking_code) AS action,
               bookings.updated_at AS occurred_at,
               bookings.booking_code AS booking_code
        FROM bookings
        JOIN users AS customers ON customers.id = bookings.customer_id
        WHERE bookings.status = 'delivered'
        UNION ALL
        SELECT 'payment_received' AS type,
               customers.full_name AS user_name,
               CONCAT('payment received for order #', bookings.booking_code) AS action,
               COALESCE(payments.paid_at, bookings.updated_at) AS occurred_at,
               bookings.booking_code AS booking_code
        FROM payments
        JOIN bookings ON bookings.id = payments.booking_id
        JOIN users AS customers ON customers.id = bookings.customer_id
        WHERE payments.status = 'paid'
    ";

    $typeFilterSql = $type === 'all' ? '' : ' AND activity.type = :type';
    $activitySql = "
        SELECT *
        FROM (" . $activityBaseSql . ") AS activity
        WHERE activity.occurred_at IS NOT NULL" . $typeFilterSql . "
        ORDER BY activity.occurred_at DESC
        LIMIT :limit";

    $stmt = $pdo->prepare($activitySql);
    if ($type !== 'all') {
        $stmt->bindValue(':type', $type, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $activities = [];
    $idx = 1;
    foreach ($stmt as $row) {
        $activities[] = [
            'id' => $idx++,
            'type' => $row['type'],
            'user' => $row['user_name'] ?: 'System',
            'action' => $row['action'],
            'timestamp' => $row['occurred_at']
        ];
    }

    $countsStmt = $pdo->prepare(
        "SELECT activity.type, COUNT(*) AS total
         FROM (" . $activityBaseSql . ") AS activity
         WHERE activity.occurred_at IS NOT NULL
         GROUP BY activity.type"
    );
    $countsStmt->execute();
    $counts = [
        'user_registration' => 0,
        'delivery_completed' => 0,
        'booking_created' => 0,
        'payment_received' => 0
    ];
    foreach ($countsStmt as $countRow) {
        $rowType = $countRow['type'] ?? '';
        if (array_key_exists($rowType, $counts)) {
            $counts[$rowType] = (int)$countRow['total'];
        }
    }

    json_response([
        'activities' => $activities,
        'counts' => $counts
    ]);
}

if ($path === '/api/admin/users' && $method === 'GET') {
    $avatarSelectSql = users_avatar_column_ready($pdo)
        ? 'users.avatar_url AS avatar_url,'
        : 'NULL AS avatar_url,';
    $stmt = $pdo->query(
        "SELECT users.id, users.full_name, users.email, users.phone, {$avatarSelectSql} users.status, users.created_at, users.updated_at,
                COALESCE(MAX(roles.name), 'customer') AS role,
                MAX(courier_profiles.courier_role) AS courier_role,
                MAX(courier_profiles.branch_id) AS branch_id,
                MAX(branches.name) AS branch_name,
                COUNT(DISTINCT customer_bookings.id) AS customer_orders,
                COUNT(DISTINCT courier_bookings.id) AS courier_orders
         FROM users
         LEFT JOIN user_roles ON user_roles.user_id = users.id
         LEFT JOIN roles ON roles.id = user_roles.role_id
         LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
         LEFT JOIN branches ON branches.id = courier_profiles.branch_id
         LEFT JOIN bookings AS customer_bookings ON customer_bookings.customer_id = users.id
         LEFT JOIN bookings AS courier_bookings
            ON courier_bookings.courier_id = users.id
            OR courier_bookings.pickup_courier_id = users.id
            OR courier_bookings.delivery_courier_id = users.id
            OR courier_bookings.linehaul_courier_id = users.id
         GROUP BY users.id
         ORDER BY users.created_at DESC"
    );

    $users = [];
    foreach ($stmt as $row) {
        $role = $row['role'] ?: 'customer';
        $status = $row['status'] === 'banned' ? 'suspended' : $row['status'];
        $customerOrders = (int)($row['customer_orders'] ?? 0);
        $courierOrders = (int)($row['courier_orders'] ?? 0);
        $users[] = [
            'id' => (int)$row['id'],
            'fullName' => $row['full_name'],
            'email' => $row['email'],
            'phone' => $row['phone'] ?: '',
            'avatarUrl' => ($row['avatar_url'] ?? '') ?: null,
            'role' => $role,
            'courierRole' => $row['courier_role'] ?: null,
            'branchId' => $row['branch_id'] ? (int)$row['branch_id'] : null,
            'branchName' => $row['branch_name'] ?: null,
            'status' => $status ?: 'active',
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'totalOrders' => $role === 'courier' ? $courierOrders : $customerOrders
        ];
    }

    json_response(['users' => $users]);
}

if ($path === '/api/admin/users' && $method === 'POST') {
    $payload = get_json_body();
    $fullName = trim($payload['fullName'] ?? '');
    $email = trim($payload['email'] ?? '');
    $phone = trim($payload['phone'] ?? '');
    $password = $payload['password'] ?? '';
    $role = trim($payload['role'] ?? 'customer');
    $status = trim($payload['status'] ?? 'active');
    $status = $status === 'suspended' ? 'banned' : $status;
    $courierRole = trim($payload['courierRole'] ?? 'both');
    $branchId = isset($payload['branchId']) ? (int)$payload['branchId'] : null;
    $hasAvatarDataUrl = array_key_exists('avatarDataUrl', $payload);
    $avatarDataUrl = $payload['avatarDataUrl'] ?? null;
    $hasAvatarUrl = array_key_exists('avatarUrl', $payload);
    $avatarUrl = trim((string)($payload['avatarUrl'] ?? ''));
    $avatarColumnReady = users_avatar_column_ready($pdo);
    $validCourierRoles = ['pickup', 'delivery', 'both', 'linehaul', 'express'];

    if ($fullName === '' || $email === '' || $password === '') {
        json_response(['error' => 'Full name, email, and password are required'], 422);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $check->execute(['email' => $email]);
    if ($check->fetch()) {
        json_response(['error' => 'Email already exists'], 409);
    }
    if (($hasAvatarDataUrl || $hasAvatarUrl) && !$avatarColumnReady) {
        json_response(['error' => 'Avatar storage is not available right now'], 500);
    }

    $pdo->beginTransaction();
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $insert = $avatarColumnReady
        ? $pdo->prepare(
            'INSERT INTO users (full_name, email, phone, avatar_url, password_hash, status) VALUES (:full_name, :email, :phone, :avatar_url, :password_hash, :status)'
        )
        : $pdo->prepare(
            'INSERT INTO users (full_name, email, phone, password_hash, status) VALUES (:full_name, :email, :phone, :password_hash, :status)'
        );
    $insertParams = [
        'full_name' => $fullName,
        'email' => $email,
        'phone' => $phone,
        'password_hash' => $passwordHash,
        'status' => $status === '' ? 'active' : $status
    ];
    if ($avatarColumnReady) {
        $insertParams['avatar_url'] = null;
    }
    $insert->execute($insertParams);
    $userId = $pdo->lastInsertId();
    $savedAvatarUrl = null;
    if ($avatarColumnReady && ($hasAvatarDataUrl || $hasAvatarUrl)) {
        $resolvedAvatarUrl = null;
        if ($hasAvatarDataUrl) {
            $avatarRaw = trim((string)$avatarDataUrl);
            if ($avatarRaw !== '') {
                $resolvedAvatarUrl = save_user_avatar_from_data_url($avatarRaw, $userId);
                if (!$resolvedAvatarUrl) {
                    $pdo->rollBack();
                    json_response(['error' => 'Invalid avatar image. Use PNG/JPG/WEBP under 5MB.'], 422);
                }
            }
        } elseif ($hasAvatarUrl) {
            $resolvedAvatarUrl = $avatarUrl !== '' ? $avatarUrl : null;
        }
        $pdo->prepare('UPDATE users SET avatar_url = :avatar_url WHERE id = :id')
            ->execute([
                'avatar_url' => $resolvedAvatarUrl,
                'id' => $userId
            ]);
        $savedAvatarUrl = $resolvedAvatarUrl;
    }
    $roleId = ensure_role($pdo, $role === '' ? 'customer' : $role);
    $link = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)');
    $link->execute(['user_id' => $userId, 'role_id' => $roleId]);
    if ($role === 'courier') {
        if (!in_array($courierRole, $validCourierRoles, true)) {
            $courierRole = 'both';
        }
        if ($branchId !== null && $branchId > 0) {
            $branchStmt = $pdo->prepare('SELECT id FROM branches WHERE id = :id');
            $branchStmt->execute(['id' => $branchId]);
            if (!$branchStmt->fetch()) {
                $pdo->rollBack();
                json_response(['error' => 'Branch not found'], 404);
            }
        } else {
            $branchId = null;
        }
        $pdo->prepare(
            'INSERT INTO courier_profiles (user_id, courier_role, availability, branch_id)
             VALUES (:user_id, :courier_role, :availability, :branch_id)'
        )->execute([
            'user_id' => $userId,
            'courier_role' => $courierRole,
            'availability' => 'offline',
            'branch_id' => $branchId
        ]);
    }
    $pdo->commit();

    json_response([
        'message' => 'User created',
        'user' => [
            'id' => (int)$userId,
            'fullName' => $fullName,
            'email' => $email,
            'phone' => $phone,
            'avatarUrl' => $savedAvatarUrl,
            'role' => $role,
            'courierRole' => $role === 'courier' ? $courierRole : null,
            'branchId' => $role === 'courier' ? $branchId : null,
            'status' => $status === 'banned' ? 'suspended' : $status
        ]
    ], 201);
}

if (preg_match('#^/api/admin/users/(\d+)$#', $path, $matches) && $method === 'PATCH') {
    $userId = (int)$matches[1];
    $payload = get_json_body();
    $role = trim($payload['role'] ?? '');
    $status = trim($payload['status'] ?? '');
    $status = $status === 'suspended' ? 'banned' : $status;
    $fullName = trim($payload['fullName'] ?? '');
    $email = trim($payload['email'] ?? '');
    $phone = trim($payload['phone'] ?? '');
    $hasFullName = array_key_exists('fullName', $payload);
    $hasEmail = array_key_exists('email', $payload);
    $hasPhone = array_key_exists('phone', $payload);
    $hasCourierRole = array_key_exists('courierRole', $payload);
    $courierRole = trim($payload['courierRole'] ?? '');
    $hasBranchId = array_key_exists('branchId', $payload);
    $branchId = $hasBranchId ? (int)$payload['branchId'] : null;
    $hasAvatarDataUrl = array_key_exists('avatarDataUrl', $payload);
    $avatarDataUrl = $payload['avatarDataUrl'] ?? null;
    $hasAvatarUrl = array_key_exists('avatarUrl', $payload);
    $avatarUrl = trim((string)($payload['avatarUrl'] ?? ''));
    $avatarColumnReady = users_avatar_column_ready($pdo);
    $validCourierRoles = ['pickup', 'delivery', 'both', 'linehaul', 'express'];

    $stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = :id');
    $stmt->execute(['id' => $userId]);
    $existing = $stmt->fetch();
    if (!$existing) {
        json_response(['error' => 'User not found'], 404);
    }

    if ($hasEmail && $email !== '' && $email !== $existing['email']) {
        $check = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $check->execute(['email' => $email]);
        if ($check->fetch()) {
            json_response(['error' => 'Email already exists'], 409);
        }
    }

    if ($status !== '') {
        $update = $pdo->prepare('UPDATE users SET status = :status WHERE id = :id');
        $update->execute(['status' => $status, 'id' => $userId]);
    }

    if ($hasFullName && $fullName !== '') {
        $update = $pdo->prepare('UPDATE users SET full_name = :full_name WHERE id = :id');
        $update->execute(['full_name' => $fullName, 'id' => $userId]);
    }

    if ($hasEmail && $email !== '') {
        $update = $pdo->prepare('UPDATE users SET email = :email WHERE id = :id');
        $update->execute(['email' => $email, 'id' => $userId]);
    }

    if ($hasPhone) {
        $update = $pdo->prepare('UPDATE users SET phone = :phone WHERE id = :id');
        $update->execute(['phone' => $phone, 'id' => $userId]);
    }

    if ($hasAvatarDataUrl || $hasAvatarUrl) {
        if (!$avatarColumnReady) {
            json_response(['error' => 'Avatar storage is not available right now'], 500);
        }
        $nextAvatarUrl = null;
        if ($hasAvatarDataUrl) {
            $avatarRaw = trim((string)$avatarDataUrl);
            if ($avatarRaw !== '') {
                $savedAvatarUrl = save_user_avatar_from_data_url($avatarRaw, $userId);
                if (!$savedAvatarUrl) {
                    json_response(['error' => 'Invalid avatar image. Use PNG/JPG/WEBP under 5MB.'], 422);
                }
                $nextAvatarUrl = $savedAvatarUrl;
            }
        } elseif ($hasAvatarUrl) {
            $nextAvatarUrl = $avatarUrl !== '' ? $avatarUrl : null;
        }
        $update = $pdo->prepare('UPDATE users SET avatar_url = :avatar_url WHERE id = :id');
        $update->execute([
            'avatar_url' => $nextAvatarUrl,
            'id' => $userId
        ]);
    }

    if ($role !== '') {
        $roleId = ensure_role($pdo, $role);
        $pdo->prepare('DELETE FROM user_roles WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)')
            ->execute(['user_id' => $userId, 'role_id' => $roleId]);
    }

    if (($role !== '' && $role === 'courier') || $hasCourierRole) {
        if (!in_array($courierRole, $validCourierRoles, true)) {
            $courierRole = 'both';
        }
        if ($hasBranchId && $branchId > 0) {
            $branchStmt = $pdo->prepare('SELECT id FROM branches WHERE id = :id');
            $branchStmt->execute(['id' => $branchId]);
            if (!$branchStmt->fetch()) {
                json_response(['error' => 'Branch not found'], 404);
            }
        }
        $profileStmt = $pdo->prepare('SELECT id FROM courier_profiles WHERE user_id = :id');
        $profileStmt->execute(['id' => $userId]);
        if ($profileStmt->fetch()) {
            $updates = ['courier_role = :courier_role'];
            $params = ['courier_role' => $courierRole, 'id' => $userId];
            if ($hasBranchId) {
                $updates[] = 'branch_id = :branch_id';
                $params['branch_id'] = $branchId > 0 ? $branchId : null;
            }
            $pdo->prepare('UPDATE courier_profiles SET ' . implode(', ', $updates) . ' WHERE user_id = :id')
                ->execute($params);
        } else {
            $pdo->prepare(
                'INSERT INTO courier_profiles (user_id, courier_role, availability, branch_id)
                 VALUES (:user_id, :courier_role, :availability, :branch_id)'
            )->execute([
                'user_id' => $userId,
                'courier_role' => $courierRole,
                'availability' => 'offline',
                'branch_id' => $hasBranchId ? ($branchId > 0 ? $branchId : null) : null
            ]);
        }
    }

    json_response(['message' => 'User updated']);
}

if ($path === '/api/admin/system-alerts' && $method === 'GET') {
    $status = trim(get_query_param('status', 'open'));
    $includeDemo = to_bool(get_query_param('includeDemo', 'false'));
    $params = [];
    $where = '';
    if ($status !== '') {
        $where = 'WHERE status = :status';
        $params['status'] = $status;
    }

    $ghostShipmentCount = null;
    $ghostShipmentTriggered = static function () use ($pdo, &$ghostShipmentCount) {
        if ($ghostShipmentCount !== null) {
            return $ghostShipmentCount > 0;
        }
        $stmt = $pdo->query(
            "SELECT COUNT(*) AS total
             FROM bookings
             JOIN packages ON packages.id = bookings.package_id
             WHERE bookings.status NOT IN ('delivered', 'cancelled')
               AND (
                 packages.declared_weight IS NULL
                 OR packages.declared_weight = ''
                 OR packages.declared_weight = '0'
                 OR packages.declared_weight = '0.0'
                 OR packages.length_cm IS NULL
                 OR packages.width_cm IS NULL
                 OR packages.height_cm IS NULL
               )"
        );
        $ghostShipmentCount = (int)($stmt->fetch()['total'] ?? 0);
        return $ghostShipmentCount > 0;
    };

    $stmt = $pdo->prepare(
        "SELECT id, category, alert_name, trigger_condition, recommended_action, status, created_at
         FROM system_alerts
         $where
         ORDER BY created_at DESC"
    );
    $stmt->execute($params);

    $alerts = [];
    foreach ($stmt as $row) {
        if (!$includeDemo && is_demo_system_alert($row)) {
            continue;
        }
        $name = $row['alert_name'] ?? '';
        $isTriggered = true;
        if (stripos($name, 'ghost shipment') !== false) {
            $isTriggered = $ghostShipmentTriggered();
        } elseif (stripos($name, 'db connection') !== false) {
            $isTriggered = false;
        }

        if (!$isTriggered) {
            continue;
        }

        $alerts[] = [
            'id' => (int)$row['id'],
            'category' => $row['category'],
            'name' => $name,
            'trigger' => $row['trigger_condition'],
            'action' => $row['recommended_action'],
            'status' => $row['status'],
            'createdAt' => $row['created_at']
        ];
    }

    json_response(['alerts' => $alerts]);
}

if (preg_match('#^/api/admin/system-alerts/(\d+)$#', $path, $matches) && $method === 'PATCH') {
    $alertId = (int)$matches[1];
    $payload = get_json_body();
    $status = trim($payload['status'] ?? '');
    $allowed = ['open', 'acknowledged', 'closed'];
    if ($status === '' || !in_array($status, $allowed, true)) {
        json_response(['error' => 'Invalid status'], 422);
    }

    $stmt = $pdo->prepare('SELECT id FROM system_alerts WHERE id = :id');
    $stmt->execute(['id' => $alertId]);
    if (!$stmt->fetch()) {
        json_response(['error' => 'Alert not found'], 404);
    }

    $resolvedAt = $status === 'closed' ? (new DateTimeImmutable())->format('Y-m-d H:i:s') : null;
    $update = $pdo->prepare('UPDATE system_alerts SET status = :status, resolved_at = :resolved_at WHERE id = :id');
    $update->execute([
        'status' => $status,
        'resolved_at' => $resolvedAt,
        'id' => $alertId
    ]);

    json_response(['message' => 'Alert updated']);
}

if ($path === '/api/admin/performance-metrics' && $method === 'GET') {
    $pickupCompletionStatuses = "'received_at_origin_branch','linehaul_assigned','linehaul_load_confirmed','linehaul_in_transit','received_at_destination_branch','delivery_assigned','delivery_load_confirmed','out_for_delivery','delivery_attempt_failed','waiting_for_reattempt','rts_pending','returned_to_sender','delivered'";
    $linehaulCompletionStatuses = "'received_at_destination_branch','delivery_assigned','delivery_load_confirmed','out_for_delivery','delivery_attempt_failed','waiting_for_reattempt','rts_pending','returned_to_sender','delivered'";
    $completedStatuses = "'delivered','received_at_origin_branch','received_at_destination_branch'";
    $slaMinutesExpr = "COALESCE(
        bookings.eta_minutes,
        CASE bookings.service_type
            WHEN 'express' THEN 180
            WHEN 'same-day' THEN 360
            WHEN 'next-day' THEN 1440
            WHEN 'scheduled' THEN 1440
            ELSE 4320
        END
    )";
    $completionTimeExpr = "COALESCE(delivered_events.delivered_at, bookings.updated_at)";
    $courierCompletedCondition = "(
        (bookings.pickup_courier_id = users.id AND bookings.status IN ($pickupCompletionStatuses))
        OR (bookings.linehaul_courier_id = users.id AND bookings.status IN ($linehaulCompletionStatuses))
        OR (bookings.delivery_courier_id = users.id AND bookings.status = 'delivered')
        OR (bookings.courier_id = users.id AND bookings.status = 'delivered')
    )";

    $courierStmt = $pdo->query(
        "SELECT users.id, users.full_name,
                COALESCE(NULLIF(courier_profiles.rating, 0), ratings_agg.avg_rating, 0) AS rating,
                COALESCE(courier_profiles.courier_role, 'delivery') AS courier_role,
                COUNT(DISTINCT CASE
                    WHEN $courierCompletedCondition THEN bookings.id
                    ELSE NULL
                END) AS completed_count,
                COUNT(DISTINCT CASE
                    WHEN $courierCompletedCondition
                         AND TIMESTAMPDIFF(MINUTE, bookings.created_at, $completionTimeExpr) <= $slaMinutesExpr
                        THEN bookings.id
                    ELSE NULL
                END) AS on_time_count
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
         LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
         LEFT JOIN (
            SELECT courier_id, AVG(rating) AS avg_rating
            FROM ratings
            GROUP BY courier_id
         ) AS ratings_agg ON ratings_agg.courier_id = users.id
         LEFT JOIN bookings ON (
            bookings.pickup_courier_id = users.id
            OR bookings.linehaul_courier_id = users.id
            OR bookings.delivery_courier_id = users.id
            OR bookings.courier_id = users.id
         )
         LEFT JOIN (
            SELECT booking_id, MAX(occurred_at) AS delivered_at
            FROM booking_status_events
            WHERE status = 'delivered'
            GROUP BY booking_id
         ) AS delivered_events ON delivered_events.booking_id = bookings.id
         GROUP BY users.id
         ORDER BY completed_count DESC, on_time_count DESC, rating DESC
         LIMIT 5"
    );

    $topCouriers = [];
    foreach ($courierStmt as $row) {
        $completed = (int)$row['completed_count'];
        $onTime = (int)$row['on_time_count'];
        $onTimeRate = $completed > 0 ? (int)round(($onTime / $completed) * 100) : 0;
        $topCouriers[] = [
            'name' => $row['full_name'],
            'completed' => $completed,
            'role' => $row['courier_role'] ?: 'delivery',
            'rating' => (float)$row['rating'],
            'onTime' => $onTimeRate
        ];
    }

    $totalsStmt = $pdo->query(
        "SELECT COUNT(*) AS total,
                SUM(CASE WHEN bookings.status IN ($completedStatuses) THEN 1 ELSE 0 END) AS completed,
                SUM(CASE
                        WHEN bookings.status IN ($completedStatuses)
                             AND TIMESTAMPDIFF(MINUTE, bookings.created_at, COALESCE(delivered_events.delivered_at, bookings.updated_at)) <= $slaMinutesExpr
                            THEN 1
                        ELSE 0
                    END) AS on_time
         FROM bookings
         LEFT JOIN (
            SELECT booking_id, MAX(occurred_at) AS delivered_at
            FROM booking_status_events
            WHERE status = 'delivered'
            GROUP BY booking_id
         ) AS delivered_events ON delivered_events.booking_id = bookings.id"
    );
    $totals = $totalsStmt->fetch();
    $totalBookings = (int)($totals['total'] ?? 0);
    $completedCount = (int)($totals['completed'] ?? 0);
    $onTimeCount = (int)($totals['on_time'] ?? 0);
    $onTimeRate = $completedCount > 0 ? (int)round(($onTimeCount / $completedCount) * 100) : 0;
    $successRate = $totalBookings > 0 ? (int)round(($completedCount / $totalBookings) * 100) : 0;

    $ratingStmt = $pdo->query(
        "SELECT COALESCE(
            NULLIF((SELECT AVG(rating) FROM courier_profiles), 0),
            (SELECT AVG(rating) FROM ratings),
            0
        ) AS avg_rating"
    );
    $avgRating = (float)($ratingStmt->fetch()['avg_rating'] ?? 0);
    $ratingScore = (int)round($avgRating * 20);

    $satisfaction = [
        ['category' => 'Delivery Speed', 'score' => $onTimeRate],
        ['category' => 'Package Condition', 'score' => $successRate],
        ['category' => 'Communication', 'score' => $ratingScore],
        ['category' => 'Professionalism', 'score' => $ratingScore],
        ['category' => 'Overall Experience', 'score' => (int)round(($onTimeRate + $successRate + $ratingScore) / 3)]
    ];

    json_response([
        'topCouriers' => $topCouriers,
        'satisfaction' => $satisfaction,
        'summary' => [
            'avgRating' => $avgRating,
            'onTimeRate' => $onTimeRate,
            'successRate' => $successRate,
            'satisfaction' => $satisfaction[4]['score']
        ]
    ]);
}

if ($path === '/api/admin/vehicles' && $method === 'GET') {
    $vehiclesStmt = $pdo->query(
        "SELECT vehicles.id, vehicles.code, vehicles.type, vehicles.plate_number, vehicles.capacity_kg, vehicles.status,
                vehicle_assignments.courier_id, users.full_name AS courier_name
         FROM vehicles
         LEFT JOIN vehicle_assignments
            ON vehicle_assignments.vehicle_id = vehicles.id
           AND vehicle_assignments.status = 'active'
         LEFT JOIN users ON users.id = vehicle_assignments.courier_id
         ORDER BY vehicles.created_at DESC"
    );

    $vehicles = [];
    foreach ($vehiclesStmt as $row) {
        $vehicles[] = [
            'id' => (int)$row['id'],
            'code' => $row['code'],
            'type' => $row['type'],
            'plateNumber' => $row['plate_number'],
            'capacityKg' => $row['capacity_kg'] ? (float)$row['capacity_kg'] : 0,
            'status' => $row['status'],
            'courierId' => $row['courier_id'] ? (int)$row['courier_id'] : null,
            'courierName' => $row['courier_name']
        ];
    }

    $courierStmt = $pdo->query(
        "SELECT users.id, users.full_name
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
         ORDER BY users.full_name ASC"
    );
    $couriers = [];
    foreach ($courierStmt as $row) {
        $couriers[] = [
            'value' => (int)$row['id'],
            'label' => $row['full_name']
        ];
    }

    json_response(['vehicles' => $vehicles, 'couriers' => $couriers]);
}

if ($path === '/api/admin/vehicles' && $method === 'POST') {
    $payload = get_json_body();
    $type = trim($payload['type'] ?? '');
    $plateNumber = trim($payload['plateNumber'] ?? '');
    $capacityKg = to_decimal_or_null($payload['capacityKg'] ?? null);
    $status = trim($payload['status'] ?? 'active');
    $code = trim($payload['code'] ?? '');
    $branchId = isset($payload['branchId']) ? (int)$payload['branchId'] : null;

    if ($type === '' || $plateNumber === '') {
        json_response(['error' => 'Vehicle type and plate number are required'], 422);
    }

    if (!in_array($status, ['active', 'maintenance', 'inactive'], true)) {
        json_response(['error' => 'Invalid vehicle status'], 422);
    }

    if ($branchId !== null && $branchId > 0) {
        $checkBranch = $pdo->prepare('SELECT id FROM branches WHERE id = :id');
        $checkBranch->execute(['id' => $branchId]);
        if (!$checkBranch->fetch()) {
            json_response(['error' => 'Branch not found'], 404);
        }
    } else {
        $branchId = null;
    }

    $plateCheck = $pdo->prepare('SELECT id FROM vehicles WHERE plate_number = :plate LIMIT 1');
    $plateCheck->execute(['plate' => $plateNumber]);
    if ($plateCheck->fetch()) {
        json_response(['error' => 'Plate number already exists'], 409);
    }

    if ($code !== '') {
        $codeCheck = $pdo->prepare('SELECT id FROM vehicles WHERE code = :code LIMIT 1');
        $codeCheck->execute(['code' => $code]);
        if ($codeCheck->fetch()) {
            json_response(['error' => 'Vehicle code already exists'], 409);
        }
    } else {
        $code = 'VEH-' . date('ymdHis') . random_int(100, 999);
    }

    $insert = $pdo->prepare(
        'INSERT INTO vehicles (code, type, plate_number, capacity_kg, status, branch_id)
         VALUES (:code, :type, :plate_number, :capacity_kg, :status, :branch_id)'
    );
    $insert->execute([
        'code' => $code,
        'type' => $type,
        'plate_number' => $plateNumber,
        'capacity_kg' => $capacityKg,
        'status' => $status,
        'branch_id' => $branchId
    ]);

    json_response([
        'message' => 'Vehicle created',
        'vehicle' => [
            'id' => (int)$pdo->lastInsertId(),
            'code' => $code,
            'type' => $type,
            'plateNumber' => $plateNumber,
            'capacityKg' => $capacityKg ? (float)$capacityKg : 0,
            'status' => $status,
            'courierId' => null,
            'courierName' => null
        ]
    ], 201);
}

if (preg_match('#^/api/admin/vehicles/(\d+)$#', $path, $matches) && $method === 'PATCH') {
    $vehicleId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = isset($payload['courierId']) ? (int)$payload['courierId'] : 0;
    $type = array_key_exists('type', $payload) ? trim((string)$payload['type']) : null;
    $plateNumber = array_key_exists('plateNumber', $payload) ? trim((string)$payload['plateNumber']) : null;
    $capacityKg = array_key_exists('capacityKg', $payload) ? to_decimal_or_null($payload['capacityKg']) : null;
    $status = array_key_exists('status', $payload) ? trim((string)$payload['status']) : null;
    $code = array_key_exists('code', $payload) ? trim((string)$payload['code']) : null;

    $stmt = $pdo->prepare('SELECT id FROM vehicles WHERE id = :id');
    $stmt->execute(['id' => $vehicleId]);
    if (!$stmt->fetch()) {
        json_response(['error' => 'Vehicle not found'], 404);
    }

    if ($code !== null && $code !== '') {
        $codeCheck = $pdo->prepare('SELECT id FROM vehicles WHERE code = :code AND id <> :id LIMIT 1');
        $codeCheck->execute(['code' => $code, 'id' => $vehicleId]);
        if ($codeCheck->fetch()) {
            json_response(['error' => 'Vehicle code already exists'], 409);
        }
    }

    if ($plateNumber !== null && $plateNumber !== '') {
        $plateCheck = $pdo->prepare('SELECT id FROM vehicles WHERE plate_number = :plate AND id <> :id LIMIT 1');
        $plateCheck->execute(['plate' => $plateNumber, 'id' => $vehicleId]);
        if ($plateCheck->fetch()) {
            json_response(['error' => 'Plate number already exists'], 409);
        }
    }

    if ($status !== null && !in_array($status, ['active', 'maintenance', 'inactive'], true)) {
        json_response(['error' => 'Invalid vehicle status'], 422);
    }

    if ($type !== null || $plateNumber !== null || $capacityKg !== null || $status !== null || $code !== null) {
        $updates = [];
        $params = ['id' => $vehicleId];
        if ($type !== null) {
            $updates[] = 'type = :type';
            $params['type'] = $type;
        }
        if ($plateNumber !== null) {
            $updates[] = 'plate_number = :plate_number';
            $params['plate_number'] = $plateNumber;
        }
        if ($capacityKg !== null) {
            $updates[] = 'capacity_kg = :capacity_kg';
            $params['capacity_kg'] = $capacityKg;
        }
        if ($status !== null && $status !== '') {
            $updates[] = 'status = :status';
            $params['status'] = $status;
        }
        if ($code !== null && $code !== '') {
            $updates[] = 'code = :code';
            $params['code'] = $code;
        }
        if ($updates) {
            $sql = 'UPDATE vehicles SET ' . implode(', ', $updates) . ' WHERE id = :id';
            $pdo->prepare($sql)->execute($params);
        }
    }

    $pdo->prepare("UPDATE vehicle_assignments SET status = 'ended', unassigned_at = NOW() WHERE vehicle_id = :id AND status = 'active'")
        ->execute(['id' => $vehicleId]);

    if ($courierId > 0) {
        $courierStmt = $pdo->prepare(
            "SELECT users.id
             FROM users
             JOIN user_roles ON user_roles.user_id = users.id
             JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
             WHERE users.id = :id"
        );
        $courierStmt->execute(['id' => $courierId]);
        if (!$courierStmt->fetch()) {
            json_response(['error' => 'Courier not found'], 404);
        }

        $pdo->prepare("UPDATE vehicle_assignments SET status = 'ended', unassigned_at = NOW() WHERE courier_id = :id AND status = 'active'")
            ->execute(['id' => $courierId]);
        $insert = $pdo->prepare(
            'INSERT INTO vehicle_assignments (vehicle_id, courier_id, status) VALUES (:vehicle_id, :courier_id, :status)'
        );
        $insert->execute([
            'vehicle_id' => $vehicleId,
            'courier_id' => $courierId,
            'status' => 'active'
        ]);
    }

    json_response(['message' => 'Vehicle assignment updated']);
}

if ($path === '/api/admin/couriers' && $method === 'GET') {
    $stage = strtolower(trim((string)get_query_param('stage', '')));
    $bookingId = (int)get_query_param('bookingId', 0);

    if ($stage === 'pickup' && $bookingId > 0) {
        $bookingStmt = $pdo->prepare(
            'SELECT bookings.id, bookings.service_type,
                    packages.declared_weight, packages.size,
                    pickup.lat AS pickup_lat, pickup.lng AS pickup_lng,
                    pickup.city AS pickup_city, pickup.province AS pickup_province
             FROM bookings
             JOIN packages ON packages.id = bookings.package_id
             JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
             WHERE bookings.id = :id
             LIMIT 1'
        );
        $bookingStmt->execute(['id' => $bookingId]);
        $booking = $bookingStmt->fetch();
        if (!$booking) {
            json_response(['error' => 'Booking not found'], 404);
        }

        $courierStmt = $pdo->query(
            "SELECT users.id, users.full_name, users.status AS user_status,
                    courier_profiles.courier_role, courier_profiles.availability,
                    branches.city AS branch_city, branches.province AS branch_province,
                    branches.lat AS branch_lat, branches.lng AS branch_lng,
                    courier_live_location.latitude AS live_lat, courier_live_location.longitude AS live_lng
             FROM users
             JOIN user_roles ON user_roles.user_id = users.id
             JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
             JOIN courier_profiles ON courier_profiles.user_id = users.id
             LEFT JOIN branches ON branches.id = courier_profiles.branch_id
             LEFT JOIN courier_live_location ON courier_live_location.courier_id = users.id
             WHERE users.status = 'active'
               AND courier_profiles.courier_role IN ('pickup', 'both')
               AND courier_profiles.availability = 'online'
             ORDER BY users.full_name ASC"
        );

        $eligibleCouriers = [];
        foreach ($courierStmt as $row) {
            $vehicle = courier_vehicle_details($pdo, (int)$row['id']);
            $candidate = $row;
            $candidate['vehicle_type'] = $vehicle['type'] ?? null;
            $candidate['vehicle_capacity_kg'] = $vehicle['capacityKg'] ?? null;
            $candidate['vehicle_status'] = $vehicle['status'] ?? null;
            $eligibility = pickup_assignment_is_courier_eligible($pdo, $booking, $candidate);
            if (!$eligibility['eligible']) {
                continue;
            }
            $eligibleCouriers[] = [
                'value' => (int)$row['id'],
                'label' => $row['full_name'],
                'distanceKm' => is_numeric($eligibility['distanceKm'] ?? null)
                    ? (float)$eligibility['distanceKm']
                    : null
            ];
        }

        usort($eligibleCouriers, static function (array $a, array $b): int {
            $aHasDistance = is_numeric($a['distanceKm'] ?? null);
            $bHasDistance = is_numeric($b['distanceKm'] ?? null);
            if ($aHasDistance && $bHasDistance) {
                $aDistance = (float)$a['distanceKm'];
                $bDistance = (float)$b['distanceKm'];
                if ($aDistance < $bDistance) {
                    return -1;
                }
                if ($aDistance > $bDistance) {
                    return 1;
                }
            } elseif ($aHasDistance !== $bHasDistance) {
                return $aHasDistance ? -1 : 1;
            }
            return strcasecmp((string)$a['label'], (string)$b['label']);
        });

        $couriers = [];
        foreach ($eligibleCouriers as $row) {
            $couriers[] = [
                'value' => (int)$row['value'],
                'label' => $row['label']
            ];
        }
        json_response(['couriers' => $couriers]);
    }

    if ($stage === 'delivery' && $bookingId > 0) {
        $bookingStmt = $pdo->prepare(
            'SELECT bookings.id, bookings.service_type, bookings.requires_linehaul,
                    bookings.origin_branch_id, bookings.destination_branch_id,
                    packages.declared_weight, packages.size,
                    pickup.city AS pickup_city, pickup.province AS pickup_province,
                    delivery.city AS delivery_city, delivery.province AS delivery_province
             FROM bookings
             JOIN packages ON packages.id = bookings.package_id
             JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
             JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
             WHERE bookings.id = :id
             LIMIT 1'
        );
        $bookingStmt->execute(['id' => $bookingId]);
        $booking = $bookingStmt->fetch();
        if (!$booking) {
            json_response(['error' => 'Booking not found'], 404);
        }

        $dispatchScope = delivery_assignment_dispatch_scope($pdo, $booking);
        $dispatchBranchId = (int)($dispatchScope['branchId'] ?? 0);
        $dispatchCity = normalize_city_token($dispatchScope['city'] ?? null);

        $courierStmt = $pdo->query(
            "SELECT users.id, users.full_name, users.status AS user_status,
                    courier_profiles.courier_role, courier_profiles.availability, courier_profiles.branch_id,
                    branches.city AS branch_city, branches.province AS branch_province
             FROM users
             JOIN user_roles ON user_roles.user_id = users.id
             JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
             JOIN courier_profiles ON courier_profiles.user_id = users.id
             LEFT JOIN branches ON branches.id = courier_profiles.branch_id
             WHERE users.status = 'active'
               AND courier_profiles.courier_role IN ('delivery', 'both', 'express')
               AND courier_profiles.availability = 'online'
             ORDER BY users.full_name ASC"
        );

        $eligibleCouriers = [];
        foreach ($courierStmt as $row) {
            $vehicle = courier_vehicle_details($pdo, (int)$row['id']);
            $candidate = $row;
            $candidate['vehicle_type'] = $vehicle['type'] ?? null;
            $candidate['vehicle_capacity_kg'] = $vehicle['capacityKg'] ?? null;
            $candidate['vehicle_status'] = $vehicle['status'] ?? null;
            $eligibility = delivery_assignment_is_courier_eligible($pdo, $booking, $candidate, $dispatchScope);
            if (!$eligibility['eligible']) {
                continue;
            }

            $scopeRank = 2;
            if ($dispatchBranchId > 0 && (int)($row['branch_id'] ?? 0) === $dispatchBranchId) {
                $scopeRank = 0;
            } elseif ($dispatchCity !== '' && normalize_city_token($row['branch_city'] ?? null) === $dispatchCity) {
                $scopeRank = 1;
            }

            $eligibleCouriers[] = [
                'value' => (int)$row['id'],
                'label' => $row['full_name'],
                'scopeRank' => $scopeRank
            ];
        }

        usort($eligibleCouriers, static function (array $a, array $b): int {
            $aRank = (int)($a['scopeRank'] ?? 99);
            $bRank = (int)($b['scopeRank'] ?? 99);
            if ($aRank < $bRank) {
                return -1;
            }
            if ($aRank > $bRank) {
                return 1;
            }
            return strcasecmp((string)$a['label'], (string)$b['label']);
        });

        $couriers = [];
        foreach ($eligibleCouriers as $row) {
            $couriers[] = [
                'value' => (int)$row['value'],
                'label' => $row['label']
            ];
        }
        json_response(['couriers' => $couriers]);
    }

    $courierStmt = $pdo->query(
        "SELECT users.id, users.full_name
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
         ORDER BY users.full_name ASC"
    );
    $couriers = [];
    foreach ($courierStmt as $row) {
        $couriers[] = [
            'value' => (int)$row['id'],
            'label' => $row['full_name']
        ];
    }
    json_response(['couriers' => $couriers]);
}

if ($path === '/api/admin/courier-locations' && $method === 'GET') {
    $stmt = $pdo->query(
        "SELECT users.id, users.full_name, users.phone, courier_profiles.courier_role,
                branches.name AS branch_name,
                courier_live_location.latitude, courier_live_location.longitude, courier_live_location.updated_at
         FROM courier_live_location
         JOIN users ON users.id = courier_live_location.courier_id
         LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
         LEFT JOIN branches ON branches.id = courier_profiles.branch_id
         ORDER BY courier_live_location.updated_at DESC"
    );
    $locations = [];
    foreach ($stmt as $row) {
        $locations[] = [
            'courierId' => (int)$row['id'],
            'courierName' => $row['full_name'],
            'phone' => $row['phone'] ?: '',
            'courierRole' => $row['courier_role'] ?: null,
            'branch' => $row['branch_name'] ?: null,
            'latitude' => (float)$row['latitude'],
            'longitude' => (float)$row['longitude'],
            'updatedAt' => $row['updated_at']
        ];
    }
    json_response(['locations' => $locations]);
}

if (preg_match('#^/api/admin/orders/(\d+)/assign$#', $path, $matches) && $method === 'PATCH') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = isset($payload['courierId']) ? (int)$payload['courierId'] : 0;

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.status, bookings.service_type,
                packages.declared_weight, packages.size,
                pickup.lat AS pickup_lat, pickup.lng AS pickup_lng,
                pickup.city AS pickup_city, pickup.province AS pickup_province
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         WHERE bookings.id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $status = normalize_booking_status_code($booking['status']);
    if (in_array($status, ['delivered', 'cancelled'], true)) {
        json_response(['error' => 'Completed bookings cannot be reassigned'], 422);
    }

    if ($courierId > 0) {
        if (!in_array($status, ['created', 'pickup_assigned'], true)) {
            json_response(['error' => 'Only new or assigned bookings can be updated'], 422);
        }

        $courierStmt = $pdo->prepare(
            "SELECT users.id, users.full_name, users.status AS user_status,
                    courier_profiles.courier_role, courier_profiles.availability,
                    branches.city AS branch_city, branches.province AS branch_province,
                    branches.lat AS branch_lat, branches.lng AS branch_lng,
                    courier_live_location.latitude AS live_lat, courier_live_location.longitude AS live_lng
             FROM users
             JOIN user_roles ON user_roles.user_id = users.id
             JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
             LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
             LEFT JOIN branches ON branches.id = courier_profiles.branch_id
             LEFT JOIN courier_live_location ON courier_live_location.courier_id = users.id
             WHERE users.id = :id"
        );
        $courierStmt->execute(['id' => $courierId]);
        $courier = $courierStmt->fetch();
        if (!$courier) {
            json_response(['error' => 'Courier not found'], 404);
        }

        $vehicle = courier_vehicle_details($pdo, $courierId);
        $courier['vehicle_type'] = $vehicle['type'] ?? null;
        $courier['vehicle_capacity_kg'] = $vehicle['capacityKg'] ?? null;
        $courier['vehicle_status'] = $vehicle['status'] ?? null;
        $eligibility = pickup_assignment_is_courier_eligible($pdo, $booking, $courier);
        if (!$eligibility['eligible']) {
            json_response(['error' => 'Selected courier is not eligible for pickup'], 422);
        }

        $pdo->prepare('UPDATE bookings SET courier_id = :courier_id, pickup_courier_id = :courier_id, status = :status WHERE id = :id')
            ->execute([
                'courier_id' => $courierId,
                'status' => 'pickup_assigned',
                'id' => $bookingId
            ]);

        $eventInsert = $pdo->prepare(
            'INSERT INTO booking_status_events (booking_id, status, description)
             VALUES (:booking_id, :status, :description)'
        );
        $eventInsert->execute([
            'booking_id' => $bookingId,
            'status' => 'pickup_assigned',
            'description' => 'Courier assigned'
        ]);
        write_order_event(
            $pdo,
            $bookingId,
            'pickup_assigned',
            'admin',
            null,
            ['action' => 'dispatch_pickup', 'courierId' => $courierId],
            'Courier assigned'
        );

        json_response([
            'message' => 'Courier assigned',
            'booking' => [
                'id' => $bookingId,
                'courierId' => $courierId,
                'courierName' => $courier['full_name'],
                'status' => 'pickup_assigned'
            ]
        ]);
    }

    if (!in_array($status, ['created', 'pickup_assigned'], true)) {
        json_response(['error' => 'Only new or assigned bookings can be updated'], 422);
    }

    $pdo->prepare('UPDATE bookings SET courier_id = NULL, pickup_courier_id = NULL, status = :status WHERE id = :id')
        ->execute([
            'status' => 'created',
            'id' => $bookingId
        ]);

    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => 'created',
        'description' => 'Courier unassigned'
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        'created',
        'admin',
        null,
        ['action' => 'unassign_pickup'],
        'Courier unassigned'
    );

    json_response([
        'message' => 'Courier unassigned',
        'booking' => [
            'id' => $bookingId,
            'courierId' => null,
            'courierName' => null,
            'status' => 'created'
        ]
    ]);
}

if (preg_match('#^/api/admin/orders/(\d+)/assign-delivery$#', $path, $matches) && $method === 'PATCH') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = isset($payload['courierId']) ? (int)$payload['courierId'] : 0;

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.status, bookings.service_type, bookings.requires_linehaul,
                bookings.current_branch_id, bookings.origin_branch_id, bookings.destination_branch_id,
                packages.declared_weight, packages.size,
                pickup.city AS pickup_city, pickup.province AS pickup_province,
                delivery.city AS delivery_city, delivery.province AS delivery_province
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $status = normalize_booking_status_code($booking['status']);
    if (in_array($status, ['delivered', 'cancelled'], true)) {
        json_response(['error' => 'Completed bookings cannot be reassigned'], 422);
    }
    if (booking_has_pending_fine($pdo, $bookingId)) {
        json_response(['error' => 'Delivery assignment is blocked while order is on hold for pending fine'], 422);
    }

    $isIntercity = booking_is_intercity($booking);
    $dispatchReadyStatus = delivery_dispatch_ready_status($isIntercity);
    $allowedStatuses = [$dispatchReadyStatus, 'delivery_assigned', 'waiting_for_reattempt'];
    if (!in_array($status, $allowedStatuses, true)) {
        json_response(['error' => 'Delivery assignment not allowed for current status'], 422);
    }

    $courierStmt = $pdo->prepare(
        "SELECT users.id, users.full_name, users.status AS user_status,
                courier_profiles.courier_role, courier_profiles.availability, courier_profiles.branch_id,
                branches.city AS branch_city, branches.province AS branch_province
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
         LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
         LEFT JOIN branches ON branches.id = courier_profiles.branch_id
         WHERE users.id = :id"
    );
    $courierStmt->execute(['id' => $courierId]);
    $courier = $courierStmt->fetch();
    if (!$courier) {
        json_response(['error' => 'Courier not found'], 404);
    }

    $vehicle = courier_vehicle_details($pdo, $courierId);
    $courier['vehicle_type'] = $vehicle['type'] ?? null;
    $courier['vehicle_capacity_kg'] = $vehicle['capacityKg'] ?? null;
    $courier['vehicle_status'] = $vehicle['status'] ?? null;
    $dispatchScope = delivery_assignment_dispatch_scope($pdo, $booking);
    $eligibility = delivery_assignment_is_courier_eligible($pdo, $booking, $courier, $dispatchScope);
    if (!$eligibility['eligible']) {
        json_response(['error' => 'Selected courier is not eligible for delivery'], 422);
    }

    $pdo->prepare(
        'UPDATE bookings
         SET courier_id = :courier_id,
             delivery_courier_id = :courier_id,
             status = :status,
             delivery_load_confirmed_at = NULL
         WHERE id = :id'
    )
        ->execute([
            'courier_id' => $courierId,
            'status' => 'delivery_assigned',
            'id' => $bookingId
        ]);

    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => 'delivery_assigned',
        'description' => 'Delivery courier assigned'
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        'delivery_assigned',
        'admin',
        null,
        ['action' => 'dispatch_delivery', 'courierId' => $courierId],
        'Delivery courier assigned'
    );

    json_response([
        'message' => 'Delivery courier assigned',
        'booking' => [
            'id' => $bookingId,
            'courierId' => $courierId,
            'courierName' => $courier['full_name'],
            'status' => 'delivery_assigned'
        ]
    ]);
}

if (preg_match('#^/api/admin/orders/(\d+)/assign-linehaul$#', $path, $matches) && $method === 'PATCH') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $courierId = isset($payload['courierId']) ? (int)$payload['courierId'] : 0;

    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.status, bookings.requires_linehaul,
                bookings.current_branch_id, bookings.destination_branch_id,
                pickup.city AS pickup_city, delivery.city AS delivery_city
         FROM bookings
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    if (!booking_is_intercity($booking)) {
        json_response(['error' => 'Linehaul assignment is only valid for inter-city orders'], 422);
    }

    $status = normalize_booking_status_code((string)$booking['status']);
    if ($status !== 'received_at_origin_branch') {
        json_response(['error' => 'Linehaul assignment not allowed for current status'], 422);
    }

    $courierStmt = $pdo->prepare(
        "SELECT users.full_name, courier_profiles.courier_role
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
         LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
         WHERE users.id = :id"
    );
    $courierStmt->execute(['id' => $courierId]);
    $courier = $courierStmt->fetch();
    if (!$courier) {
        json_response(['error' => 'Courier not found'], 404);
    }
    $courierRole = $courier['courier_role'] ?: 'both';
    if (!in_array($courierRole, ['linehaul', 'both', 'express'], true)) {
        json_response(['error' => 'Selected courier is not eligible for linehaul'], 422);
    }

    $pdo->prepare(
        'UPDATE bookings
         SET courier_id = :courier_id,
             linehaul_courier_id = :courier_id,
             status = :status,
             linehaul_load_confirmed_at = NULL
         WHERE id = :id'
    )->execute([
        'courier_id' => $courierId,
        'status' => 'linehaul_assigned',
        'id' => $bookingId
    ]);

    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => 'linehaul_assigned',
        'description' => 'Linehaul courier assigned'
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        'linehaul_assigned',
        'admin',
        null,
        ['action' => 'dispatch_linehaul', 'courierId' => $courierId],
        'Linehaul courier assigned'
    );

    json_response([
        'message' => 'Linehaul courier assigned',
        'booking' => [
            'id' => $bookingId,
            'courierId' => $courierId,
            'courierName' => $courier['full_name'],
            'status' => 'linehaul_assigned'
        ]
    ]);
}

if (preg_match('#^/api/admin/orders/(\d+)/incident-history$#', $path, $matches) && $method === 'GET') {
    $bookingId = (int)$matches[1];
    if ($bookingId <= 0) {
        json_response(['error' => 'Invalid booking id'], 422);
    }

    $bookingStmt = $pdo->prepare('SELECT id, status FROM bookings WHERE id = :id LIMIT 1');
    $bookingStmt->execute(['id' => $bookingId]);
    $bookingRow = $bookingStmt->fetch();
    if (!$bookingRow) {
        json_response(['error' => 'Booking not found'], 404);
    }
    $currentBookingStatus = normalize_booking_status_code((string)($bookingRow['status'] ?? ''));

    $trackedActions = [
        'pickup_cancellation',
        'delivery_cancellation',
        'delivery_failure',
        'final_cancellation',
        'pre_pickup_force_cancellation',
        'delivered_reopen_override',
        'incident_request_approved',
        'incident_request_rejected'
    ];
    $history = [];
    $actorIds = [];
    $hasCancellationRequestsTable = cancellation_requests_table_supported($pdo);

    if ($hasCancellationRequestsTable) {
        $requestStmt = $pdo->prepare(
            "SELECT id, order_id, type, reason, notes, context, actor_courier_id, status,
                    decided_by_admin_id, decided_at, admin_note, created_at
             FROM cancellation_requests
             WHERE order_id = :id AND type = 'pickup'
             ORDER BY id DESC
             LIMIT 40"
        );
        $requestStmt->execute(['id' => $bookingId]);
        foreach ($requestStmt as $row) {
            $requestStatus = strtolower(trim((string)($row['status'] ?? 'pending')));
            $decisionReasonText = null;
            if ($requestStatus === 'approved') {
                $decisionReasonText = 'Approved by admin';
            } elseif ($requestStatus === 'rejected') {
                $decisionReasonText = 'Rejected by admin';
            }

            $actorCourierId = (int)($row['actor_courier_id'] ?? 0);
            $decidedByAdminId = (int)($row['decided_by_admin_id'] ?? 0);
            if ($actorCourierId > 0) {
                $actorIds[] = $actorCourierId;
            }
            if ($decidedByAdminId > 0) {
                $actorIds[] = $decidedByAdminId;
            }

            $history[] = [
                'id' => 'cancellation_request_' . (int)$row['id'],
                'sourceId' => (int)$row['id'],
                'source' => 'cancellation_requests',
                'type' => 'pickup_cancellation',
                'typeLabel' => 'Pickup Cancellation',
                'status' => $currentBookingStatus !== '' ? $currentBookingStatus : null,
                'reasonCode' => null,
                'reasonText' => trim((string)($row['reason'] ?? '')) ?: null,
                'notes' => trim((string)($row['notes'] ?? '')) ?: null,
                'description' => null,
                'actionContext' => trim((string)($row['context'] ?? '')) ?: null,
                'decisionStatus' => $requestStatus !== '' ? $requestStatus : 'pending',
                'decisionReasonCode' => null,
                'decisionReasonText' => $decisionReasonText,
                'decisionNotes' => trim((string)($row['admin_note'] ?? '')) ?: null,
                'relatedIncidentEventId' => null,
                'refundAction' => null,
                'refundAmount' => null,
                'refundMessage' => null,
                'actorType' => 'courier',
                'actorId' => $actorCourierId > 0 ? $actorCourierId : null,
                'actorName' => null,
                'createdAt' => $row['created_at']
            ];
        }
    }

    if (order_events_table_supported($pdo)) {
        $eventStmt = $pdo->prepare(
            'SELECT id, status, actor_type, actor_id, metadata, created_at
             FROM order_events
             WHERE order_id = :id
             ORDER BY created_at DESC, id DESC
             LIMIT 40'
        );
        $eventStmt->execute(['id' => $bookingId]);
        foreach ($eventStmt as $row) {
            $metadataRaw = $row['metadata'] ?? null;
            $metadata = null;
            if (is_string($metadataRaw) && trim($metadataRaw) !== '') {
                $decoded = json_decode($metadataRaw, true);
                if (is_array($decoded)) {
                    $metadata = $decoded;
                }
            }
            if (!is_array($metadata)) {
                continue;
            }
            $action = strtolower(trim((string)($metadata['action'] ?? '')));
            if (!in_array($action, $trackedActions, true)) {
                continue;
            }
            $linkedRequestId = isset($metadata['requestId']) ? (int)$metadata['requestId'] : 0;
            if ($hasCancellationRequestsTable && $action === 'pickup_cancellation' && $linkedRequestId > 0) {
                // Render pickup cancellation request rows from cancellation_requests table.
                continue;
            }
            $reasonCode = strtolower(trim((string)($metadata['reasonCode'] ?? '')));
            $reasonText = trim((string)($metadata['reasonText'] ?? ''));
            if ($reasonText === '' && $reasonCode !== '') {
                $reasonText = cancellation_reason_label(
                    $action === 'final_cancellation' ? 'final_cancellation' : $action,
                    $reasonCode
                );
            }
            $actorId = isset($row['actor_id']) ? (int)$row['actor_id'] : null;
            if ($actorId !== null && $actorId > 0) {
                $actorIds[] = $actorId;
            }
            $refundAction = trim((string)($metadata['refundAction'] ?? ''));
            $refundAmount = to_decimal_or_null($metadata['refundAmount'] ?? null);
            $refundResult = is_array($metadata['refundResult'] ?? null) ? $metadata['refundResult'] : null;
            $decisionStatus = trim((string)($metadata['decisionStatus'] ?? ''));
            $decisionReasonCode = trim((string)($metadata['decisionReasonCode'] ?? ''));
            $decisionReasonText = trim((string)($metadata['decisionReasonText'] ?? ''));
            $decisionNotes = trim((string)($metadata['decisionNotes'] ?? ''));
            if ($action === 'final_cancellation' && $decisionStatus === '') {
                $decisionStatus = 'accepted';
            }
            if ($action === 'incident_request_approved' && $decisionStatus === '') {
                $decisionStatus = 'approved';
            }
            if ($action === 'incident_request_rejected' && $decisionStatus === '') {
                $decisionStatus = 'rejected';
            }
            $incidentDecisionReference = isset($metadata['incidentEventId']) ? (int)$metadata['incidentEventId'] : null;
            $history[] = [
                'id' => 'order_event_' . (int)$row['id'],
                'sourceId' => (int)$row['id'],
                'source' => 'order_events',
                'type' => $action,
                'typeLabel' => format_code_label($action),
                'status' => normalize_booking_status_code((string)$row['status']),
                'reasonCode' => $reasonCode !== '' ? $reasonCode : null,
                'reasonText' => $reasonText !== '' ? $reasonText : null,
                'notes' => trim((string)($metadata['notes'] ?? '')) ?: null,
                'description' => trim((string)($metadata['description'] ?? '')) ?: null,
                'actionContext' => trim((string)($metadata['actionContext'] ?? '')) ?: null,
                'decisionStatus' => $decisionStatus !== '' ? strtolower($decisionStatus) : null,
                'decisionReasonCode' => $decisionReasonCode !== '' ? strtolower($decisionReasonCode) : null,
                'decisionReasonText' => $decisionReasonText !== '' ? $decisionReasonText : null,
                'decisionNotes' => $decisionNotes !== '' ? $decisionNotes : null,
                'relatedIncidentEventId' => $incidentDecisionReference !== null && $incidentDecisionReference > 0
                    ? $incidentDecisionReference
                    : null,
                'refundAction' => $refundAction !== '' ? $refundAction : null,
                'refundAmount' => $refundAmount,
                'refundMessage' => $refundResult ? (trim((string)($refundResult['message'] ?? '')) ?: null) : null,
                'actorType' => normalize_actor_type((string)($row['actor_type'] ?? 'system')),
                'actorId' => $actorId !== null && $actorId > 0 ? $actorId : null,
                'actorName' => null,
                'createdAt' => $row['created_at']
            ];
        }
    }

    if (count($history) === 0) {
        $fallbackStmt = $pdo->prepare(
            "SELECT id, status, description, occurred_at
             FROM booking_status_events
             WHERE booking_id = :id
               AND (
                   description LIKE 'Courier incident (%'
                   OR description LIKE 'Booking cancelled by admin (final)%'
                   OR description LIKE 'Booking force-cancelled by admin (pre-pickup)%'
               )
             ORDER BY occurred_at DESC, id DESC
             LIMIT 40"
        );
        $fallbackStmt->execute(['id' => $bookingId]);
        foreach ($fallbackStmt as $row) {
            $description = trim((string)($row['description'] ?? ''));
            if ($description === '') {
                continue;
            }
            $type = 'incident';
            $reasonText = null;
            $notes = null;
            if (preg_match('/^Courier incident \(([^)]+)\):\s*([^|]+)/i', $description, $matchesDescription)) {
                $type = strtolower(trim((string)$matchesDescription[1]));
                $reasonText = trim((string)$matchesDescription[2]);
            } elseif (preg_match('/^Booking cancelled by admin \(final\):\s*([^|]+)/i', $description, $matchesDescription)) {
                $type = 'final_cancellation';
                $reasonText = trim((string)$matchesDescription[1]);
            } elseif (preg_match('/^Booking force-cancelled by admin \(pre-pickup\):\s*([^|]+)/i', $description, $matchesDescription)) {
                $type = 'pre_pickup_force_cancellation';
                $reasonText = trim((string)$matchesDescription[1]);
            }
            if (preg_match('/\|\s*Notes:\s*(.+)$/i', $description, $noteMatches)) {
                $notes = trim((string)$noteMatches[1]);
            }
            $history[] = [
                'id' => 'status_event_' . (int)$row['id'],
                'sourceId' => (int)$row['id'],
                'source' => 'booking_status_events',
                'type' => $type,
                'typeLabel' => format_code_label($type),
                'status' => normalize_booking_status_code((string)$row['status']),
                'reasonCode' => null,
                'reasonText' => $reasonText,
                'notes' => $notes,
                'description' => $description,
                'actionContext' => null,
                'decisionStatus' => null,
                'decisionReasonCode' => null,
                'decisionReasonText' => null,
                'decisionNotes' => null,
                'relatedIncidentEventId' => null,
                'refundAction' => null,
                'refundAmount' => null,
                'refundMessage' => null,
                'actorType' => 'system',
                'actorId' => null,
                'actorName' => null,
                'createdAt' => $row['occurred_at']
            ];
        }
    }

    $actorIds = array_values(array_unique(array_filter($actorIds, function ($value) {
        return is_int($value) && $value > 0;
    })));
    $actorNameById = [];
    if (count($actorIds) > 0) {
        $placeholders = [];
        $params = [];
        foreach ($actorIds as $index => $actorId) {
            $key = ':actor_id_' . $index;
            $placeholders[] = $key;
            $params['actor_id_' . $index] = $actorId;
        }
        $userStmt = $pdo->prepare(
            'SELECT id, full_name
             FROM users
             WHERE id IN (' . implode(',', $placeholders) . ')'
        );
        $userStmt->execute($params);
        foreach ($userStmt as $row) {
            $actorNameById[(int)$row['id']] = $row['full_name'] ?: null;
        }
    }

    $history = array_map(function ($entry) use ($actorNameById) {
        $actorId = isset($entry['actorId']) ? (int)$entry['actorId'] : 0;
        if ($actorId > 0 && isset($actorNameById[$actorId])) {
            $entry['actorName'] = $actorNameById[$actorId];
        }
        return $entry;
    }, $history);

    usort($history, function ($a, $b) {
        $aTs = strtotime((string)($a['createdAt'] ?? '')) ?: 0;
        $bTs = strtotime((string)($b['createdAt'] ?? '')) ?: 0;
        if ($aTs === $bTs) {
            $aId = (int)($a['sourceId'] ?? 0);
            $bId = (int)($b['sourceId'] ?? 0);
            return $bId <=> $aId;
        }
        return $bTs <=> $aTs;
    });

    json_response(['history' => $history]);
}

if (preg_match('#^/api/admin/orders/(\d+)/incident-decision$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $incidentEventId = (int)($payload['incidentEventId'] ?? 0);
    $decision = strtolower(trim((string)($payload['decision'] ?? '')));
    $reasonCode = strtolower(trim((string)($payload['reasonCode'] ?? '')));
    $reasonText = trim((string)($payload['reasonText'] ?? ''));
    $notes = trim((string)($payload['notes'] ?? ''));
    $adminId = isset($payload['adminId']) ? (int)$payload['adminId'] : null;

    if ($bookingId <= 0 || $incidentEventId <= 0) {
        json_response(['error' => 'bookingId and incidentEventId are required'], 422);
    }
    if (!in_array($decision, ['approved', 'rejected'], true)) {
        json_response(['error' => 'Decision must be approved or rejected'], 422);
    }

    $rejectionReasons = [
        'insufficient_evidence' => 'Insufficient evidence',
        'invalid_stage' => 'Invalid stage for cancellation',
        'policy_violation' => 'Policy violation',
        'customer_declined' => 'Customer declined cancellation',
        'other' => 'Other'
    ];
    if ($decision === 'rejected' && !array_key_exists($reasonCode, $rejectionReasons)) {
        json_response(['error' => 'Valid rejection reason is required'], 422);
    }
    if ($adminId === null || $adminId <= 0 || !user_has_role($pdo, $adminId, 'admin')) {
        json_response(['error' => 'Valid adminId is required'], 422);
    }
    if (!order_events_table_supported($pdo)) {
        json_response(['error' => 'Order events table is required for incident decisions'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status, customer_id, courier_id, delivery_courier_id
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $incidentStmt = $pdo->prepare(
        'SELECT id, status, actor_type, actor_id, metadata
         FROM order_events
         WHERE id = :event_id AND order_id = :booking_id
         LIMIT 1'
    );
    $incidentStmt->execute([
        'event_id' => $incidentEventId,
        'booking_id' => $bookingId
    ]);
    $incidentEvent = $incidentStmt->fetch();
    if (!$incidentEvent) {
        json_response(['error' => 'Incident event not found'], 404);
    }

    $incidentMetadataRaw = $incidentEvent['metadata'] ?? null;
    $incidentMetadata = [];
    if (is_string($incidentMetadataRaw) && trim($incidentMetadataRaw) !== '') {
        $decoded = json_decode($incidentMetadataRaw, true);
        if (is_array($decoded)) {
            $incidentMetadata = $decoded;
        }
    }
    $incidentAction = strtolower(trim((string)($incidentMetadata['action'] ?? '')));
    if (!in_array($incidentAction, ['pickup_cancellation', 'delivery_cancellation', 'delivery_failure'], true)) {
        json_response(['error' => 'Selected event is not a courier incident request'], 422);
    }
    $incidentRequestId = isset($incidentMetadata['requestId']) ? (int)$incidentMetadata['requestId'] : 0;
    if ($incidentAction === 'pickup_cancellation' && $incidentRequestId > 0 && cancellation_requests_table_supported($pdo)) {
        json_response(['error' => 'Use pickup-cancellation approve/reject endpoints for this request'], 422);
    }
    if ($decision === 'approved' && $incidentAction !== 'delivery_failure') {
        json_response(['error' => 'Approval is currently supported only for delivery failure requests'], 422);
    }

    $existingDecisionStatus = strtolower(trim((string)($incidentMetadata['decisionStatus'] ?? 'pending')));
    if ($existingDecisionStatus !== '' && $existingDecisionStatus !== 'pending') {
        json_response(['error' => 'Incident request already decided'], 409);
    }

    $resolvedReasonText = '';
    if ($decision === 'rejected') {
        $resolvedReasonText = $reasonText !== '' ? $reasonText : $rejectionReasons[$reasonCode];
    } else {
        $resolvedReasonText = $reasonText !== '' ? $reasonText : 'Approved by admin';
    }
    $incidentMetadata['decisionStatus'] = $decision;
    $incidentMetadata['decisionReasonCode'] = $decision === 'rejected' ? $reasonCode : null;
    $incidentMetadata['decisionReasonText'] = $resolvedReasonText;
    $incidentMetadata['decisionNotes'] = $notes !== '' ? $notes : null;
    $incidentMetadata['decisionAt'] = date('Y-m-d H:i:s');
    $incidentMetadata['decisionBy'] = $adminId;

    $updateIncidentStmt = $pdo->prepare(
        'UPDATE order_events
         SET metadata = :metadata
         WHERE id = :id'
    );
    $updateIncidentStmt->execute([
        'metadata' => json_encode($incidentMetadata),
        'id' => $incidentEventId
    ]);

    $bookingStatus = normalize_booking_status_code((string)$booking['status']);
    if ($incidentAction === 'delivery_failure') {
        if ($decision === 'rejected' && in_array($bookingStatus, ['delivery_attempt_failed', 'waiting_for_reattempt'], true)) {
            $requesterCourierId = (int)($incidentEvent['actor_id'] ?? 0);
            $setParts = ['status = :status'];
            $updateParams = [
                'status' => 'out_for_delivery',
                'id' => $bookingId
            ];
            if ($requesterCourierId > 0) {
                $setParts[] = 'courier_id = :courier_id';
                $setParts[] = 'delivery_courier_id = :delivery_courier_id';
                $updateParams['courier_id'] = $requesterCourierId;
                $updateParams['delivery_courier_id'] = $requesterCourierId;
            }
            $pdo->prepare('UPDATE bookings SET ' . implode(', ', $setParts) . ' WHERE id = :id')
                ->execute($updateParams);
            $bookingStatus = 'out_for_delivery';
        }
        if ($decision === 'approved' && $bookingStatus === 'out_for_delivery') {
            $pdo->prepare(
                "UPDATE bookings
                 SET status = 'delivery_attempt_failed'
                 WHERE id = :id"
            )->execute(['id' => $bookingId]);
            $bookingStatus = 'delivery_attempt_failed';
        }
    }
    $incidentLabel = format_code_label($incidentAction);
    if ($decision === 'approved') {
        $description = sprintf('Admin approved %s request', $incidentLabel);
    } else {
        $description = sprintf('Admin rejected %s request', $incidentLabel);
    }
    if ($resolvedReasonText !== '') {
        $description .= '. Reason: ' . $resolvedReasonText;
    }
    if ($notes !== '') {
        $description .= ' | Notes: ' . $notes;
    }

    $statusEventStmt = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $statusEventStmt->execute([
        'booking_id' => $bookingId,
        'status' => $bookingStatus,
        'description' => $description
    ]);

    write_order_event(
        $pdo,
        $bookingId,
        $bookingStatus,
        'admin',
        $adminId,
        [
            'action' => $decision === 'approved' ? 'incident_request_approved' : 'incident_request_rejected',
            'incidentEventId' => $incidentEventId,
            'incidentAction' => $incidentAction,
            'reasonCode' => $decision === 'rejected' ? $reasonCode : null,
            'reasonText' => $resolvedReasonText,
            'notes' => $notes !== '' ? $notes : null
        ],
        $description
    );

    add_system_alert(
        $pdo,
        'shipment',
        $decision === 'approved' ? 'Incident Request Approved' : 'Incident Request Rejected',
        sprintf(
            '%s | %s | %s',
            trim((string)($booking['booking_code'] ?? '')) ?: ('Booking #' . $bookingId),
            $incidentLabel,
            $resolvedReasonText !== '' ? $resolvedReasonText : strtoupper($decision)
        ),
        $decision === 'approved'
            ? 'Courier and customer notified with approval decision.'
            : 'Courier and customer notified with rejection reason.'
    );

    $senderIdForMessage = $adminId !== null && $adminId > 0 ? $adminId : 0;
    $requesterCourierId = (int)($incidentEvent['actor_id'] ?? 0);
    $customerId = (int)($booking['customer_id'] ?? 0);
    if ($decision === 'approved') {
        $decisionMessage = sprintf(
            'Admin approved %s request.',
            strtolower($incidentLabel)
        );
        if ($incidentAction === 'delivery_failure') {
            $decisionMessage .= ' Parcel is queued for reattempt assignment.';
        }
    } else {
        $decisionMessage = sprintf(
            'Admin rejected %s request. Reason: %s.',
            strtolower($incidentLabel),
            $resolvedReasonText
        );
    }
    if ($decision === 'approved' && $resolvedReasonText !== '') {
        $decisionMessage .= ' Reason: ' . $resolvedReasonText . '.';
    }
    if ($notes !== '') {
        $decisionMessage .= ' Notes: ' . $notes;
    }
    if ($senderIdForMessage > 0) {
        if ($requesterCourierId > 0 && $requesterCourierId !== $senderIdForMessage) {
            insert_booking_message(
                $pdo,
                $bookingId,
                $senderIdForMessage,
                'courier',
                $requesterCourierId,
                'courier',
                $decisionMessage
            );
        }
        if ($customerId > 0) {
            insert_booking_message(
                $pdo,
                $bookingId,
                $senderIdForMessage,
                'courier',
                $customerId,
                'customer',
                $decisionMessage
            );
        }
    }

    json_response([
        'message' => $decision === 'approved'
            ? 'Incident request approved and notifications sent.'
            : 'Incident request rejected and notifications sent.',
        'booking' => [
            'id' => $bookingId,
            'status' => $bookingStatus
        ],
        'decision' => [
            'incidentEventId' => $incidentEventId,
            'decision' => $decision,
            'reasonCode' => $decision === 'rejected' ? $reasonCode : null,
            'reasonText' => $resolvedReasonText
        ]
    ]);
}

if (preg_match('#^/api/orders/(\d+)/reactivation-request$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $customerId = isset($payload['customerId']) ? (int)$payload['customerId'] : 0;
    $notes = trim((string)($payload['notes'] ?? ''));

    if ($bookingId <= 0 || $customerId <= 0) {
        json_response(['error' => 'bookingId and customerId are required'], 422);
    }
    if (!order_events_table_supported($pdo)) {
        json_response(['error' => 'Order events table is required for reactivation requests'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status, customer_id
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    if ((int)$booking['customer_id'] !== $customerId) {
        json_response(['error' => 'Access denied'], 403);
    }

    $status = normalize_booking_status_code((string)$booking['status']);
    if (!in_array($status, ['rts_pending', 'returned_to_sender'], true)) {
        json_response(['error' => 'Reactivation can only be requested after RTS processing starts'], 422);
    }

    $scanStmt = $pdo->prepare(
        'SELECT id, metadata
         FROM order_events
         WHERE order_id = :order_id
         ORDER BY id DESC
         LIMIT 200'
    );
    $scanStmt->execute(['order_id' => $bookingId]);
    foreach ($scanStmt as $row) {
        $metadataRaw = $row['metadata'] ?? null;
        if (!is_string($metadataRaw) || trim($metadataRaw) === '') {
            continue;
        }
        $metadata = json_decode($metadataRaw, true);
        if (!is_array($metadata)) {
            continue;
        }
        $action = strtolower(trim((string)($metadata['action'] ?? '')));
        if ($action !== 'sender_reactivation_request') {
            continue;
        }
        $requestStatus = strtolower(trim((string)($metadata['requestStatus'] ?? 'pending')));
        if ($requestStatus === 'pending') {
            json_response(['error' => 'A reactivation request is already pending for this order'], 409);
        }
        break;
    }

    $description = 'Sender requested reactivation after RTS.';
    if ($notes !== '') {
        $description .= ' Notes: ' . $notes;
    }

    $statusEventStmt = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $statusEventStmt->execute([
        'booking_id' => $bookingId,
        'status' => $status,
        'description' => $description
    ]);

    write_order_event(
        $pdo,
        $bookingId,
        $status,
        'customer',
        $customerId,
        [
            'action' => 'sender_reactivation_request',
            'requestStatus' => 'pending',
            'requestedAt' => date('Y-m-d H:i:s'),
            'notes' => $notes !== '' ? $notes : null
        ],
        $description
    );

    add_system_alert(
        $pdo,
        'shipment',
        'RTS Reactivation Requested',
        sprintf(
            '%s | Sender requested reactivation',
            trim((string)($booking['booking_code'] ?? '')) ?: ('Booking #' . $bookingId)
        ),
        'Review sender confirmation and reactivate shipment if approved.'
    );

    json_response([
        'message' => 'Reactivation request submitted for admin review.',
        'request' => [
            'bookingId' => $bookingId,
            'status' => 'pending'
        ]
    ], 201);
}

if (preg_match('#^/api/admin/orders/(\d+)/reactivate$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $adminId = isset($payload['adminId']) ? (int)$payload['adminId'] : 0;
    $notes = trim((string)($payload['notes'] ?? ''));

    if ($bookingId <= 0 || $adminId <= 0) {
        json_response(['error' => 'bookingId and adminId are required'], 422);
    }
    if (!user_has_role($pdo, $adminId, 'admin')) {
        json_response(['error' => 'Only admin can reactivate RTS orders'], 403);
    }
    if (!order_events_table_supported($pdo)) {
        json_response(['error' => 'Order events table is required for reactivation'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $status = normalize_booking_status_code((string)$booking['status']);
    if ($status !== 'returned_to_sender') {
        json_response(['error' => 'Only returned_to_sender orders can be reactivated'], 422);
    }

    $pendingRequestEventId = 0;
    $pendingRequestMetadata = [];
    $scanStmt = $pdo->prepare(
        'SELECT id, metadata
         FROM order_events
         WHERE order_id = :order_id
         ORDER BY id DESC
         LIMIT 250'
    );
    $scanStmt->execute(['order_id' => $bookingId]);
    foreach ($scanStmt as $row) {
        $metadataRaw = $row['metadata'] ?? null;
        if (!is_string($metadataRaw) || trim($metadataRaw) === '') {
            continue;
        }
        $metadata = json_decode($metadataRaw, true);
        if (!is_array($metadata)) {
            continue;
        }
        $action = strtolower(trim((string)($metadata['action'] ?? '')));
        if ($action !== 'sender_reactivation_request') {
            continue;
        }
        $requestStatus = strtolower(trim((string)($metadata['requestStatus'] ?? 'pending')));
        if ($requestStatus === 'pending') {
            $pendingRequestEventId = (int)$row['id'];
            $pendingRequestMetadata = $metadata;
            break;
        }
    }
    if ($pendingRequestEventId <= 0) {
        json_response(['error' => 'No pending sender reactivation request found'], 422);
    }

    $pendingRequestMetadata['requestStatus'] = 'approved';
    $pendingRequestMetadata['approvedAt'] = date('Y-m-d H:i:s');
    $pendingRequestMetadata['approvedBy'] = $adminId;
    if ($notes !== '') {
        $pendingRequestMetadata['approvalNotes'] = $notes;
    }
    $pdo->prepare(
        'UPDATE order_events
         SET metadata = :metadata
         WHERE id = :id'
    )->execute([
        'metadata' => json_encode($pendingRequestMetadata),
        'id' => $pendingRequestEventId
    ]);

    $pdo->prepare(
        'UPDATE bookings
         SET status = :status,
             courier_id = NULL,
             pickup_courier_id = NULL,
             linehaul_courier_id = NULL,
             delivery_courier_id = NULL,
             current_branch_id = origin_branch_id,
             linehaul_load_confirmed_at = NULL,
             delivery_load_confirmed_at = NULL
         WHERE id = :id'
    )->execute([
        'status' => 'created',
        'id' => $bookingId
    ]);

    $description = 'Booking reactivated by admin after sender confirmation.';
    if ($notes !== '') {
        $description .= ' Notes: ' . $notes;
    }
    $statusEventStmt = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $statusEventStmt->execute([
        'booking_id' => $bookingId,
        'status' => 'created',
        'description' => $description
    ]);

    write_order_event(
        $pdo,
        $bookingId,
        'created',
        'admin',
        $adminId,
        [
            'action' => 'rts_reactivation_approved',
            'requestEventId' => $pendingRequestEventId,
            'notes' => $notes !== '' ? $notes : null
        ],
        $description
    );

    json_response([
        'message' => 'RTS order reactivated and moved back to created status.',
        'booking' => [
            'id' => $bookingId,
            'status' => 'created'
        ]
    ]);
}

if (preg_match('#^/(?:api/)?admin/orders/(\d+)/pickup-cancellation/(\d+)/approve$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $requestId = (int)$matches[2];
    $payload = get_json_body();
    $adminId = isset($payload['adminId']) ? (int)$payload['adminId'] : 0;
    $adminNote = trim((string)($payload['adminNote'] ?? $payload['notes'] ?? ''));

    if ($bookingId <= 0 || $requestId <= 0) {
        json_response(['error' => 'Valid orderId and requestId are required'], 422);
    }
    if ($adminId <= 0 || !user_has_role($pdo, $adminId, 'admin')) {
        json_response(['error' => 'Only admin can approve pickup cancellation'], 403);
    }
    $hasCancellationRequestsTable = cancellation_requests_table_supported($pdo);

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status, customer_id, courier_id, pickup_courier_id, delivery_courier_id, linehaul_courier_id
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $requestSource = null;
    $requestRow = null;

    if ($hasCancellationRequestsTable) {
        $requestStmt = $pdo->prepare(
            "SELECT id, order_id, type, reason, notes, context, actor_courier_id, status, decided_by_admin_id, decided_at, admin_note
             FROM cancellation_requests
             WHERE id = :id AND order_id = :order_id AND type = 'pickup'
             LIMIT 1"
        );
        $requestStmt->execute([
            'id' => $requestId,
            'order_id' => $bookingId
        ]);
        $requestRow = $requestStmt->fetch();
        if ($requestRow) {
            $requestSource = 'cancellation_requests';
        }
    }

    if ($requestSource === null) {
        if (!order_events_table_supported($pdo)) {
            json_response(['error' => 'Pickup cancellation request not found'], 404);
        }
        $eventRequestStmt = $pdo->prepare(
            'SELECT id, actor_id, metadata
             FROM order_events
             WHERE id = :id AND order_id = :order_id
             LIMIT 1'
        );
        $eventRequestStmt->execute([
            'id' => $requestId,
            'order_id' => $bookingId
        ]);
        $eventRequest = $eventRequestStmt->fetch();
        if (!$eventRequest) {
            json_response(['error' => 'Pickup cancellation request not found'], 404);
        }
        $eventMetadataRaw = $eventRequest['metadata'] ?? null;
        $eventMetadata = [];
        if (is_string($eventMetadataRaw) && trim($eventMetadataRaw) !== '') {
            $decoded = json_decode($eventMetadataRaw, true);
            if (is_array($decoded)) {
                $eventMetadata = $decoded;
            }
        }
        $eventAction = strtolower(trim((string)($eventMetadata['action'] ?? '')));
        if ($eventAction !== 'pickup_cancellation') {
            json_response(['error' => 'Selected request is not a pickup cancellation request'], 422);
        }
        $decisionStatus = strtolower(trim((string)($eventMetadata['decisionStatus'] ?? 'pending')));
        if ($decisionStatus !== '' && $decisionStatus !== 'pending') {
            json_response(['error' => 'Pickup cancellation request is already decided'], 409);
        }

        $latestPickupEventId = latest_pickup_cancellation_order_event_id($pdo, $bookingId);
        if ($latestPickupEventId <= 0 || $latestPickupEventId !== $requestId) {
            json_response(['error' => 'Only the latest pickup cancellation request can be approved'], 409);
        }

        $requestSource = 'order_events';
        $requestRow = [
            'id' => (int)$eventRequest['id'],
            'reason' => trim((string)($eventMetadata['reasonText'] ?? '')),
            'notes' => trim((string)($eventMetadata['notes'] ?? '')),
            'context' => trim((string)($eventMetadata['actionContext'] ?? '')),
            'actor_courier_id' => (int)($eventRequest['actor_id'] ?? 0),
            'status' => $decisionStatus !== '' ? $decisionStatus : 'pending'
        ];
    }

    if ($requestSource === 'cancellation_requests') {
        $latestStmt = $pdo->prepare(
            "SELECT id, status
             FROM cancellation_requests
             WHERE order_id = :order_id AND type = 'pickup'
             ORDER BY id DESC
             LIMIT 1"
        );
        $latestStmt->execute(['order_id' => $bookingId]);
        $latestRow = $latestStmt->fetch();
        if (!$latestRow || (int)$latestRow['id'] !== $requestId) {
            json_response(['error' => 'Only the latest pickup cancellation request can be approved'], 409);
        }
    }

    $requestStatus = strtolower(trim((string)($requestRow['status'] ?? 'pending')));
    if ($requestStatus !== 'pending') {
        json_response(['error' => 'Pickup cancellation request is already decided'], 409);
    }

    $currentStatus = normalize_booking_status_code((string)($booking['status'] ?? ''));
    $approvableStatuses = ['created', 'pickup_assigned', 'in_transit_to_origin_branch'];
    if (!in_array($currentStatus, $approvableStatuses, true)) {
        json_response(['error' => 'Pickup cancellation approval is not allowed for the current order status'], 422);
    }
    if ($currentStatus === 'cancelled') {
        json_response(['error' => 'Order is already cancelled'], 409);
    }

    $reasonText = trim((string)($requestRow['reason'] ?? ''));
    if ($reasonText === '') {
        $reasonText = 'Pickup cancellation approved';
    }

    $refundResult = [
        'action' => 'full_refund',
        'applied' => false,
        'amount' => 0.0,
        'paymentId' => null,
        'paymentStatus' => null,
        'message' => ''
    ];

    $oldCourierIds = array_values(array_unique(array_filter([
        (int)($requestRow['actor_courier_id'] ?? 0),
        (int)($booking['pickup_courier_id'] ?? 0),
        (int)($booking['courier_id'] ?? 0),
        (int)($booking['delivery_courier_id'] ?? 0),
        (int)($booking['linehaul_courier_id'] ?? 0)
    ], function ($value) {
        return (int)$value > 0;
    })));

    try {
        $pdo->beginTransaction();

        if ($requestSource === 'cancellation_requests') {
            $requestUpdateStmt = $pdo->prepare(
                "UPDATE cancellation_requests
                 SET status = 'approved',
                     decided_by_admin_id = :admin_id,
                     decided_at = CURRENT_TIMESTAMP,
                     admin_note = :admin_note
                 WHERE id = :id
                   AND status = 'pending'"
            );
            $requestUpdateStmt->execute([
                'admin_id' => $adminId,
                'admin_note' => $adminNote !== '' ? $adminNote : null,
                'id' => $requestId
            ]);
            if ($requestUpdateStmt->rowCount() < 1) {
                throw new RuntimeException('Pickup cancellation request is no longer pending');
            }
        }

        $paymentStmt = $pdo->prepare(
            'SELECT id, status, total, method, provider_payload
             FROM payments
             WHERE booking_id = :id
             ORDER BY id DESC
             LIMIT 1'
        );
        $paymentStmt->execute(['id' => $bookingId]);
        $payment = $paymentStmt->fetch();
        if ($payment) {
            $refundResult['paymentId'] = (int)$payment['id'];
            $refundResult['paymentStatus'] = strtolower(trim((string)($payment['status'] ?? '')));
            $paymentStatus = strtolower(trim((string)($payment['status'] ?? '')));
            $paymentMethod = strtolower(trim((string)($payment['method'] ?? '')));
            $paymentTotal = $payment['total'] !== null ? (float)$payment['total'] : 0.0;

            if ($paymentMethod === 'cash') {
                $refundResult['message'] = 'Cash payment. Manual refund handling required.';
            } elseif ($paymentStatus !== 'paid') {
                $refundResult['message'] = 'No paid transaction to refund.';
            } elseif ($paymentTotal <= 0) {
                $refundResult['message'] = 'Paid amount is zero. Refund skipped.';
            } else {
                $providerPayload = [];
                if (isset($payment['provider_payload']) && $payment['provider_payload'] !== null && trim((string)$payment['provider_payload']) !== '') {
                    $decodedPayload = json_decode((string)$payment['provider_payload'], true);
                    if (is_array($decodedPayload)) {
                        $providerPayload = $decodedPayload;
                    }
                }
                $providerPayload['adminRefund'] = [
                    'action' => 'full_refund',
                    'amount' => $paymentTotal,
                    'approvedAt' => date('Y-m-d H:i:s'),
                    'adminId' => $adminId,
                    'reason' => $reasonText,
                    'notes' => $adminNote !== '' ? $adminNote : null
                ];
                $refundUpdateStmt = $pdo->prepare(
                    "UPDATE payments
                     SET status = 'refunded',
                         provider_payload = :provider_payload
                     WHERE id = :id"
                );
                $refundUpdateStmt->execute([
                    'provider_payload' => json_encode($providerPayload),
                    'id' => (int)$payment['id']
                ]);
                $refundResult['applied'] = true;
                $refundResult['amount'] = $paymentTotal;
                $refundResult['paymentStatus'] = 'refunded';
                $refundResult['message'] = 'Full refund marked as refunded.';
            }
        } else {
            $refundResult['message'] = 'No payment record found.';
        }

        $bookingUpdateStmt = $pdo->prepare(
            "UPDATE bookings
             SET status = :status,
                 courier_id = NULL,
                 pickup_courier_id = NULL,
                 delivery_courier_id = NULL,
                 linehaul_courier_id = NULL
             WHERE id = :id"
        );
        $bookingUpdateStmt->execute([
            'status' => 'cancelled',
            'id' => $bookingId
        ]);

        $description = 'Pickup cancellation approved by admin: ' . $reasonText;
        if ($adminNote !== '') {
            $description .= ' | Admin note: ' . $adminNote;
        }
        $statusEventStmt = $pdo->prepare(
            'INSERT INTO booking_status_events (booking_id, status, description)
             VALUES (:booking_id, :status, :description)'
        );
        $statusEventStmt->execute([
            'booking_id' => $bookingId,
            'status' => 'cancelled',
            'description' => $description
        ]);

        write_order_event(
            $pdo,
            $bookingId,
            'cancelled',
            'admin',
            $adminId,
            [
                'action' => 'pickup_cancellation_approved',
                'requestId' => $requestId,
                'reasonText' => $reasonText,
                'requestNotes' => trim((string)($requestRow['notes'] ?? '')) ?: null,
                'adminNote' => $adminNote !== '' ? $adminNote : null,
                'context' => trim((string)($requestRow['context'] ?? '')) ?: null,
                'refundResult' => $refundResult
            ],
            $description
        );

        update_pickup_cancellation_order_event_decision(
            $pdo,
            $bookingId,
            $requestId,
            'approved',
            'approved',
            'Approved by admin',
            $adminNote !== '' ? $adminNote : null,
            $adminId
        );

        $bookingCode = trim((string)($booking['booking_code'] ?? ''));
        add_system_alert(
            $pdo,
            'shipment',
            'Pickup Cancellation Approved',
            sprintf(
                '%s | Pickup cancellation approved | %s',
                $bookingCode !== '' ? $bookingCode : ('Booking #' . $bookingId),
                $reasonText
            ),
            'Order cancelled and pickup assignment cleared by admin.'
        );

        $courierRecipientId = (int)($requestRow['actor_courier_id'] ?? 0);
        if ($courierRecipientId <= 0) {
            $courierRecipientId = (int)($booking['pickup_courier_id'] ?? $booking['courier_id'] ?? 0);
        }
        $courierMessage = 'Pickup cancellation approved by admin. Booking is cancelled.';
        if ($adminNote !== '') {
            $courierMessage .= ' Admin note: ' . $adminNote;
        }
        if ($courierRecipientId > 0 && $courierRecipientId !== $adminId) {
            insert_booking_message(
                $pdo,
                $bookingId,
                $adminId,
                'courier',
                $courierRecipientId,
                'courier',
                $courierMessage
            );
        }

        $customerRecipientId = (int)($booking['customer_id'] ?? 0);
        $customerMessage = 'Booking cancelled after admin approved pickup cancellation. Reason: ' . $reasonText . '.';
        if ($refundResult['message'] !== '') {
            $customerMessage .= ' ' . $refundResult['message'];
        }
        if ($customerRecipientId > 0) {
            insert_booking_message(
                $pdo,
                $bookingId,
                $adminId,
                'courier',
                $customerRecipientId,
                'customer',
                $customerMessage
            );
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response(['error' => $e->getMessage() ?: 'Unable to approve pickup cancellation'], 422);
    }

    foreach ($oldCourierIds as $courierToClear) {
        clear_routes_if_courier_complete($pdo, (int)$courierToClear);
    }

    json_response([
        'message' => 'Pickup cancellation approved. Booking cancelled.',
        'booking' => [
            'id' => $bookingId,
            'status' => 'cancelled'
        ],
        'request' => [
            'id' => $requestId,
            'status' => 'approved',
            'decidedByAdminId' => $adminId,
            'adminNote' => $adminNote !== '' ? $adminNote : null
        ],
        'refund' => $refundResult
    ]);
}

if (preg_match('#^/(?:api/)?admin/orders/(\d+)/pickup-cancellation/(\d+)/reject$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $requestId = (int)$matches[2];
    $payload = get_json_body();
    $adminId = isset($payload['adminId']) ? (int)$payload['adminId'] : 0;
    $adminNote = trim((string)($payload['adminNote'] ?? $payload['notes'] ?? ''));

    if ($bookingId <= 0 || $requestId <= 0) {
        json_response(['error' => 'Valid orderId and requestId are required'], 422);
    }
    if ($adminId <= 0 || !user_has_role($pdo, $adminId, 'admin')) {
        json_response(['error' => 'Only admin can reject pickup cancellation'], 403);
    }
    $hasCancellationRequestsTable = cancellation_requests_table_supported($pdo);

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status, customer_id, courier_id, pickup_courier_id
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    $currentStatus = normalize_booking_status_code((string)($booking['status'] ?? ''));
    if ($currentStatus === 'cancelled') {
        json_response(['error' => 'Order is already cancelled'], 409);
    }

    $requestSource = null;
    $requestRow = null;

    if ($hasCancellationRequestsTable) {
        $requestStmt = $pdo->prepare(
            "SELECT id, order_id, type, reason, notes, context, actor_courier_id, status
             FROM cancellation_requests
             WHERE id = :id AND order_id = :order_id AND type = 'pickup'
             LIMIT 1"
        );
        $requestStmt->execute([
            'id' => $requestId,
            'order_id' => $bookingId
        ]);
        $requestRow = $requestStmt->fetch();
        if ($requestRow) {
            $requestSource = 'cancellation_requests';
        }
    }

    if ($requestSource === null) {
        if (!order_events_table_supported($pdo)) {
            json_response(['error' => 'Pickup cancellation request not found'], 404);
        }
        $eventRequestStmt = $pdo->prepare(
            'SELECT id, actor_id, metadata
             FROM order_events
             WHERE id = :id AND order_id = :order_id
             LIMIT 1'
        );
        $eventRequestStmt->execute([
            'id' => $requestId,
            'order_id' => $bookingId
        ]);
        $eventRequest = $eventRequestStmt->fetch();
        if (!$eventRequest) {
            json_response(['error' => 'Pickup cancellation request not found'], 404);
        }
        $eventMetadataRaw = $eventRequest['metadata'] ?? null;
        $eventMetadata = [];
        if (is_string($eventMetadataRaw) && trim($eventMetadataRaw) !== '') {
            $decoded = json_decode($eventMetadataRaw, true);
            if (is_array($decoded)) {
                $eventMetadata = $decoded;
            }
        }
        $eventAction = strtolower(trim((string)($eventMetadata['action'] ?? '')));
        if ($eventAction !== 'pickup_cancellation') {
            json_response(['error' => 'Selected request is not a pickup cancellation request'], 422);
        }
        $decisionStatus = strtolower(trim((string)($eventMetadata['decisionStatus'] ?? 'pending')));
        if ($decisionStatus !== '' && $decisionStatus !== 'pending') {
            json_response(['error' => 'Pickup cancellation request is already decided'], 409);
        }

        $latestPickupEventId = latest_pickup_cancellation_order_event_id($pdo, $bookingId);
        if ($latestPickupEventId <= 0 || $latestPickupEventId !== $requestId) {
            json_response(['error' => 'Only the latest pickup cancellation request can be rejected'], 409);
        }

        $requestSource = 'order_events';
        $requestRow = [
            'id' => (int)$eventRequest['id'],
            'reason' => trim((string)($eventMetadata['reasonText'] ?? '')),
            'notes' => trim((string)($eventMetadata['notes'] ?? '')),
            'context' => trim((string)($eventMetadata['actionContext'] ?? '')),
            'actor_courier_id' => (int)($eventRequest['actor_id'] ?? 0),
            'status' => $decisionStatus !== '' ? $decisionStatus : 'pending'
        ];
    }

    if ($requestSource === 'cancellation_requests') {
        $latestStmt = $pdo->prepare(
            "SELECT id, status
             FROM cancellation_requests
             WHERE order_id = :order_id AND type = 'pickup'
             ORDER BY id DESC
             LIMIT 1"
        );
        $latestStmt->execute(['order_id' => $bookingId]);
        $latestRow = $latestStmt->fetch();
        if (!$latestRow || (int)$latestRow['id'] !== $requestId) {
            json_response(['error' => 'Only the latest pickup cancellation request can be rejected'], 409);
        }
    }

    $requestStatus = strtolower(trim((string)($requestRow['status'] ?? 'pending')));
    if ($requestStatus !== 'pending') {
        json_response(['error' => 'Pickup cancellation request is already decided'], 409);
    }

    $reasonText = trim((string)($requestRow['reason'] ?? ''));
    if ($reasonText === '') {
        $reasonText = 'Pickup cancellation request rejected';
    }

    try {
        $pdo->beginTransaction();

        if ($requestSource === 'cancellation_requests') {
            $requestUpdateStmt = $pdo->prepare(
                "UPDATE cancellation_requests
                 SET status = 'rejected',
                     decided_by_admin_id = :admin_id,
                     decided_at = CURRENT_TIMESTAMP,
                     admin_note = :admin_note
                 WHERE id = :id
                   AND status = 'pending'"
            );
            $requestUpdateStmt->execute([
                'admin_id' => $adminId,
                'admin_note' => $adminNote !== '' ? $adminNote : null,
                'id' => $requestId
            ]);
            if ($requestUpdateStmt->rowCount() < 1) {
                throw new RuntimeException('Pickup cancellation request is no longer pending');
            }
        }

        $description = 'Pickup cancellation request rejected by admin.';
        if ($adminNote !== '') {
            $description .= ' Admin note: ' . $adminNote;
        }

        $statusEventStmt = $pdo->prepare(
            'INSERT INTO booking_status_events (booking_id, status, description)
             VALUES (:booking_id, :status, :description)'
        );
        $statusEventStmt->execute([
            'booking_id' => $bookingId,
            'status' => $currentStatus,
            'description' => $description
        ]);

        write_order_event(
            $pdo,
            $bookingId,
            $currentStatus,
            'admin',
            $adminId,
            [
                'action' => 'pickup_cancellation_rejected',
                'requestId' => $requestId,
                'reasonText' => $reasonText,
                'requestNotes' => trim((string)($requestRow['notes'] ?? '')) ?: null,
                'adminNote' => $adminNote !== '' ? $adminNote : null,
                'context' => trim((string)($requestRow['context'] ?? '')) ?: null
            ],
            $description
        );

        update_pickup_cancellation_order_event_decision(
            $pdo,
            $bookingId,
            $requestId,
            'rejected',
            'admin_rejected',
            'Rejected by admin',
            $adminNote !== '' ? $adminNote : null,
            $adminId
        );

        $bookingCode = trim((string)($booking['booking_code'] ?? ''));
        add_system_alert(
            $pdo,
            'shipment',
            'Pickup Cancellation Rejected',
            sprintf(
                '%s | Pickup cancellation rejected',
                $bookingCode !== '' ? $bookingCode : ('Booking #' . $bookingId)
            ),
            'Courier notified to continue pickup execution.'
        );

        $courierRecipientId = (int)($requestRow['actor_courier_id'] ?? 0);
        if ($courierRecipientId <= 0) {
            $courierRecipientId = (int)($booking['pickup_courier_id'] ?? $booking['courier_id'] ?? 0);
        }
        if ($courierRecipientId > 0 && $courierRecipientId !== $adminId) {
            $courierMessage = 'Pickup cancellation request rejected by admin.';
            if ($adminNote !== '') {
                $courierMessage .= ' Admin note: ' . $adminNote;
            }
            insert_booking_message(
                $pdo,
                $bookingId,
                $adminId,
                'courier',
                $courierRecipientId,
                'courier',
                $courierMessage
            );
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response(['error' => $e->getMessage() ?: 'Unable to reject pickup cancellation'], 422);
    }

    json_response([
        'message' => 'Pickup cancellation request rejected.',
        'booking' => [
            'id' => $bookingId,
            'code' => $booking['booking_code'] ?? null,
            'status' => $currentStatus
        ],
        'request' => [
            'id' => $requestId,
            'status' => 'rejected',
            'decidedByAdminId' => $adminId,
            'adminNote' => $adminNote !== '' ? $adminNote : null
        ]
    ]);
}

if (preg_match('#^/api/admin/orders/(\d+)/reopen-delivered$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $adminId = isset($payload['adminId']) ? (int)$payload['adminId'] : 0;
    $reasonCode = strtolower(trim((string)($payload['reasonCode'] ?? '')));
    $reasonText = trim((string)($payload['reasonText'] ?? ''));
    $notes = trim((string)($payload['notes'] ?? ''));
    $targetStatus = normalize_booking_status_code((string)($payload['targetStatus'] ?? 'delivery_attempt_failed'));

    if ($bookingId <= 0) {
        json_response(['error' => 'Invalid booking id'], 422);
    }
    if ($adminId <= 0 || !user_has_role($pdo, $adminId, 'admin')) {
        json_response(['error' => 'Valid adminId is required'], 422);
    }

    $allowedReasonCodes = ['proof_issue', 'wrong_scan', 'customer_not_received', 'fraud_flag', 'other'];
    if (!in_array($reasonCode, $allowedReasonCodes, true)) {
        json_response(['error' => 'Valid reopen reason is required'], 422);
    }
    if ($reasonText === '') {
        $reasonText = format_code_label($reasonCode);
    }
    if ($notes === '') {
        json_response(['error' => 'Admin notes are required'], 422);
    }

    $allowedTargetStatuses = ['delivery_attempt_failed', 'out_for_delivery', 'waiting_for_reattempt'];
    if (!in_array($targetStatus, $allowedTargetStatuses, true)) {
        json_response(['error' => 'Invalid targetStatus for delivered reopen'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status, courier_id, customer_id
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $currentStatus = normalize_booking_status_code((string)($booking['status'] ?? ''));
    if ($currentStatus !== 'delivered') {
        json_response(['error' => 'Only delivered bookings can be reopened'], 422);
    }

    $statusDescription = 'Delivered status reopened by admin: ' . $reasonText
        . ' | Target status: ' . format_code_label($targetStatus);
    if ($notes !== '') {
        $statusDescription .= ' | Notes: ' . $notes;
    }

    try {
        $pdo->beginTransaction();

        $updates = ['status = :status'];
        $params = [
            'id' => $bookingId,
            'status' => $targetStatus
        ];
        foreach (booking_status_side_effect_sql($targetStatus) as $part) {
            $updates[] = $part;
        }
        $updateSql = 'UPDATE bookings SET ' . implode(', ', $updates) . ' WHERE id = :id';
        $pdo->prepare($updateSql)->execute($params);

        $eventInsert = $pdo->prepare(
            'INSERT INTO booking_status_events (booking_id, status, description)
             VALUES (:booking_id, :status, :description)'
        );
        $eventInsert->execute([
            'booking_id' => $bookingId,
            'status' => $targetStatus,
            'description' => $statusDescription
        ]);

        write_order_event(
            $pdo,
            $bookingId,
            $targetStatus,
            'admin',
            $adminId,
            [
                'action' => 'delivered_reopen_override',
                'fromStatus' => 'delivered',
                'toStatus' => $targetStatus,
                'reasonCode' => $reasonCode,
                'reasonText' => $reasonText,
                'notes' => $notes
            ],
            $statusDescription
        );

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response(['error' => $e->getMessage() ?: 'Unable to reopen delivered booking'], 422);
    }

    json_response([
        'message' => 'Delivered status reopened successfully.',
        'booking' => [
            'id' => $bookingId,
            'status' => $targetStatus
        ]
    ]);
}

if (preg_match('#^/api/admin/orders/(\d+)$#', $path, $matches) && $method === 'PATCH') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $status = normalize_booking_status_code(trim((string)($payload['status'] ?? '')));
    $serviceType = trim((string)($payload['serviceType'] ?? ''));
    $scheduledDate = $payload['scheduledDate'] ?? null;
    $scheduledTime = $payload['scheduledTime'] ?? null;
    $declaredWeightProvided = array_key_exists('declaredWeight', $payload);
    $declaredWeightRaw = $declaredWeightProvided ? trim((string)($payload['declaredWeight'] ?? '')) : '';
    $declaredWeight = null;
    if ($declaredWeightProvided) {
        if ($declaredWeightRaw === '') {
            json_response(['error' => 'declaredWeight cannot be empty'], 422);
        }
        if (!is_numeric($declaredWeightRaw)) {
            json_response(['error' => 'declaredWeight must be numeric'], 422);
        }
        $declaredWeightValue = (float)$declaredWeightRaw;
        if (!is_finite($declaredWeightValue) || $declaredWeightValue < 0) {
            json_response(['error' => 'declaredWeight must be greater than or equal to 0'], 422);
        }
        $declaredWeight = rtrim(rtrim(number_format($declaredWeightValue, 2, '.', ''), '0'), '.');
        if ($declaredWeight === '') {
            $declaredWeight = '0';
        }
    }
    $cancellationMode = strtolower(trim((string)($payload['cancellationMode'] ?? '')));
    $cancellationReasonCode = strtolower(trim((string)($payload['cancellationReasonCode'] ?? '')));
    $cancellationReasonText = trim((string)($payload['cancellationReasonText'] ?? ''));
    $cancellationNotes = trim((string)($payload['cancellationNotes'] ?? ''));
    $pickupCompletionConfirmed = to_bool($payload['pickupCompletionConfirmed'] ?? false);
    $deliveryAttemptFailed = to_bool($payload['deliveryAttemptFailed'] ?? false);
    $customerConfirmedCancellation = to_bool($payload['customerConfirmedCancellation'] ?? false);
    $refundAction = strtolower(trim((string)($payload['refundAction'] ?? 'no_refund')));
    $refundAmount = to_decimal_or_null($payload['refundAmount'] ?? null);
    $adminId = isset($payload['adminId']) ? (int)$payload['adminId'] : null;

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.booking_code, bookings.status, bookings.service_type, bookings.courier_id,
                bookings.package_id,
                bookings.customer_id, bookings.pickup_courier_id, bookings.delivery_courier_id,
                bookings.requires_linehaul, bookings.current_branch_id, bookings.destination_branch_id,
                packages.declared_weight,
                pickup.city AS pickup_city, delivery.city AS delivery_city
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }

    $allowedStatuses = [
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
    ];
    $allowedServiceTypes = ['same-day', 'next-day', 'standard', 'scheduled', 'express'];
    $updates = [];
    $params = ['id' => $bookingId];
    $statusDescription = 'Booking updated by admin';
    $adminCancellationMetadata = null;
    $finalCancellationMetadata = null;
    $refundResult = null;

    if ($status !== '') {
        if (!in_array($status, $allowedStatuses, true)) {
            json_response(['error' => 'Invalid status'], 422);
        }
        $currentStatus = normalize_booking_status_code($booking['status']);
        if ($currentStatus === 'delivered') {
            json_response(['error' => 'Delivered bookings cannot be updated'], 422);
        }
        $isIntercity = booking_is_intercity($booking);
        if ($status !== $currentStatus && !can_transition_status($currentStatus, $status, $isIntercity)) {
            json_response(['error' => 'Invalid status transition'], 422);
        }
        if ($status === 'cancelled') {
            if ($adminId === null || $adminId <= 0 || !user_has_role($pdo, $adminId, 'admin')) {
                json_response(['error' => 'Valid adminId is required for cancellation'], 422);
            }

            if ($cancellationMode === 'final') {
                if (!pickup_completed_status($currentStatus)) {
                    json_response(['error' => 'Final cancellation is allowed only after pickup completion'], 422);
                }
                if (!$pickupCompletionConfirmed || !$deliveryAttemptFailed || !$customerConfirmedCancellation) {
                    json_response(['error' => 'Pickup completion, delivery failure, and customer confirmation are required'], 422);
                }
                if (!booking_has_delivery_failure_event($pdo, $bookingId)) {
                    json_response(['error' => 'Delivery failure evidence is required before final cancellation'], 422);
                }
                if (!cancellation_reason_allowed('final_cancellation', $cancellationReasonCode)) {
                    json_response(['error' => 'Valid cancellation reason is required'], 422);
                }
                if (!in_array($refundAction, ['full_refund', 'partial_refund', 'no_refund'], true)) {
                    json_response(['error' => 'Invalid refund action'], 422);
                }
                if ($refundAction === 'partial_refund' && ($refundAmount === null || $refundAmount <= 0)) {
                    json_response(['error' => 'Valid refundAmount is required for partial refund'], 422);
                }

                $resolvedCancellationReason = $cancellationReasonText !== ''
                    ? $cancellationReasonText
                    : cancellation_reason_label('final_cancellation', $cancellationReasonCode);
                $finalCancellationMetadata = [
                    'action' => 'final_cancellation',
                    'mode' => 'final',
                    'reasonCode' => $cancellationReasonCode,
                    'reasonText' => $resolvedCancellationReason,
                    'notes' => $cancellationNotes !== '' ? $cancellationNotes : null,
                    'pickupCompletionConfirmed' => $pickupCompletionConfirmed,
                    'deliveryAttemptFailed' => $deliveryAttemptFailed,
                    'customerConfirmedCancellation' => $customerConfirmedCancellation,
                    'refundAction' => $refundAction,
                    'refundAmount' => $refundAmount
                ];
                $adminCancellationMetadata = $finalCancellationMetadata;
                $statusDescription = 'Booking cancelled by admin (final): ' . $resolvedCancellationReason;
                if ($cancellationNotes !== '') {
                    $statusDescription .= ' | Notes: ' . $cancellationNotes;
                }
            } elseif ($cancellationMode === 'pre_pickup_force') {
                if (!in_array($currentStatus, ['created', 'pickup_assigned'], true)) {
                    json_response(['error' => 'Pre-pickup force cancellation is only allowed in created or pickup_assigned'], 422);
                }
                $pickupStartedStmt = $pdo->prepare(
                    "SELECT 1
                     FROM booking_status_events
                     WHERE booking_id = :id
                       AND status IN ('picked_up', 'in_transit_to_origin_branch', 'received_at_origin_branch')
                     ORDER BY id DESC
                     LIMIT 1"
                );
                $pickupStartedStmt->execute(['id' => $bookingId]);
                if ($pickupStartedStmt->fetchColumn()) {
                    json_response(['error' => 'Pickup has already started. Force pre-pickup cancellation is blocked.'], 422);
                }
                if (!cancellation_reason_allowed('pre_pickup_force_cancellation', $cancellationReasonCode)) {
                    json_response(['error' => 'Valid pre-pickup force cancellation reason is required'], 422);
                }

                $resolvedCancellationReason = $cancellationReasonText !== ''
                    ? $cancellationReasonText
                    : cancellation_reason_label('pre_pickup_force_cancellation', $cancellationReasonCode);
                $adminCancellationMetadata = [
                    'action' => 'pre_pickup_force_cancellation',
                    'mode' => 'pre_pickup_force',
                    'reasonCode' => $cancellationReasonCode,
                    'reasonText' => $resolvedCancellationReason,
                    'notes' => $cancellationNotes !== '' ? $cancellationNotes : null,
                    'pickupStarted' => false
                ];
                $statusDescription = 'Booking force-cancelled by admin (pre-pickup): ' . $resolvedCancellationReason;
                if ($cancellationNotes !== '') {
                    $statusDescription .= ' | Notes: ' . $cancellationNotes;
                }
            } else {
                json_response(['error' => 'Valid cancellationMode is required'], 422);
            }
        } else {
            $statusDescription = 'Booking updated by admin';
        }
        $updates[] = 'status = :status';
        $params['status'] = $status;
        foreach (booking_status_side_effect_sql($status) as $part) {
            $updates[] = $part;
        }
    }

    if ($serviceType !== '') {
        if (!in_array($serviceType, $allowedServiceTypes, true)) {
            json_response(['error' => 'Invalid service type'], 422);
        }
        $updates[] = 'service_type = :service_type';
        $params['service_type'] = $serviceType;
    }

    if ($serviceType === 'scheduled' || ($serviceType === '' && $booking['service_type'] === 'scheduled')) {
        if ($serviceType === 'scheduled' && (trim((string)$scheduledDate) === '' || trim((string)$scheduledTime) === '')) {
            json_response(['error' => 'scheduledDate and scheduledTime are required'], 422);
        }
        if ($scheduledDate !== null) {
            $updates[] = 'scheduled_date = :scheduled_date';
            $params['scheduled_date'] = $scheduledDate;
        }
        if ($scheduledTime !== null) {
            $updates[] = 'scheduled_time = :scheduled_time';
            $params['scheduled_time'] = $scheduledTime;
        }
    } elseif ($serviceType !== '' && $serviceType !== 'scheduled') {
        $updates[] = 'scheduled_date = :scheduled_date';
        $updates[] = 'scheduled_time = :scheduled_time';
        $params['scheduled_date'] = null;
        $params['scheduled_time'] = null;
    }

    if ($updates) {
        $sql = 'UPDATE bookings SET ' . implode(', ', $updates) . ' WHERE id = :id';
        $pdo->prepare($sql)->execute($params);
        if ($status !== '') {
            if ($status === 'cancelled' && is_array($finalCancellationMetadata)) {
                $refundResult = [
                    'action' => $refundAction,
                    'requestedAmount' => $refundAmount,
                    'applied' => false,
                    'amount' => 0.0,
                    'paymentId' => null,
                    'paymentStatus' => null,
                    'message' => ''
                ];

                $paymentStmt = $pdo->prepare(
                    'SELECT id, status, total, method, provider, provider_payload
                     FROM payments
                     WHERE booking_id = :id
                     ORDER BY id DESC
                     LIMIT 1'
                );
                $paymentStmt->execute(['id' => $bookingId]);
                $payment = $paymentStmt->fetch();

                if ($refundAction === 'no_refund') {
                    $refundResult['message'] = 'No refund requested by admin.';
                    if ($payment) {
                        $refundResult['paymentId'] = (int)$payment['id'];
                        $refundResult['paymentStatus'] = $payment['status'];
                    }
                } elseif (!$payment) {
                    $refundResult['message'] = 'No payment record found.';
                } else {
                    $refundResult['paymentId'] = (int)$payment['id'];
                    $refundResult['paymentStatus'] = $payment['status'];
                    $paymentMethod = strtolower(trim((string)($payment['method'] ?? '')));
                    $paymentStatus = strtolower(trim((string)($payment['status'] ?? '')));
                    $paymentTotal = $payment['total'] !== null ? (float)$payment['total'] : 0.0;

                    if ($paymentMethod === 'cash') {
                        $refundResult['message'] = 'Cash payment. Manual refund handling required.';
                    } elseif ($paymentStatus !== 'paid') {
                        $refundResult['message'] = 'Refund skipped because payment is not in paid status.';
                    } else {
                        $calculatedRefundAmount = $refundAction === 'full_refund'
                            ? $paymentTotal
                            : min($paymentTotal, max(0.0, (float)$refundAmount));
                        if ($calculatedRefundAmount <= 0) {
                            $refundResult['message'] = 'Refund amount must be greater than zero.';
                        } else {
                            $providerPayload = null;
                            if (isset($payment['provider_payload']) && $payment['provider_payload'] !== null && trim((string)$payment['provider_payload']) !== '') {
                                $decodedPayload = json_decode((string)$payment['provider_payload'], true);
                                if (is_array($decodedPayload)) {
                                    $providerPayload = $decodedPayload;
                                }
                            }
                            if (!is_array($providerPayload)) {
                                $providerPayload = [];
                            }
                            $providerPayload['adminRefund'] = [
                                'action' => $refundAction,
                                'amount' => $calculatedRefundAmount,
                                'requestedAmount' => $refundAmount,
                                'approvedAt' => date('Y-m-d H:i:s'),
                                'adminId' => $adminId,
                                'notes' => $cancellationNotes !== '' ? $cancellationNotes : null
                            ];

                            $pdo->prepare(
                                "UPDATE payments
                                 SET status = :status,
                                     provider_payload = :provider_payload
                                 WHERE id = :id"
                            )->execute([
                                'status' => 'refunded',
                                'provider_payload' => json_encode($providerPayload),
                                'id' => (int)$payment['id']
                            ]);

                            $refundResult['applied'] = true;
                            $refundResult['amount'] = $calculatedRefundAmount;
                            $refundResult['paymentStatus'] = 'refunded';
                            $refundResult['message'] = $refundAction === 'partial_refund'
                                ? 'Partial refund marked as refunded.'
                                : 'Full refund marked as refunded.';
                        }
                    }
                }
                $finalCancellationMetadata['refundResult'] = $refundResult;
            }

            $eventInsert = $pdo->prepare(
                'INSERT INTO booking_status_events (booking_id, status, description)
                 VALUES (:booking_id, :status, :description)'
            );
            $eventInsert->execute([
                'booking_id' => $bookingId,
                'status' => $status,
                'description' => $statusDescription
            ]);
            $eventMetadata = ['action' => 'admin_status_update'];
            if ($status === 'cancelled' && is_array($adminCancellationMetadata)) {
                $eventMetadata = $adminCancellationMetadata;
            }
            write_order_event(
                $pdo,
                $bookingId,
                $status,
                'admin',
                $adminId,
                $eventMetadata,
                $statusDescription
            );
            if ($status === 'cancelled' && is_array($adminCancellationMetadata)) {
                $cancellationAction = strtolower(trim((string)($adminCancellationMetadata['action'] ?? '')));
                $senderIdForMessage = $adminId !== null && $adminId > 0 ? $adminId : 0;
                $bookingCode = trim((string)($booking['booking_code'] ?? ''));

                if ($cancellationAction === 'final_cancellation') {
                    $reasonForAlert = $adminCancellationMetadata['reasonText'] ?? cancellation_reason_label('final_cancellation', $cancellationReasonCode);
                    add_system_alert(
                        $pdo,
                        'shipment',
                        'Order Cancelled',
                        sprintf(
                            '%s | Final cancellation | %s',
                            $bookingCode !== '' ? $bookingCode : ('Booking #' . $bookingId),
                            $reasonForAlert
                        ),
                        'Review refund outcome and notify stakeholders.'
                    );

                    $reasonTextForMessage = $adminCancellationMetadata['reasonText'] ?? 'Order cancelled by admin';
                    $refundSummary = $refundResult && ($refundResult['action'] ?? 'no_refund') !== 'no_refund'
                        ? (' Refund action: ' . format_code_label($refundResult['action'] ?? 'refund') . '.')
                        : '';
                    $notificationMessage = 'Order has been fully cancelled by admin. Reason: ' . $reasonTextForMessage . '.' . $refundSummary;
                    if ($senderIdForMessage > 0) {
                        if ((int)($booking['customer_id'] ?? 0) > 0) {
                            insert_booking_message(
                                $pdo,
                                $bookingId,
                                $senderIdForMessage,
                                'courier',
                                (int)$booking['customer_id'],
                                'customer',
                                $notificationMessage
                            );
                        }
                        $requesterCourierId = 0;
                        if (order_events_table_supported($pdo)) {
                            try {
                                $requesterStmt = $pdo->prepare(
                                    "SELECT actor_id
                                     FROM order_events
                                     WHERE order_id = :id
                                       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.action')) IN ('pickup_cancellation', 'delivery_cancellation', 'delivery_failure')
                                     ORDER BY id DESC
                                     LIMIT 1"
                                );
                                $requesterStmt->execute(['id' => $bookingId]);
                                $requesterCourierId = (int)($requesterStmt->fetchColumn() ?: 0);
                            } catch (Throwable $e) {
                                $requesterCourierId = 0;
                            }
                        }
                        $courierRecipientId = $requesterCourierId > 0
                            ? $requesterCourierId
                            : (int)($booking['delivery_courier_id'] ?? $booking['courier_id'] ?? 0);
                        if ($courierRecipientId > 0 && $courierRecipientId !== $senderIdForMessage) {
                            insert_booking_message(
                                $pdo,
                                $bookingId,
                                $senderIdForMessage,
                                'courier',
                                $courierRecipientId,
                                'courier',
                                $notificationMessage
                            );
                        }
                    }
                } elseif ($cancellationAction === 'pre_pickup_force_cancellation') {
                    $reasonForAlert = $adminCancellationMetadata['reasonText']
                        ?? cancellation_reason_label('pre_pickup_force_cancellation', $cancellationReasonCode);
                    add_system_alert(
                        $pdo,
                        'shipment',
                        'Order Cancelled (Pre-Pickup)',
                        sprintf(
                            '%s | Pre-pickup force cancellation | %s',
                            $bookingCode !== '' ? $bookingCode : ('Booking #' . $bookingId),
                            $reasonForAlert
                        ),
                        'Cancellation completed before pickup start. Review admin notes if provided.'
                    );

                    $notificationMessage = 'Order has been force-cancelled by admin before pickup start. Reason: ' . $reasonForAlert . '.';
                    if (trim((string)($adminCancellationMetadata['notes'] ?? '')) !== '') {
                        $notificationMessage .= ' Notes: ' . trim((string)$adminCancellationMetadata['notes']);
                    }
                    if ($senderIdForMessage > 0) {
                        if ((int)($booking['customer_id'] ?? 0) > 0) {
                            insert_booking_message(
                                $pdo,
                                $bookingId,
                                $senderIdForMessage,
                                'courier',
                                (int)$booking['customer_id'],
                                'customer',
                                $notificationMessage
                            );
                        }
                        $courierRecipientId = (int)($booking['pickup_courier_id'] ?? $booking['courier_id'] ?? 0);
                        if ($courierRecipientId > 0 && $courierRecipientId !== $senderIdForMessage) {
                            insert_booking_message(
                                $pdo,
                                $bookingId,
                                $senderIdForMessage,
                                'courier',
                                $courierRecipientId,
                                'courier',
                                $notificationMessage
                            );
                        }
                    }
                }
            }
            if (in_array($status, ['delivered', 'received_at_origin_branch', 'received_at_destination_branch', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender', 'cancelled'], true) && $booking['courier_id']) {
                clear_routes_if_courier_complete($pdo, (int)$booking['courier_id']);
            }
        }
    }

    if ($declaredWeightProvided) {
        $packageId = (int)($booking['package_id'] ?? 0);
        if ($packageId <= 0) {
            json_response(['error' => 'Package not found for booking'], 404);
        }
        $packageUpdateStmt = $pdo->prepare(
            'UPDATE packages SET declared_weight = :declared_weight WHERE id = :id'
        );
        $packageUpdateStmt->execute([
            'declared_weight' => $declaredWeight,
            'id' => $packageId
        ]);
        $booking['declared_weight'] = $declaredWeight;
    }

    json_response([
        'message' => 'Booking updated',
        'booking' => [
            'id' => $bookingId,
            'status' => $status !== '' ? $status : normalize_booking_status_code($booking['status']),
            'serviceType' => $serviceType !== '' ? $serviceType : $booking['service_type'],
            'scheduledDate' => $scheduledDate,
            'scheduledTime' => $scheduledTime,
            'declaredWeight' => $declaredWeightProvided ? $declaredWeight : ($booking['declared_weight'] ?? null)
        ],
        'refund' => $refundResult
    ]);
}

if ($path === '/api/admin/orders' && $method === 'GET') {
    $limit = (int)get_query_param('limit', 20);
    if ($limit <= 0) {
        $limit = 20;
    }

    $ordersStmt = $pdo->prepare(
        "SELECT bookings.id, bookings.booking_code, bookings.delivery_access_code, bookings.customer_id, bookings.status, bookings.service_type, bookings.courier_id,
                bookings.pickup_courier_id, bookings.delivery_courier_id, bookings.linehaul_courier_id,
                bookings.requires_linehaul, bookings.is_intercity,
                bookings.origin_branch_id, bookings.destination_branch_id,
                bookings.scheduled_date, bookings.scheduled_time, bookings.distance_km,
                packages.declared_weight, packages.measured_weight, packages.size, packages.category, packages.description,
                payments.method AS payment_method, payments.provider AS payment_provider, payments.status AS payment_status, payments.total AS payment_total,
                customers.full_name AS customer_name, customers.email AS customer_email, customers.phone AS customer_phone,
                couriers.full_name AS courier_name, couriers.email AS courier_email, couriers.phone AS courier_phone,
                pickup_couriers.full_name AS pickup_courier_name,
                delivery_couriers.full_name AS delivery_courier_name,
                linehaul_couriers.full_name AS linehaul_courier_name,
                courier_profiles.courier_role AS courier_role,
                origin_branch.name AS origin_branch_name, origin_branch.address_line AS origin_branch_address_line,
                origin_branch.city AS origin_branch_city, origin_branch.province AS origin_branch_province, origin_branch.postal_code AS origin_branch_postal_code,
                origin_branch.lat AS origin_branch_lat, origin_branch.lng AS origin_branch_lng,
                destination_branch.name AS destination_branch_name, destination_branch.address_line AS destination_branch_address_line,
                destination_branch.city AS destination_branch_city, destination_branch.province AS destination_branch_province, destination_branch.postal_code AS destination_branch_postal_code,
                destination_branch.lat AS destination_branch_lat, destination_branch.lng AS destination_branch_lng,
                pickup.line1 AS pickup_line, pickup.city AS pickup_city, pickup.province AS pickup_province, pickup.postal_code AS pickup_postal,
                delivery.line1 AS delivery_line, delivery.city AS delivery_city, delivery.province AS delivery_province, delivery.postal_code AS delivery_postal,
                (SELECT f.id FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_id,
                (SELECT f.status FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_status,
                (SELECT f.error_type FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_error_type,
                (SELECT f.fine_amount FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_amount,
                (SELECT f.notes FROM fines f WHERE f.booking_id = bookings.id ORDER BY f.issued_at DESC, f.id DESC LIMIT 1) AS fine_notes
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN (
            SELECT p_latest.booking_id, p_latest.method, p_latest.provider, p_latest.status, p_latest.total
            FROM payments AS p_latest
            JOIN (
                SELECT booking_id, MAX(id) AS latest_id
                FROM payments
                GROUP BY booking_id
            ) AS p_ids ON p_ids.latest_id = p_latest.id
         ) AS payments ON payments.booking_id = bookings.id
         JOIN users AS customers ON customers.id = bookings.customer_id
         LEFT JOIN users AS couriers ON couriers.id = bookings.courier_id
         LEFT JOIN users AS pickup_couriers ON pickup_couriers.id = bookings.pickup_courier_id
         LEFT JOIN users AS delivery_couriers ON delivery_couriers.id = bookings.delivery_courier_id
         LEFT JOIN users AS linehaul_couriers ON linehaul_couriers.id = bookings.linehaul_courier_id
         LEFT JOIN courier_profiles ON courier_profiles.user_id = couriers.id
         LEFT JOIN branches AS origin_branch ON origin_branch.id = bookings.origin_branch_id
         LEFT JOIN branches AS destination_branch ON destination_branch.id = bookings.destination_branch_id
         ORDER BY bookings.created_at DESC
         LIMIT :limit"
    );
    $ordersStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $ordersStmt->execute();

    $orders = [];
    foreach ($ordersStmt as $row) {
        $declared = $row['declared_weight'] ?? null;
        $measured = $row['measured_weight'] ?? null;
        $flagged = $declared !== null && $measured !== null && $declared !== $measured;
        $fineStatus = strtolower(trim((string)($row['fine_status'] ?? '')));
        $isOnHold = $fineStatus === 'pending';
        $fineId = (int)($row['fine_id'] ?? 0);
        $requiresLinehaul = to_bool($row['requires_linehaul'] ?? false);
        $isIntercity = to_bool($row['is_intercity'] ?? false);
        if (!$isIntercity) {
            $pickupCityToken = normalize_city_token($row['pickup_city'] ?? null);
            $deliveryCityToken = normalize_city_token($row['delivery_city'] ?? null);
            $isIntercity = $requiresLinehaul
                || ($pickupCityToken !== '' && $deliveryCityToken !== '' && $pickupCityToken !== $deliveryCityToken);
        }
        $orders[] = [
            'id' => (int)$row['id'],
            'code' => $row['booking_code'],
            'deliveryAccessCode' => $row['delivery_access_code'] ?: '',
            'customerId' => $row['customer_id'] ? (int)$row['customer_id'] : null,
            'customer' => $row['customer_name'],
            'customerEmail' => $row['customer_email'] ?: '',
            'customerPhone' => $row['customer_phone'] ?: '',
            'courierId' => $row['courier_id'] ? (int)$row['courier_id'] : null,
            'courier' => $row['courier_name'] ?: 'Unassigned',
            'courierEmail' => $row['courier_email'] ?: '',
            'courierPhone' => $row['courier_phone'] ?: '',
            'paymentMethod' => $row['payment_method'] ?: null,
            'paymentProvider' => $row['payment_provider'] ?: null,
            'paymentStatus' => $row['payment_status'] ?: null,
            'paymentTotal' => $row['payment_total'] !== null ? (float)$row['payment_total'] : null,
            'pickupCourierId' => $row['pickup_courier_id'] ? (int)$row['pickup_courier_id'] : null,
            'pickupCourier' => $row['pickup_courier_name'] ?: 'Unassigned',
            'deliveryCourierId' => $row['delivery_courier_id'] ? (int)$row['delivery_courier_id'] : null,
            'deliveryCourier' => $row['delivery_courier_name'] ?: 'Unassigned',
            'linehaulCourierId' => $row['linehaul_courier_id'] ? (int)$row['linehaul_courier_id'] : null,
            'linehaulCourier' => $row['linehaul_courier_name'] ?: 'Unassigned',
            'requiresLinehaul' => $requiresLinehaul,
            'isIntercity' => $isIntercity,
            'courierRole' => $row['courier_role'] ?: null,
            'pickup' => sprintf('%s, %s, %s %s', $row['pickup_line'], $row['pickup_city'], $row['pickup_province'], $row['pickup_postal']),
            'delivery' => sprintf('%s, %s, %s %s', $row['delivery_line'], $row['delivery_city'], $row['delivery_province'], $row['delivery_postal']),
            'originBranch' => $row['origin_branch_id'] ? [
                'id' => (int)$row['origin_branch_id'],
                'name' => $row['origin_branch_name'] ?: null,
                'address' => $row['origin_branch_address_line'] ?: null,
                'city' => $row['origin_branch_city'] ?: null,
                'province' => $row['origin_branch_province'] ?: null,
                'postalCode' => $row['origin_branch_postal_code'] ?: null,
                'lat' => $row['origin_branch_lat'] !== null ? (float)$row['origin_branch_lat'] : null,
                'lng' => $row['origin_branch_lng'] !== null ? (float)$row['origin_branch_lng'] : null
            ] : null,
            'destinationBranch' => $row['destination_branch_id'] ? [
                'id' => (int)$row['destination_branch_id'],
                'name' => $row['destination_branch_name'] ?: null,
                'address' => $row['destination_branch_address_line'] ?: null,
                'city' => $row['destination_branch_city'] ?: null,
                'province' => $row['destination_branch_province'] ?: null,
                'postalCode' => $row['destination_branch_postal_code'] ?: null,
                'lat' => $row['destination_branch_lat'] !== null ? (float)$row['destination_branch_lat'] : null,
                'lng' => $row['destination_branch_lng'] !== null ? (float)$row['destination_branch_lng'] : null
            ] : null,
            'declaredWeight' => $declared,
            'measuredWeight' => $measured,
            'size' => $row['size'] ?: 'N/A',
            'category' => $row['category'] ?: 'N/A',
            'description' => $row['description'] ?: '',
            'status' => normalize_booking_status_code($row['status']),
            'displayStatus' => $isOnHold ? 'on_hold' : normalize_booking_status_code($row['status']),
            'serviceType' => $row['service_type'],
            'scheduledDate' => $row['scheduled_date'],
            'scheduledTime' => $row['scheduled_time'],
            'distanceKm' => $row['distance_km'] !== null ? (float)$row['distance_km'] : null,
            'flagged' => $flagged || $isOnHold,
            'fineStatus' => $fineStatus !== '' ? $fineStatus : 'none',
            'isOnHold' => $isOnHold,
            'latestFine' => $fineId > 0 ? [
                'id' => $fineId,
                'status' => $fineStatus !== '' ? $fineStatus : 'pending',
                'errorType' => strtolower(trim((string)($row['fine_error_type'] ?? ''))),
                'errorLabel' => fine_error_type_label((string)($row['fine_error_type'] ?? 'fine')),
                'amount' => $row['fine_amount'] !== null ? (float)$row['fine_amount'] : 0.0,
                'notes' => trim((string)($row['fine_notes'] ?? '')) ?: null
            ] : null
        ];
    }

    json_response(['orders' => $orders]);
}

if ($path === '/api/admin/fines' && $method === 'POST') {
    $payload = get_json_body();
    $bookingId = (int)($payload['bookingId'] ?? 0);
    $errorType = trim($payload['errorType'] ?? '');
    $amount = (float)($payload['fineAmount'] ?? 0);
    $notes = trim($payload['notes'] ?? '');
    $adminId = isset($payload['adminId']) ? (int)$payload['adminId'] : 0;

    if ($adminId <= 0 || !user_has_role($pdo, $adminId, 'admin')) {
        json_response(['error' => 'Valid adminId is required'], 422);
    }

    $typeMap = [
        'under-reported-weight' => 'under_reported_weight',
        'too-large-vehicle' => 'too_large_vehicle',
        'wrong-street-number' => 'wrong_street_number',
        'wrong-city-postal' => 'wrong_city_postal'
    ];
    $dbErrorType = $typeMap[$errorType] ?? $errorType;
    $validTypes = ['under_reported_weight', 'too_large_vehicle', 'wrong_street_number', 'wrong_city_postal'];
    if ($bookingId <= 0 || !in_array($dbErrorType, $validTypes, true)) {
        json_response(['error' => 'Invalid fine payload'], 422);
    }
    if (!is_finite($amount) || $amount < 0) {
        json_response(['error' => 'fineAmount must be greater than or equal to 0'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status, customer_id, courier_id, delivery_courier_id
         FROM bookings
         WHERE id = :id'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    $bookingStatus = normalize_booking_status_code((string)($booking['status'] ?? ''));
    if (!fine_can_be_issued_for_status($bookingStatus)) {
        json_response(['error' => 'Fine can only be issued when parcel is in active movement/review stages'], 422);
    }
    if (booking_has_pending_fine($pdo, $bookingId)) {
        json_response(['error' => 'A pending fine already exists for this booking'], 409);
    }

    $resultsMap = [
        'under_reported_weight' => ['Delayed sorting', 'Pay extra to resume'],
        'too_large_vehicle' => ['Pickup Refusal', 'Cancellation fee'],
        'wrong_street_number' => ['Package held at hub', 'Address correction fee'],
        'wrong_city_postal' => ['Rerouted to wrong state', 'High rerouting costs + 3-5 day delay']
    ];
    $results = $resultsMap[$dbErrorType];
    $deliveryCourierId = (int)($booking['delivery_courier_id'] ?? 0);
    $courierIdBefore = (int)($booking['courier_id'] ?? 0);
    $statusAfterFine = $bookingStatus;
    $deliveryUnassigned = false;
    $courierIdAfterFine = $courierIdBefore;
    $deliveryCourierIdAfterFine = $deliveryCourierId > 0 ? $deliveryCourierId : null;

    if ($deliveryCourierId > 0) {
        $deliveryUnassigned = true;
        $deliveryCourierIdAfterFine = null;
        if (in_array($bookingStatus, ['delivery_load_confirmed', 'out_for_delivery'], true)) {
            $statusAfterFine = 'delivery_assigned';
        } elseif ($bookingStatus === 'delivery_attempt_failed') {
            $statusAfterFine = 'waiting_for_reattempt';
        }
        if ($courierIdBefore === $deliveryCourierId) {
            $courierIdAfterFine = 0;
        }
    }

    try {
        $pdo->beginTransaction();

        if ($deliveryUnassigned) {
            $clearDeliveryAssignmentStmt = $pdo->prepare(
                'UPDATE bookings
                 SET status = :status,
                     delivery_courier_id = NULL,
                     courier_id = CASE WHEN courier_id = :delivery_courier_id THEN NULL ELSE courier_id END,
                     delivery_load_confirmed_at = NULL
                 WHERE id = :id'
            );
            $clearDeliveryAssignmentStmt->execute([
                'status' => $statusAfterFine,
                'delivery_courier_id' => $deliveryCourierId,
                'id' => $bookingId
            ]);
        }

        $insert = $pdo->prepare(
            'INSERT INTO fines (booking_id, error_type, immediate_result, financial_result, fine_amount, notes, status, issued_by)
             VALUES (:booking_id, :error_type, :immediate_result, :financial_result, :fine_amount, :notes, :status, :issued_by)'
        );
        $insert->execute([
            'booking_id' => $bookingId,
            'error_type' => $dbErrorType,
            'immediate_result' => $results[0],
            'financial_result' => $results[1],
            'fine_amount' => $amount,
            'notes' => $notes,
            'status' => 'pending',
            'issued_by' => $adminId
        ]);
        $fineId = (int)$pdo->lastInsertId();

        $description = 'Fine issued by admin: ' . fine_error_type_label($dbErrorType)
            . ' | Amount: RS ' . number_format($amount, 2);
        if ($notes !== '') {
            $description .= ' | Notes: ' . $notes;
        }
        if ($deliveryUnassigned) {
            $description .= ' | Delivery assignment cleared until fine is paid';
        }

        $eventInsert = $pdo->prepare(
            'INSERT INTO booking_status_events (booking_id, status, description)
             VALUES (:booking_id, :status, :description)'
        );
        $eventInsert->execute([
            'booking_id' => $bookingId,
            'status' => $statusAfterFine,
            'description' => $description
        ]);

        write_order_event(
            $pdo,
            $bookingId,
            $statusAfterFine,
            'admin',
            $adminId,
            [
                'action' => 'fine_issued',
                'fineId' => $fineId,
                'errorType' => $dbErrorType,
                'errorLabel' => fine_error_type_label($dbErrorType),
                'fineAmount' => $amount,
                'notes' => $notes !== '' ? $notes : null,
                'deliveryUnassigned' => $deliveryUnassigned,
                'previousDeliveryCourierId' => $deliveryUnassigned ? $deliveryCourierId : null,
                'statusAfterFine' => $statusAfterFine
            ],
            $description
        );

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response(['error' => $e->getMessage() ?: 'Unable to issue fine right now'], 422);
    }

    json_response([
        'message' => $deliveryUnassigned
            ? 'Fine recorded. Order placed on hold and delivery assignment cleared.'
            : 'Fine recorded and order placed on hold.',
        'fine' => [
            'id' => $fineId,
            'errorType' => $dbErrorType,
            'errorLabel' => fine_error_type_label($dbErrorType),
            'amount' => $amount,
            'notes' => $notes !== '' ? $notes : null,
            'status' => 'pending'
        ],
        'booking' => [
            'id' => $bookingId,
            'status' => $statusAfterFine,
            'courierId' => $courierIdAfterFine > 0 ? $courierIdAfterFine : null,
            'deliveryCourierId' => $deliveryCourierIdAfterFine
        ],
        'assignment' => [
            'deliveryUnassigned' => $deliveryUnassigned,
            'previousDeliveryCourierId' => $deliveryUnassigned ? $deliveryCourierId : null,
            'reason' => $deliveryUnassigned ? 'pending_fine' : null
        ],
        'hold' => [
            'isOnHold' => true,
            'reason' => 'pending_fine'
        ]
    ], 201);
}

if (preg_match('#^/api/customer/orders/(\d+)/fine/pay/initiate$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $customerId = isset($payload['customerId']) ? (int)$payload['customerId'] : 0;
    $returnUrl = trim((string)($payload['returnUrl'] ?? ''));
    $websiteUrl = trim((string)($payload['websiteUrl'] ?? ''));

    if ($bookingId <= 0 || $customerId <= 0) {
        json_response(['error' => 'bookingId and customerId are required'], 422);
    }
    if ($returnUrl === '' || $websiteUrl === '') {
        json_response(['error' => 'returnUrl and websiteUrl are required'], 422);
    }

    $bookingStmt = $pdo->prepare(
        'SELECT bookings.id, bookings.booking_code, bookings.customer_id,
                users.full_name AS customer_name, users.email AS customer_email, users.phone AS customer_phone
         FROM bookings
         JOIN users ON users.id = bookings.customer_id
         WHERE bookings.id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    if ((int)$booking['customer_id'] !== $customerId) {
        json_response(['error' => 'Access denied'], 403);
    }

    $pendingFine = latest_booking_fine($pdo, $bookingId, true);
    if (!$pendingFine) {
        json_response(['error' => 'No pending fine found for this order'], 404);
    }
    $fineId = (int)($pendingFine['id'] ?? 0);
    if ($fineId <= 0) {
        json_response(['error' => 'Invalid pending fine record'], 422);
    }

    $amount = (float)($pendingFine['fine_amount'] ?? 0);
    $amountPaisa = (int)round($amount * 100);
    if ($amountPaisa <= 0) {
        json_response(['error' => 'Pending fine amount must be greater than 0 for Khalti payment'], 422);
    }

    $purchaseOrderId = sprintf(
        'FINE-%d-%d-%d-%s',
        $bookingId,
        $fineId,
        $customerId,
        date('YmdHis')
    );
    $purchaseOrderName = 'Fine payment ' . ($booking['booking_code'] ?? ('#' . $bookingId));
    $khaltiPayload = [
        'return_url' => $returnUrl,
        'website_url' => $websiteUrl,
        'amount' => $amountPaisa,
        'purchase_order_id' => $purchaseOrderId,
        'purchase_order_name' => $purchaseOrderName,
        'customer_info' => [
            'name' => trim((string)($payload['customer']['name'] ?? $booking['customer_name'] ?? '')),
            'email' => trim((string)($payload['customer']['email'] ?? $booking['customer_email'] ?? '')),
            'phone' => trim((string)($payload['customer']['phone'] ?? $booking['customer_phone'] ?? ''))
        ]
    ];
    $result = khalti_request($config['khalti'] ?? [], 'epayment/initiate/', $khaltiPayload);
    if (!$result['ok']) {
        $body = $result['body'] ?? [];
        $message = null;
        if (is_array($body)) {
            if (isset($body['detail']) && is_string($body['detail'])) {
                $message = $body['detail'];
            } elseif (isset($body['message']) && is_string($body['message'])) {
                $message = $body['message'];
            } else {
                foreach ($body as $value) {
                    if (is_string($value)) {
                        $message = $value;
                        break;
                    }
                    if (is_array($value) && isset($value[0]) && is_string($value[0])) {
                        $message = $value[0];
                        break;
                    }
                }
            }
        }
        if (!$message) {
            $errorDetail = $result['error'] ?? null;
            if ($errorDetail) {
                $message = 'Khalti initiation failed: ' . $errorDetail;
            } else {
                $message = 'Khalti initiation failed (HTTP ' . ($result['status'] ?? '0') . ')';
            }
        }
        json_response(['error' => $message, 'details' => $result['body']], 502);
    }

    json_response([
        'message' => 'Redirect to Khalti to complete fine payment.',
        'booking' => [
            'id' => $bookingId,
            'code' => $booking['booking_code'] ?? null
        ],
        'fine' => [
            'id' => $fineId,
            'status' => 'pending',
            'amount' => $amount,
            'errorType' => $pendingFine['error_type'] ?? null,
            'errorLabel' => fine_error_type_label((string)($pendingFine['error_type'] ?? 'fine')),
            'notes' => $pendingFine['notes'] ?? null
        ],
        'payment' => [
            'method' => 'wallet',
            'provider' => 'khalti',
            'status' => 'pending',
            'providerReference' => $result['body']['pidx'] ?? null,
            'paymentUrl' => $result['body']['payment_url'] ?? null,
            'expiresAt' => $result['body']['expires_at'] ?? null,
            'purchaseOrderId' => $purchaseOrderId
        ]
    ]);
}

if (preg_match('#^/api/customer/orders/(\d+)/fine/pay$#', $path, $matches) && $method === 'POST') {
    $bookingId = (int)$matches[1];
    $payload = get_json_body();
    $customerId = isset($payload['customerId']) ? (int)$payload['customerId'] : 0;
    $paymentMethod = strtolower(trim((string)($payload['paymentMethod'] ?? 'wallet')));
    $pidx = trim((string)($payload['pidx'] ?? ''));

    if ($bookingId <= 0 || $customerId <= 0) {
        json_response(['error' => 'bookingId and customerId are required'], 422);
    }
    if (!in_array($paymentMethod, ['wallet', 'cash', 'card'], true)) {
        $paymentMethod = 'wallet';
    }

    $bookingStmt = $pdo->prepare(
        'SELECT id, booking_code, status, customer_id
         FROM bookings
         WHERE id = :id
         LIMIT 1'
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        json_response(['error' => 'Booking not found'], 404);
    }
    if ((int)$booking['customer_id'] !== $customerId) {
        json_response(['error' => 'Access denied'], 403);
    }

    $pendingFine = latest_booking_fine($pdo, $bookingId, true);
    if (!$pendingFine) {
        json_response(['error' => 'No pending fine found for this order'], 404);
    }

    $fineId = (int)($pendingFine['id'] ?? 0);
    if ($fineId <= 0) {
        json_response(['error' => 'Invalid pending fine record'], 422);
    }

    $currentStatus = normalize_booking_status_code((string)($booking['status'] ?? ''));
    $amount = (float)($pendingFine['fine_amount'] ?? 0);
    $paymentProvider = null;
    $paymentProviderReference = null;
    $paymentProviderStatus = null;

    if ($paymentMethod === 'wallet') {
        if ($pidx === '') {
            json_response(['error' => 'Khalti payment reference (pidx) is required for wallet fine payment'], 422);
        }
        $lookup = khalti_request($config['khalti'] ?? [], 'epayment/lookup/', ['pidx' => $pidx]);
        if (!$lookup['ok']) {
            json_response([
                'error' => 'Unable to verify Khalti payment for fine.',
                'details' => $lookup['body']
            ], 502);
        }
        $lookupBody = is_array($lookup['body'] ?? null) ? $lookup['body'] : [];
        $statusRaw = strtolower(trim((string)($lookupBody['status'] ?? '')));
        if ($statusRaw !== 'completed') {
            $message = 'Khalti payment is not completed yet. Fine is still pending.';
            if ($statusRaw === 'failed') {
                $message = 'Khalti payment failed. Fine is still pending.';
            } elseif (in_array($statusRaw, ['expired', 'cancelled', 'canceled'], true)) {
                $message = 'Khalti payment was cancelled or expired. Fine is still pending.';
            } elseif ($statusRaw === 'pending') {
                $message = 'Khalti payment is pending. Fine is still pending.';
            }
            json_response([
                'error' => $message,
                'paymentStatus' => $statusRaw
            ], 422);
        }

        $lookupPurchaseOrderId = trim((string)($lookupBody['purchase_order_id'] ?? ''));
        $expectedPrefix = sprintf('FINE-%d-%d-%d-', $bookingId, $fineId, $customerId);
        if ($lookupPurchaseOrderId === '' || strpos($lookupPurchaseOrderId, $expectedPrefix) !== 0) {
            json_response(['error' => 'Khalti payment does not match this fine payment request'], 422);
        }

        $lookupAmount = null;
        if (isset($lookupBody['total_amount']) && is_numeric($lookupBody['total_amount'])) {
            $lookupAmount = (int)round((float)$lookupBody['total_amount']);
        } elseif (isset($lookupBody['amount']) && is_numeric($lookupBody['amount'])) {
            $lookupAmount = (int)round((float)$lookupBody['amount']);
        }
        $expectedAmount = (int)round($amount * 100);
        if ($lookupAmount !== null && $lookupAmount > 0 && $expectedAmount > 0 && $lookupAmount !== $expectedAmount) {
            json_response(['error' => 'Khalti payment amount does not match pending fine amount'], 422);
        }

        $paymentProvider = 'khalti';
        $paymentProviderReference = $pidx;
        $paymentProviderStatus = 'paid';
    }

    $description = 'Fine paid by customer: '
        . fine_error_type_label((string)($pendingFine['error_type'] ?? 'fine'))
        . ' | Amount: RS ' . number_format($amount, 2)
        . ' | Method: ' . strtoupper($paymentMethod);
    if ($paymentProvider === 'khalti') {
        $description .= ' | Provider: KHALTI';
        if ($paymentProviderReference !== null && $paymentProviderReference !== '') {
            $description .= ' | Ref: ' . $paymentProviderReference;
        }
    }

    try {
        $pdo->beginTransaction();

        $updateFine = $pdo->prepare(
            "UPDATE fines
             SET status = 'applied'
             WHERE id = :id
               AND status = 'pending'"
        );
        $updateFine->execute(['id' => $fineId]);
        if ($updateFine->rowCount() < 1) {
            throw new RuntimeException('Pending fine is no longer available');
        }

        $eventInsert = $pdo->prepare(
            'INSERT INTO booking_status_events (booking_id, status, description)
             VALUES (:booking_id, :status, :description)'
        );
        $eventInsert->execute([
            'booking_id' => $bookingId,
            'status' => $currentStatus,
            'description' => $description
        ]);

        write_order_event(
            $pdo,
            $bookingId,
            $currentStatus,
            'customer',
            $customerId,
            [
                'action' => 'fine_paid',
                'fineId' => $fineId,
                'errorType' => $pendingFine['error_type'] ?? null,
                'errorLabel' => fine_error_type_label((string)($pendingFine['error_type'] ?? 'fine')),
                'fineAmount' => $amount,
                'paymentMethod' => $paymentMethod,
                'paymentProvider' => $paymentProvider,
                'paymentProviderReference' => $paymentProviderReference
            ],
            $description
        );

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response(['error' => $e->getMessage() ?: 'Unable to pay fine right now'], 422);
    }

    json_response([
        'message' => 'Fine payment completed. Hold removed.',
        'booking' => [
            'id' => $bookingId,
            'code' => $booking['booking_code'] ?? null,
            'status' => $currentStatus
        ],
        'fine' => [
            'id' => $fineId,
            'status' => 'applied',
            'amount' => $amount,
            'errorType' => $pendingFine['error_type'] ?? null,
            'errorLabel' => fine_error_type_label((string)($pendingFine['error_type'] ?? 'fine')),
            'notes' => $pendingFine['notes'] ?? null
        ],
        'hold' => [
            'isOnHold' => false,
            'reason' => null
        ],
        'payment' => [
            'method' => $paymentMethod,
            'provider' => $paymentProvider,
            'providerReference' => $paymentProviderReference,
            'status' => $paymentProviderStatus ?? 'paid'
        ]
    ]);
}

if ($path === '/api/admin/revenue-overview' && $method === 'GET') {
    $months = [];
    $monthKeys = [];
    $today = new DateTimeImmutable('first day of this month');
    for ($i = 5; $i >= 0; $i--) {
        $date = $today->modify("-{$i} months");
        $key = $date->format('Y-m');
        $months[] = [
            'key' => $key,
            'label' => $date->format('M')
        ];
        $monthKeys[] = $key;
    }

    $startDate = $today->modify('-5 months')->format('Y-m-01');
    $revenueStmt = $pdo->prepare(
        "SELECT DATE_FORMAT(COALESCE(payments.paid_at, bookings.created_at), '%Y-%m') AS month_key,
                COALESCE(SUM(payments.total), 0) AS revenue
         FROM payments
         JOIN bookings ON bookings.id = payments.booking_id
         WHERE COALESCE(payments.paid_at, bookings.created_at) >= :start_date
         GROUP BY month_key"
    );
    $revenueStmt->execute(['start_date' => $startDate]);
    $revenueMap = [];
    foreach ($revenueStmt as $row) {
        $revenueMap[$row['month_key']] = (float)$row['revenue'];
    }

    $ordersStmt = $pdo->prepare(
        "SELECT DATE_FORMAT(created_at, '%Y-%m') AS month_key,
                COUNT(*) AS orders
         FROM bookings
         WHERE created_at >= :start_date
         GROUP BY month_key"
    );
    $ordersStmt->execute(['start_date' => $startDate]);
    $ordersMap = [];
    foreach ($ordersStmt as $row) {
        $ordersMap[$row['month_key']] = (int)$row['orders'];
    }

    $data = [];
    $totalRevenue = 0;
    $totalOrders = 0;
    foreach ($months as $month) {
        $revenue = $revenueMap[$month['key']] ?? 0;
        $orders = $ordersMap[$month['key']] ?? 0;
        $data[] = [
            'month' => $month['label'],
            'revenue' => $revenue,
            'orders' => $orders
        ];
        $totalRevenue += $revenue;
        $totalOrders += $orders;
    }

    $avgMonthly = count($data) > 0 ? $totalRevenue / count($data) : 0;
    $bestMonth = '';
    $bestRevenue = -1;
    foreach ($data as $row) {
        if ($row['revenue'] > $bestRevenue) {
            $bestRevenue = $row['revenue'];
            $bestMonth = $row['month'];
        }
    }

    $growthPercent = 0.0;
    if (count($data) >= 2) {
        $current = $data[count($data) - 1]['revenue'];
        $previous = $data[count($data) - 2]['revenue'];
        if ($previous > 0) {
            $growthPercent = (($current - $previous) / $previous) * 100;
        }
    }

    json_response([
        'data' => $data,
        'summary' => [
            'avgMonthly' => $avgMonthly,
            'bestMonth' => $bestMonth,
            'growthPercent' => $growthPercent,
            'totalOrders' => $totalOrders
        ]
    ]);
}

if ($path === '/api/admin/branches' && $method === 'GET') {
    $stmt = $pdo->query(
        "SELECT id, code, name, address_line, city, province, postal_code, lat, lng,
                contact_name, contact_phone, contact_email, status
         FROM branches
         ORDER BY created_at DESC"
    );
    $branches = [];
    foreach ($stmt as $row) {
        $branches[] = [
            'id' => (int)$row['id'],
            'code' => $row['code'],
            'name' => $row['name'],
            'addressLine' => $row['address_line'],
            'city' => $row['city'],
            'province' => $row['province'],
            'postalCode' => $row['postal_code'],
            'lat' => $row['lat'],
            'lng' => $row['lng'],
            'contactName' => $row['contact_name'],
            'contactPhone' => $row['contact_phone'],
            'contactEmail' => $row['contact_email'],
            'status' => $row['status']
        ];
    }

    json_response(['branches' => $branches]);
}

if ($path === '/api/admin/branches' && $method === 'POST') {
    $payload = get_json_body();
    $name = trim($payload['name'] ?? '');
    $addressLine = trim($payload['addressLine'] ?? '');
    $city = trim($payload['city'] ?? '');
    $province = trim($payload['province'] ?? '');
    $postalCode = trim($payload['postalCode'] ?? '');
    $lat = $payload['lat'] ?? null;
    $lng = $payload['lng'] ?? null;
    $contactName = trim($payload['contactName'] ?? '');
    $contactPhone = trim($payload['contactPhone'] ?? '');
    $contactEmail = trim($payload['contactEmail'] ?? '');
    $status = trim($payload['status'] ?? 'active');

    if ($name === '' || $addressLine === '' || $city === '' || $province === '' || $postalCode === '') {
        json_response(['error' => 'Branch name and address fields are required'], 422);
    }

    $insert = $pdo->prepare(
        'INSERT INTO branches (code, name, address_line, city, province, postal_code, lat, lng, contact_name, contact_phone, contact_email, status)
         VALUES (:code, :name, :address_line, :city, :province, :postal_code, :lat, :lng, :contact_name, :contact_phone, :contact_email, :status)'
    );
    $insert->execute([
        'code' => '',
        'name' => $name,
        'address_line' => $addressLine,
        'city' => $city,
        'province' => $province,
        'postal_code' => $postalCode,
        'lat' => $lat,
        'lng' => $lng,
        'contact_name' => $contactName,
        'contact_phone' => $contactPhone,
        'contact_email' => $contactEmail,
        'status' => $status === '' ? 'active' : $status
    ]);
    $branchId = (int)$pdo->lastInsertId();
    $code = 'BR-' . str_pad((string)$branchId, 3, '0', STR_PAD_LEFT);
    $pdo->prepare('UPDATE branches SET code = :code WHERE id = :id')->execute(['code' => $code, 'id' => $branchId]);

    json_response([
        'branch' => [
            'id' => $branchId,
            'code' => $code,
            'name' => $name,
            'addressLine' => $addressLine,
            'city' => $city,
            'province' => $province,
            'postalCode' => $postalCode,
            'lat' => $lat,
            'lng' => $lng,
            'contactName' => $contactName,
            'contactPhone' => $contactPhone,
            'contactEmail' => $contactEmail,
            'status' => $status === '' ? 'active' : $status
        ]
    ], 201);
}

if (preg_match('#^/api/admin/branches/(\d+)$#', $path, $matches) && $method === 'PATCH') {
    $branchId = (int)$matches[1];
    $payload = get_json_body();
    $name = trim($payload['name'] ?? '');
    $addressLine = trim($payload['addressLine'] ?? '');
    $city = trim($payload['city'] ?? '');
    $province = trim($payload['province'] ?? '');
    $postalCode = trim($payload['postalCode'] ?? '');
    $lat = $payload['lat'] ?? null;
    $lng = $payload['lng'] ?? null;
    $contactName = trim($payload['contactName'] ?? '');
    $contactPhone = trim($payload['contactPhone'] ?? '');
    $contactEmail = trim($payload['contactEmail'] ?? '');
    $status = trim($payload['status'] ?? '');

    $stmt = $pdo->prepare('SELECT id FROM branches WHERE id = :id');
    $stmt->execute(['id' => $branchId]);
    if (!$stmt->fetch()) {
        json_response(['error' => 'Branch not found'], 404);
    }

    $update = $pdo->prepare(
        'UPDATE branches
         SET name = :name,
             address_line = :address_line,
             city = :city,
             province = :province,
             postal_code = :postal_code,
             lat = :lat,
             lng = :lng,
             contact_name = :contact_name,
             contact_phone = :contact_phone,
             contact_email = :contact_email,
             status = :status
         WHERE id = :id'
    );
    $update->execute([
        'name' => $name,
        'address_line' => $addressLine,
        'city' => $city,
        'province' => $province,
        'postal_code' => $postalCode,
        'lat' => $lat,
        'lng' => $lng,
        'contact_name' => $contactName,
        'contact_phone' => $contactPhone,
        'contact_email' => $contactEmail,
        'status' => $status === '' ? 'active' : $status,
        'id' => $branchId
    ]);

    json_response(['message' => 'Branch updated']);
}

if ($path === '/api/routes/recommend' && $method === 'POST') {
    $payload = get_json_body();
    $courierId = (int)($payload['courierId'] ?? 0);
    if ($courierId <= 0) {
        json_response(['error' => 'courierId is required'], 422);
    }
    $bookingIds = $payload['bookingIds'] ?? [];
    if (!is_array($bookingIds)) {
        json_response(['error' => 'bookingIds must be an array'], 422);
    }
    $bookingIds = array_values(array_filter(array_map('intval', $bookingIds), function ($id) {
        return $id > 0;
    }));
    $locationSnapshot = courier_location_details($pdo, $courierId);
    $vehicleSnapshot = courier_vehicle_details($pdo, $courierId);

    if (!$bookingIds) {
        json_response([
            'start' => $locationSnapshot['start'],
            'courierLocation' => $locationSnapshot['courier'],
            'branchLocation' => $locationSnapshot['branch'],
            'vehicle' => $vehicleSnapshot,
            'candidates' => []
        ]);
    }

    $placeholders = implode(',', array_fill(0, count($bookingIds), '?'));
    $guardStmt = $pdo->prepare(
        "SELECT id, status
         FROM bookings
         WHERE id IN ($placeholders)"
    );
    $guardStmt->execute($bookingIds);
    $guardRows = $guardStmt->fetchAll();
    $blockedDeliveryIds = [];
    $blockedLinehaulIds = [];
    foreach ($guardRows as $row) {
        $status = (string)($row['status'] ?? '');
        if ($status === 'delivery_assigned') {
            $blockedDeliveryIds[] = (int)$row['id'];
        }
        if ($status === 'linehaul_assigned') {
            $blockedLinehaulIds[] = (int)$row['id'];
        }
    }
    if ($blockedDeliveryIds || $blockedLinehaulIds) {
        $reasonParts = [];
        if ($blockedDeliveryIds) {
            $reasonParts[] = 'Delivery route is locked until delivery_load_confirmed.';
        }
        if ($blockedLinehaulIds) {
            $reasonParts[] = 'Linehaul route is locked until linehaul_load_confirmed.';
        }
        json_response([
            'start' => $locationSnapshot['start'],
            'courierLocation' => $locationSnapshot['courier'],
            'branchLocation' => $locationSnapshot['branch'],
            'vehicle' => $vehicleSnapshot,
            'candidates' => [],
            'reason' => implode(' ', $reasonParts),
            'blockedBookingIds' => [
                'delivery' => $blockedDeliveryIds,
                'linehaul' => $blockedLinehaulIds
            ]
        ], 403);
    }

    $persist = to_bool($payload['persist'] ?? true);
    $result = recommend_routes($pdo, $courierId, $bookingIds);

    if ($bookingIds && empty($result['candidates'])) {
        $reason = $result['reason'] ?? 'No candidates generated.';
        add_system_alert(
            $pdo,
            'Technical',
            'Route Optimization Failed',
            'Courier #' . $courierId . ': ' . $reason,
            'Verify courier location/role and booking data.'
        );
    }

    if ($persist && $result['candidates']) {
        $routePlanId = create_route_plan($pdo, $courierId);
        $candidateIds = save_route_candidates($pdo, $routePlanId, $result['candidates']);
        json_response([
            'routePlanId' => $routePlanId,
            'candidateIds' => $candidateIds,
            'start' => $result['start'],
            'courierLocation' => $result['courierLocation'],
            'branchLocation' => $result['branchLocation'],
            'vehicle' => $result['vehicle'],
            'candidates' => $result['candidates'],
            'reason' => $result['reason'] ?? null
        ]);
    }

    json_response([
        'start' => $result['start'],
        'courierLocation' => $result['courierLocation'],
        'branchLocation' => $result['branchLocation'],
        'vehicle' => $result['vehicle'],
        'candidates' => $result['candidates'],
        'reason' => $result['reason'] ?? null
    ]);
}

if ($path === '/api/routes/select' && $method === 'POST') {
    $payload = get_json_body();
    $routePlanId = (int)($payload['routePlanId'] ?? 0);
    $candidateId = (int)($payload['candidateId'] ?? 0);
    if ($routePlanId <= 0 || $candidateId <= 0) {
        json_response(['error' => 'routePlanId and candidateId are required'], 422);
    }

    $result = apply_candidate_to_plan($pdo, $routePlanId, $candidateId);
    if (!$result['ok']) {
        json_response(['error' => $result['reason']], 422);
    }

    json_response(['message' => 'Route candidate selected']);
}

if ($path === '/api/routes/reoptimize' && $method === 'POST') {
    $payload = get_json_body();
    $routePlanId = (int)($payload['routePlanId'] ?? 0);
    if ($routePlanId <= 0) {
        json_response(['error' => 'routePlanId is required'], 422);
    }
    $persist = to_bool($payload['persist'] ?? true);

    $planStmt = $pdo->prepare('SELECT courier_id FROM route_plans WHERE id = :id');
    $planStmt->execute(['id' => $routePlanId]);
    $plan = $planStmt->fetch();
    if (!$plan) {
        json_response(['error' => 'Route plan not found'], 404);
    }
    $courierId = (int)$plan['courier_id'];

    $lockedStmt = $pdo->prepare(
        'SELECT route_stops.booking_id, route_stops.stop_kind, route_stops.address_id,
                route_stops.eta_minutes, route_stops.stop_order,
                addresses.lat, addresses.lng
         FROM route_stops
         JOIN addresses ON addresses.id = route_stops.address_id
         WHERE route_stops.route_plan_id = :id AND route_stops.locked = 1
         ORDER BY route_stops.stop_order ASC'
    );
    $lockedStmt->execute(['id' => $routePlanId]);
    $lockedStops = $lockedStmt->fetchAll();

    $startOverride = null;
    if ($lockedStops) {
        $last = $lockedStops[count($lockedStops) - 1];
        if ($last['lat'] !== null && $last['lng'] !== null) {
            $startOverride = ['lat' => (float)$last['lat'], 'lng' => (float)$last['lng']];
        }
    }

    $remainingStmt = $pdo->prepare(
        'SELECT DISTINCT booking_id FROM route_stops WHERE route_plan_id = :id AND locked = 0'
    );
    $remainingStmt->execute(['id' => $routePlanId]);
    $bookingIds = array_map('intval', array_column($remainingStmt->fetchAll(), 'booking_id'));
    if (!$bookingIds) {
        json_response(['message' => 'No remaining bookings to optimize', 'candidates' => []]);
    }

    $result = recommend_routes($pdo, $courierId, $bookingIds, $startOverride, $lockedStops);
    if ($bookingIds && empty($result['candidates'])) {
        $reason = $result['reason'] ?? 'No candidates generated.';
        add_system_alert(
            $pdo,
            'Technical',
            'Route Optimization Failed',
            'RoutePlan #' . $routePlanId . ': ' . $reason,
            'Verify courier location/role and booking data.'
        );
    }
    if ($persist && $result['candidates']) {
        $candidateIds = save_route_candidates($pdo, $routePlanId, $result['candidates']);
        json_response([
            'routePlanId' => $routePlanId,
            'candidateIds' => $candidateIds,
            'start' => $result['start'],
            'courierLocation' => $result['courierLocation'],
            'branchLocation' => $result['branchLocation'],
            'vehicle' => $result['vehicle'],
            'candidates' => $result['candidates'],
            'reason' => $result['reason'] ?? null
        ]);
    }

    json_response([
        'routePlanId' => $routePlanId,
        'start' => $result['start'],
        'courierLocation' => $result['courierLocation'],
        'branchLocation' => $result['branchLocation'],
        'vehicle' => $result['vehicle'],
        'candidates' => $result['candidates'],
        'reason' => $result['reason'] ?? null
    ]);
}

if ($path === '/api/payments/khalti/initiate' && $method === 'POST') {
    $payload = get_json_body();
    $bookingId = (int)($payload['bookingId'] ?? 0);
    $bookingCode = trim((string)($payload['bookingCode'] ?? ''));
    $hasBooking = $bookingId > 0 || $bookingCode !== '';

    if (!$hasBooking && to_decimal_or_null($payload['amount'] ?? null) === null) {
        json_response(['error' => 'bookingId/bookingCode or amount is required'], 422);
    }

    $booking = null;
    if ($hasBooking) {
        $stmt = $pdo->prepare(
            'SELECT bookings.id, bookings.booking_code, bookings.distance_km, bookings.service_type,
                    packages.category, packages.declared_weight,
                    users.full_name, users.email, users.phone
             FROM bookings
             JOIN packages ON packages.id = bookings.package_id
             JOIN users ON users.id = bookings.customer_id
             WHERE bookings.id = :id OR bookings.booking_code = :code
             LIMIT 1'
        );
        $stmt->execute(['id' => $bookingId, 'code' => $bookingCode]);
        $booking = $stmt->fetch();
        if (!$booking) {
            json_response(['error' => 'Booking not found'], 404);
        }
    }

    $amount = to_decimal_or_null($payload['amount'] ?? null);
    if ($amount === null) {
        if (!$booking) {
            json_response(['error' => 'amount is required'], 422);
        }
        $weightKg = parse_weight_kg($booking['declared_weight'] ?? null);
        $amount = calculate_courier_fee($booking['distance_km'], $weightKg, $booking['category'], $booking['service_type']);
    }
    $amountPaisa = (int)round($amount * 100);
    if ($amountPaisa <= 0) {
        json_response(['error' => 'Invalid amount'], 422);
    }

    $returnUrl = $payload['returnUrl'] ?? ($config['khalti']['return_url'] ?? null);
    $websiteUrl = $payload['websiteUrl'] ?? ($config['khalti']['website_url'] ?? null);
    if (!$returnUrl || !$websiteUrl) {
        json_response(['error' => 'returnUrl and websiteUrl are required'], 422);
    }

    $purchaseOrderId = $payload['purchaseOrderId'] ?? ($booking['booking_code'] ?? ('TMP-' . date('YmdHis') . random_int(100, 999)));
    $purchaseOrderName = $payload['purchaseOrderName'] ?? ($booking ? ('Courier booking ' . $booking['booking_code']) : 'Courier booking');
    $customerName = $payload['customer']['name'] ?? ($booking['full_name'] ?? '');
    $customerEmail = $payload['customer']['email'] ?? ($booking['email'] ?? '');
    $customerPhone = $payload['customer']['phone'] ?? ($booking['phone'] ?? '');

    $khaltiPayload = [
        'return_url' => $returnUrl,
        'website_url' => $websiteUrl,
        'amount' => $amountPaisa,
        'purchase_order_id' => $purchaseOrderId,
        'purchase_order_name' => $purchaseOrderName,
        'customer_info' => [
            'name' => $customerName,
            'email' => $customerEmail,
            'phone' => $customerPhone
        ]
    ];

    $result = khalti_request($config['khalti'] ?? [], 'epayment/initiate/', $khaltiPayload);
    if (!$result['ok']) {
        $body = $result['body'] ?? [];
        $message = null;
        if (is_array($body)) {
            if (isset($body['detail'])) {
                $message = $body['detail'];
            } elseif (isset($body['message'])) {
                $message = $body['message'];
            } else {
                foreach ($body as $value) {
                    if (is_string($value)) {
                        $message = $value;
                        break;
                    }
                    if (is_array($value) && isset($value[0]) && is_string($value[0])) {
                        $message = $value[0];
                        break;
                    }
                }
            }
        }
        if (!$message) {
            $errorDetail = $result['error'] ?? null;
            if ($errorDetail) {
                $message = 'Khalti initiation failed: ' . $errorDetail;
            } else {
                $message = 'Khalti initiation failed (HTTP ' . ($result['status'] ?? '0') . ')';
            }
        }
        json_response(['error' => $message, 'details' => $result['body']], 502);
    }

    if (!$booking) {
        json_response([
            'purchaseOrderId' => $purchaseOrderId,
            'payment' => [
                'method' => 'wallet',
                'provider' => 'khalti',
                'status' => 'pending',
                'total' => $amount,
                'providerReference' => $result['body']['pidx'] ?? null,
                'paymentUrl' => $result['body']['payment_url'] ?? null,
                'expiresAt' => $result['body']['expires_at'] ?? null
            ]
        ]);
    }

    $existing = $pdo->prepare('SELECT id, status FROM payments WHERE booking_id = :id ORDER BY id DESC LIMIT 1');
    $existing->execute(['id' => (int)$booking['id']]);
    $paymentRow = $existing->fetch();

    $totals = resolve_payment_totals(['total' => $amount], $booking['distance_km'], parse_weight_kg($booking['declared_weight'] ?? null), $booking['category'], $booking['service_type']);

    if ($paymentRow && $paymentRow['status'] === 'paid') {
        json_response(['error' => 'Payment already completed'], 409);
    }

    if ($paymentRow) {
        $update = $pdo->prepare(
            'UPDATE payments
             SET method = :method, provider = :provider, provider_reference = :provider_reference, provider_payload = :provider_payload,
                 base_rate = :base_rate, distance_fee = :distance_fee, service_fee = :service_fee, additional_fees = :additional_fees,
                 subtotal = :subtotal, tax = :tax, discount = :discount, total = :total, status = :status
             WHERE id = :id'
        );
        $update->execute([
            'method' => 'wallet',
            'provider' => 'khalti',
            'provider_reference' => $result['body']['pidx'] ?? null,
            'provider_payload' => json_encode($result['body']),
            'base_rate' => $totals['base_rate'],
            'distance_fee' => $totals['distance_fee'],
            'service_fee' => $totals['service_fee'],
            'additional_fees' => $totals['additional_fees'],
            'subtotal' => $totals['subtotal'],
            'tax' => $totals['tax'],
            'discount' => $totals['discount'],
            'total' => $totals['total'],
            'status' => 'pending',
            'id' => $paymentRow['id']
        ]);
        $paymentId = (int)$paymentRow['id'];
    } else {
        $insert = $pdo->prepare(
            'INSERT INTO payments (booking_id, method, provider, provider_reference, provider_payload, base_rate, distance_fee, service_fee, additional_fees, subtotal, tax, discount, total, status)
             VALUES (:booking_id, :method, :provider, :provider_reference, :provider_payload, :base_rate, :distance_fee, :service_fee, :additional_fees, :subtotal, :tax, :discount, :total, :status)'
        );
        $insert->execute([
            'booking_id' => (int)$booking['id'],
            'method' => 'wallet',
            'provider' => 'khalti',
            'provider_reference' => $result['body']['pidx'] ?? null,
            'provider_payload' => json_encode($result['body']),
            'base_rate' => $totals['base_rate'],
            'distance_fee' => $totals['distance_fee'],
            'service_fee' => $totals['service_fee'],
            'additional_fees' => $totals['additional_fees'],
            'subtotal' => $totals['subtotal'],
            'tax' => $totals['tax'],
            'discount' => $totals['discount'],
            'total' => $totals['total'],
            'status' => 'pending'
        ]);
        $paymentId = (int)$pdo->lastInsertId();
    }

    json_response([
        'bookingId' => (int)$booking['id'],
        'bookingCode' => $booking['booking_code'],
        'payment' => [
            'id' => $paymentId,
            'method' => 'wallet',
            'provider' => 'khalti',
            'status' => 'pending',
            'total' => $amount,
            'providerReference' => $result['body']['pidx'] ?? null,
            'paymentUrl' => $result['body']['payment_url'] ?? null,
            'expiresAt' => $result['body']['expires_at'] ?? null
        ]
    ]);
}

if ($path === '/api/payments/khalti/verify' && $method === 'POST') {
    $payload = get_json_body();
    $pidx = trim((string)($payload['pidx'] ?? ''));
    $bookingId = (int)($payload['bookingId'] ?? 0);
    $bookingCode = trim((string)($payload['bookingCode'] ?? ''));

    if ($pidx === '') {
        json_response(['error' => 'pidx is required'], 422);
    }

    $result = khalti_request($config['khalti'] ?? [], 'epayment/lookup/', ['pidx' => $pidx]);
    if (!$result['ok']) {
        json_response(['error' => 'Khalti lookup failed', 'details' => $result['body']], 502);
    }

    $statusRaw = strtolower((string)($result['body']['status'] ?? ''));
    $paymentStatus = 'pending';
    if ($statusRaw === 'completed') {
        $paymentStatus = 'paid';
    } elseif (in_array($statusRaw, ['refunded', 'partially_refunded'], true)) {
        $paymentStatus = 'refunded';
    } elseif ($statusRaw === 'failed') {
        $paymentStatus = 'failed';
    }

    $paymentRow = null;
    if ($bookingId > 0 || $bookingCode !== '') {
        $paymentStmt = $pdo->prepare(
            'SELECT payments.id
             FROM payments
             JOIN bookings ON bookings.id = payments.booking_id
             WHERE (bookings.id = :id OR bookings.booking_code = :code)
               AND payments.provider_reference = :pidx
             ORDER BY payments.id DESC
             LIMIT 1'
        );
        $paymentStmt->execute(['id' => $bookingId, 'code' => $bookingCode, 'pidx' => $pidx]);
        $paymentRow = $paymentStmt->fetch();
    } else {
        $paymentStmt = $pdo->prepare(
            'SELECT id FROM payments WHERE provider_reference = :pidx ORDER BY id DESC LIMIT 1'
        );
        $paymentStmt->execute(['pidx' => $pidx]);
        $paymentRow = $paymentStmt->fetch();
    }

    if ($paymentRow) {
        $update = $pdo->prepare(
            'UPDATE payments
             SET status = :status, paid_at = CASE WHEN :status = "paid" THEN CURRENT_TIMESTAMP ELSE paid_at END,
                 provider_payload = :payload
             WHERE id = :id'
        );
        $update->execute([
            'status' => $paymentStatus,
            'payload' => json_encode($result['body']),
            'id' => $paymentRow['id']
        ]);
    }

    json_response([
        'status' => $paymentStatus,
        'details' => $result['body']
    ]);
}

if ($path === '/api/bookings' && $method === 'POST') {
    $payload = get_json_body();
    $customerId = (int)($payload['customerId'] ?? 0);
    $pickup = $payload['pickup'] ?? [];
    $delivery = $payload['delivery'] ?? [];
    $package = $payload['package'] ?? [];
    $schedule = $payload['schedule'] ?? [];
    $options = $payload['options'] ?? [];
    $paymentPayload = $payload['payment'] ?? [];
    $paymentMethodInput = $paymentPayload['method'] ?? '';
    $paymentProviderInput = $paymentPayload['provider'] ?? '';

    if ($customerId <= 0) {
        json_response(['error' => 'customerId is required'], 422);
    }

    $requiredFields = [
        'pickupAddress' => $pickup['address'] ?? '',
        'pickupCity' => $pickup['city'] ?? '',
        'pickupProvince' => $pickup['province'] ?? '',
        'pickupPostalCode' => $pickup['postalCode'] ?? '',
        'pickupPhone' => $pickup['phone'] ?? '',
        'pickupContactName' => $pickup['contactName'] ?? '',
        'deliveryAddress' => $delivery['address'] ?? '',
        'deliveryCity' => $delivery['city'] ?? '',
        'deliveryProvince' => $delivery['province'] ?? '',
        'deliveryPostalCode' => $delivery['postalCode'] ?? '',
        'deliveryPhone' => $delivery['phone'] ?? '',
        'deliveryContactName' => $delivery['contactName'] ?? '',
        'category' => $package['category'] ?? '',
        'size' => $package['size'] ?? '',
        'weight' => $package['weight'] ?? '',
        'description' => $package['description'] ?? '',
        'serviceType' => $schedule['serviceType'] ?? ''
    ];
    foreach ($requiredFields as $key => $value) {
        if (trim((string)$value) === '') {
            json_response(['error' => $key . ' is required'], 422);
        }
    }

    $serviceType = (string)($schedule['serviceType'] ?? '');
    $allowedServiceTypes = ['same-day', 'next-day', 'standard', 'scheduled', 'express'];
    if (!in_array($serviceType, $allowedServiceTypes, true)) {
        json_response(['error' => 'Invalid service type'], 422);
    }

    $paymentMethod = null;
    $paymentProvider = null;
    $paymentProviderReferenceInput = trim((string)($paymentPayload['providerReference'] ?? ''));
    $paymentProvidedStatus = strtolower(trim((string)($paymentPayload['status'] ?? '')));
    $khaltiLockKey = null;
    if ($paymentMethodInput !== '') {
        [$paymentMethod, $paymentProvider] = normalize_payment_method($paymentMethodInput);
        if ($paymentMethod === null) {
            json_response(['error' => 'Invalid payment method'], 422);
        }
        if ($paymentProvider === null && trim((string)$paymentProviderInput) !== '') {
            $paymentProvider = strtolower(trim((string)$paymentProviderInput));
        }
    }

    if ($paymentMethod === 'wallet' && $paymentProvider === 'khalti') {
        if ($paymentProviderReferenceInput === '') {
            json_response(['error' => 'Khalti payment was not confirmed. Booking was not created.'], 422);
        }

        $khaltiLookup = khalti_request($config['khalti'] ?? [], 'epayment/lookup/', ['pidx' => $paymentProviderReferenceInput]);
        if (!$khaltiLookup['ok']) {
            json_response(['error' => 'Unable to verify Khalti payment. Booking was not created.', 'details' => $khaltiLookup['body']], 502);
        }

        $khaltiStatusRaw = strtolower((string)($khaltiLookup['body']['status'] ?? ''));
        if ($khaltiStatusRaw !== 'completed') {
            $khaltiError = 'Khalti payment is not successful yet. Booking was not created.';
            if ($khaltiStatusRaw === 'failed') {
                $khaltiError = 'Khalti payment failed. Booking was not created.';
            } elseif (in_array($khaltiStatusRaw, ['expired', 'cancelled', 'canceled'], true)) {
                $khaltiError = 'Khalti payment was cancelled/expired. Booking was not created.';
            } elseif ($khaltiStatusRaw === 'pending') {
                $khaltiError = 'Khalti payment is pending. Booking was not created.';
            }
            json_response([
                'error' => $khaltiError,
                'paymentStatus' => $khaltiStatusRaw
            ], 422);
        }

        $paymentProvidedStatus = 'paid';
        $paymentPayload['status'] = 'paid';
        $paymentPayload['providerPayload'] = $khaltiLookup['body'] ?? null;
    }

    if (
        $paymentMethod === 'wallet'
        && $paymentProvider === 'khalti'
        && $paymentProviderReferenceInput !== ''
        && $paymentProvidedStatus === 'paid'
    ) {
        $lockToken = preg_replace('/[^a-z0-9_\-]/i', '', $paymentProviderReferenceInput);
        if ($lockToken === '') {
            $lockToken = substr(sha1($paymentProviderReferenceInput), 0, 24);
        } else {
            $lockToken = substr($lockToken, 0, 48);
        }
        $khaltiLockKey = 'khalti_booking_' . $lockToken;
        $lockStmt = $pdo->prepare('SELECT GET_LOCK(:lock_key, 10) AS lock_acquired');
        $lockStmt->execute(['lock_key' => $khaltiLockKey]);
        $lockAcquired = (int)$lockStmt->fetchColumn() === 1;
        if (!$lockAcquired) {
            json_response(['error' => 'Payment confirmation is already being processed. Please retry in a moment.'], 409);
        }

        $existingBookingStmt = $pdo->prepare(
            'SELECT bookings.id AS booking_id, bookings.booking_code, bookings.delivery_access_code,
                    payments.id AS payment_id, payments.status AS payment_status, payments.total AS payment_total
             FROM payments
             JOIN bookings ON bookings.id = payments.booking_id
             WHERE payments.provider = :provider
               AND payments.provider_reference = :provider_reference
               AND bookings.customer_id = :customer_id
             ORDER BY payments.id DESC
             LIMIT 1'
        );
        $existingBookingStmt->execute([
            'provider' => 'khalti',
            'provider_reference' => $paymentProviderReferenceInput,
            'customer_id' => $customerId
        ]);
        $existingBooking = $existingBookingStmt->fetch();
        if ($existingBooking) {
            $releaseStmt = $pdo->prepare('SELECT RELEASE_LOCK(:lock_key)');
            $releaseStmt->execute(['lock_key' => $khaltiLockKey]);
            json_response([
                'message' => 'Booking already exists for this payment',
                'booking' => [
                    'id' => (int)$existingBooking['booking_id'],
                    'bookingCode' => $existingBooking['booking_code'],
                    'deliveryAccessCode' => $existingBooking['delivery_access_code'] ?? null
                ],
                'assignment' => null,
                'payment' => [
                    'id' => (int)$existingBooking['payment_id'],
                    'method' => 'wallet',
                    'provider' => 'khalti',
                    'status' => $existingBooking['payment_status'] ?: 'paid',
                    'total' => $existingBooking['payment_total'] !== null ? (float)$existingBooking['payment_total'] : null,
                    'providerReference' => $paymentProviderReferenceInput
                ]
            ]);
        }
    }

    if ($serviceType === 'scheduled') {
        if (trim((string)($schedule['scheduledDate'] ?? '')) === '' || trim((string)($schedule['scheduledTime'] ?? '')) === '') {
            json_response(['error' => 'scheduledDate and scheduledTime are required'], 422);
        }
    }

    $pickupLatValue = to_decimal_or_null($pickup['lat'] ?? null);
    $pickupLngValue = to_decimal_or_null($pickup['lng'] ?? null);
    $deliveryLatValue = to_decimal_or_null($delivery['lat'] ?? null);
    $deliveryLngValue = to_decimal_or_null($delivery['lng'] ?? null);
    $distanceKm = null;
    if ($pickupLatValue !== null && $pickupLngValue !== null && $deliveryLatValue !== null && $deliveryLngValue !== null) {
        $distanceKm = calculate_distance_km($pickupLatValue, $pickupLngValue, $deliveryLatValue, $deliveryLngValue);
        if ($serviceType === 'same-day' && $distanceKm > 20) {
            json_response(['error' => 'Same-day delivery is only available for distances up to 20 km'], 422);
        }
    }

    $userStmt = $pdo->prepare('SELECT id, full_name, email, phone FROM users WHERE id = :id');
    $userStmt->execute(['id' => $customerId]);
    $customerRow = $userStmt->fetch();
    if (!$customerRow) {
        json_response(['error' => 'Customer not found'], 404);
    }

    $pdo->beginTransaction();
    $packageInsert = $pdo->prepare(
        'INSERT INTO packages (category, size, declared_weight, description, length_cm, width_cm, height_cm, declared_value, special_instructions, signature_required, photo_proof, call_before_delivery, fragile_handling, insurance)
         VALUES (:category, :size, :declared_weight, :description, :length_cm, :width_cm, :height_cm, :declared_value, :special_instructions, :signature_required, :photo_proof, :call_before_delivery, :fragile_handling, :insurance)'
    );
    $inchToCm = 2.54;
    $packageInsert->execute([
        'category' => $package['category'],
        'size' => $package['size'],
        'declared_weight' => (string)$package['weight'],
        'description' => $package['description'],
        'length_cm' => ($package['length'] ?? '') !== '' ? (to_decimal_or_null($package['length']) * $inchToCm) : null,
        'width_cm' => ($package['width'] ?? '') !== '' ? (to_decimal_or_null($package['width']) * $inchToCm) : null,
        'height_cm' => ($package['height'] ?? '') !== '' ? (to_decimal_or_null($package['height']) * $inchToCm) : null,
        'declared_value' => to_decimal_or_null($package['value'] ?? null),
        'special_instructions' => $options['specialInstructions'] ?? '',
        'signature_required' => to_bool($options['signatureRequired'] ?? false),
        'photo_proof' => to_bool($options['photoProof'] ?? false),
        'call_before_delivery' => to_bool($options['callBeforeDelivery'] ?? false),
        'fragile_handling' => to_bool($options['fragileHandling'] ?? false),
        'insurance' => to_bool($options['insurance'] ?? false)
    ]);
    $packageId = (int)$pdo->lastInsertId();

    $addressInsert = $pdo->prepare(
        'INSERT INTO addresses (line1, line2, city, province, postal_code, country, lat, lng, contact_name, contact_phone)
         VALUES (:line1, :line2, :city, :province, :postal_code, :country, :lat, :lng, :contact_name, :contact_phone)'
    );
    $addressInsert->execute([
        'line1' => $pickup['address'],
        'line2' => '',
        'city' => $pickup['city'],
        'province' => $pickup['province'],
        'postal_code' => $pickup['postalCode'],
        'country' => 'Nepal',
        'lat' => $pickupLatValue,
        'lng' => $pickupLngValue,
        'contact_name' => $pickup['contactName'],
        'contact_phone' => $pickup['phone']
    ]);
    $pickupAddressId = (int)$pdo->lastInsertId();

    $addressInsert->execute([
        'line1' => $delivery['address'],
        'line2' => '',
        'city' => $delivery['city'],
        'province' => $delivery['province'],
        'postal_code' => $delivery['postalCode'],
        'country' => 'Nepal',
        'lat' => $deliveryLatValue,
        'lng' => $deliveryLngValue,
        'contact_name' => $delivery['contactName'],
        'contact_phone' => $delivery['phone']
    ]);
    $deliveryAddressId = (int)$pdo->lastInsertId();

    $originBranchId = null;
    $destinationBranchId = null;
    $requiresLinehaul = to_bool($payload['requiresLinehaul'] ?? ($options['requiresLinehaul'] ?? false));
    $pickupCityToken = normalize_city_token($pickup['city'] ?? '');
    $deliveryCityToken = normalize_city_token($delivery['city'] ?? '');
    $originBranchId = find_nearest_branch(
        $pdo,
        $pickupLatValue,
        $pickupLngValue,
        $pickup['city'] ?? null,
        $pickup['province'] ?? null
    );
    $destinationBranchId = find_nearest_branch(
        $pdo,
        $deliveryLatValue,
        $deliveryLngValue,
        $delivery['city'] ?? null,
        $delivery['province'] ?? null
    );
    $isIntercity = $requiresLinehaul;
    if (!$isIntercity) {
        if ($originBranchId !== null && $destinationBranchId !== null) {
            $isIntercity = (int)$originBranchId !== (int)$destinationBranchId;
        } else {
            $isIntercity = $pickupCityToken !== '' && $deliveryCityToken !== '' && $pickupCityToken !== $deliveryCityToken;
        }
    }
    $currentBranchId = $originBranchId;

    $bookingCode = generate_booking_code($pdo);
    $deliveryAccessCode = generate_delivery_access_code($pdo);
    $bookingInsert = $pdo->prepare(
        'INSERT INTO bookings (
            booking_code, delivery_access_code, customer_id, package_id, pickup_address_id, delivery_address_id,
            service_type, scheduled_date, scheduled_time, distance_km,
            origin_branch_id, destination_branch_id, current_branch_id,
            requires_linehaul, is_intercity
        )
         VALUES (
            :booking_code, :delivery_access_code, :customer_id, :package_id, :pickup_address_id, :delivery_address_id,
            :service_type, :scheduled_date, :scheduled_time, :distance_km,
            :origin_branch_id, :destination_branch_id, :current_branch_id,
            :requires_linehaul, :is_intercity
        )'
    );
    $bookingInsert->execute([
        'booking_code' => $bookingCode,
        'delivery_access_code' => $deliveryAccessCode,
        'customer_id' => $customerId,
        'package_id' => $packageId,
        'pickup_address_id' => $pickupAddressId,
        'delivery_address_id' => $deliveryAddressId,
        'service_type' => $serviceType,
        'scheduled_date' => $schedule['scheduledDate'] ?: null,
        'scheduled_time' => $schedule['scheduledTime'] ?: null,
        'distance_km' => $distanceKm,
        'origin_branch_id' => $originBranchId,
        'destination_branch_id' => $destinationBranchId,
        'current_branch_id' => $currentBranchId,
        'requires_linehaul' => $requiresLinehaul,
        'is_intercity' => $isIntercity
    ]);
    $bookingId = (int)$pdo->lastInsertId();

    $paymentId = null;
    $paymentStatus = null;
    $paymentTotal = null;
    $paymentProviderReference = null;
    $paymentProviderPayload = null;
    if ($paymentMethod !== null) {
        $weightKg = parse_weight_kg($package['weight'] ?? null);
        $totals = resolve_payment_totals($paymentPayload, $distanceKm, $weightKg, $package['category'] ?? null, $serviceType);
        $paymentTotal = $totals['total'];
        $paymentStatus = 'pending';
        $paymentProviderReference = trim((string)($paymentPayload['providerReference'] ?? '')) ?: null;
        $paymentProviderPayload = $paymentPayload['providerPayload'] ?? null;
        $providedStatus = strtolower(trim((string)($paymentPayload['status'] ?? '')));
        if (in_array($providedStatus, ['pending', 'paid', 'failed', 'refunded'], true)) {
            $paymentStatus = $providedStatus;
        }

        $paymentInsert = $pdo->prepare(
            'INSERT INTO payments (booking_id, method, provider, provider_reference, provider_payload, base_rate, distance_fee, service_fee, additional_fees, subtotal, tax, discount, total, status, paid_at)
             VALUES (:booking_id, :method, :provider, :provider_reference, :provider_payload, :base_rate, :distance_fee, :service_fee, :additional_fees, :subtotal, :tax, :discount, :total, :status, :paid_at)'
        );
        $paymentInsert->execute([
            'booking_id' => $bookingId,
            'method' => $paymentMethod,
            'provider' => $paymentProvider,
            'provider_reference' => $paymentProviderReference,
            'provider_payload' => $paymentProviderPayload ? json_encode($paymentProviderPayload) : null,
            'base_rate' => $totals['base_rate'],
            'distance_fee' => $totals['distance_fee'],
            'service_fee' => $totals['service_fee'],
            'additional_fees' => $totals['additional_fees'],
            'subtotal' => $totals['subtotal'],
            'tax' => $totals['tax'],
            'discount' => $totals['discount'],
            'total' => $totals['total'],
            'status' => $paymentStatus,
            'paid_at' => $paymentStatus === 'paid' ? date('Y-m-d H:i:s') : null
        ]);
        $paymentId = (int)$pdo->lastInsertId();
    }

    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description, location_text, lat, lng)
         VALUES (:booking_id, :status, :description, :location_text, :lat, :lng)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => 'created',
        'description' => 'Booking created',
        'location_text' => sprintf('%s, %s, %s %s', $pickup['address'], $pickup['city'], $pickup['province'], $pickup['postalCode']),
        'lat' => to_decimal_or_null($pickup['lat'] ?? null),
        'lng' => to_decimal_or_null($pickup['lng'] ?? null)
    ]);
    write_order_event(
        $pdo,
        $bookingId,
        'created',
        'customer',
        $customerId,
        [
            'pickupCity' => $pickup['city'] ?? null,
            'deliveryCity' => $delivery['city'] ?? null,
            'requiresLinehaul' => $requiresLinehaul,
            'isIntercity' => $isIntercity
        ],
        'Booking created'
    );
    $pdo->commit();

    $paymentResponse = null;
    if ($paymentMethod !== null && $paymentId !== null) {
        $paymentResponse = [
            'id' => $paymentId,
            'method' => $paymentMethod,
            'provider' => $paymentProvider,
            'status' => $paymentStatus,
            'total' => $paymentTotal
        ];
        if ($paymentProviderReference) {
            $paymentResponse['providerReference'] = $paymentProviderReference;
        }
    }

    if ($paymentMethod === 'wallet' && $paymentProvider === 'khalti' && $paymentId !== null && to_bool($paymentPayload['initiate'] ?? true)) {
        $returnUrl = $paymentPayload['returnUrl'] ?? ($config['khalti']['return_url'] ?? null);
        $websiteUrl = $paymentPayload['websiteUrl'] ?? ($config['khalti']['website_url'] ?? null);
        $amountPaisa = $paymentTotal !== null ? (int)round($paymentTotal * 100) : 0;

        if ($returnUrl && $websiteUrl && $amountPaisa > 0) {
            $khaltiPayload = [
                'return_url' => $returnUrl,
                'website_url' => $websiteUrl,
                'amount' => $amountPaisa,
                'purchase_order_id' => $bookingCode,
                'purchase_order_name' => $paymentPayload['purchaseOrderName'] ?? ('Courier booking ' . $bookingCode),
                'customer_info' => [
                    'name' => $paymentPayload['customer']['name'] ?? ($customerRow['full_name'] ?? ''),
                    'email' => $paymentPayload['customer']['email'] ?? ($customerRow['email'] ?? ''),
                    'phone' => $paymentPayload['customer']['phone'] ?? ($customerRow['phone'] ?? '')
                ]
            ];
            $khaltiResult = khalti_request($config['khalti'] ?? [], 'epayment/initiate/', $khaltiPayload);

            if ($khaltiResult['ok'] && isset($khaltiResult['body']['pidx'])) {
                $pdo->prepare('UPDATE payments SET provider_reference = :ref, provider_payload = :payload WHERE id = :id')
                    ->execute([
                        'ref' => $khaltiResult['body']['pidx'],
                        'payload' => json_encode($khaltiResult['body']),
                        'id' => $paymentId
                    ]);

                $paymentResponse['providerReference'] = $khaltiResult['body']['pidx'];
                $paymentResponse['paymentUrl'] = $khaltiResult['body']['payment_url'] ?? null;
                $paymentResponse['expiresAt'] = $khaltiResult['body']['expires_at'] ?? null;
            } else {
                $body = $khaltiResult['body'] ?? [];
                $message = null;
                if (is_array($body)) {
                    if (isset($body['detail'])) {
                        $message = $body['detail'];
                    } elseif (isset($body['message'])) {
                        $message = $body['message'];
                    } else {
                        foreach ($body as $value) {
                            if (is_string($value)) {
                                $message = $value;
                                break;
                            }
                            if (is_array($value) && isset($value[0]) && is_string($value[0])) {
                                $message = $value[0];
                                break;
                            }
                        }
                    }
                }
                if (!$message) {
                    $errorDetail = $khaltiResult['error'] ?? null;
                    if ($errorDetail) {
                        $message = 'Khalti initiation failed: ' . $errorDetail;
                    } else {
                        $message = 'Khalti initiation failed (HTTP ' . ($khaltiResult['status'] ?? '0') . ')';
                    }
                }

                $pdo->prepare("UPDATE payments SET status = 'failed', provider_payload = :payload WHERE id = :id")
                    ->execute([
                        'payload' => json_encode($khaltiResult['body'] ?? ['error' => $khaltiResult['error']]),
                        'id' => $paymentId
                    ]);
                $paymentResponse['status'] = 'failed';
                $paymentResponse['error'] = [
                    'message' => $message,
                    'details' => $khaltiResult['body'] ?? ['error' => $khaltiResult['error']]
                ];
            }
        } else {
            $paymentResponse['status'] = 'failed';
            $paymentResponse['error'] = ['message' => 'Missing Khalti return_url/website_url or invalid amount'];
        }
    }

    $assignment = null;
    try {
        $assignment = auto_assign_booking($pdo, $bookingId);
    } catch (Throwable $e) {
        $assignment = ['assigned' => false, 'reason' => 'Auto-assign failed'];
    }
    if ($assignment && empty($assignment['assigned'])) {
        $reason = $assignment['reason'] ?? 'Auto-assign failed';
        add_system_alert(
            $pdo,
            'Operations',
            'Auto-assign Failed (pickup)',
            'Booking #' . $bookingId . ': ' . $reason,
            'Assign pickup courier manually.'
        );
    }

    if ($khaltiLockKey !== null) {
        $releaseStmt = $pdo->prepare('SELECT RELEASE_LOCK(:lock_key)');
        $releaseStmt->execute(['lock_key' => $khaltiLockKey]);
    }

    json_response([
        'message' => 'Booking created',
        'booking' => [
            'id' => $bookingId,
            'bookingCode' => $bookingCode,
            'deliveryAccessCode' => $deliveryAccessCode
        ],
        'assignment' => $assignment,
        'payment' => $paymentResponse
    ], 201);
}

if ($path === '/api/auth/signup' && $method === 'POST') {
    $payload = get_json_body();
    $fullName = trim($payload['fullName'] ?? '');
    $email = trim($payload['email'] ?? '');
    $phone = trim($payload['phone'] ?? '');
    $password = $payload['password'] ?? '';

    if ($fullName === '' || $email === '' || $password === '') {
        json_response(['error' => 'Full name, email, and password are required'], 422);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $check->execute(['email' => $email]);
    if ($check->fetch()) {
        json_response(['error' => 'Email already exists'], 409);
    }

    $pdo->beginTransaction();
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $insert = $pdo->prepare(
        'INSERT INTO users (full_name, email, phone, password_hash) VALUES (:full_name, :email, :phone, :password_hash)'
    );
    $insert->execute([
        'full_name' => $fullName,
        'email' => $email,
        'phone' => $phone,
        'password_hash' => $passwordHash
    ]);
    $userId = $pdo->lastInsertId();
    $roleId = ensure_role($pdo, 'customer');
    $link = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)');
    $link->execute(['user_id' => $userId, 'role_id' => $roleId]);
    $pdo->commit();

    json_response([
        'message' => 'Signup successful',
        'token' => generate_token(),
        'user' => [
            'id' => (int)$userId,
            'fullName' => $fullName,
            'email' => $email,
            'phone' => $phone,
            'role' => 'customer'
        ]
    ], 201);
}

if ($path === '/api/auth/login' && $method === 'POST') {
    $payload = get_json_body();
    $email = trim($payload['email'] ?? '');
    $password = $payload['password'] ?? '';

    if ($email === '' || $password === '') {
        json_response(['error' => 'Email and password are required'], 422);
    }

    $stmt = $pdo->prepare(
        'SELECT users.id, users.full_name, users.email, users.phone, users.password_hash, roles.name AS role
         FROM users
         LEFT JOIN user_roles ON user_roles.user_id = users.id
         LEFT JOIN roles ON roles.id = user_roles.role_id
         WHERE users.email = :email
         LIMIT 1'
    );
    $stmt->execute(['email' => $email]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_response(['error' => 'Invalid credentials'], 401);
    }

    json_response([
        'message' => 'Login successful',
        'token' => generate_token(),
        'user' => [
            'id' => (int)$user['id'],
            'fullName' => $user['full_name'],
            'email' => $user['email'],
            'phone' => $user['phone'] ?? '',
            'role' => $user['role'] ?: 'customer'
        ]
    ]);
}

json_response(['error' => 'Not found'], 404);
