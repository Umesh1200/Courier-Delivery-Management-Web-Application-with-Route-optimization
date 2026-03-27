import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import QuickActionPanel from '../../components/ui/QuickActionPanel';
import DeliveryCard from './components/DeliveryCard';
import RouteOptimizationPanel from './components/RouteOptimizationPanel';
import EarningsTracker from './components/EarningsTracker';
import ActiveDeliverySection from './components/ActiveDeliverySection';
import PerformanceMetrics from './components/PerformanceMetrics';
import AvailabilityToggle from './components/AvailabilityToggle';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import { formatRs } from '../../utils/format';
import ChatModal from '../../components/ui/ChatModal';
import DangerActionModal from '../../components/ui/DangerActionModal';
import { buildApiUrl } from '../../utils/api';
import { addInAppNotification, buildNotificationContext } from '../../utils/notifications';
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
  getDashboardCourierIncidentAction
} from '../../utils/cancellation';

const NAV_OPEN_TS_KEY = '__courierNavOpenTs';
const NAV_SESSION_KEY = '__courierNavPayload';
const DASHBOARD_POLL_MS = 10000;
const DELIVERY_STATUS_LABELS = {
  pickup_assigned: 'Pickup Assigned',
  picked_up: 'Picked Up',
  in_transit_to_origin_branch: 'In Transit To Origin Branch',
  received_at_origin_branch: 'At Origin Branch',
  linehaul_assigned: 'Linehaul Assigned',
  linehaul_load_confirmed: 'Linehaul Load Confirmed',
  linehaul_in_transit: 'Linehaul In Transit',
  received_at_destination_branch: 'At Destination Branch',
  delivery_assigned: 'Delivery Assigned',
  delivery_load_confirmed: 'Delivery Load Confirmed',
  out_for_delivery: 'Out For Delivery',
  delivery_attempt_failed: 'Delivery Attempt Failed',
  waiting_for_reattempt: 'Waiting for Reattempt',
  rts_pending: 'Return to Sender In Progress',
  returned_to_sender: 'Returned to Sender',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};
const NEXT_STATUS_BY_CURRENT = {
  pickup_assigned: 'picked_up',
  picked_up: 'in_transit_to_origin_branch',
  delivery_load_confirmed: 'out_for_delivery',
  out_for_delivery: 'delivered'
};
const TERMINAL_STATUSES = ['delivered', 'cancelled'];
const ACTIVE_STATUSES_BY_ROLE = {
  pickup: ['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch'],
  linehaul: ['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit'],
  delivery: ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'],
  both: [
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
  ]
};
const ROUTE_CANDIDATE_STATUSES_BY_ROLE = {
  pickup: ['pickup_assigned'],
  linehaul: ['linehaul_load_confirmed', 'linehaul_in_transit'],
  delivery: ['delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'],
  both: ['pickup_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed']
};
const ACTIVE_STATUS_PRIORITY_BY_ROLE = {
  pickup: ['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch'],
  linehaul: ['linehaul_in_transit', 'linehaul_load_confirmed', 'linehaul_assigned'],
  delivery: ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'],
  both: [
    'pickup_assigned',
    'delivery_assigned',
    'picked_up',
    'in_transit_to_origin_branch',
    'linehaul_in_transit',
    'linehaul_load_confirmed',
    'linehaul_assigned',
    'delivery_load_confirmed',
    'out_for_delivery',
    'delivery_attempt_failed'
  ]
};
const ACTIVE_COUNT_STATUSES_BY_ROLE = {
  pickup: ['picked_up', 'in_transit_to_origin_branch'],
  linehaul: ['linehaul_load_confirmed', 'linehaul_in_transit'],
  delivery: ['delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'],
  both: [
    'picked_up',
    'in_transit_to_origin_branch',
    'linehaul_load_confirmed',
    'linehaul_in_transit',
    'delivery_load_confirmed',
    'out_for_delivery',
    'delivery_attempt_failed'
  ]
};
const COMPLETED_STATUSES_BY_ROLE = {
  pickup: ['received_at_origin_branch', 'received_at_destination_branch', 'delivered', 'cancelled'],
  linehaul: ['received_at_destination_branch', 'delivered', 'cancelled'],
  delivery: ['delivered', 'cancelled'],
  both: ['received_at_origin_branch', 'received_at_destination_branch', 'delivered', 'cancelled']
};
const ON_VEHICLE_BUCKETS = [
  { key: 'pickup_leg', label: 'Pickup Transit', statuses: ['picked_up', 'in_transit_to_origin_branch'] },
  { key: 'linehaul_leg', label: 'Linehaul Transit', statuses: ['linehaul_load_confirmed', 'linehaul_in_transit'] },
  { key: 'delivery_leg', label: 'Delivery Loaded', statuses: ['delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'] }
];
const COURIER_ACTIONABLE_STATUSES = new Set([
  'pickup_assigned',
  'linehaul_assigned',
  'delivery_assigned',
  'delivery_load_confirmed',
  'out_for_delivery'
]);
const getCourierTaskNotificationSeedKey = (userId) => `__cf_courier_task_seeded_${Number(userId) || 0}`;
const hasCourierTaskNotificationsSeeded = (userId) => {
  if (typeof window === 'undefined') {
    return false;
  }
  const key = getCourierTaskNotificationSeedKey(userId);
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch (error) {
    return false;
  }
};
const markCourierTaskNotificationsSeeded = (userId) => {
  if (typeof window === 'undefined') {
    return;
  }
  const key = getCourierTaskNotificationSeedKey(userId);
  try {
    window.sessionStorage.setItem(key, '1');
  } catch (error) {
    // Ignore sessionStorage failures and continue with best-effort notifications.
  }
};

const normalizeDeliveryStatus = (value) => String(value || '').trim().toLowerCase();
const areNumericRecordsEqual = (left = {}, right = {}) => {
  const leftSafe = left || {};
  const rightSafe = right || {};
  const leftKeys = Object.keys(leftSafe);
  const rightKeys = Object.keys(rightSafe);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of rightKeys) {
    if (Number(leftSafe[key] || 0) !== Number(rightSafe[key] || 0)) {
      return false;
    }
  }
  return true;
};
const isRecordEmpty = (record) => Object.keys(record || {}).length === 0;

const deliveryLabel = (delivery) => {
  const trackingId = String(delivery?.trackingId || '').trim();
  if (trackingId) {
    return `Booking ${trackingId}`;
  }
  const bookingId = Number(delivery?.id);
  if (Number.isFinite(bookingId)) {
    return `Booking #${bookingId}`;
  }
  return 'A booking';
};

const buildCourierActionNotification = (delivery, status) => {
  const label = deliveryLabel(delivery);
  if (status === 'pickup_assigned') {
    return {
      title: 'New Pickup Assignment',
      message: `${label} is ready for pickup.`,
      icon: 'PackageCheck'
    };
  }
  if (status === 'linehaul_assigned') {
    return {
      title: 'New Linehaul Assignment',
      message: `${label} is waiting at origin branch. Confirm load.`,
      icon: 'Truck'
    };
  }
  if (status === 'delivery_assigned') {
    return {
      title: 'New Delivery Assignment',
      message: `${label} is ready for final-mile delivery.`,
      icon: 'MapPin'
    };
  }
  if (status === 'delivery_load_confirmed') {
    return {
      title: 'Delivery Load Confirmed',
      message: `${label} is loaded. Start final-mile route.`,
      icon: 'Navigation'
    };
  }
  if (status === 'out_for_delivery') {
    const cashToCollect = Number(delivery?.cashToCollect ?? 0);
    if (cashToCollect > 0) {
      return {
        title: 'Cash Collection Required',
        message: `${label} requires collecting ${formatRs(cashToCollect)} on delivery.`,
        icon: 'Wallet'
      };
    }
  }
  return null;
};

const CourierDashboard = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [selectedTab, setSelectedTab] = useState('assigned');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [userName, setUserName] = useState(localStorage.getItem('userName') || 'Courier');
  const [routeOptions, setRouteOptions] = useState([]);
  const [routePlanId, setRoutePlanId] = useState(null);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeStart, setRouteStart] = useState(null);
  const [routeCourierLocation, setRouteCourierLocation] = useState(null);
  const [routeBranchLocation, setRouteBranchLocation] = useState(null);
  const [routeVehicle, setRouteVehicle] = useState(null);
  const [courierVehicle, setCourierVehicle] = useState(null);
  const [isVehicleMenuOpen, setIsVehicleMenuOpen] = useState(false);
  const [routeNotice, setRouteNotice] = useState('');
  const [locationUpdateState, setLocationUpdateState] = useState({
    isUpdating: false,
    error: '',
    notice: ''
  });
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [courierRole, setCourierRole] = useState(null);
  const [earningsData, setEarningsData] = useState({
    daily: { total: 0, growth: 0, base: 0, bonuses: 0, deliveries: 0, breakdown: [], nextMilestone: { remaining: 0, bonus: 0, progress: 0 } },
    weekly: { total: 0, growth: 0, base: 0, bonuses: 0, deliveries: 0, breakdown: [], nextMilestone: { remaining: 0, bonus: 0, progress: 0 } },
    monthly: { total: 0, growth: 0, base: 0, bonuses: 0, deliveries: 0, breakdown: [], nextMilestone: { remaining: 0, bonus: 0, progress: 0 } }
  });
  const [performanceMetrics, setPerformanceMetrics] = useState({
    overallScore: 0,
    customerRating: 0,
    totalReviews: 0,
    completionRate: 0,
    onTimeRate: 0,
    efficiencyScore: 0,
    achievements: [],
    suggestions: []
  });
  const [todayStats, setTodayStats] = useState({
    workedMinutes: 0,
    breakMinutes: 0,
    deliveriesToday: 0
  });
  const [chatBooking, setChatBooking] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatLegKey, setChatLegKey] = useState('');
  const [chatUnreadByBooking, setChatUnreadByBooking] = useState({});
  const [chatLatestByBooking, setChatLatestByBooking] = useState({});
  const [incidentFlow, setIncidentFlow] = useState({
    isOpen: false,
    bookingId: null,
    trackingId: '',
    type: '',
    actionContext: 'dashboard'
  });
  const [incidentReason, setIncidentReason] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [incidentSubmitError, setIncidentSubmitError] = useState('');
  const [isIncidentSubmitting, setIsIncidentSubmitting] = useState(false);
  const userId = localStorage.getItem('userId');
  const userIdNumber = Number(userId);
  const notificationContext = useMemo(
    () => buildNotificationContext({ userRole: 'courier', userId }),
    [userId]
  );
  const vehicleMenuRef = useRef(null);
  const deliveryStatusSnapshotRef = useRef(new Map());
  const hasInitializedDeliverySnapshotRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isRouteView = location?.hash === '#route';

  const getDeliveryChatMeta = useCallback((delivery) => (
    getCourierChatAccessMeta(courierRole, delivery?.status)
  ), [courierRole]);

  const markThreadAsRead = useCallback((delivery, legKeyOverride = '', explicitLatestId = null) => {
    const bookingId = Number(delivery?.id);
    if (!Number.isFinite(bookingId) || !Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      return;
    }
    const meta = getDeliveryChatMeta(delivery);
    const legKey = legKeyOverride || meta?.legKey || 'general_leg';
    const latestMessageId = Number(explicitLatestId ?? chatLatestByBooking?.[bookingId] ?? 0);
    if (!Number.isFinite(latestMessageId) || latestMessageId <= 0) {
      return;
    }
    writeSeenMessageId(
      {
        bookingId,
        userId: userIdNumber,
        userRole: 'courier',
        legKey
      },
      latestMessageId
    );
  }, [chatLatestByBooking, getDeliveryChatMeta, userIdNumber]);

  const handleOpenChat = useCallback((delivery) => {
    if (!delivery?.id || !Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      return;
    }
    const chatMeta = getDeliveryChatMeta(delivery);
    if (!chatMeta?.allowed) {
      return;
    }
    markThreadAsRead(delivery, chatMeta.legKey);
    setChatUnreadByBooking((previous) => ({
      ...(previous || {}),
      [Number(delivery.id)]: 0
    }));
    setChatBooking(delivery);
    setChatLegKey(chatMeta.legKey || '');
    setIsChatOpen(true);
  }, [getDeliveryChatMeta, markThreadAsRead, userIdNumber]);

  const handleCloseChat = useCallback(() => {
    if (chatBooking?.id) {
      markThreadAsRead(chatBooking, chatLegKey);
    }
    setIsChatOpen(false);
    setChatBooking(null);
    setChatLegKey('');
  }, [chatBooking, chatLegKey, markThreadAsRead]);

  const handleOpenIncidentFlow = useCallback((delivery, incidentAction) => {
    const bookingId = Number(delivery?.id);
    const incidentType = String(incidentAction?.type || '').trim().toLowerCase();
    const actionContext = String(incidentAction?.actionContext || 'dashboard').trim().toLowerCase();
    if (!Number.isFinite(bookingId) || bookingId <= 0 || !incidentType) {
      return;
    }
    setIncidentFlow({
      isOpen: true,
      bookingId,
      trackingId: String(delivery?.trackingId || '').trim(),
      type: incidentType,
      actionContext: actionContext || 'dashboard'
    });
    setIncidentReason('');
    setIncidentNotes('');
    setIncidentSubmitError('');
  }, []);

  const handleCloseIncidentFlow = useCallback(() => {
    setIncidentFlow({
      isOpen: false,
      bookingId: null,
      trackingId: '',
      type: '',
      actionContext: 'dashboard'
    });
    setIncidentReason('');
    setIncidentNotes('');
    setIncidentSubmitError('');
    setIsIncidentSubmitting(false);
  }, []);

  const handleSubmitIncidentFlow = useCallback(async () => {
    const bookingId = Number(incidentFlow?.bookingId);
    const type = String(incidentFlow?.type || '').trim().toLowerCase();
    const actionContext = String(incidentFlow?.actionContext || 'dashboard').trim().toLowerCase();
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return;
    }
    if (!Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      setIncidentSubmitError('Courier session is missing. Please sign in again.');
      return;
    }
    if (!incidentReason) {
      setIncidentSubmitError('Please select a reason.');
      return;
    }

    const reasonOptions = COURIER_INCIDENT_REASONS_BY_TYPE?.[type] || [];
    const reasonText = findReasonLabel(reasonOptions, incidentReason) || incidentReason;

    setIsIncidentSubmitting(true);
    setIncidentSubmitError('');
    try {
      const response = await fetch(buildApiUrl(`/api/courier/bookings/${bookingId}/incident`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierId: userIdNumber,
          type,
          actionContext,
          reasonCode: incidentReason,
          reasonText,
          notes: incidentNotes
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to submit request.');
      }
      const modalCopy = getCourierIncidentModalCopy(type);
      const bookingLabel = incidentFlow?.trackingId
        ? `Booking ${incidentFlow.trackingId}`
        : `Booking #${bookingId}`;
      addInAppNotification(notificationContext, {
        type: 'warning',
        title: modalCopy?.successTitle || 'Request Submitted',
        message: `${bookingLabel}: ${payload?.message || modalCopy?.successMessage || 'Request logged.'}`,
        icon: type === 'delivery_failure' ? 'AlertTriangle' : 'XCircle',
        dedupeKey: `__courier_incident_${bookingId}_${type}_${incidentReason}_${Date.now()}`
      });
      handleCloseIncidentFlow();
    } catch (error) {
      setIncidentSubmitError(error?.message || 'Unable to submit request right now.');
    } finally {
      setIsIncidentSubmitting(false);
    }
  }, [
    handleCloseIncidentFlow,
    incidentFlow?.actionContext,
    incidentFlow?.bookingId,
    incidentFlow?.trackingId,
    incidentFlow?.type,
    incidentNotes,
    incidentReason,
    notificationContext,
    userIdNumber
  ]);

  const formatDuration = (minutes) => {
    if (!Number.isFinite(minutes)) {
      return '0 mins';
    }
    const rounded = Math.max(0, Math.round(minutes));
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (hours <= 0) {
      return `${mins} mins`;
    }
    return `${hours} hrs ${mins} mins`;
  };

  const parseWeightKg = (rawWeight) => {
    if (rawWeight === null || rawWeight === undefined) {
      return 0;
    }
    if (typeof rawWeight === 'number') {
      return Number.isFinite(rawWeight) ? Math.max(0, rawWeight) : 0;
    }
    const text = String(rawWeight).trim().toLowerCase();
    if (!text) {
      return 0;
    }
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return 0;
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value < 0) {
      return 0;
    }
    const compact = text.replace(/\s+/g, '');
    return compact.endsWith('g') && !compact.endsWith('kg') ? value / 1000 : value;
  };

  const emitCourierTaskNotifications = useCallback((deliveryList = []) => {
    const safeDeliveryList = Array.isArray(deliveryList) ? deliveryList : [];
    const nextSnapshot = new Map();
    const isInitialSnapshot = !hasInitializedDeliverySnapshotRef.current;
    const shouldSeedInitialNotifications = isInitialSnapshot && !hasCourierTaskNotificationsSeeded(userId);

    safeDeliveryList.forEach((delivery) => {
      const deliveryId = Number(delivery?.id);
      if (!Number.isFinite(deliveryId)) {
        return;
      }
      const status = normalizeDeliveryStatus(delivery?.status);
      if (!status) {
        return;
      }
      nextSnapshot.set(deliveryId, status);
    });

    if (isInitialSnapshot) {
      hasInitializedDeliverySnapshotRef.current = true;
    }

    safeDeliveryList.forEach((delivery) => {
      const deliveryId = Number(delivery?.id);
      if (!Number.isFinite(deliveryId)) {
        return;
      }

      const nextStatus = nextSnapshot.get(deliveryId);
      if (!nextStatus || !COURIER_ACTIONABLE_STATUSES.has(nextStatus)) {
        return;
      }

      const previousStatus = deliveryStatusSnapshotRef.current.get(deliveryId);
      if (isInitialSnapshot && !shouldSeedInitialNotifications) {
        return;
      }
      if (previousStatus === nextStatus) {
        return;
      }

      const notificationPayload = buildCourierActionNotification(delivery, nextStatus);
      if (!notificationPayload) {
        return;
      }

      addInAppNotification(notificationContext, {
        type: 'action',
        title: notificationPayload.title,
        message: notificationPayload.message,
        icon: notificationPayload.icon,
        link: '/courier-dashboard',
        dedupeKey: `__courier_action_${deliveryId}_${nextStatus}`
      });
    });

    deliveryStatusSnapshotRef.current = nextSnapshot;
    if (isInitialSnapshot && shouldSeedInitialNotifications) {
      markCourierTaskNotificationsSeeded(userId);
    }
  }, [notificationContext, userId]);

  const emitCourierIncidentDecisionNotifications = useCallback((decisionList = []) => {
    const safeDecisionList = Array.isArray(decisionList) ? decisionList : [];
    safeDecisionList.forEach((decision) => {
      const requestId = Number(decision?.requestId);
      const status = String(decision?.status || '').trim().toLowerCase();
      if (!Number.isFinite(requestId) || !['approved', 'rejected'].includes(status)) {
        return;
      }

      const bookingCode = String(decision?.bookingCode || '').trim();
      const bookingId = Number(decision?.bookingId);
      const bookingLabel = bookingCode
        ? `Booking ${bookingCode}`
        : (Number.isFinite(bookingId) ? `Booking #${bookingId}` : 'A booking');
      const adminNote = String(decision?.adminNote || '').trim();
      const reason = String(decision?.reason || '').trim();

      if (status === 'approved') {
        const messageParts = [
          `${bookingLabel}: Pickup cancellation approved by admin.`
        ];
        if (reason) {
          messageParts.push(`Reason: ${reason}.`);
        }
        if (adminNote) {
          messageParts.push(`Admin note: ${adminNote}.`);
        }
        addInAppNotification(notificationContext, {
          type: 'alert',
          title: 'Pickup Cancellation Approved',
          message: messageParts.join(' '),
          icon: 'CheckCircle',
          dedupeKey: `__pickup_decision_${requestId}_${status}`
        });
        return;
      }

      const rejectionParts = [
        `${bookingLabel}: Pickup cancellation request was rejected by admin.`
      ];
      if (adminNote) {
        rejectionParts.push(`Admin note: ${adminNote}.`);
      }
      addInAppNotification(notificationContext, {
        type: 'warning',
        title: 'Pickup Cancellation Rejected',
        message: rejectionParts.join(' '),
        icon: 'XCircle',
        dedupeKey: `__pickup_decision_${requestId}_${status}`
      });
    });
  }, [notificationContext]);

  useEffect(() => {
    deliveryStatusSnapshotRef.current = new Map();
    hasInitializedDeliverySnapshotRef.current = false;
  }, [userId]);

  const fetchRoutes = async (deliveriesList = deliveries, roleOverride = courierRole) => {
    if (!userId) {
      return;
    }
    setRoutesLoading(true);
    try {
      const sourceDeliveries = deliveriesList || [];
      const routeRoleKey = roleOverride && ROUTE_CANDIDATE_STATUSES_BY_ROLE[roleOverride]
        ? roleOverride
        : 'both';
      const routeCandidateStatuses = ROUTE_CANDIDATE_STATUSES_BY_ROLE[routeRoleKey] || ROUTE_CANDIDATE_STATUSES_BY_ROLE.both;
      const pendingLoadStatuses = routeRoleKey === 'linehaul'
        ? ['linehaul_assigned']
        : routeRoleKey === 'delivery'
          ? ['delivery_assigned']
          : routeRoleKey === 'both'
            ? ['linehaul_assigned', 'delivery_assigned']
            : [];
      const activeDeliveries = sourceDeliveries.filter((delivery) =>
        routeCandidateStatuses.includes(delivery?.status)
      );
      if (activeDeliveries.length === 0) {
        const hasPendingLoad = pendingLoadStatuses.length > 0
          && sourceDeliveries.some((delivery) => (
            pendingLoadStatuses.includes(String(delivery?.status || '').trim().toLowerCase())
          ));
        let locationSnapshot = null;
        if (hasPendingLoad) {
          try {
            const snapshotRes = await fetch('http://localhost:8000/api/routes/recommend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                courierId: Number(userId),
                bookingIds: [],
                persist: false
              })
            });
            const snapshotPayload = await snapshotRes.json().catch(() => ({}));
            if (snapshotRes.ok) {
              locationSnapshot = snapshotPayload;
            }
          } catch (error) {
            locationSnapshot = null;
          }
        }
        setRouteOptions([]);
        setRoutePlanId(null);
        setRouteStart(locationSnapshot?.start || null);
        setRouteCourierLocation(locationSnapshot?.courierLocation || null);
        setRouteBranchLocation(locationSnapshot?.branchLocation || null);
        setRouteVehicle(locationSnapshot?.vehicle || null);
        setRouteNotice(
          hasPendingLoad
            ? 'Pending load confirmation in Trip/Navigation.'
            : ''
        );
        return;
      }
      const earningsById = new Map(
        activeDeliveries
          .filter((delivery) => Number.isFinite(delivery?.id))
          .map((delivery) => [delivery.id, Number(delivery?.earnings ?? 0)])
      );

      const bookingIds = activeDeliveries
        .map((delivery) => delivery?.id)
        .filter((id) => Number.isFinite(id) || typeof id === 'number');

      const response = await fetch('http://localhost:8000/api/routes/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierId: Number(userId),
          bookingIds,
          persist: true
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRouteOptions([]);
        setRoutePlanId(null);
        setRouteStart(payload?.start || null);
        setRouteCourierLocation(payload?.courierLocation || null);
        setRouteBranchLocation(payload?.branchLocation || null);
        setRouteVehicle(payload?.vehicle || null);
        setSelectedRouteIndex(0);
        setRouteNotice(payload?.reason || payload?.error || 'Unable to generate route right now.');
        return;
      }

      const candidates = payload?.candidates || [];
      const candidateIds = payload?.candidateIds || [];
      const maxScore = candidates.reduce((max, item) => Math.max(max, item?.score ?? 0), 0);
      const bestIndex = candidates.findIndex((item) => (item?.score ?? 0) === maxScore);
      const minDistance = candidates.reduce((min, item) => Math.min(min, item?.distance_km ?? Infinity), Infinity);
      const minTime = candidates.reduce((min, item) => Math.min(min, item?.time_min ?? Infinity), Infinity);
      const minLateness = candidates.reduce((min, item) => Math.min(min, item?.lateness_min ?? Infinity), Infinity);
      const distanceMinCount = candidates.filter((item) => (item?.distance_km ?? Infinity) === minDistance).length;
      const timeMinCount = candidates.filter((item) => (item?.time_min ?? Infinity) === minTime).length;
      const latenessMinCount = candidates.filter((item) => (item?.lateness_min ?? Infinity) === minLateness).length;
      const isLinehaulRouteView = routeRoleKey === 'linehaul';

      const mapped = candidates.map((candidate, index) => {
        const highlights = [];
        if (index === bestIndex) {
          highlights.push('Best overall');
        }
        if ((candidate?.distance_km ?? Infinity) === minDistance && distanceMinCount === 1) {
          highlights.push('Shortest distance');
        }
        if ((candidate?.time_min ?? Infinity) === minTime && timeMinCount === 1) {
          highlights.push('Fastest ETA');
        }
        if ((candidate?.lateness_min ?? Infinity) === minLateness && latenessMinCount === 1) {
          highlights.push('Least lateness');
        }

        const latenessMinutes = Number(candidate?.lateness_min ?? 0);
        const reliabilityLabel = latenessMinutes <= 0 ? 'On-time' : `Delay ~${Math.round(latenessMinutes)} mins`;

        return ({
          id: candidateIds?.[index] || null,
          name: candidate?.candidate_type === 'optimized'
            ? (isLinehaulRouteView ? 'Optimized Branch Route' : 'Optimized Route')
            : candidate?.candidate_type === 'time_priority'
              ? (isLinehaulRouteView ? 'Time Priority Branch Route' : 'Time Priority Route')
              : (isLinehaulRouteView ? 'Sequential Branch Route' : 'Sequential Route'),
          stops: candidate?.stop_sequence?.length || (candidate?.order?.length || 0) * 2,
          distance: `${Number(candidate?.distance_km ?? 0).toFixed(1)} km`,
          estimatedTime: formatDuration(candidate?.time_min ?? 0),
          totalEarnings: (candidate?.order || []).reduce((sum, bookingId) => {
            return sum + (earningsById.get(bookingId) || 0);
          }, 0),
          recommended: index === bestIndex,
          score: null,
          lateness: reliabilityLabel,
          highlights,
          stopSequence: candidate?.stop_sequence || []
        });
      });

      setRouteOptions(mapped);
      setRoutePlanId(payload?.routePlanId || null);
      setRouteStart(payload?.start || null);
      setRouteCourierLocation(payload?.courierLocation || null);
      setRouteBranchLocation(payload?.branchLocation || null);
      setRouteVehicle(payload?.vehicle || null);
      if (payload?.vehicle) {
        setCourierVehicle(payload.vehicle);
      }
      setRouteNotice(payload?.reason || '');
    } catch (error) {
      setRouteOptions([]);
      setRoutePlanId(null);
      setRouteStart(null);
      setRouteCourierLocation(null);
      setRouteBranchLocation(null);
      setRouteVehicle(null);
      setSelectedRouteIndex(0);
      setRouteNotice(error?.message || 'Unable to generate route right now.');
    } finally {
      setRoutesLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let isLoadingDashboard = false;
    const loadDashboard = async () => {
      if (!userId || isLoadingDashboard) {
        return;
      }
      isLoadingDashboard = true;

      try {
        let resolvedCourierRole = courierRole;
        const [userRes, dashboardRes] = await Promise.all([
          fetch(`http://localhost:8000/api/users/${userId}`),
          fetch(`http://localhost:8000/api/dashboard/courier?userId=${userId}`)
        ]);

        if (userRes.ok) {
          const user = await userRes.json();
          if (!isMounted) {
            return;
          }
          setUserName(user?.fullName || 'Courier');
          resolvedCourierRole = user?.courierRole || null;
          setCourierRole(resolvedCourierRole);
          setCourierVehicle(user?.vehicle || null);
          if (user?.availability === 'online' || user?.availability === 'offline') {
            setIsAvailable(user?.availability === 'online');
          }
        }

        if (dashboardRes.ok) {
          const dashboard = await dashboardRes.json();
          if (!isMounted) {
            return;
          }
          const deliveryList = dashboard?.deliveries || [];
          setDeliveries(deliveryList);
          setActiveDelivery(dashboard?.activeDelivery || null);
          setCourierVehicle(dashboard?.vehicle || null);
          setEarningsData(dashboard?.earnings || earningsData);
          setPerformanceMetrics(dashboard?.performance || performanceMetrics);
          setTodayStats(dashboard?.todayStats || todayStats);
          emitCourierTaskNotifications(deliveryList);
          emitCourierIncidentDecisionNotifications(dashboard?.incidentDecisions || []);
          fetchRoutes(deliveryList, resolvedCourierRole);
        }
      } catch (error) {
        if (isMounted) {
          setDeliveries([]);
        }
      } finally {
        isLoadingDashboard = false;
      }
    };

    loadDashboard();
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadDashboard();
      }
    }, DASHBOARD_POLL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(pollId);
    };
  }, [emitCourierIncidentDecisionNotifications, emitCourierTaskNotifications, userId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (vehicleMenuRef?.current && !vehicleMenuRef.current.contains(event?.target)) {
        setIsVehicleMenuOpen(false);
      }
    };

    if (isVehicleMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVehicleMenuOpen]);

  const handleUpdateStatus = async (deliveryId, newStatus) => {
    if (!userId) {
      return null;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/courier/bookings/${deliveryId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          courierId: Number(userId)
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update status');
      }
      const appliedStatus = payload?.booking?.status || newStatus;
      const paymentMethodCode = String(payload?.payment?.method || '').trim().toLowerCase();
      const paymentStatusCode = String(payload?.payment?.status || '').trim().toLowerCase();
      const paymentTotalValue = Number(payload?.payment?.total);
      const paymentCollectedAt = String(payload?.payment?.collectedAt || '').trim();
      const applyDeliveryUpdate = (delivery) => {
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
      };
      let nextDeliveries = null;

      setDeliveries((prevDeliveries) =>
        {
          nextDeliveries = prevDeliveries?.map((delivery) =>
            delivery?.id === deliveryId ? applyDeliveryUpdate(delivery) : delivery
          ) || [];
          return nextDeliveries;
        });

      setActiveDelivery((prev) =>
        prev?.id === deliveryId ? applyDeliveryUpdate(prev) : prev
      );
      const numericDeliveryId = Number(deliveryId);
      const normalizedAppliedStatus = normalizeDeliveryStatus(appliedStatus);
      if (Number.isFinite(numericDeliveryId) && normalizedAppliedStatus) {
        const nextSnapshot = new Map(deliveryStatusSnapshotRef.current);
        nextSnapshot.set(numericDeliveryId, normalizedAppliedStatus);
        deliveryStatusSnapshotRef.current = nextSnapshot;
        hasInitializedDeliverySnapshotRef.current = true;
      }
      if (nextDeliveries) {
        fetchRoutes(nextDeliveries, courierRole);
      }
      return appliedStatus;
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const handleViewDetails = (deliveryId) => {
    console.log('View details for delivery:', deliveryId);
  };

  const handleSelectRoute = async (route) => {
    if (!route?.id || !routePlanId) {
      return;
    }
    try {
      await fetch('http://localhost:8000/api/routes/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routePlanId,
          candidateId: route.id
        })
      });
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!routesLoading && routeOptions.length > 0 && selectedRouteIndex >= routeOptions.length) {
      setSelectedRouteIndex(0);
    }
  }, [routeOptions, routesLoading, selectedRouteIndex]);

  const handleCaptureProof = (proofData) => {
    console.log('Captured proof:', proofData);
  };

  const handleCompleteDelivery = async (deliveryId) => {
    const current = deliveries?.find((item) => item?.id === deliveryId) || activeDelivery;
    const nextStatus = NEXT_STATUS_BY_CURRENT[current?.status];
    if (!nextStatus) {
      return;
    }
    const appliedStatus = await handleUpdateStatus(deliveryId, nextStatus);
    if (appliedStatus && TERMINAL_STATUSES.includes(appliedStatus)) {
      setActiveDelivery((prev) => (prev?.id === deliveryId ? null : prev));
    }
  };

  const handleAvailabilityChange = async (status) => {
    if (!userId) {
      return false;
    }
    const previous = isAvailable;
    setIsAvailable(status);
    try {
      const response = await fetch('http://localhost:8000/api/courier/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierId: Number(userId),
          availability: status ? 'online' : 'offline'
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update availability');
      }
      return true;
    } catch (error) {
      setIsAvailable(previous);
      console.error(error);
      return false;
    }
  };

  const updateCourierCurrentLocation = async (lat, lng) => {
    const numericUserId = Number(userId);
    const normalizedLat = Number(lat);
    const normalizedLng = Number(lng);
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      throw new Error('Courier session is missing. Please sign in again.');
    }
    if (!Number.isFinite(normalizedLat) || normalizedLat < -90 || normalizedLat > 90
      || !Number.isFinite(normalizedLng) || normalizedLng < -180 || normalizedLng > 180) {
      throw new Error('Coordinates are invalid.');
    }

    setLocationUpdateState({ isUpdating: true, error: '', notice: '' });
    try {
      const response = await fetch('http://localhost:8000/api/courier/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierId: numericUserId,
          latitude: Number(normalizedLat.toFixed(6)),
          longitude: Number(normalizedLng.toFixed(6))
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update courier location.');
      }

      const nextLocation = {
        lat: Number(normalizedLat.toFixed(5)),
        lng: Number(normalizedLng.toFixed(5))
      };
      setRouteCourierLocation(nextLocation);
      setRouteStart(nextLocation);
      setLocationUpdateState({
        isUpdating: false,
        error: '',
        notice: `Current location updated to ${nextLocation.lat.toFixed(5)}, ${nextLocation.lng.toFixed(5)}`
      });
      await fetchRoutes(deliveries, courierRole);
      return nextLocation;
    } catch (error) {
      setLocationUpdateState({
        isUpdating: false,
        error: error?.message || 'Unable to update current location.',
        notice: ''
      });
      throw error;
    }
  };

  const handleUseDeviceLocation = async () => {
    if (!navigator?.geolocation) {
      throw new Error('Geolocation is not supported on this device.');
    }
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000
      });
    }).catch(() => {
      throw new Error('Unable to read device location. Please allow location permission.');
    });
    return updateCourierCurrentLocation(position.coords.latitude, position.coords.longitude);
  };

  const selectedRouteStops = useMemo(
    () => routeOptions?.[selectedRouteIndex]?.stopSequence || [],
    [routeOptions, selectedRouteIndex]
  );
  const pickupOrderByBooking = useMemo(() => {
    if (courierRole !== 'pickup') {
      return null;
    }
    const orderMap = new Map();
    let order = 0;
    selectedRouteStops.forEach((stop) => {
      if (stop?.stop_kind !== 'pickup') {
        return;
      }
      const bookingId = Number(stop?.booking_id);
      if (Number.isFinite(bookingId) && !orderMap.has(bookingId)) {
        orderMap.set(bookingId, order);
        order += 1;
      }
    });
    return orderMap;
  }, [courierRole, selectedRouteStops]);

  const roleKey = courierRole && ACTIVE_STATUSES_BY_ROLE[courierRole] ? courierRole : 'both';
  const activeStatuses = ACTIVE_STATUSES_BY_ROLE[roleKey];
  const activeCountStatuses = ACTIVE_COUNT_STATUSES_BY_ROLE[roleKey] || ACTIVE_COUNT_STATUSES_BY_ROLE.both;
  const completedStatuses = COMPLETED_STATUSES_BY_ROLE[roleKey];
  const assignedDeliveriesRaw = useMemo(() => (
    deliveries?.filter((delivery) => activeStatuses.includes(delivery?.status)) || []
  ), [deliveries, activeStatuses]);
  const assignedDeliveries = useMemo(() => {
    if (!pickupOrderByBooking) {
      return assignedDeliveriesRaw;
    }
    return [...assignedDeliveriesRaw].sort((a, b) => {
      const aOrder = pickupOrderByBooking.get(Number(a?.id));
      const bOrder = pickupOrderByBooking.get(Number(b?.id));
      const aHas = Number.isFinite(aOrder);
      const bHas = Number.isFinite(bOrder);
      if (aHas && bHas) return aOrder - bOrder;
      if (aHas) return -1;
      if (bHas) return 1;
      return 0;
    });
  }, [assignedDeliveriesRaw, pickupOrderByBooking]);
  const completedDeliveries = useMemo(() => (
    deliveries?.filter((delivery) => completedStatuses.includes(delivery?.status)) || []
  ), [completedStatuses, deliveries]);
  const historyDeliveries = useMemo(() => deliveries || [], [deliveries]);
  const deliveriesForSelectedTab = selectedTab === 'assigned'
    ? assignedDeliveries
    : selectedTab === 'completed'
      ? completedDeliveries
      : historyDeliveries;
  const availableStatusOptions = useMemo(() => {
    const statuses = [...new Set(
      deliveriesForSelectedTab
        .map((delivery) => delivery?.status)
        .filter((status) => typeof status === 'string' && status.length > 0)
    )];
    return statuses.sort((a, b) => {
      const aLabel = DELIVERY_STATUS_LABELS[a] || a;
      const bLabel = DELIVERY_STATUS_LABELS[b] || b;
      return aLabel.localeCompare(bLabel);
    });
  }, [deliveriesForSelectedTab]);
  const availablePriorityOptions = useMemo(() => {
    const priorities = [...new Set(
      deliveriesForSelectedTab
        .map((delivery) => delivery?.priority)
        .filter((priority) => typeof priority === 'string' && priority.length > 0)
    )];
    return priorities.sort((a, b) => a.localeCompare(b));
  }, [deliveriesForSelectedTab]);
  useEffect(() => {
    if (statusFilter !== 'all' && !availableStatusOptions.includes(statusFilter)) {
      setStatusFilter('all');
    }
  }, [availableStatusOptions, statusFilter]);
  useEffect(() => {
    if (priorityFilter !== 'all' && !availablePriorityOptions.includes(priorityFilter)) {
      setPriorityFilter('all');
    }
  }, [availablePriorityOptions, priorityFilter]);
  const filteredAssignedDeliveries = assignedDeliveries.filter((delivery) => {
    const statusMatches = statusFilter === 'all' || delivery?.status === statusFilter;
    const priorityMatches = priorityFilter === 'all' || delivery?.priority === priorityFilter;
    return statusMatches && priorityMatches;
  });
  const filteredCompletedDeliveries = completedDeliveries.filter((delivery) => {
    const statusMatches = statusFilter === 'all' || delivery?.status === statusFilter;
    const priorityMatches = priorityFilter === 'all' || delivery?.priority === priorityFilter;
    return statusMatches && priorityMatches;
  });
  const filteredHistoryDeliveries = historyDeliveries.filter((delivery) => {
    const statusMatches = statusFilter === 'all' || delivery?.status === statusFilter;
    const priorityMatches = priorityFilter === 'all' || delivery?.priority === priorityFilter;
    return statusMatches && priorityMatches;
  });
  const assignedCount = filteredAssignedDeliveries.length;
  const activeCount = assignedDeliveries.filter((delivery) => activeCountStatuses.includes(delivery?.status)).length;
  const completedCount = filteredCompletedDeliveries.length;
  const historyCount = filteredHistoryDeliveries.length;
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (priorityFilter !== 'all' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const activeDeliveryDisplay = useMemo(() => {
    if (assignedDeliveries.length === 0) {
      return null;
    }

    const priorityList = ACTIVE_STATUS_PRIORITY_BY_ROLE[roleKey] || ACTIVE_STATUS_PRIORITY_BY_ROLE.both;
    for (const status of priorityList) {
      const match = assignedDeliveries.find((delivery) => delivery?.status === status);
      if (match) {
        return match;
      }
    }

    const fallbackFromServer = activeDelivery && activeStatuses.includes(activeDelivery?.status)
      ? activeDelivery
      : null;
    return fallbackFromServer || assignedDeliveries[0] || null;
  }, [activeDelivery, activeStatuses, assignedDeliveries, roleKey]);
  const activeDeliveryChatMeta = useMemo(
    () => getDeliveryChatMeta(activeDeliveryDisplay),
    [activeDeliveryDisplay, getDeliveryChatMeta]
  );
  const activeChatUnreadCount = Number(chatUnreadByBooking?.[Number(activeDeliveryDisplay?.id)] || 0);
  const activeDeliveryIncidentAction = useMemo(
    () => getDashboardCourierIncidentAction(activeDeliveryDisplay?.status, courierRole),
    [activeDeliveryDisplay?.status, courierRole]
  );
  const incidentReasonOptions = useMemo(() => (
    COURIER_INCIDENT_REASONS_BY_TYPE?.[incidentFlow?.type] || []
  ), [incidentFlow?.type]);
  const incidentModalCopy = useMemo(() => (
    getCourierIncidentModalCopy(incidentFlow?.type)
  ), [incidentFlow?.type]);

  useEffect(() => {
    if (!chatBooking?.id) {
      return;
    }
    const bookingId = Number(chatBooking.id);
    const latestBookingState = (deliveries || []).find((delivery) => Number(delivery?.id) === bookingId);
    if (latestBookingState) {
      setChatBooking(latestBookingState);
    }
  }, [chatBooking?.id, deliveries]);

  useEffect(() => {
    if (!isChatOpen || !chatBooking?.id) {
      return;
    }
    const chatMeta = getDeliveryChatMeta(chatBooking);
    setChatLegKey(chatMeta?.legKey || '');
    if (!chatMeta?.allowed) {
      handleCloseChat();
    }
  }, [chatBooking, getDeliveryChatMeta, handleCloseChat, isChatOpen]);

  useEffect(() => {
    if (!Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      setChatUnreadByBooking((previous) => (isRecordEmpty(previous) ? previous : {}));
      setChatLatestByBooking((previous) => (isRecordEmpty(previous) ? previous : {}));
      return;
    }

    let isCancelled = false;
    const sourceDeliveries = (assignedDeliveries || []).filter((delivery) => Number.isFinite(Number(delivery?.id)));

    const pollUnread = async () => {
      if (sourceDeliveries.length <= 0) {
        if (!isCancelled) {
          setChatUnreadByBooking((previous) => (isRecordEmpty(previous) ? previous : {}));
          setChatLatestByBooking((previous) => (isRecordEmpty(previous) ? previous : {}));
        }
        return;
      }

      const results = await Promise.all(sourceDeliveries.map(async (delivery) => {
        const bookingId = Number(delivery.id);
        const chatMeta = getDeliveryChatMeta(delivery);
        if (!chatMeta?.allowed) {
          return {
            bookingId,
            unreadCount: 0,
            latestMessageId: 0
          };
        }

        try {
          const params = new URLSearchParams({
            bookingId: String(bookingId),
            userId: String(userIdNumber),
            role: 'courier',
            afterId: '0',
            limit: '200'
          });
          const response = await fetch(`http://localhost:8000/api/messages?${params.toString()}`);
          const payload = await response.json();
          if (!response.ok) {
            return {
              bookingId,
              unreadCount: 0,
              latestMessageId: 0
            };
          }
          const messages = Array.isArray(payload?.messages) ? payload.messages : [];
          const latestMessageId = messages.length > 0
            ? Number(messages[messages.length - 1]?.id) || 0
            : 0;
          const lastSeenMessageId = readSeenMessageId({
            bookingId,
            userId: userIdNumber,
            userRole: 'courier',
            legKey: chatMeta.legKey
          });
          const isCurrentOpenThread = isChatOpen && Number(chatBooking?.id) === bookingId;
          const unreadCount = isCurrentOpenThread
            ? 0
            : countUnreadIncomingMessages({
              messages,
              currentUserId: userIdNumber,
              lastSeenMessageId
            });
          return {
            bookingId,
            unreadCount,
            latestMessageId
          };
        } catch (error) {
          return {
            bookingId,
            unreadCount: 0,
            latestMessageId: 0
          };
        }
      }));

      if (isCancelled) {
        return;
      }

      setChatUnreadByBooking((previous) => {
        const next = {};
        results.forEach((result) => {
          next[result.bookingId] = result.unreadCount;
        });
        return areNumericRecordsEqual(previous, next) ? previous : next;
      });
      setChatLatestByBooking((previous) => {
        const next = {};
        results.forEach((result) => {
          next[result.bookingId] = result.latestMessageId;
        });
        return areNumericRecordsEqual(previous, next) ? previous : next;
      });
    };

    pollUnread();
    const pollingId = window.setInterval(pollUnread, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(pollingId);
    };
  }, [assignedDeliveries, chatBooking?.id, getDeliveryChatMeta, isChatOpen, userIdNumber]);

  const handleChatMessagesChange = useCallback((snapshot) => {
    const bookingId = Number(snapshot?.bookingId);
    const latestMessageId = Number(snapshot?.lastMessageId);
    if (!Number.isFinite(bookingId)) {
      return;
    }
    if (Number.isFinite(latestMessageId) && latestMessageId > 0) {
      setChatLatestByBooking((previous) => ({
        ...(previous || {}),
        [bookingId]: latestMessageId
      }));
    }
    if (isChatOpen && Number(chatBooking?.id) === bookingId) {
      markThreadAsRead(chatBooking, chatLegKey, latestMessageId);
      setChatUnreadByBooking((previous) => ({
        ...(previous || {}),
        [bookingId]: 0
      }));
    }
  }, [chatBooking, chatLegKey, isChatOpen, markThreadAsRead]);
  const chatBookingMeta = useMemo(
    () => getDeliveryChatMeta(chatBooking),
    [chatBooking, getDeliveryChatMeta]
  );
  const chatLegLabel = useMemo(
    () => getChatLegLabel(chatLegKey || chatBookingMeta?.legKey),
    [chatBookingMeta?.legKey, chatLegKey]
  );
  const assignedVehicleInfo = courierVehicle || routeVehicle;
  const vehicleInventory = useMemo(() => {
    const statusCounts = {};
    (deliveries || []).forEach((delivery) => {
      const status = String(delivery?.status || '');
      if (!status) {
        return;
      }
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const buckets = ON_VEHICLE_BUCKETS.map((bucket) => {
      const count = bucket.statuses.reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
      return { ...bucket, count };
    });
    const onVehicleCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const inVehicleStatuses = new Set(
      ON_VEHICLE_BUCKETS.flatMap((bucket) => bucket.statuses)
    );
    const onVehicleLoadKg = (deliveries || [])
      .filter((delivery) => inVehicleStatuses.has(String(delivery?.status || '')))
      .reduce((sum, delivery) => sum + parseWeightKg(delivery?.weight), 0);

    return {
      buckets,
      onVehicleCount,
      onVehicleLoadKg
    };
  }, [deliveries]);
  const vehicleCapacityKg = Number(assignedVehicleInfo?.capacityKg);
  const hasVehicleCapacity = Number.isFinite(vehicleCapacityKg) && vehicleCapacityKg > 0;
  const loadUsagePercent = hasVehicleCapacity
    ? Math.min(100, Math.round((vehicleInventory.onVehicleLoadKg / vehicleCapacityKg) * 100))
    : null;
  const remainingCapacityKg = hasVehicleCapacity
    ? Math.max(0, vehicleCapacityKg - vehicleInventory.onVehicleLoadKg)
    : null;

  const handleStartNavigation = (navigationData) => {
    const now = Date.now();
    const lastOpenTs = Number(window?.[NAV_OPEN_TS_KEY] || 0);
    if (now - lastOpenTs < 1200) {
      return;
    }
    window[NAV_OPEN_TS_KEY] = now;

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
    const toGeoCoordinate = (coord) => {
      const lng = Number(coord?.[0]);
      const lat = Number(coord?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      return [
        Number(lng.toFixed(6)),
        Number(lat.toFixed(6))
      ];
    };
    const normalizeRouteGeometry = (routeGeometry) => {
      if (!routeGeometry || typeof routeGeometry !== 'object') {
        return null;
      }
      const type = String(routeGeometry?.type || routeGeometry?.geometry?.type || '').trim();
      const rawCoordinates = routeGeometry?.coordinates ?? routeGeometry?.geometry?.coordinates;
      if (!['LineString', 'MultiLineString'].includes(type) || !Array.isArray(rawCoordinates)) {
        return null;
      }

      let coordinates = [];
      if (type === 'LineString') {
        coordinates = rawCoordinates
          .map((coord) => toGeoCoordinate(coord))
          .filter((coord) => Boolean(coord));
      } else {
        coordinates = rawCoordinates
          .map((line) => (
            Array.isArray(line)
              ? line
                .map((coord) => toGeoCoordinate(coord))
                .filter((coord) => Boolean(coord))
              : []
          ))
          .filter((line) => line.length > 0);
      }

      if (
        (type === 'LineString' && coordinates.length < 2)
        || (type === 'MultiLineString' && coordinates.reduce((sum, line) => sum + line.length, 0) < 2)
      ) {
        return null;
      }

      const legs = Array.isArray(routeGeometry?.legs)
        ? routeGeometry.legs
          .map((leg) => {
            const fromIndex = Number(leg?.from_index ?? leg?.fromIndex);
            const toIndex = Number(leg?.to_index ?? leg?.toIndex);
            if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) {
              return null;
            }
            return {
              from_index: Math.max(0, Math.floor(fromIndex)),
              to_index: Math.max(0, Math.floor(toIndex))
            };
          })
          .filter((leg) => Boolean(leg))
        : [];

      return {
        source: typeof routeGeometry?.source === 'string' ? routeGeometry.source : 'geoapify',
        mode: typeof routeGeometry?.mode === 'string' ? routeGeometry.mode : undefined,
        type,
        coordinates,
        legs
      };
    };

    const routePointsRaw = Array.isArray(navigationData?.routePoints) ? navigationData.routePoints : [];
    const routeLabelsRaw = Array.isArray(navigationData?.routePointLabels) ? navigationData.routePointLabels : [];
    const routeMetaRaw = Array.isArray(navigationData?.routePointMeta) ? navigationData.routePointMeta : [];
    const routePointsValue = routePointsRaw
      .map((point) => toPointObject(point))
      .filter((point) => Boolean(point));
    const routeLabelsValue = routeLabelsRaw
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .map((label) => (label.length > 140 ? `${label.slice(0, 137)}...` : label));
    const routeMetaValue = routeMetaRaw
      .map((meta) => {
        const point = toPointObject(meta);
        if (!point) {
          return null;
        }
        const toNumericIdList = (values = [], fallback = null) => Array.from(new Set(
          [
            ...(Array.isArray(values) ? values : []),
            fallback
          ]
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value))
        ));
        const bookingId = Number(meta?.bookingId);
        const addressId = Number(meta?.addressId);
        const bookingIds = toNumericIdList(meta?.bookingIds, bookingId);
        const addressIds = toNumericIdList(meta?.addressIds, addressId);
        return {
          lat: point.lat,
          lng: point.lng,
          label: typeof meta?.label === 'string' ? meta.label.trim() : '',
          stopKind: typeof meta?.stopKind === 'string' ? meta.stopKind.trim().toLowerCase() : '',
          bookingId: Number.isFinite(bookingId) ? bookingId : null,
          addressId: Number.isFinite(addressId) ? addressId : null,
          bookingIds,
          addressIds
        };
      })
      .filter((meta) => Boolean(meta));
    const speedValue = Number(navigationData?.speedKmh);
    const routeGeometryValue = normalizeRouteGeometry(navigationData?.routeGeometry);
    const startValue = toPointObject(navigationData?.start) || routePointsValue[0] || null;
    const destinationValue = toPointObject(navigationData?.destination)
      || routePointsValue[routePointsValue.length - 1]
      || null;

    const payload = {
      start: startValue,
      destination: destinationValue,
      routePoints: routePointsValue,
      routePointLabels: routeLabelsValue,
      routePointMeta: routeMetaValue,
      routeGeometry: routeGeometryValue,
      courierRole: courierRole || null,
      speedKmh: Number.isFinite(speedValue) && speedValue > 0 ? Math.round(speedValue) : null
    };

    try {
      window.sessionStorage.setItem(NAV_SESSION_KEY, JSON.stringify(payload));
    } catch (error) {
      // Ignore storage quota/privacy mode errors and continue with navigation page.
    }
    navigate('/courier-navigation');
  };

  const tabs = [
    { id: 'assigned', label: 'Assigned', icon: 'Package', count: assignedCount },
    { id: 'completed', label: 'Completed', icon: 'CheckCircle2', count: completedCount },
    { id: 'history', label: 'History', icon: 'History', count: historyCount }
  ];

  return (
    <>
      <Helmet>
        <title>Courier Dashboard - CourierFlow</title>
        <meta name="description" content="Manage your deliveries, track earnings, and optimize routes with CourierFlow courier dashboard" />
      </Helmet>
      <div className="min-h-screen bg-background">
        <RoleBasedNavigation
          userRole="courier"
          userName={userName}
          courierRole={courierRole}
        />
        <QuickActionPanel userRole="courier" />

        <main className="pt-[60px]">
          <div className="max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
            {isRouteView ? (
              <div className="space-y-6" id="route">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">Route</h1>
                    <p className="text-sm text-muted-foreground">
                      View the optimized route and start navigation.
                    </p>
                  </div>
                  <Link
                    to="/courier-dashboard"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"
                  >
                    <Icon name="ArrowLeft" size={16} />
                    Back to Dashboard
                  </Link>
                </div>
                <RouteOptimizationPanel
                  routes={routeOptions}
                  onSelectRoute={handleSelectRoute}
                  onRefresh={fetchRoutes}
                  isLoading={routesLoading}
                  startLocation={routeStart}
                  courierLocation={routeCourierLocation}
                  branchLocation={routeBranchLocation}
                  vehicle={routeVehicle}
                  onStartNavigation={handleStartNavigation}
                  deliveries={deliveries}
                  courierRole={courierRole}
                  selectedRouteIndex={selectedRouteIndex}
                  onSelectRouteIndex={setSelectedRouteIndex}
                  emptyStateMessage={routeNotice}
                  onUseDeviceLocation={handleUseDeviceLocation}
                  onUpdateLocationCoordinates={updateCourierCurrentLocation}
                  isUpdatingLocation={locationUpdateState.isUpdating}
                  locationUpdateError={locationUpdateState.error}
                  locationUpdateNotice={locationUpdateState.notice}
                />
              </div>
            ) : (
            <div className="space-y-6">
            <div className="mb-6 md:mb-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-2">
                    Courier Dashboard
                  </h1>
                  <p className="text-sm md:text-base text-muted-foreground">
                    Manage your deliveries and track your performance
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative" ref={vehicleMenuRef}>
                    <Button
                      variant={isVehicleMenuOpen ? 'default' : 'outline'}
                      iconName="Package"
                      iconPosition="left"
                      onClick={() => setIsVehicleMenuOpen((prev) => !prev)}
                      aria-haspopup="menu"
                      aria-expanded={isVehicleMenuOpen}
                    >
                      Vehicle Inventory
                    </Button>
                    {isVehicleMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-elevation-md z-20">
                        <div className="p-4 border-b border-border">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">On-Vehicle Inventory</p>
                              <p className="text-xs text-muted-foreground">Only parcels currently in transit on this vehicle.</p>
                            </div>
                            <Icon name="Package" size={18} className="text-muted-foreground" />
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                          <div className="rounded-lg border border-border p-3 bg-muted/20">
                            <p className="text-[11px] text-muted-foreground">Vehicle</p>
                            {assignedVehicleInfo ? (
                              <>
                                <p className="text-sm font-semibold text-foreground">
                                  {assignedVehicleInfo?.type || 'Assigned Vehicle'}
                                  {assignedVehicleInfo?.plate ? ` - ${assignedVehicleInfo.plate}` : ''}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {hasVehicleCapacity ? `Capacity ${vehicleCapacityKg.toFixed(0)} kg` : 'Capacity not set'}
                                  {loadUsagePercent !== null
                                    ? ` | Current load ~${vehicleInventory.onVehicleLoadKg.toFixed(1)} kg (${loadUsagePercent}%)`
                                    : ''}
                                </p>
                              </>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">No vehicle assigned.</p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-border p-3 bg-muted/20">
                              <p className="text-[11px] text-muted-foreground">Parcels On Vehicle</p>
                              <p className="text-base font-semibold text-foreground">{vehicleInventory.onVehicleCount}</p>
                            </div>
                            <div className="rounded-lg border border-border p-3 bg-muted/20">
                              <p className="text-[11px] text-muted-foreground">Remaining Capacity</p>
                              <p className="text-base font-semibold text-foreground">
                                {remainingCapacityKg !== null ? `${remainingCapacityKg.toFixed(1)} kg` : 'N/A'}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-lg border border-border p-3 bg-muted/20">
                            <p className="text-xs font-semibold text-foreground mb-2">On-Vehicle Stages</p>
                            <div className="space-y-1.5">
                              {vehicleInventory.buckets.map((bucket) => (
                                <div key={bucket.key} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{bucket.label}</span>
                                  <span className="font-semibold text-foreground">
                                    {bucket.count}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                        </div>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" iconName="Download" iconPosition="left">
                    Export Data
                  </Button>
                  <Button variant="default" iconName="Settings" iconPosition="left">
                    Settings
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card rounded-xl shadow-elevation-md p-4 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Icon name="Package" size={20} color="var(--color-primary)" />
                    </div>
                    <Icon name="TrendingUp" size={16} className="text-success" />
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-foreground mb-1">{activeCount}</p>
                  <p className="text-xs md:text-sm text-muted-foreground">Active Deliveries</p>
                </div>

                <div className="bg-card rounded-xl shadow-elevation-md p-4 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                      <Icon name="NepalRupee" size={20} color="var(--color-success)" />
                    </div>
                    <Icon name="TrendingUp" size={16} className="text-success" />
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                    {formatRs(earningsData?.daily?.total || 0)}
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground">Today's Earnings</p>
                </div>

                <div className="bg-card rounded-xl shadow-elevation-md p-4 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                      <Icon name="Star" size={20} color="var(--color-accent)" />
                    </div>
                    <Icon name="TrendingUp" size={16} className="text-success" />
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                    {performanceMetrics?.customerRating?.toFixed(1)}
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground">Customer Rating</p>
                </div>

                <div className="bg-card rounded-xl shadow-elevation-md p-4 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
                      <Icon name="TrendingUp" size={20} color="var(--color-warning)" />
                    </div>
                    <Icon name="TrendingUp" size={16} className="text-success" />
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                    {performanceMetrics?.overallScore}%
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground">Performance Score</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2">
                <ActiveDeliverySection
                  activeDelivery={activeDeliveryDisplay}
                  onCaptureProof={handleCaptureProof}
                  onCompleteDelivery={handleCompleteDelivery}
                  courierRole={courierRole}
                  onMessage={handleOpenChat}
                  onRequestIncident={handleOpenIncidentFlow}
                  incidentAction={activeDeliveryIncidentAction}
                  canChat={activeDeliveryChatMeta?.allowed}
                  chatDisabledReason={activeDeliveryChatMeta?.reason}
                  chatUnreadCount={activeChatUnreadCount}
                />
              </div>
              <div>
                <AvailabilityToggle
                  initialStatus={isAvailable}
                  onStatusChange={handleAvailabilityChange}
                  workedMinutes={todayStats?.workedMinutes}
                  breakMinutes={todayStats?.breakMinutes}
                  deliveriesToday={todayStats?.deliveriesToday}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2">
                <RouteOptimizationPanel
                  routes={routeOptions}
                  onSelectRoute={handleSelectRoute}
                  onRefresh={fetchRoutes}
                  isLoading={routesLoading}
                  startLocation={routeStart}
                  courierLocation={routeCourierLocation}
                  branchLocation={routeBranchLocation}
                  vehicle={routeVehicle}
                  onStartNavigation={handleStartNavigation}
                  deliveries={deliveries}
                  courierRole={courierRole}
                  selectedRouteIndex={selectedRouteIndex}
                  onSelectRouteIndex={setSelectedRouteIndex}
                  emptyStateMessage={routeNotice}
                  onUseDeviceLocation={handleUseDeviceLocation}
                  onUpdateLocationCoordinates={updateCourierCurrentLocation}
                  isUpdatingLocation={locationUpdateState.isUpdating}
                  locationUpdateError={locationUpdateState.error}
                  locationUpdateNotice={locationUpdateState.notice}
                />
              </div>
              <div>
                <EarningsTracker earningsData={earningsData} courierRole={courierRole} />
              </div>
            </div>

            <div className="mb-6">
              <div className="bg-card rounded-xl shadow-elevation-md border border-border overflow-hidden">
                <div className="p-4 md:p-6 border-b border-border">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg md:text-xl font-semibold text-foreground">
                      {courierRole === 'pickup'
                        ? 'My Pickups'
                        : courierRole === 'linehaul'
                          ? 'My Linehauls'
                          : 'My Deliveries'}
                    </h2>
                    <Button
                      variant={hasActiveFilters ? 'default' : 'outline'}
                      size="sm"
                      iconName="Filter"
                      onClick={() => setShowFilters((prev) => !prev)}
                    >
                      Filter
                      {hasActiveFilters ? ` (${activeFilterCount})` : ''}
                    </Button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {tabs?.map((tab) => (
                      <button
                        key={tab?.id}
                        onClick={() => setSelectedTab(tab?.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-smooth flex-shrink-0 ${
                          selectedTab === tab?.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <Icon name={tab?.icon} size={16} />
                        <span>{tab?.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          selectedTab === tab?.id ? 'bg-primary-foreground/20' : 'bg-background'
                        }`}>
                          {tab?.count}
                        </span>
                      </button>
                    ))}
                  </div>
                  {showFilters && (
                    <div className="mt-4 p-3 rounded-lg border border-border bg-muted/30">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                          >
                            <option value="all">All statuses</option>
                            {availableStatusOptions.map((status) => (
                              <option key={status} value={status}>
                                {DELIVERY_STATUS_LABELS[status] || status}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                          >
                            <option value="all">All priorities</option>
                            {availablePriorityOptions.map((priority) => (
                              <option key={priority} value={priority}>
                                {priority.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2 lg:col-span-2 flex items-end justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setStatusFilter('all');
                              setPriorityFilter('all');
                            }}
                            disabled={!hasActiveFilters}
                          >
                            Clear Filters
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 md:p-6">
                  {selectedTab === 'assigned' && (
                    <div className="grid grid-cols-1 gap-4">
                      {filteredAssignedDeliveries.map((delivery) => {
                        const chatMeta = getDeliveryChatMeta(delivery);
                        return (
                          <DeliveryCard
                            key={delivery?.id}
                            delivery={delivery}
                            onUpdateStatus={handleUpdateStatus}
                            onViewDetails={handleViewDetails}
                            courierRole={courierRole}
                            onMessage={handleOpenChat}
                            onRequestIncident={handleOpenIncidentFlow}
                            incidentAction={getDashboardCourierIncidentAction(delivery?.status, courierRole)}
                            canChat={chatMeta?.allowed}
                            chatDisabledReason={chatMeta?.reason}
                            chatUnreadCount={Number(chatUnreadByBooking?.[Number(delivery?.id)] || 0)}
                          />
                        );
                      })}
                      {filteredAssignedDeliveries.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          No active items right now.
                        </p>
                      )}
                    </div>
                  )}

                  {selectedTab === 'completed' && (
                    <div className="grid grid-cols-1 gap-4">
                      {filteredCompletedDeliveries.map((delivery) => {
                        const chatMeta = getDeliveryChatMeta(delivery);
                        return (
                          <DeliveryCard
                            key={delivery?.id}
                            delivery={delivery}
                            onUpdateStatus={handleUpdateStatus}
                            onViewDetails={handleViewDetails}
                            courierRole={courierRole}
                            onMessage={handleOpenChat}
                            onRequestIncident={handleOpenIncidentFlow}
                            incidentAction={getDashboardCourierIncidentAction(delivery?.status, courierRole)}
                            canChat={chatMeta?.allowed}
                            chatDisabledReason={chatMeta?.reason}
                            chatUnreadCount={Number(chatUnreadByBooking?.[Number(delivery?.id)] || 0)}
                          />
                        );
                      })}
                      {filteredCompletedDeliveries.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          No completed items yet.
                        </p>
                      )}
                    </div>
                  )}

                  {selectedTab === 'history' && (
                    <div className="grid grid-cols-1 gap-4">
                      {filteredHistoryDeliveries.map((delivery) => {
                        const chatMeta = getDeliveryChatMeta(delivery);
                        return (
                          <DeliveryCard
                            key={delivery?.id}
                            delivery={delivery}
                            onUpdateStatus={handleUpdateStatus}
                            onViewDetails={handleViewDetails}
                            courierRole={courierRole}
                            onMessage={handleOpenChat}
                            onRequestIncident={handleOpenIncidentFlow}
                            incidentAction={getDashboardCourierIncidentAction(delivery?.status, courierRole)}
                            canChat={chatMeta?.allowed}
                            chatDisabledReason={chatMeta?.reason}
                            chatUnreadCount={Number(chatUnreadByBooking?.[Number(delivery?.id)] || 0)}
                          />
                        );
                      })}
                      {filteredHistoryDeliveries.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          No history yet.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
              <PerformanceMetrics metrics={performanceMetrics} />
            </div>
            </div>
            )}
          </div>
        </main>
        <ChatModal
          isOpen={isChatOpen}
          onClose={handleCloseChat}
          bookingId={chatBooking?.id}
          title={`Booking ${chatBooking?.trackingId || ''}`}
          currentUserId={userId}
          currentUserRole="courier"
          canSend={chatBookingMeta?.allowed}
          disabledReason={chatBookingMeta?.reason}
          legLabel={chatLegLabel}
          onMessagesChange={handleChatMessagesChange}
        />
        <DangerActionModal
          isOpen={incidentFlow?.isOpen}
          onClose={handleCloseIncidentFlow}
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
          onSubmit={handleSubmitIncidentFlow}
        />
      </div>
    </>
  );
};

export default CourierDashboard;


