<?php

/**
 * Dispatch/load-confirmation regression checks.
 *
 * Run:
 *   php backend/scripts/dispatch_flow_regression.php
 */

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

function can_transition_status($currentStatus, $nextStatus, $isIntercity)
{
    if ($nextStatus === 'cancelled') {
        return !in_array($currentStatus, ['delivered', 'cancelled', 'returned_to_sender'], true);
    }
    $map = order_status_transition_map($isIntercity);
    $allowed = $map[$currentStatus] ?? [];
    return in_array($nextStatus, $allowed, true);
}

function can_assign_delivery($status, $isIntercity)
{
    return in_array($status, [($isIntercity ? 'received_at_destination_branch' : 'received_at_origin_branch'), 'waiting_for_reattempt'], true);
}

function can_enter_out_for_delivery($currentStatus)
{
    return $currentStatus === 'delivery_load_confirmed';
}

function can_enter_linehaul_in_transit($currentStatus)
{
    return $currentStatus === 'linehaul_load_confirmed';
}

function route_lock_reason_for_status($status)
{
    if ($status === 'delivery_assigned') {
        return 'delivery';
    }
    if ($status === 'linehaul_assigned') {
        return 'linehaul';
    }
    return null;
}

function assert_true($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException('FAIL: ' . $message);
    }
}

function assert_false($condition, $message)
{
    assert_true(!$condition, $message);
}

$checks = 0;

// 1) intra-city: cannot delivery_assign before received_at_origin_branch
$checks += 1;
assert_false(
    can_assign_delivery('in_transit_to_origin_branch', false),
    'intra-city delivery assignment should require received_at_origin_branch'
);
$checks += 1;
assert_false(
    can_transition_status('in_transit_to_origin_branch', 'delivery_assigned', false),
    'intra-city transition cannot skip received_at_origin_branch'
);

// 2) inter-city: cannot delivery_assign before received_at_destination_branch
$checks += 1;
assert_false(
    can_assign_delivery('received_at_origin_branch', true),
    'inter-city delivery assignment should require received_at_destination_branch'
);
$checks += 1;
assert_false(
    can_transition_status('received_at_origin_branch', 'delivery_assigned', true),
    'inter-city transition cannot skip linehaul + destination branch'
);

// 3) cannot out_for_delivery before delivery_load_confirmed
$checks += 1;
assert_false(
    can_enter_out_for_delivery('delivery_assigned'),
    'out_for_delivery should require delivery_load_confirmed'
);
$checks += 1;
assert_false(
    can_transition_status('delivery_assigned', 'out_for_delivery', false),
    'state machine should block delivery_assigned -> out_for_delivery skip'
);

// 4) cannot linehaul_in_transit before linehaul_load_confirmed
$checks += 1;
assert_false(
    can_enter_linehaul_in_transit('linehaul_assigned'),
    'linehaul_in_transit should require linehaul_load_confirmed'
);
$checks += 1;
assert_false(
    can_transition_status('linehaul_assigned', 'linehaul_in_transit', true),
    'state machine should block linehaul_assigned -> linehaul_in_transit skip'
);

// 5) route endpoint lock behavior until load-confirmed
$checks += 1;
assert_true(
    route_lock_reason_for_status('delivery_assigned') === 'delivery',
    'delivery route should be locked before delivery_load_confirmed'
);
$checks += 1;
assert_true(
    route_lock_reason_for_status('linehaul_assigned') === 'linehaul',
    'linehaul route should be locked before linehaul_load_confirmed'
);
$checks += 1;
assert_true(
    route_lock_reason_for_status('delivery_load_confirmed') === null,
    'delivery route should unlock at delivery_load_confirmed'
);

// 6) failed delivery flow -> reattempt / RTS
$checks += 1;
assert_true(
    can_transition_status('out_for_delivery', 'delivery_attempt_failed', false),
    'out_for_delivery should allow delivery_attempt_failed'
);
$checks += 1;
assert_true(
    can_transition_status('delivery_attempt_failed', 'waiting_for_reattempt', false),
    'delivery_attempt_failed should allow waiting_for_reattempt'
);
$checks += 1;
assert_true(
    can_transition_status('waiting_for_reattempt', 'delivery_assigned', false),
    'waiting_for_reattempt should allow re-dispatch to delivery_assigned'
);
$checks += 1;
assert_true(
    can_transition_status('waiting_for_reattempt', 'rts_pending', false),
    'waiting_for_reattempt should allow RTS initiation'
);
$checks += 1;
assert_true(
    can_transition_status('rts_pending', 'returned_to_sender', false),
    'rts_pending should allow returned_to_sender'
);

echo "PASS: {$checks} dispatch-flow regression checks\n";
