export const PICKUP_CANCELLATION_REASONS = [
  { value: 'sender_unavailable', label: 'Sender unavailable' },
  { value: 'address_unreachable', label: 'Address unreachable' },
  { value: 'unsafe_location', label: 'Unsafe location' },
  { value: 'package_issue', label: 'Package issue' },
  { value: 'other', label: 'Other' }
];

export const DELIVERY_CANCELLATION_REASONS = [
  { value: 'customer_cancel_before_load', label: 'Customer cancelled before load' },
  { value: 'invalid_delivery_window', label: 'Invalid delivery window' },
  { value: 'address_issue', label: 'Address issue' },
  { value: 'package_issue', label: 'Package issue' },
  { value: 'other', label: 'Other' }
];

export const DELIVERY_FAILURE_REASONS = [
  { value: 'customer_unreachable', label: 'Customer unreachable' },
  { value: 'address_closed', label: 'Address closed' },
  { value: 'refused_by_recipient', label: 'Recipient refused delivery' },
  { value: 'unsafe_location', label: 'Unsafe location' },
  { value: 'payment_collection_failed', label: 'Payment collection failed' },
  { value: 'other', label: 'Other' }
];

export const ADMIN_FINAL_CANCELLATION_REASONS = [
  { value: 'customer_confirmed_cancellation', label: 'Customer confirmed cancellation' },
  { value: 'delivery_attempt_failed', label: 'Delivery attempt failed' },
  { value: 'address_verification_failed', label: 'Address verification failed' },
  { value: 'policy_exception', label: 'Policy exception' },
  { value: 'other', label: 'Other' }
];

export const REFUND_ACTION_OPTIONS = [
  { value: 'full_refund', label: 'Full refund' },
  { value: 'partial_refund', label: 'Partial refund' },
  { value: 'no_refund', label: 'No refund' }
];

export const ADMIN_INCIDENT_REJECTION_REASONS = [
  { value: 'insufficient_evidence', label: 'Insufficient evidence' },
  { value: 'invalid_stage', label: 'Invalid stage for cancellation' },
  { value: 'policy_violation', label: 'Policy violation' },
  { value: 'customer_declined', label: 'Customer declined cancellation' },
  { value: 'other', label: 'Other' }
];

export const ADMIN_PRE_PICKUP_FORCE_CANCELLATION_REASONS = [
  { value: 'customer_requested_cancel', label: 'Customer requested cancellation' },
  { value: 'address_invalid', label: 'Invalid pickup address' },
  { value: 'merchant_unavailable', label: 'Sender unavailable for pickup' },
  { value: 'ops_exception', label: 'Operational exception' },
  { value: 'other', label: 'Other' }
];

export const COURIER_INCIDENT_REASONS_BY_TYPE = {
  pickup_cancellation: PICKUP_CANCELLATION_REASONS,
  delivery_cancellation: DELIVERY_CANCELLATION_REASONS,
  delivery_failure: DELIVERY_FAILURE_REASONS
};

const normalizeStatus = (status) => String(status || '').trim().toLowerCase();
const normalizeCourierRole = (role) => String(role || '').trim().toLowerCase();

export const getDashboardCourierIncidentAction = (status, courierRole) => {
  const code = normalizeStatus(status);
  const role = normalizeCourierRole(courierRole);
  const canHandlePickup = role === 'pickup' || role === 'both';
  const canHandleDelivery = role === 'delivery' || role === 'both';
  if (code === 'pickup_assigned') {
    if (!canHandlePickup) {
      return null;
    }
    return {
      type: 'pickup_cancellation',
      actionContext: 'dashboard',
      label: 'Request Pickup Cancellation'
    };
  }
  if (code === 'delivery_assigned') {
    if (!canHandleDelivery) {
      return null;
    }
    return {
      type: 'delivery_cancellation',
      actionContext: 'dashboard',
      label: 'Request Delivery Cancellation'
    };
  }
  return null;
};

export const getNavigationCourierIncidentAction = ({
  stopKind,
  status,
  isWithinProximity
}) => {
  const normalizedStopKind = normalizeStatus(stopKind);
  const code = normalizeStatus(status);
  if (!isWithinProximity) {
    return null;
  }
  if (normalizedStopKind === 'pickup' && code === 'pickup_assigned') {
    return {
      type: 'pickup_cancellation',
      actionContext: 'navigation',
      label: 'Request Pickup Cancellation'
    };
  }
  if (normalizedStopKind === 'delivery' && code === 'out_for_delivery') {
    return {
      type: 'delivery_failure',
      actionContext: 'navigation',
      label: 'Report Delivery Failure'
    };
  }
  return null;
};

export const getCourierIncidentModalCopy = (type) => {
  const code = String(type || '').trim().toLowerCase();
  if (code === 'pickup_cancellation') {
    return {
      title: 'Pickup Cancellation Request',
      subtitle: 'This does not fully cancel the order. Admin review is required.',
      continueLabel: 'Continue Cancellation Request',
      finalConfirmLabel: 'Submit Pickup Cancellation',
      confirmPrompt: 'Are you sure you want to submit this pickup cancellation request?',
      successTitle: 'Pickup Cancellation Requested',
      successMessage: 'Request sent to admin and customer for review.'
    };
  }
  if (code === 'delivery_cancellation') {
    return {
      title: 'Delivery Cancellation Request',
      subtitle: 'This reports a pre-load delivery cancellation and requires admin review.',
      continueLabel: 'Continue Cancellation Request',
      finalConfirmLabel: 'Submit Delivery Cancellation',
      confirmPrompt: 'Are you sure you want to submit this delivery cancellation request?',
      successTitle: 'Delivery Cancellation Requested',
      successMessage: 'Request sent to admin and customer for review.'
    };
  }
  return {
    title: 'Delivery Failure Report',
    subtitle: 'This reports a failed delivery attempt and requires admin follow-up.',
    continueLabel: 'Continue Failure Report',
    finalConfirmLabel: 'Submit Delivery Failure',
    confirmPrompt: 'Are you sure you want to submit this delivery failure report?',
    successTitle: 'Delivery Failure Reported',
    successMessage: 'Failure reported to admin and customer.'
  };
};

export const findReasonLabel = (options, value) => {
  const target = String(value || '').trim().toLowerCase();
  const match = (Array.isArray(options) ? options : []).find(
    (option) => String(option?.value || '').trim().toLowerCase() === target
  );
  return match?.label || '';
};
