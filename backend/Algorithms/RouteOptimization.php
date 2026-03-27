<?php

function fetch_graph(PDO $pdo)
{
    $nodes = [];
    $nodeStmt = $pdo->query('SELECT id, lat, lng FROM graph_nodes');
    foreach ($nodeStmt->fetchAll() as $row) {
        $nodes[(int)$row['id']] = [
            'lat' => (float)$row['lat'],
            'lng' => (float)$row['lng']
        ];
    }

    $adj = [];
    $edgeStmt = $pdo->query(
        'SELECT from_node_id, to_node_id, distance_km, travel_time_min, is_bidirectional
         FROM graph_edges'
    );
    foreach ($edgeStmt->fetchAll() as $edge) {
        $from = (int)$edge['from_node_id'];
        $to = (int)$edge['to_node_id'];
        $adj[$from][] = [
            'to' => $to,
            'distance_km' => (float)$edge['distance_km'],
            'travel_time_min' => (float)$edge['travel_time_min']
        ];
        if ((int)$edge['is_bidirectional'] === 1) {
            $adj[$to][] = [
                'to' => $from,
                'distance_km' => (float)$edge['distance_km'],
                'travel_time_min' => (float)$edge['travel_time_min']
            ];
        }
    }

    return [$nodes, $adj];
}

function route_has_valid_coords($lat, $lng)
{
    if (!is_numeric($lat) || !is_numeric($lng)) {
        return false;
    }
    $latVal = (float)$lat;
    $lngVal = (float)$lng;
    return $latVal >= -90.0 && $latVal <= 90.0 && $lngVal >= -180.0 && $lngVal <= 180.0;
}

function route_first_stop_start(array $bookings, $stopMode)
{
    if (!$bookings) {
        return null;
    }

    $preferredFields = [];
    if ($stopMode === 'delivery') {
        $preferredFields[] = ['delivery_lat', 'delivery_lng'];
        $preferredFields[] = ['pickup_lat', 'pickup_lng'];
    } elseif ($stopMode === 'pickup') {
        $preferredFields[] = ['pickup_lat', 'pickup_lng'];
        $preferredFields[] = ['delivery_lat', 'delivery_lng'];
    } else {
        $preferredFields[] = ['pickup_lat', 'pickup_lng'];
        $preferredFields[] = ['delivery_lat', 'delivery_lng'];
    }

    foreach ($preferredFields as $fieldPair) {
        [$latField, $lngField] = $fieldPair;
        foreach ($bookings as $booking) {
            if (route_has_valid_coords($booking[$latField] ?? null, $booking[$lngField] ?? null)) {
                return ['lat' => (float)$booking[$latField], 'lng' => (float)$booking[$lngField]];
            }
        }
    }

    return null;
}

function filter_bookings_with_valid_coords(array $bookings, $stopMode)
{
    $valid = [];
    $skippedIds = [];
    foreach ($bookings as $booking) {
        $needsPickup = $stopMode === 'pickup' || $stopMode === 'both';
        $needsDelivery = $stopMode === 'delivery' || $stopMode === 'both';
        $pickupOk = route_has_valid_coords($booking['pickup_lat'] ?? null, $booking['pickup_lng'] ?? null);
        $deliveryOk = route_has_valid_coords($booking['delivery_lat'] ?? null, $booking['delivery_lng'] ?? null);
        if ((!$needsPickup || $pickupOk) && (!$needsDelivery || $deliveryOk)) {
            $valid[] = $booking;
        } else {
            $skippedIds[] = (int)($booking['id'] ?? 0);
        }
    }
    return [$valid, $skippedIds];
}

function nearest_node_id(array $nodes, $lat, $lng)
{
    if (!is_numeric($lat) || !is_numeric($lng) || !$nodes) {
        return null;
    }

    $bestId = null;
    $bestDistance = null;
    foreach ($nodes as $id => $node) {
        $dist = calculate_distance_km($lat, $lng, $node['lat'], $node['lng']);
        if ($bestDistance === null || $dist < $bestDistance) {
            $bestDistance = $dist;
            $bestId = $id;
        }
    }
    return $bestId;
}

function dijkstra_shortest(array $adj, $start, $target, $weightKey)
{
    if (!isset($adj[$start])) {
        return null;
    }

    $dist = [$start => 0.0];
    $visited = [];
    $queue = new SplPriorityQueue();
    $queue->setExtractFlags(SplPriorityQueue::EXTR_BOTH);
    $queue->insert($start, 0.0);

    while (!$queue->isEmpty()) {
        $current = $queue->extract();
        $node = $current['data'];
        if (isset($visited[$node])) {
            continue;
        }
        $visited[$node] = true;
        if ($node === $target) {
            return $dist[$node];
        }
        foreach ($adj[$node] ?? [] as $edge) {
            $next = $edge['to'];
            $weight = (float)$edge[$weightKey];
            $alt = $dist[$node] + $weight;
            if (!isset($dist[$next]) || $alt < $dist[$next]) {
                $dist[$next] = $alt;
                $queue->insert($next, -$alt);
            }
        }
    }

    return null;
}

function graph_distance_time(array $nodes, array $adj, $fromLat, $fromLng, $toLat, $toLng, array &$cache)
{
    if (!route_has_valid_coords($fromLat, $fromLng) || !route_has_valid_coords($toLat, $toLng)) {
        return [null, null];
    }

    $fallbackDist = calculate_distance_km($fromLat, $fromLng, $toLat, $toLng);
    if (!$nodes || $fallbackDist === null) {
        return [$fallbackDist, $fallbackDist !== null ? ($fallbackDist / 30.0) * 60.0 : null];
    }

    $fromNode = nearest_node_id($nodes, $fromLat, $fromLng);
    $toNode = nearest_node_id($nodes, $toLat, $toLng);
    if ($fromNode === null || $toNode === null) {
        return [$fallbackDist, $fallbackDist !== null ? ($fallbackDist / 30.0) * 60.0 : null];
    }

    $cacheKey = $fromNode . ':' . $toNode;
    if (!isset($cache[$cacheKey])) {
        $dist = dijkstra_shortest($adj, $fromNode, $toNode, 'distance_km');
        $time = dijkstra_shortest($adj, $fromNode, $toNode, 'travel_time_min');
        if ($dist === null || $time === null) {
            $cache[$cacheKey] = [$fallbackDist, $fallbackDist !== null ? ($fallbackDist / 30.0) * 60.0 : null];
        } else {
            $cache[$cacheKey] = [$dist, $time];
        }
    }

    return $cache[$cacheKey];
}

function derive_deadline(array $booking)
{
    if (!empty($booking['delivery_deadline'])) {
        return new DateTime($booking['delivery_deadline']);
    }

    $createdAt = !empty($booking['created_at']) ? new DateTime($booking['created_at']) : new DateTime();
    $serviceType = $booking['service_type'] ?? 'standard';
    if ($serviceType === 'scheduled' && !empty($booking['scheduled_date']) && !empty($booking['scheduled_time'])) {
        return new DateTime($booking['scheduled_date'] . ' ' . $booking['scheduled_time']);
    }
    if ($serviceType === 'same-day') {
        return (clone $createdAt)->modify('+8 hours');
    }
    if ($serviceType === 'next-day') {
        return (clone $createdAt)->modify('+1 day');
    }
    if ($serviceType === 'express') {
        return (clone $createdAt)->modify('+4 hours');
    }

    return (clone $createdAt)->modify('+2 days');
}

function booking_priority(array $booking)
{
    $priority = $booking['priority'] ?? null;
    if ($priority === 'express') {
        return 'express';
    }
    return (($booking['service_type'] ?? '') === 'express') ? 'express' : 'normal';
}

function candidate_order_sequential(array $bookings)
{
    usort($bookings, function ($a, $b) {
        return strcmp($a['created_at'] ?? '', $b['created_at'] ?? '');
    });
    return array_column($bookings, 'id');
}

function candidate_order_time_priority(array $bookings)
{
    usort($bookings, function ($a, $b) {
        $da = derive_deadline($a);
        $db = derive_deadline($b);
        if ($da == $db) {
            $pa = booking_priority($a) === 'express' ? 0 : 1;
            $pb = booking_priority($b) === 'express' ? 0 : 1;
            if ($pa === $pb) {
                return strcmp($a['created_at'] ?? '', $b['created_at'] ?? '');
            }
            return $pa < $pb ? -1 : 1;
        }
        return $da < $db ? -1 : 1;
    });
    return array_column($bookings, 'id');
}

function booking_sequence_cost(array $order, array $bookingMap, array $start, array $nodes, array $adj, array &$cache, $stopMode = 'both')
{
    $currentLat = $start['lat'];
    $currentLng = $start['lng'];
    $totalDist = 0.0;
    $totalTime = 0.0;
    $stopSequence = [];
    $latenessTotal = 0.0;
    $now = new DateTime();

    foreach ($order as $bookingId) {
        if (!isset($bookingMap[$bookingId])) {
            continue;
        }
        $booking = $bookingMap[$bookingId];
        if ($stopMode === 'pickup') {
            [$toPickupDist, $toPickupTime] = graph_distance_time(
                $nodes,
                $adj,
                $currentLat,
                $currentLng,
                $booking['pickup_lat'],
                $booking['pickup_lng'],
                $cache
            );
            $toPickupDist = $toPickupDist ?? 0.0;
            $toPickupTime = $toPickupTime ?? 0.0;
            $totalDist += $toPickupDist;
            $totalTime += $toPickupTime;
            $stopSequence[] = [
                'booking_id' => $bookingId,
                'stop_kind' => 'pickup',
                'address_id' => (int)$booking['pickup_address_id'],
                'lat' => $booking['pickup_lat'],
                'lng' => $booking['pickup_lng'],
                'eta_minutes' => (int)round($totalTime)
            ];
            $currentLat = $booking['pickup_lat'];
            $currentLng = $booking['pickup_lng'];
        } elseif ($stopMode === 'delivery') {
            [$toDeliveryDist, $toDeliveryTime] = graph_distance_time(
                $nodes,
                $adj,
                $currentLat,
                $currentLng,
                $booking['delivery_lat'],
                $booking['delivery_lng'],
                $cache
            );
            $toDeliveryDist = $toDeliveryDist ?? 0.0;
            $toDeliveryTime = $toDeliveryTime ?? 0.0;
            $totalDist += $toDeliveryDist;
            $totalTime += $toDeliveryTime;
            $stopSequence[] = [
                'booking_id' => $bookingId,
                'stop_kind' => 'delivery',
                'address_id' => (int)$booking['delivery_address_id'],
                'lat' => $booking['delivery_lat'],
                'lng' => $booking['delivery_lng'],
                'eta_minutes' => (int)round($totalTime)
            ];
            $currentLat = $booking['delivery_lat'];
            $currentLng = $booking['delivery_lng'];
        } else {
            [$toPickupDist, $toPickupTime] = graph_distance_time(
                $nodes,
                $adj,
                $currentLat,
                $currentLng,
                $booking['pickup_lat'],
                $booking['pickup_lng'],
                $cache
            );
            [$pickupToDeliveryDist, $pickupToDeliveryTime] = graph_distance_time(
                $nodes,
                $adj,
                $booking['pickup_lat'],
                $booking['pickup_lng'],
                $booking['delivery_lat'],
                $booking['delivery_lng'],
                $cache
            );

            $toPickupDist = $toPickupDist ?? 0.0;
            $toPickupTime = $toPickupTime ?? 0.0;
            $pickupToDeliveryDist = $pickupToDeliveryDist ?? 0.0;
            $pickupToDeliveryTime = $pickupToDeliveryTime ?? 0.0;

            $totalDist += $toPickupDist + $pickupToDeliveryDist;
            $totalTime += $toPickupTime + $pickupToDeliveryTime;

            $stopSequence[] = [
                'booking_id' => $bookingId,
                'stop_kind' => 'pickup',
                'address_id' => (int)$booking['pickup_address_id'],
                'lat' => $booking['pickup_lat'],
                'lng' => $booking['pickup_lng'],
                'eta_minutes' => (int)round($totalTime - $pickupToDeliveryTime)
            ];
            $stopSequence[] = [
                'booking_id' => $bookingId,
                'stop_kind' => 'delivery',
                'address_id' => (int)$booking['delivery_address_id'],
                'lat' => $booking['delivery_lat'],
                'lng' => $booking['delivery_lng'],
                'eta_minutes' => (int)round($totalTime)
            ];

            $currentLat = $booking['delivery_lat'];
            $currentLng = $booking['delivery_lng'];
        }

        $deadline = derive_deadline($booking);
        $arrival = (clone $now)->modify('+' . (int)round($totalTime) . ' minutes');
        if ($arrival > $deadline) {
            $latenessTotal += ($arrival->getTimestamp() - $deadline->getTimestamp()) / 60.0;
        }
    }

    return [
        'distance_km' => $totalDist,
        'time_min' => $totalTime,
        'stop_sequence' => $stopSequence,
        'lateness_min' => $latenessTotal
    ];
}

function optimize_booking_order(array $bookings, array $start, array $nodes, array $adj, array &$cache, $stopMode = 'both')
{
    $remaining = $bookings;
    $order = [];
    $current = $start;

    while ($remaining) {
        $bestId = null;
        $bestCost = null;
        foreach ($remaining as $booking) {
            if ($stopMode === 'pickup') {
                [$toPickupDist, $toPickupTime] = graph_distance_time(
                    $nodes,
                    $adj,
                    $current['lat'],
                    $current['lng'],
                    $booking['pickup_lat'],
                    $booking['pickup_lng'],
                    $cache
                );
                $cost = ($toPickupDist ?? 0.0);
            } elseif ($stopMode === 'delivery') {
                [$toDeliveryDist, $toDeliveryTime] = graph_distance_time(
                    $nodes,
                    $adj,
                    $current['lat'],
                    $current['lng'],
                    $booking['delivery_lat'],
                    $booking['delivery_lng'],
                    $cache
                );
                $cost = ($toDeliveryDist ?? 0.0);
            } else {
                [$toPickupDist, $toPickupTime] = graph_distance_time(
                    $nodes,
                    $adj,
                    $current['lat'],
                    $current['lng'],
                    $booking['pickup_lat'],
                    $booking['pickup_lng'],
                    $cache
                );
                [$pickupToDeliveryDist, $pickupToDeliveryTime] = graph_distance_time(
                    $nodes,
                    $adj,
                    $booking['pickup_lat'],
                    $booking['pickup_lng'],
                    $booking['delivery_lat'],
                    $booking['delivery_lng'],
                    $cache
                );
                $cost = ($toPickupDist ?? 0.0) + ($pickupToDeliveryDist ?? 0.0);
            }
            if ($bestCost === null || $cost < $bestCost) {
                $bestCost = $cost;
                $bestId = $booking['id'];
            }
        }
        if ($bestId === null) {
            break;
        }
        $order[] = $bestId;
        $selected = null;
        foreach ($remaining as $idx => $booking) {
            if ((int)$booking['id'] === (int)$bestId) {
                $selected = $booking;
                unset($remaining[$idx]);
                break;
            }
        }
        if ($selected) {
            if ($stopMode === 'pickup') {
                $current = ['lat' => $selected['pickup_lat'], 'lng' => $selected['pickup_lng']];
            } else {
                $current = ['lat' => $selected['delivery_lat'], 'lng' => $selected['delivery_lng']];
            }
        }
    }

    return array_values($order);
}

function two_opt_improve(array $order, array $bookingMap, array $start, array $nodes, array $adj, array &$cache, $stopMode = 'both', $maxPasses = 2)
{
    $bestOrder = $order;
    $bestMetrics = booking_sequence_cost($bestOrder, $bookingMap, $start, $nodes, $adj, $cache, $stopMode);
    $bestDistance = $bestMetrics['distance_km'];
    $n = count($bestOrder);

    for ($pass = 0; $pass < $maxPasses; $pass++) {
        $improved = false;
        for ($i = 0; $i < $n - 1; $i++) {
            for ($k = $i + 1; $k < $n; $k++) {
                $newOrder = $bestOrder;
                $segment = array_slice($newOrder, $i, $k - $i + 1);
                $segment = array_reverse($segment);
                array_splice($newOrder, $i, $k - $i + 1, $segment);
                $metrics = booking_sequence_cost($newOrder, $bookingMap, $start, $nodes, $adj, $cache, $stopMode);
                if ($metrics['distance_km'] < $bestDistance) {
                    $bestDistance = $metrics['distance_km'];
                    $bestOrder = $newOrder;
                    $improved = true;
                }
            }
        }
        if (!$improved) {
            break;
        }
    }

    return $bestOrder;
}

function score_candidates(array $candidates)
{
    $maxDist = 0.0;
    $maxTime = 0.0;
    $maxLate = 0.0;
    foreach ($candidates as $candidate) {
        $maxDist = max($maxDist, $candidate['distance_km']);
        $maxTime = max($maxTime, $candidate['time_min']);
        $maxLate = max($maxLate, $candidate['lateness_min']);
    }
    $maxDist = $maxDist > 0 ? $maxDist : 1;
    $maxTime = $maxTime > 0 ? $maxTime : 1;
    $maxLate = $maxLate > 0 ? $maxLate : 1;

    foreach ($candidates as &$candidate) {
        $distanceScore = 1 - ($candidate['distance_km'] / $maxDist);
        $timeScore = 1 - ($candidate['time_min'] / $maxTime);
        $deadlineScore = 1 - ($candidate['lateness_min'] / $maxLate);
        $priorityScore = $candidate['priority_score'];

        $candidate['score'] = round(
            ($distanceScore * 0.35) + ($timeScore * 0.25) + ($deadlineScore * 0.30) + ($priorityScore * 0.10),
            4
        );
    }
    unset($candidate);

    return $candidates;
}

function build_route_candidates(PDO $pdo, array $bookings, array $start, array $lockedStops = [], $stopMode = 'both')
{
    [$nodes, $adj] = fetch_graph($pdo);
    $cache = [];
    $bookingMap = [];
    foreach ($bookings as $booking) {
        $bookingMap[$booking['id']] = $booking;
    }

    $sequentialOrder = candidate_order_sequential($bookings);
    $timeOrder = candidate_order_time_priority($bookings);
    $optimizedOrder = optimize_booking_order($bookings, $start, $nodes, $adj, $cache, $stopMode);
    if (count($optimizedOrder) > 2) {
        $optimizedOrder = two_opt_improve($optimizedOrder, $bookingMap, $start, $nodes, $adj, $cache, $stopMode);
    }

    $candidates = [];
    foreach ([
        'sequential' => $sequentialOrder,
        'time_priority' => $timeOrder,
        'optimized' => $optimizedOrder
    ] as $type => $order) {
        $metrics = booking_sequence_cost($order, $bookingMap, $start, $nodes, $adj, $cache, $stopMode);
        $priorityScore = 0.5;
        $expressPositions = [];
        foreach ($order as $index => $bookingId) {
            if (isset($bookingMap[$bookingId]) && booking_priority($bookingMap[$bookingId]) === 'express') {
                $expressPositions[] = $index + 1;
            }
        }
        if ($expressPositions) {
            $avgPos = array_sum($expressPositions) / count($expressPositions);
            $priorityScore = 1 - ($avgPos / max(count($order), 1));
        }

        $candidates[] = [
            'candidate_type' => $type,
            'order' => $order,
            'distance_km' => $metrics['distance_km'],
            'time_min' => $metrics['time_min'],
            'lateness_min' => $metrics['lateness_min'],
            'stop_sequence' => $metrics['stop_sequence'],
            'priority_score' => $priorityScore
        ];
    }

    $candidateRank = [
        'optimized' => 0,
        'time_priority' => 1,
        'sequential' => 2
    ];
    $uniqueCandidates = [];
    $signatureToIndex = [];
    foreach ($candidates as $candidate) {
        $signatureParts = [];
        foreach ($candidate['stop_sequence'] ?? [] as $stop) {
            $signatureParts[] = (int)($stop['booking_id'] ?? 0)
                . ':' . (string)($stop['stop_kind'] ?? '')
                . ':' . (int)($stop['address_id'] ?? 0);
        }
        if ($signatureParts) {
            $signature = implode('|', $signatureParts);
        } else {
            $signature = implode(',', array_map('intval', $candidate['order'] ?? []));
        }
        if (!array_key_exists($signature, $signatureToIndex)) {
            $signatureToIndex[$signature] = count($uniqueCandidates);
            $uniqueCandidates[] = $candidate;
            continue;
        }
        $existingIdx = $signatureToIndex[$signature];
        $existing = $uniqueCandidates[$existingIdx];
        $existingRank = $candidateRank[$existing['candidate_type']] ?? 99;
        $currentRank = $candidateRank[$candidate['candidate_type']] ?? 99;
        if ($currentRank < $existingRank) {
            $uniqueCandidates[$existingIdx] = $candidate;
        }
    }
    $candidates = array_values($uniqueCandidates);

    $candidates = score_candidates($candidates);
    if ($lockedStops) {
        foreach ($candidates as &$candidate) {
            $candidate['locked_stops'] = $lockedStops;
        }
        unset($candidate);
    }

    return $candidates;
}

function fetch_route_bookings(PDO $pdo, array $bookingIds = [])
{
    $params = [];
    $condition = "bookings.status IN ('pickup_assigned','linehaul_load_confirmed','linehaul_in_transit','delivery_load_confirmed','out_for_delivery','delivery_attempt_failed')";
    if ($bookingIds) {
        $placeholders = implode(',', array_fill(0, count($bookingIds), '?'));
        $condition = 'bookings.id IN (' . $placeholders . ')';
        $params = $bookingIds;
    }

    $stmt = $pdo->prepare(
        "SELECT bookings.id,
                bookings.status,
                bookings.service_type,
                bookings.priority,
                bookings.delivery_deadline,
                bookings.created_at,
                bookings.scheduled_date,
                bookings.scheduled_time,
                bookings.is_intercity,
                bookings.requires_linehaul,
                bookings.pickup_address_id,
                bookings.delivery_address_id,
                bookings.origin_branch_id,
                bookings.destination_branch_id,
                bookings.current_branch_id,
                pickup.lat AS pickup_lat,
                pickup.lng AS pickup_lng,
                delivery.lat AS delivery_lat,
                delivery.lng AS delivery_lng,
                delivery.city AS delivery_city,
                delivery.province AS delivery_province,
                origin_branch.lat AS origin_branch_lat,
                origin_branch.lng AS origin_branch_lng,
                destination_branch.lat AS destination_branch_lat,
                destination_branch.lng AS destination_branch_lng
         FROM bookings
         JOIN addresses AS pickup ON pickup.id = bookings.pickup_address_id
         JOIN addresses AS delivery ON delivery.id = bookings.delivery_address_id
         LEFT JOIN branches AS origin_branch ON origin_branch.id = bookings.origin_branch_id
         LEFT JOIN branches AS destination_branch ON destination_branch.id = bookings.destination_branch_id
         WHERE {$condition}"
    );
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function route_fetch_branch_coords(PDO $pdo, int $branchId): ?array
{
    static $cache = [];
    if ($branchId <= 0) {
        return null;
    }
    if (array_key_exists($branchId, $cache)) {
        return $cache[$branchId];
    }

    $stmt = $pdo->prepare('SELECT id, lat, lng FROM branches WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $branchId]);
    $row = $stmt->fetch();
    if (!$row || !route_has_valid_coords($row['lat'] ?? null, $row['lng'] ?? null)) {
        $cache[$branchId] = null;
        return null;
    }

    $cache[$branchId] = [
        'id' => (int)$row['id'],
        'lat' => (float)$row['lat'],
        'lng' => (float)$row['lng']
    ];
    return $cache[$branchId];
}

function route_hydrate_linehaul_destination_targets(PDO $pdo, array $bookings)
{
    if (!function_exists('find_nearest_branch')) {
        return $bookings;
    }

    $updates = [];
    foreach ($bookings as $index => $booking) {
        $status = strtolower(trim((string)($booking['status'] ?? '')));
        if (!in_array($status, ['linehaul_load_confirmed', 'linehaul_in_transit'], true)) {
            continue;
        }

        $destinationBranchId = (int)($booking['destination_branch_id'] ?? 0);
        $resolvedBranchId = find_nearest_branch(
            $pdo,
            $booking['delivery_lat'] ?? null,
            $booking['delivery_lng'] ?? null,
            $booking['delivery_city'] ?? null,
            $booking['delivery_province'] ?? null
        );
        $targetBranchId = $resolvedBranchId !== null ? (int)$resolvedBranchId : ($destinationBranchId > 0 ? $destinationBranchId : 0);
        if ($targetBranchId <= 0) {
            continue;
        }

        $branchCoords = route_fetch_branch_coords($pdo, $targetBranchId);
        if (!$branchCoords) {
            continue;
        }

        $bookings[$index]['destination_branch_id'] = $branchCoords['id'];
        $bookings[$index]['destination_branch_lat'] = $branchCoords['lat'];
        $bookings[$index]['destination_branch_lng'] = $branchCoords['lng'];

        if ($destinationBranchId !== $branchCoords['id']) {
            $bookingId = (int)($booking['id'] ?? 0);
            if ($bookingId > 0) {
                $updates[$bookingId] = $branchCoords['id'];
            }
        }
    }

    if ($updates) {
        $updateStmt = $pdo->prepare('UPDATE bookings SET destination_branch_id = :destination_branch_id WHERE id = :id');
        foreach ($updates as $bookingId => $branchId) {
            $updateStmt->execute([
                'destination_branch_id' => $branchId,
                'id' => $bookingId
            ]);
        }
    }

    return $bookings;
}

function route_apply_stage_target(array $booking)
{
    $status = strtolower(trim((string)($booking['status'] ?? '')));
    if (in_array($status, ['linehaul_load_confirmed', 'linehaul_in_transit'], true)) {
        if (route_has_valid_coords($booking['destination_branch_lat'] ?? null, $booking['destination_branch_lng'] ?? null)) {
            $targetLat = (float)$booking['destination_branch_lat'];
            $targetLng = (float)$booking['destination_branch_lng'];
            if (route_has_valid_coords($booking['delivery_lat'] ?? null, $booking['delivery_lng'] ?? null) && function_exists('calculate_distance_km')) {
                $branchDistanceToDelivery = calculate_distance_km(
                    $booking['delivery_lat'],
                    $booking['delivery_lng'],
                    $targetLat,
                    $targetLng
                );
                // Guard against stale branch master coordinates by anchoring to delivery locality.
                if (is_numeric($branchDistanceToDelivery) && (float)$branchDistanceToDelivery > 80) {
                    $targetLat = (float)$booking['delivery_lat'];
                    $targetLng = (float)$booking['delivery_lng'];
                }
            }
            $booking['delivery_lat'] = $targetLat;
            $booking['delivery_lng'] = $targetLng;
            if (!empty($booking['destination_branch_id'])) {
                $booking['delivery_address_id'] = (int)$booking['destination_branch_id'];
            }
        } else {
            // Route linehaul to destination branch only; missing coords should block optimization.
            $booking['delivery_lat'] = null;
            $booking['delivery_lng'] = null;
        }
    } elseif ($status === 'delivery_attempt_failed') {
        $isIntercity = false;
        $rawIsIntercity = strtolower(trim((string)($booking['is_intercity'] ?? '')));
        if (in_array($rawIsIntercity, ['1', 'true', 'yes'], true)) {
            $isIntercity = true;
        }
        $rawRequiresLinehaul = strtolower(trim((string)($booking['requires_linehaul'] ?? '')));
        if (in_array($rawRequiresLinehaul, ['1', 'true', 'yes'], true)) {
            $isIntercity = true;
        }

        $targetLat = null;
        $targetLng = null;
        $targetBranchId = 0;

        if ($isIntercity) {
            if (route_has_valid_coords($booking['destination_branch_lat'] ?? null, $booking['destination_branch_lng'] ?? null)) {
                $targetLat = (float)$booking['destination_branch_lat'];
                $targetLng = (float)$booking['destination_branch_lng'];
                $targetBranchId = (int)($booking['destination_branch_id'] ?? 0);
            } elseif (route_has_valid_coords($booking['origin_branch_lat'] ?? null, $booking['origin_branch_lng'] ?? null)) {
                $targetLat = (float)$booking['origin_branch_lat'];
                $targetLng = (float)$booking['origin_branch_lng'];
                $targetBranchId = (int)($booking['origin_branch_id'] ?? 0);
            }
        } else {
            if (route_has_valid_coords($booking['origin_branch_lat'] ?? null, $booking['origin_branch_lng'] ?? null)) {
                $targetLat = (float)$booking['origin_branch_lat'];
                $targetLng = (float)$booking['origin_branch_lng'];
                $targetBranchId = (int)($booking['origin_branch_id'] ?? 0);
            } elseif (route_has_valid_coords($booking['destination_branch_lat'] ?? null, $booking['destination_branch_lng'] ?? null)) {
                $targetLat = (float)$booking['destination_branch_lat'];
                $targetLng = (float)$booking['destination_branch_lng'];
                $targetBranchId = (int)($booking['destination_branch_id'] ?? 0);
            }
        }

        if ($targetLat !== null && $targetLng !== null) {
            $booking['delivery_lat'] = $targetLat;
            $booking['delivery_lng'] = $targetLng;
            if ($targetBranchId > 0) {
                $booking['delivery_address_id'] = $targetBranchId;
            }
        } else {
            $booking['delivery_lat'] = null;
            $booking['delivery_lng'] = null;
        }
    }
    return $booking;
}

function courier_location_details(PDO $pdo, $courierId)
{
    $locStmt = $pdo->prepare(
        'SELECT courier_live_location.latitude, courier_live_location.longitude,
                courier_live_location.updated_at AS live_updated_at,
                courier_profiles.branch_id,
                branches.name AS branch_name,
                branches.address_line AS branch_address,
                branches.city AS branch_city,
                branches.province AS branch_province,
                branches.lat AS branch_lat, branches.lng AS branch_lng
         FROM courier_profiles
         LEFT JOIN courier_live_location ON courier_live_location.courier_id = courier_profiles.user_id
         LEFT JOIN branches ON branches.id = courier_profiles.branch_id
         WHERE courier_profiles.user_id = :id'
    );
    $locStmt->execute(['id' => $courierId]);
    $row = $locStmt->fetch();
    $courierLoc = null;
    $branchLoc = null;
    $liveUpdatedAt = null;
    if ($row) {
        if ($row['latitude'] !== null && $row['longitude'] !== null) {
            $courierLoc = ['lat' => (float)$row['latitude'], 'lng' => (float)$row['longitude']];
            $liveUpdatedAt = $row['live_updated_at'] ?: null;
        }
        if ($row['branch_lat'] !== null && $row['branch_lng'] !== null) {
            $branchLoc = [
                'lat' => (float)$row['branch_lat'],
                'lng' => (float)$row['branch_lng'],
                'label' => $row['branch_name'] ?: 'Branch',
                'city' => $row['branch_city'] ?: '',
                'address' => $row['branch_address'] ?: '',
                'province' => $row['branch_province'] ?: '',
                'branchId' => $row['branch_id'] ? (int)$row['branch_id'] : null
            ];
        }
    }

    $useCourierLoc = $courierLoc !== null;
    if ($courierLoc && $branchLoc && function_exists('calculate_distance_km')) {
        $distanceToBranchKm = calculate_distance_km(
            $courierLoc['lat'],
            $courierLoc['lng'],
            $branchLoc['lat'],
            $branchLoc['lng']
        );
        $updatedAtTs = $liveUpdatedAt ? strtotime((string)$liveUpdatedAt) : false;
        $isLiveStale = !$updatedAtTs || ($updatedAtTs < (time() - (4 * 3600)));
        // Prevent stale out-of-region location from overriding the assigned branch start.
        if (is_numeric($distanceToBranchKm) && (float)$distanceToBranchKm > 80.0 && $isLiveStale) {
            $useCourierLoc = false;
        }
    }

    if ($courierLoc && $useCourierLoc) {
        return ['start' => $courierLoc, 'courier' => $courierLoc, 'branch' => $branchLoc];
    }
    if ($branchLoc) {
        return ['start' => $branchLoc, 'courier' => null, 'branch' => $branchLoc];
    }
    return ['start' => null, 'courier' => null, 'branch' => null];
}

function courier_vehicle_details(PDO $pdo, $courierId)
{
    $stmt = $pdo->prepare(
        'SELECT vehicles.code, vehicles.type, vehicles.plate_number, vehicles.capacity_kg, vehicles.status
         FROM vehicle_assignments
         JOIN vehicles ON vehicles.id = vehicle_assignments.vehicle_id
         WHERE vehicle_assignments.courier_id = :id
           AND vehicle_assignments.status = :status
         ORDER BY vehicle_assignments.assigned_at DESC
         LIMIT 1'
    );
    $stmt->execute(['id' => $courierId, 'status' => 'active']);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'code' => $row['code'] ?: null,
        'type' => $row['type'] ?: null,
        'plate' => $row['plate_number'] ?: null,
        'capacityKg' => $row['capacity_kg'] !== null ? (float)$row['capacity_kg'] : null,
        'status' => $row['status'] ?: null
    ];
}

function filter_bookings_for_courier(array $bookings, $courierRole)
{
    $filtered = [];
    foreach ($bookings as $booking) {
        $status = strtolower(trim((string)($booking['status'] ?? '')));
        if ($status === 'pickup_assigned') {
            $stage = 'pickup';
        } elseif (in_array($status, ['linehaul_load_confirmed', 'linehaul_in_transit'], true)) {
            $stage = 'linehaul';
        } elseif (in_array($status, ['delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'], true)) {
            $stage = 'delivery';
        } else {
            $currentBranch = $booking['current_branch_id'] ?? null;
            $destinationBranch = $booking['destination_branch_id'] ?? null;
            $stage = ($currentBranch !== null && $destinationBranch !== null && (int)$currentBranch !== (int)$destinationBranch)
                ? 'linehaul'
                : 'delivery';
        }
        $eligible = $stage === 'pickup'
            ? ['pickup', 'both', 'express']
            : ($stage === 'linehaul'
                ? ['linehaul', 'both', 'express']
                : ['delivery', 'both', 'express']);
        if (in_array($courierRole, $eligible, true)) {
            $filtered[] = $booking;
        }
    }
    return $filtered;
}

function route_stop_mode_for_role($courierRole, array $bookings = [])
{
    if ($courierRole === 'pickup') {
        return 'pickup';
    }
    if ($courierRole === 'delivery' || $courierRole === 'linehaul') {
        return 'delivery';
    }
    if ($courierRole === 'both' || $courierRole === 'express') {
        $hasPickup = false;
        $hasDelivery = false;
        foreach ($bookings as $booking) {
            $status = strtolower(trim((string)($booking['status'] ?? '')));
            if ($status === 'pickup_assigned') {
                $hasPickup = true;
            } elseif (in_array($status, ['linehaul_load_confirmed', 'linehaul_in_transit', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'], true)) {
                $hasDelivery = true;
            }
            if ($hasPickup && $hasDelivery) {
                break;
            }
        }
        if ($hasPickup && !$hasDelivery) {
            return 'pickup';
        }
        if ($hasDelivery && !$hasPickup) {
            return 'delivery';
        }
    }
    return 'both';
}

function recommend_routes(PDO $pdo, $courierId, array $bookingIds = [], array $startOverride = null, array $lockedStops = [])
{
    $roleStmt = $pdo->prepare('SELECT courier_role FROM courier_profiles WHERE user_id = :id');
    $roleStmt->execute(['id' => $courierId]);
    $roleRow = $roleStmt->fetch();
    $courierRole = $roleRow ? ($roleRow['courier_role'] ?: 'both') : 'both';

    $bookingsAll = fetch_route_bookings($pdo, $bookingIds);
    $bookingsByRole = filter_bookings_for_courier($bookingsAll, $courierRole);
    $bookingsByRole = route_hydrate_linehaul_destination_targets($pdo, $bookingsByRole);
    $bookingsByRole = array_map('route_apply_stage_target', $bookingsByRole);
    $stopMode = route_stop_mode_for_role($courierRole, $bookingsByRole);
    [$bookings, $skippedBookingIds] = filter_bookings_with_valid_coords($bookingsByRole, $stopMode);
    $locations = courier_location_details($pdo, $courierId);
    $vehicle = courier_vehicle_details($pdo, $courierId);
    $start = $startOverride ?: $locations['start'];
    if (!route_has_valid_coords($start['lat'] ?? null, $start['lng'] ?? null)) {
        $start = route_first_stop_start($bookings, $stopMode);
    }
    $startIsValid = route_has_valid_coords($start['lat'] ?? null, $start['lng'] ?? null);

    $reasonParts = [];
    if ($skippedBookingIds) {
        $reasonParts[] = 'Skipped ' . count($skippedBookingIds) . ' booking(s) with missing or invalid coordinates.';
    }

    if (!$bookings) {
        $reason = null;
        if (!$bookingsAll) {
            $reason = 'No eligible bookings available for optimization.';
        } elseif (!$bookingsByRole) {
            $reason = 'No bookings match the courier role for current stage.';
        } else {
            $reason = 'No bookings with valid coordinates match the courier role.';
        }
        if (!$locations['courier'] && !$locations['branch']) {
            $reason = $reason ? ($reason . ' Courier location/branch not set.') : 'Courier location/branch not set.';
        }
        if ($reasonParts) {
            $reason = trim(($reason ? ($reason . ' ') : '') . implode(' ', $reasonParts));
        }
        $safeStart = $startIsValid ? $start : null;
        return [
            'candidates' => [],
            'start' => $safeStart,
            'courierLocation' => $locations['courier'],
            'branchLocation' => $locations['branch'],
            'vehicle' => $vehicle,
            'reason' => $reason
        ];
    }

    if (!$startIsValid) {
        $reason = 'Cannot optimize route because start location is unavailable.';
        if ($reasonParts) {
            $reason = trim($reason . ' ' . implode(' ', $reasonParts));
        }
        return [
            'candidates' => [],
            'start' => null,
            'courierLocation' => $locations['courier'],
            'branchLocation' => $locations['branch'],
            'vehicle' => $vehicle,
            'reason' => $reason
        ];
    }

    return [
        'candidates' => build_route_candidates($pdo, $bookings, $start, $lockedStops, $stopMode),
        'start' => $start,
        'courierLocation' => $locations['courier'],
        'branchLocation' => $locations['branch'],
        'vehicle' => $vehicle,
        'reason' => $reasonParts ? implode(' ', $reasonParts) : null
    ];
}

function create_route_plan(PDO $pdo, $courierId)
{
    $stmt = $pdo->prepare('INSERT INTO route_plans (courier_id, status) VALUES (:courier_id, :status)');
    $stmt->execute(['courier_id' => $courierId, 'status' => 'draft']);
    return (int)$pdo->lastInsertId();
}

function save_route_candidates(PDO $pdo, $routePlanId, array $candidates)
{
    $insert = $pdo->prepare(
        'INSERT INTO route_candidates (route_plan_id, candidate_type, score, distance_km, eta_minutes, payload_json)
         VALUES (:route_plan_id, :candidate_type, :score, :distance_km, :eta_minutes, :payload_json)'
    );
    $ids = [];
    foreach ($candidates as $candidate) {
        $payload = [
            'order' => $candidate['order'],
            'stops' => $candidate['stop_sequence'],
            'locked_stops' => $candidate['locked_stops'] ?? []
        ];
        $insert->execute([
            'route_plan_id' => $routePlanId,
            'candidate_type' => $candidate['candidate_type'],
            'score' => $candidate['score'],
            'distance_km' => $candidate['distance_km'],
            'eta_minutes' => (int)round($candidate['time_min']),
            'payload_json' => json_encode($payload)
        ]);
        $ids[] = (int)$pdo->lastInsertId();
    }
    return $ids;
}

function apply_candidate_to_plan(PDO $pdo, $routePlanId, $candidateId)
{
    $candidateStmt = $pdo->prepare(
        'SELECT payload_json FROM route_candidates WHERE id = :id AND route_plan_id = :route_plan_id'
    );
    $candidateStmt->execute(['id' => $candidateId, 'route_plan_id' => $routePlanId]);
    $candidate = $candidateStmt->fetch();
    if (!$candidate) {
        return ['ok' => false, 'reason' => 'Candidate not found'];
    }
    $payload = json_decode($candidate['payload_json'], true);
    if (!is_array($payload)) {
        return ['ok' => false, 'reason' => 'Invalid candidate payload'];
    }

    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM route_stops WHERE route_plan_id = :id')->execute(['id' => $routePlanId]);

    $insertStop = $pdo->prepare(
        'INSERT INTO route_stops (route_plan_id, booking_id, stop_kind, address_id, stop_order, locked, eta_minutes, status)
         VALUES (:route_plan_id, :booking_id, :stop_kind, :address_id, :stop_order, :locked, :eta_minutes, :status)'
    );
    $order = 1;
    foreach ($payload['locked_stops'] ?? [] as $lockedStop) {
        $insertStop->execute([
            'route_plan_id' => $routePlanId,
            'booking_id' => (int)$lockedStop['booking_id'],
            'stop_kind' => $lockedStop['stop_kind'],
            'address_id' => (int)$lockedStop['address_id'],
            'stop_order' => $order++,
            'locked' => true,
            'eta_minutes' => isset($lockedStop['eta_minutes']) ? (int)$lockedStop['eta_minutes'] : null,
            'status' => 'reached'
        ]);
    }
    foreach ($payload['stops'] ?? [] as $stop) {
        $insertStop->execute([
            'route_plan_id' => $routePlanId,
            'booking_id' => (int)$stop['booking_id'],
            'stop_kind' => $stop['stop_kind'],
            'address_id' => (int)$stop['address_id'],
            'stop_order' => $order++,
            'locked' => false,
            'eta_minutes' => isset($stop['eta_minutes']) ? (int)$stop['eta_minutes'] : null,
            'status' => 'pending'
        ]);
    }

    $update = $pdo->prepare(
        'UPDATE route_plans
         SET selected_candidate_id = :candidate_id, status = :status, started_at = IFNULL(started_at, NOW())
         WHERE id = :id'
    );
    $update->execute([
        'candidate_id' => $candidateId,
        'status' => 'active',
        'id' => $routePlanId
    ]);

    $pdo->commit();
    return ['ok' => true];
}

function courier_has_active_bookings(PDO $pdo, $courierId)
{
    $stmt = $pdo->prepare(
        "SELECT 1
         FROM bookings
         WHERE courier_id = :id
           AND status IN (
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
           )
         LIMIT 1"
    );
    $stmt->execute(['id' => $courierId]);
    return (bool)$stmt->fetchColumn();
}

function clear_active_route_plans(PDO $pdo, $courierId)
{
    $planStmt = $pdo->prepare('SELECT id FROM route_plans WHERE courier_id = :id AND status = :status');
    $planStmt->execute(['id' => $courierId, 'status' => 'active']);
    $planIds = $planStmt->fetchAll(PDO::FETCH_COLUMN);
    if (!$planIds) {
        return 0;
    }

    $pdo->beginTransaction();
    $inPlaceholders = implode(',', array_fill(0, count($planIds), '?'));
    $pdo->prepare("DELETE FROM route_stops WHERE route_plan_id IN ($inPlaceholders)")
        ->execute($planIds);
    $pdo->prepare("DELETE FROM route_candidates WHERE route_plan_id IN ($inPlaceholders)")
        ->execute($planIds);
    $update = $pdo->prepare(
        "UPDATE route_plans
         SET status = 'completed',
             completed_at = NOW(),
             selected_candidate_id = NULL
         WHERE id IN ($inPlaceholders)"
    );
    $update->execute($planIds);
    $pdo->commit();

    return count($planIds);
}

function clear_routes_if_courier_complete(PDO $pdo, $courierId)
{
    if (!courier_has_active_bookings($pdo, $courierId)) {
        return clear_active_route_plans($pdo, $courierId);
    }
    return 0;
}
