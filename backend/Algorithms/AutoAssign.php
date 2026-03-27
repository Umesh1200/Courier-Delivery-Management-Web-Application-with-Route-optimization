<?php

function has_valid_coords($lat, $lng)
{
    return is_numeric($lat) && is_numeric($lng);
}

function calculate_distance_km($lat1, $lng1, $lat2, $lng2)
{
    $earthRadius = 6371; // km
    $lat1 = deg2rad((float)$lat1);
    $lng1 = deg2rad((float)$lng1);
    $lat2 = deg2rad((float)$lat2);
    $lng2 = deg2rad((float)$lng2);

    $dLat = $lat2 - $lat1;
    $dLng = $lng2 - $lng1;
    $a = sin($dLat / 2) ** 2 + cos($lat1) * cos($lat2) * sin($dLng / 2) ** 2;
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

    return $earthRadius * $c;
}

function normalize_geo_token($value)
{
    $token = strtolower(trim((string)$value));
    if ($token === '') {
        return '';
    }
    $token = preg_replace('/\s+/', ' ', $token);
    return $token ?? '';
}

function find_nearest_branch(PDO $pdo, $lat = null, $lng = null, $city = null, $province = null): ?int
{
    $targetCity = normalize_geo_token($city);
    $targetProvince = normalize_geo_token($province);
    $hasTargetCoords = has_valid_coords($lat, $lng);

    $stmt = $pdo->prepare(
        "SELECT id, city, province, lat, lng
         FROM branches
         WHERE status = :status
         ORDER BY id ASC"
    );
    $stmt->execute(['status' => 'active']);
    $branches = $stmt->fetchAll();
    if (!$branches) {
        $fallbackStmt = $pdo->query('SELECT id, city, province, lat, lng FROM branches ORDER BY id ASC');
        $branches = $fallbackStmt->fetchAll();
    }
    if (!$branches) {
        return null;
    }

    $tiers = [[], [], [], []];
    foreach ($branches as $branch) {
        $branchCity = normalize_geo_token($branch['city'] ?? '');
        $branchProvince = normalize_geo_token($branch['province'] ?? '');
        $cityMatch = $targetCity !== '' && $branchCity === $targetCity;
        $provinceMatch = $targetProvince !== '' && $branchProvince === $targetProvince;

        if ($cityMatch && $provinceMatch) {
            $tiers[0][] = $branch;
        } elseif ($cityMatch) {
            $tiers[1][] = $branch;
        } elseif ($provinceMatch) {
            $tiers[2][] = $branch;
        } else {
            $tiers[3][] = $branch;
        }
    }

    $selectBest = function (array $candidates, bool $requireCoords = false) use ($hasTargetCoords, $lat, $lng) {
        $best = null;
        $bestPenalty = null;
        $bestDistance = null;

        foreach ($candidates as $candidate) {
            $candidateId = (int)($candidate['id'] ?? 0);
            if ($candidateId <= 0) {
                continue;
            }
            $candidateHasCoords = has_valid_coords($candidate['lat'] ?? null, $candidate['lng'] ?? null);
            if ($requireCoords && !$candidateHasCoords) {
                continue;
            }
            $coordPenalty = $candidateHasCoords ? 0 : 1;
            $distance = INF;
            if ($hasTargetCoords && $candidateHasCoords) {
                $distance = calculate_distance_km($lat, $lng, $candidate['lat'], $candidate['lng']);
            }

            if ($best === null
                || $coordPenalty < $bestPenalty
                || ($coordPenalty === $bestPenalty && $distance < $bestDistance)
                || ($coordPenalty === $bestPenalty && $distance === $bestDistance && $candidateId < (int)$best['id'])
            ) {
                $best = $candidate;
                $bestPenalty = $coordPenalty;
                $bestDistance = $distance;
            }
        }

        return $best ? (int)$best['id'] : null;
    };

    $fallbackBranchId = null;
    foreach ($tiers as $tier) {
        if (!$tier) {
            continue;
        }
        if ($hasTargetCoords) {
            $withCoords = $selectBest($tier, true);
            if ($withCoords !== null) {
                return $withCoords;
            }
            if ($fallbackBranchId === null) {
                $fallbackBranchId = $selectBest($tier, false);
            }
            continue;
        }

        $selected = $selectBest($tier, false);
        if ($selected !== null) {
            return $selected;
        }
    }

    return $fallbackBranchId;
}

function get_booking_distance_km(array $booking)
{
    if (!has_valid_coords($booking['pickup_lat'] ?? null, $booking['pickup_lng'] ?? null)) {
        return null;
    }
    if (!has_valid_coords($booking['delivery_lat'] ?? null, $booking['delivery_lng'] ?? null)) {
        return null;
    }

    return calculate_distance_km(
        $booking['pickup_lat'],
        $booking['pickup_lng'],
        $booking['delivery_lat'],
        $booking['delivery_lng']
    );
}

function is_linehaul_required(array $booking)
{
    $requiresLinehaul = filter_var($booking['requires_linehaul'] ?? false, FILTER_VALIDATE_BOOLEAN);
    if ($requiresLinehaul) {
        return true;
    }

    $originBranchId = (int)($booking['origin_branch_id'] ?? 0);
    $destinationBranchId = (int)($booking['destination_branch_id'] ?? 0);
    if ($originBranchId > 0 && $destinationBranchId > 0) {
        return $originBranchId !== $destinationBranchId;
    }

    $originCity = strtolower(trim((string)($booking['origin_city'] ?? $booking['pickup_city'] ?? '')));
    $destinationCity = strtolower(trim((string)($booking['destination_city'] ?? $booking['delivery_city'] ?? '')));
    if ($originCity !== '' && $destinationCity !== '' && $originCity !== $destinationCity) {
        return true;
    }
    return false;
}

function normalize_auto_assign_status($status)
{
    $value = strtolower(trim((string)$status));
    if ($value === 'in_branch_origin') {
        return 'received_at_origin_branch';
    }
    if ($value === 'in_branch_destination') {
        return 'received_at_destination_branch';
    }
    if ($value === 'in_transit_to_branch') {
        return 'in_transit_to_origin_branch';
    }
    return $value;
}

function is_linehaul_required_for_booking(PDO $pdo, int $bookingId)
{
    $stmt = $pdo->prepare(
        "SELECT bookings.origin_branch_id, bookings.destination_branch_id, bookings.requires_linehaul,
                pickup.city AS pickup_city, delivery.city AS delivery_city
         FROM bookings
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         WHERE bookings.id = :id"
    );
    $stmt->execute(['id' => $bookingId]);
    $booking = $stmt->fetch();
    if (!$booking) {
        return false;
    }
    return is_linehaul_required($booking);
}

function get_courier_current_load_kg(PDO $pdo, int $courierId)
{
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(
            CASE
                WHEN packages.declared_weight REGEXP '^[0-9]+(\\\\.[0-9]+)?$'
                THEN CAST(packages.declared_weight AS DECIMAL(10,2))
                ELSE NULL
            END
        ), 0) AS total_load
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         WHERE bookings.courier_id = :courier_id
           AND bookings.status NOT IN ('delivered', 'cancelled')"
    );
    $stmt->execute(['courier_id' => $courierId]);
    $row = $stmt->fetch();
    return (float)($row['total_load'] ?? 0);
}

function auto_assign_booking_stage(PDO $pdo, int $bookingId, string $stage)
{
    $bookingStmt = $pdo->prepare(
        "SELECT bookings.id, bookings.status, bookings.courier_id, bookings.service_type, bookings.requires_linehaul,
                bookings.origin_branch_id, bookings.destination_branch_id, bookings.current_branch_id,
                packages.declared_weight,
                pickup.lat AS pickup_lat, pickup.lng AS pickup_lng,
                pickup.city AS pickup_city,
                delivery.lat AS delivery_lat, delivery.lng AS delivery_lng,
                delivery.city AS delivery_city,
                bookings.distance_km,
                origin_branch.lat AS origin_branch_lat, origin_branch.lng AS origin_branch_lng,
                destination_branch.lat AS destination_branch_lat, destination_branch.lng AS destination_branch_lng
         FROM bookings
         JOIN packages ON packages.id = bookings.package_id
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN branches AS origin_branch ON origin_branch.id = bookings.origin_branch_id
         LEFT JOIN branches AS destination_branch ON destination_branch.id = bookings.destination_branch_id
         WHERE bookings.id = :id"
    );
    $bookingStmt->execute(['id' => $bookingId]);
    $booking = $bookingStmt->fetch();
    if (!$booking) {
        return ['assigned' => false, 'reason' => 'Booking not found'];
    }

    $isIntercity = is_linehaul_required($booking);
    $currentStatus = normalize_auto_assign_status($booking['status'] ?? '');

    if ($stage === 'pickup') {
        if ($currentStatus !== 'created') {
            return ['assigned' => false, 'reason' => 'Booking already assigned or not new'];
        }
    } elseif ($stage === 'linehaul') {
        if ($currentStatus !== 'received_at_origin_branch') {
            return ['assigned' => false, 'reason' => 'Booking not ready for linehaul'];
        }
        if (!$isIntercity) {
            return ['assigned' => false, 'reason' => 'Linehaul not required for intra-city booking'];
        }
    } elseif ($stage === 'delivery') {
        $readyStatus = $isIntercity ? 'received_at_destination_branch' : 'received_at_origin_branch';
        if ($currentStatus !== $readyStatus) {
            return ['assigned' => false, 'reason' => 'Booking not ready for delivery'];
        }
    } else {
        return ['assigned' => false, 'reason' => 'Unknown assignment stage'];
    }

    $fromLat = $booking['pickup_lat'];
    $fromLng = $booking['pickup_lng'];
    if ($stage === 'linehaul') {
        $fromLat = $booking['origin_branch_lat'];
        $fromLng = $booking['origin_branch_lng'];
        if (!has_valid_coords($fromLat, $fromLng)) {
            return ['assigned' => false, 'reason' => 'Origin branch coordinates missing'];
        }
    } elseif ($stage === 'delivery') {
        $dispatchBranchLat = $isIntercity ? $booking['destination_branch_lat'] : $booking['origin_branch_lat'];
        $dispatchBranchLng = $isIntercity ? $booking['destination_branch_lng'] : $booking['origin_branch_lng'];
        $fromLat = $dispatchBranchLat;
        $fromLng = $dispatchBranchLng;
        if (!has_valid_coords($fromLat, $fromLng)) {
            return ['assigned' => false, 'reason' => 'Dispatch branch coordinates missing'];
        }
    } elseif (!has_valid_coords($fromLat, $fromLng)) {
        return ['assigned' => false, 'reason' => 'Pickup coordinates missing'];
    }

    $packageWeight = to_decimal_or_null($booking['declared_weight'] ?? null);
    $linehaulRequired = $isIntercity;

    $courierStmt = $pdo->query(
        "SELECT users.id, users.full_name,
                courier_profiles.courier_role,
                courier_profiles.availability,
                branches.lat AS branch_lat, branches.lng AS branch_lng,
                vehicles.capacity_kg,
                (SELECT COUNT(*) FROM bookings
                 WHERE bookings.courier_id = users.id
                   AND bookings.status NOT IN ('delivered', 'cancelled')) AS workload
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'courier'
         LEFT JOIN courier_profiles ON courier_profiles.user_id = users.id
         LEFT JOIN branches ON branches.id = courier_profiles.branch_id
         LEFT JOIN vehicle_assignments
            ON vehicle_assignments.courier_id = users.id AND vehicle_assignments.status = 'active'
         LEFT JOIN vehicles
            ON vehicles.id = vehicle_assignments.vehicle_id AND vehicles.status = 'active'
         WHERE users.status = 'active'
           AND (courier_profiles.availability IS NULL OR courier_profiles.availability = 'online')"
    );
    $couriers = $courierStmt->fetchAll();

    $bestScore = null;
    $bestCourier = null;

    foreach ($couriers as $courier) {
        $role = $courier['courier_role'] ?: 'both';
        if ($stage === 'linehaul' && !$linehaulRequired) {
            continue;
        }
        $eligibleRoles = $stage === 'linehaul'
            ? ['linehaul', 'both', 'express']
            : ($stage === 'delivery' ? ['delivery', 'both', 'express'] : ['pickup', 'both', 'express']);
        if (!in_array($role, $eligibleRoles, true)) {
            continue;
        }

        if (!has_valid_coords($courier['branch_lat'], $courier['branch_lng'])) {
            continue;
        }

        $capacity = $courier['capacity_kg'] !== null ? (float)$courier['capacity_kg'] : null;
        if ($capacity !== null && $capacity > 0 && $packageWeight !== null) {
            $currentLoad = get_courier_current_load_kg($pdo, (int)$courier['id']);
            if ($packageWeight > ($capacity - $currentLoad)) {
                continue;
            }
        }

        $distance = calculate_distance_km(
            $fromLat,
            $fromLng,
            $courier['branch_lat'],
            $courier['branch_lng']
        );
        $score = ($distance * 0.7) + ((int)$courier['workload'] * 1.5);

        if ($booking['service_type'] === 'express' && $role === 'express') {
            $score -= 100;
        } elseif ($booking['service_type'] === 'same-day' && $role === 'express') {
            $score -= 50;
        } elseif ($booking['service_type'] === 'next-day' && $role === 'express') {
            $score -= 20;
        }

        if ($bestScore === null || $score < $bestScore) {
            $bestScore = $score;
            $bestCourier = $courier;
        }
    }

    if (!$bestCourier) {
        return ['assigned' => false, 'reason' => 'No suitable courier found'];
    }

    $pdo->beginTransaction();
    $status = $stage === 'pickup'
        ? 'pickup_assigned'
        : ($stage === 'linehaul' ? 'linehaul_assigned' : 'delivery_assigned');
    $courierColumn = $stage === 'pickup'
        ? 'pickup_courier_id'
        : ($stage === 'linehaul' ? 'linehaul_courier_id' : 'delivery_courier_id');
    $update = $pdo->prepare(
        "UPDATE bookings
         SET courier_id = :courier_id, {$courierColumn} = :courier_id, status = :status
         WHERE id = :id AND status = :current_status"
    );
    $update->execute([
        'courier_id' => (int)$bestCourier['id'],
        'status' => $status,
        'id' => $bookingId,
        'current_status' => $booking['status']
    ]);

    if ($update->rowCount() !== 1) {
        $pdo->rollBack();
        return ['assigned' => false, 'reason' => 'Booking updated elsewhere'];
    }

    $eventInsert = $pdo->prepare(
        'INSERT INTO booking_status_events (booking_id, status, description)
         VALUES (:booking_id, :status, :description)'
    );
    $eventInsert->execute([
        'booking_id' => $bookingId,
        'status' => $status,
        'description' => ucfirst($stage) . ' courier auto-assigned'
    ]);
    if (function_exists('write_order_event')) {
        write_order_event(
            $pdo,
            $bookingId,
            $status,
            'system',
            null,
            [
                'reason' => 'auto_assign',
                'stage' => $stage
            ],
            ucfirst($stage) . ' courier auto-assigned'
        );
    }
    $pdo->commit();

    return [
        'assigned' => true,
        'courierId' => (int)$bestCourier['id'],
        'courierName' => $bestCourier['full_name'],
        'status' => $status
    ];
}

function auto_assign_booking(PDO $pdo, int $bookingId)
{
    return auto_assign_booking_stage($pdo, $bookingId, 'pickup');
}
