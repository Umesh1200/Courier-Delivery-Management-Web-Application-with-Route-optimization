import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import CourierNavigation from '../../components/CourierNavigation';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import ChatModal from '../../components/ui/ChatModal';
import DangerActionModal from '../../components/ui/DangerActionModal';
import {
  countUnreadIncomingMessages,
  getChatLegLabel,
  getCourierChatAccessMeta,
  readSeenMessageId,
  writeSeenMessageId
} from '../../utils/chatAccess';
import {
  COURIER_INCIDENT_REASONS_BY_TYPE,
  findReasonLabel,
  getCourierIncidentModalCopy,
  getNavigationCourierIncidentAction
} from '../../utils/cancellation';

const NAV_SESSION_KEY = '__courierNavPayload';
const API_BASE_URL = 'http://localhost:8000';
const PROXIMITY_REQUIRED_METERS = 90;
const DELIVERY_FALLBACK_PROXIMITY_METERS = 220;
// Show force-confirm only when courier is nearby but can't reach the pin
const FORCE_CONFIRM_APPROACH_METERS = 500;
const DASHBOARD_POLL_MS = 10000;
const LOCATION_PUSH_MS = 15000;
const STEP_CONFIRM_DELIVERY_LOAD = '__confirm_delivery_load__';
const STEP_CONFIRM_LINEHAUL_LOAD = '__confirm_linehaul_load__';
const STEP_CONFIRM_DESTINATION_HANDOVER = '__confirm_destination_handover__';
const DELIVERY_RETURN_TO_BRANCH_STATUSES = new Set(['delivery_attempt_failed']);

const toPointObject = (point) => {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng ?? point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5))
  };
};

const normalizeStopKind = (rawKind, index, label = '') => {
  const value = String(rawKind || '').trim().toLowerCase();
  if (['start', 'pickup', 'delivery', 'branch'].includes(value)) {
    return value;
  }

  const lowerLabel = String(label || '').trim().toLowerCase();
  if (index === 0) {
    return 'start';
  }
  if (lowerLabel.startsWith('pickup')) {
    return 'pickup';
  }
  if (lowerLabel.startsWith('destination branch')) {
    return 'delivery';
  }
  if (lowerLabel.startsWith('delivery')) {
    return 'delivery';
  }
  if (lowerLabel.startsWith('dispatch branch')) {
    return 'branch';
  }
  if (lowerLabel.startsWith('branch')) {
    return 'branch';
  }
  return 'waypoint';
};

const haversineDistanceMeters = (a, b) => {
  if (!a || !b) {
    return null;
  }
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const arc = (Math.sin(dLat / 2) ** 2)
    + (Math.sin(dLng / 2) ** 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadius * Math.asin(Math.sqrt(arc));
};

const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) {
    return '-';
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.max(1, Math.round(meters))} m`;
};

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatRsAmount = (amount) => {
  const value = toNumberOrNull(amount);
  if (value === null) {
    return 'N/A';
  }
  return `RS ${value.toFixed(2)}`;
};

const formatPaymentMethodLabel = (method, provider) => {
  const methodCode = String(method || '').trim().toLowerCase();
  const providerCode = String(provider || '').trim().toLowerCase();
  if (!methodCode) {
    return '';
  }
  if (methodCode === 'cash') {
    return 'Cash on Pickup';
  }
  if (methodCode === 'wallet') {
    if (providerCode === 'khalti') {
      return 'Khalti Wallet';
    }
    return providerCode ? `${providerCode.toUpperCase()} Wallet` : 'Wallet';
  }
  if (methodCode === 'credit-card') {
    return 'Credit Card';
  }
  if (methodCode === 'debit-card') {
    return 'Debit Card';
  }
  return methodCode.replaceAll('-', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatPaymentStatusLabel = (status) => {
  const code = String(status || '').trim().toLowerCase();
  if (!code) {
    return '';
  }
  return code.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatCodeLabel = (value) => {
  const code = String(value || '').trim().toLowerCase();
  if (!code) {
    return '';
  }
  return code
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatBranchAddressText = (branch) => (
  [
    String(branch?.address || '').trim(),
    String(branch?.city || '').trim(),
    String(branch?.province || '').trim(),
    String(branch?.postalCode || '').trim()
  ]
    .filter((value) => Boolean(value))
    .join(', ')
);

const formatBranchNameText = (branch, fallback = 'Branch') => {
  const name = String(branch?.name || '').trim();
  if (name) {
    return name;
  }
  const city = String(branch?.city || '').trim();
  if (city) {
    return city;
  }
  return fallback;
};

const resolveDispatchBranchForDelivery = (delivery) => {
  if (!delivery || typeof delivery !== 'object') {
    return null;
  }
  const status = String(delivery?.status || '').trim().toLowerCase();
  const isIntercity = Boolean(delivery?.isIntercity);
  if (['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'].includes(status)) {
    return isIntercity ? (delivery?.destinationBranch || null) : (delivery?.originBranch || null);
  }
  return delivery?.originBranch || delivery?.destinationBranch || null;
};

const fileToDataUrl = (file) => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to read file'));
    };
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  })
);

const createEmptyProofData = () => ({
  photoDataUrl: '',
  photoName: '',
  signatureDataUrl: '',
  signatureName: '',
  notes: ''
});

const roleAllowsPickup = (role) => role === 'pickup' || role === 'both';
const roleAllowsLinehaul = (role) => role === 'linehaul' || role === 'both';
const roleAllowsDelivery = (role) => role === 'delivery' || role === 'both';
const ACTIVE_COUNT_STATUSES_BY_ROLE = {
  pickup: new Set(['picked_up', 'in_transit_to_origin_branch']),
  linehaul: new Set(['linehaul_load_confirmed', 'linehaul_in_transit']),
  delivery: new Set(['delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed']),
  both: new Set([
    'picked_up',
    'in_transit_to_origin_branch',
    'linehaul_load_confirmed',
    'linehaul_in_transit',
    'delivery_load_confirmed',
    'out_for_delivery',
    'delivery_attempt_failed'
  ])
};

const normalizedRoleValue = (role) => (
  ['pickup', 'delivery', 'linehaul', 'both'].includes(role) ? role : 'both'
);

const uniqueNumericIds = (values = [], fallback = null) => Array.from(new Set(
  [
    ...(Array.isArray(values) ? values : []),
    fallback
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
));

const actionSequences = (action) => {
  if (!action || typeof action !== 'object') {
    return [];
  }
  if (action.type === 'single') {
    return Array.isArray(action.sequence) ? [action.sequence] : [];
  }
  if (action.type === 'batch' && Array.isArray(action.updates)) {
    return action.updates
      .map((update) => (Array.isArray(update?.sequence) ? update.sequence : []))
      .filter((sequence) => sequence.length > 0);
  }
  return [];
};

const actionAllowsRouteEndFallback = (action) => (
  actionSequences(action).some((sequence) => (
    sequence.includes(STEP_CONFIRM_DESTINATION_HANDOVER)
    || sequence.includes('delivered')
  ))
);

const buildRouteStopsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const points = Array.isArray(payload.routePoints)
    ? payload.routePoints.map((point) => toPointObject(point)).filter((point) => Boolean(point))
    : [];
  const labels = Array.isArray(payload.routePointLabels)
    ? payload.routePointLabels.map((label) => (typeof label === 'string' ? label.trim() : ''))
    : [];
  const meta = Array.isArray(payload.routePointMeta) ? payload.routePointMeta : [];

  const sourceStops = (meta.length > 0 ? meta : points.map((point, index) => ({
    lat: point?.lat,
    lng: point?.lng,
    label: labels[index] || '',
    stopKind: normalizeStopKind('', index, labels[index] || ''),
    bookingId: null,
    addressId: null,
    bookingIds: [],
    addressIds: []
  })))
    .map((rawStop, index) => {
      const fallbackPoint = points[index] || null;
      const point = toPointObject(rawStop) || fallbackPoint;
      if (!point) {
        return null;
      }
      const label = typeof rawStop?.label === 'string' && rawStop.label.trim()
        ? rawStop.label.trim()
        : labels[index] || '';
      const stopKind = normalizeStopKind(rawStop?.stopKind, index, label);
      const bookingId = Number(rawStop?.bookingId);
      const addressId = Number(rawStop?.addressId);
      const bookingIds = uniqueNumericIds(rawStop?.bookingIds, bookingId);
      const addressIds = uniqueNumericIds(rawStop?.addressIds, addressId);
      return {
        lat: point.lat,
        lng: point.lng,
        label,
        stopKind,
        bookingId: bookingIds.length > 0 ? bookingIds[0] : null,
        addressId: addressIds.length > 0 ? addressIds[0] : null,
        bookingIds,
        addressIds
      };
    })
    .filter((stop) => Boolean(stop));

  const deduped = [];
  sourceStops.forEach((stop) => {
    const previous = deduped[deduped.length - 1];
    const sameAsPrevious = previous
      && Math.abs(previous.lat - stop.lat) < 0.00001
      && Math.abs(previous.lng - stop.lng) < 0.00001;
    if (sameAsPrevious) {
      if (stop.label) {
        previous.label = stop.label;
      }
      if (stop.stopKind && stop.stopKind !== 'start') {
        previous.stopKind = stop.stopKind;
      }
      if (Number.isFinite(stop.bookingId)) {
        previous.bookingId = stop.bookingId;
      }
      if (Number.isFinite(stop.addressId)) {
        previous.addressId = stop.addressId;
      }
      previous.bookingIds = uniqueNumericIds([...(previous.bookingIds || []), ...(stop.bookingIds || [])], previous.bookingId);
      previous.addressIds = uniqueNumericIds([...(previous.addressIds || []), ...(stop.addressIds || [])], previous.addressId);
      previous.bookingId = previous.bookingIds.length > 0 ? previous.bookingIds[0] : null;
      previous.addressId = previous.addressIds.length > 0 ? previous.addressIds[0] : null;
      return;
    }
    deduped.push({
      ...stop,
      bookingIds: uniqueNumericIds(stop.bookingIds, stop.bookingId),
      addressIds: uniqueNumericIds(stop.addressIds, stop.addressId)
    });
  });

  return deduped.map((stop, index) => {
    const bookingSignature = Array.isArray(stop.bookingIds) && stop.bookingIds.length > 0
      ? stop.bookingIds.join('-')
      : (Number.isFinite(stop.bookingId) ? String(stop.bookingId) : 'none');
    return {
      ...stop,
      index,
      bookingId: Array.isArray(stop.bookingIds) && stop.bookingIds.length > 0 ? stop.bookingIds[0] : stop.bookingId,
      addressId: Array.isArray(stop.addressIds) && stop.addressIds.length > 0 ? stop.addressIds[0] : stop.addressId,
      stopId: `${stop.stopKind}-${bookingSignature}-${index}`
    };
  });
};

const buildSingleStopAction = (stop, delivery, role) => {
  if (!stop || !delivery) {
    return null;
  }
  const currentRole = normalizedRoleValue(role);
  const status = String(delivery?.status || '').trim().toLowerCase();

  if (stop.stopKind === 'pickup') {
    if (!roleAllowsPickup(currentRole)) {
      return null;
    }
    if (status === 'pickup_assigned') {
      return {
        type: 'single',
        deliveryId: Number(delivery.id),
        sequence: ['picked_up'],
        label: 'Confirm Pickup',
        iconName: 'CheckCircle2',
        requiresProof: false
      };
    }
    if (status === 'picked_up') {
      return {
        type: 'single',
        deliveryId: Number(delivery.id),
        sequence: ['in_transit_to_origin_branch'],
        label: 'Start Transfer',
        iconName: 'Truck',
        requiresProof: false
      };
    }
    return null;
  }

  if (stop.stopKind === 'delivery') {
    if (roleAllowsLinehaul(currentRole) && (status === 'linehaul_load_confirmed' || status === 'linehaul_in_transit')) {
      return {
        type: 'single',
        deliveryId: Number(delivery.id),
        sequence: status === 'linehaul_load_confirmed'
          ? ['linehaul_in_transit', STEP_CONFIRM_DESTINATION_HANDOVER]
          : [STEP_CONFIRM_DESTINATION_HANDOVER],
        label: 'Confirm Branch Handover',
        iconName: 'Warehouse',
        requiresProof: false
      };
    }
    if (!roleAllowsDelivery(currentRole)) {
      return null;
    }
    if (status === 'delivery_load_confirmed') {
      return {
        type: 'single',
        deliveryId: Number(delivery.id),
        sequence: ['out_for_delivery', 'delivered'],
        label: 'Confirm Delivery',
        iconName: 'CheckCircle2',
        requiresProof: true
      };
    }
    if (status === 'out_for_delivery') {
      return {
        type: 'single',
        deliveryId: Number(delivery.id),
        sequence: ['delivered'],
        label: 'Confirm Delivery',
        iconName: 'CheckCircle2',
        requiresProof: true
      };
    }
    if (status === 'delivery_attempt_failed') {
      return {
        type: 'single',
        deliveryId: Number(delivery.id),
        sequence: [STEP_CONFIRM_DESTINATION_HANDOVER],
        label: 'Confirm Return Handover',
        iconName: 'Warehouse',
        requiresProof: false
      };
    }
    return null;
  }

  return null;
};

const buildStopActionForDeliveries = (stop, deliveriesForStop, role) => {
  const actions = (Array.isArray(deliveriesForStop) ? deliveriesForStop : [])
    .map((delivery) => buildSingleStopAction(stop, delivery, role))
    .filter((action) => Boolean(action));

  if (actions.length === 0) {
    return null;
  }
  if (actions.length === 1) {
    return actions[0];
  }

  const parcelCount = actions.length;
  const isPickupStop = stop?.stopKind === 'pickup';
  const isDeliveryStop = stop?.stopKind === 'delivery';
  const hasBranchHandover = actions.some((action) => (
    Array.isArray(action?.sequence) && action.sequence.includes(STEP_CONFIRM_DESTINATION_HANDOVER)
  ));
  return {
    type: 'batch',
    batchKind: 'grouped-stop',
    updates: actions.map((action) => ({
      deliveryId: Number(action.deliveryId),
      sequence: Array.isArray(action.sequence) ? action.sequence : [],
      requiresProof: Boolean(action.requiresProof)
    })),
    label: isPickupStop
      ? `Confirm Pickups (${parcelCount})`
      : isDeliveryStop
        ? (hasBranchHandover ? `Confirm Branch Handovers (${parcelCount})` : `Confirm Deliveries (${parcelCount})`)
        : `Confirm Stop (${parcelCount})`,
    iconName: isPickupStop ? 'Truck' : (hasBranchHandover ? 'Warehouse' : 'CheckCircle2'),
    requiresProof: actions.some((action) => Boolean(action.requiresProof))
  };
};

const buildBranchBatchUpdates = ({ deliveries, routeBookingIds, role }) => {
  const currentRole = normalizedRoleValue(role);
  if (!roleAllowsPickup(currentRole) && !roleAllowsLinehaul(currentRole) && !roleAllowsDelivery(currentRole)) {
    return [];
  }

  const hasRouteBookings = routeBookingIds.size > 0;
  return (deliveries || [])
    .map((delivery) => {
      const deliveryId = Number(delivery?.id);
      if (!Number.isFinite(deliveryId)) {
        return null;
      }
      if (hasRouteBookings && !routeBookingIds.has(deliveryId)) {
        return null;
      }

      const status = String(delivery?.status || '').trim().toLowerCase();
      if (roleAllowsPickup(currentRole)) {
        if (status === 'picked_up') {
          return { deliveryId, sequence: ['in_transit_to_origin_branch'] };
        }
      }

      if (roleAllowsLinehaul(currentRole)) {
        if (status === 'linehaul_assigned') {
          return { deliveryId, sequence: [STEP_CONFIRM_LINEHAUL_LOAD] };
        }
        if (status === 'linehaul_load_confirmed') {
          return { deliveryId, sequence: ['linehaul_in_transit'] };
        }
      }

      if (roleAllowsDelivery(currentRole)) {
        if (status === 'delivery_assigned') {
          return { deliveryId, sequence: [STEP_CONFIRM_DELIVERY_LOAD] };
        }
      }

      return null;
    })
    .filter((update) => Boolean(update));
};

const sequenceIncludesLoadConfirmation = (sequence) => (
  Array.isArray(sequence)
  && sequence.some((step) => step === STEP_CONFIRM_DELIVERY_LOAD || step === STEP_CONFIRM_LINEHAUL_LOAD)
);

const actionIncludesLoadConfirmation = (action) => {
  if (!action || typeof action !== 'object') {
    return false;
  }
  if (action.type === 'single') {
    return sequenceIncludesLoadConfirmation(action.sequence);
  }
  if (action.type === 'batch') {
    return Array.isArray(action.updates)
      && action.updates.some((update) => sequenceIncludesLoadConfirmation(update?.sequence));
  }
  return false;
};

const normalizePayloadLabelsForNavigation = () => {
  try {
    const raw = window.sessionStorage.getItem(NAV_SESSION_KEY);
    if (!raw) {
      return;
    }
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const labels = Array.isArray(payload.routePointLabels)
      ? payload.routePointLabels.map((value) => (typeof value === 'string' ? value.trim() : ''))
      : [];
    if (!labels.length) {
      return;
    }

    const firstLabel = labels[0].toLowerCase();
    const shouldReplaceStartLabel = firstLabel === 'courier route start' || firstLabel === 'courier current position';
    if (!shouldReplaceStartLabel) {
      return;
    }

    const branchLabel = labels.find((label) => /^branch\b/i.test(label)) || 'Branch';
    labels[0] = branchLabel;
    payload.routePointLabels = labels;
    window.sessionStorage.setItem(NAV_SESSION_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore session-storage and JSON parse errors.
  }
};

const readNavigationPayload = () => {
  try {
    const raw = window.sessionStorage.getItem(NAV_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw);
    return payload && typeof payload === 'object' ? payload : null;
  } catch (error) {
    return null;
  }
};

const clearNavigationPayloadStorage = () => {
  try {
    window.sessionStorage.removeItem(NAV_SESSION_KEY);
  } catch (error) {
    // Ignore session-storage access errors.
  }
};

const CourierNavigationPage = () => {
  const navigate = useNavigate();
  const [useGpsTracking, setUseGpsTracking] = useState(false);
  const [navPayload, setNavPayload] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [courierRole, setCourierRole] = useState('both');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isDashboardSnapshotFresh, setIsDashboardSnapshotFresh] = useState(false);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [simulatedLocation, setSimulatedLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationNotice, setConfirmationNotice] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [confirmedStops, setConfirmedStops] = useState(() => new Set());
  const [showProofCapture, setShowProofCapture] = useState(false);
  const [proofData, setProofData] = useState(() => createEmptyProofData());
  const [proofByDelivery, setProofByDelivery] = useState({});
  const [isUpcomingExpanded, setIsUpcomingExpanded] = useState(false);
  const [isCheckpointDetailsExpanded, setIsCheckpointDetailsExpanded] = useState(false);
  const [lastReachedLeg, setLastReachedLeg] = useState(null);
  const [lastStartedLeg, setLastStartedLeg] = useState(null);
  const [legDistanceSnapshot, setLegDistanceSnapshot] = useState({
    legIndex: null,
    routeDistanceMeters: null,
    remainingDistanceMeters: null
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatLatestMessageId, setChatLatestMessageId] = useState(0);
  const [chatLegKey, setChatLegKey] = useState('');
  const [incidentFlow, setIncidentFlow] = useState({
    isOpen: false,
    bookingId: null,
    trackingId: '',
    type: '',
    actionContext: 'navigation'
  });
  const [incidentReason, setIncidentReason] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [incidentSubmitError, setIncidentSubmitError] = useState('');
  const [isIncidentSubmitting, setIsIncidentSubmitting] = useState(false);
  const [showProximityOverride, setShowProximityOverride] = useState(false);
  const [proximityOverrideReason, setProximityOverrideReason] = useState('');
  const reactNavigationRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastLocationPushRef = useRef(0);
  const autoOutForDeliveryRef = useRef(new Set());
  const autoLinehaulTransitRef = useRef(new Set());
  const userId = Number(localStorage.getItem('userId'));

  const resetProofData = useCallback(() => {
    setProofData(createEmptyProofData());
    setProofByDelivery({});
  }, []);

  const postToDriver = useCallback((message) => {
    if (!message || typeof message !== 'object') {
      return;
    }
    reactNavigationRef?.current?.handleMessage?.(message);
  }, []);

  const clearNavigationPayload = useCallback(() => {
    clearNavigationPayloadStorage();
    setNavPayload(null);
    setConfirmedStops(new Set());
    setLastReachedLeg(null);
    setLastStartedLeg(null);
  }, []);

  const pushCourierLocation = useCallback((location, { force = false } = {}) => {
    if (!Number.isFinite(userId) || userId <= 0 || !location) {
      return;
    }
    const lat = Number(location?.lat);
    const lng = Number(location?.lng ?? location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastLocationPushRef.current < LOCATION_PUSH_MS) {
      return;
    }
    lastLocationPushRef.current = now;
    fetch(`${API_BASE_URL}/api/courier/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courierId: Number(userId),
        latitude: lat,
        longitude: lng
      }),
      keepalive: true
    }).catch(() => {});
  }, [userId]);

  const handleDriverMessage = useCallback((data) => {
    if (!data || typeof data !== 'object') {
      return;
    }
    if (data.type === 'courier-nav/position') {
      const lat = Number(data?.lat);
      const lng = Number(data?.lng);
      const source = String(data?.source || '');
      const legIndex = Number(data?.legIndex);
      const routeDistanceMeters = Number(data?.routeDistanceMeters);
      const remainingDistanceMeters = Number(data?.remainingDistanceMeters);
      if (Number.isFinite(legIndex) && (
        Number.isFinite(routeDistanceMeters) || Number.isFinite(remainingDistanceMeters)
      )) {
        setLegDistanceSnapshot({
          legIndex: Math.max(0, Math.floor(legIndex)),
          routeDistanceMeters: Number.isFinite(routeDistanceMeters) ? Math.max(0, routeDistanceMeters) : null,
          remainingDistanceMeters: Number.isFinite(remainingDistanceMeters) ? Math.max(0, remainingDistanceMeters) : null
        });
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || source !== 'simulated') {
        return;
      }
      setSimulatedLocation({
        lat: Number(lat),
        lng: Number(lng)
      });
      return;
    }
    if (data.type === 'courier-nav/navigation-stop') {
      const lat = Number(data?.lat);
      const lng = Number(data?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      const stopPoint = {
        lat: Number(lat),
        lng: Number(lng)
      };
      setSimulatedLocation(stopPoint);
      pushCourierLocation(stopPoint, { force: true });
      return;
    }
    if (data.type === 'courier-nav/leg-reached') {
      const legIndex = Number(data?.legIndex);
      if (!Number.isFinite(legIndex) || legIndex < 0) {
        return;
      }
      setLastReachedLeg({
        legIndex: Number(legIndex)
      });
      const lat = Number(data?.lat);
      const lng = Number(data?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setSimulatedLocation({
          lat: Number(lat),
          lng: Number(lng)
        });
      }
      setLegDistanceSnapshot((previous) => ({
        legIndex: Math.max(0, Math.floor(legIndex)),
        routeDistanceMeters: Number.isFinite(previous?.routeDistanceMeters) ? previous.routeDistanceMeters : null,
        remainingDistanceMeters: 0
      }));
      return;
    }
    if (data.type === 'courier-nav/navigation-start') {
      const legIndex = Number(data?.legIndex);
      if (!Number.isFinite(legIndex) || legIndex < 0) {
        return;
      }
      setLastStartedLeg({
        legIndex: Number(legIndex),
        at: Date.now()
      });
      return;
    }
    if (data.type === 'courier-nav/leg-loaded') {
      const legIndex = Number(data?.legIndex);
      const routeDistanceMeters = Number(data?.legDistanceMeters);
      if (Number.isFinite(legIndex) || Number.isFinite(routeDistanceMeters)) {
        setLegDistanceSnapshot((previous) => ({
          legIndex: Number.isFinite(legIndex)
            ? Math.max(0, Math.floor(legIndex))
            : (Number.isFinite(previous?.legIndex) ? previous.legIndex : null),
          routeDistanceMeters: Number.isFinite(routeDistanceMeters)
            ? Math.max(0, routeDistanceMeters)
            : (Number.isFinite(previous?.routeDistanceMeters) ? previous.routeDistanceMeters : null),
          remainingDistanceMeters: Number.isFinite(routeDistanceMeters)
            ? Math.max(0, routeDistanceMeters)
            : (Number.isFinite(previous?.remainingDistanceMeters) ? previous.remainingDistanceMeters : null)
        }));
      }
      setLastReachedLeg(null);
    }
  }, [pushCourierLocation]);

  useEffect(() => {
    normalizePayloadLabelsForNavigation();
    setNavPayload(readNavigationPayload());
  }, []);

  useEffect(() => {
    setConfirmedStops(new Set());
    setLastReachedLeg(null);
    setLastStartedLeg(null);
    setLegDistanceSnapshot({
      legIndex: null,
      routeDistanceMeters: null,
      remainingDistanceMeters: null
    });
    autoOutForDeliveryRef.current.clear();
    autoLinehaulTransitRef.current.clear();
  }, [navPayload]);

  const loadNavigationContext = useCallback(async (silent = false) => {
    if (!Number.isFinite(userId) || userId <= 0) {
      setDeliveries([]);
      setIsDashboardSnapshotFresh(false);
      setIsLoadingData(false);
      return;
    }
    if (!silent) {
      setIsLoadingData(true);
    }

    try {
      const [userRes, dashboardRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/users/${userId}`),
        fetch(`${API_BASE_URL}/api/dashboard/courier?userId=${userId}`)
      ]);

      if (userRes.ok) {
        const user = await userRes.json();
        setCourierRole(normalizedRoleValue(user?.courierRole || 'both'));
      }

      if (dashboardRes.ok) {
        const dashboard = await dashboardRes.json();
        setDeliveries(Array.isArray(dashboard?.deliveries) ? dashboard.deliveries : []);
        setIsDashboardSnapshotFresh(true);
      } else {
        setDeliveries([]);
        setIsDashboardSnapshotFresh(false);
      }
    } catch (error) {
      setDeliveries([]);
      setIsDashboardSnapshotFresh(false);
    } finally {
      if (!silent) {
        setIsLoadingData(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    loadNavigationContext(false);
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadNavigationContext(true);
      }
    }, DASHBOARD_POLL_MS);
    return () => window.clearInterval(pollId);
  }, [loadNavigationContext]);

  useEffect(() => {
    postToDriver({ type: 'courier-nav/settings', useGps: useGpsTracking });
  }, [postToDriver, useGpsTracking]);

  useEffect(() => {
    if (!useGpsTracking) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      setGpsLocation(null);
      setLocationError('');
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported on this device.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude)
        };
        setGpsLocation(nextLocation);
        postToDriver({
          type: 'courier-nav/gps-update',
          lat: nextLocation.lat,
          lng: nextLocation.lng
        });
        setLocationError('');
      },
      () => {
        setLocationError('Enable location access to use GPS mode.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 8000,
        timeout: 12000
      }
    );

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    };
  }, [postToDriver, useGpsTracking]);

  const activeLocation = useMemo(() => {
    if (useGpsTracking) {
      return gpsLocation || simulatedLocation || null;
    }
    return simulatedLocation || null;
  }, [gpsLocation, simulatedLocation, useGpsTracking]);

  const activeLocationSource = useMemo(() => {
    if (useGpsTracking) {
      return gpsLocation ? 'GPS' : (simulatedLocation ? 'Simulated fallback' : 'GPS');
    }
    return 'Simulated';
  }, [gpsLocation, simulatedLocation, useGpsTracking]);

  useEffect(() => {
    if (!activeLocation) {
      return;
    }
    pushCourierLocation(activeLocation, { force: false });
  }, [activeLocation, pushCourierLocation]);

  const deliveryById = useMemo(() => (
    new Map(
      (deliveries || [])
        .map((delivery) => [Number(delivery?.id), delivery])
        .filter(([id]) => Number.isFinite(id))
    )
  ), [deliveries]);

  const routeStops = useMemo(() => buildRouteStopsFromPayload(navPayload), [navPayload]);
  const routeBookingIds = useMemo(() => (
    new Set(
      routeStops.flatMap((stop) => {
        const ids = Array.isArray(stop?.bookingIds) ? stop.bookingIds : [];
        if (ids.length > 0) {
          return ids
            .map((bookingId) => Number(bookingId))
            .filter((bookingId) => Number.isFinite(bookingId));
        }
        const fallbackId = Number(stop?.bookingId);
        return Number.isFinite(fallbackId) ? [fallbackId] : [];
      })
    )
  ), [routeStops]);
  const branchUpdates = useMemo(() => buildBranchBatchUpdates({
    deliveries,
    routeBookingIds,
    role: courierRole
  }), [courierRole, deliveries, routeBookingIds]);

  const actionableStops = useMemo(() => (
    routeStops
      .map((stop) => {
        let action = null;
        if (stop.stopKind === 'branch') {
          if (branchUpdates.length > 0) {
            const hasLoadConfirm = branchUpdates.some((update) => (
              Array.isArray(update?.sequence)
                && (update.sequence.includes(STEP_CONFIRM_DELIVERY_LOAD) || update.sequence.includes(STEP_CONFIRM_LINEHAUL_LOAD))
            ));
            action = {
              type: 'batch',
              batchKind: 'branch',
              updates: branchUpdates,
              label: hasLoadConfirm ? 'Confirm Load At Branch' : 'Confirm Branch Checkpoint',
              iconName: hasLoadConfirm ? 'PackageCheck' : 'Warehouse',
              requiresProof: false
            };
          }
        } else if (stop.stopKind === 'pickup' || stop.stopKind === 'delivery') {
          const stopBookingIds = uniqueNumericIds(stop?.bookingIds, stop?.bookingId);
          const stopDeliveries = stopBookingIds
            .map((bookingId) => deliveryById.get(Number(bookingId)))
            .filter((delivery) => Boolean(delivery));
          action = buildStopActionForDeliveries(stop, stopDeliveries, courierRole);
        }
        if (!action) {
          return null;
        }
        const distanceMeters = activeLocation
          ? haversineDistanceMeters(activeLocation, { lat: Number(stop.lat), lng: Number(stop.lng) })
          : null;
        const isReachedLegForStop = Number.isFinite(lastReachedLeg?.legIndex)
          && Number.isFinite(stop?.index)
          && Number(stop.index) > 0
          && Number(lastReachedLeg.legIndex) === Number(stop.index) - 1;
        const isStartedLegForStop = Number.isFinite(lastStartedLeg?.legIndex)
          && Number.isFinite(stop?.index)
          && Number(stop.index) > 0
          && Number(lastStartedLeg.legIndex) === Number(stop.index) - 1;
        const hasRouteEndFallbackStep = actionAllowsRouteEndFallback(action);
        const isWithinFallbackRadius = Number.isFinite(distanceMeters)
          && distanceMeters <= DELIVERY_FALLBACK_PROXIMITY_METERS;
        const usesRouteFallback = stop.stopKind === 'delivery'
          && hasRouteEndFallbackStep
          && (isReachedLegForStop || (isStartedLegForStop && isWithinFallbackRadius));
        const requiredProximityMeters = usesRouteFallback
          ? DELIVERY_FALLBACK_PROXIMITY_METERS
          : PROXIMITY_REQUIRED_METERS;
        const isWithinProximity = (
          (Number.isFinite(distanceMeters) && distanceMeters <= requiredProximityMeters)
          || usesRouteFallback
        );
        return {
          ...stop,
          action,
          distanceMeters,
          isWithinProximity,
          requiredProximityMeters,
          usesRouteFallback
        };
      })
      .filter((stop) => Boolean(stop))
  ), [activeLocation, branchUpdates, courierRole, deliveryById, lastReachedLeg, lastStartedLeg, routeStops]);

  const nextStop = useMemo(() => {
    const pending = actionableStops.find((stop) => !confirmedStops.has(stop.stopId));
    return pending || actionableStops[0] || null;
  }, [actionableStops, confirmedStops]);

  const nextStopBookingIds = useMemo(
    () => uniqueNumericIds(nextStop?.bookingIds, nextStop?.bookingId),
    [nextStop]
  );
  const nextStopDeliveries = useMemo(() => (
    nextStopBookingIds
      .map((bookingId) => deliveryById.get(Number(bookingId)))
      .filter((delivery) => Boolean(delivery))
  ), [deliveryById, nextStopBookingIds]);
  const nextStopDeliveriesById = useMemo(() => (
    new Map(
      nextStopDeliveries
        .map((delivery) => [Number(delivery?.id), delivery])
        .filter(([deliveryId]) => Number.isFinite(deliveryId))
    )
  ), [nextStopDeliveries]);
  const nextStopDeliveryCount = nextStopDeliveries.length;
  const hasMultipleStopParcels = nextStopDeliveryCount > 1;
  const nextStopDelivery = nextStopDeliveries[0] || null;
  const nextStopLegIndex = useMemo(() => {
    const stopIndex = Number(nextStop?.index);
    if (!Number.isFinite(stopIndex) || stopIndex <= 0) {
      return null;
    }
    return Math.max(0, Math.floor(stopIndex - 1));
  }, [nextStop?.index]);
  const nextStopDistanceMeters = useMemo(() => {
    const fallbackDistance = Number(nextStop?.distanceMeters);
    const normalizedFallback = Number.isFinite(fallbackDistance) ? Math.max(0, fallbackDistance) : null;
    const trackedLegIndex = Number(legDistanceSnapshot?.legIndex);
    if (!Number.isFinite(nextStopLegIndex) || !Number.isFinite(trackedLegIndex) || trackedLegIndex !== nextStopLegIndex) {
      return normalizedFallback;
    }
    const remainingDistanceMeters = Number(legDistanceSnapshot?.remainingDistanceMeters);
    if (Number.isFinite(remainingDistanceMeters)) {
      return Math.max(0, remainingDistanceMeters);
    }
    const routeDistanceMeters = Number(legDistanceSnapshot?.routeDistanceMeters);
    if (Number.isFinite(routeDistanceMeters)) {
      return Math.max(0, routeDistanceMeters);
    }
    return normalizedFallback;
  }, [
    legDistanceSnapshot?.legIndex,
    legDistanceSnapshot?.remainingDistanceMeters,
    legDistanceSnapshot?.routeDistanceMeters,
    nextStop?.distanceMeters,
    nextStopLegIndex
  ]);
  const nextStopBranchSummary = useMemo(() => {
    if (!nextStop || nextStopDeliveries.length <= 0) {
      return null;
    }
    const firstDelivery = nextStopDeliveries[0];
    const normalizedStatus = String(firstDelivery?.status || '').trim().toLowerCase();
    if (nextStop.stopKind === 'branch') {
      const dispatchBranch = resolveDispatchBranchForDelivery(firstDelivery);
      if (!dispatchBranch) {
        return null;
      }
      return {
        title: formatBranchNameText(dispatchBranch, 'Dispatch Branch'),
        address: formatBranchAddressText(dispatchBranch),
        prefix: 'Dispatch Branch'
      };
    }
    const isLinehaulDestinationStop = nextStop.stopKind === 'delivery'
      && ['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit'].includes(normalizedStatus);
    if (isLinehaulDestinationStop) {
      const destinationBranch = firstDelivery?.destinationBranch || null;
      if (!destinationBranch) {
        return null;
      }
      return {
        title: formatBranchNameText(destinationBranch, 'Destination Branch'),
        address: formatBranchAddressText(destinationBranch),
        prefix: 'Destination Branch'
      };
    }
    const isDeliveryReturnStop = nextStop.stopKind === 'delivery'
      && DELIVERY_RETURN_TO_BRANCH_STATUSES.has(normalizedStatus);
    if (isDeliveryReturnStop) {
      const dispatchBranch = resolveDispatchBranchForDelivery(firstDelivery);
      if (!dispatchBranch) {
        return null;
      }
      return {
        title: formatBranchNameText(dispatchBranch, 'Dispatch Branch'),
        address: formatBranchAddressText(dispatchBranch),
        prefix: 'Dispatch Branch'
      };
    }
    return null;
  }, [nextStop, nextStopDeliveries]);
  const navigationIncidentAction = useMemo(() => (
    getNavigationCourierIncidentAction({
      stopKind: nextStop?.stopKind,
      status: nextStopDelivery?.status,
      isWithinProximity: Boolean(nextStop?.isWithinProximity)
    })
  ), [nextStop?.isWithinProximity, nextStop?.stopKind, nextStopDelivery?.status]);
  const incidentReasonOptions = useMemo(() => (
    COURIER_INCIDENT_REASONS_BY_TYPE?.[incidentFlow?.type] || []
  ), [incidentFlow?.type]);
  const incidentModalCopy = useMemo(() => (
    getCourierIncidentModalCopy(incidentFlow?.type)
  ), [incidentFlow?.type]);
  const nextStopProofUpdates = useMemo(() => (
    Array.isArray(nextStop?.action?.updates)
      ? nextStop.action.updates.filter((update) => Boolean(update?.requiresProof))
      : []
  ), [nextStop?.action?.updates]);
  const nextStopProofDeliveryIds = useMemo(() => (
    nextStopProofUpdates
      .map((update) => Number(update?.deliveryId))
      .filter((deliveryId) => Number.isFinite(deliveryId))
  ), [nextStopProofUpdates]);
  const nextStopProofDeliveryKey = useMemo(
    () => nextStopProofDeliveryIds.join('|'),
    [nextStopProofDeliveryIds]
  );
  const isGroupedDeliveryProofMode = Boolean(
    nextStop?.stopKind === 'delivery'
    && nextStop?.action?.type === 'batch'
    && nextStop?.action?.batchKind === 'grouped-stop'
    && nextStopProofDeliveryIds.length > 1
  );
  const nextStopTrackingSummary = useMemo(() => {
    if (nextStopDeliveries.length <= 0) {
      return '';
    }
    const trackingIds = nextStopDeliveries
      .map((delivery) => String(delivery?.trackingId || '').trim())
      .filter((value) => Boolean(value));
    if (trackingIds.length <= 0) {
      return '';
    }
    if (trackingIds.length <= 3) {
      return trackingIds.join(', ');
    }
    return `${trackingIds.slice(0, 3).join(', ')} +${trackingIds.length - 3} more`;
  }, [nextStopDeliveries]);
  const nextStopStatusSummary = useMemo(() => {
    const statuses = Array.from(new Set(
      nextStopDeliveries
        .map((delivery) => String(delivery?.status || '').trim())
        .filter((value) => Boolean(value))
    ));
    if (statuses.length <= 0) {
      return '';
    }
    return statuses.map((status) => status.replaceAll('_', ' ')).join(', ');
  }, [nextStopDeliveries]);
  const nextStopInstructions = useMemo(() => (
    Array.from(new Set(
      nextStopDeliveries
        .map((delivery) => String(delivery?.specialInstructions || '').trim())
        .filter((value) => Boolean(value))
    ))
  ), [nextStopDeliveries]);
  const nextStopInstructionText = useMemo(() => {
    if (nextStopInstructions.length <= 0) {
      return '';
    }
    if (nextStopInstructions.length <= 2) {
      return nextStopInstructions.join(' | ');
    }
    return `${nextStopInstructions.slice(0, 2).join(' | ')} | +${nextStopInstructions.length - 2} more`;
  }, [nextStopInstructions]);
  const nextStopPaymentMethodLabel = useMemo(() => {
    const methods = Array.from(new Set(
      nextStopDeliveries
        .map((delivery) => formatPaymentMethodLabel(delivery?.paymentMethod, delivery?.paymentProvider))
        .filter((value) => Boolean(value))
    ));
    if (methods.length <= 0) {
      return '';
    }
    if (methods.length === 1) {
      return methods[0];
    }
    return 'Mixed';
  }, [nextStopDeliveries]);
  const nextStopPaymentStatusLabel = useMemo(() => {
    const statuses = Array.from(new Set(
      nextStopDeliveries
        .map((delivery) => formatPaymentStatusLabel(delivery?.paymentStatus))
        .filter((value) => Boolean(value))
    ));
    if (statuses.length <= 0) {
      return '';
    }
    if (statuses.length === 1) {
      return statuses[0];
    }
    return 'Mixed';
  }, [nextStopDeliveries]);
  const nextStopPaymentTotal = useMemo(() => {
    const totals = nextStopDeliveries
      .map((delivery) => toNumberOrNull(delivery?.paymentTotal))
      .filter((value) => value !== null);
    if (totals.length <= 0) {
      return null;
    }
    return totals.reduce((sum, value) => sum + Number(value), 0);
  }, [nextStopDeliveries]);
  const nextStopCashToCollect = useMemo(() => (
    nextStopDeliveries
      .filter((delivery) => String(delivery?.paymentMethod || '').trim().toLowerCase() === 'cash')
      .map((delivery) => toNumberOrNull(delivery?.cashToCollect))
      .filter((value) => value !== null)
      .reduce((sum, value) => sum + Number(value), 0)
  ), [nextStopDeliveries]);
  const nextStopRequiresCashCollection = Boolean(
    nextStop?.stopKind === 'pickup' && nextStopCashToCollect > 0
  );
  const hasNextStopPaymentInfo = Boolean(
    nextStopPaymentMethodLabel || nextStopPaymentStatusLabel || nextStopPaymentTotal !== null
  );
  const chatCandidateDelivery = useMemo(() => {
    const fromNextStop = nextStopDeliveries.find((delivery) => (
      getCourierChatAccessMeta(courierRole, delivery?.status)?.allowed
    ));
    if (fromNextStop) {
      return fromNextStop;
    }
    for (const stop of actionableStops) {
      const bookingIds = uniqueNumericIds(stop?.bookingIds, stop?.bookingId);
      for (const bookingId of bookingIds) {
        const delivery = deliveryById.get(Number(bookingId));
        if (!delivery) {
          continue;
        }
        if (getCourierChatAccessMeta(courierRole, delivery?.status)?.allowed) {
          return delivery;
        }
      }
    }
    return (deliveries || []).find((delivery) => (
      getCourierChatAccessMeta(courierRole, delivery?.status)?.allowed
    )) || null;
  }, [actionableStops, courierRole, deliveries, deliveryById, nextStopDeliveries]);
  const chatAccessMeta = useMemo(() => (
    getCourierChatAccessMeta(courierRole, chatCandidateDelivery?.status)
  ), [chatCandidateDelivery?.status, courierRole]);
  const canUseNavigationChat = Boolean(chatCandidateDelivery?.id) && Boolean(chatAccessMeta?.allowed);
  const chatLegLabel = useMemo(() => (
    getChatLegLabel(chatLegKey || chatAccessMeta?.legKey)
  ), [chatAccessMeta?.legKey, chatLegKey]);

  const markNavigationChatSeen = useCallback((explicitMessageId = null) => {
    if (!canUseNavigationChat || !Number.isFinite(userId) || userId <= 0) {
      return;
    }
    const bookingId = Number(chatCandidateDelivery?.id);
    if (!Number.isFinite(bookingId)) {
      return;
    }
    const messageId = Number(explicitMessageId ?? chatLatestMessageId);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return;
    }
    writeSeenMessageId(
      {
        bookingId,
        userId,
        userRole: 'courier',
        legKey: chatAccessMeta?.legKey || 'general_leg'
      },
      messageId
    );
  }, [canUseNavigationChat, chatAccessMeta?.legKey, chatCandidateDelivery?.id, chatLatestMessageId, userId]);

  const handleOpenNavigationChat = useCallback(() => {
    if (!canUseNavigationChat) {
      return;
    }
    markNavigationChatSeen();
    setChatUnreadCount(0);
    setIsChatOpen(true);
  }, [canUseNavigationChat, markNavigationChatSeen]);

  const handleCloseNavigationChat = useCallback(() => {
    markNavigationChatSeen();
    setIsChatOpen(false);
  }, [markNavigationChatSeen]);

  const handleNavigationChatMessagesChange = useCallback((snapshot) => {
    const bookingId = Number(snapshot?.bookingId);
    const activeBookingId = Number(chatCandidateDelivery?.id);
    if (!Number.isFinite(bookingId) || bookingId !== activeBookingId) {
      return;
    }
    const latestMessageId = Number(snapshot?.lastMessageId);
    if (Number.isFinite(latestMessageId) && latestMessageId > 0) {
      setChatLatestMessageId(latestMessageId);
      if (isChatOpen) {
        markNavigationChatSeen(latestMessageId);
      }
    }
    if (isChatOpen) {
      setChatUnreadCount(0);
    }
  }, [chatCandidateDelivery?.id, isChatOpen, markNavigationChatSeen]);

  const handleOpenNavigationIncident = useCallback(() => {
    const bookingId = Number(nextStopDelivery?.id);
    const incidentType = String(navigationIncidentAction?.type || '').trim().toLowerCase();
    const actionContext = String(navigationIncidentAction?.actionContext || 'navigation').trim().toLowerCase();
    if (!Number.isFinite(bookingId) || bookingId <= 0 || !incidentType) {
      return;
    }
    setIncidentFlow({
      isOpen: true,
      bookingId,
      trackingId: String(nextStopDelivery?.trackingId || '').trim(),
      type: incidentType,
      actionContext: actionContext || 'navigation'
    });
    setIncidentReason('');
    setIncidentNotes('');
    setIncidentSubmitError('');
  }, [navigationIncidentAction?.actionContext, navigationIncidentAction?.type, nextStopDelivery?.id, nextStopDelivery?.trackingId]);

  const handleCloseNavigationIncident = useCallback(() => {
    setIncidentFlow({
      isOpen: false,
      bookingId: null,
      trackingId: '',
      type: '',
      actionContext: 'navigation'
    });
    setIncidentReason('');
    setIncidentNotes('');
    setIncidentSubmitError('');
    setIsIncidentSubmitting(false);
  }, []);

  const handleSubmitNavigationIncident = useCallback(async () => {
    const bookingId = Number(incidentFlow?.bookingId);
    const incidentType = String(incidentFlow?.type || '').trim().toLowerCase();
    const actionContext = String(incidentFlow?.actionContext || 'navigation').trim().toLowerCase();
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return;
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      setIncidentSubmitError('Courier session is missing. Please sign in again.');
      return;
    }
    if (!incidentReason) {
      setIncidentSubmitError('Please select a reason.');
      return;
    }
    const reasonOptions = COURIER_INCIDENT_REASONS_BY_TYPE?.[incidentType] || [];
    const reasonText = findReasonLabel(reasonOptions, incidentReason) || incidentReason;
    const body = {
      courierId: userId,
      type: incidentType,
      actionContext,
      reasonCode: incidentReason,
      reasonText,
      notes: incidentNotes
    };
    if (activeLocation) {
      body.lat = Number(activeLocation.lat);
      body.lng = Number(activeLocation.lng);
      body.locationText = `${Number(activeLocation.lat).toFixed(5)}, ${Number(activeLocation.lng).toFixed(5)}`;
    }

    setIsIncidentSubmitting(true);
    setIncidentSubmitError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/courier/bookings/${bookingId}/incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to submit request.');
      }
      const modalCopy = getCourierIncidentModalCopy(incidentType);
      const trackingLabel = incidentFlow?.trackingId
        ? `Booking ${incidentFlow.trackingId}`
        : `Booking #${bookingId}`;
      setConfirmationError('');
      setConfirmationNotice(`${trackingLabel}: ${payload?.message || modalCopy?.successMessage || 'Request submitted.'}`);
      handleCloseNavigationIncident();
      loadNavigationContext(true);
    } catch (error) {
      setIncidentSubmitError(error?.message || 'Unable to submit request right now.');
    } finally {
      setIsIncidentSubmitting(false);
    }
  }, [
    activeLocation,
    handleCloseNavigationIncident,
    incidentFlow?.actionContext,
    incidentFlow?.bookingId,
    incidentFlow?.trackingId,
    incidentFlow?.type,
    incidentNotes,
    incidentReason,
    loadNavigationContext,
    userId
  ]);

  useEffect(() => {
    if (!isGroupedDeliveryProofMode) {
      return;
    }
    setProofByDelivery((previous) => {
      const next = {};
      nextStopProofDeliveryIds.forEach((deliveryId) => {
        const existing = previous?.[deliveryId];
        next[deliveryId] = existing && typeof existing === 'object'
          ? {
              photoDataUrl: String(existing.photoDataUrl || ''),
              photoName: String(existing.photoName || ''),
              signatureDataUrl: String(existing.signatureDataUrl || ''),
              signatureName: String(existing.signatureName || ''),
              notes: String(existing.notes || '')
            }
          : createEmptyProofData();
      });
      return next;
    });
  }, [isGroupedDeliveryProofMode, nextStopProofDeliveryIds, nextStopProofDeliveryKey]);

  useEffect(() => {
    setShowProofCapture(false);
    resetProofData();
  }, [nextStop?.stopId, resetProofData]);

  useEffect(() => {
    setConfirmationError('');
    setConfirmationNotice('');
    setShowProximityOverride(false);
    setProximityOverrideReason('');
  }, [nextStop?.stopId]);

  useEffect(() => {
    setChatLegKey(chatAccessMeta?.legKey || '');
  }, [chatAccessMeta?.legKey, chatCandidateDelivery?.id]);

  useEffect(() => {
    if (!incidentFlow?.isOpen) {
      return;
    }
    if (!navigationIncidentAction || Number(nextStopDelivery?.id) !== Number(incidentFlow?.bookingId)) {
      handleCloseNavigationIncident();
    }
  }, [
    handleCloseNavigationIncident,
    incidentFlow?.bookingId,
    incidentFlow?.isOpen,
    navigationIncidentAction,
    nextStopDelivery?.id
  ]);

  useEffect(() => {
    if (!canUseNavigationChat) {
      setIsChatOpen(false);
      setChatUnreadCount(0);
      setChatLatestMessageId(0);
    }
  }, [canUseNavigationChat]);

  useEffect(() => {
    if (!canUseNavigationChat || !Number.isFinite(userId) || userId <= 0) {
      setChatUnreadCount(0);
      setChatLatestMessageId(0);
      return;
    }
    let isCancelled = false;
    const bookingId = Number(chatCandidateDelivery?.id);
    const legKey = chatAccessMeta?.legKey || 'general_leg';
    if (!Number.isFinite(bookingId)) {
      setChatUnreadCount(0);
      setChatLatestMessageId(0);
      return;
    }

    const pollUnread = async () => {
      try {
        const params = new URLSearchParams({
          bookingId: String(bookingId),
          userId: String(userId),
          role: 'courier',
          afterId: '0',
          limit: '200'
        });
        const response = await fetch(`${API_BASE_URL}/api/messages?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok || isCancelled) {
          return;
        }
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];
        const latestMessageId = messages.length > 0
          ? Number(messages[messages.length - 1]?.id) || 0
          : 0;
        if (!isCancelled) {
          setChatLatestMessageId(latestMessageId);
        }
        if (isChatOpen) {
          markNavigationChatSeen(latestMessageId);
          if (!isCancelled) {
            setChatUnreadCount(0);
          }
          return;
        }
        const lastSeenMessageId = readSeenMessageId({
          bookingId,
          userId,
          userRole: 'courier',
          legKey
        });
        const unreadCount = countUnreadIncomingMessages({
          messages,
          currentUserId: userId,
          lastSeenMessageId
        });
        if (!isCancelled) {
          setChatUnreadCount(unreadCount);
        }
      } catch (error) {
        if (!isCancelled) {
          setChatUnreadCount(0);
        }
      }
    };

    pollUnread();
    const intervalId = window.setInterval(pollUnread, 5000);
    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canUseNavigationChat, chatAccessMeta?.legKey, chatCandidateDelivery?.id, isChatOpen, markNavigationChatSeen, userId]);

  const patchBookingStatus = useCallback(async (deliveryId, status, descriptionText = '') => {
    const body = {
      courierId: Number(userId),
      status
    };
    if (activeLocation) {
      body.lat = Number(activeLocation.lat);
      body.lng = Number(activeLocation.lng);
      body.locationText = `${Number(activeLocation.lat).toFixed(5)}, ${Number(activeLocation.lng).toFixed(5)}`;
    }
    if (descriptionText) {
      body.description = descriptionText;
    }

    const response = await fetch(`${API_BASE_URL}/api/courier/bookings/${deliveryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to update parcel status');
    }

    const appliedStatus = payload?.booking?.status || status;
    const paymentMethodCode = String(payload?.payment?.method || '').trim().toLowerCase();
    const paymentStatusCode = String(payload?.payment?.status || '').trim().toLowerCase();
    const paymentTotalValue = Number(payload?.payment?.total);
    const paymentCollectedAt = String(payload?.payment?.collectedAt || '').trim();
    setDeliveries((previous) => (
      (previous || []).map((delivery) => (
        Number(delivery?.id) === Number(deliveryId)
          ? (() => {
              const currentMethod = String(delivery?.paymentMethod || '').trim().toLowerCase();
              const nextMethod = paymentMethodCode || currentMethod;
              const currentPaymentStatus = String(delivery?.paymentStatus || '').trim().toLowerCase();
              const nextPaymentStatus = paymentStatusCode || currentPaymentStatus;
              const shouldZeroCashToCollect = nextMethod === 'cash' && nextPaymentStatus === 'paid';
              return {
                ...delivery,
                status: appliedStatus,
                ...(paymentMethodCode ? { paymentMethod: paymentMethodCode } : {}),
                ...(paymentStatusCode ? { paymentStatus: paymentStatusCode } : {}),
                ...(Number.isFinite(paymentTotalValue) ? { paymentTotal: paymentTotalValue } : {}),
                ...(paymentCollectedAt ? { paymentCollectedAt } : {}),
                ...(shouldZeroCashToCollect ? { cashToCollect: 0 } : {})
              };
            })()
          : delivery
      ))
    ));

    return appliedStatus;
  }, [activeLocation, userId]);

  const confirmDeliveryLoad = useCallback(async (deliveryId, descriptionText = '') => {
    const response = await fetch(`${API_BASE_URL}/api/orders/${deliveryId}/delivery/confirm-load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courierId: Number(userId),
        description: descriptionText || 'Delivery load confirmed from trip navigation'
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to confirm delivery load');
    }
    const appliedStatus = payload?.booking?.status || 'delivery_load_confirmed';
    setDeliveries((previous) => (
      (previous || []).map((delivery) => (
        Number(delivery?.id) === Number(deliveryId)
          ? { ...delivery, status: appliedStatus }
          : delivery
      ))
    ));
    return appliedStatus;
  }, [userId]);

  const confirmLinehaulLoad = useCallback(async (deliveryId, descriptionText = '') => {
    const response = await fetch(`${API_BASE_URL}/api/orders/${deliveryId}/linehaul/confirm-load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courierId: Number(userId),
        description: descriptionText || 'Linehaul load confirmed from trip navigation'
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to confirm linehaul load');
    }
    const appliedStatus = payload?.booking?.status || 'linehaul_load_confirmed';
    setDeliveries((previous) => (
      (previous || []).map((delivery) => (
        Number(delivery?.id) === Number(deliveryId)
          ? { ...delivery, status: appliedStatus }
          : delivery
      ))
    ));
    return appliedStatus;
  }, [userId]);

  const confirmDestinationBranchHandover = useCallback(async (deliveryId, descriptionText = '') => {
    const response = await fetch(`${API_BASE_URL}/api/orders/${deliveryId}/branch/confirm-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: 'destination',
        actorType: 'courier',
        actorId: Number(userId),
        description: descriptionText || 'Destination branch handover confirmed from trip navigation'
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to confirm destination branch handover');
    }
    const appliedStatus = payload?.booking?.status || 'received_at_destination_branch';
    setDeliveries((previous) => (
      (previous || []).map((delivery) => (
        Number(delivery?.id) === Number(deliveryId)
          ? { ...delivery, status: appliedStatus }
          : delivery
      ))
    ));
    return appliedStatus;
  }, [userId]);

  useEffect(() => {
    const startedLegIndex = Number(lastStartedLeg?.legIndex);
    if (!Number.isFinite(startedLegIndex) || startedLegIndex < 0) {
      return;
    }

    const destinationStop = routeStops.find((stop) => (
      Number.isFinite(stop?.index) && Number(stop.index) === startedLegIndex + 1
    ));
    if (!destinationStop || destinationStop.stopKind !== 'delivery') {
      return;
    }

    const stopDeliveryIds = uniqueNumericIds(destinationStop.bookingIds, destinationStop.bookingId);
    if (stopDeliveryIds.length <= 0) {
      return;
    }

    const pendingIds = stopDeliveryIds.filter((deliveryId) => {
      if (!Number.isFinite(deliveryId) || autoOutForDeliveryRef.current.has(deliveryId)) {
        return false;
      }
      const delivery = deliveryById.get(Number(deliveryId));
      const status = String(delivery?.status || '').trim().toLowerCase();
      if (status !== 'delivery_load_confirmed') {
        if (status) {
          autoOutForDeliveryRef.current.add(deliveryId);
        }
        return false;
      }
      return true;
    });
    if (pendingIds.length <= 0) {
      return;
    }

    pendingIds.forEach((deliveryId) => autoOutForDeliveryRef.current.add(deliveryId));

    Promise.allSettled(
      pendingIds.map((deliveryId) => {
        const delivery = deliveryById.get(Number(deliveryId));
        const trackingCode = String(delivery?.trackingId || '').trim();
        const description = destinationStop.label
          ? `${trackingCode ? `${trackingCode} | ` : ''}${destinationStop.label}: out_for_delivery`
          : `${trackingCode ? `${trackingCode} | ` : ''}Delivery navigation started: out_for_delivery`;
        return patchBookingStatus(deliveryId, 'out_for_delivery', description);
      })
    )
      .then((results) => {
        let successCount = 0;
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successCount += 1;
            return;
          }
          autoOutForDeliveryRef.current.delete(pendingIds[index]);
        });
        if (successCount > 0) {
          setConfirmationError('');
          setConfirmationNotice(
            successCount === 1
              ? 'Delivery route started. Parcel marked as out for delivery.'
              : `Delivery route started. Marked ${successCount} parcels as out for delivery.`
          );
        }
      });
  }, [deliveryById, lastStartedLeg, patchBookingStatus, routeStops]);

  useEffect(() => {
    const startedLegIndex = Number(lastStartedLeg?.legIndex);
    if (!Number.isFinite(startedLegIndex) || startedLegIndex < 0) {
      return;
    }

    const destinationStop = routeStops.find((stop) => (
      Number.isFinite(stop?.index) && Number(stop.index) === startedLegIndex + 1
    ));
    if (!destinationStop || destinationStop.stopKind !== 'delivery') {
      return;
    }

    const stopDeliveryIds = uniqueNumericIds(destinationStop.bookingIds, destinationStop.bookingId);
    if (stopDeliveryIds.length <= 0) {
      return;
    }

    const pendingIds = stopDeliveryIds.filter((deliveryId) => {
      if (!Number.isFinite(deliveryId) || autoLinehaulTransitRef.current.has(deliveryId)) {
        return false;
      }
      const delivery = deliveryById.get(Number(deliveryId));
      const status = String(delivery?.status || '').trim().toLowerCase();
      if (status !== 'linehaul_load_confirmed') {
        if (status) {
          autoLinehaulTransitRef.current.add(deliveryId);
        }
        return false;
      }
      return true;
    });
    if (pendingIds.length <= 0) {
      return;
    }

    pendingIds.forEach((deliveryId) => autoLinehaulTransitRef.current.add(deliveryId));

    Promise.allSettled(
      pendingIds.map((deliveryId) => {
        const delivery = deliveryById.get(Number(deliveryId));
        const trackingCode = String(delivery?.trackingId || '').trim();
        const description = destinationStop.label
          ? `${trackingCode ? `${trackingCode} | ` : ''}${destinationStop.label}: linehaul_in_transit`
          : `${trackingCode ? `${trackingCode} | ` : ''}Linehaul navigation started: linehaul_in_transit`;
        return patchBookingStatus(deliveryId, 'linehaul_in_transit', description);
      })
    )
      .then((results) => {
        let successCount = 0;
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successCount += 1;
            return;
          }
          autoLinehaulTransitRef.current.delete(pendingIds[index]);
        });
        if (successCount > 0) {
          setConfirmationError('');
          setConfirmationNotice(
            successCount === 1
              ? 'Linehaul route started. Parcel marked as in transit.'
              : `Linehaul route started. Marked ${successCount} parcels as in transit.`
          );
        }
      });
  }, [deliveryById, lastStartedLeg, patchBookingStatus, routeStops]);

  const uploadProof = useCallback(async (deliveryId, proof) => {
    if (!proof) {
      return;
    }
    const hasProofPayload = Boolean(proof?.notes?.trim() || proof?.photoDataUrl || proof?.signatureDataUrl);
    if (!hasProofPayload) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/courier/bookings/${deliveryId}/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courierId: Number(userId),
        notes: proof?.notes || '',
        photoDataUrl: proof?.photoDataUrl || null,
        signatureDataUrl: proof?.signatureDataUrl || null
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save proof');
    }
  }, [userId]);

  const resolveSequenceStepStatuses = useCallback((step) => {
    const normalizedStep = String(step || '').trim().toLowerCase();
    if (!normalizedStep) {
      return [];
    }
    if (normalizedStep === STEP_CONFIRM_DELIVERY_LOAD) {
      return ['delivery_load_confirmed'];
    }
    if (normalizedStep === STEP_CONFIRM_LINEHAUL_LOAD) {
      return ['linehaul_load_confirmed'];
    }
    if (normalizedStep === STEP_CONFIRM_DESTINATION_HANDOVER) {
      return ['received_at_destination_branch', 'delivery_assigned', 'waiting_for_reattempt'];
    }
    return [normalizedStep];
  }, []);

  const applyStatusSequence = useCallback(async (deliveryId, sequence, descriptionPrefix) => {
    if (!Array.isArray(sequence) || sequence.length === 0) {
      return null;
    }
    const normalizedSequence = sequence
      .map((step) => String(step || '').trim().toLowerCase())
      .filter((step) => Boolean(step));
    if (normalizedSequence.length <= 0) {
      return null;
    }
    const finalAcceptedStatuses = new Set(
      resolveSequenceStepStatuses(normalizedSequence[normalizedSequence.length - 1])
    );

    let finalStatus = '';
    for (let index = 0; index < normalizedSequence.length; index += 1) {
      const requestedStatus = normalizedSequence[index];
      const description = descriptionPrefix ? `${descriptionPrefix}: ${requestedStatus}` : '';
      let appliedStatus = null;
      if (requestedStatus === STEP_CONFIRM_DELIVERY_LOAD) {
        appliedStatus = await confirmDeliveryLoad(deliveryId, description);
      } else if (requestedStatus === STEP_CONFIRM_LINEHAUL_LOAD) {
        appliedStatus = await confirmLinehaulLoad(deliveryId, description);
      } else if (requestedStatus === STEP_CONFIRM_DESTINATION_HANDOVER) {
        appliedStatus = await confirmDestinationBranchHandover(deliveryId, description);
      } else {
        appliedStatus = await patchBookingStatus(deliveryId, requestedStatus, description);
      }
      const normalizedAppliedStatus = String(appliedStatus || '').trim().toLowerCase();
      finalStatus = normalizedAppliedStatus;
      const acceptedStatusesForStep = new Set(resolveSequenceStepStatuses(requestedStatus));
      if (acceptedStatusesForStep.has(normalizedAppliedStatus)) {
        continue;
      }
      if (finalAcceptedStatuses.has(normalizedAppliedStatus)) {
        // Backend progressed beyond this step; stop early as final target is already reached.
        break;
      }
      const expectedLabel = Array.from(acceptedStatusesForStep).join(' / ') || requestedStatus;
      const actualLabel = normalizedAppliedStatus || 'unknown';
      throw new Error(`Status mismatch: expected ${expectedLabel}, got ${actualLabel}.`);
    }
    if (!finalStatus) {
      throw new Error('Status update did not return an applied state.');
    }
    if (!finalAcceptedStatuses.has(finalStatus)) {
      const finalExpected = Array.from(finalAcceptedStatuses).join(' / ') || 'final target status';
      throw new Error(`Status mismatch: expected final ${finalExpected}, got ${finalStatus}.`);
    }
    return finalStatus;
  }, [confirmDeliveryLoad, confirmDestinationBranchHandover, confirmLinehaulLoad, patchBookingStatus, resolveSequenceStepStatuses]);

  const executeStopConfirmation = useCallback(async (stop, proofOverride = null, { overrideProximity = false, overrideReason = '' } = {}) => {
    if (!stop || !stop.action) {
      return;
    }
    if (!stop.isWithinProximity && !overrideProximity) {
      setConfirmationError(`Move within ${stop?.requiredProximityMeters || PROXIMITY_REQUIRED_METERS}m to confirm this stop.`);
      return;
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      setConfirmationError('Courier session is missing. Please sign in again.');
      return;
    }

    setIsConfirming(true);
    setConfirmationError('');
    setConfirmationNotice('');
    const requiresRouteRefreshAfterConfirmation = actionIncludesLoadConfirmation(stop.action);
    try {
      if (stop.action.type === 'single') {
        if (stop.action.requiresProof) {
          await uploadProof(stop.action.deliveryId, proofOverride);
        }
        const descriptionSuffix = overrideProximity && overrideReason ? ` [Proximity override: ${overrideReason}]` : '';
        await applyStatusSequence(stop.action.deliveryId, stop.action.sequence, `${stop.label || 'Navigation confirmation'}${descriptionSuffix}`);
        setConfirmationNotice('Stop confirmed successfully.');
      } else {
        let successCount = 0;
        let firstError = '';
        for (const update of stop.action.updates) {
          try {
            if (update?.requiresProof) {
              const groupedProof = proofOverride && typeof proofOverride === 'object'
                ? proofOverride.perDelivery
                : null;
              const proofPayload = groupedProof && typeof groupedProof === 'object'
                ? groupedProof[update.deliveryId]
                : proofOverride;
              await uploadProof(update.deliveryId, proofPayload);
            }
            const batchDescSuffix = overrideProximity && overrideReason ? ` [Proximity override: ${overrideReason}]` : '';
            await applyStatusSequence(
              update.deliveryId,
              update.sequence,
              `${stop.label || (stop.action.batchKind === 'branch' ? 'Branch confirmation' : 'Navigation confirmation')}${batchDescSuffix}`
            );
            successCount += 1;
          } catch (error) {
            if (!firstError) {
              firstError = error?.message || 'Confirmation failed for some parcels.';
            }
          }
        }
        if (successCount <= 0) {
          throw new Error(firstError || 'No parcel was updated at this stop.');
        }
        const successMessage = stop.action.batchKind === 'branch'
          ? `Updated ${successCount} parcel(s) at branch.`
          : `Updated ${successCount} parcel(s) at this stop.`;
        setConfirmationNotice(
          firstError
            ? `Updated ${successCount} parcel(s). Some updates still need retry.`
            : successMessage
        );
      }

      setConfirmedStops((previous) => {
        const next = new Set(previous);
        next.add(stop.stopId);
        return next;
      });
      if (requiresRouteRefreshAfterConfirmation) {
        setShowProofCapture(false);
        resetProofData();
        clearNavigationPayload();
        navigate('/courier-dashboard#route');
        return;
      }
      postToDriver({ type: 'courier-nav/advance-leg' });
      setShowProofCapture(false);
      setShowProximityOverride(false);
      setProximityOverrideReason('');
      resetProofData();
      loadNavigationContext(true);
    } catch (error) {
      setConfirmationError(error?.message || 'Unable to confirm this stop.');
    } finally {
      setIsConfirming(false);
    }
  }, [applyStatusSequence, clearNavigationPayload, loadNavigationContext, navigate, postToDriver, resetProofData, uploadProof, userId]);

  const handleProofImageChange = useCallback(async (field, file) => {
    if (!file) {
      setProofData((previous) => ({
        ...previous,
        [`${field}DataUrl`]: '',
        [`${field}Name`]: ''
      }));
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setProofData((previous) => ({
        ...previous,
        [`${field}DataUrl`]: dataUrl,
        [`${field}Name`]: file.name
      }));
    } catch (error) {
      setConfirmationError('Unable to read selected proof file.');
    }
  }, []);

  const updateProofForDelivery = useCallback((deliveryId, updater) => {
    const numericDeliveryId = Number(deliveryId);
    if (!Number.isFinite(numericDeliveryId)) {
      return;
    }
    setProofByDelivery((previous) => {
      const current = previous?.[numericDeliveryId] && typeof previous[numericDeliveryId] === 'object'
        ? previous[numericDeliveryId]
        : createEmptyProofData();
      const nextProof = updater(current);
      return {
        ...(previous || {}),
        [numericDeliveryId]: nextProof
      };
    });
  }, []);

  const handleProofImageChangeForDelivery = useCallback(async (deliveryId, field, file) => {
    if (!file) {
      updateProofForDelivery(deliveryId, (current) => ({
        ...current,
        [`${field}DataUrl`]: '',
        [`${field}Name`]: ''
      }));
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      updateProofForDelivery(deliveryId, (current) => ({
        ...current,
        [`${field}DataUrl`]: dataUrl,
        [`${field}Name`]: file.name
      }));
    } catch (error) {
      setConfirmationError('Unable to read selected proof file.');
    }
  }, [updateProofForDelivery]);

  const handleProofNotesChangeForDelivery = useCallback((deliveryId, notes) => {
    updateProofForDelivery(deliveryId, (current) => ({
      ...current,
      notes
    }));
  }, [updateProofForDelivery]);

  const handlePrimaryConfirmation = useCallback((opts = {}) => {
    if (!nextStop || !nextStop.action) {
      return;
    }
    const { overrideProximity = false, overrideReason = '' } = opts;
    if (!nextStop.isWithinProximity && !overrideProximity) {
      setConfirmationError(`Move within ${nextStop?.requiredProximityMeters || PROXIMITY_REQUIRED_METERS}m to confirm this stop.`);
      return;
    }
    if (nextStop.action.requiresProof) {
      setShowProofCapture(true);
      return;
    }
    executeStopConfirmation(nextStop, null, { overrideProximity, overrideReason });
  }, [executeStopConfirmation, nextStop]);

  const handleProofSubmit = useCallback(() => {
    if (!nextStop || !nextStop.action?.requiresProof) {
      return;
    }
    if (isGroupedDeliveryProofMode) {
      const missingProofDeliveryIds = nextStopProofDeliveryIds.filter((deliveryId) => {
        const proof = proofByDelivery?.[deliveryId];
        return !(proof?.photoDataUrl || proof?.signatureDataUrl);
      });
      if (missingProofDeliveryIds.length > 0) {
        const firstMissing = nextStopDeliveriesById.get(Number(missingProofDeliveryIds[0]));
        const firstTrackingId = String(firstMissing?.trackingId || '').trim();
        setConfirmationError(
          firstTrackingId
            ? `Add photo or signature proof for ${firstTrackingId} and all remaining parcels.`
            : 'Add photo or signature proof for each parcel before confirming delivery.'
        );
        return;
      }
      executeStopConfirmation(nextStop, { perDelivery: proofByDelivery });
      return;
    }
    const hasImageProof = Boolean(proofData?.photoDataUrl || proofData?.signatureDataUrl);
    if (!hasImageProof) {
      setConfirmationError('Add photo proof or signature image before confirming delivery.');
      return;
    }
    executeStopConfirmation(nextStop, proofData);
  }, [
    executeStopConfirmation,
    isGroupedDeliveryProofMode,
    nextStop,
    nextStopDeliveriesById,
    nextStopProofDeliveryIds,
    proofByDelivery,
    proofData
  ]);

  const stopKindLabel = nextStop?.stopKind === 'pickup'
    ? 'Pickup stop'
    : nextStop?.stopKind === 'delivery'
      ? 'Delivery stop'
      : nextStop?.stopKind === 'branch'
        ? 'Branch stop'
        : 'Route stop';
  const checkpointGuidanceText = useMemo(() => {
    const role = normalizedRoleValue(courierRole);
    if (role === 'delivery') {
      return `Confirmation unlocks within ${PROXIMITY_REQUIRED_METERS}m (delivery fallback unlocks on the active delivery leg within ${DELIVERY_FALLBACK_PROXIMITY_METERS}m, or when the route leg is reached).`;
    }
    if (role === 'linehaul') {
      return `Confirmation unlocks within ${PROXIMITY_REQUIRED_METERS}m (linehaul handover fallback unlocks at last reached route leg; guidance radius ${DELIVERY_FALLBACK_PROXIMITY_METERS}m).`;
    }
    if (role === 'both') {
      return `Confirmation unlocks within ${PROXIMITY_REQUIRED_METERS}m (delivery fallback unlocks on active delivery leg within ${DELIVERY_FALLBACK_PROXIMITY_METERS}m; linehaul destination fallback unlocks at route leg reach).`;
    }
    return `Confirmation unlocks within ${PROXIMITY_REQUIRED_METERS}m.`;
  }, [courierRole]);
  const roleDisplayLabel = useMemo(() => {
    const role = normalizedRoleValue(courierRole);
    if (role === 'both') {
      return 'Pickup + Linehaul + Delivery';
    }
    return formatCodeLabel(role);
  }, [courierRole]);
  const totalActionableStops = actionableStops.length;
  const completedStopCount = useMemo(() => (
    actionableStops.reduce((count, stop) => (confirmedStops.has(stop.stopId) ? count + 1 : count), 0)
  ), [actionableStops, confirmedStops]);
  const remainingStopCount = Math.max(totalActionableStops - completedStopCount, 0);
  const completionPercent = totalActionableStops > 0
    ? Math.round((completedStopCount / totalActionableStops) * 100)
    : 0;
  const upcomingStops = useMemo(() => (
    actionableStops.filter((stop) => !confirmedStops.has(stop.stopId)).slice(0, 4)
  ), [actionableStops, confirmedStops]);
  const routeParcelCount = useMemo(() => {
    const role = normalizedRoleValue(courierRole);
    const allowedStatuses = ACTIVE_COUNT_STATUSES_BY_ROLE[role] || ACTIVE_COUNT_STATUSES_BY_ROLE.both;
    const hasRouteBookings = routeBookingIds.size > 0;
    const activeBookingIds = new Set();
    (deliveries || []).forEach((delivery) => {
      const bookingId = Number(delivery?.id);
      if (!Number.isFinite(bookingId)) {
        return;
      }
      if (hasRouteBookings && !routeBookingIds.has(bookingId)) {
        return;
      }
      const status = String(delivery?.status || '').trim().toLowerCase();
      if (!allowedStatuses.has(status)) {
        return;
      }
      activeBookingIds.add(bookingId);
    });
    if (activeBookingIds.size > 0) {
      return activeBookingIds.size;
    }
    return hasRouteBookings ? 0 : deliveries.length;
  }, [courierRole, deliveries, routeBookingIds]);
  const proximityStatusLabel = nextStop
    ? (nextStop.isWithinProximity ? 'Ready to confirm' : 'Move closer')
    : 'No active checkpoint';

  useEffect(() => {
    if (!navPayload) {
      return;
    }
    if (totalActionableStops > 0 && remainingStopCount <= 0) {
      clearNavigationPayload();
      setConfirmationError('');
      setConfirmationNotice('All checkpoints are complete. Open Route for the next assignment.');
    }
  }, [clearNavigationPayload, navPayload, remainingStopCount, totalActionableStops]);

  useEffect(() => {
    if (!navPayload || isLoadingData || !isDashboardSnapshotFresh) {
      return;
    }
    if (routeBookingIds.size <= 0) {
      return;
    }
    if (actionableStops.length > 0) {
      return;
    }
    clearNavigationPayload();
    setConfirmationError('');
    setConfirmationNotice('Route completed or outdated. Open Route to refresh checkpoints.');
  }, [
    actionableStops.length,
    clearNavigationPayload,
    isDashboardSnapshotFresh,
    isLoadingData,
    navPayload,
    routeBookingIds.size
  ]);

  return (
    <>
      <Helmet>
        <title>Courier Navigation - CourierFlow</title>
        <meta
          name="description"
          content="Turn-by-turn courier navigation view"
        />
      </Helmet>
      <div className="relative min-h-screen overflow-x-hidden bg-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top_right,rgba(30,64,175,0.16),transparent_65%),radial-gradient(circle_at_top_left,rgba(5,150,105,0.11),transparent_58%)]"
        />
        <header className="sticky top-0 z-20 border-b border-border/80 bg-card/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1460px] flex-wrap items-start justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Icon name="Navigation" size={18} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Courier Operations</p>
                <h1 className="text-lg font-semibold text-foreground md:text-xl">Courier Navigation</h1>
                <p className="text-xs text-muted-foreground">Live route map, checkpoint controls, and proof capture.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  nextStop?.isWithinProximity
                    ? 'border-success/30 bg-success/10 text-success'
                    : 'border-warning/30 bg-warning/10 text-warning'
                }`}
              >
                <Icon name={nextStop?.isWithinProximity ? 'CheckCircle2' : 'AlertTriangle'} size={13} />
                {proximityStatusLabel}
              </span>
              <Link
                to={{ pathname: '/courier-dashboard', hash: '#route' }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
              >
                <Icon name="ArrowLeft" size={16} />
                Back to Route
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1460px] px-4 py-4 md:px-6 md:py-5">
          <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border/90 bg-card/90 p-3 shadow-elevation-sm backdrop-blur">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Active Role</p>
                <Icon name="BadgeCheck" size={14} className="text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">{roleDisplayLabel}</p>
            </div>
            <div className="rounded-xl border border-border/90 bg-card/90 p-3 shadow-elevation-sm backdrop-blur">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Parcels On Route</p>
                <Icon name="Package" size={14} className="text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">{routeParcelCount}</p>
            </div>
            <div className="rounded-xl border border-border/90 bg-card/90 p-3 shadow-elevation-sm backdrop-blur">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Checkpoints Pending</p>
                <Icon name="MapPin" size={14} className="text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">{remainingStopCount}</p>
            </div>
            <div className="rounded-xl border border-border/90 bg-card/90 p-3 shadow-elevation-sm backdrop-blur">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Route Progress</p>
                <Icon name="Route" size={14} className="text-primary" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{completionPercent}%</p>
                <p className="text-[11px] text-muted-foreground">{completedStopCount}/{totalActionableStops || 0}</p>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-smooth" style={{ width: `${completionPercent}%` }} />
              </div>
            </div>
          </section>

          <section className="mb-4 rounded-xl border border-border/80 bg-card/90 p-3 shadow-elevation-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Compact View</p>
                <p className="text-xs text-muted-foreground">Open extra panels only when needed.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={isUpcomingExpanded ? 'default' : 'outline'}
                  size="sm"
                  iconName={isUpcomingExpanded ? 'ChevronUp' : 'ChevronDown'}
                  iconPosition="left"
                  onClick={() => setIsUpcomingExpanded((previous) => !previous)}
                >
                  Upcoming Stops
                </Button>
                <Button
                  variant={isCheckpointDetailsExpanded ? 'default' : 'outline'}
                  size="sm"
                  iconName={isCheckpointDetailsExpanded ? 'ChevronUp' : 'ChevronDown'}
                  iconPosition="left"
                  onClick={() => setIsCheckpointDetailsExpanded((previous) => !previous)}
                >
                  Checkpoint Details
                </Button>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2.15fr)_minmax(340px,0.95fr)]">
            <section className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevation-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Live Navigation</p>
                    <h2 className="text-base font-semibold text-foreground">Turn-by-turn route map</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-medium ${
                        useGpsTracking
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      <Icon name={useGpsTracking ? 'Satellite' : 'Route'} size={12} />
                      {useGpsTracking ? 'GPS Mode' : 'Simulation Mode'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
                      <Icon name="Crosshair" size={12} />
                      {activeLocationSource}
                    </span>
                  </div>
                </div>
                <div className="relative bg-background/40">
                  <div className="block h-[64vh] min-h-[420px] w-full sm:min-h-[520px] xl:h-[calc(100vh-9.6rem)] xl:min-h-[700px]">
                    <CourierNavigation
                      ref={reactNavigationRef}
                      navPayload={navPayload}
                      useGpsTracking={useGpsTracking}
                      gpsLocation={gpsLocation}
                      onDriverMessage={handleDriverMessage}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-elevation-md">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Next Checkpoints</p>
                    <h3 className="text-base font-semibold text-foreground">Upcoming route actions</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-muted-foreground">{remainingStopCount} remaining</p>
                    <button
                      type="button"
                      onClick={() => setIsUpcomingExpanded((previous) => !previous)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
                    >
                      <Icon name={isUpcomingExpanded ? 'ChevronUp' : 'ChevronDown'} size={12} />
                      {isUpcomingExpanded ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {!isUpcomingExpanded ? (
                  <p className="text-sm text-muted-foreground">
                    Panel hidden. Open this section to view next route checkpoints.
                  </p>
                ) : upcomingStops.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingStops.map((stop, index) => {
                      const stopTypeLabel = formatCodeLabel(stop.stopKind) || 'Route Stop';
                      return (
                        <div
                          key={stop.stopId}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-smooth ${
                            index === 0
                              ? 'border-primary/35 bg-primary/[0.05]'
                              : 'border-border bg-muted/20'
                          }`}
                        >
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{stop.label || 'Route stop'}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {stopTypeLabel} | {formatDistance(stop.distanceMeters)} | {stop.action?.label || 'Pending action'}
                            </p>
                          </div>
                          <div className="pt-0.5">
                            {stop.isWithinProximity ? (
                              <p className="text-[11px] font-semibold text-success">In range</p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                {stop.requiredProximityMeters || PROXIMITY_REQUIRED_METERS}m radius
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No pending checkpoints on this route.
                  </p>
                )}
              </div>
            </section>

            <aside className="rounded-2xl border border-border bg-card p-4 shadow-elevation-lg xl:sticky xl:top-[5.25rem] xl:max-h-[calc(100vh-6.25rem)] xl:overflow-y-auto">
              <div className="mb-4 border-b border-border pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Confirm Actions</p>
                <h2 className="text-lg font-semibold text-foreground">Navigation Checkpoint</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {checkpointGuidanceText}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/[0.2] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Current Checkpoint</p>
                    <p className="text-sm font-semibold text-foreground">
                      {nextStop?.label || 'No active checkpoint'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCheckpointDetailsExpanded((previous) => !previous)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
                  >
                    <Icon name={isCheckpointDetailsExpanded ? 'ChevronUp' : 'ChevronDown'} size={12} />
                    {isCheckpointDetailsExpanded ? 'Hide details' : 'Show details'}
                  </button>
                </div>
                {nextStop ? (
                  <>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDistance(nextStopDistanceMeters)} away | radius {nextStop.requiredProximityMeters || PROXIMITY_REQUIRED_METERS}m
                    </p>
                    {nextStopBranchSummary ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {nextStopBranchSummary.prefix}: {nextStopBranchSummary.title}
                        {nextStopBranchSummary.address ? ` | ${nextStopBranchSummary.address}` : ''}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">Waiting for route context...</p>
                )}
              </div>

              {isCheckpointDetailsExpanded ? (
                <>
                  <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-lg border border-border bg-muted/25 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-[0.08em]">Role</p>
                        <Icon name="ShieldCheck" size={14} className="text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">{roleDisplayLabel}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-[0.08em]">GPS Mode</p>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={useGpsTracking}
                          onClick={() => setUseGpsTracking((previous) => !previous)}
                          className={`inline-flex h-7 w-12 items-center rounded-full border p-0.5 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            useGpsTracking
                              ? 'border-primary bg-primary'
                              : 'border-border bg-background'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-full shadow-sm transition-transform ${
                              useGpsTracking ? 'translate-x-5 bg-white' : 'translate-x-0.5 bg-card'
                            }`}
                          />
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {useGpsTracking
                          ? 'GPS ON: using phone GPS and map marker sync.'
                          : 'GPS OFF: using simulated movement from the route map.'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 p-3 sm:col-span-2 xl:col-span-1">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-[0.08em]">Live Location</p>
                        <Icon name="Crosshair" size={14} className="text-primary" />
                      </div>
                      <p className="data-text text-xs font-medium text-foreground">
                        {activeLocation
                          ? `${activeLocation.lat.toFixed(5)}, ${activeLocation.lng.toFixed(5)}`
                          : 'Waiting for location...'}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{activeLocationSource}</p>
                      {locationError ? (
                        <p className="mt-1 text-[11px] text-destructive">{locationError}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-muted/[0.2] p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Next Stop</p>
                    {isLoadingData ? (
                      <p className="mt-2 text-sm text-muted-foreground">Loading route context...</p>
                    ) : nextStop ? (
                      <div className="mt-2 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{nextStop.label || 'Route stop'}</p>
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                            {stopKindLabel}
                          </span>
                        </div>
                        {nextStopBranchSummary ? (
                          <div className="rounded-md border border-primary/20 bg-primary/[0.07] px-2.5 py-2 text-xs text-foreground">
                            <p>
                              {nextStopBranchSummary.prefix}: <span className="font-semibold">{nextStopBranchSummary.title}</span>
                            </p>
                            {nextStopBranchSummary.address ? (
                              <p className="mt-1 text-muted-foreground">{nextStopBranchSummary.address}</p>
                            ) : null}
                          </div>
                        ) : null}

                        {nextStopDeliveryCount > 0 ? (
                          <div className="rounded-md border border-border bg-background/80 px-2.5 py-2 text-xs text-muted-foreground">
                            {hasMultipleStopParcels ? (
                              <p>
                                {nextStopDeliveryCount} parcels | {nextStopStatusSummary || 'status pending'}
                                {nextStopTrackingSummary ? ` | ${nextStopTrackingSummary}` : ''}
                              </p>
                            ) : (
                              <p>
                                {nextStopDelivery?.trackingId} | {String(nextStopDelivery?.status || '').replaceAll('_', ' ')}
                              </p>
                            )}
                          </div>
                        ) : null}

                        {nextStopInstructionText ? (
                          <div className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs text-warning">
                            Instructions: {nextStopInstructionText}
                          </div>
                        ) : null}

                        {hasNextStopPaymentInfo ? (
                          <div className="rounded-md border border-primary/20 bg-primary/[0.07] px-2.5 py-2 text-xs">
                            <p className="text-foreground">
                              Payment: <span className="font-semibold">{nextStopPaymentMethodLabel || 'Not provided'}</span>
                            </p>
                            <p className="mt-1 text-foreground">
                              Amount: <span className="font-semibold">{formatRsAmount(nextStopPaymentTotal)}</span>
                            </p>
                            <p className="mt-1 text-foreground">
                              Status: <span className="font-semibold">{nextStopPaymentStatusLabel || 'Unknown'}</span>
                            </p>
                            {hasMultipleStopParcels ? (
                              <p className="mt-1 text-muted-foreground">Across {nextStopDeliveryCount} parcels at this stop.</p>
                            ) : null}
                            {nextStopRequiresCashCollection ? (
                              <p className="mt-1 text-warning">
                                Collect {formatRsAmount(nextStopCashToCollect)} from sender before confirming.
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                          <p className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                            Distance: <span className="font-semibold text-foreground">{formatDistance(nextStopDistanceMeters)}</span>
                          </p>
                          <p className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
                            Required radius: <span className="font-semibold text-foreground">{nextStop.requiredProximityMeters || PROXIMITY_REQUIRED_METERS}m</span>
                            {nextStop.usesRouteFallback ? ' (route-end fallback active)' : ''}
                          </p>
                        </div>

                        <p
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                            nextStop.isWithinProximity
                              ? 'border-success/30 bg-success/10 text-success'
                              : 'border-warning/30 bg-warning/10 text-warning'
                          }`}
                        >
                          {nextStop.isWithinProximity
                            ? 'Within confirmation zone.'
                            : 'Move closer to unlock confirmation.'}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No stop currently needs confirmation in navigation.
                      </p>
                    )}
                  </div>
                </>
              ) : null}

              {showProofCapture && nextStop?.action?.requiresProof ? (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-3">
                  <p className="text-sm font-semibold text-foreground">Proof of Delivery</p>
                  {isGroupedDeliveryProofMode ? (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        Add at least one image proof (photo or signature) for each parcel at this stop.
                      </p>
                      <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
                        {nextStopProofDeliveryIds.map((deliveryId) => {
                          const delivery = nextStopDeliveriesById.get(Number(deliveryId));
                          const trackingId = String(delivery?.trackingId || '').trim() || `Parcel #${deliveryId}`;
                          const proof = proofByDelivery?.[deliveryId] && typeof proofByDelivery[deliveryId] === 'object'
                            ? proofByDelivery[deliveryId]
                            : createEmptyProofData();
                          const hasParcelProof = Boolean(proof?.photoDataUrl || proof?.signatureDataUrl);
                          return (
                            <div key={deliveryId} className="rounded-md border border-border bg-muted/20 p-2.5">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-foreground">{trackingId}</p>
                                <p className={`text-[11px] font-medium ${hasParcelProof ? 'text-success' : 'text-warning'}`}>
                                  {hasParcelProof ? 'Proof ready' : 'Proof required'}
                                </p>
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">Photo proof</label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(event) => handleProofImageChangeForDelivery(deliveryId, 'photo', event?.target?.files?.[0] || null)}
                                  className="block w-full text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary"
                                />
                                {proof?.photoName ? (
                                  <p className="mt-1 text-[11px] text-muted-foreground">{proof.photoName}</p>
                                ) : null}
                              </div>
                              <div className="mt-2">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">Signature image</label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(event) => handleProofImageChangeForDelivery(deliveryId, 'signature', event?.target?.files?.[0] || null)}
                                  className="block w-full text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary"
                                />
                                {proof?.signatureName ? (
                                  <p className="mt-1 text-[11px] text-muted-foreground">{proof.signatureName}</p>
                                ) : null}
                              </div>
                              <div className="mt-2">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                                <textarea
                                  rows={2}
                                  className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                  placeholder="Optional notes for this parcel"
                                  value={proof?.notes || ''}
                                  onChange={(event) => handleProofNotesChangeForDelivery(deliveryId, event.target.value)}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Photo proof</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleProofImageChange('photo', event?.target?.files?.[0] || null)}
                          className="block w-full text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary"
                        />
                        {proofData.photoName ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">{proofData.photoName}</p>
                        ) : null}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Signature image</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleProofImageChange('signature', event?.target?.files?.[0] || null)}
                          className="block w-full text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary"
                        />
                        {proofData.signatureName ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">{proofData.signatureName}</p>
                        ) : null}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                        <textarea
                          rows={3}
                          className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Optional delivery notes"
                          value={proofData.notes}
                          onChange={(event) => setProofData((previous) => ({ ...previous, notes: event.target.value }))}
                        />
                      </div>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowProofCapture(false);
                        resetProofData();
                      }}
                      disabled={isConfirming}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      iconName="CheckCircle2"
                      iconPosition="left"
                      onClick={handleProofSubmit}
                      disabled={!nextStop?.isWithinProximity || isConfirming}
                    >
                      {isConfirming ? 'Saving...' : (isGroupedDeliveryProofMode ? 'Submit Parcel Proofs' : 'Submit Proof')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <Button
                    variant="success"
                    size="default"
                    fullWidth
                    iconName={nextStop?.action?.iconName || 'CheckCircle2'}
                    iconPosition="left"
                    onClick={() => handlePrimaryConfirmation()}
                    disabled={!nextStop || !nextStop?.isWithinProximity || isConfirming}
                  >
                    {isConfirming
                      ? 'Confirming...'
                      : nextStop?.action?.label || 'Confirm Stop'}
                  </Button>

                  {!nextStop?.isWithinProximity && nextStop && Number.isFinite(nextStop?.distanceMeters) && nextStop.distanceMeters <= FORCE_CONFIRM_APPROACH_METERS ? (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
                      <p className="text-[11px] text-warning font-medium flex items-center gap-1">
                        <Icon name="AlertTriangle" size={12} />
                        Move within {nextStop.requiredProximityMeters || PROXIMITY_REQUIRED_METERS}m to unlock — or force confirm if the location is unreachable.
                      </p>
                      {!showProximityOverride ? (
                        <button
                          type="button"
                          className="text-[11px] underline text-muted-foreground hover:text-foreground transition-smooth"
                          onClick={() => { setShowProximityOverride(true); setConfirmationError(''); }}
                        >
                          Can't reach this point? Force confirm
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-[11px] font-medium text-muted-foreground block">Reason for override (required)</label>
                          <select
                            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            value={proximityOverrideReason}
                            onChange={(e) => setProximityOverrideReason(e.target.value)}
                          >
                            <option value="">Select a reason…</option>
                            <option value="gated_or_inaccessible">Gated / inaccessible premises</option>
                            <option value="wrong_gps_pin">Incorrect GPS pin on order</option>
                            <option value="no_road_access">No road access to exact point</option>
                            <option value="customer_confirmed_remote">Customer confirmed remotely</option>
                            <option value="safety_concern">Safety concern at location</option>
                            <option value="other">Other</option>
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              className="h-8 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted transition-smooth"
                              onClick={() => { setShowProximityOverride(false); setProximityOverrideReason(''); }}
                              disabled={isConfirming}
                            >
                              Cancel
                            </button>
                            <Button
                              variant="warning"
                              size="sm"
                              iconName="ShieldAlert"
                              iconPosition="left"
                              disabled={!proximityOverrideReason || isConfirming}
                              onClick={() => handlePrimaryConfirmation({ overrideProximity: true, overrideReason: proximityOverrideReason })}
                            >
                              {isConfirming ? 'Confirming…' : 'Force Confirm'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : !nextStop?.isWithinProximity && nextStop ? (
                    <p className="text-[11px] text-muted-foreground">
                      Move within {nextStop.requiredProximityMeters || PROXIMITY_REQUIRED_METERS}m to unlock this action.
                    </p>
                  ) : null}

                  {navigationIncidentAction ? (
                    <Button
                      variant="danger"
                      size="default"
                      fullWidth
                      iconName="AlertTriangle"
                      iconPosition="left"
                      onClick={handleOpenNavigationIncident}
                      disabled={isConfirming || isIncidentSubmitting}
                    >
                      {navigationIncidentAction?.label || 'Report Issue'}
                    </Button>
                  ) : null}
                </div>
              )}

              {confirmationError ? (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                  {confirmationError}
                </p>
              ) : null}
              {confirmationNotice ? (
                <p className="mt-3 rounded-md border border-success/30 bg-success/10 px-2.5 py-2 text-xs text-success">
                  {confirmationNotice}
                </p>
              ) : null}
            </aside>
          </div>
        </main>

        {canUseNavigationChat ? (
          <div className="fixed bottom-5 right-4 z-30 md:bottom-6 md:right-6">
            <button
              type="button"
              onClick={handleOpenNavigationChat}
              className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-elevation-lg transition-smooth hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open route chat"
            >
              <Icon name="MessageSquare" size={20} />
              {chatUnreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-[18px] h-[18px] rounded-full bg-error px-1 text-[10px] font-semibold leading-[18px] text-error-foreground text-center">
                  {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}

        <ChatModal
          isOpen={isChatOpen}
          onClose={handleCloseNavigationChat}
          bookingId={chatCandidateDelivery?.id}
          title={chatCandidateDelivery?.trackingId ? `Booking ${chatCandidateDelivery.trackingId}` : 'Route Chat'}
          currentUserId={userId}
          currentUserRole="courier"
          canSend={canUseNavigationChat}
          disabledReason={chatAccessMeta?.reason}
          legLabel={chatLegLabel}
          onMessagesChange={handleNavigationChatMessagesChange}
        />
        <DangerActionModal
          isOpen={incidentFlow?.isOpen}
          onClose={handleCloseNavigationIncident}
          title={`${incidentModalCopy?.title || 'Incident Report'}${incidentFlow?.trackingId ? ` - ${incidentFlow.trackingId}` : ''}`}
          subtitle={incidentModalCopy?.subtitle || ''}
          reasonLabel="Reason (Required)"
          reasonOptions={incidentReasonOptions}
          reasonValue={incidentReason}
          onReasonChange={setIncidentReason}
          notesLabel="Incident Notes"
          notesPlaceholder="Add extra details for admin review"
          notesValue={incidentNotes}
          onNotesChange={setIncidentNotes}
          continueLabel={incidentModalCopy?.continueLabel || 'Continue'}
          finalConfirmLabel={incidentModalCopy?.finalConfirmLabel || 'Submit'}
          confirmPrompt={incidentModalCopy?.confirmPrompt || 'Are you sure?'}
          finalCheckLabel="I am sure. Submit this request and notify admin."
          isSubmitting={isIncidentSubmitting}
          submitError={incidentSubmitError}
          onSubmit={handleSubmitNavigationIncident}
        />
      </div>
    </>
  );
};

export default CourierNavigationPage;
