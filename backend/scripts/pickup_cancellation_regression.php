<?php

/**
 * Pickup-cancellation admin decision regression checks.
 *
 * Run:
 *   php backend/scripts/pickup_cancellation_regression.php
 */

function assert_true($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException('FAIL: ' . $message);
    }
}

function assert_equals($actual, $expected, $message)
{
    if ($actual !== $expected) {
        throw new RuntimeException('FAIL: ' . $message . ' (actual=' . var_export($actual, true) . ', expected=' . var_export($expected, true) . ')');
    }
}

function can_approve_pickup_cancellation($orderStatus)
{
    $allowed = ['created', 'pickup_assigned', 'in_transit_to_origin_branch'];
    return in_array((string)$orderStatus, $allowed, true);
}

function approve_pickup_cancellation(array $order, array $request, $actorRole)
{
    if ($actorRole !== 'admin') {
        throw new RuntimeException('Only admin can approve/reject pickup cancellation');
    }
    if ((string)($request['status'] ?? '') !== 'pending') {
        throw new RuntimeException('Request is already decided');
    }
    if (!can_approve_pickup_cancellation($order['status'] ?? '')) {
        throw new RuntimeException('Order status is not approvable for pickup cancellation');
    }

    $request['status'] = 'approved';
    $order['status'] = 'cancelled';
    $order['pickup_courier_id'] = null;
    $order['delivery_courier_id'] = null;
    $order['linehaul_courier_id'] = null;

    return [$order, $request];
}

function reject_pickup_cancellation(array $order, array $request, $actorRole)
{
    if ($actorRole !== 'admin') {
        throw new RuntimeException('Only admin can approve/reject pickup cancellation');
    }
    if ((string)($request['status'] ?? '') !== 'pending') {
        throw new RuntimeException('Request is already decided');
    }
    if ((string)($order['status'] ?? '') === 'cancelled') {
        throw new RuntimeException('Order is already cancelled');
    }

    $request['status'] = 'rejected';
    return [$order, $request];
}

$checks = 0;

// 1) approve changes order status to cancelled, clears pickup assignment, marks request approved
$order = [
    'status' => 'pickup_assigned',
    'pickup_courier_id' => 77,
    'delivery_courier_id' => 88,
    'linehaul_courier_id' => 99
];
$request = ['status' => 'pending'];
[$approvedOrder, $approvedRequest] = approve_pickup_cancellation($order, $request, 'admin');
$checks += 1;
assert_equals($approvedOrder['status'], 'cancelled', 'approve should cancel order');
$checks += 1;
assert_equals($approvedOrder['pickup_courier_id'], null, 'approve should clear pickup assignment');
$checks += 1;
assert_equals($approvedRequest['status'], 'approved', 'approve should mark request approved');

// 2) reject marks request rejected, order status unchanged
$order = ['status' => 'pickup_assigned'];
$request = ['status' => 'pending'];
[$rejectedOrder, $rejectedRequest] = reject_pickup_cancellation($order, $request, 'admin');
$checks += 1;
assert_equals($rejectedOrder['status'], 'pickup_assigned', 'reject should keep order status unchanged');
$checks += 1;
assert_equals($rejectedRequest['status'], 'rejected', 'reject should mark request rejected');

// 3) cannot approve if order already picked_up (or beyond allowed states)
$failed = false;
try {
    approve_pickup_cancellation(['status' => 'picked_up'], ['status' => 'pending'], 'admin');
} catch (RuntimeException $e) {
    $failed = true;
}
$checks += 1;
assert_true($failed, 'cannot approve pickup cancellation when order is picked_up');

// 4) cannot decide twice (already approved/rejected)
$failed = false;
try {
    approve_pickup_cancellation(['status' => 'pickup_assigned'], ['status' => 'approved'], 'admin');
} catch (RuntimeException $e) {
    $failed = true;
}
$checks += 1;
assert_true($failed, 'cannot approve an already decided request');

$failed = false;
try {
    reject_pickup_cancellation(['status' => 'pickup_assigned'], ['status' => 'rejected'], 'admin');
} catch (RuntimeException $e) {
    $failed = true;
}
$checks += 1;
assert_true($failed, 'cannot reject an already decided request');

// 5) permissions: only admin can approve/reject
$failed = false;
try {
    approve_pickup_cancellation(['status' => 'pickup_assigned'], ['status' => 'pending'], 'courier');
} catch (RuntimeException $e) {
    $failed = true;
}
$checks += 1;
assert_true($failed, 'non-admin cannot approve pickup cancellation');

$failed = false;
try {
    reject_pickup_cancellation(['status' => 'pickup_assigned'], ['status' => 'pending'], 'customer');
} catch (RuntimeException $e) {
    $failed = true;
}
$checks += 1;
assert_true($failed, 'non-admin cannot reject pickup cancellation');

echo "PASS: {$checks} pickup-cancellation regression checks\n";
